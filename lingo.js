// ====== 承語：今日首頁 + 練習（看 / 背 / 抄、唸）+ 內容庫 ======
// 畫面分三塊：home（今日）、session（照今日清單一張一張練）、library（內容庫）；底部分頁列切換。
// 今日清單由後端排（drawPlan）：每種類型各一批新卡加幾張複習；練完可以按「再來一輪」排下一批。

const state = {
  view: "home",
  lang: localStorage.getItem("lingo_lang") || "en",
  mode: "look",
  revealed: false,
  dictate: false, // 抄：聽寫（只聽不看）
  peek: false,    // 聽寫時已顯示原文
  cards: [],
  tests: [],   // 程度小考歷次結果（用來提醒重考）
  today: {},   // lang -> { cards: [{ cardId, done, review, mastered }] }
  cardId: "",  // 練習中的這張卡
  questions: {}, // 短文卡 id -> 理解題（從 data/cards.json 直接讀，不經後端）
  quiz: {},      // 短文卡 id -> { order: [每題隨機排好的選項順序], picked: [每題選了第幾個] }
  skipQuiz: {},  // 短文卡 id -> true：不做題，直接看翻譯
};

const TYPE_LABEL = { word: "單字", sentence: "例句", passage: "短文" };
const LANG_NAME = { en: "English", ja: "日本語" };
const TTS_LANG = { en: "en-US", ja: "ja-JP" };
const HAS_TTS = "speechSynthesis" in window;

function planOf(lang) { return (state.today[lang] || {}).cards || []; }
function currentEntry() { return planOf(state.lang).find(e => e.cardId === state.cardId) || {}; }
function currentCard() {
  const e = planOf(state.lang).find(x => x.cardId === state.cardId);
  return e ? state.cards.find(c => c.id === e.cardId) || null : null;
}

