// ====== 承語：今日卡片 + 三種練習模式（看 / 背 / 抄）+ 內容庫 ======
// 唸（TTS 發音）、五十音、英文定級小測之後再加。

const state = {
  lang: localStorage.getItem("lingo_lang") || "en",
  mode: "look",
  cards: [],
  today: {},   // lang -> { cardId, done }
};

const TYPE_LABEL = { word: "單字", sentence: "例句", passage: "短文" };

function currentCard() {
  const t = state.today[state.lang];
  return t ? state.cards.find(c => c.id === t.cardId) || null : null;
}

window.loadPageData = async function () {
  const [cards, today] = await Promise.all([api("getCards"), api("getToday", { date: toDateStr(new Date()) })]);
  state.cards = cards;
  state.today = today;
  // 從 cheng-daily 帶 ?card=<id> 過來：切到那張卡的語言
  const wanted = new URLSearchParams(location.search).get("card");
  const wantedCard = wanted && cards.find(c => c.id === wanted);
  if (wantedCard) {
    state.lang = wantedCard.lang;
    state.today[state.lang] = { cardId: wantedCard.id, done: !!(state.today[state.lang] || {}).done };
  }
  render();
};

function render() {
  document.getElementById("todayLine").textContent = toDateStr(new Date());
  document.querySelectorAll(".lingo-lang").forEach(b => b.classList.toggle("active", b.dataset.lang === state.lang));
  document.querySelectorAll(".lingo-mode").forEach(b => b.classList.toggle("active", b.dataset.mode === state.mode));
  renderCard();
  renderList();
}

function renderCard() {
  const card = currentCard();
  const hasAny = state.cards.some(c => c.lang === state.lang);
  document.getElementById("cardEmpty").classList.toggle("hidden", hasAny);
  document.getElementById("cardBody").classList.toggle("hidden", !hasAny);
  if (!hasAny) return;
  if (!card) { // 這個語言今天還沒抽過
    draw(false);
    return;
  }
  const done = !!(state.today[state.lang] || {}).done;
  document.querySelector(".lingo-card").classList.toggle("passage", card.type === "passage");
  document.getElementById("cardType").textContent = (TYPE_LABEL[card.type] || card.type) + (card.stageTitle ? "・" + card.stageTitle : "") + ((state.today[state.lang] || {}).review ? "・複習" : "");
  document.getElementById("cardFront").textContent = card.front;
  document.getElementById("cardReading").textContent = card.reading || "";
  document.getElementById("cardBack").textContent = card.back;
  document.getElementById("cardNote").textContent = card.note || "";
  const t = state.today[state.lang] || {};
  document.getElementById("masteredWrap").classList.toggle("hidden", !card.repo); // 只有內建卡有階段／複習
  document.getElementById("masteredCheck").checked = !!t.mastered;

  // 看：全部顯示；背：先遮住答案；抄：全部顯示＋輸入框
  const recall = state.mode === "recall";
  document.getElementById("cardReading").classList.toggle("hidden", recall && !state.revealed); // 背：讀音（羅馬拼音／音標）也先遮住
  document.getElementById("cardBackWrap").classList.toggle("hidden", recall && !state.revealed);
  document.getElementById("recallBox").classList.toggle("hidden", !(recall && !state.revealed));
  document.getElementById("copyBox").classList.toggle("hidden", state.mode !== "copy");
  const doneBtn = document.getElementById("doneBtn");
  doneBtn.textContent = done ? "✓ 今天已完成" : "✓ 完成今天的練習";
  doneBtn.disabled = done;
}

