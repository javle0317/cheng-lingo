// ====== 練字字帖頁（描紅：只印淺灰色的字，不畫格線）======
// 版面計算在 copybook-layout.js（純函式）；這裡負責資料、字型、畫面與列印。
// 中文／英文內容在 data/copybook.json；日文五十音從 data/cards.json 的假名階段（order: "seq"）取「行」。
// 網址 ?lang=zh|en&ids=id1,id2 可以重現同一頁；?lang=ja&start=<卡片 id> 從那一行開始排。
// 這一頁是純靜態、不用登入、不呼叫後端。

// 字型：中文霞鶩文楷 TC、日文 Klee One（楷書風教科書體）、英文 Andika（印刷體），都是 OFL 字型，從 Google Fonts 載入（中日文用 &text= 只載入當頁用到的字）。
// 字型名稱不能含雙引號（會塞進 SVG 屬性）。
const ZH_FONT = "'LXGW WenKai TC','Kaiti TC','BiauKai','STKaiti',serif";
const JA_FONT = "'Klee One','Hiragino Maru Gothic ProN','Yu Gothic',sans-serif";
const EN_FONT = "Andika,'Helvetica Neue',Arial,sans-serif";

const PREFS_KEY = "lingo_copybookPrefs";
const RECENT_KEY = "lingo_copybookRecent";

const state = { entries: [], jaRows: [], lang: "zh", ids: [], used: [], next: null, jaStart: 0 };

function loadPrefs() {
  try { return { gray: "medium", ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch (e) { return { gray: "medium" }; }
}
const prefs = loadPrefs();
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (e) { /* 存不了就只對這次有效 */ }
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "{}")[state.lang] || []; } catch (e) { return []; }
}
function addRecent(ids) {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) || "{}");
    all[state.lang] = [...ids, ...(all[state.lang] || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 20);
    localStorage.setItem(RECENT_KEY, JSON.stringify(all));
  } catch (e) { /* ignore */ }
}

const entriesOf = (lang) => state.entries.filter(e => e.lang === lang);
const byId = (id) => state.entries.find(e => e.id === id);

function setStatus(msg) { document.getElementById("statusLine").textContent = msg || ""; }

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`讀不到 ${path}（HTTP ${res.status}）`);
  return res.json();
}

// 假名行：cards.json 裡 lang=ja、order=seq 的階段，每張卡片 = 一行（front 以空白分隔每個假名，reading 同樣）
function jaRowsFrom(cardsJson) {
  const rows = [];
  (cardsJson.stages || []).filter(s => s.lang === "ja" && s.order === "seq").forEach(s => {
    s.cards.forEach(c => {
      const tokens = c.front.split(/\s+/).filter(Boolean);
      const readings = (c.reading || "").split(/\s+/).filter(Boolean);
      rows.push({ id: c.id, name: c.back, tokens, readings });
    });
  });
  return rows;
}

async function init() {
  try {
    const [copybook, cards] = await Promise.all([loadJson("data/copybook.json"), loadJson("data/cards.json")]);
    state.entries = copybook.entries || [];
    state.jaRows = jaRowsFrom(cards);
  } catch (err) {
    setStatus("載入失敗：" + err.message);
    return;
  }
  const q = new URLSearchParams(location.search);
  state.lang = ["en", "ja"].includes(q.get("lang")) ? q.get("lang") : "zh";
  state.ids = (q.get("ids") || "").split(",").filter(id => byId(id));
  const start = state.jaRows.findIndex(r => r.id === q.get("start"));
  state.jaStart = Math.max(0, start);
  buildJaOptions();
  syncControls();
  const fresh = state.lang !== "ja" && !state.ids.length;
  if (fresh) pickRandom();
  await rebuild();
  if (fresh) addRecent(state.used.map(u => u.id));
}

// ====== 取材：隨機，最近用過的排後面；整篇放得進一頁的排前面（一週的字帖不要從一首長詩的中間開始）======
function fitsOnPage(entry) {
  if (state.lang === "zh") return zhEntryColumns(zhClauses(entry.text), ZH_PAGE.ROWS) <= zhGeometry().sheetCols;
  const geo = enGeometry();
  return enWrap(enWords(entry.text), 0, geo.width, makeMeasure(geo.fontSize), 1e9).lines.length <= geo.lines;
}

