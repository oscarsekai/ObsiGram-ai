# ObsiGram AI

<p align="center">
  <img src="assets/banner.png" alt="ObsiGram AI Concept" height="400">
</p>

[![Build Status](https://img.shields.io/github/actions/workflow/status/oscarsekai/ObsiGram-ai/ci.yml?branch=master)](https://github.com/oscarsekai/ObsiGram-ai/actions/workflows/ci.yml)
[![Coverage](https://img.shields.io/badge/coverage-84.02%25-yellowgreen)](coverage/lcov-report/index.html)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)


把你的 Telegram 當成 Obsidian 的收件匣。傳入任意網址或想法，ObsiGram AI 會自動抓取內容、依主題分類、生成結構化筆記，並補上 Graph View 連線，最後透過 Git 同步到你的 Vault。

底層透過 **ACP（Agent Client Protocol）** 呼叫外部 AI Agent（opencode），讓筆記生成邏輯完全可替換、可客製化。

## ✨ 亮點

- 📥 **多筆暫存**：連續丟多個 URL / 文字，一次整理成一篇完整筆記
- 🌐 **社群擷取**：Facebook、Instagram 走 Apify 專用流程；一般網頁走 Jina Reader
- 🗂️ **主題分類**：以語意推斷資料夾（frontend / backend / ai / idea …），
- 🕸️ **Graph View 連線**：自動在筆記中補上 `[[wiki-link]]` 與 MOC 節點連結，避免知識孤島
- 🔒 **安全寫檔**：路徑驗證，只能寫入 Vault 內部
- 🔄 **Git 自動同步**：寫檔後自動 add / commit / push
- 🔌 **ACP 架構**：透過 Agent Client Protocol 呼叫 opencode，AI 邏輯與 Bot 邏輯完全解耦
- 🎬 **YouTube 字幕擷取**：YouTube URL 自動跳過 Jina/Apify，由 AI 工具直接取得逐字稿，生成精準摘要筆記
- 🔍 **Vault 重複偵測**：筆記生成前自動搜尋 Vault，主題已存在時追加內容而非建立重複檔案

## 🚀 快速開始

### 1. 安裝依賴

```bash
git clone https://github.com/oscarsekai/ObsiGram-ai.git
cd ObsiGram-ai
npm install
```

### 2. 安裝 opencode CLI

ObsiGram AI 透過 [opencode](https://opencode.ai) 呼叫 AI Agent，需先全域安裝：

```bash
npm install -g opencode
```

安裝後確認可執行：

```bash
opencode --version
```

> opencode 需要有效的 AI Provider 設定（如 GitHub Copilot、OpenAI 等），請參考 [opencode 文件](https://opencode.ai/docs) 完成初始化。

### 3. 設定環境變數

```bash
cp .env.example .env.local
# 用編輯器填入必要欄位
```

### 4. 啟動 Bot

```bash
npm start        # 正式模式
npm run dev      # 開發模式（ts-node watch）
```

## ⚙️ 環境變數

必要：


| 變數                 | 說明                            |
| -------------------- | ------------------------------- |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather 產生的 Token |
| `ALLOWED_USER_ID`    | 允許使用的 Telegram 使用者 ID   |
| `VAULT_PATH`         | Obsidian Vault 的絕對路徑（同時供 `search_vault` 技能進行重複偵測） |

選用：


| 變數                  | 預設值                      | 說明                                            |
| --------------------- | --------------------------- | ----------------------------------------------- |
| `APIFY_TOKEN`         | —                          | 抓取 Facebook / Instagram 所需（需 Apify 帳號） |
| `OPENCODE_MODEL`      | `github-copilot/gpt-5-mini` | 筆記生成使用的 AI 模型                          |
| `OPENCODE_TIMEOUT_MS` | `120000`                    | opencode 呼叫逾時（ms）                         |
| `OPENCODE_ACP_PORT`   | `19999`                     | ACP Server 埠號（保留欄位）                     |

## 🏗️ 架構

ObsiGram AI 以 **ACP（Agent Client Protocol）** 為核心：Bot 本身只負責收訊、暫存、分類，AI 筆記生成全部委派給外部 Agent（opencode），兩層完全解耦。

```
┌─────────────────────────────────────────────┐
│  Telegram                                   │
│       ↓                                     │
│  ObsiGram AI  (ACP Client)                  │
│    handlers.ts  →  SessionBuffer            │
│       ↓  /aggregate                         │
│    aggregateFlow.ts                         │
│      classifyForPrompt  (語意分類)           │
│      buildVaultCatalog  (Vault 索引)         │
│      buildPrompt        (Prompt 注入)        │
│      enrichBufferItems  (YouTube 字幕)       │
│      getVaultSearchHint (重複偵測)           │
│       ↓  [tools/]                           │
│        get_youtube_transcript               │
│        search_vault                         │
│       ↓                                     │
│  opencode  (ACP Agent / AI)                 │
│    → 生成 Obsidian Markdown                 │
│       ↓                                     │
│    validateFilePath                         │
│    applyClassificationPathPolicy            │
│    enforceGraphConnections  (MOC 補強)       │
│    gitSync                                  │
│       ↓                                     │
│  Obsidian Vault  +  Git Repository          │
└─────────────────────────────────────────────┘
```

## 📋 完整工作流程

```
┌─────────────┐
│  使用者傳訊  │  文字 / URL / 多筆混合
└──────┬──────┘
       │
       ▼
┌─────────────────────┐
│  handlers.ts        │  抽出 URL，剩餘為純文字
│  jinaReader.ts      │  一般網頁 → Markdown
│  apifyFetcher.ts    │  FB / IG → 貼文內容
└──────┬──────────────┘
       │
       ▼
┌─────────────────────┐
│  SessionBuffer      │  每位使用者獨立暫存
└──────┬──────────────┘
       │  /aggregate 或按鈕
       ▼
┌─────────────────────────────────────────────┐
│  aggregateFlow.ts                           │
│  1. classifyForPrompt                       │  推斷 theme / note type / 候選資料夾
│  2. buildVaultCatalog                       │  生成 .obsigram/vault-catalog.md
│  3. buildPrompt                             │  注入分類訊號 + catalog hint
│  4. openCodeBridge.run  ← ACP              │  opencode run --agent build
│  5. validateFilePath                        │  安全路徑驗證
│  6. applyClassificationPathPolicy           │  模型落點不對時強制修正
│  7. enforceGraphConnections                 │  補強 [[wiki links]] / MOC 連線
│  8. gitSync                                 │  add / commit / push
└──────┬──────────────────────────────────────┘
       │
       ▼
┌─────────────────────┐
│  Obsidian Vault     │  寫入 .md，Graph View 可見連線
│  Git Repository     │  自動同步
└─────────────────────┘
```

## 🗂️ 分類策略

- 優先採用主題導向資料夾（`frontend` / `backend` / `workflow` / `data` / `ai` / `idea` …）
- `reference` 僅作備援，不是預設落點
- GitHub 連結不會強制等於 workflow，仍以內容語意判斷
- 若模型推斷出新主題，會自動補回候選清單
- 模型輸出路徑與分類政策衝突時，由 path policy 做二次修正

## 🕸️ Graph View 連線策略

- Prompt 要求輸出 `## 關聯地圖 (MOC)` 區塊
- `enforceGraphConnections` 在寫檔後依 catalog 語意補強 `[[wiki-link]]`
- 批次修復既有筆記連線：

```bash
npm run backfill:links -- /absolute/path/to/vault
```

## 📡 社群來源支援


| 平台      | 狀態      | 說明                                                                            |
| --------- | --------- | ------------------------------------------------------------------------------- |
| Facebook  | ✅ 啟用   | 使用 Apify`facebook-posts-scraper`                                              |
| Instagram | ✅ 啟用   | 使用 Apify`instagram-scraper`                                                   |
| Threads   | ⏸️ 暫停 | Apify 對應 Actor 需付費；如需啟用，可自行訂閱或在`apifyFetcher.ts` 加入自訂邏輯 |
| YouTube   | ✅ 啟用   | 使用 `youtube-transcript` 直接取得 CC 字幕，無需 Apify                         |
| Reddit    | ⏸️ 暫停 | 同上                                                                            |

## 💬 Telegram 指令


| 指令          | 說明               |
| ------------- | ------------------ |
| `/start`      | 顯示歡迎與使用說明 |
| `/help`       | 顯示指令列表       |
| `/buffer`     | 查看目前暫存內容   |
| `/delete <n>` | 刪除暫存第 n 筆    |
| `/clear`      | 清空暫存           |
| `/aggregate`  | 立即觸發整理流程   |

## 🛠️ 開發指令

```bash
npm install          # 安裝依賴
npm start            # 啟動 Bot
npm run dev          # 開發模式
npm test             # 執行測試
npm run test:coverage  # 測試 + 覆蓋率報告（門檻 80%）
npm run backfill:links -- /path/to/vault  # 批次補強 Graph 連線
```

## 📁 專案結構

```
src/
  index.ts             啟動點
  config.ts            環境變數載入與驗證
  bot/
    index.ts           Bot 初始化
    handlers.ts        訊息解析、URL 抽取
    aggregateFlow.ts   整理主流程（分類 → 生成 → 補強 → Git）
    __tests__/
  buffer/
    SessionBuffer.ts   使用者暫存佇列
    types.ts
    __tests__/
  fetcher/
    jinaReader.ts      一般網頁擷取（Jina Reader）
    apifyFetcher.ts    社群平台擷取（Apify）
    __tests__/
  acp/
    buildPrompt.ts     Prompt 組裝與 catalog hint 注入
    classifier.ts      主題 / note type 推斷
    vaultCatalog.ts    Vault 索引生成
    openCodeBridge.ts  ACP → opencode 呼叫
    vaultValidator.ts  路徑安全驗證
    prompts/
      obsidian-note-prompt.md  筆記生成 Prompt 模板
    __tests__/
  tools/
    youtubeTranscript.ts  YouTube 字幕擷取工具（ACP tool handler）
    searchVault.ts        Vault 重複偵測工具（ACP tool handler）
    __tests__/
  git/
    gitSync.ts         Git add / commit / push
    __tests__/
  scripts/
    backfillGraphLinks.ts  既有筆記 Graph 連線補強
```
