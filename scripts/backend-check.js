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
if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
