// ====== 英文程度小考（單字＋文法）======
// 題目在 data/placement.json（每題 options[answer] 是正確答案，作答時會打亂選項順序）；計分在 placement-score.js。
// 純靜態、不用登入、不呼叫後端。最近一次結果只存在這支瀏覽器的 localStorage（lingo_placement）。

const LAST_KEY = "lingo_placement";
const LEVEL_HINT = {
  "A1 以下": "從最基礎開始：先把常用單字和簡單句型練熟。",
  A1: "入門：能看懂簡單的句子，先擴充日常單字和基本時態。",
  A2: "基礎：日常對話的基本句型已經有了，接下來補常用單字和時態變化。",
  B1: "中級：能應付大部分日常情境，進一步加強片語、子句與較長的句子。",
  B2: "中高級：多數內容都能理解，可以開始練進階單字、倒裝與假設語氣。",
  C1: "高級：只剩少數細節，重點放在精準用字和少見的句型。",
};

const quiz = { questions: [], index: 0, answers: {}, shuffledOptions: {} };

const $ = (id) => document.getElementById(id);
function show(box) { ["startBox", "quizBox", "resultBox"].forEach(id => $(id).classList.toggle("hidden", id !== box)); }

function localDateStr() { // 用當地日期，不能用 toISOString（那是 UTC，台灣早上會顯示成前一天）
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function readLast() {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) || "null"); } catch (e) { return null; }
}
function saveLast(r) {
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ date: localDateStr(), level: r.level, vocabLevel: r.vocabLevel, grammarLevel: r.grammarLevel, correct: r.correct, total: r.total })); } catch (e) { /* 存不了就算了 */ }
}

function renderLast() {
  const last = readLast();
  $("lastResult").textContent = last ? `上次（${last.date}）：${last.level}，單字 ${last.vocabLevel}、文法 ${last.grammarLevel}（${last.correct}/${last.total} 題）` : "";
}

async function init() {
  try {
    const res = await fetch("data/placement.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    quiz.questions = (await res.json()).questions;
  } catch (err) {
    $("statusLine").textContent = "載入題目失敗：" + err.message;
    $("startBtn").disabled = true;
    return;
  }
  renderLast();
  show("startBox");
}

function start() {
  quiz.index = 0;
  quiz.answers = {};
  quiz.shuffledOptions = {};
  show("quizBox");
  renderQuestion();
}

function renderQuestion() {
  const q = quiz.questions[quiz.index];
  const n = quiz.questions.length;
  $("progressText").textContent = `第 ${quiz.index + 1} / ${n} 題・${q.type === "vocab" ? "單字" : "文法"}`;
  $("barFill").style.width = `${(quiz.index / n) * 100}%`;
  $("questionText").textContent = q.q;
  if (!quiz.shuffledOptions[q.id]) quiz.shuffledOptions[q.id] = shuffled(q.options);
  const list = $("optionList");
  list.replaceChildren();
  quiz.shuffledOptions[q.id].forEach(opt => {
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
  if (locked) return; // 連點保護：一題只算一次
  locked = true;
  quiz.answers[quiz.questions[quiz.index].id] = choice;
  quiz.index++;
  if (quiz.index >= quiz.questions.length) finish();
  else renderQuestion();
  setTimeout(() => { locked = false; }, 150);
}

function bandRow(label, bands) {
  return `<tr><th>${label}</th>${PLACEMENT_LEVELS.map(l => `<td>${bands[l].correct}/${bands[l].total}</td>`).join("")}</tr>`;
}

function finish() {
  const r = scorePlacement(quiz.questions, quiz.answers);
  saveLast(r);
  $("levelBig").textContent = r.level;
  $("levelHint").textContent = LEVEL_HINT[r.level] || "";
  $("skillRows").innerHTML = "";
  [["單字", r.vocabLevel], ["文法", r.grammarLevel]].forEach(([name, lv]) => {
    const row = document.createElement("div");
    row.className = "placement-skill";
    row.innerHTML = `<span></span><b></b>`;
    row.firstChild.textContent = name;
    row.lastChild.textContent = lv;
    $("skillRows").appendChild(row);
  });
  const head = `<tr><th></th>${PLACEMENT_LEVELS.map(l => `<th>${l}</th>`).join("")}</tr>`;
  $("bandTable").innerHTML = `<table class="placement-table">${head}${bandRow("全部", r.bands)}${bandRow("單字", r.vocabBands)}${bandRow("文法", r.grammarBands)}</table>`;

  const byId = Object.fromEntries(quiz.questions.map(q => [q.id, q]));
  $("wrongSummary").textContent = r.wrong.length ? `答錯或不確定的 ${r.wrong.length} 題（點開看解答）` : "全部答對！";
  $("wrongBox").classList.toggle("hidden", !r.wrong.length);
  const list = $("wrongList");
  list.replaceChildren();
  r.wrong.forEach(w => {
    const q = byId[w.id];
    const item = document.createElement("div");
    item.className = "placement-wrong-item";
    const t = document.createElement("p");
    t.className = "placement-wrong-q";
    t.textContent = `[${q.level}] ${q.q}`;
    const a = document.createElement("p");
    a.textContent = `正確答案：${q.options[q.answer]}　你的答案：${w.picked === null ? "我不確定" : w.picked}`;
    const e = document.createElement("p");
    e.className = "placement-wrong-exp";
    e.textContent = q.explain;
    item.append(t, a, e);
    list.appendChild(item);
  });
  $("barFill").style.width = "100%";
  show("resultBox");
}

$("startBtn").addEventListener("click", start);
$("unsureBtn").addEventListener("click", () => answer(null));
$("againBtn").addEventListener("click", () => { renderLast(); show("startBox"); });

init();
