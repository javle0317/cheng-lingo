// ====== 程度小考（英文／日文，之後可以加其他語言）======
// 題庫在 data/placement/<lang>.json，抽題與計分在 placement-score.js。歷次結果存在 Sheet 的 TestResults 分頁
// （getTestResults / addTestResult / updateTestNote），所以這頁要登入。重考時優先抽沒考過的題目。

const LANGS = { en: { name: "英文", file: "data/placement/en.json" }, ja: { name: "日文", file: "data/placement/ja.json" } };
const HINTS = {
  en: {
    "A1 以下": "從最基礎開始：先把常用單字和簡單句型練熟。",
    A1: "入門：能看懂簡單的句子，先擴充日常單字和基本時態。",
    A2: "基礎：日常對話的基本句型已經有了，接下來補常用單字和時態變化。",
    B1: "中級：能應付大部分日常情境，進一步加強片語、子句與較長的句子。",
    B2: "中高級：多數內容都能理解，可以開始練進階單字、倒裝與假設語氣。",
    C1: "高級：只剩少數細節，重點放在精準用字和少見的句型。",
  },
  ja: {
    "假名 以下": "先把平假名、片假名的辨認與發音練熟。",
    "假名": "假名已經認得了，接下來擴充入門單字與基本助詞。",
    "N5 以下": "假名之後，從基本單字與助詞（は、を、に、で）開始。",
    N5: "N5 程度：基本單字與助詞已經有了，可以往 N4 的句型與連接詞推進。",
    N4: "N4 以上：基礎很穩，之後可以加入更多 N4／N3 的單字與句型。",
  },
};

