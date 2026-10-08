// 後端（Code.gs）純邏輯檢查：用假的 Sheet 測 TestResults 的驗證、寫入與備註更新。node scripts/backend-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); return; }
  failed++;
  console.log("  ✗ " + name + (detail !== undefined ? "\n    " + JSON.stringify(detail) : ""));
}
const throws = f => { try { f(); return false; } catch (e) { return true; } };
const rows = [["id", "date", "lang", "level", "skills", "correct", "total", "comment", "note", "asked", "createdAt"]];
const sheet = {
  getLastRow: () => rows.length,
  getRange: (r, c, nr, nc) => ({
    setNumberFormat() {},
    setValues: v => { rows[r - 1] = v[0].slice(); },
    setValue: v => { rows[r - 1][c - 1] = v; },
    getValues: () => rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)),
  }),
};
const be = vm.createContext({
  console, Math, Array, String, Number, Object, JSON, Date, isFinite,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
  Utilities: { getUuid: () => "id" + rows.length, formatDate: (d) => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => "Asia/Taipei" },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  LockService: {}, ContentService: {}, CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) }, UrlFetchApp: {},
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8"), be, { filename: "Code.gs" });
const call = (code) => vm.runInContext(code, be);
be.__b = { date: "2026-10-08", lang: "en", level: "B1", skills: JSON.stringify({ vocab: "B1", grammar: "A2" }), correct: "24", total: "40", comment: "整體 B1。", asked: "en01,en02" };

console.log("TestResults");
let list = call("addTestResult_(__b)");
check("寫入一列：欄位與型別正確，讀回來是物件", list.length === 1 && list[0].lang === "en" && list[0].level === "B1" && list[0].correct === 24 && list[0].total === 40 && list[0].skills.grammar === "A2" && list[0].asked.join() === "en01,en02" && list[0].date === "2026-10-08" && list[0].note === "", list[0]);
check("日期格式、語言、題數、答對題數超過題數、asked 格式、skills 不是 JSON 都丟錯，而且不寫入", (() => {
  const n = rows.length;
  const bad = (patch) => { be.__p = Object.assign({}, be.__b, patch); return throws(() => call("addTestResult_(__p)")); };
  return bad({ date: "10/08" }) && bad({ lang: "fr" }) && bad({ total: "-1" }) && bad({ correct: "41" }) && bad({ correct: "1.5" }) && bad({ asked: "a b;" }) && bad({ skills: "{oops" }) && bad({ level: " " }) && rows.length === n;
})());
check("以 = + - @ 開頭的評語／備註會被當純文字（safeText_），讀出來還原", (() => {
  be.__p = Object.assign({}, be.__b, { comment: "=SUM(1)", level: "-x" });
  call("addTestResult_(__p)");
  const stored = rows[rows.length - 1];
  const back = call("readTestResults_()").pop();
  return stored[7] === "'=SUM(1)" && stored[3] === "'-x" && back.comment === "=SUM(1)" && back.level === "-x";
})());
check("updateTestNote_：更新備註、找不到 id 丟錯、備註過長丟錯", (() => {
  const id = rows[1][0];
  const after = call(`updateTestNote_("${id}", "這次睡很少")`);
  return after[0].note === "這次睡很少" && throws(() => call('updateTestNote_("nope", "x")')) && throws(() => { be.__long = "x".repeat(501); call(`optTextArg_(__long, 500)`); });
})());
check("歷次結果依日期由舊到新排序", (() => {
  be.__p = Object.assign({}, be.__b, { date: "2026-08-01" });
  const l = call("addTestResult_(__p)");
  return l[0].date === "2026-08-01" && l[l.length - 1].date >= l[0].date;
})());
check("路由：getTestResults 走讀取、其他走寫入", /case "getTestResults"/.test(fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8")) && /case "addTestResult"/.test(fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8")));
check("前後端版本一致（shared.js 的最低版本 = Code.gs 的版本）", fs.readFileSync(path.join(__dirname, "..", "shared.js"), "utf8").includes(`BACKEND_MIN_VERSION = "${call("BACKEND_VERSION")}"`));

// ====== 今日清單（一天多張）：用分頁各自獨立的假 Sheet 與假的階段內容 ======
console.log("今日清單");
function fakeSheet(headers) {
  const data = [headers.slice()];
  return {
    data,
    getLastRow: () => data.length,
    setFrozenRows() {},
    deleteRow: r => { data.splice(r - 1, 1); },
    getRange: (r, c, nr, nc) => ({
      setNumberFormat() {},
      setValues: v => { v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; }); }); },
      getValues: () => { const out = []; for (let i = 0; i < nr; i++) out.push((data[r - 1 + i] || []).slice(c - 1, c - 1 + nc)); return out; },
    }),
  };
}
const book = {};
const card = (id, type) => ({ id, type, front: id, back: "中" });
const ids = (pre, n) => Array.from({ length: n }, (_, i) => pre + (i + 1));
const stages = [
  { id: "ja-1", lang: "ja", title: "假名", order: "seq", perDay: 2, cards: ids("ja-k", 4).map(i => card(i, "word")) },
  { id: "ja-2", lang: "ja", title: "單字", order: "random", cards: ids("ja-w", 6).map(i => card(i, "word")) },
  { id: "en-g1", lang: "en", title: "文法一", order: "seq", cards: ids("g1-", 4).map(i => card(i, "sentence")) },
  { id: "en-w1", lang: "en", title: "單字一", order: "random", cards: ids("w1-", 7).map(i => card(i, "word")) },
  { id: "en-r1", lang: "en", title: "閱讀一", order: "seq", cards: ids("r1-", 2).map(i => card(i, "passage")) },
  { id: "en-g2", lang: "en", title: "文法二", order: "seq", cards: ids("g2-", 3).map(i => card(i, "sentence")) },
];
const pb = vm.createContext({
  console, Math, Array, String, Number, Object, JSON, Date, isFinite,
  SpreadsheetApp: { getActiveSpreadsheet: () => ({
    getSheetByName: n => book[n] || null,
    insertSheet: n => (book[n] = fakeSheet(n === "Progress" ? ["date", "lang", "cardId", "done", "mode", "updatedAt"] : n === "Mastered" ? ["cardId", "lang", "updatedAt"] : ["id", "lang", "type", "front", "reading", "back", "note", "createdAt"])),
  }) },
  Utilities: { getUuid: () => "x", formatDate: d => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => "Asia/Taipei" },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  LockService: {}, ContentService: {}, CacheService: {}, UrlFetchApp: {},
});
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8"), pb, { filename: "Code.gs" });
pb.__stages = stages;
vm.runInContext("repoStages_ = function () { return __stages; };", pb);
const P = code => vm.runInContext(code, pb);
const idsOf = (st, lang) => st[lang].cards.map(c => c.cardId);

