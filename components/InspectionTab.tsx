'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Inspection } from '@/lib/tracking'
import type { Task } from '@/lib/sheets'

interface Config { customerCodes: string[]; factoryCodes: string[] }

const RESULTS = ['驗貨中', '通過放行', '不通過需複驗', '不通過退回報廢'] as const
function today() { return new Date().toISOString().split('T')[0] }
const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400'

// 每次驗貨結果 → 圓點顏色
function dotColor(result: string) {
  if (result === '通過放行') return 'bg-emerald-500'
  if (result === '不通過需複驗') return 'bg-orange-400'
  if (result === '不通過退回報廢') return 'bg-red-500'
  return 'bg-slate-300' // 驗貨中
}

// 依最新一次驗貨結果衍生狀態
function statusOf(ins: Inspection): { label: string; cls: string } {
  const logs = ins.logs
  if (logs.length === 0) return { label: '待驗貨', cls: 'bg-slate-100 text-slate-500' }
  const last = logs[logs.length - 1].result
  if (last === '通過放行') return { label: '已放行', cls: 'bg-emerald-100 text-emerald-700' }
  if (last === '不通過需複驗') return { label: '待複驗', cls: 'bg-orange-100 text-orange-700' }
  if (last === '不通過退回報廢') return { label: '不合格', cls: 'bg-red-100 text-red-700' }
  return { label: '驗貨中', cls: 'bg-blue-100 text-blue-700' }
}