const state = { lang: localStorage.getItem("lingo_placement_lang") || "en", quizzes: {}, history: [], session: null };
const $ = (id) => document.getElementById(id);
function show(box) { ["startBox", "quizBox", "resultBox"].forEach(id => $(id).classList.toggle("hidden", id !== box)); }
function localDateStr() { // 用當地日期，不能用 toISOString（那是 UTC，台灣早上會顯示成前一天）
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const historyOf = (lang) => state.history.filter(r => r.lang === lang);

async function loadQuiz(lang) {
  if (state.quizzes[lang]) return state.quizzes[lang];
  const res = await fetch(LANGS[lang].file, { cache: "no-cache" });
  if (!res.ok) throw new Error(`讀不到題庫（HTTP ${res.status}）`);
  state.quizzes[lang] = await res.json();
  return state.quizzes[lang];
}

window.loadPageData = async function () {
  state.history = await api("getTestResults");
  if (!LANGS[state.lang]) state.lang = "en";
  await renderStart();
};

async function renderStart() {
  document.querySelectorAll(".placement-lang").forEach(b => b.classList.toggle("active", b.dataset.lang === state.lang));
  show("startBox");
  const quiz = await loadQuiz(state.lang);
  const total = quiz.levels.reduce((s, l) => s + Object.values(quiz.blueprint[l] || {}).reduce((a, b) => a + b, 0), 0);
  $("startLead").textContent = `${quiz.title}：共 ${total} 題選擇題，約 ${Math.round(total / 3)} 分鐘。題目從簡單排到困難，不確定就選「我不確定」，不要亂猜，結果比較準。`;
  renderHistory(quiz);
}

// ====== 進步紀錄 ======
function skillsText(quiz, skills) {
  return Object.entries(skills || {}).map(([k, v]) => `${quiz.skills[k] || k} ${v}`).join("、");
}

function chartSvg(quiz, list) {
  const pts = list.slice(-12);
  if (pts.length < 2) return "";
  const W = 320, H = 110, L = 38, R = 10, T = 8, B = 22;
  const n = quiz.levels.length; // 序號 -1（以下）… n-1
  const y = (i) => T + (H - T - B) * (1 - (i + 1) / n);
  const x = (k) => L + (W - L - R) * (k / (pts.length - 1));
  const idx = pts.map(r => { const v = levelIndex(quiz, r.level); return v === null ? -1 : v; });
  let g = quiz.levels.map((l, i) => `<line x1="${L}" y1="${y(i)}" x2="${W - R}" y2="${y(i)}" stroke="var(--border)" stroke-width="1"/><text x="${L - 6}" y="${y(i) + 4}" text-anchor="end" font-size="10" fill="var(--text-dim)">${escapeHtml(l)}</text>`).join("");
  g += `<polyline points="${idx.map((v, k) => `${x(k)},${y(v)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2"/>`;
  g += idx.map((v, k) => `<circle cx="${x(k)}" cy="${y(v)}" r="3.5" fill="var(--accent)"/>`).join("");
  g += pts.map((r, k) => (k === 0 || k === pts.length - 1) ? `<text x="${x(k)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : "end"}" font-size="10" fill="var(--text-dim)">${escapeHtml(r.date.slice(5))}</text>` : "").join("");
  return `<svg class="placement-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="歷次等級變化">${g}</svg>`;
}

function renderHistory(quiz) {
  const list = historyOf(state.lang);
  const box = $("historyBox");
  if (!list.length) { box.innerHTML = `<p class="placement-last">還沒有${LANGS[state.lang].name}的考試紀錄，考完會自動記下來。</p>`; return; }
  const last = list[list.length - 1];
  const rows = list.slice().reverse().map(r => `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.level)}</td><td>${r.correct}/${r.total}</td></tr>
    <tr class="placement-hist-detail"><td colspan="3">${escapeHtml(skillsText(quiz, r.skills))}${r.comment ? "<br>" + escapeHtml(r.comment) : ""}${r.note ? `<br><i>備註：${escapeHtml(r.note)}</i>` : ""}</td></tr>`).join("");
  box.innerHTML = `<p class="placement-last">上次（${escapeHtml(last.date)}）：<b>${escapeHtml(last.level)}</b>　${escapeHtml(skillsText(quiz, last.skills))}（${last.correct}/${last.total} 題）</p>
    ${chartSvg(quiz, list)}
    <details class="placement-wrong"><summary>歷次紀錄（${list.length} 次）</summary><table class="placement-table placement-hist">${rows}</table></details>`;
}

// ====== 作答 ======
async function start() {
  const quiz = await loadQuiz(state.lang);
  const asked = historyOf(state.lang).flatMap(r => r.asked || []);
  state.session = { quiz, questions: samplePlacement(quiz, asked), index: 0, answers: {}, options: {}, saved: null, result: null };
  show("quizBox");
  renderQuestion();
}

function renderQuestion() {
  const s = state.session;
  const q = s.questions[s.index];
  const n = s.questions.length;
  $("progressText").textContent = `第 ${s.index + 1} / ${n} 題・${s.quiz.skills[q.type] || q.type}`;
  $("barFill").style.width = `${(s.index / n) * 100}%`;
  $("questionText").textContent = q.q;
  if (!s.options[q.id]) s.options[q.id] = shuffled(q.options);
  const list = $("optionList");
  list.replaceChildren();
  s.options[q.id].forEach(opt => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ghost-btn placement-opt";
    b.textContent = opt;
    b.addEventListener("click", () => answer(opt));
    list.appendChild(b);
  });
}

let locked = false;
function answer(choice) {
  const s = state.session;
  if (locked || !s) return; // 連點保護：一題只算一次
  locked = true;
  s.answers[s.questions[s.index].id] = choice;
  s.index++;
  if (s.index >= s.questions.length) finish();
  else renderQuestion();
  setTimeout(() => { locked = false; }, 150);
}

function bandRow(label, bands, levels) {
  return `<tr><th>${escapeHtml(label)}</th>${levels.map(l => `<td>${bands[l].total ? `${bands[l].correct}/${bands[l].total}` : "–"}</td>`).join("")}</tr>`;
}

function finish() {
  const s = state.session;
  const quiz = s.quiz;
  const r = scorePlacement(quiz, s.questions, s.answers);
  const prev = historyOf(state.lang).slice(-1)[0];
  s.result = r;
  s.comment = commentFor(quiz, r, prev);
  $("levelBig").textContent = r.level;
  $("levelHint").textContent = (HINTS[state.lang] || {})[r.level] || "";
  $("skillRows").replaceChildren();
  Object.entries(r.skills).forEach(([type, sk]) => {
    const row = document.createElement("div");
    row.className = "placement-skill";
    const a = document.createElement("span"); a.textContent = quiz.skills[type] || type;
    const b = document.createElement("b"); b.textContent = sk.level;
    row.append(a, b);
    $("skillRows").appendChild(row);
  });
  const head = `<tr><th></th>${quiz.levels.map(l => `<th>${escapeHtml(l)}</th>`).join("")}</tr>`;
  $("bandTable").innerHTML = `<table class="placement-table">${head}${bandRow("全部", r.bands, quiz.levels)}${Object.entries(r.skills).map(([t, sk]) => bandRow(quiz.skills[t] || t, sk.bands, quiz.levels)).join("")}</table>`;
  $("commentText").textContent = s.comment;
  $("noteInput").value = "";
  $("saveNoteBtn").disabled = true;

  const byId = Object.fromEntries(s.questions.map(q => [q.id, q]));
  $("wrongSummary").textContent = r.wrong.length ? `答錯或不確定的 ${r.wrong.length} 題（點開看解答）` : "全部答對！";
  $("wrongBox").classList.toggle("hidden", !r.wrong.length);
  const list = $("wrongList");
  list.replaceChildren();
  r.wrong.forEach(w => {
    const q = byId[w.id];
    const item = document.createElement("div");
    item.className = "placement-wrong-item";
    const t = document.createElement("p"); t.className = "placement-wrong-q"; t.textContent = `[${q.level}] ${q.q}`;
    const a = document.createElement("p"); a.textContent = `正確答案：${q.options[q.answer]}　你的答案：${w.picked === null ? "我不確定" : w.picked}`;
    const e = document.createElement("p"); e.className = "placement-wrong-exp"; e.textContent = q.explain;
    item.append(t, a, e);
    list.appendChild(item);
  });
  $("barFill").style.width = "100%";
  show("resultBox");
  saveResult();
}

// 考完自動記錄；失敗會留在畫面上讓你重試（不會默默丟掉）
async function saveResult() {
  const s = state.session;
  const r = s.result;
  const status = $("saveStatus");
  status.textContent = "記錄中…";
  status.className = "";
  try {
    state.history = await api("addTestResult", {
      date: localDateStr(), lang: state.lang, level: r.level,
      skills: JSON.stringify(Object.fromEntries(Object.entries(r.skills).map(([t, sk]) => [t, sk.level]))),
      correct: r.correct, total: r.total, comment: s.comment, asked: s.questions.map(q => q.id).join(","),
    });
    s.saved = historyOf(state.lang).slice(-1)[0];
    status.textContent = "已記錄到 Sheet";
    $("saveNoteBtn").disabled = false;
  } catch (err) {
    status.className = "placement-save-error";
    status.innerHTML = "";
    status.append(`記錄失敗：${err.message} `);
    const retry = document.createElement("button");
    retry.type = "button"; retry.className = "ghost-btn"; retry.textContent = "重試";
    retry.addEventListener("click", saveResult);
    status.appendChild(retry);
  }
}

async function saveNote() {
  const s = state.session;
  if (!s || !s.saved) return;
  const btn = $("saveNoteBtn");
  btn.disabled = true;
  try {
    state.history = await api("updateTestNote", { id: s.saved.id, note: $("noteInput").value });
    showToast("備註已儲存");
  } catch (err) {
    setStatus("儲存備註失敗：" + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.querySelectorAll(".placement-lang").forEach(b => b.addEventListener("click", async () => {
  state.lang = b.dataset.lang;
  try { localStorage.setItem("lingo_placement_lang", state.lang); } catch (e) { /* ignore */ }
  try { await renderStart(); } catch (err) { setStatus("載入失敗：" + err.message, true); }
}));
$("startBtn").addEventListener("click", () => start().catch(err => setStatus("載入題庫失敗：" + err.message, true)));
$("unsureBtn").addEventListener("click", () => answer(null));
$("saveNoteBtn").addEventListener("click", saveNote);
$("againBtn").addEventListener("click", () => renderStart().catch(err => setStatus("載入失敗：" + err.message, true)));

initAuth();
