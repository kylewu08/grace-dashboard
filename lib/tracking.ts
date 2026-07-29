// ─────────────────────────────────────────────────────────────
// 驗貨追蹤 (Inspection) + 客訴追蹤 (Complaint)
// 完全獨立的資料層：只「引用」現有的 getSheets()，不修改 sheets.ts。
// 只操作專屬的 4 張分頁，絕不碰 Tasks / Orders / Config。
// 若要移除這兩個功能：刪掉本檔 + 對應 API 路由 + 前端元件即可，既有功能無損。
// ─────────────────────────────────────────────────────────────
import { getSheets } from './sheets'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

function fmt(val: unknown): string {
  if (!val) return ''
  const s = String(val)
  // 已是 YYYY-MM-DD 就直接用，否則嘗試解析
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toISOString().split('T')[0]
}

// ─── Types ───────────────────────────────────────────────

export interface InspectionLog {
  id: string
  inspectionId: string
  date: string
  inspector: string
  result: string   // 驗貨中 / 通過放行 / 不通過需複驗 / 不通過退回報廢
  problem: string
}

export interface Inspection {
  id: string
  orderNo: string
  linkedTaskId: string   // 連動的 PO 任務 ID（未來關聯設計用）；手動輸入則為空
  customerCode: string
  factoryCode: string
  customerPO: string
  scNumber: string
  note: string
  createdDate: string
  logs: InspectionLog[]
}

export interface ComplaintLog {
  id: string
  complaintId: string
  date: string
  owner: string
  action: string
}

export interface Complaint {
  id: string
  customerCode: string
  content: string
  severity: string   // High / Mid / Low
  owner: string      // B / L / G
  dueDate: string
  closedDate: string
  createdDate: string
  note: string
  logs: ComplaintLog[]
}

const HEADERS: Record<string, string[]> = {
  Inspections:    ['ID','OrderNo','LinkedTaskId','CustomerCode','FactoryCode','CustomerPO','SCNumber','Note','CreatedDate'],
  InspectionLogs: ['ID','InspectionId','Date','Inspector','Result','Problem'],
  Complaints:     ['ID','CustomerCode','Content','Severity','Owner','DueDate','ClosedDate','Note','CreatedDate'],
  ComplaintLogs:  ['ID','ComplaintId','Date','Owner','Action'],
}

// ─── Sheet init（只建立缺少的專屬分頁）─────────────────────────

export async function ensureTrackingSheets() {
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = meta.data.sheets?.map(s => s.properties?.title) ?? []
  const toCreate = Object.keys(HEADERS).filter(n => !existing.includes(n))
  if (toCreate.length === 0) return
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: toCreate.map(title => ({ addSheet: { properties: { title } } })) },
  })
  for (const title of toCreate) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: `${title}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [HEADERS[title]] },
    })
  }
}

// ─── 共用小工具 ───────────────────────────────────────────

async function findRow(sheet: string, id: string): Promise<number> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheet}!A:A` })
  const rows = res.data.values ?? []
  const idx = rows.findIndex(r => String(r[0]) === id)
  return idx // 0-based（含標題列），-1 = 找不到
}

async function getSheetId(title: string): Promise<number | undefined> {
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  return meta.data.sheets?.find(s => s.properties?.title === title)?.properties?.sheetId ?? undefined
}

// 依「某欄位等於某值」刪除多列（例如刪主卡時一併刪其所有時間軸）
async function deleteRowsWhere(sheet: string, colIdx: number, value: string) {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${sheet}!A:Z` })
  const rows = res.data.values ?? []
  const targets: number[] = []
  rows.forEach((r, i) => { if (i > 0 && String(r[colIdx]) === value) targets.push(i) })
  if (targets.length === 0) return
  const sheetId = await getSheetId(sheet)
  // 由下往上刪，避免 index 位移
  const requests = targets.sort((a, b) => b - a).map(i => ({
    deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: i, endIndex: i + 1 } },
  }))
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: SHEET_ID, requestBody: { requests } })
}

async function deleteRowById(sheet: string, id: string) {
  const idx = await findRow(sheet, id)
  if (idx < 0) return
  const sheetId = await getSheetId(sheet)
  await getSheets().spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: idx, endIndex: idx + 1 } } }] },
  })
}

// ─── Inspections ─────────────────────────────────────────

export async function getInspections(): Promise<Inspection[]> {
  await ensureTrackingSheets()
  const sheets = getSheets()
  const [insRes, logRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Inspections!A2:I' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'InspectionLogs!A2:F' }),
  ])
  const logs: InspectionLog[] = (logRes.data.values ?? []).map(r => ({
    id: String(r[0] ?? ''), inspectionId: String(r[1] ?? ''), date: fmt(r[2]),
    inspector: String(r[3] ?? ''), result: String(r[4] ?? ''), problem: String(r[5] ?? ''),
  })).filter(l => l.id)
  const logsByCard: Record<string, InspectionLog[]> = {}
  logs.forEach(l => { (logsByCard[l.inspectionId] || (logsByCard[l.inspectionId] = [])).push(l) })
  Object.values(logsByCard).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)))
  return (insRes.data.values ?? []).map(r => ({
    id: String(r[0] ?? ''), orderNo: String(r[1] ?? ''), linkedTaskId: String(r[2] ?? ''),
    customerCode: String(r[3] ?? ''), factoryCode: String(r[4] ?? ''),
    customerPO: String(r[5] ?? ''), scNumber: String(r[6] ?? ''),
    note: String(r[7] ?? ''), createdDate: fmt(r[8]),
    logs: logsByCard[String(r[0] ?? '')] ?? [],
  })).filter(i => i.id)
}

export async function addInspection(d: Partial<Inspection>) {
  const id = uid()
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Inspections!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, d.orderNo ?? '', d.linkedTaskId ?? '', d.customerCode ?? '',
      d.factoryCode ?? '', d.customerPO ?? '', d.scNumber ?? '', d.note ?? '', d.createdDate || fmt(new Date())]] },
  })
  return id
}

export async function updateInspection(id: string, d: Partial<Inspection>) {
  const idx = await findRow('Inspections', id)
  if (idx < 0) throw new Error('Inspection not found')
  const row = idx + 1
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `Inspections!B${row}:H${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[d.orderNo ?? '', d.linkedTaskId ?? '', d.customerCode ?? '',
      d.factoryCode ?? '', d.customerPO ?? '', d.scNumber ?? '', d.note ?? '']] },
  })
}

