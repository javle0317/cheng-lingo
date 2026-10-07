# 承語（cheng-lingo）

每天練英文、日文的小工具，姊妹專案是 [cheng-daily](https://github.com/javle0317/cheng-daily)。
純靜態頁面（GitHub Pages）＋ 獨立的 Google Sheet / Apps Script 後端。

## 現在有的
- 每日抽一張卡（單字 / 例句 / 短文）
- 內建內容放在 `data/cards.json`（日文五十音共 6 個階段：平假名 → 平假名單字 → 片假名 → 片假名單字 → 濁音 → 拗音）。有階段的語言照階段順序抽，前一階段每張都完成過才進下一階段；階段都練完或沒有階段的語言（英文）則隨機抽，14 天內抽過的盡量不重複
- 三種練習：看、背（先遮住答案）、抄（打字默寫並比對）
- 內容庫：在頁面上新增、刪除自己的卡片（存在 Sheet 的 Cards 分頁，不參與階段抽卡）
- 從 cheng-daily 可用 `?card=<id>` 直接開到那張卡

## 還沒做（依序）
1. 部署後端並實測、手機實測 github.io
2. cheng-daily 的習慣連動（`drawLanguageCard` / `syncLanguageCard`），後端用 `LINGO_TOKEN` 呼叫這邊
3. 英文程度小測
4. 唸（TTS 發音）
5. 字帖（含日文）從 cheng-daily 搬過來

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
