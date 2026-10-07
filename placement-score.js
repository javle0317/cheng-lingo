// ====== 英文程度小考：計分（純函式，不碰 DOM；placement.js 和 scripts/placement-check.js 都會載入）======
// 規則：每個等級（A1 → C1）答對率 ≥ 60% 算「過關」；等級 = 最高的過關等級，但下面最多只能有一個等級沒過關（容忍一次失手）。
// 單字與文法各自用同樣的規則分開算。選「我不確定」算答錯（但不是亂猜）。這只是粗略估計，不是正式檢定。

const PLACEMENT_LEVELS = ["A1", "A2", "B1", "B2", "C1"];
const PLACEMENT_PASS = 0.6;

// answers：{ [questionId]: 選到的選項「文字」或 null（不確定） }；questions 的 options[answer] 是正確答案
function scorePlacement(questions, answers) {
  const empty = () => PLACEMENT_LEVELS.reduce((o, l) => { o[l] = { correct: 0, total: 0 }; return o; }, {});
  const all = empty(), vocab = empty(), grammar = empty();
  const wrong = [];
  questions.forEach(q => {
    const ok = answers[q.id] === q.options[q.answer];
    [all, q.type === "vocab" ? vocab : grammar].forEach(b => { b[q.level].total++; if (ok) b[q.level].correct++; });
    if (!ok) wrong.push({ id: q.id, picked: answers[q.id] === undefined ? null : answers[q.id] });
  });
  return {
    level: levelFrom(all), vocabLevel: levelFrom(vocab), grammarLevel: levelFrom(grammar),
    bands: all, vocabBands: vocab, grammarBands: grammar,
    correct: PLACEMENT_LEVELS.reduce((n, l) => n + all[l].correct, 0),
    total: PLACEMENT_LEVELS.reduce((n, l) => n + all[l].total, 0),
    wrong,
  };
}

function levelFrom(bands) {
  const passed = PLACEMENT_LEVELS.map(l => bands[l].total > 0 && bands[l].correct / bands[l].total >= PLACEMENT_PASS);
  let best = -1;
  for (let i = 0; i < PLACEMENT_LEVELS.length; i++) {
    if (!passed[i]) continue;
    const failedBelow = passed.slice(0, i).filter(p => !p).length;
    if (failedBelow <= 1) best = i;
  }
  return best < 0 ? "A1 以下" : PLACEMENT_LEVELS[best];
}

// 洗牌（rng 預設 Math.random，測試可注入）
function shuffled(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