export async function deleteInspection(id: string) {
  await deleteRowsWhere('InspectionLogs', 1, id) // 先刪所有時間軸
  await deleteRowById('Inspections', id)
}

export async function addInspectionLog(d: Partial<InspectionLog>) {
  const id = uid()
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'InspectionLogs!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, d.inspectionId ?? '', d.date || fmt(new Date()),
      d.inspector ?? '', d.result ?? '', d.problem ?? '']] },
  })
  return id
}

export async function deleteInspectionLog(id: string) {
  await deleteRowById('InspectionLogs', id)
}

// ─── Complaints ──────────────────────────────────────────

export async function getComplaints(): Promise<Complaint[]> {
  await ensureTrackingSheets()
  const sheets = getSheets()
  const [cRes, logRes] = await Promise.all([
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Complaints!A2:I' }),
    sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'ComplaintLogs!A2:E' }),
  ])
  const logs: ComplaintLog[] = (logRes.data.values ?? []).map(r => ({
    id: String(r[0] ?? ''), complaintId: String(r[1] ?? ''), date: fmt(r[2]),
    owner: String(r[3] ?? ''), action: String(r[4] ?? ''),
  })).filter(l => l.id)
  const logsByCard: Record<string, ComplaintLog[]> = {}
  logs.forEach(l => { (logsByCard[l.complaintId] || (logsByCard[l.complaintId] = [])).push(l) })
  Object.values(logsByCard).forEach(arr => arr.sort((a, b) => a.date.localeCompare(b.date)))
  return (cRes.data.values ?? []).map(r => ({
    id: String(r[0] ?? ''), customerCode: String(r[1] ?? ''), content: String(r[2] ?? ''),
    severity: String(r[3] ?? ''), owner: String(r[4] ?? ''), dueDate: fmt(r[5]),
    closedDate: fmt(r[6]), note: String(r[7] ?? ''), createdDate: fmt(r[8]),
    logs: logsByCard[String(r[0] ?? '')] ?? [],
  })).filter(c => c.id)
}

export async function addComplaint(d: Partial<Complaint>) {
  const id = uid()
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Complaints!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, d.customerCode ?? '', d.content ?? '', d.severity ?? '',
      d.owner ?? '', d.dueDate ?? '', d.closedDate ?? '', d.note ?? '', d.createdDate || fmt(new Date())]] },
  })
  return id
}

export async function updateComplaint(id: string, d: Partial<Complaint>) {
  const idx = await findRow('Complaints', id)
  if (idx < 0) throw new Error('Complaint not found')
  const row = idx + 1
  await getSheets().spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `Complaints!B${row}:H${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[d.customerCode ?? '', d.content ?? '', d.severity ?? '',
      d.owner ?? '', d.dueDate ?? '', d.closedDate ?? '', d.note ?? '']] },
  })
}

export async function deleteComplaint(id: string) {
  await deleteRowsWhere('ComplaintLogs', 1, id)
  await deleteRowById('Complaints', id)
}

export async function addComplaintLog(d: Partial<ComplaintLog>) {
  const id = uid()
  await getSheets().spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'ComplaintLogs!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, d.complaintId ?? '', d.date || fmt(new Date()), d.owner ?? '', d.action ?? '']] },
  })
  return id
}

export async function deleteComplaintLog(id: string) {
  await deleteRowById('ComplaintLogs', id)
}