const STATUS_OPTIONS = ['待驗貨', '驗貨中', '待複驗', '已放行', '不合格']

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-xl shadow-xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} mx-4 max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function InspectionTab({ config, poTasks }: { config: Config; poTasks: Task[] }) {
  const [items, setItems] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [editing, setEditing] = useState<Partial<Inspection> | null>(null)  // 新增/編輯主卡
  const [detailId, setDetailId] = useState<string | null>(null)             // 開啟的卡片

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/inspections').then(r => r.json())
      setItems(Array.isArray(r) ? r : [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const detail = items.find(i => i.id === detailId) || null

  const filtered = items.filter(i => {
    if (statusFilter && statusOf(i).label !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (![i.orderNo, i.customerCode, i.factoryCode, i.customerPO, i.scNumber].some(v => (v || '').toLowerCase().includes(s))) return false
    }
    return true
  }).sort((a, b) => (b.createdDate || '').localeCompare(a.createdDate || ''))

  async function saveCard(d: Partial<Inspection>) {
    setSaving(true)
    try {
      const method = d.id ? 'PUT' : 'POST'
      await fetch('/api/inspections', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      setEditing(null); await fetchAll()
    } finally { setSaving(false) }
  }
  async function deleteCard(id: string) {
    if (!confirm('刪除此驗貨單？會一併刪除其所有驗貨記錄。')) return
    await fetch('/api/inspections', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setDetailId(null); await fetchAll()
  }
  async function addLog(d: { inspectionId: string; date: string; inspector: string; result: string; problem: string }) {
    setSaving(true)
    try {
      await fetch('/api/inspection-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      await fetchAll()
    } finally { setSaving(false) }
  }
  async function deleteLog(id: string) {
    if (!confirm('刪除這筆驗貨記錄？')) return
    await fetch('/api/inspection-logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await fetchAll()
  }

  return (
    <div>
      {loading && <div className="fixed inset-0 bg-white/60 z-40 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" /></div>}

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋 編號/客戶/PO#/SC#"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600 w-56" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600">
            <option value="">全部狀態</option>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <button onClick={() => setEditing({ createdDate: today() })} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-3 py-1.5 rounded-lg">+ 新增驗貨單</button>
      </div>

      {filtered.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-300 text-sm">尚無驗貨單</div>
        : <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(ins => {
            const st = statusOf(ins)
            return (
              <button key={ins.id} onClick={() => setDetailId(ins.id)} className="text-left bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md hover:border-cyan-300 transition">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-semibold text-slate-800 truncate">{ins.orderNo || '(未命名)'}</span>
                  <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-xs text-slate-400 space-y-0.5 mb-3">
                  {ins.customerCode && <div>客戶：<span className="text-slate-600">{ins.customerCode}</span></div>}
                  {ins.factoryCode && <div>工廠：<span className="text-slate-600">{ins.factoryCode}</span></div>}
                  {(ins.customerPO || ins.scNumber) && <div className="text-slate-400">{[ins.customerPO && `PO ${ins.customerPO}`, ins.scNumber && `SC ${ins.scNumber}`].filter(Boolean).join(' · ')}</div>}
                </div>
                <div className="flex items-center gap-1.5">
                  {ins.logs.length === 0 ? <span className="text-xs text-slate-300">尚未驗貨</span>
                    : <>
                      {ins.logs.map(l => <span key={l.id} title={`${l.date} ${l.result}`} className={`w-2.5 h-2.5 rounded-full ${dotColor(l.result)}`} />)}
                      <span className="text-xs text-slate-400 ml-1">驗 {ins.logs.length} 次</span>
                    </>}
                </div>
              </button>
            )
          })}
        </div>}

      {/* 新增/編輯主卡 */}
      {editing && <CardForm data={editing} config={config} poTasks={poTasks} saving={saving} onChange={setEditing} onSubmit={saveCard} onCancel={() => setEditing(null)} />}

      {/* 卡片詳情 + 時間軸 */}
      {detail && <DetailModal ins={detail} saving={saving} onClose={() => setDetailId(null)}
        onEdit={() => { setEditing(detail); setDetailId(null) }}
        onDeleteCard={() => deleteCard(detail.id)} onAddLog={addLog} onDeleteLog={deleteLog} />}
    </div>
  )
}

function CardForm({ data, config, poTasks, saving, onChange, onSubmit, onCancel }: {
  data: Partial<Inspection>; config: Config; poTasks: Task[]; saving: boolean
  onChange: (d: Partial<Inspection>) => void; onSubmit: (d: Partial<Inspection>) => void; onCancel: () => void
}) {
  const set = (k: keyof Inspection) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...data, [k]: e.target.value })
  const onPickPO = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const t = poTasks.find(p => p.id === e.target.value)
    if (!t) { onChange({ ...data, linkedTaskId: '' }); return }
    onChange({ ...data, linkedTaskId: t.id, customerCode: t.customerCode || data.customerCode || '', factoryCode: t.factoryCode || data.factoryCode || '', customerPO: t.customerPO || '', scNumber: t.scNumber || '', orderNo: data.orderNo || t.scNumber || t.customerPO || '' })
  }
  return (
    <Modal title={data.id ? '編輯驗貨單' : '新增驗貨單'} onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); onSubmit(data) }} className="px-5 py-4 space-y-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">連動現有 PO（選填，會自動帶入客戶/PO#/SC#）</label>
          <select value={data.linkedTaskId || ''} onChange={onPickPO} className={inputCls}>
            <option value="">— 不連動，手動輸入 —</option>
            {poTasks.map(t => <option key={t.id} value={t.id}>{[t.scNumber && `SC ${t.scNumber}`, t.customerPO && `PO ${t.customerPO}`, t.customerCode, t.content].filter(Boolean).join(' · ').slice(0, 60)}</option>)}
          </select></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">貨品／訂單編號 *</label>
          <input type="text" value={data.orderNo || ''} onChange={set('orderNo')} required className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">客戶</label>
            <input type="text" list="dl-cust-ins" value={data.customerCode || ''} onChange={set('customerCode')} className={inputCls} />
            <datalist id="dl-cust-ins">{config.customerCodes.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">工廠</label>
            <input type="text" list="dl-fact-ins" value={data.factoryCode || ''} onChange={set('factoryCode')} className={inputCls} />
            <datalist id="dl-fact-ins">{config.factoryCodes.map(c => <option key={c} value={c} />)}</datalist></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">Customer PO#</label>
            <input type="text" value={data.customerPO || ''} onChange={set('customerPO')} className={inputCls} /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">SC#</label>
            <input type="text" value={data.scNumber || ''} onChange={set('scNumber')} className={inputCls} /></div>
        </div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">備註</label>
          <input type="text" value={data.note || ''} onChange={set('note')} className={inputCls} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-slate-200 rounded-lg text-slate-600 text-xs">取消</button>
          <button type="submit" disabled={saving} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs disabled:opacity-50">{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </form>
    </Modal>
  )
}

