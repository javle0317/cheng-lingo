// ====== 共用：設定、API、登入流程、提示與確認彈窗（從 cheng-daily 的 shared.js 精簡而來） ======
// 頁面要先定義 window.loadPageData（讀資料＋渲染），再呼叫 initAuth()。

// 部署 Apps Script 之後把 Web App 網址貼在這裡
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyN2j8iODdQvIgptJ0y33Zc_8kqv7HJX8zYpLLHW9xOpAnZaf5PvPVqR0j1c_0ctPld-Q/exec";

// 跟 cheng-daily 用不同的 key：同一個 github.io 網域下 localStorage 是共用的，不加前綴會互相覆蓋
const PASSWORD_KEY = "lingo_password";

// 前端需要的後端最低版本（Code.gs 的 BACKEND_VERSION）
const BACKEND_MIN_VERSION = "2026-10-07.3";
let backendWarned = false;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setStatus(msg, isError) {
  const el = document.getElementById("statusLine");
  el.textContent = msg || "";
  el.style.color = isError ? "var(--danger)" : "var(--text-dim)";
  if (isError && msg) showToast(msg, { error: true });
}

let toastTimer = null;
function showToast(msg, opts = {}) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.toggle("toast-error", !!opts.error);
  el.classList.remove("hidden");
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), opts.error ? 5000 : 1800);
}

// 送出期間整張表單鎖住，等後端回應完才能再操作（避免連點重複送出）
function setFormBusy(form, busy) {
  form.querySelectorAll("input, select, textarea, button").forEach(el => {
    if (busy) {
      el.dataset.wasDisabled = el.disabled ? "1" : "";
      el.disabled = true;
    } else {
      el.disabled = el.dataset.wasDisabled === "1";
      delete el.dataset.wasDisabled;
    }
  });
  const btn = form.querySelector('button[type="submit"]');
  if (!btn) return;
  if (busy) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "處理中…";
  } else if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
  }
}

// ====== API ======
async function apiRequest(action, params) {
  if (!WEBAPP_URL) throw new Error("尚未設定 WEBAPP_URL（shared.js）");
  const body = { action, password: localStorage.getItem(PASSWORD_KEY) || "" };
  Object.entries(params).forEach(([k, v]) => { body[k] = String(v); });
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // 避免 CORS 預檢，Apps Script 不處理 OPTIONS
    body: JSON.stringify(body),
  });
  const json = await res.json();
  window.backendVersion = json.v || "";
  if (document.getElementById("versionLine")) renderVersionLine();
  if (json.ok && !backendWarned && (!json.v || json.v < BACKEND_MIN_VERSION)) {
    backendWarned = true;
    showToast(`⚠️ 後端不是最新版：目前 ${json.v || "舊版"}，需要 ${BACKEND_MIN_VERSION}。請貼上最新的 Code.gs 並重新部署新版本。`, { error: true });
  }
  if (!json.ok) throw new Error(json.error || "unknown error");
  return json.data;
}

// 寫入一個接一個送，回應照操作順序到達；讀取（get 開頭）不排隊
let writeChain = Promise.resolve();
function api(action, params = {}) {
  if (action.startsWith("get")) return apiRequest(action, params);
  const run = writeChain.then(() => apiRequest(action, params));
  writeChain = run.catch(() => {});
  return run;
}

// ====== 登入流程 ======
function showLockScreen(errorMsg) {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("lockScreen").classList.remove("hidden");
  document.getElementById("lockLoading").classList.add("hidden");
  document.getElementById("lockForm").classList.remove("hidden");
  document.getElementById("lockError").textContent = errorMsg || "";
}

function showLockLoading() {
  document.getElementById("app").classList.add("hidden");
  document.getElementById("lockScreen").classList.remove("hidden");
  document.getElementById("lockForm").classList.add("hidden");
  document.getElementById("lockLoading").classList.remove("hidden");
}

function showApp() {
  document.getElementById("lockScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  renderVersionLine();
}

function renderVersionLine() {
  const status = document.getElementById("statusLine");
  if (!status) return;
  let el = document.getElementById("versionLine");
  if (!el) {
    el = document.createElement("p");
    el.id = "versionLine";
    el.className = "version-line";
    status.insertAdjacentElement("afterend", el);
  }
  const me = [...document.scripts].find(sc => /shared\.js/.test(sc.src));
  const m = me && me.src.match(/[?&]v=(\d+)/);
  el.textContent = `版本　前端 ${m ? m[1] : "?"}　後端 ${window.backendVersion || "…"}`;
}

async function tryUnlock(password) {
  localStorage.setItem(PASSWORD_KEY, password);
  const form = document.getElementById("lockForm");
  setFormBusy(form, true);
  try {
    await window.loadPageData();
    showApp();
    setStatus("已連上 Google Sheet");
  } catch (err) {
    localStorage.removeItem(PASSWORD_KEY);
    showLockScreen("密碼錯誤，或無法連線，請再試一次");
  } finally {
    setFormBusy(form, false);
  }
}

function initAuth() {
  const saved = localStorage.getItem(PASSWORD_KEY);
  if (saved) {
    showLockLoading();
    tryUnlock(saved);
  } else {
    showLockScreen();
  }
}

document.getElementById("lockForm").addEventListener("submit", (e) => {
  e.preventDefault();
  tryUnlock(document.getElementById("passwordInput").value);
});

document.getElementById("logoutBtn").addEventListener("click", () => {
  localStorage.removeItem(PASSWORD_KEY);
  location.reload();
});

// ====== 確認彈窗 ======
let dialogResolve = null;

function showConfirm(message) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    document.getElementById("dialogMessage").textContent = message;
    document.getElementById("dialogModal").classList.remove("hidden");
  });
}

function resolveDialog(ok) {
  document.getElementById("dialogModal").classList.add("hidden");
  if (dialogResolve) dialogResolve(ok);
  dialogResolve = null;
}

document.getElementById("dialogOkBtn").addEventListener("click", () => resolveDialog(true));
document.getElementById("dialogCancelBtn").addEventListener("click", () => resolveDialog(false));
document.getElementById("dialogModal").addEventListener("click", (e) => {
  if (e.target.id === "dialogModal") resolveDialog(false);
});
