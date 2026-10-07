// ====== 程度小考：抽題、計分、評語（純函式，不碰 DOM；placement.js 和 scripts/placement-check.js 都會載入）======
// 題庫格式見 data/placement/{en,ja}.json：levels（由易到難）、skills（題型 → 名稱）、topics（主題 → 名稱）、
// blueprint（每個等級每種題型抽幾題）、questions（每題 options[answer] 是正確答案，作答時才打亂選項）。
// 規則：每個等級答對率 ≥ 60% 算「過關」；等級 = 最高的過關等級，但下面最多只能有一個等級沒過關（容忍一次失手）。
// 選「我不確定」算答錯（但不是亂猜）。這只是粗略估計，不是正式檢定。

const PLACEMENT_PASS = 0.6;

// 洗牌（rng 預設 Math.random，測試可注入）
function shuffled(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 依 blueprint 從題庫抽題：每個等級每種題型各抽指定題數，優先抽「最近考過沒出現過」的（askedIds），不夠再用考過的補。
// 回傳依等級由易到難排好的題目（同等級內打亂）。
function samplePlacement(quiz, askedIds = [], rng = Math.random) {
  const asked = new Set(askedIds);
  const out = [];
  quiz.levels.forEach(level => {
    const picked = [];
    Object.entries(quiz.blueprint[level] || {}).forEach(([type, n]) => {
      const pool = quiz.questions.filter(q => q.level === level && q.type === type);
      const fresh = shuffled(pool.filter(q => !asked.has(q.id)), rng);
      const seen = shuffled(pool.filter(q => asked.has(q.id)), rng);
      picked.push(...fresh.concat(seen).slice(0, n));
    });
    out.push(...shuffled(picked, rng));
  });
  return out;
}

// answers：{ [questionId]: 選到的選項「文字」或 null（不確定） }
function scorePlacement(quiz, questions, answers) {
  const emptyBands = () => quiz.levels.reduce((o, l) => { o[l] = { correct: 0, total: 0 }; return o; }, {});
  const all = emptyBands();
  const skills = {};
  const topicStats = {};
  const wrong = [];
  questions.forEach(q => {
    const ok = answers[q.id] === q.options[q.answer];
    if (!skills[q.type]) skills[q.type] = { bands: emptyBands() };
    [all, skills[q.type].bands].forEach(b => { b[q.level].total++; if (ok) b[q.level].correct++; });
    const t = topicStats[q.topic] || (topicStats[q.topic] = { wrong: 0, total: 0, minLevel: quiz.levels.length });
    t.total++;
    if (!ok) t.wrong++;
    t.minLevel = Math.min(t.minLevel, quiz.levels.indexOf(q.level));
    if (!ok) wrong.push({ id: q.id, picked: answers[q.id] === undefined ? null : answers[q.id] });
  });
  Object.values(skills).forEach(s => { s.level = levelFrom(quiz.levels, s.bands); });
  return {
    level: levelFrom(quiz.levels, all), skills, bands: all, topicStats, wrong,
    correct: quiz.levels.reduce((n, l) => n + all[l].correct, 0),
    total: quiz.levels.reduce((n, l) => n + all[l].total, 0),
  };
}

function levelFrom(levels, bands) {
  const used = levels.filter(l => bands[l].total > 0); // 沒出題的等級不算
  const passed = used.map(l => bands[l].correct / bands[l].total >= PLACEMENT_PASS);
  let best = -1;
  for (let i = 0; i < used.length; i++) {
    if (!passed[i]) continue;
    if (passed.slice(0, i).filter(p => !p).length <= 1) best = i;
  }
  return best < 0 ? used[0] + " 以下" : used[best];
}

// 等級名稱 → 序號（「A1 以下」是 -1，不認得的是 null）
function levelIndex(quiz, name) {
  if (typeof name !== "string") return null;
  if (name.endsWith(" 以下")) return -1;
  const i = quiz.levels.indexOf(name);
  return i < 0 ? null : i;
}

// 評語：整體等級（與上次比較）、技能之間的落差、該加強的主題。prev 是上一次同語言的結果 { level }（沒有就省略）。
function commentFor(quiz, result, prev) {
  const parts = [];
  const idx = levelIndex(quiz, result.level);
  let head = `整體 ${result.level}`;
  if (prev) {
    const p = levelIndex(quiz, prev.level);
    if (p !== null && idx !== null) head += idx > p ? `（比上次進步 ${idx - p} 級）` : idx < p ? `（比上次退步 ${p - idx} 級）` : "（和上次持平）";
  }
  parts.push(head);

  // 技能落差：只比較有多個等級可比的題型（例如日文的「假名」只有一個等級，不比）
  const comparable = Object.entries(result.skills).filter(([, s]) => quiz.levels.filter(l => s.bands[l].total > 0).length > 1);
  if (comparable.length > 1) {
    const withIdx = comparable.map(([type, s]) => ({ name: quiz.skills[type] || type, level: s.level, i: levelIndex(quiz, s.level) })).filter(x => x.i !== null);
    withIdx.sort((a, b) => a.i - b.i);
    const low = withIdx[0], high = withIdx[withIdx.length - 1];
    if (low && high && high.i - low.i >= 1) parts.push(`${low.name}（${low.level}）比${high.name}（${high.level}）落後 ${high.i - low.i} 級`);
  }

  // 該加強的主題：答錯、且題目難度不超過你目前的等級＋1（太難的不算弱項），單字不列主題；依答錯數、再依難度排序
  const limit = (idx === null ? 0 : idx) + 1;
  const weak = Object.entries(result.topicStats)
    .filter(([topic, t]) => topic !== "vocab" && t.wrong > 0 && t.minLevel <= limit)
    .sort((a, b) => b[1].wrong - a[1].wrong || a[1].minLevel - b[1].minLevel)
    .slice(0, 3).map(([topic]) => quiz.topics[topic] || topic);
  parts.push(weak.length ? `該加強：${weak.join("、")}` : "沒有明顯弱項");
  return parts.join("。") + "。";
}
