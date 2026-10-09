// ====== 承語（cheng-lingo）後端：Google Apps Script，綁在一份獨立的 Google Sheet ======
// 指令碼屬性（專案設定 → 指令碼屬性）：
//   PASSWORD     前端登入密碼
//   CARDS_URL    內建內容 data/cards.json 的網址，可先不設（預設 GitHub Pages 上的檔案）
// 分頁（第一次執行會自動建立）：
//   Cards     id | lang | type | front | reading | back | note | createdAt（只放自己新增的卡；內建內容在 repo 的 data/cards.json）
//   Progress  date | lang | cardId | done | mode | updatedAt（一列 = 當天清單裡的一張卡，一個語言一天有好幾列）
//   Mastered  cardId | lang | updatedAt（勾了「完全記得」的卡：不再複習，階段順序也跳過）
//   TestResults  id | date | lang | level | skills | correct | total | comment | note | asked | createdAt
//                （程度小考歷次結果：skills 是 JSON，各題型的等級；asked 是這次考過的題目 id，用逗號分隔，重考時優先抽沒考過的）

var BACKEND_VERSION = "2026-10-09.4";
var CARD_HEADERS = ["id", "lang", "type", "front", "reading", "back", "note", "createdAt"];
var PROGRESS_HEADERS = ["date", "lang", "cardId", "done", "mode", "updatedAt"];
var MASTERED_HEADERS = ["cardId", "lang", "updatedAt"];
var TEST_HEADERS = ["id", "date", "lang", "level", "skills", "correct", "total", "comment", "note", "asked", "createdAt"];
var LANGS = ["en", "ja"];
var TYPES = ["word", "sentence", "passage"];
var repoError_ = ""; // 這次請求讀 cards.json 失敗的原因，會用 warn 帶回前端
var DAILY = { word: 5, sentence: 3, passage: 1 }; // 每個語言每天各類型的新卡數；階段可以用 perDay 覆寫（cards.json）
var REVIEW_PER_DAY = 2; // 每天另外複習幾張（已完成過、最久沒練的）
var FALLBACK_COUNT = 5; // 階段都練完之後，每天隨機抽幾張
var RECENT_DAYS = 14; // 這幾天內抽過的卡盡量不重複
var CARDS_URL = "https://javle0317.github.io/cheng-lingo/data/cards.json";
var CARDS_CACHE_SEC = 600;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    if (!body.password || body.password !== props.getProperty("PASSWORD")) throw new Error("unauthorized");
    var data = route_(body);
    return respond_({ ok: true, v: BACKEND_VERSION, data: data, warn: repoError_ });
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
    case "getTestResults": return readTestResults_();
    default: throw new Error("unknown action");
  }
}

