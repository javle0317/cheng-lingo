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
check("日文假名階段（seq）每張卡的假名與讀音一樣多", data.stages.filter(s => s.lang === "ja" && s.order === "seq" && /hiragana|katakana|dakuon|yoon/.test(s.id)).every(s => s.cards.every(c => c.front.split(/\s+/).length === c.reading.split(/\s+/).length)));
const passages = en.filter(c => c.type === "passage");
const qs = c => c.questions || [];
check("英文短文每篇都有 2–4 題理解題", passages.every(c => qs(c).length >= 2 && qs(c).length <= 4), passages.filter(c => qs(c).length < 2 || qs(c).length > 4).map(c => c.id));
check("理解題：題目與選項是英文、選項 2–4 個且不重複、answer 在範圍內（資料裡第一個選項是正解，前端會隨機排）、解釋有中文", all.every(c => qs(c).every(q => q.q && !CJK.test(q.q) && Array.isArray(q.options) && q.options.length >= 2 && q.options.length <= 4 && new Set(q.options).size === q.options.length && q.options.every(o => o && !CJK.test(o)) && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length && CJK.test(q.explain || ""))), all.filter(c => qs(c).some(q => !(q.q && Array.isArray(q.options) && new Set(q.options).size === q.options.length && Number.isInteger(q.answer) && CJK.test(q.explain || "")))).map(c => c.id));
check("只有短文卡（passage）有理解題", all.every(c => !c.questions || c.type === "passage"));
const stageIds = new Set(data.stages.map(s => s.id));
check("階段的 after 指向存在的階段，而且在它後面", data.stages.every((s, i) => !s.after || (stageIds.has(s.after) && data.stages.findIndex(x => x.id === s.after) < i)), data.stages.filter(s => s.after && !stageIds.has(s.after)).map(s => s.id));
if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