function cardTypeText(card, t) {
  return (TYPE_LABEL[card.type] || card.type) + (card.stageTitle ? "・" + card.stageTitle : "") + ((t || {}).review ? "・複習" : "");
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

window.loadPageData = async function () {
  const [cards, today, tests] = await Promise.all([
    api("getCards"), api("getToday", { date: toDateStr(new Date()) }),
    api("getTestResults").catch(() => []), // 提醒用，讀不到就不提醒（例如後端還沒部署新版）
  ]);
  state.cards = cards;
  state.today = today;
  state.tests = tests;
  await loadQuestions();
  render();
};

// 理解題在 cards.json 的短文卡上；前端直接讀檔（後端不用改），讀不到就沒有理解題，不影響練習
async function loadQuestions() {
  if (Object.keys(state.questions).length) return;
  try {
    const res = await fetch("data/cards.json", { cache: "no-cache" });
    const data = await res.json();
    (data.stages || []).forEach(st => st.cards.forEach(c => { if (c.questions && c.questions.length) state.questions[c.id] = c.questions; }));
  } catch (err) { /* 沒有理解題而已 */ }
}

function render() {
  document.getElementById("todayLine").textContent = toDateStr(new Date());
  ["home", "session", "library"].forEach(v => document.getElementById(v + "View").classList.toggle("hidden", state.view !== v));
  document.getElementById("tabBar").classList.toggle("hidden", state.view === "session");
  document.querySelectorAll("#tabBar [data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === (state.view === "library" ? "library" : "home")));
  if (state.view === "home") { renderHome(); renderRetestHint(); }
  if (state.view === "session") {
    document.querySelectorAll(".lingo-mode").forEach(b => b.classList.toggle("active", b.dataset.mode === state.mode));
    renderCard();
  }
  if (state.view === "library") renderList();
}

function resetInputs() {
  ["copyInput", "recallInput"].forEach(id => { document.getElementById(id).value = ""; });
  ["copyResult", "recallResult"].forEach(id => { const r = document.getElementById(id); r.textContent = ""; r.className = "lingo-copy-result"; });
}

function goView(v) {
  resetInputs();
  state.view = v;
  state.revealed = false;
  state.dictate = false;
  state.peek = false;
  render();
  window.scrollTo(0, 0);
}

// 今日：每個語言一張進度卡，顯示各類型的進度；排好的清單才有數字
function planSummary(lang) {
  const plan = planOf(lang);
  const n = { review: [0, 0], word: [0, 0], sentence: [0, 0], passage: [0, 0] };
  plan.forEach(e => {
    const c = state.cards.find(x => x.id === e.cardId);
    const k = e.review ? "review" : (c && n[c.type] ? c.type : "word");
    n[k][1]++;
    if (e.done) n[k][0]++;
  });
  const names = { word: "單字", sentence: "例句", passage: "短文", review: "複習" };
  const line = Object.keys(names).filter(k => n[k][1]).map(k => `${names[k]} ${n[k][0]}/${n[k][1]}`).join("　");
  return { total: plan.length, done: plan.filter(e => e.done).length, line };
}

async function startSession(lang, more) {
  state.lang = lang;
  localStorage.setItem("lingo_lang", lang);
  try {
    if (!planOf(lang).length || more) state.today = await api("drawPlan", { date: toDateStr(new Date()), lang, more: more ? "1" : "" });
  } catch (err) {
    setStatus("排今天的卡失敗：" + err.message, true);
    return false;
  }
  const plan = planOf(lang);
  if (!plan.length) return false;
  state.cardId = (plan.find(e => !e.done) || plan[0]).cardId;
  goView("session");
  return true;
}

function renderHome() {
  const wrap = document.getElementById("homeCards");
  wrap.replaceChildren();
  ["en", "ja"].forEach(lang => {
    const sum = planSummary(lang);
    const has = state.cards.some(c => c.lang === lang);
    const allDone = sum.total > 0 && sum.done === sum.total;
    const box = el("section", "card lingo-goal");
    const row = el("div", "lingo-goal-row");
    row.append(el("h2", "", LANG_NAME[lang]), el("span", "lingo-goal-state" + (allDone ? " done" : ""), !sum.total ? "還沒開始" : allDone ? "✓ 今天完成了" : "進行中"));
    box.appendChild(row);
    box.appendChild(el("p", "lingo-goal-line", sum.total ? sum.line : (has ? "按開始，排今天的卡" : "還沒有內容")));
    const bar = el("div", "lingo-bar");
    const fill = el("i");
    fill.style.width = sum.total ? Math.round(sum.done / sum.total * 100) + "%" : "0%";
    bar.appendChild(fill);
    box.append(bar, el("p", "lingo-goal-count", sum.total ? `今日 ${sum.done} / ${sum.total}` : "今日 0 / 0"));
    const btn = el("button", allDone ? "ghost-btn" : "", !has ? "到內容庫新增" : allDone ? "再看一次" : sum.total ? "繼續練習" : "開始練習");
    btn.type = "button";
    btn.addEventListener("click", async () => {
      if (!has) { goView("library"); return; }
      btn.disabled = true;
      await startSession(lang, false);
      btn.disabled = false;
    });
    box.appendChild(btn);
    if (allDone) {
      const more = el("button", "", "再來一輪");
      more.type = "button";
      more.addEventListener("click", async () => {
        more.disabled = true;
        await startSession(lang, true);
        more.disabled = false;
      });
      box.appendChild(more);
    }
    wrap.appendChild(box);
  });
}

// 距離上次這個語言的程度小考超過 8 週，就在頂端提醒一句（沒考過不提醒）
const RETEST_AFTER_DAYS = 56;
const LANG_CN = { en: "英文", ja: "日文" };
function renderRetestHint() {
  const box = document.getElementById("retestHint");
  const today = new Date(toDateStr(new Date()) + "T00:00:00");
  const due = [state.lang, state.lang === "en" ? "ja" : "en"].map(lang => {
    const last = state.tests.filter(t => t.lang === lang).pop();
    const days = last ? Math.floor((today - new Date(last.date + "T00:00:00")) / 86400000) : 0;
    return last && days >= RETEST_AFTER_DAYS ? { lang, days } : null;
  }).filter(Boolean)[0];
  box.classList.toggle("hidden", !due);
  if (!due) return;
  box.textContent = `距離上次${LANG_CN[due.lang] || ""}程度小考已經 ${Math.floor(due.days / 7)} 週了，要不要重考看看進步？ `;
  const a = document.createElement("a");
  a.href = "placement.html";
  a.textContent = "去考試";
  box.appendChild(a);
}

function renderCard() {
  const card = currentCard();
  const hasAny = state.cards.some(c => c.lang === state.lang);
  document.getElementById("cardEmpty").classList.toggle("hidden", hasAny);
  document.getElementById("cardBody").classList.toggle("hidden", !hasAny);
  document.getElementById("actionsBar").classList.toggle("hidden", !hasAny);
  document.getElementById("sessionTitle").textContent = LANG_NAME[state.lang];
  if (!hasAny) return;
  if (!card) { goView("home"); return; } // 清單裡找不到這張（例如隔天重新整理）
  const t = currentEntry();
  const done = !!t.done;
  const recall = state.mode === "recall";
  const copy = state.mode === "copy";
  const dictating = copy && state.dictate && !state.peek; // 聽寫：原文先遮住
  const typed = recall && card.type !== "passage";        // 背：看中文打外文（短文太長，維持先遮住答案再自評）
  const prompting = typed && !state.revealed;             // 還沒檢查：版面上放中文當題目
  const quizPending = (state.mode !== "recall") && quizUnfinished(card); // 有理解題的短文：答完題（或選擇略過）才顯示翻譯
  const hideAnswer = (recall && !state.revealed) || dictating || quizPending;

  document.querySelector(".lingo-card").classList.toggle("passage", card.type === "passage");
  document.getElementById("cardType").textContent = cardTypeText(card, t);
  document.getElementById("cardFront").textContent = dictating ? "？？？" : prompting ? card.back : card.front;
  document.getElementById("cardReading").textContent = hideAnswer ? "" : (card.reading || ""); // 背：讀音（羅馬拼音／音標）也先遮住
  document.getElementById("cardBack").textContent = card.back;
  document.getElementById("cardNote").textContent = card.note || "";
  document.getElementById("cardBackWrap").classList.toggle("hidden", hideAnswer);
  document.getElementById("recallBox").classList.toggle("hidden", !typed);
  document.getElementById("recallInput").readOnly = state.revealed;

  document.getElementById("speakRow").classList.toggle("hidden", !HAS_TTS);
  document.getElementById("sentBtn").classList.toggle("hidden", !exampleSentence(card) || prompting || dictating); // 整句例句裡有答案，題目階段不給

  const printLink = document.getElementById("printLink"); // 假名階段的卡才有描紅字帖（單字階段沒有）
  const kana = card.repo && card.lang === "ja" && KANA_STAGE.test(card.stage);
  printLink.classList.toggle("hidden", !kana);
  if (kana) printLink.href = `copybook.html?lang=ja&start=${encodeURIComponent(card.id)}`;
  document.getElementById("masteredWrap").classList.toggle("hidden", !card.repo); // 只有內建卡有階段／複習
  document.getElementById("masteredCheck").checked = !!t.mastered;

  renderQuiz(card, dictating);
  document.getElementById("copyBox").classList.toggle("hidden", !copy);
  const dictBtn = document.getElementById("dictBtn");
  dictBtn.classList.toggle("active", state.dictate);
  dictBtn.textContent = state.dictate ? (state.peek ? "聽寫：已顯示原文" : "聽寫：顯示原文") : "聽寫：只聽不看";

  // 底部操作：看／抄 → 完成；背 → 先顯示答案，再自評
  const revealBtn = document.getElementById("revealBtn");
  revealBtn.classList.toggle("hidden", !(recall && !state.revealed));
  revealBtn.textContent = typed ? "檢查答案" : "顯示答案";
  document.getElementById("ratingBox").classList.toggle("hidden", !(recall && state.revealed));
  const doneBtn = document.getElementById("doneBtn");
  doneBtn.classList.toggle("hidden", recall);
  doneBtn.textContent = done ? "✓ 這張已完成" : "✓ 完成這一張";
  doneBtn.disabled = done;
  const plan = planOf(state.lang);
  const idx = plan.findIndex(e => e.cardId === state.cardId);
  document.getElementById("sessionCount").textContent = `${idx + 1} / ${plan.length}`;
  document.getElementById("sessionBar").firstElementChild.style.width = Math.round(plan.filter(e => e.done).length / plan.length * 100) + "%";
  document.getElementById("navBox").classList.toggle("hidden", plan.length < 2);
  document.getElementById("prevBtn").disabled = idx <= 0;
  document.getElementById("nextBtn").disabled = idx >= plan.length - 1;
}

// 閱讀理解題：選項順序每張卡第一次顯示時隨機排好並記住（資料裡第一個選項是正解），作答後顯示對錯與中文解釋
function shuffled(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function quizUnfinished(card) {
  const qs = state.questions[card.id];
  if (!qs || state.skipQuiz[card.id]) return false;
  const st = state.quiz[card.id];
  return !st || st.picked.some(p => p < 0);
}

function renderQuiz(card, hidden) {
  const box = document.getElementById("quizBox");
  const qs = state.questions[card.id];
  const show = !!qs && !hidden;
  box.classList.toggle("hidden", !show);
  if (!show) return;
  if (box.dataset.cardId !== card.id) { box.dataset.cardId = card.id; box.open = false; }
  let st = state.quiz[card.id];
  if (!st) st = state.quiz[card.id] = { order: qs.map(q => shuffled(q.options.length)), picked: qs.map(() => -1) };
  const right = st.picked.filter((p, i) => p >= 0 && st.order[i][p] === qs[i].answer).length;
  const answered = st.picked.filter(p => p >= 0).length;
  document.getElementById("skipQuizBtn").classList.toggle("hidden", answered === qs.length || !!state.skipQuiz[card.id] || state.mode === "recall");
  document.getElementById("quizSummary").textContent = answered === qs.length ? `閱讀理解題（答對 ${right} / ${qs.length}）` : `閱讀理解題（${qs.length} 題）`;
  const body = document.getElementById("quizBody");
  body.replaceChildren();
  qs.forEach((q, qi) => {
    const wrap = el("div", "lingo-q");
    wrap.appendChild(el("p", "lingo-q-text", `${qi + 1}. ${q.q}`));
    const picked = st.picked[qi];
    st.order[qi].forEach((optIdx, pos) => {
      const b = el("button", "ghost-btn lingo-opt", q.options[optIdx]);
      b.type = "button";
      if (picked >= 0) {
        b.disabled = true;
        if (optIdx === q.answer) b.classList.add("right");
        else if (pos === picked) b.classList.add("wrong");
      }
      b.addEventListener("click", () => {
        st.picked[qi] = pos;
        if (st.picked.every(p => p >= 0)) saveQuiz(card.id, st.picked.filter((p, i) => st.order[i][p] === qs[i].answer).length, qs.length);
        renderCard(); // 答完最後一題後，翻譯會跟著顯示出來
      });
      wrap.appendChild(b);
    });
    if (picked >= 0) wrap.appendChild(el("p", "lingo-q-explain", (st.order[qi][picked] === q.answer ? "✓ " : "✗ ") + q.explain));
    body.appendChild(wrap);
  });
}

function saveQuiz(cardId, score, total) {
  try {
    const all = JSON.parse(localStorage.getItem("lingo_quiz") || "{}");
    all[cardId] = { score, total, date: toDateStr(new Date()) };
    localStorage.setItem("lingo_quiz", JSON.stringify(all));
  } catch (e) { /* 存不了就算了 */ }
}

// 英文單字卡備註裡的例句（整句唸）
function exampleSentence(card) {
  return card.lang === "en" && card.type === "word" && /^[A-Za-z]/.test(card.note || "") ? card.note : "";
}

// 唸：瀏覽器內建語音合成，音質看裝置；日文假名一行以空白分開，逐字唸
// 裝置沒有該語言的語音時，什麼聲音都不會出來，所以要明確提示（聲音清單載入可能要等一下，空的時候先試著唸）
const LANG_LABEL = { en: "英文", ja: "日文" };
function pickVoice(lang) {
  const want = TTS_LANG[lang].toLowerCase();
  const voices = window.speechSynthesis.getVoices();
  const norm = v => v.lang.replace("_", "-").toLowerCase();
  return { any: voices.length > 0, voice: voices.find(v => norm(v) === want) || voices.find(v => norm(v).startsWith(want.slice(0, 2))) || null };
}

function speak(text, lang, slow, split) {
  if (!HAS_TTS || !text) return;
  const synth = window.speechSynthesis;
  const { any, voice } = pickVoice(lang);
  if (any && !voice) {
    showToast(`這個裝置沒有${LANG_LABEL[lang]}語音，要先在系統設定新增`, { error: true });
    return;
  }
  const parts = split ? text.split(/\s+/).filter(Boolean) : [text];
  let started = false;
  const go = () => parts.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.onstart = () => { started = true; };
    u.lang = TTS_LANG[lang] || "en-US";
    if (voice) u.voice = voice;
    u.rate = slow ? 0.6 : 0.9;
    u.onerror = (e) => { if (e.error && e.error !== "canceled" && e.error !== "interrupted") showToast("發音失敗：" + e.error, { error: true }); };
    synth.speak(u);
  });
  // iPhone 要求在點擊當下就呼叫 speak，延遲會被擋掉，所以平常直接唸；只有正在唸的時候要先停，Chrome 對緊接著的 cancel→speak 會吃掉整段，這時才稍等一下
  if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(go, 60); } else go();
  if (synth.paused) synth.resume(); // 部分手機瀏覽器會卡在暫停狀態
  // 1.5 秒內沒開始唸，就告訴使用者可能的原因（語音數是 0 通常表示這個環境沒有語音引擎）
  setTimeout(() => {
    if (!started) showToast(`沒有聲音（語音 ${synth.getVoices().length} 個）。請檢查靜音開關和媒體音量，或改用 Safari／Chrome 開啟`, { error: true });
  }, 1500);
}

