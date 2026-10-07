// 英文程度小考的檢查：題庫格式與計分規則。node scripts/placement-check.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { console.log("  ✓ " + name); return; }
  failed++;
  console.log("  ✗ " + name + (detail !== undefined ? "\n    " + JSON.stringify(detail) : ""));
}
const ctx = vm.createContext({ console, Math, Array, String, Number, Object });
vm.runInContext(read("placement-score.js") + "\nthis.scorePlacement = scorePlacement; this.shuffled = shuffled; this.LEVELS = PLACEMENT_LEVELS;", ctx, { filename: "placement-score.js" });
const { questions } = JSON.parse(read("data/placement.json"));

console.log("題庫");
check("共 40 題、id 不重複、題目文字不重複", questions.length === 40 && new Set(questions.map(q => q.id)).size === 40 && new Set(questions.map(q => q.q)).size === 40);
check("每題都有 4 個不同的選項、answer 在範圍內、有 level/type/解釋", questions.every(q => q.options.length === 4 && new Set(q.options).size === 4 && q.answer >= 0 && q.answer < 4 && ctx.LEVELS.includes(q.level) && ["vocab", "grammar"].includes(q.type) && q.explain), questions.filter(q => !(q.options.length === 4 && new Set(q.options).size === 4)).map(q => q.id));
check("單字與文法各 20 題，每個等級單字與文法題數一樣多（A1 3+3、A2 4+4、B1 5+5、B2 5+5、C1 3+3）", questions.filter(q => q.type === "vocab").length === 20 && ctx.LEVELS.every(l => questions.filter(x => x.level === l && x.type === "vocab").length === questions.filter(x => x.level === l && x.type === "grammar").length));
check("題目含空格（____）才是填空題", questions.every(q => q.q.includes("____")));

console.log("計分");
const correct = (pred) => Object.fromEntries(questions.map(q => [q.id, pred(q) ? q.options[q.answer] : q.options[(q.answer + 1) % 4]]));
let r = ctx.scorePlacement(questions, correct(() => true));
check("全對 → C1、40/40", r.level === "C1" && r.vocabLevel === "C1" && r.grammarLevel === "C1" && r.correct === 40 && r.wrong.length === 0, r.level);
r = ctx.scorePlacement(questions, correct(() => false));
check("全錯 → A1 以下", r.level === "A1 以下" && r.correct === 0 && r.wrong.length === 40);
r = ctx.scorePlacement(questions, correct(q => ["A1", "A2", "B1"].includes(q.level)));
check("A1–B1 全對、B2 以上全錯 → B1", r.level === "B1", r.level);
r = ctx.scorePlacement(questions, correct(q => ["A1", "A2"].includes(q.level)));
check("只對 A1–A2 → A2", r.level === "A2", r.level);
r = ctx.scorePlacement(questions, correct(q => q.level !== "A2"));
check("只錯 A2 一個等級（失手一次）仍可到 C1", r.level === "C1", r.level);
r = ctx.scorePlacement(questions, correct(q => !["A2", "B1"].includes(q.level)));
check("A2、B1 都錯（失手兩次）→ 回到 A1", r.level === "A1", r.level);
r = ctx.scorePlacement(questions, correct(q => q.type === "vocab"));
check("單字全對、文法全錯 → 單字 C1、文法 A1 以下", r.vocabLevel === "C1" && r.grammarLevel === "A1 以下", [r.vocabLevel, r.grammarLevel]);
const ans = correct(() => true); ans[questions[0].id] = null;
r = ctx.scorePlacement(questions, ans);
check("選「我不確定」（null）算答錯，並列在答錯清單、picked 為 null", r.correct === 39 && r.wrong.length === 1 && r.wrong[0].picked === null);
r = ctx.scorePlacement(questions, {});
check("沒作答（空物件）等同全錯，不會丟錯", r.correct === 0 && r.wrong.length === 40);
const sh = ctx.shuffled([1, 2, 3, 4]);
check("shuffled：不改原陣列、元素一樣", sh.slice().sort().join() === "1,2,3,4");

if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
