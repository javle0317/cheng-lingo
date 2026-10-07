// 程度小考的檢查：題庫格式、抽題、計分、評語。node scripts/placement-check.js
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
const ctx = vm.createContext({ console, Math, Array, String, Number, Object, Set });
vm.runInContext(read("placement-score.js") + "\nthis.api = { samplePlacement, scorePlacement, commentFor, levelFrom, levelIndex, shuffled };", ctx, { filename: "placement-score.js" });
const A = ctx.api;
const quizzes = { en: JSON.parse(read("data/placement/en.json")), ja: JSON.parse(read("data/placement/ja.json")) };
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

Object.entries(quizzes).forEach(([lang, quiz]) => {
  console.log(`題庫（${lang}）`);
  const qs = quiz.questions;
  check("id 不重複、題目文字不重複", new Set(qs.map(q => q.id)).size === qs.length && new Set(qs.map(q => q.q)).size === qs.length);
  check("每題 4 個不同選項、answer 在範圍內、有解釋、等級／題型／主題都在題庫定義裡", qs.every(q => q.options.length === 4 && new Set(q.options).size === 4 && q.answer >= 0 && q.answer < 4 && q.explain && quiz.levels.includes(q.level) && quiz.skills[q.type] && quiz.topics[q.topic]), qs.filter(q => !(quiz.levels.includes(q.level) && quiz.skills[q.type] && quiz.topics[q.topic])).map(q => q.id));
  check("blueprint 每個等級每種題型的題庫都夠抽", quiz.levels.every(l => Object.entries(quiz.blueprint[l] || {}).every(([type, n]) => qs.filter(q => q.level === l && q.type === type).length >= n)));
  const total = quiz.levels.reduce((s, l) => s + Object.values(quiz.blueprint[l] || {}).reduce((a, b) => a + b, 0), 0);
  const s1 = A.samplePlacement(quiz, [], seeded(7));
  check(`抽出 ${total} 題、依等級由易到難、題數符合 blueprint`, s1.length === total && s1.every((q, i, a) => i === 0 || quiz.levels.indexOf(q.level) >= quiz.levels.indexOf(a[i - 1].level)) && quiz.levels.every(l => Object.entries(quiz.blueprint[l] || {}).every(([type, n]) => s1.filter(q => q.level === l && q.type === type).length === n)));
  const s2 = A.samplePlacement(quiz, s1.map(q => q.id), seeded(11));
  const overlap = s2.filter(q => s1.some(x => x.id === q.id)).length;
  if (lang === "en") check("重考優先抽沒考過的題目（英文題庫是 2 倍大，兩次不會重複）", overlap === 0, overlap);
  else check("題庫不夠大時，重考會用考過的題補（日文目前一樣的 30 題）", s2.length === total);
});

const en = quizzes.en, ja = quizzes.ja;
const answers = (quiz, qs, pred) => Object.fromEntries(qs.map(q => [q.id, pred(q) ? q.options[q.answer] : q.options[(q.answer + 1) % 4]]));

console.log("計分（英文）");
const qs = A.samplePlacement(en, [], seeded(3));
let r = A.scorePlacement(en, qs, answers(en, qs, () => true));
check("全對 → C1、40/40、單字與文法都是 C1", r.level === "C1" && r.correct === 40 && r.skills.vocab.level === "C1" && r.skills.grammar.level === "C1" && r.wrong.length === 0);
r = A.scorePlacement(en, qs, answers(en, qs, () => false));
check("全錯 → A1 以下、答錯 40 題", r.level === "A1 以下" && r.correct === 0 && r.wrong.length === 40);
r = A.scorePlacement(en, qs, answers(en, qs, q => ["A1", "A2", "B1"].includes(q.level)));
check("A1–B1 全對、B2 以上全錯 → B1", r.level === "B1", r.level);
r = A.scorePlacement(en, qs, answers(en, qs, q => q.level !== "A2"));
check("只錯 A2 一個等級（失手一次）仍可到 C1", r.level === "C1", r.level);
r = A.scorePlacement(en, qs, answers(en, qs, q => !["A2", "B1"].includes(q.level)));
check("A2、B1 都錯（失手兩次）→ A1", r.level === "A1", r.level);
r = A.scorePlacement(en, qs, answers(en, qs, q => q.type === "vocab"));
check("單字全對、文法全錯 → 單字 C1、文法 A1 以下", r.skills.vocab.level === "C1" && r.skills.grammar.level === "A1 以下");
const ans = answers(en, qs, () => true); ans[qs[0].id] = null;
r = A.scorePlacement(en, qs, ans);
check("選「我不確定」（null）算答錯，picked 為 null", r.correct === 39 && r.wrong.length === 1 && r.wrong[0].picked === null);
r = A.scorePlacement(en, qs, {});
check("沒作答（空物件）等同全錯、不會丟錯", r.correct === 0 && r.wrong.length === 40);

console.log("計分（日文）");
const jqs = A.samplePlacement(ja, [], seeded(5));
r = A.scorePlacement(ja, jqs, answers(ja, jqs, () => true));
check("全對 → N4；假名、單字、文法各自的等級", r.level === "N4" && r.skills.kana.level === "假名" && r.skills.vocab.level === "N4" && r.skills.grammar.level === "N4" && r.total === 30, [r.level, r.total]);
r = A.scorePlacement(ja, jqs, answers(ja, jqs, q => q.type === "kana"));
check("只有假名題對 → 整體「假名」（單字、文法 N5 以下）", r.level === "假名" && r.skills.vocab.level === "N5 以下", [r.level, r.skills.vocab.level]);
r = A.scorePlacement(ja, jqs, answers(ja, jqs, () => false));
check("全錯 → 假名 以下", r.level === "假名 以下", r.level);

console.log("評語");
r = A.scorePlacement(en, qs, answers(en, qs, q => !(q.type === "grammar" && ["B1", "B2", "C1"].includes(q.level))));
let c = A.commentFor(en, r);
check("文法比單字落後時寫出落差，並列出該加強的主題", /整體/.test(c) && /文法（.+）比單字（.+）落後/.test(c) && /該加強：/.test(c), c);
check("沒有上一次就不提進步", !/上次/.test(c));
check("與上次比較：進步／持平／退步", /比上次進步 1 級/.test(A.commentFor(en, { ...r, level: "B1" }, { level: "A2" })) && /和上次持平/.test(A.commentFor(en, { ...r, level: "B1" }, { level: "B1" })) && /比上次退步 2 級/.test(A.commentFor(en, { ...r, level: "A2" }, { level: "B2" })));
r = A.scorePlacement(en, qs, answers(en, qs, () => true));
check("全對 → 沒有明顯弱項", /沒有明顯弱項/.test(A.commentFor(en, r)));
check("單字不會被當成「主題」列在弱項裡", (() => { const rr = A.scorePlacement(en, qs, answers(en, qs, q => q.type !== "vocab")); return !/該加強：.*單字/.test(A.commentFor(en, rr)); })());
check("levelIndex：等級名稱 → 序號，「以下」是 -1，不認得是 null", A.levelIndex(en, "B1") === 2 && A.levelIndex(en, "A1 以下") === -1 && A.levelIndex(en, "X") === null && A.levelIndex(en, undefined) === null);

if (failed) { console.log("\n" + failed + " 項失敗"); process.exit(1); }
console.log("\n全部通過");