function write_(b) {
  switch (b.action) {
    case "addCard": return addCard_(b);
    case "deleteCard": return deleteCard_(textArg_(b.id, "id", 64));
    case "drawPlan": return drawPlan_(textArg_(b.date, "date", 10), langArg_(b.lang), b.more === "1");
    case "addTestResult": return addTestResult_(b);
    case "updateTestNote": return updateTestNote_(textArg_(b.id, "id", 64), optTextArg_(b.note, 500));
    case "setMastered": return setMastered_(textArg_(b.date, "date", 10), textArg_(b.id, "id", 64), b.value === "1");
    case "completeCard": return completeCard_(textArg_(b.date, "date", 10), langArg_(b.lang), textArg_(b.id, "id", 64), String(b.mode || "").slice(0, 10));
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
// 在編輯器手動執行一次來授權「連線到外部服務」（結尾是 _ 的函式不會出現在執行選單）
function authorize() {
  var url = PropertiesService.getScriptProperties().getProperty("CARDS_URL") || CARDS_URL;
  Logger.log("HTTP " + UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getResponseCode());
}

// 讀不到時回傳空陣列（只剩自己新增的卡），錯誤寫進執行記錄
// 快取（CacheService）每個值上限 100 KB，cards.json 早就超過了：去掉後端用不到的理解題、壓成 gzip 再分段存；
// 快取失敗只是慢一點（下次重抓），不能讓整份內容讀不出來
function repoStages_() {
  var cache = CacheService.getScriptCache();
  try {
    var cached = cacheGetBig_(cache, "repoCards");
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.error("讀快取失敗，改抓檔案：" + err.message);
  }
  var stages;
  try {
    var url = PropertiesService.getScriptProperties().getProperty("CARDS_URL") || CARDS_URL;
    // 加時間參數跳過 GitHub Pages 的 CDN 快取（它最久會讓舊檔多活 10 分鐘），我們自己的快取（CARDS_CACHE_SEC）才是唯一的延遲
    var res = UrlFetchApp.fetch(url + (url.indexOf("?") < 0 ? "?" : "&") + "t=" + new Date().getTime(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error("HTTP " + res.getResponseCode());
    stages = JSON.parse(res.getContentText()).stages || [];
  } catch (err) {
    repoError_ = "讀取 cards.json 失敗：" + err.message;
    console.error(repoError_);
    return [];
  }
  stages.forEach(function (s) { s.cards.forEach(function (c) { delete c.questions; }); }); // 理解題只有前端用
  try {
    cachePutBig_(cache, "repoCards", JSON.stringify(stages));
  } catch (err) {
    console.error("寫快取失敗（不影響使用）：" + err.message);
  }
  return stages;
}

var CACHE_CHUNK = 90000; // 每段字元數（base64 都是單位元組字元），低於快取的 100 KB 上限
function cachePutBig_(cache, key, text) {
  var b64 = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(text, "application/json", "cards.json")).getBytes());
  var n = Math.ceil(b64.length / CACHE_CHUNK);
  var obj = {};
  obj[key] = String(n);
  for (var i = 0; i < n; i++) obj[key + "." + i] = b64.substr(i * CACHE_CHUNK, CACHE_CHUNK);
  cache.putAll(obj, CARDS_CACHE_SEC);
}

function cacheGetBig_(cache, key) {
  var n = parseInt(cache.get(key) || "0", 10);
  if (!n) return null;
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + "." + i);
  var got = cache.getAll(keys);
  var b64 = "";
  for (var j = 0; j < n; j++) {
    if (!got[keys[j]]) return null; // 少一段（過期了）就當沒有快取
    b64 += got[keys[j]];
  }
  var bytes = Utilities.base64Decode(b64);
  return Utilities.ungzip(Utilities.newBlob(bytes, "application/x-gzip", "cards.json.gz")).getDataAsString();
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
  return allCards_(); // 前端直接拿回傳值當整份卡片，要包含內建教材（只回自訂卡會讓內建卡暫時消失）
}

function deleteCard_(id) {
  var sh = sheet_("Cards", CARD_HEADERS);
  var data = rows_(sh, CARD_HEADERS.length);
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === id) { sh.deleteRow(i + 2); break; }
  }
  return allCards_();
}

// ====== 程度小考歷次結果 ======
function readTestResults_() {
  return rows_(sheet_("TestResults", TEST_HEADERS), TEST_HEADERS.length).map(function (r) {
    var skills = {};
    try { skills = JSON.parse(r[4] || "{}"); } catch (e) { /* 壞掉的列當成沒有技能資料 */ }
    return {
      id: String(r[0]), date: dateStr_(r[1]), lang: r[2], level: unsafeText_(r[3]), skills: skills,
      correct: Number(r[5]), total: Number(r[6]), comment: unsafeText_(r[7]), note: unsafeText_(r[8]),
      asked: String(r[9] || "").split(",").filter(Boolean),
    };
  }).sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
}

function intArg_(v, name, max) {
  var n = Number(v);
  if (!isFinite(n) || n < 0 || n > max || Math.floor(n) !== n) throw new Error(name + " 必須是 0 到 " + max + " 的整數");
  return n;
}

function addTestResult_(b) {
  var date = textArg_(b.date, "date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("日期格式錯誤");
  var lang = langArg_(b.lang);
  var level = textArg_(b.level, "等級", 20);
  var skills = optTextArg_(b.skills, 400);
  try { JSON.parse(skills || "{}"); } catch (e) { throw new Error("skills 不是有效的 JSON"); }
  var total = intArg_(b.total, "題數", 500);
  var correct = intArg_(b.correct, "答對題數", total);
  var asked = optTextArg_(b.asked, 2000);
  if (!/^[A-Za-z0-9_,-]*$/.test(asked)) throw new Error("asked 格式錯誤");
  var sh = sheet_("TestResults", TEST_HEADERS);
  var row = [Utilities.getUuid(), date, lang, safeText_(level), skills, correct, total,
    safeText_(optTextArg_(b.comment, 500)), safeText_(optTextArg_(b.note, 500)), asked, new Date()];
  var range = sh.getRange(sh.getLastRow() + 1, 1, 1, row.length);
  range.setNumberFormat("@"); // 全部當純文字，日期與數字不會被 Sheet 自動轉型
  range.setValues([row]);
  return readTestResults_();
}

function updateTestNote_(id, note) {
  var sh = sheet_("TestResults", TEST_HEADERS);
  var data = rows_(sh, TEST_HEADERS.length);
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]) === id) {
      var cell = sh.getRange(i + 2, 9);
      cell.setNumberFormat("@");
      cell.setValue(safeText_(note));
      return readTestResults_();
    }
  }
  throw new Error("找不到這筆考試紀錄");
}

