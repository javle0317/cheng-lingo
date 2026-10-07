# 承語（cheng-lingo）

每天練英文、日文的小工具，姊妹專案是 [cheng-daily](https://github.com/javle0317/cheng-daily)。
純靜態頁面（GitHub Pages）＋ 獨立的 Google Sheet / Apps Script 後端。

## 現在有的
- 每日抽一張卡（單字 / 例句 / 短文）
- 內建內容放在 `data/cards.json`（日文五十音共 6 個階段：平假名 → 平假名單字 → 片假名 → 片假名單字 → 濁音 → 拗音）。有階段的語言照階段順序抽，前一階段每張都完成過才進下一階段；階段都練完或沒有階段的語言（英文）則隨機抽，14 天內抽過的盡量不重複
- 三種練習：看、背（先遮住答案）、抄（打字默寫並比對）
- 內容庫：在頁面上新增、刪除自己的卡片（存在 Sheet 的 Cards 分頁，不參與階段抽卡）
- 從 cheng-daily 可用 `?card=<id>` 直接開到那張卡

- 練字字帖（`copybook.html`，從 cheng-daily 搬來）：只印淺灰色的描紅字，一張 A4 = 一週。中文直排（A4 橫向）、英文（A4 直向）、日文五十音（A4 直向，一個假名一行、整行淡灰色的同一個假名）。純靜態、不用登入、不呼叫後端
  - 內容：中文、英文在 `data/copybook.json`（`id | lang | title | author | text`，`text` 的換行 = 一行／一句；改檔案 push 即生效）；日文直接用 `data/cards.json` 裡 `order: "seq"` 的假名階段（每張卡片 = 一行）
  - 抽卡頁的假名卡有「🖨️ 印這一行的描紅字帖」，網址 `copybook.html?lang=ja&start=<卡片 id>` 從那一行開始排
  - 版面計算在 `copybook-layout.js`（純函式），回歸檢查：`node scripts/layout-check.js`
  - 列印請選 A4、縮放 100%（不要「符合頁面」），建議用 Mac；紙張左上角有 10 cm 刻度可以量

## 還沒做（依序）
1. 部署後端並實測、手機實測 github.io
2. cheng-daily 的習慣連動（`drawLanguageCard` / `syncLanguageCard`），後端用 `LINGO_TOKEN` 呼叫這邊
3. 英文程度小測
4. 唸（TTS 發音）
5. 日文短文／詩的字帖（五十音練好了再加）

## 加到手機主畫面（全螢幕 App）
- Safari 開 https://javle0317.github.io/cheng-lingo/ → 分享 → 加入主畫面。每頁 `<head>` 有 `apple-mobile-web-app-*`、`theme-color`（日夜各一）、`apple-touch-icon`、`manifest.webmanifest`；`style.css` 已用 `env(safe-area-inset-*)` 避開動態島與 Home 指示條。
- 圖示是 `icons/icon.svg`（墨綠底、磚紅印章「語」、黃銅細線；跟承日常同一組配色，只換底色與字）。改圖示：改 svg 後跑 `sh scripts/make-icons.sh`（要本機 Chrome、要連網載入宋體）。**換圖示或名稱後要把主畫面舊的捷徑刪掉重新加**，iPhone 只在加入那一刻讀一次圖示。
- 全螢幕 App 的登入資料跟 Safari 分開，第一次要重新輸入密碼。

## 部署步驟
1. 新建一份 Google Sheet → 擴充功能 → Apps Script，貼上 `apps-script/Code.gs`
2. 專案設定 → 指令碼屬性，新增 `PASSWORD`（登入密碼）
3. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取：所有人），複製網址貼到 `shared.js` 的 `WEBAPP_URL`
4. 之後每次改 `Code.gs` 都要「管理部署作業 → 編輯 → 新版本」，並同步更新 `BACKEND_VERSION` 與 `shared.js` 的 `BACKEND_MIN_VERSION`
5. 內建內容在 `data/cards.json`，後端用 `UrlFetchApp` 讀 GitHub Pages 上的檔案（快取 10 分鐘，網址可用指令碼屬性 `CARDS_URL` 覆寫）。第一次部署新版要在 Apps Script 編輯器手動執行一次任一函式並授權「連線到外部服務」。`data/seed.json` 只是範例，可手動貼進 Cards 分頁
6. GitHub Pages：repo 設定 → Pages → `main` 分支根目錄（免費方案 repo 需公開）

## 開發
```sh
python3 -m http.server 8792
sh scripts/install-hooks.sh   # commit 時自動更新 ?v= 快取版號
```

localStorage 的 key 一律加 `lingo_` 前綴：同一個 github.io 網域下各專案共用 localStorage。
