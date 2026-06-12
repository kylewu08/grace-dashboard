import { google } from 'googleapis'

const SHEET_ID = process.env.GOOGLE_SHEET_ID!

const TW_HOLIDAYS = [
  '2025-01-01','2025-01-27','2025-01-28','2025-01-29','2025-01-30','2025-01-31',
  '2025-02-28','2025-04-03','2025-04-04','2025-04-05','2025-05-01',
  '2025-05-30','2025-10-06','2025-10-10',
  '2026-01-01','2026-01-28','2026-01-29','2026-01-30','2026-01-31',
  '2026-02-01','2026-02-02','2026-02-28','2026-04-03','2026-04-05',
  '2026-05-01','2026-06-19','2026-09-19','2026-10-10',
]

export function getSheets() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON!
  const creds = JSON.parse(raw)
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

function fmt(val: unknown): string {
  if (!val) return ''
  const d = new Date(val as string)
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

function workingDays(startStr: string): number {
  if (!startStr) return 0
  const start = new Date(startStr)
  const end = new Date()
  let count = 0
  const cur = new Date(start)
  cur.setDate(cur.getDate() + 1)
  while (cur <= end) {
    const day = cur.getDay()
    const ds = cur.toISOString().split('T')[0]
    if (day !== 0 && day !== 6 && !TW_HOLIDAYS.includes(ds)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
}

// ─── Types ───────────────────────────────────────────────

export interface Task {
  id: string
  date: string
  type: string
  content: string
  customerCode: string
  factoryCode: string
  customerPO: string
  scNumber: string
  note: string
  owner: string
  status: string
  completedDate: string
  workingDays: number | null
}

export interface Order {
  id: string
  receivedDate: string
  content: string
  customerCode: string
  factoryCode: string
  customerPO: string
  scNumber: string
  owner: string
  status: string
  completedDate: string
  note: string
  workingDays: number | null
}

// ─── Sheet init ───────────────────────────────────────────

export async function ensureSheets() {
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = meta.data.sheets?.map(s => s.properties?.title) ?? []

  const toCreate = ['Tasks', 'Orders', 'Config'].filter(n => !existing.includes(n))
  if (toCreate.length === 0) return

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: toCreate.map(title => ({ addSheet: { properties: { title } } })),
    },
  })

  if (toCreate.includes('Tasks')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: 'Tasks!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [['ID','Date','Type','Content','CustomerCode','FactoryCode','CustomerPO','SCNumber','Note','Owner','Status','CompletedDate']] },
    })
  }
  if (toCreate.includes('Orders')) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: 'Orders!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [['ID','ReceivedDate','Content','CustomerCode','FactoryCode','CustomerPO','SCNumber','Owner','Status','CompletedDate','Note']] },
    })
  }
  if (toCreate.includes('Config')) {
    const holidayRows = TW_HOLIDAYS.map(h => ['Holiday', h])
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID, range: 'Config!A1',
      valueInputOption: 'RAW',
      requestBody: { values: [['Type','Value'], ...holidayRows] },
    })
  }
}

// ─── Tasks ────────────────────────────────────────────────

export async function getTasks(): Promise<Task[]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Tasks!A2:L' })
  return (res.data.values ?? []).map(r => {
    const completedDate = fmt(r[11])
    return {
      id: String(r[0] ?? ''), date: fmt(r[1]), type: String(r[2] ?? ''),
      content: String(r[3] ?? ''), customerCode: String(r[4] ?? ''),
      factoryCode: String(r[5] ?? ''), customerPO: String(r[6] ?? ''),
      scNumber: String(r[7] ?? ''), note: String(r[8] ?? ''),
      owner: String(r[9] ?? ''), status: String(r[10] ?? ''),
      completedDate,
      workingDays: !completedDate && r[1] ? workingDays(fmt(r[1])) : null,
    }
  }).filter(t => t.id)
}

export async function addTask(d: Omit<Task, 'id' | 'workingDays'>) {
  const sheets = getSheets()
  const id = uid()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Tasks!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, d.date, d.type, d.content, d.customerCode,
      d.factoryCode, d.customerPO, d.scNumber, d.note, d.owner,
      d.status || '處理中', d.completedDate ?? '']] },
  })
  await saveCode('CustomerCode', d.customerCode)
  await saveCode('FactoryCode', d.factoryCode)
  return id
}