// ====== 「完全記得」標記 ======
function masteredSet_() {
  var set = {};
  rows_(sheet_("Mastered", MASTERED_HEADERS), MASTERED_HEADERS.length).forEach(function (r) { set[String(r[0])] = true; });
  return set;
}

function setMastered_(date, id, on) {
  var sh = sheet_("Mastered", MASTERED_HEADERS);
  var data = rows_(sh, MASTERED_HEADERS.length);
  var at = -1;
  for (var i = 0; i < data.length; i++) { if (String(data[i][0]) === id) { at = i + 2; break; } }
  if (on && at < 0) {
    var card = allCards_().filter(function (c) { return c.id === id; })[0];
    if (!card) throw new Error("找不到這張卡");
    var range = sh.getRange(sh.getLastRow() + 1, 1, 1, 3);
    range.setNumberFormat("@");
    range.setValues([[id, card.lang, new Date()]]);
  } else if (!on && at > 0) {
    sh.deleteRow(at);
  }
  return todayState_(date);
}

// ====== 每日進度 ======
// 每個語言每天排一份「今日清單」：每種類型（單字／例句／短文）各取一批新卡，再加幾張複習。
// Progress 一列 = 清單裡的一張卡；done 是這張卡有沒有練完。
function progressRows_() {
  return rows_(sheet_("Progress", PROGRESS_HEADERS), PROGRESS_HEADERS.length).map(function (r, i) {
    return { row: i + 2, date: dateStr_(r[0]), lang: r[1], cardId: String(r[2]), done: r[3] === true || String(r[3]).toUpperCase() === "TRUE" }; // 該列被設成純文字格式，布林會被存成文字 "true"
  });
}

function dateStr_(v) {
  return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd") : String(v);
}

// 回傳 { en: { cards: [{cardId, done, review, mastered}, ...] }, ja: {...} }；今天沒排過的語言不會出現
function todayState_(date) {
  var out = {};
  var rows = progressRows_();
  var mastered = masteredSet_();
  var doneBefore = {}; // 這張卡今天之前已經完成過 → 今天是複習
  rows.forEach(function (p) { if (p.done && p.date < date) doneBefore[p.cardId] = true; });
  rows.forEach(function (p) {
    if (p.date !== date) return;
    if (!out[p.lang]) out[p.lang] = { cards: [] };
    out[p.lang].cards.push({ cardId: p.cardId, done: p.done,
      review: doneBefore[p.cardId] === true, mastered: mastered[p.cardId] === true });
  });
  return out;
}

// 排今天的清單。今天已經排過就原樣回傳；more=true 是「再來一輪」：今天的卡都練完了才能再排一批新卡（不再加複習）
function drawPlan_(date, lang, more) {
  var progress = progressRows_();
  var today = progress.filter(function (p) { return p.date === date && p.lang === lang; });
  if (today.length && !more) return todayState_(date);
  if (more && today.some(function (p) { return !p.done; })) throw new Error("今天還有沒練完的卡");
  if (!allCards_().some(function (c) { return c.lang === lang; })) throw new Error("這個語言還沒有內容");

  var mastered = masteredSet_();
  var picks = [];
  if (!today.length) pickReviews_(lang, date, progress, mastered).forEach(function (c) { picks.push(c); });
  var fresh = pickNew_(lang, date, progress, mastered);
  if (!fresh.length) fresh = pickRandomMany_(lang, date, progress, FALLBACK_COUNT, picks, mastered); // 階段都練完了：改隨機抽（這時自己新增的卡也會加入）
  fresh.forEach(function (c) { picks.push(c); });
  if (!picks.length) throw new Error("沒有可排的卡");

  var sh = sheet_("Progress", PROGRESS_HEADERS);
  var range = sh.getRange(sh.getLastRow() + 1, 1, picks.length, PROGRESS_HEADERS.length);
  range.setNumberFormat("@");
  range.setValues(picks.map(function (c) { return [date, lang, c.id, false, "", new Date()]; }));
  return todayState_(date);
}

