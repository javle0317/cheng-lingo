// 內建卡片內容檢查：node scripts/cards-check.js
// 抓「欄位放錯」這類資料錯誤（例如英文卡的正面變成中文）。
const fs = require("fs");
const path = require("path");
const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "cards.json"), "utf8"));
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); return; }
  failed++;
  console.log("  ✗ " + name + (detail ? "\n    " + JSON.stringify(detail) : ""));
}
const CJK = /[一-鿿]/, KANA = /[぀-ヿ]/, LATIN = /[A-Za-z]/;
const all = data.stages.flatMap(s => s.cards.map(c => ({ ...c, lang: s.lang, order: s.order, stage: s.id })));

console.log("內建卡片");
check("所有 id 不重複、每個階段有 id／title／order／lang", new Set(all.map(c => c.id)).size === all.length && data.stages.every(s => s.id && s.title && ["seq", "random"].includes(s.order) && ["en", "ja"].includes(s.lang) && s.cards.length));
check("每張卡都有 type（word／sentence／passage）、front、back，id 只用英數與連字號", all.every(c => ["word", "sentence", "passage"].includes(c.type) && c.front && c.back && /^[a-z0-9-]+$/.test(c.id)), all.filter(c => !(c.front && c.back)).map(c => c.id));
const en = all.filter(c => c.lang === "en");
check(`英文卡（${en.length} 張）：正面是英文（有英文字母、沒有中日文字），背面有中文`, en.every(c => LATIN.test(c.front) && !CJK.test(c.front) && !KANA.test(c.front) && CJK.test(c.back)), en.filter(c => !(LATIN.test(c.front) && !CJK.test(c.front) && CJK.test(c.back))).map(c => c.id));
const ja = all.filter(c => c.lang === "ja");
check(`日文卡（${ja.length} 張）：正面有日文假名或漢字，背面有中文`, ja.every(c => (KANA.test(c.front) || CJK.test(c.front)) && CJK.test(c.back)), ja.filter(c => !(KANA.test(c.front) || CJK.test(c.front))).map(c => c.id));
check("英文單字卡都有音標、閱讀卡（passage）至少 40 個英文字", en.filter(c => c.type === "word").every(c => /^\/.+\/$/.test(c.reading)) && en.filter(c => c.type === "passage").every(c => c.front.split(/\s+/).length >= 40));
check("日文假名階段（seq）每張卡的假名與讀音一樣多", data.stages.filter(s => s.lang === "ja" && s.order === "seq").every(s => s.cards.every(c => c.front.split(/\s+/).length === c.reading.split(/\s+/).length)));
if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