let st = P('drawPlan_("2026-10-09", "en", false)');
check("英文第一天：每種類型各取一批（例句 3、單字 5、短文 1），共 9 張，沒有複習", (() => {
  const c = idsOf(st, "en");
  return c.length === 9 && c.filter(x => x.startsWith("g1-")).join() === "g1-1,g1-2,g1-3" && c.filter(x => x.startsWith("w1-")).length === 5 && c.filter(x => x.startsWith("r1-")).length === 1 && st.en.cards.every(x => !x.done && !x.review);
})(), idsOf(st, "en"));
check("日文第一天：假名階段 perDay=2 只取 2 張（單字階段還沒輪到）", idsOf(P('drawPlan_("2026-10-09", "ja", false)'), "ja").join() === "ja-k1,ja-k2");
check("同一天再排一次，原樣回傳、不會多排", P('drawPlan_("2026-10-09", "en", false)').en.cards.length === 9 && book.Progress.data.length === 1 + 9 + 2);
check("練完今天的卡之前，不能再來一輪", throws(() => P('drawPlan_("2026-10-09", "en", true)')));
check("completeCard_ 只標那一張，清單裡沒有的卡丟錯", (() => {
  const after = P('completeCard_("2026-10-09", "en", "g1-1", "look")');
  return after.en.cards.filter(c => c.done).length === 1 && after.en.cards[0].cardId === "g1-1" && after.en.cards[0].done && throws(() => P('completeCard_("2026-10-09", "en", "nope", "look")'));
})());
P('idsOfToday = ' + JSON.stringify(idsOf(st, "en")));
st = (P('idsOfToday.forEach(function (id) { completeCard_("2026-10-09", "en", id, "look"); })'), P('todayState_("2026-10-09")'));
check("全部練完後，再來一輪取到下一批新卡（例句 g1-4、單字剩下 2 張、短文 r1-2；沒有複習）", (() => {
  const more = P('drawPlan_("2026-10-09", "en", true)');
  const fresh = more.en.cards.filter(c => !c.done).map(c => c.cardId);
  return fresh.length === 4 && fresh.includes("g1-4") && fresh.includes("r1-2") && fresh.filter(x => x.startsWith("w1-")).length === 2 && fresh.every(c => !more.en.cards.find(x => x.cardId === c).review);
})(), P('todayState_("2026-10-09")').en.cards.filter(c => !c.done).map(c => c.cardId));
check("第二天：新卡接著上次的進度，另外加 2 張最久沒練的複習", (() => {
  P('completeCard_("2026-10-09", "en", "g1-4", "look")');
  const day2 = P('drawPlan_("2026-10-10", "en", false)');
  const reviews = day2.en.cards.filter(c => c.review);
  const news = day2.en.cards.filter(c => !c.review).map(c => c.cardId);
  return reviews.length === 2 && news.length > 0 && news.every(id => !P('progressRows_()').some(p => p.date === "2026-10-09" && p.cardId === id && p.done));
})());
check("勾了完全記得的卡：不再當新卡、也不複習", (() => {
  book.Mastered = fakeSheet(["cardId", "lang", "updatedAt"]);
  book.Mastered.data.push(["g2-1", "en", new Date()]);
  const day3 = P('drawPlan_("2026-10-11", "en", false)');
  return !idsOf(day3, "en").includes("g2-1");
})());
check("階段都練完：改隨機抽（FALLBACK_COUNT 張），不含今天已排的卡", (() => {
  const done = stages.filter(s => s.lang === "ja" && s.id === "ja-1").flatMap(s => s.cards.map(c => c.id));
  done.forEach(id => book.Progress.data.push(["2026-10-01", "ja", id, true, "look", new Date()]));
  stages.find(s => s.id === "ja-2").cards.forEach(c => book.Progress.data.push(["2026-10-02", "ja", c.id, true, "look", new Date()]));
  const r = P('drawPlan_("2026-10-12", "ja", false)');
  const c = idsOf(r, "ja");
  return c.length >= 5 && new Set(c).size === c.length;
})());
check("路由：drawPlan（寫入）、completeCard 帶 id", (() => { const g = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Code.gs"), "utf8"); return /case "drawPlan"/.test(g) && /case "completeCard".*textArg_\(b\.id/.test(g) && !/case "drawCard"/.test(g); })());
if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
