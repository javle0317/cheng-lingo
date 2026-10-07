// ====== 承語（cheng-lingo）後端：Google Apps Script，綁在一份獨立的 Google Sheet ======
// 指令碼屬性（專案設定 → 指令碼屬性）：
//   PASSWORD     前端登入密碼
//   LINGO_TOKEN  給 cheng-daily 後端呼叫用的 token（cheng-daily 的 LANG_TOKEN 要填同一個），可先不設
//   CARDS_URL    內建內容 data/cards.json 的網址，可先不設（預設 GitHub Pages 上的檔案）
// 分頁（第一次執行會自動建立）：
//   Cards     id | lang | type | front | reading | back | note | createdAt（只放自己新增的卡；內建內容在 repo 的 data/cards.json）
//   Progress  date | lang | cardId | done | mode | updatedAt

var BACKEND_VERSION = "2026-10-07.3";
var CARD_HEADERS = ["id", "lang", "type", "front", "reading", "back", "note", "createdAt"];
var PROGRESS_HEADERS = ["date", "lang", "cardId", "done", "mode", "updatedAt"];
var LANGS = ["en", "ja"];
var TYPES = ["word", "sentence", "passage"];
var RECENT_DAYS = 14; // 這幾天內抽過的卡盡量不重複
var CARDS_URL = "https://javle0317.github.io/cheng-lingo/data/cards.json";
var CARDS_CACHE_SEC = 600;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty("LINGO_TOKEN");
    var okPassword = body.password && body.password === props.getProperty("PASSWORD");
    var okToken = token && body.token && body.token === token;
    if (!okPassword && !okToken) throw new Error("unauthorized");
    return respond_({ ok: true, v: BACKEND_VERSION, data: route_(body) });
  } catch (err) {
    return respond_({ ok: false, v: BACKEND_VERSION, error: String(err.message || err) });
  }
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route_(b) {
  if (b.action.indexOf("get") === 0) return read_(b);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return write_(b); } finally { lock.releaseLock(); }
}

function read_(b) {
  switch (b.action) {
    case "getCards": return allCards_();
    case "getToday": return todayState_(textArg_(b.date, "date", 10));
    default: throw new Error("unknown action");
  }
}

function write_(b) {
  switch (b.action) {
    case "addCard": return addCard_(b);
    case "deleteCard": return deleteCard_(textArg_(b.id, "id", 64));
    case "drawCard": return drawAnyOrCard_(textArg_(b.date, "date", 10), b.lang, b.reroll === "1");
    case "completeCard": return completeCard_(textArg_(b.date, "date", 10), langArg_(b.lang), String(b.mode || "").slice(0, 10));
    default: throw new Error("unknown action");
  }
}

// ====== 驗證與工具 ======
function textArg_(v, name, max) {
  var s = String(v == null ? "" : v).trim();
  if (!s) throw new Error(name + " 必填");
  if (s.length > max) throw new Error(name + " 太長（上限 " + max + " 字）");
  return s;
}

function optTextArg_(v, max) {
  var s = String(v == null ? "" : v).trim();
  if (s.length > max) throw new Error("文字太長（上限 " + max + " 字）");
  return s;
}

function langArg_(v) {
  if (LANGS.indexOf(v) < 0) throw new Error("lang 只能是 en 或 ja");
  return v;
}

// 使用者輸入的文字以 = + - @ 開頭，Sheet 會當成公式執行：一律當純文字存
function safeText_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }
function unsafeText_(s) { return typeof s === "string" && s.charAt(0) === "'" ? s.slice(1) : s; }

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_(sh, width) {
  var n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, width).getValues() : [];
}

// ====== 內建內容（repo 的 data/cards.json，依階段排序）======
// 讀不到時回傳空陣列（只剩自己新增的卡），錯誤寫進執行記錄
function repoStages_() {
  var cache = CacheService.getScriptCache();
  var raw = cache.get("repoCards");
  try {
    if (!raw) {
      var url = PropertiesService.getScriptProperties().getProperty("CARDS_URL") || CARDS_URL;
      var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      if (res.getResponseCode() !== 200) throw new Error("HTTP " + res.getResponseCode());
      raw = res.getContentText();
      JSON.parse(raw);
      cache.put("repoCards", raw, CARDS_CACHE_SEC);
    }
    return JSON.parse(raw).stages || [];
  } catch (err) {
    console.error("讀取 cards.json 失敗：" + err.message);
    return [];
  }
}

function repoCards_() {
  var out = [];
  repoStages_().forEach(function (s) {
    s.cards.forEach(function (c) {
      out.push({
        id: c.id, lang: s.lang, type: c.type, front: c.front, reading: c.reading || "",
        back: c.back, note: c.note || "", stage: s.id, stageTitle: s.title, repo: true,
      });
    });
  });
  return out;
}

function allCards_() { return repoCards_().concat(readCards_()); }

// ====== 卡片 ======
function readCards_() {
  return rows_(sheet_("Cards", CARD_HEADERS), CARD_HEADERS.length).map(function (r) {
    return {
      id: String(r[0]), lang: r[1], type: r[2], front: unsafeText_(r[3]),
      reading: unsafeText_(r[4]), back: unsafeText_(r[5]), note: unsafeText_(r[6]),
    };
  });
}