function pickRandom() {
  const order = pickOrder(entriesOf(state.lang), getRecent());
  const fits = order.filter(fitsOnPage);
  state.ids = fits.concat(order.filter(e => !fits.includes(e))).map(e => e.id);
}

// ====== 字型 ======
function injectLink(id, href) {
  let el = document.getElementById(id);
  if (!el) { el = document.createElement("link"); el.id = id; el.rel = "stylesheet"; document.head.appendChild(el); }
  if (el.getAttribute("href") !== href) el.setAttribute("href", href);
}

async function ensureFont(lang, text) {
  try {
    if (lang === "zh" || lang === "ja") {
      const family = lang === "zh" ? "LXGW+WenKai+TC" : "Klee+One";
      const name = lang === "zh" ? "LXGW WenKai TC" : "Klee One";
      const chars = [...new Set(Array.from(text))].join("");
      injectLink("font" + lang, `https://fonts.googleapis.com/css2?family=${family}&display=block&text=${encodeURIComponent(chars)}`);
      await Promise.race([document.fonts.load(`16px '${name}'`, chars), new Promise(r => setTimeout(r, 8000))]);
    } else {
      injectLink("fontEn", "https://fonts.googleapis.com/css2?family=Andika:wght@400&display=block");
      await Promise.race([document.fonts.load("16px Andika"), new Promise(r => setTimeout(r, 8000))]);
    }
  } catch (e) { /* 載不到就用備援字型 */ }
}

// 用一個看不見的 SVG <text> 量寬度：跟最後畫出來的文字走同一套排版（單位 = mm），換行才不會超出右邊界
let measureText = null;
function makeMeasure(fontSizeMm) {
  if (!measureText) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "1");
    svg.setAttribute("height", "1");
    svg.setAttribute("class", "measure-svg");
    svg.style.cssText = "position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;visibility:hidden;";
    measureText = document.createElementNS(ns, "text");
    svg.appendChild(measureText);
    document.body.appendChild(svg);
  }
  measureText.setAttribute("font-family", EN_FONT);
  measureText.setAttribute("font-size", String(fontSizeMm));
  return (t) => { measureText.textContent = t; return measureText.getComputedTextLength(); };
}

// ====== 排版與畫面 ======
let buildToken = 0;
async function rebuild() {
  const token = ++buildToken;
  const host = document.getElementById("sheetHost");
  const empty = document.getElementById("practiceEmpty");
  const gray = PRACTICE_GRAYS[prefs.gray] || PRACTICE_GRAYS.medium;
  let svg, used, next, summary;

  if (state.lang === "ja") {
    empty.classList.toggle("hidden", state.jaRows.length > 0);
    if (!state.jaRows.length) { host.innerHTML = ""; setInfo("還沒有假名內容。"); return; }
    const geo = jaGeometry();
    const packed = packJaRows({ rows: state.jaRows, startIndex: state.jaStart, maxLines: geo.lines });
    used = packed.used;
    await ensureFont("ja", packed.lines.map(l => l.kana).join(""));
    if (token !== buildToken) return;
    svg = renderJaSvg({ lines: packed.lines, gray, header: jaHeader(used), fontFamily: JA_FONT });
    state.jaNext = packed.next; // 日文用 jaNext 翻頁，不會有「寫不完」的情況
    next = null;
    summary = `本頁 ${used.length} 行、${packed.lines.length} 個假名，每個寫 ${geo.cells} 遍。每天寫一行，可以寫 ${used.length} 天。`;
  } else {
    const list = entriesOf(state.lang);
    empty.classList.toggle("hidden", list.length > 0);
    if (!list.length) { host.innerHTML = ""; setInfo("這個語言還沒有內容。"); return; }
    const order = state.ids.map(byId).filter(e => e && e.lang === state.lang);

    if (state.lang === "zh") {
      const packed = packZhColumns({ entries: order, rows: ZH_PAGE.ROWS, maxCols: zhGeometry().sheetCols });
      used = packed.used; next = packed.next;
      const titles = {};
      used.forEach(u => { titles[u.id] = zhLabel(u.title); });
      await ensureFont("zh", Object.values(titles).join("") + packed.columns.map(c => c.chars.join("")).join(""));
      if (token !== buildToken) return;
      svg = renderZhSvg({ columns: packed.columns, titles, gray, fontFamily: ZH_FONT });
      const chars = packed.columns.reduce((n, c) => n + c.chars.length, 0);
      summary = `本頁 ${used.length} 篇、${packed.columns.length} 欄・${chars} 字。每天寫兩欄（約一首絕句），可以寫 ${Math.ceil(packed.columns.length / 2)} 天。`;
    } else {
      const geo = enGeometry();
      await ensureFont("en", "");
      if (token !== buildToken) return;
      const wrapped = wrapEnLines({ entries: order, maxLines: geo.lines, maxWidth: geo.width, measure: makeMeasure(geo.fontSize) });
      used = wrapped.used; next = wrapped.next;
      svg = renderEnSvg({ lines: wrapped.lines, gray, header: sourcesText(used, 2), fontFamily: EN_FONT });
      summary = `本頁 ${used.length} 篇、${wrapped.lines.length} 行。每天寫 3 行，可以寫 ${Math.ceil(wrapped.lines.length / 3)} 天。`;
    }
  }

  state.used = used;
  state.next = next;
  host.innerHTML = svg;
  const portrait = state.lang !== "zh";
  document.getElementById("pageStyle").textContent = `@page { size: A4 ${portrait ? "portrait" : "landscape"}; margin: 0; }`;
  document.body.classList.toggle("print-landscape", !portrait);
  document.body.classList.toggle("print-portrait", portrait);
  setInfo(summary + (next ? "　（這篇太長，一頁排不下，後半段沒有印出來。）" : ""));
  updateUrl();
}