export async function updateTask(id: string, d: Omit<Task, 'id' | 'workingDays'>) {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Tasks!A:A' })
  const rows = res.data.values ?? []
  const rowIdx = rows.findIndex(r => String(r[0]) === id)
  if (rowIdx < 0) throw new Error('Task not found')
  const row = rowIdx + 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `Tasks!B${row}:L${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[d.date, d.type, d.content, d.customerCode,
      d.factoryCode, d.customerPO, d.scNumber, d.note, d.owner,
      d.status || '處理中', d.completedDate ?? '']] },
  })
  await saveCode('CustomerCode', d.customerCode)
  await saveCode('FactoryCode', d.factoryCode)
}

export async function deleteTask(id: string) {
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === 'Tasks')?.properties?.sheetId
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Tasks!A:A' })
  const rows = res.data.values ?? []
  const rowIdx = rows.findIndex(r => String(r[0]) === id)
  if (rowIdx < 0) throw new Error('Task not found')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: {
      sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1,
    }}}]},
  })
}

// ─── Orders ───────────────────────────────────────────────

export async function getOrders(): Promise<Order[]> {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Orders!A2:K' })
  return (res.data.values ?? []).map(r => {
    const completedDate = fmt(r[9])
    return {
      id: String(r[0] ?? ''), receivedDate: fmt(r[1]), content: String(r[2] ?? ''),
      customerCode: String(r[3] ?? ''), factoryCode: String(r[4] ?? ''),
      customerPO: String(r[5] ?? ''), scNumber: String(r[6] ?? ''),
      owner: String(r[7] ?? ''), status: String(r[8] ?? ''),
      completedDate, note: String(r[10] ?? ''),
      workingDays: !completedDate && r[1] ? workingDays(fmt(r[1])) : null,
    }
  }).filter(o => o.id)
}

export async function addOrder(d: Omit<Order, 'id' | 'workingDays'>) {
  const sheets = getSheets()
  const id = uid()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Orders!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [[id, d.receivedDate, d.content, d.customerCode,
      d.factoryCode, d.customerPO, d.scNumber, d.owner,
      d.status || '處理中', d.completedDate ?? '', d.note ?? '']] },
  })
  await saveCode('CustomerCode', d.customerCode)
  await saveCode('FactoryCode', d.factoryCode)
  return id
}

export async function updateOrder(id: string, d: Omit<Order, 'id' | 'workingDays'>) {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Orders!A:A' })
  const rows = res.data.values ?? []
  const rowIdx = rows.findIndex(r => String(r[0]) === id)
  if (rowIdx < 0) throw new Error('Order not found')
  const row = rowIdx + 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range: `Orders!B${row}:K${row}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[d.receivedDate, d.content, d.customerCode,
      d.factoryCode, d.customerPO, d.scNumber, d.owner,
      d.status || '處理中', d.completedDate ?? '', d.note ?? '']] },
  })
  await saveCode('CustomerCode', d.customerCode)
  await saveCode('FactoryCode', d.factoryCode)
}

export async function deleteOrder(id: string) {
  const sheets = getSheets()
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const sheetId = meta.data.sheets?.find(s => s.properties?.title === 'Orders')?.properties?.sheetId
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Orders!A:A' })
  const rows = res.data.values ?? []
  const rowIdx = rows.findIndex(r => String(r[0]) === id)
  if (rowIdx < 0) throw new Error('Order not found')
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { requests: [{ deleteDimension: { range: {
      sheetId, dimension: 'ROWS', startIndex: rowIdx, endIndex: rowIdx + 1,
    }}}]},
  })
}

// ─── Config ───────────────────────────────────────────────

export async function getConfig() {
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Config!A2:B' })
  const rows = res.data.values ?? []
  return {
    customerCodes: [...new Set(rows.filter(r => r[0]==='CustomerCode').map(r => String(r[1])).filter(Boolean))],
    factoryCodes:  [...new Set(rows.filter(r => r[0]==='FactoryCode').map(r => String(r[1])).filter(Boolean))],
  }
}

async function saveCode(type: string, value: string) {
  if (!value?.trim()) return
  // 逗號分隔的多值（例如 RFQ 的多個 ST）拆開逐一記憶，維持單一代碼的 autocomplete
  const values = [...new Set(value.split(',').map(v => v.trim()).filter(Boolean))]
  if (values.length === 0) return
  const sheets = getSheets()
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: 'Config!A:B' })
  const rows = res.data.values ?? []
  const toAdd = values.filter(v => !rows.some(r => r[0]===type && r[1]===v))
  if (toAdd.length === 0) return
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID, range: 'Config!A1',
    valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS',
    requestBody: { values: toAdd.map(v => [type, v]) },
  })
}