const KANA_STAGE = /^ja-\d+-(hiragana|katakana|dakuon|yoon)$/;
function speakCard(slow) {
  const card = currentCard();
  if (card) speak(card.front, card.lang, slow, KANA_STAGE.test(card.stage || "")); // 假名一行才逐字唸；句子與單字整段唸
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

// 換到清單裡的另一張（不會改清單）
function gotoCard(id) {
  state.cardId = id;
  state.revealed = false;
  state.dictate = false;
  state.peek = false;
  resetInputs();
  renderCard();
  window.scrollTo(0, 0);
}

// 清單裡前一張／後一張（不繞圈，第一張沒有前一張、最後一張沒有後一張）；回傳 "" 表示沒有
function stepCardId(dir) {
  const plan = planOf(state.lang);
  const e = plan[plan.findIndex(x => x.cardId === state.cardId) + dir];
  return e ? e.cardId : "";
}

function nextCardId(onlyUndone) {
  const plan = planOf(state.lang);
  const i = plan.findIndex(e => e.cardId === state.cardId);
  const order = plan.slice(i + 1).concat(plan.slice(0, i)); // 目前這張之後、繞一圈
  const pick = onlyUndone ? order.find(e => !e.done) : order[0];
  return pick ? pick.cardId : "";
}

document.querySelectorAll(".lingo-mode").forEach(b => b.addEventListener("click", () => {
  state.mode = b.dataset.mode;
  state.revealed = false;
  state.peek = false;
  resetInputs();
  render();
}));

document.querySelectorAll("#tabBar [data-view]").forEach(b => b.addEventListener("click", () => goView(b.dataset.view)));
document.getElementById("exitBtn").addEventListener("click", () => goView("home"));

document.getElementById("masteredCheck").addEventListener("change", async (e) => {
  const card = currentCard();
  if (!card) return;
  const box = e.target;
  // 勾了之後這張卡就不會再出現，隔天沒辦法再取消，所以勾選前先確認，避免誤觸
  if (box.checked && !(await showConfirm("確定完全記得這張了嗎？之後就不會再出現。"))) { box.checked = false; return; }
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

// 背：打的內容和答案比一下（不分大小寫、不計標點；日文也接受羅馬拼音），不對不擋，最後由你自評
document.getElementById("revealBtn").addEventListener("click", () => {
  const card = currentCard();
  if (card && state.mode === "recall" && card.type !== "passage") {
    const v = document.getElementById("recallInput").value.trim();
    const out = document.getElementById("recallResult");
    const ok = !!v && copyMatches(v, card, true);
    out.textContent = !v ? "沒有輸入，答案在上面" : ok ? "✓ 答對了" : "和答案不一樣，對照一下";
    out.className = "lingo-copy-result " + (ok ? "ok" : "bad");
  }
  state.revealed = true;
  renderCard();
});
document.getElementById("skipQuizBtn").addEventListener("click", () => {
  const card = currentCard();
  if (card) { state.skipQuiz[card.id] = true; renderCard(); }
});
document.getElementById("nextBtn").addEventListener("click", () => { const id = stepCardId(1); if (id) gotoCard(id); });
document.getElementById("prevBtn").addEventListener("click", () => { const id = stepCardId(-1); if (id) gotoCard(id); });

document.getElementById("speakBtn").addEventListener("click", () => speakCard(false));
document.getElementById("slowBtn").addEventListener("click", () => speakCard(true));
document.getElementById("sentBtn").addEventListener("click", () => {
  const card = currentCard();
  if (card) speak(exampleSentence(card), card.lang, false);
});

// 聽寫：開啟時隱藏原文並先播一次；再按一下顯示原文
document.getElementById("dictBtn").addEventListener("click", () => {
  if (state.dictate && !state.peek) { state.peek = true; renderCard(); return; }
  state.dictate = !state.dictate;
  state.peek = false;
  renderCard();
  if (state.dictate) speakCard(false);
});

// 抄：只做比對提示，不擋完成。日文也接受直接打羅馬拼音（還沒裝日文輸入法時用）
function copyMatches(typed, card, loose) {
  const norm = s => {
    const t = s.replace(/\s+/g, card.lang === "ja" ? "" : " ").trim(); // 日文的空白只是方便閱讀，打的時候有沒有空格都算對
    return loose ? t.toLowerCase().replace(/[.,!?;:'"。、！？]/g, "") : t;
  };
  if (norm(typed) === norm(card.front)) return true;
  return card.lang === "ja" && !!card.reading && norm(typed).toLowerCase() === norm(card.reading).toLowerCase();
}
document.getElementById("copyInput").addEventListener("input", (e) => {
  const card = currentCard();
  const out = document.getElementById("copyResult");
  if (!card || !e.target.value.trim()) { out.textContent = ""; out.className = "lingo-copy-result"; return; }
  const ok = copyMatches(e.target.value, card);
  out.textContent = ok ? "✓ 完全一致" : "還有不同的地方，再對照一下";
  out.className = "lingo-copy-result " + (ok ? "ok" : "bad");
  if (ok && state.dictate && !state.peek) { state.peek = true; renderCard(); } // 聽寫寫對了就揭曉原文
});

// 打卡成功就回到今日。背的自評（忘了／模糊／記得）先只記在這台裝置，之後後端改版再決定複習間隔
async function complete(rating) {
  const card = currentCard();
  const btns = document.querySelectorAll("#doneBtn, #ratingBox button");
  btns.forEach(b => { b.disabled = true; });
  try {
    state.today = await api("completeCard", { date: toDateStr(new Date()), lang: state.lang, id: state.cardId, mode: state.mode });
    if (rating && card) saveRating(card.id, rating);
    const next = nextCardId(true);
    if (next) { gotoCard(next); return; }
    showToast("今天的卡都練完了");
    goView("home");
  } catch (err) {
    setStatus("打卡失敗：" + err.message, true);
  } finally {
    btns.forEach(b => { b.disabled = false; }); // 不管成功或失敗都要恢復，否則下一輪進來按鈕還是停用的
    if (state.view === "session") renderCard();   // 完成鈕的停用與否由這張卡有沒有完成決定
  }
}

function saveRating(cardId, rating) {
  try {
    const all = JSON.parse(localStorage.getItem("lingo_ratings") || "{}");
    all[cardId] = { rating, date: toDateStr(new Date()) };
    localStorage.setItem("lingo_ratings", JSON.stringify(all));
  } catch (e) { /* 存不了就算了，不影響打卡 */ }
}

document.getElementById("doneBtn").addEventListener("click", () => complete(""));
document.querySelectorAll("#ratingBox [data-rate]").forEach(b => b.addEventListener("click", () => complete(b.dataset.rate)));

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