// 階段 id 的每張卡都練完（或勾了完全記得）了嗎；找不到這個階段就當作已練完，不要卡住
function stageFinished_(stages, id, finished) {
  var st = stages.filter(function (s) { return s.id === id; })[0];
  return !st || st.cards.every(function (c) { return finished[c.id]; });
}

function stageType_(s) { return s.cards.length ? s.cards[0].type : ""; }

function shuffle_(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// 新卡：每種類型（單字／例句／短文）各自一條「進度線」，各取第一個還沒練完的階段，一次取 perDay（沒設就用 DAILY）張。
// seq 階段照順序取、random 階段隨機取。練完過、今天已排入、勾了「完全記得」的卡都不再算新卡。
// 同類型的階段照 cards.json 的順序，前一個練完才輪到下一個。
function pickNew_(lang, date, progress, mastered) {
  var taken = {};
  var finished = {}; // 練完或勾了完全記得的卡（不含今天剛排的）；階段的 after 用它判斷前一階段是否練完
  progress.forEach(function (p) {
    if (p.lang !== lang) return;
    if (p.done) finished[p.cardId] = true;
    if (p.done || p.date === date) taken[p.cardId] = true;
  });
  Object.keys(mastered).forEach(function (id) { taken[id] = true; finished[id] = true; });
  var stages = repoStages_();
  var seen = {};
  var out = [];
  stages.forEach(function (s) {
    if (s.lang !== lang) return;
    if (s.after && !stageFinished_(stages, s.after, finished)) return; // 還沒解鎖
    var type = stageType_(s);
    if (seen[type]) return;
    var left = s.cards.filter(function (c) { return !taken[c.id]; });
    if (!left.length) return;
    seen[type] = true;
    var n = s.perDay || DAILY[type] || 1;
    (s.order === "seq" ? left : shuffle_(left)).slice(0, n).forEach(function (c) {
      out.push({ id: c.id, lang: lang });
    });
  });
  return out;
}

// 複習：已完成過、最久沒練、沒勾「完全記得」、今天沒排過的內建卡，取 REVIEW_PER_DAY 張
function pickReviews_(lang, date, progress, mastered) {
  var last = {};
  var planned = {};
  progress.forEach(function (p) {
    if (p.lang !== lang) return;
    if (p.date === date) planned[p.cardId] = true;
    if (p.done && p.date < date && (!last[p.cardId] || p.date > last[p.cardId])) last[p.cardId] = p.date;
  });
  var cands = [];
  repoStages_().forEach(function (s) {
    if (s.lang !== lang) return;
    s.cards.forEach(function (c) {
      if (last[c.id] && !mastered[c.id] && !planned[c.id]) cands.push({ id: c.id, last: last[c.id] });
    });
  });
  cands.sort(function (a, b) { return a.last < b.last ? -1 : a.last > b.last ? 1 : 0; });
  return cands.slice(0, REVIEW_PER_DAY);
}

// 階段都練完之後：14 天內抽過的盡量不重複，隨機抽 n 張
function pickRandomMany_(lang, date, progress, n, exclude, mastered) {
  var cutoff = new Date(date + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  var cutoffStr = Utilities.formatDate(cutoff, Session.getScriptTimeZone(), "yyyy-MM-dd");
  var recent = {};
  var planned = {};
  progress.forEach(function (p) {
    if (p.lang !== lang) return;
    if (p.date >= cutoffStr) recent[p.cardId] = true;
    if (p.date === date) planned[p.cardId] = true;
  });
  exclude.forEach(function (c) { planned[c.id] = true; }); // 剛排進來的複習卡不要又被抽到
  var cards = allCards_().filter(function (c) { return c.lang === lang && !planned[c.id] && !mastered[c.id]; }); // 勾了完全記得的不再出現
  var pool = cards.filter(function (c) { return !recent[c.id]; });
  if (pool.length < n) pool = cards;
  return shuffle_(pool).slice(0, n).map(function (c) { return { id: c.id, lang: lang }; });
}

function completeCard_(date, lang, id, mode) {
  var p = progressRows_().filter(function (x) { return x.date === date && x.lang === lang && x.cardId === id; })[0];
  if (!p) throw new Error("今天的清單裡沒有這張卡");
  sheet_("Progress", PROGRESS_HEADERS).getRange(p.row, 4, 1, 3).setValues([[true, mode, new Date()]]);
  return todayState_(date);
}