function DetailModal({ ins, saving, onClose, onEdit, onDeleteCard, onAddLog, onDeleteLog }: {
  ins: Inspection; saving: boolean; onClose: () => void; onEdit: () => void; onDeleteCard: () => void
  onAddLog: (d: { inspectionId: string; date: string; inspector: string; result: string; problem: string }) => void
  onDeleteLog: (id: string) => void
}) {
  const [date, setDate] = useState(today())
  const [inspector, setInspector] = useState('')
  const [result, setResult] = useState<string>('驗貨中')
  const [problem, setProblem] = useState('')
  const st = statusOf(ins)

  return (
    <Modal wide title={ins.orderNo || '驗貨單'} onClose={onClose}>
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`px-2 py-0.5 rounded font-medium ${st.cls}`}>{st.label}</span>
          {ins.customerCode && <span className="text-slate-500">客戶 {ins.customerCode}</span>}
          {ins.factoryCode && <span className="text-slate-500">工廠 {ins.factoryCode}</span>}
          {ins.customerPO && <span className="text-slate-500">PO {ins.customerPO}</span>}
          {ins.scNumber && <span className="text-slate-500">SC {ins.scNumber}</span>}
          {ins.linkedTaskId && <span className="text-cyan-600">🔗 已連動 PO</span>}
        </div>
        {ins.note && <p className="text-xs text-slate-500">備註：{ins.note}</p>}

        {/* 時間軸 */}
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">驗貨時間軸（{ins.logs.length} 次）</p>
          {ins.logs.length === 0 ? <p className="text-xs text-slate-300 mb-2">尚無記錄</p>
            : <ol className="space-y-2 mb-2">
              {ins.logs.map(l => (
                <li key={l.id} className="flex items-start gap-2.5">
                  <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${dotColor(l.result)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-slate-700">{l.result}</span>
                      <span className="text-xs text-slate-400">{l.date}</span>
                      {l.inspector && <span className="text-xs text-slate-400">· {l.inspector}</span>}
                      <button onClick={() => onDeleteLog(l.id)} className="text-xs text-slate-300 hover:text-red-400 ml-auto">刪除</button>
                    </div>
                    {l.problem && <p className="text-xs text-slate-500 mt-0.5">{l.problem}</p>}
                  </div>
                </li>
              ))}
            </ol>}
        </div>

        {/* 新增驗貨記錄 */}
        <form onSubmit={e => { e.preventDefault(); if (!inspector.trim() && !result) return; onAddLog({ inspectionId: ins.id, date, inspector, result, problem }); setInspector(''); setProblem(''); setResult('驗貨中'); setDate(today()) }}
          className="bg-slate-50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600">新增驗貨記錄</p>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            <input type="text" value={inspector} onChange={e => setInspector(e.target.value)} placeholder="驗貨人" className={inputCls} />
            <select value={result} onChange={e => setResult(e.target.value)} className={inputCls}>{RESULTS.map(r => <option key={r} value={r}>{r}</option>)}</select>
          </div>
          <input type="text" value={problem} onChange={e => setProblem(e.target.value)} placeholder="問題說明（選填）" className={inputCls} />
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs disabled:opacity-50">{saving ? '儲存中...' : '新增記錄'}</button>
          </div>
        </form>

        <div className="flex justify-between pt-1">
          <button onClick={onDeleteCard} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg">刪除驗貨單</button>
          <button onClick={onEdit} className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">編輯資料</button>
        </div>
      </div>
    </Modal>
  )
}