function renderList() {
  const ul = document.getElementById("cardList");
  ul.replaceChildren();
  state.cards.filter(c => c.lang === state.lang && !c.repo).forEach(c => { // 內建卡在 repo，只列自己新增的
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.className = "lingo-list-text";
    span.textContent = `${TYPE_LABEL[c.type] || c.type}｜${c.front} → ${c.back}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ghost-btn";
    del.textContent = "刪除";
    del.addEventListener("click", async () => {
      if (!(await showConfirm(`刪除「${c.front.slice(0, 20)}」？`))) return;
      del.disabled = true;
      try {
        state.cards = await api("deleteCard", { id: c.id });
        render();
      } catch (err) {
        del.disabled = false;
        setStatus("刪除失敗：" + err.message, true);
      }
    });
    li.append(span, del);
    ul.appendChild(li);
  });
}

async function draw(reroll) {
  const btn = document.getElementById("drawBtn");
  btn.disabled = true;
  try {
    state.today = await api("drawCard", { date: toDateStr(new Date()), lang: state.lang, reroll: reroll ? "1" : "" });
    state.revealed = false;
    document.getElementById("copyInput").value = "";
    document.getElementById("copyResult").textContent = "";
    renderCard();
  } catch (err) {
    setStatus("抽卡失敗：" + err.message, true);
  } finally {
    btn.disabled = false;
  }
}

document.querySelectorAll(".lingo-lang").forEach(b => b.addEventListener("click", () => {
  state.lang = b.dataset.lang;
  state.revealed = false;
  localStorage.setItem("lingo_lang", state.lang);
  render();
}));

document.querySelectorAll(".lingo-mode").forEach(b => b.addEventListener("click", () => {
  state.mode = b.dataset.mode;
  state.revealed = false;
  render();
}));

document.getElementById("masteredCheck").addEventListener("change", async (e) => {
  const card = currentCard();
  if (!card) return;
  const box = e.target;
  box.disabled = true;
  try {
    state.today = await api("setMastered", { date: toDateStr(new Date()), id: card.id, value: box.checked ? "1" : "0" });
    showToast(box.checked ? "之後不會再出現這張" : "這張會再出現做複習");
  } catch (err) {
    box.checked = !box.checked;
    setStatus("更新失敗：" + err.message, true);
  } finally {
    box.disabled = false;
  }
});

document.getElementById("revealBtn").addEventListener("click", () => { state.revealed = true; renderCard(); });
document.getElementById("drawBtn").addEventListener("click", () => draw(true));

// 抄：只做比對提示，不擋完成
document.getElementById("copyInput").addEventListener("input", (e) => {
  const card = currentCard();
  const out = document.getElementById("copyResult");
  if (!card || !e.target.value.trim()) { out.textContent = ""; out.className = "lingo-copy-result"; return; }
  const norm = s => s.replace(/\s+/g, " ").trim();
  const ok = norm(e.target.value) === norm(card.front);
  out.textContent = ok ? "✓ 完全一致" : "還有不同的地方，再對照一下";
  out.className = "lingo-copy-result " + (ok ? "ok" : "bad");
});

document.getElementById("doneBtn").addEventListener("click", async () => {
  const btn = document.getElementById("doneBtn");
  btn.disabled = true;
  try {
    state.today = await api("completeCard", { date: toDateStr(new Date()), lang: state.lang, mode: state.mode });
    showToast("今天完成了");
    renderCard();
  } catch (err) {
    btn.disabled = false;
    setStatus("打卡失敗：" + err.message, true);
  }
});

document.getElementById("addForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  setFormBusy(form, true);
  try {
    state.cards = await api("addCard", {
      lang: document.getElementById("addLang").value,
      type: document.getElementById("addType").value,
      front: document.getElementById("addFront").value,
      reading: document.getElementById("addReading").value,
      back: document.getElementById("addBack").value,
      note: document.getElementById("addNote").value,
    });
    ["addFront", "addReading", "addBack", "addNote"].forEach(id => { document.getElementById(id).value = ""; });
    showToast("已新增");
    render();
  } catch (err) {
    setStatus("新增失敗：" + err.message, true);
  } finally {
    setFormBusy(form, false);
  }
});

initAuth();
