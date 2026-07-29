'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Complaint } from '@/lib/tracking'

interface Config { customerCodes: string[]; factoryCodes: string[] }

const SEVERITIES = ['High', 'Mid', 'Low'] as const
const OWNERS = ['B', 'L', 'G'] as const
function today() { return new Date().toISOString().split('T')[0] }
const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400'

function sevCls(s: string) {
  if (s === 'High') return 'bg-red-100 text-red-700'
  if (s === 'Mid') return 'bg-amber-100 text-amber-700'
  if (s === 'Low') return 'bg-slate-100 text-slate-600'
  return 'bg-slate-100 text-slate-500'
}

// 狀態：有結案日→已結案；未結案且過預計結案日→逾期；否則處理中
function statusOf(c: Complaint): { label: string; cls: string; overdue: boolean } {
  if (c.closedDate) return { label: '已結案', cls: 'bg-emerald-100 text-emerald-700', overdue: false }
  if (c.dueDate && today() > c.dueDate) return { label: '逾期', cls: 'bg-red-100 text-red-700', overdue: true }
  return { label: '處理中', cls: 'bg-blue-100 text-blue-700', overdue: false }
}
const STATUS_OPTIONS = ['處理中', '逾期', '已結案']

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

export default function ComplaintTab({ config }: { config: Config }) {
  const [items, setItems] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [editing, setEditing] = useState<Partial<Complaint> | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/complaints').then(r => r.json())
      setItems(Array.isArray(r) ? r : [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [])
  useEffect(() => { fetchAll() }, [fetchAll])

  const detail = items.find(c => c.id === detailId) || null

  const filtered = items.filter(c => {
    if (statusFilter && statusOf(c).label !== statusFilter) return false
    if (ownerFilter && c.owner !== ownerFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (![c.customerCode, c.content].some(v => (v || '').toLowerCase().includes(s))) return false
    }
    return true
  }).sort((a, b) => {
    // 未結案優先、逾期最前，其次依預計結案日
    const sa = statusOf(a), sb = statusOf(b)
    const rank = (x: typeof sa) => x.label === '逾期' ? 0 : x.label === '處理中' ? 1 : 2
    if (rank(sa) !== rank(sb)) return rank(sa) - rank(sb)
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
  })

  async function saveCard(d: Partial<Complaint>) {
    setSaving(true)
    try {
      const method = d.id ? 'PUT' : 'POST'
      await fetch('/api/complaints', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      setEditing(null); await fetchAll()
    } finally { setSaving(false) }
  }
  async function deleteCard(id: string) {
    if (!confirm('刪除此客訴案件？會一併刪除其所有處理步驟。')) return
    await fetch('/api/complaints', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setDetailId(null); await fetchAll()
  }
  async function toggleClose(c: Complaint) {
    if (c.closedDate) {
      if (!confirm('取消結案，重新開啟此案件？')) return
      await saveCard({ ...c, closedDate: '' })
    } else {
      const date = prompt('結案日期（YYYY-MM-DD）：', today()); if (!date) return
      await saveCard({ ...c, closedDate: date })
    }
    setDetailId(null)
  }
  async function addLog(d: { complaintId: string; date: string; owner: string; action: string }) {
    setSaving(true)
    try {
      await fetch('/api/complaint-logs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      await fetchAll()
    } finally { setSaving(false) }
  }
  async function deleteLog(id: string) {
    if (!confirm('刪除這筆處理步驟？')) return
    await fetch('/api/complaint-logs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await fetchAll()
  }

  return (
    <div>
      {loading && <div className="fixed inset-0 bg-white/60 z-40 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-600" /></div>}

      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜尋 客戶/內容"
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-600 w-52" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600">
            <option value="">全部狀態</option>{STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-600">
            <option value="">全部負責人</option>{OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <button onClick={() => setEditing({ severity: 'Mid' })} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-3 py-1.5 rounded-lg">+ 新增客訴</button>
      </div>

      {filtered.length === 0 ? <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-300 text-sm">尚無客訴案件</div>
        : <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => {
            const st = statusOf(c)
            return (
              <button key={c.id} onClick={() => setDetailId(c.id)} className={`text-left bg-white rounded-xl border p-4 hover:shadow-md transition ${st.overdue ? 'border-red-300' : 'border-slate-200 hover:border-cyan-300'}`}>
                <div className="flex items-start justify-between mb-2 gap-2">
                  <span className="font-semibold text-slate-800 truncate">{c.customerCode || '(未填客戶)'}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${sevCls(c.severity)}`}>{c.severity || '-'}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-600 mb-3 line-clamp-2">{c.content}</p>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{c.owner && <span className="px-1.5 py-0.5 bg-slate-100 rounded">{c.owner}</span>}</span>
                  <span className={st.overdue ? 'text-red-500 font-medium' : ''}>{c.closedDate ? `✓ ${c.closedDate}` : c.dueDate ? `預計 ${c.dueDate}` : '未定結案日'}</span>
                </div>
              </button>
            )
          })}
        </div>}

      {editing && <CardForm data={editing} config={config} saving={saving} onChange={setEditing} onSubmit={saveCard} onCancel={() => setEditing(null)} />}

      {detail && <DetailModal c={detail} saving={saving} onClose={() => setDetailId(null)}
        onEdit={() => { setEditing(detail); setDetailId(null) }}
        onDeleteCard={() => deleteCard(detail.id)} onToggleClose={() => toggleClose(detail)} onAddLog={addLog} onDeleteLog={deleteLog} />}
    </div>
  )
}

function CardForm({ data, config, saving, onChange, onSubmit, onCancel }: {
  data: Partial<Complaint>; config: Config; saving: boolean
  onChange: (d: Partial<Complaint>) => void; onSubmit: (d: Partial<Complaint>) => void; onCancel: () => void
}) {
  const set = (k: keyof Complaint) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange({ ...data, [k]: e.target.value })
  return (
    <Modal title={data.id ? '編輯客訴' : '新增客訴'} onClose={onCancel}>
      <form onSubmit={e => { e.preventDefault(); onSubmit(data) }} className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">客戶 *</label>
            <input type="text" list="dl-cust-cmp" value={data.customerCode || ''} onChange={set('customerCode')} required className={inputCls} />
            <datalist id="dl-cust-cmp">{config.customerCodes.map(c => <option key={c} value={c} />)}</datalist></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">嚴重程度 *</label>
            <select value={data.severity || 'Mid'} onChange={set('severity')} className={inputCls}>{SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">客訴內容 *</label>
          <textarea value={data.content || ''} onChange={set('content')} required rows={2} className={inputCls} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">負責人</label>
            <select value={data.owner || ''} onChange={set('owner')} className={inputCls}>
              <option value="">-</option>{OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">預計結案日</label>
            <input type="date" value={data.dueDate || ''} onChange={set('dueDate')} className={inputCls} /></div>
        </div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">備註</label>
          <input type="text" value={data.note || ''} onChange={set('note')} className={inputCls} /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">結案日期（填入即視為已結案）</label>
          <input type="date" value={data.closedDate || ''} onChange={set('closedDate')} className={inputCls} /></div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-slate-200 rounded-lg text-slate-600 text-xs">取消</button>
          <button type="submit" disabled={saving} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs disabled:opacity-50">{saving ? '儲存中...' : '儲存'}</button>
        </div>
      </form>
    </Modal>
  )
}

function DetailModal({ c, saving, onClose, onEdit, onDeleteCard, onToggleClose, onAddLog, onDeleteLog }: {
  c: Complaint; saving: boolean; onClose: () => void; onEdit: () => void; onDeleteCard: () => void; onToggleClose: () => void
  onAddLog: (d: { complaintId: string; date: string; owner: string; action: string }) => void
  onDeleteLog: (id: string) => void
}) {
  const [date, setDate] = useState(today())
  const [owner, setOwner] = useState('')
  const [action, setAction] = useState('')
  const st = statusOf(c)
  return (
    <Modal wide title={`客訴 · ${c.customerCode || ''}`} onClose={onClose}>
      <div className="px-5 py-4 space-y-4">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className={`px-2 py-0.5 rounded font-medium ${sevCls(c.severity)}`}>{c.severity || '-'}</span>
          <span className={`px-2 py-0.5 rounded font-medium ${st.cls}`}>{st.label}</span>
          {c.owner && <span className="text-slate-500">負責人 {c.owner}</span>}
          {c.dueDate && <span className={st.overdue ? 'text-red-500' : 'text-slate-500'}>預計結案 {c.dueDate}</span>}
          {c.closedDate && <span className="text-emerald-600">結案 {c.closedDate}</span>}
        </div>
        <p className="text-sm text-slate-700 whitespace-pre-wrap">{c.content}</p>
        {c.note && <p className="text-xs text-slate-500">備註：{c.note}</p>}

        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">處理步驟（{c.logs.length}）</p>
          {c.logs.length === 0 ? <p className="text-xs text-slate-300 mb-2">尚無步驟</p>
            : <ol className="space-y-2 mb-2 border-l-2 border-slate-100 pl-3">
              {c.logs.map(l => (
                <li key={l.id} className="relative">
                  <span className="absolute -left-[17px] top-1 w-2.5 h-2.5 rounded-full bg-cyan-400" />
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400">{l.date}</span>
                    {l.owner && <span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded">{l.owner}</span>}
                    <button onClick={() => onDeleteLog(l.id)} className="text-xs text-slate-300 hover:text-red-400 ml-auto">刪除</button>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5">{l.action}</p>
                </li>
              ))}
            </ol>}
        </div>

        <form onSubmit={e => { e.preventDefault(); if (!action.trim()) return; onAddLog({ complaintId: c.id, date, owner, action }); setAction(''); setOwner(''); setDate(today()) }}
          className="bg-slate-50 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-600">新增處理步驟</p>
          <div className="grid grid-cols-3 gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
            <select value={owner} onChange={e => setOwner(e.target.value)} className={inputCls}>
              <option value="">負責人</option>{OWNERS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <input type="text" value={action} onChange={e => setAction(e.target.value)} placeholder="處理動作說明" className={inputCls} />
          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs disabled:opacity-50">{saving ? '儲存中...' : '新增步驟'}</button>
          </div>
        </form>

        <div className="flex items-center justify-between pt-1">
          <button onClick={onDeleteCard} className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg">刪除案件</button>
          <div className="flex gap-2">
            <button onClick={onToggleClose} className={`px-3 py-1.5 text-xs rounded-lg ${c.closedDate ? 'text-slate-600 border border-slate-200 hover:bg-slate-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}>{c.closedDate ? '取消結案' : '結案'}</button>
            <button onClick={onEdit} className="px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">編輯資料</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