// 頁首：「平假名　か行 さ行 た行 な行」（每行的全名太長，會蓋到左邊的 10cm 刻度）
function jaHeader(rows) {
  const parts = rows.map(r => r.name.split("・"));
  const script = parts[0] ? parts[0][0] : "";
  return script + "　" + parts.map(p => p.slice(1).join("・").replace(/（.*?）/g, "") || p[0]).join(" ");
}

function setInfo(t) { document.getElementById("practiceInfo").textContent = t; }

function updateUrl() {
  const q = new URLSearchParams({ lang: state.lang });
  if (state.lang === "ja") {
    if (state.jaRows[state.jaStart]) q.set("start", state.jaRows[state.jaStart].id);
  } else if (state.used.length) {
    q.set("ids", state.used.map(u => u.id).join(","));
  }
  try { history.replaceState(null, "", "?" + q.toString()); } catch (e) { /* ignore */ }
}

function buildJaOptions() {
  const sel = document.getElementById("jaStart");
  sel.replaceChildren();
  state.jaRows.forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = r.name;
    sel.appendChild(opt);
  });
}

function syncControls() {
  document.querySelectorAll(".practice-lang").forEach(b => b.classList.toggle("active", b.dataset.lang === state.lang));
  document.getElementById("optGray").value = prefs.gray;
  document.getElementById("jaStartWrap").classList.toggle("hidden", state.lang !== "ja");
  document.getElementById("jaStart").value = String(state.jaStart);
  document.getElementById("practiceShuffle").textContent = state.lang === "ja" ? "下一頁 →" : "🎲 重新抽";
}

// ====== 操作 ======
async function shuffle() {
  if (state.lang === "ja") {
    state.jaStart = state.jaNext ?? 0; // 到最後一頁再按就回到第一頁
    syncControls();
    await rebuild();
    return;
  }
  pickRandom();
  await rebuild();
  addRecent(state.used.map(u => u.id));
}
document.getElementById("practiceShuffle").addEventListener("click", shuffle);

document.querySelectorAll(".practice-lang").forEach(btn => {
  btn.addEventListener("click", async () => {
    state.lang = btn.dataset.lang;
    syncControls();
    if (state.lang === "ja") await rebuild(); // 日文：從目前選的那一行開始
    else await shuffle();
  });
});

document.getElementById("jaStart").addEventListener("change", async (e) => {
  state.jaStart = Number(e.target.value) || 0;
  await rebuild();
});

document.getElementById("optGray").addEventListener("change", async (e) => {
  prefs.gray = e.target.value;
  savePrefs();
  await rebuild();
});

document.getElementById("practicePrint").addEventListener("click", async () => {
  await rebuild(); // 確保字型載完、畫面是最新的再印
  window.print();
});

init();
