# 承語（cheng-lingo）

每天練英文、日文的小工具，姊妹專案是 [cheng-daily](https://github.com/javle0317/cheng-daily)（兩邊完全獨立、不聯動）。
純靜態頁面（GitHub Pages）＋ 獨立的 Google Sheet / Apps Script 後端。

## 現在有的

### 每日練習（`index.html`）
- 畫面分四塊，底部分頁列切換：今日（英、日各一張進度卡）→ 練習（一張卡）、統計、內容庫；小考、字帖是分頁列上的連結。
- **已讀**：練習畫面底部的圓形打勾鈕，要**按住 0.6 秒**才會標記（短按只提示，避免誤觸），再按住一次取消；只有按了才算讀過，翻頁不算（`setCardDone`，存在 `Progress` 的 `done`）。「背」模式用自評按鈕（忘了／模糊／記得）標記。
- **統計**：近 14 天每天、分語言的「已讀／排定」張數，加上累積讀過的不重複卡片數與練習天數（`getStats`，從 `Progress` 算）。
- 每個語言每天排一份「今日清單」（`Code.gs` 的 `drawPlan_`）：每種類型（單字／例句／短文）各取一批新卡，再加 2 張複習；首頁顯示各類型進度，練完可以按「再來一輪」排下一批；練習畫面底部有「上一張／下一張」，可以回頭看跳過的卡。三種練習：看、背（看中文打外文，檢查後自評忘了／模糊／記得，自評先只存在這台裝置的 `lingo_ratings`；短文太長，維持先遮住答案再自評）、抄（打字默寫並比對；日文也接受打羅馬拼音；「聽寫」模式只播音不顯示原文，寫對才揭曉）。
- 🔊 發音用瀏覽器內建的語音合成（`speechSynthesis`），音質看裝置；日文假名一行逐字唸，英文單字卡另有「整句」唸備註裡的例句。
- 英文短文卡（`passage`）可以有 `questions`（閱讀理解題，每篇 3 題；題目、選項是英文，`explain` 是中文；資料裡第一個選項是正解，前端會隨機排，作答結果記在這台裝置的 `lingo_quiz`；「看」「抄」模式要答完題才顯示中文翻譯，也可以按「不做題，直接看翻譯」略過）。前端直接讀 `cards.json` 取題目，後端不用改。
- 內建內容放在 `data/cards.json`：日文 10 個階段（五十音：平假名 → 平假名單字 → 片假名 → 片假名單字 → 濁音 → 拗音；之後：招呼與常用語 → 數字與時間 → 旅遊單字 → 基本句型）、英文 15 個階段（見下）。要加內容：在 `stages` 最後面照格式加一段，push 即可，不用重新部署。
- **排卡規則**（`Code.gs`：`drawPlan_`、`pickNew_`、`pickReviews_`、`pickRandomMany_`）：
  - 階段可設 `after: "<階段 id>"`：那個階段每張卡都練完（或勾完全記得）才解鎖（日文基本句型用它，等旅遊單字練完才出現）。
  - 新卡：每種類型各自一條進度線，取該類型第一個還沒練完的階段，一次取 `DAILY`（單字 5、例句 3、短文 1；階段可以用 `perDay` 覆寫，日文假名階段是 2）張；`order: seq` 照順序、`random` 隨機。同類型的階段照 `cards.json` 的順序，前一個練完才輪到下一個（所以文法、單字、閱讀各走各的）。
  - 複習：每天另外加 `REVIEW_PER_DAY`（2）張「已完成過、最久沒練、沒勾完全記得」的舊卡，卡上標「・複習」；只在當天第一次排清單時加。
  - 階段都練完才改成隨機抽（`FALLBACK_COUNT` 張，14 天內抽過的盡量不重複，這時你自己新增的卡也會加入）。
  - 「再來一輪」只能在今天的卡都練完之後按（`drawPlan` 帶 `more=1`），不再加複習。
- **完全記得**：卡片下方的勾選框（勾之前會跳確認，因為勾了就不會再出現）。勾了之後不再複習、階段順序也跳過；存在 `Mastered` 分頁，取消勾選可還原。
- 內容庫：在頁面上新增、刪除自己的卡片（存在 `Cards` 分頁，只有階段全部練完後才會被抽到）。
- 假名卡下方有「🖨️ 印這一行的描紅字帖」（要接印表機才需要）。

### 英文內容
`data/cards.json` 的 `en-*` 階段，依英文程度小考的結果與學習目標（旅遊日常、運動：棒球、匹克球、工作）編排，先從「讀」開始。階段交錯：文法（V-ing / to V）→ 文法（間接問句）→ 文法（現在完成式）→ 旅遊單字 → 日常單字 → 旅遊閱讀 → 文法（條件句）→ 文法（情態動詞）→ 體育單字 → 體育閱讀 → 文法（關係子句）→ 文法（進階句型 B2）→ 工作單字 → 工作閱讀 → 文法（間接引述）（階段順序就是檔案裡的順序，id 的數字不代表順序）。旅遊單字 50 個、日常單字 20 個、體育單字 30 個、工作單字 50 個，旅遊、體育、工作閱讀各 10 篇，文法例句共 78 句。單字卡 `reading` 是音標、`note` 是例句；閱讀卡是 60–80 字短文（`passage`），`back` 是中文翻譯、`note` 是重點單字。

### 程度小考（`placement.html`，英文／日文，要登入）
選語言 → 從題庫抽題 → 計分與自動評語 → 自動記錄到 `TestResults` 分頁。頁面有歷次紀錄、等級折線圖、可收合的等級說明（CEFR／JLPT）；重考優先抽沒考過的題；距離上次同語言小考超過 8 週，首頁會提醒。
- 題庫：`data/placement/<lang>.json`（`levels` 由易到難、`skills`、`topics`、`blueprint` 每等級每題型抽幾題、`guide` 等級說明、`questions` 每題標主題；`options[answer]` 是正確答案，作答時才打亂）。英文 80 題庫每次抽 40 題（A1–C1）；日文 30 題（假名辨認＋N5／N4 單字、文法）。
- 規則：每等級答對 ≥ 60% 算過關，等級 = 最高的過關等級（容忍一次失手）；選「我不確定」算答錯。評語由 `placement-score.js` 的 `commentFor` 依「與上次比較、題型落差、答錯的主題」產生，另可自己補備註。
- 要加語言：新增一份題庫，並在 `placement.js` 的 `LANGS`、`HINTS`、`index.html` 的語言分頁、`lingo.js` 的 `LANG_NAME`、後端 `LANGS` 補上。

### 練字字帖（`copybook.html`，從 cheng-daily 搬來，不用登入、不呼叫後端）
只印淺灰色的描紅字，一張 A4 = 一週：中文直排（A4 橫向）、英文（A4 直向）、日文五十音（A4 直向，一個假名一行）。
- 內容：中文、英文在 `data/copybook.json`（`id | lang | title | author | text`，`text` 換行 = 一行／一句）；日文直接用 `data/cards.json` 裡 `order: "seq"` 的假名階段（每張卡 = 一行）。網址 `copybook.html?lang=ja&start=<卡片 id>` 從那一行開始排。
- 版面計算在 `copybook-layout.js`（純函式）。列印請選 A4、縮放 100%（不要「符合頁面」），建議用 Mac；紙張左上角有 10 cm 刻度可以量。

## Sheet 分頁（第一次寫入時由 `sheet_` 自動建立，名稱與欄位寫死、不能改名或調整順序）
| 分頁 | 欄位 | 用途 |
|---|---|---|
| `Cards` | id、lang、type、front、reading、back、note、createdAt | 自己新增的卡 |
| `Progress` | date、lang、cardId、done、mode、updatedAt | 每天抽到的卡與完成狀態 |
| `Mastered` | cardId、lang、updatedAt | 勾了「完全記得」的卡 |
| `TestResults` | id、date、lang、level、skills、correct、total、comment、note、asked、createdAt | 程度小考歷次結果 |

## 檢查（改了對應的檔案就跑；都不需要網路）
| 指令 | 檢查什麼 |
|---|---|
| `node scripts/cards-check.js` | `data/cards.json`：欄位放錯（英文卡正面要是英文、背面要有中文）、id 不重複 |
| `node scripts/placement-check.js` | 題庫格式、抽題、計分、評語 |
| `node scripts/backend-check.js` | `Code.gs` 的 TestResults 寫入／驗證／備註，以及前後端版本一致 |
| `node scripts/layout-check.js` | 字帖版面計算與字帖內容 |
| `node scripts/contrast-check.js` | `style.css` 色票的文字對比（WCAG ≥ 4.5） |

## 還沒做（依序）
1. 閱讀理解題（加進小考與閱讀卡），之後再加口說與寫作
2. 唸（TTS 發音）
3. 日文基礎單字／例句階段；日文短文／詩的字帖（五十音練好了再加）

## 配色與加到手機主畫面（全螢幕 App）
- 主題「墨綠・黃銅」：跟承日常同一套元件樣式，只換 `style.css` 最上面的色票（日間／夜間各一組，主色與底色偏墨綠；黃銅、磚紅沿用）。改色後跑 `contrast-check.js`。
- Safari 開 https://javle0317.github.io/cheng-lingo/ → 分享 → 加入主畫面。每頁 `<head>` 有 `apple-mobile-web-app-*`、`theme-color`（日夜各一）、`apple-touch-icon`、`manifest.webmanifest`；`style.css` 已用 `env(safe-area-inset-*)` 避開動態島與 Home 指示條。
- 圖示是 `icons/icon.svg`（象牙色底、墨綠印章「語」、黃銅細線）。承日常是藏青底＋磚紅印章的深色圖示，這個是明暗互換的淺色圖示。改圖示：改 svg 後跑 `sh scripts/make-icons.sh`（要本機 Chrome、要連網載入宋體）。**換圖示或名稱後要把主畫面舊的捷徑刪掉重新加**，iPhone 只在加入那一刻讀一次圖示。
- 全螢幕 App 的登入資料跟 Safari 分開，第一次要重新輸入密碼。

## 部署步驟
1. 新建一份 Google Sheet → 擴充功能 → Apps Script，貼上 `apps-script/Code.gs`
2. 專案設定 → 指令碼屬性，新增 `PASSWORD`（登入密碼）；`CARDS_URL`（`cards.json` 的網址）可不設，預設是 GitHub Pages 上的檔案
3. **授權外部連線**：在編輯器上方選函式 `authorize` 並按「執行」，授權「連線到外部服務」（後端要讀 GitHub Pages 上的 `cards.json`；沒授權會讀不到內建卡片，頁面上會跳出紅色提示）。授權後要再部署一次新版本
4. 部署 → 新增部署作業 → 網頁應用程式（執行身分：我；存取：所有人），複製網址貼到 `shared.js` 的 `WEBAPP_URL`
5. 之後每次改 `Code.gs` 都要「管理部署作業 → 編輯 → 新版本」，並同步更新 `BACKEND_VERSION` 與 `shared.js` 的 `BACKEND_MIN_VERSION`（`backend-check.js` 會檢查兩邊一致）
6. GitHub Pages：repo 設定 → Pages → `main` 分支根目錄（免費方案 repo 需公開）
7. 改了 `data/` 裡的 JSON：push 後等 Pages 部署（約 1–4 分鐘），後端的快取最久再 10 分鐘才會換成新內容（程度小考、字帖是前端直接讀，沒有後端快取）

## 開發
```sh
python3 -m http.server 8792   # 或用 .claude/launch.json 的 "cheng-lingo static"
sh scripts/install-hooks.sh   # commit 時自動更新 ?v= 快取版號（只在有改頂層 js/css 時）
```

localStorage 的 key 一律加 `lingo_` 前綴：同一個 github.io 網域下各專案共用 localStorage。
