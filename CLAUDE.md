# cheng-lingo（承語）

每天練英文、日文的小工具。純靜態頁面（GitHub Pages：https://javle0317.github.io/cheng-lingo/）+ 獨立的 Google Sheet / Apps Script 後端。姊妹專案是 `../cheng-daily`（承日常）。部署與功能清單見 README.md。

## 慣例（沿用 cheng-daily）
- 前端沒有框架與打包：`index.html` + `lingo.js` + `shared.js` + 樣式。每頁先定義 `window.loadPageData` 再呼叫 `initAuth()`。
- API 一律 POST（`Content-Type: text/plain`，避開 CORS 預檢），密碼放 body；寫入排隊依序送，`get*` 開頭的 action 才是讀取。
- 表單送出期間用 `setFormBusy` 鎖住整張表單。
- 使用者輸入存進 Sheet 前過 `safeText_`（以 `= + - @` 開頭會被當公式），讀出時 `unsafeText_`。
- localStorage key 一律加 `lingo_` 前綴（同一個 github.io 網域與其他專案共用）。
- 改了 js/css 要更新 HTML 的 `?v=`：pre-commit hook 會自動做（hook 不跟著 repo，新環境先跑 `sh scripts/install-hooks.sh`）；否則瀏覽器會用舊檔，登入時看起來像「密碼錯誤」。
- 改了 `apps-script/Code.gs`：要手動貼進 Apps Script、「管理部署作業 → 編輯 → 新版本」重新部署，並同步 `BACKEND_VERSION`（Code.gs）與 `BACKEND_MIN_VERSION`（shared.js）。
- 內建卡片內容在 `data/cards.json`（`stages` 依序；`order: seq` 照順序、`random` 隨機），由後端讀 GitHub Pages 上的檔案抽卡；Sheet 的 `Cards` 只放使用者自己新增的卡。改了 cards.json 要 push 後約 10 分鐘（快取）才生效。
- Sheet 分頁名稱 `Cards`、`Progress`、`Mastered`、`TestResults` 是程式寫死的，不能改名。

## 與 cheng-daily 的關係：不聯動
決議（2026-10-08）：兩個專案完全獨立，要帶的東西太多、太複雜。練習、進度、小考都只在 lingo；daily 的「語言練習」習慣只是一般的手動打卡，列上多一個「語」連結連到這裡。字帖頁從 daily 的「練字」習慣用「字」連結連過來。
- 兩邊後端不互相呼叫，也不共用密碼或 token。
- 當初為連動做的東西都已清掉（`LINGO_TOKEN` 驗證、`drawCard` 可省略 `lang`、`getToday` 的 `front`/`lang` 欄位、`?card=<id>`）。後端現在只認密碼。

## 字帖
`copybook.html`（`copybook.js`、`copybook-layout.js`）從 cheng-daily 搬來，內容在 `data/copybook.json`，日文五十音用 `data/cards.json` 的假名行；純靜態不登入。改版面常數看 `copybook-layout.js` 最上面，改完跑 `node scripts/layout-check.js`。

## 待辦
日文基礎單字／例句階段、日文短文／詩的字帖（五十音練好了再加）、唸（TTS）、閱讀理解題、口說與寫作（更後面）。學習目標：旅遊、工作、體育（棒球、匹克球）；聽說讀都重要，先從「讀」開始。
