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
- Sheet 分頁名稱 `Cards`、`Progress` 是程式寫死的，不能改名。

## 與 cheng-daily 的連動（進行中）
決議：練習在 lingo 做，daily 的習慣列只顯示今天抽到的卡片、「去練習 →」連結（`?card=<id>`）與完成狀態。
- lingo 後端已接受 `password` 或 `token`（指令碼屬性 `LINGO_TOKEN`，尚未設定）兩種驗證；daily 後端以 token 呼叫，密碼不經瀏覽器。
- lingo 已有 action：`getCards`、`getToday`、`addCard`、`deleteCard`、`drawCard`、`completeCard`。
- `drawCard` 的 `lang` 可省略（daily 用）：今天任何語言已有進度就回傳，否則在有卡片的語言裡隨機挑。`drawCard` / `getToday` 回傳 `{cardId, lang, front, done}`（BACKEND_VERSION 2026-10-07.2）。
- daily 端已寫好（`drawLanguageCard` / `syncLanguageCard`、習慣列 UI），待兩邊部署後連線驗證。
- 完整計畫：`~/.claude/plans/sideproject-cheng-daily-github-dazzling-catmull.md`。

## 待辦
英文程度小測、日文基礎單字／例句階段、唸（TTS）、字帖（含日文）從 cheng-daily 搬過來。
