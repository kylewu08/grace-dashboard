# Grace 任務戰情儀表板 — 架構說明

## 專案概述

訂單狀態管理與任務進度戰情儀表板。以 Google Sheets 作為資料庫，Next.js 作為前後端框架，部署於 Vercel。

- **線上網址**：https://grace-dashboard-one.vercel.app/
- **GitHub**：https://github.com/kylewu08/grace-dashboard
- **資料庫（Google Sheet）**：ID `1jb_pexbr6KYLrGJDYuQi6zQLKt_E6c4PB6yBzpSMcYc`

---

## 技術棧

| 項目 | 版本 |
|------|------|
| Next.js | 16.2.7（App Router） |
| React | 19 |
| TypeScript | 5 |
| Tailwind CSS | 4 |
| googleapis | 173（Google Sheets API v4） |

---

## 資料夾結構

```
dashboard/
├── app/
│   ├── page.tsx              # 唯一前端頁面（全部 UI 在此）
│   ├── layout.tsx            # 根 layout
│   ├── globals.css           # 全域樣式（含 row-yellow/red/done）
│   └── api/
│       ├── tasks/route.ts    # GET/POST/PUT/DELETE 任務
│       ├── orders/route.ts   # GET/POST/PUT/DELETE 訂單（目前已合併至 tasks）
│       └── config/route.ts   # GET 自動完成清單（CustomerCode, FactoryCode）
├── lib/
│   └── sheets.ts             # 所有 Google Sheets 操作（核心邏輯）
├── .env.local                # 本機環境變數（不 commit）
└── ARCHITECTURE.md           # 本文件
```

---

## Google Sheets 結構

Sheet ID：`1jb_pexbr6KYLrGJDYuQi6zQLKt_E6c4PB6yBzpSMcYc`

### Tasks（主要資料表）

| 欄位 | 說明 |
|------|------|
| ID | 自動產生的唯一 ID（timestamp + random） |
| Date | 任務日期（YYYY-MM-DD） |
| Type | 類型：`訂單` / `詢價` / `Others` |
| Content | 任務內容描述 |
| CustomerCode | 客戶代碼（自動記憶） |
| FactoryCode | 工廠代碼（自動記憶） |
| CustomerPO | Customer PO# |
| SCNumber | SC# 內部單號 |
| Note | 備註 |
| Owner | 負責人：`B` / `L` / `G` |
| Status | 狀態（自由輸入，預設「處理中」） |
| CompletedDate | 完成日期（有值 = 已完成） |

> **訂單管理頁面**直接篩選 Tasks 裡 Type=「訂單」的資料，**不是獨立的 sheet**。

### Orders（目前保留但前端未使用）

最初設計的獨立訂單表，已改為直接用 Tasks sheet 的訂單類型資料。

### Config

| Type | Value |
|------|-------|
| CustomerCode | V009, K016, ... （輸入過的自動記憶） |
| FactoryCode | ST, MSF, ... （輸入過的自動記憶） |
| Holiday | 2026-01-01, ... （台灣國定假日） |

---

## 核心功能說明

### 工作天計算（`lib/sheets.ts` → `workingDays()`）
- 排除週六、週日
- 排除 Config sheet 裡的 Holiday 記錄
- 預設內建 2025～2026 台灣國定假日

### 延遲警告顏色
- **黃色**（`.row-yellow`）：未完成且 ≥ 3 工作天
- **紅色**（`.row-red`）：未完成且 ≥ 5 工作天
- **灰色刪除線**（`.row-done`）：已完成

### Autocomplete
- Customer Code 與 Factory Code 每次新增/編輯時自動寫入 Config sheet
- 前端用 HTML `<datalist>` 實作下拉建議

---

## 環境變數

```env
GOOGLE_SHEET_ID=1jb_pexbr6KYLrGJDYuQi6zQLKt_E6c4PB6yBzpSMcYc
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}  # 整個 JSON 壓成一行
```

- 本機：`.env.local`
- Vercel：Settings → Environment Variables

**服務帳號 email**：`grace-dashboard-sa@spring-monolith-498315-a9.iam.gserviceaccount.com`
（需要對 Google Sheet 有「編輯者」權限）

---

## 前端架構（`app/page.tsx`）

單一 Client Component，所有邏輯在同一個檔案。

### State
```ts
tasks: Task[]         // 從 /api/tasks 取得
orders: Order[]       // 從 /api/orders 取得（目前前端未直接使用）
config: Config        // CustomerCode、FactoryCode 清單
```

### 頁籤
- **儀表板**：KPI 卡片 → 待辦任務列表 → 每月完成率 + 詢價統計 → 已完成任務
- **訂單管理**：Owner KPI → 訂單列表（= tasks 裡 type=訂單）→ 每月完成數

### 任務列表分組邏輯
- 依 `date` 分組（由新到舊）
- 每個日期群組顯示進度條（已完成/總數）
- 日期列和資料列同在一個 `<table>` 裡（用 colSpan 分隔行），確保欄寬對齊

---

## API 路由

| 路由 | GET | POST | PUT | DELETE |
|------|-----|------|-----|--------|
| `/api/tasks` | 取全部 | 新增（body: Task） | 更新（body: {id, ...Task}） | 刪除（body: {id}） |
| `/api/orders` | 取全部 | 新增 | 更新 | 刪除 |
| `/api/config` | 取 codes | — | — | — |

---

## 部署流程

```bash
# 本機開發
npm run dev         # http://localhost:3000

# 部署（推上去 Vercel 自動部署）
git add .
git commit -m "feat/fix: 說明"
git push
```

Vercel 收到 push 後約 1-2 分鐘自動更新線上版本。

---

## 已知限制與未來可擴充方向

- 目前 Owner 固定為 B / L / G，如需新增需修改 `page.tsx` 的 select options
- 台灣國定假日需手動更新 Config sheet（或直接修改 `lib/sheets.ts` 的 `TW_HOLIDAYS` 陣列）
- Orders sheet 目前保留但前端未使用，未來可考慮移除或重新啟用
- 尚未做身份驗證，任何有連結的人都能看到與編輯（未來可加 NextAuth）