function addCard_(b) {
  var lang = langArg_(b.lang);
  if (TYPES.indexOf(b.type) < 0) throw new Error("type 只能是 word / sentence / passage");
  var front = textArg_(b.front, "正面", 2000);
  var back = textArg_(b.back, "意思", 2000);
  var sh = sheet_("Cards", CARD_HEADERS);
  var row = [Utilities.getUuid(), lang, b.type, safeText_(front), safeText_(optTextArg_(b.reading, 200)),
    safeText_(back), safeText_(optTextArg_(b.note, 500)), new Date()];
  var r = sh.getLastRow() + 1;
  var range = sh.getRange(r, 1, 1, row.length);
  range.setNumberFormat("@"); // 全部當純文字，避免 Sheet 自動轉成日期或數字
  range.setValues([row]);
  return readCards_();
}

function deleteCard_(id) {
  var sh = sheet_("Cards", CARD_HEADERS);
  var data = rows_(sh, CARD_HEADERS.length);
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === id) { sh.deleteRow(i + 2); break; }
  }
  return readCards_();
}

// ====== 每日進度 ======
function progressRows_() {
  return rows_(sheet_("Progress", PROGRESS_HEADERS), PROGRESS_HEADERS.length).map(function (r, i) {
    return { row: i + 2, date: dateStr_(r[0]), lang: r[1], cardId: String(r[2]), done: r[3] === true || r[3] === "TRUE" };
  });
}

function dateStr_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(v);
}

// 回傳 { en: {cardId, lang, front, done}, ja: {...} }；沒抽過的語言不會出現
// front 是卡片正面（cheng-daily 習慣列要顯示標題用），卡片被刪掉就是空字串
function todayState_(date) {
  var out = {};
  var fronts = null;
  progressRows_().forEach(function (p) {
    if (p.date !== date) return;
    if (!fronts) {
      fronts = {};
      allCards_().forEach(function (c) { fronts[c.id] = c.front; });
    }
    out[p.lang] = { cardId: p.cardId, lang: p.lang, front: fronts[p.cardId] || "", done: p.done };
  });
  return out;
}

// lang 省略（cheng-daily 的單一每日練習）：今天任何語言已有進度就直接回傳，
// 否則在有卡片的語言裡隨機挑一個再抽。有帶 lang 就維持原本逐語言抽卡。
function drawAnyOrCard_(date, lang, reroll) {
  if (lang) return drawCard_(date, langArg_(lang), reroll);
  if (Object.keys(todayState_(date)).length) return todayState_(date);
  var cards = allCards_();
  var withCards = LANGS.filter(function (l) {
    return cards.some(function (c) { return c.lang === l; });
  });
  if (!withCards.length) throw new Error("還沒有任何卡片內容");
  return drawCard_(date, withCards[Math.floor(Math.random() * withCards.length)], false);
}

function drawCard_(date, lang, reroll) {
  var progress = progressRows_();
  var existing = progress.filter(function (p) { return p.date === date && p.lang === lang; })[0];
  if (existing && !reroll) return todayState_(date);
  if (existing && existing.done) throw new Error("今天已完成，不能再換卡");

  var cards = allCards_().filter(function (c) { return c.lang === lang; });
  if (!cards.length) throw new Error("這個語言還沒有內容");

  var pick = pickStaged_(lang, existing, progress) || pickRandom_(cards, date, existing, progress, lang);

  var sh = sheet_("Progress", PROGRESS_HEADERS);
  if (existing) {
    sh.getRange(existing.row, 3, 1, 4).setValues([[pick.id, false, "", new Date()]]);
  } else {
    var r = sh.getLastRow() + 1;
    var range = sh.getRange(r, 1, 1, 6);
    range.setNumberFormat("@");
    range.setValues([[date, lang, pick.id, false, "", new Date()]]);
  }
  return todayState_(date);
}

// 有階段內容的語言：從第一個還沒練完的階段挑；seq 階段照順序，random 階段隨機。
// 階段都練完、或這個語言沒有階段內容 → 回傳 null，改用 pickRandom_
function pickStaged_(lang, existing, progress) {
  var done = {};
  progress.forEach(function (p) { if (p.lang === lang && p.done) done[p.cardId] = true; });
  var stages = repoStages_().filter(function (s) { return s.lang === lang; });
  for (var i = 0; i < stages.length; i++) {
    var left = stages[i].cards.filter(function (c) { return !done[c.id]; });
    if (!left.length) continue;
    var others = left.filter(function (c) { return !existing || c.id !== existing.cardId; });
    if (!others.length) others = left; // 只剩目前這張就沒得換
    return stages[i].order === "seq" ? others[0] : others[Math.floor(Math.random() * others.length)];
  }
  return null;
}

function pickRandom_(cards, date, existing, progress, lang) {
  var cutoff = new Date(date + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  var cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var recent = {};
  progress.forEach(function (p) { if (p.lang === lang && p.date >= cutoffStr) recent[p.cardId] = true; });
  if (existing) recent[existing.cardId] = true; // 換一張不要又抽到同一張
  var pool = cards.filter(function (c) { return !recent[c.id]; });
  if (!pool.length) pool = cards.filter(function (c) { return !existing || c.id !== existing.cardId; });
  if (!pool.length) pool = cards; // 只有一張卡就沒得換
  return pool[Math.floor(Math.random() * pool.length)];
}

function completeCard_(date, lang, mode) {
  var p = progressRows_().filter(function (x) { return x.date === date && x.lang === lang; })[0];
  if (!p) throw new Error("今天還沒抽卡");
  sheet_("Progress", PROGRESS_HEADERS).getRange(p.row, 4, 1, 3).setValues([[true, mode, new Date()]]);
  return todayState_(date);
}
