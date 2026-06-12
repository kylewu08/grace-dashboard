'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Task, Order } from '@/lib/sheets'

interface Config { customerCodes: string[]; factoryCodes: string[] }
type FilterStatus = 'pending' | 'all' | 'done'
type Tab = 'dashboard' | 'orders'
type ModalMode = 'task' | 'order' | null

const EMPTY_TASK = { date: '', type: '', content: '', customerCode: '', factoryCode: '', customerPO: '', scNumber: '', note: '', owner: '', status: '', completedDate: '' }
const EMPTY_ORDER = { receivedDate: '', content: '', customerCode: '', factoryCode: '', customerPO: '', scNumber: '', owner: '', status: '', completedDate: '', note: '' }

function today() { return new Date().toISOString().split('T')[0] }

function rowClass(item: Task | Order) {
  const cd = (item as Task).completedDate || (item as Order).completedDate
  if (cd) return 'row-done'
  const wd = item.workingDays ?? 0
  if (wd >= 5) return 'row-red'
  if (wd >= 3) return 'row-yellow'
  return ''
}

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = { 'PO': 'bg-blue-100 text-blue-800', 'RFQ': 'bg-emerald-100 text-emerald-800', 'Others': 'bg-purple-100 text-purple-800' }
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${map[type] ?? map.Others}`}>{type || 'Others'}</span>
}

function DayTag({ item }: { item: Task | Order }) {
  const cd = (item as Task).completedDate
  if (cd) return <span className="text-xs text-emerald-600">✓ {cd}</span>
  const d = item.workingDays ?? 0
  if (d >= 5) return <span className="text-xs text-red-600 font-semibold">⚠ {d}天</span>
  if (d >= 3) return <span className="text-xs text-yellow-600 font-semibold">⚡ {d}天</span>
  return <span className="text-xs text-slate-400">{d}天</span>
}

function KpiCard({ label, value, unit, valueClass }: { label: string; value: number; unit: string; valueClass: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${valueClass}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{unit}</p>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400'

function TaskForm({ data, config, saving, onChange, onSubmit, onCancel }: {
  data: Partial<Task>; config: Config; saving: boolean
  onChange: (d: Partial<Task>) => void
  onSubmit: (d: Partial<Task>) => void
  onCancel: () => void
}) {
  const set = (k: keyof Task) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...data, [k]: e.target.value })

  // RFQ 可填多個 ST（Factory Code）；底層仍存成逗號分隔的同一欄位
  const isRFQ = data.type === 'RFQ'
  const [stList, setStList] = useState<string[]>(() => {
    const parts = (data.factoryCode || '').split(',').map(s => s.trim()).filter(Boolean)
    return parts.length ? parts : ['']
  })
  // 切換到 RFQ 時，用目前 factoryCode 重新初始化多欄位
  useEffect(() => {
    if (isRFQ) {
      const parts = (data.factoryCode || '').split(',').map(s => s.trim()).filter(Boolean)
      setStList(parts.length ? parts : [''])
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRFQ])
  const updateSt = (next: string[]) => {
    setStList(next)
    onChange({ ...data, factoryCode: next.map(s => s.trim()).filter(Boolean).join(', ') })
  }

  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(data) }} className="px-5 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">日期 *</label>
          <input type="date" value={data.date||''} onChange={set('date')} required className={inputCls}/></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">類型 *</label>
          <select value={data.type||''} onChange={set('type')} required className={inputCls}>
            <option value="">選擇</option><option value="PO">PO</option><option value="RFQ">RFQ</option><option value="Others">Others</option>
          </select></div>
      </div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">內容 *</label>
        <input type="text" value={data.content||''} onChange={set('content')} required className={inputCls}/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Customer Code</label>
          <input type="text" list="dl-cust" value={data.customerCode||''} onChange={set('customerCode')} className={inputCls}/>
          <datalist id="dl-cust">{config.customerCodes.map(c=><option key={c} value={c}/>)}</datalist></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Factory Code{isRFQ && '（ST，可多個）'}</label>
          {isRFQ ? (
            <div className="space-y-1.5">
              {stList.map((st, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input type="text" list="dl-fact" value={st} placeholder={`ST ${i+1}`}
                    onChange={e => updateSt(stList.map((v, idx) => idx === i ? e.target.value : v))}
                    className={inputCls}/>
                  {stList.length > 1 && (
                    <button type="button" onClick={() => updateSt(stList.filter((_, idx) => idx !== i))}
                      title="移除" className="shrink-0 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => updateSt([...stList, ''])}
                className="text-xs text-cyan-600 hover:text-cyan-700">+ 新增 ST</button>
              <datalist id="dl-fact">{config.factoryCodes.map(c=><option key={c} value={c}/>)}</datalist>
            </div>
          ) : (
            <>
              <input type="text" list="dl-fact" value={data.factoryCode||''} onChange={set('factoryCode')} className={inputCls}/>
              <datalist id="dl-fact">{config.factoryCodes.map(c=><option key={c} value={c}/>)}</datalist>
            </>
          )}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Customer PO#</label>
          <input type="text" value={data.customerPO||''} onChange={set('customerPO')} className={inputCls}/></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">SC#</label>
          <input type="text" value={data.scNumber||''} onChange={set('scNumber')} className={inputCls}/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
          <select value={data.owner||''} onChange={set('owner')} className={inputCls}>
            <option value="">-</option><option value="B">B</option><option value="L">L</option><option value="G">G</option>
          </select></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">狀態</label>
          <input type="text" value={data.status||''} onChange={set('status')} placeholder="處理中" className={inputCls}/></div>
      </div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">備註</label>
        <input type="text" value={data.note||''} onChange={set('note')} className={inputCls}/></div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">完成日期（填入即視為完成）</label>
        <input type="date" value={data.completedDate||''} onChange={set('completedDate')} className={inputCls}/></div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-slate-200 rounded-lg text-slate-600 text-xs">取消</button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs disabled:opacity-50">{saving?'儲存中...':'儲存'}</button>
      </div>
    </form>
  )
}

function OrderForm({ data, config, saving, onChange, onSubmit, onCancel }: {
  data: Partial<Order>; config: Config; saving: boolean
  onChange: (d: Partial<Order>) => void
  onSubmit: (d: Partial<Order>) => void
  onCancel: () => void
}) {
  const set = (k: keyof Order) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...data, [k]: e.target.value })
  return (
    <form onSubmit={e => { e.preventDefault(); onSubmit(data) }} className="px-5 py-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">收單日期 *</label>
          <input type="date" value={data.receivedDate||''} onChange={set('receivedDate')} required className={inputCls}/></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">負責人 *</label>
          <select value={data.owner||''} onChange={set('owner')} required className={inputCls}>
            <option value="">選擇</option><option value="B">B</option><option value="L">L</option><option value="G">G</option>
          </select></div>
      </div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">內容 *</label>
        <input type="text" value={data.content||''} onChange={set('content')} required className={inputCls}/></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Customer Code</label>
          <input type="text" list="dl-cust" value={data.customerCode||''} onChange={set('customerCode')} className={inputCls}/></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Factory Code</label>
          <input type="text" list="dl-fact" value={data.factoryCode||''} onChange={set('factoryCode')} className={inputCls}/></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">Customer PO#</label>
          <input type="text" value={data.customerPO||''} onChange={set('customerPO')} className={inputCls}/></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">SC#</label>
          <input type="text" value={data.scNumber||''} onChange={set('scNumber')} className={inputCls}/></div>
      </div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">狀態</label>
        <input type="text" value={data.status||''} onChange={set('status')} placeholder="處理中" className={inputCls}/></div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">備註</label>
        <input type="text" value={data.note||''} onChange={set('note')} className={inputCls}/></div>
      <div><label className="block text-xs font-medium text-slate-600 mb-1">完成日期（填入即視為完成）</label>
        <input type="date" value={data.completedDate||''} onChange={set('completedDate')} className={inputCls}/></div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-1.5 border border-slate-200 rounded-lg text-slate-600 text-xs">取消</button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 text-xs disabled:opacity-50">{saving?'儲存中...':'儲存'}</button>
      </div>
    </form>
  )
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [tasks, setTasks] = useState<Task[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [config, setConfig] = useState<Config>({ customerCodes: [], factoryCodes: [] })
  const [loading, setLoading] = useState(true)
  const [taskFilter, setTaskFilter] = useState<{ type: string; status: FilterStatus }>({ type: '', status: 'pending' })
  const [orderFilter, setOrderFilter] = useState<{ owner: string; status: FilterStatus }>({ owner: '', status: 'pending' })
  const [modal, setModal] = useState<ModalMode>(null)
  const [editingTask, setEditingTask] = useState<Partial<Task>>({})
  const [editingOrder, setEditingOrder] = useState<Partial<Order>>({})
  const [saving, setSaving] = useState(false)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [t, o, c] = await Promise.all([
        fetch('/api/tasks').then(r => r.json()),
        fetch('/api/orders').then(r => r.json()),
        fetch('/api/config').then(r => r.json()),
      ])
      setTasks(Array.isArray(t) ? t : [])
      setOrders(Array.isArray(o) ? o : [])
      setConfig(c)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Stats
  const poPending = tasks.filter(t => !t.completedDate && t.type === 'PO').length
  const nonPoPending = tasks.filter(t => !t.completedDate && t.type !== 'PO').length
  const weekStart = (() => { const d = new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.toISOString().split('T')[0] })()
  const weekDone = tasks.filter(t => t.completedDate >= weekStart && t.completedDate <= today()).length
  const yellowAlert = tasks.filter(t => !t.completedDate && (t.workingDays??0)>=3 && (t.workingDays??0)<5).length
  const redAlert = tasks.filter(t => !t.completedDate && (t.workingDays??0)>=5).length

  const monthlyMap: Record<string,{total:number;done:number;byType:Record<string,{total:number;done:number}>}> = {}
  tasks.forEach(t => {
    const m=(t.date||'').slice(0,7); if(!m) return
    if(!monthlyMap[m]) monthlyMap[m]={total:0,done:0,byType:{}}
    monthlyMap[m].total++; if(t.completedDate) monthlyMap[m].done++
    const tp=t.type||'Others'
    if(!monthlyMap[m].byType[tp]) monthlyMap[m].byType[tp]={total:0,done:0}
    monthlyMap[m].byType[tp].total++; if(t.completedDate) monthlyMap[m].byType[tp].done++
  })
  const monthlyMonths = Object.keys(monthlyMap).sort((a,b)=>b.localeCompare(a)).slice(0,6)

  const inquiryMap: Record<string,{total:number;byMonth:Record<string,number>}> = {}
  tasks.filter(t=>t.type==='RFQ').forEach(t => {
    const c=t.customerCode||'Unknown'; const m=(t.date||'').slice(0,7)
    if(!inquiryMap[c]) inquiryMap[c]={total:0,byMonth:{}}
    inquiryMap[c].total++; inquiryMap[c].byMonth[m]=(inquiryMap[c].byMonth[m]||0)+1
  })
  const inquiryCustomers = Object.keys(inquiryMap).sort((a,b)=>inquiryMap[b].total-inquiryMap[a].total)
  const inquiryMonths = [...new Set(inquiryCustomers.flatMap(c=>Object.keys(inquiryMap[c].byMonth)))].sort((a,b)=>b.localeCompare(a)).slice(0,4)

  // 訂單頁面直接從 tasks 裡 type=訂單 的資料計算
  const TYPE_ORDER: Record<string, number> = { 'PO': 0, 'RFQ': 1, 'Others': 2 }
  const orderTasks = tasks.filter(t => t.type === 'PO')
  const ownerPending: Record<string,number> = {B:0,L:0,G:0}
  const ownerMonthly: Record<string,Record<string,number>> = {}
  orderTasks.forEach(t => {
    if(!t.completedDate && t.owner) ownerPending[t.owner]=(ownerPending[t.owner]||0)+1
    if(t.completedDate && t.owner) {
      const m=t.completedDate.slice(0,7)
      if(!ownerMonthly[m]) ownerMonthly[m]={B:0,L:0,G:0}
      ownerMonthly[m][t.owner]=(ownerMonthly[m][t.owner]||0)+1
    }
  })
  const ownerMonths = Object.keys(ownerMonthly).sort((a,b)=>b.localeCompare(a)).slice(0,6)

  const filteredTasks = tasks
    .filter(t=>!taskFilter.type||t.type===taskFilter.type)
    .filter(t=>taskFilter.status==='all'?true:taskFilter.status==='done'?!!t.completedDate:!t.completedDate)
    .sort((a,b)=>{ const dc=b.date.localeCompare(a.date); if(dc!==0) return dc; return (TYPE_ORDER[a.type]??3)-(TYPE_ORDER[b.type]??3) })

  const filteredOrders = orderTasks
    .filter(t=>!orderFilter.owner||t.owner===orderFilter.owner)
    .filter(t=>orderFilter.status==='all'?true:orderFilter.status==='done'?!!t.completedDate:!t.completedDate)
    .sort((a,b)=>b.date.localeCompare(a.date))

  const tasksByDate: Record<string,Task[]> = {}
  filteredTasks.forEach(t=>{ const d=t.date||'?'; (tasksByDate[d]||(tasksByDate[d]=[])).push(t) })
  const taskDates = Object.keys(tasksByDate).sort((a,b)=>b.localeCompare(a))

  async function saveTask(d: Partial<Task>) {
    setSaving(true)
    try {
      const body = { ...d, status: d.status||'處理中', completedDate: d.completedDate||'' }
      if (d.id) await fetch('/api/tasks', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      else await fetch('/api/tasks', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      setModal(null); await fetchAll()
    } finally { setSaving(false) }
  }

  async function saveOrder(d: Partial<Order>) {
    setSaving(true)
    try {
      const body = { ...d, status: d.status||'處理中', completedDate: d.completedDate||'' }
      if (d.id) await fetch('/api/orders', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      else await fetch('/api/orders', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
      setModal(null); await fetchAll()
    } finally { setSaving(false) }
  }

  async function deleteTaskById(id: string) {
    if(!confirm('確定刪除此任務？')) return
    await fetch('/api/tasks',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    await fetchAll()
  }

  async function deleteOrderById(id: string) {
    if(!confirm('確定刪除此訂單？')) return
    await fetch('/api/orders',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})})
    await fetchAll()
  }

  async function completeTask(id: string) {
    const date = prompt('完成日期（YYYY-MM-DD）：', today()); if(!date) return
    const t = tasks.find(t=>t.id===id)!; await saveTask({...t, completedDate:date})
  }

  async function completeOrder(id: string) {
    const date = prompt('完成日期（YYYY-MM-DD）：', today()); if(!date) return
    const o = orders.find(o=>o.id===id)!; await saveOrder({...o, completedDate:date})
  }

  function ActionBtns({ onComplete, onEdit, onDelete }: { onComplete?:()=>void; onEdit:()=>void; onDelete:()=>void }) {
    return (
      <div className="flex items-center justify-end gap-0.5">
        {onComplete && <button onClick={onComplete} title="完成" className="p-1 text-emerald-500 hover:bg-emerald-50 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg></button>}
        <button onClick={onEdit} title="編輯" className="p-1 text-slate-400 hover:bg-slate-100 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg></button>
        <button onClick={onDelete} title="刪除" className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {loading && <div className="fixed inset-0 bg-white/70 z-50 flex items-center justify-center"><div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-600 mx-auto mb-2"/><p className="text-slate-400 text-xs">載入中...</p></div></div>}

      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-screen-xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-cyan-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
            </div>
            <span className="font-bold text-slate-800">任務戰情儀表板</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">{new Date().toLocaleDateString('zh-TW',{year:'numeric',month:'long',day:'numeric',weekday:'short'})}</span>
            <button onClick={fetchAll} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg></button>
          </div>
        </div>
        <div className="max-w-screen-xl mx-auto px-4 flex gap-6">
          {(['dashboard','orders'] as Tab[]).map(t=>(
            <button key={t} onClick={()=>setTab(t)} className={`py-2.5 text-xs border-b-2 -mb-px ${tab===t?'border-cyan-600 text-cyan-600 font-semibold':'border-transparent text-slate-500 hover:text-slate-700'}`}>
              {t==='dashboard'?'儀表板':'訂單管理'}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-5">

        {tab==='dashboard' && <div>
          <div className="grid grid-cols-4 gap-3 mb-5">
            <KpiCard label="PO 待完成" value={poPending} unit="件待處理" valueClass={poPending>0?'text-blue-600':'text-slate-800'}/>
            <KpiCard label="PO 以外待完成" value={nonPoPending} unit="件待處理" valueClass={nonPoPending>0?'text-orange-600':'text-slate-800'}/>
            <KpiCard label="本週已完成" value={weekDone} unit="件完成（含 PO）" valueClass="text-emerald-600"/>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-400 mb-2">延遲警告（含 PO）</p>
              <div className="flex items-center gap-5">
                <div><span className="text-2xl font-bold text-yellow-500">{yellowAlert}</span><span className="text-xs text-slate-400 ml-1">件 ≥3天</span></div>
                <div><span className="text-2xl font-bold text-red-500">{redAlert}</span><span className="text-xs text-slate-400 ml-1">件 ≥5天</span></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 mb-5">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="font-semibold text-slate-700 text-sm">任務列表</span>
              <div className="flex items-center gap-2">
                <select value={taskFilter.type} onChange={e=>setTaskFilter(f=>({...f,type:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                  <option value="">全部類型</option><option value="PO">PO</option><option value="RFQ">RFQ</option><option value="Others">Others</option>
                </select>
                <select value={taskFilter.status} onChange={e=>setTaskFilter(f=>({...f,status:e.target.value as FilterStatus}))} className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                  <option value="pending">待處理</option><option value="all">全部</option><option value="done">已完成</option>
                </select>
                <button onClick={()=>{setEditingTask({...EMPTY_TASK,date:today()});setModal('task')}} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-3 py-1.5 rounded-lg">+ 新增任務</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {taskDates.length===0 ? <div className="p-8 text-center text-slate-300 text-sm">尚無任務</div>
                : <table className="w-full text-xs">
                  <colgroup>
                    <col style={{width:'80px'}}/><col/><col style={{width:'100px'}}/><col style={{width:'80px'}}/>
                    <col style={{width:'130px'}}/><col style={{width:'90px'}}/><col style={{width:'60px'}}/><col style={{width:'90px'}}/><col style={{width:'75px'}}/><col style={{width:'90px'}}/>
                  </colgroup>
                  <thead><tr className="text-left text-slate-400 bg-slate-50 border-b border-slate-100">
                    <th className="px-4 py-2">類型</th><th className="px-3 py-2">內容</th><th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Factory</th><th className="px-3 py-2">PO#</th><th className="px-3 py-2">SC#</th>
                    <th className="px-3 py-2">Owner</th><th className="px-3 py-2">狀態</th><th className="px-3 py-2">天數</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr></thead>
                  <tbody>
                    {taskDates.map(date=>{
                      const list=tasksByDate[date]; const done=list.filter(t=>t.completedDate).length; const pct=Math.round(done/list.length*100)
                      return <>
                        <tr key={`hdr-${date}`} className="bg-slate-50 border-y border-slate-100">
                          <td colSpan={10} className="px-4 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-slate-600">{date}</span>
                              <div className="flex items-center gap-2">
                                <div className="w-20 bg-slate-200 rounded-full h-1"><div className="bg-emerald-400 h-1 rounded-full" style={{width:`${pct}%`}}/></div>
                                <span className="text-slate-400">{done}/{list.length}</span>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {list.map(t=>(
                          <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50 ${rowClass(t)}`}>
                            <td className="px-4 py-2"><TypeBadge type={t.type}/></td>
                            <td className="px-3 py-2 text-slate-700 truncate max-w-0">{t.content}</td>
                            <td className="px-3 py-2 text-slate-400">{t.customerCode}</td>
                            <td className="px-3 py-2 text-slate-400">{t.factoryCode}</td>
                            <td className="px-3 py-2 text-slate-400">{t.customerPO}</td>
                            <td className="px-3 py-2 text-slate-400">{t.scNumber}</td>
                            <td className="px-3 py-2">{t.owner&&<span className="px-1.5 py-0.5 bg-slate-100 rounded">{t.owner}</span>}</td>
                            <td className="px-3 py-2 text-slate-400 truncate max-w-0">{t.status}</td>
                            <td className="px-3 py-2"><DayTag item={t}/></td>
                            <td className="px-3 py-2"><ActionBtns onComplete={!t.completedDate?()=>completeTask(t.id):undefined} onEdit={()=>{setEditingTask(t);setModal('task')}} onDelete={()=>deleteTaskById(t.id)}/></td>
                          </tr>
                        ))}
                      </>
                    })}
                  </tbody>
                </table>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-700 text-sm mb-3">每月任務完成率</p>
              {monthlyMonths.length===0 ? <p className="text-slate-300 text-xs">暫無資料</p>
                : <table className="w-full text-xs"><thead><tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 pr-3">月份</th><th className="py-1.5 text-right">整體</th>
                  {['PO','RFQ','Others'].map(t=><th key={t} className="py-1.5 text-right">{t}</th>)}
                </tr></thead><tbody>
                  {monthlyMonths.map(m=>{
                    const d=monthlyMap[m]; const pct=d.total?Math.round(d.done/d.total*100):0
                    const col=pct>=80?'text-emerald-600':pct>=50?'text-yellow-500':'text-red-500'
                    return <tr key={m} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{m}</td>
                      <td className="py-1.5 text-right"><span className="text-slate-500">{d.done}/{d.total}</span><span className={`ml-1 font-semibold ${col}`}>{pct}%</span></td>
                      {['PO','RFQ','Others'].map(tp=>{const td=d.byType[tp]||{total:0,done:0};const tp2=td.total?Math.round(td.done/td.total*100):null;return <td key={tp} className="py-1.5 text-right text-slate-500">{td.total?`${td.done}/${td.total} (${tp2}%)`:'—'}</td>})}
                    </tr>
                  })}
                </tbody></table>}
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-700 text-sm mb-3">客戶詢價統計</p>
              {inquiryCustomers.length===0 ? <p className="text-slate-300 text-xs">暫無詢價資料</p>
                : <table className="w-full text-xs"><thead><tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="py-1.5 pr-3">客戶</th>
                  {inquiryMonths.map(m=><th key={m} className="py-1.5 text-right">{m}</th>)}
                  <th className="py-1.5 text-right font-semibold">累計</th>
                </tr></thead><tbody>
                  {inquiryCustomers.map(c=>(
                    <tr key={c} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 font-medium text-slate-700">{c}</td>
                      {inquiryMonths.map(m=><td key={m} className="py-1.5 text-right text-slate-500">{inquiryMap[c].byMonth[m]||'—'}</td>)}
                      <td className="py-1.5 text-right font-semibold text-cyan-700">{inquiryMap[c].total}</td>
                    </tr>
                  ))}
                </tbody></table>}
            </div>
          </div>

          {/* 已完成任務 */}
          {(() => {
            const doneTasks = tasks
              .filter(t => !!t.completedDate)
              .filter(t => !taskFilter.type || t.type === taskFilter.type)
              .sort((a,b) => b.completedDate.localeCompare(a.completedDate))
            const doneByDate: Record<string,Task[]> = {}
            doneTasks.forEach(t => { const d=t.completedDate; (doneByDate[d]||(doneByDate[d]=[])).push(t) })
            const doneDates = Object.keys(doneByDate).sort((a,b)=>b.localeCompare(a))
            if (doneDates.length === 0) return null
            return (
              <div className="bg-white rounded-xl border border-slate-200 mt-5">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <span className="font-semibold text-slate-700 text-sm">已完成任務</span>
                  <span className="text-xs text-slate-400">{doneTasks.length} 件</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <colgroup>
                      <col style={{width:'80px'}}/><col/><col style={{width:'100px'}}/><col style={{width:'80px'}}/>
                      <col style={{width:'130px'}}/><col style={{width:'90px'}}/><col style={{width:'60px'}}/><col style={{width:'90px'}}/><col style={{width:'75px'}}/><col style={{width:'90px'}}/>
                    </colgroup>
                    <thead><tr className="text-left text-slate-400 bg-slate-50 border-b border-slate-100">
                      <th className="px-4 py-2">類型</th><th className="px-3 py-2">內容</th><th className="px-3 py-2">Customer</th>
                      <th className="px-3 py-2">Factory</th><th className="px-3 py-2">PO#</th><th className="px-3 py-2">SC#</th>
                      <th className="px-3 py-2">Owner</th><th className="px-3 py-2">完成日</th><th className="px-3 py-2">狀態</th>
                      <th className="px-3 py-2 text-right">操作</th>
                    </tr></thead>
                    <tbody>
                      {doneDates.map(date => {
                        const list = doneByDate[date]
                        return <>
                          <tr key={`done-hdr-${date}`} className="bg-slate-50 border-y border-slate-100">
                            <td colSpan={10} className="px-4 py-1.5">
                              <span className="font-semibold text-slate-600">{date} 完成</span>
                              <span className="ml-2 text-slate-400">{list.length} 件</span>
                            </td>
                          </tr>
                          {list.map(t => (
                            <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50 row-done">
                              <td className="px-4 py-2"><TypeBadge type={t.type}/></td>
                              <td className="px-3 py-2 text-slate-700 truncate max-w-0">{t.content}</td>
                              <td className="px-3 py-2 text-slate-400">{t.customerCode}</td>
                              <td className="px-3 py-2 text-slate-400">{t.factoryCode}</td>
                              <td className="px-3 py-2 text-slate-400">{t.customerPO}</td>
                              <td className="px-3 py-2 text-slate-400">{t.scNumber}</td>
                              <td className="px-3 py-2">{t.owner&&<span className="px-1.5 py-0.5 bg-slate-100 rounded">{t.owner}</span>}</td>
                              <td className="px-3 py-2 text-emerald-600">✓ {t.completedDate}</td>
                              <td className="px-3 py-2 text-slate-400 truncate max-w-0">{t.status}</td>
                              <td className="px-3 py-2"><ActionBtns onEdit={()=>{setEditingTask(t);setModal('task')}} onDelete={()=>deleteTaskById(t.id)}/></td>
                            </tr>
                          ))}
                        </>
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}
        </div>}

        {tab==='orders' && <div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {(['B','L','G'] as const).map(o=><KpiCard key={o} label={`${o} — 待處理`} value={ownerPending[o]??0} unit="件" valueClass="text-cyan-600"/>)}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 mb-5">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="font-semibold text-slate-700 text-sm">訂單列表</span>
              <div className="flex items-center gap-2">
                <select value={orderFilter.owner} onChange={e=>setOrderFilter(f=>({...f,owner:e.target.value}))} className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                  <option value="">全部負責人</option><option value="B">B</option><option value="L">L</option><option value="G">G</option>
                </select>
                <select value={orderFilter.status} onChange={e=>setOrderFilter(f=>({...f,status:e.target.value as FilterStatus}))} className="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-600">
                  <option value="pending">待處理</option><option value="all">全部</option><option value="done">已完成</option>
                </select>
                <button onClick={()=>{setEditingTask({...EMPTY_TASK,date:today(),type:'PO'});setModal('task')}} className="bg-cyan-600 hover:bg-cyan-700 text-white text-xs px-3 py-1.5 rounded-lg">+ 新增訂單</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {filteredOrders.length===0 ? <div className="p-8 text-center text-slate-300 text-sm">尚無訂單（從儀表板新增類型為「PO」的任務即會出現在此）</div>
                : <table className="w-full text-xs"><thead><tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="px-4 py-2">日期</th><th className="px-3 py-2">內容</th><th className="px-3 py-2">Customer</th><th className="px-3 py-2">Factory</th>
                  <th className="px-3 py-2">PO#</th><th className="px-3 py-2">SC#</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">狀態</th><th className="px-3 py-2">天數</th><th className="px-3 py-2 text-right">操作</th>
                </tr></thead><tbody>
                  {filteredOrders.map(t=>(
                    <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50 ${rowClass(t)}`}>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-600">{t.date}</td>
                      <td className="px-3 py-2 text-slate-700 max-w-xs truncate">{t.content}</td>
                      <td className="px-3 py-2 text-slate-400">{t.customerCode}</td>
                      <td className="px-3 py-2 text-slate-400">{t.factoryCode}</td>
                      <td className="px-3 py-2 text-slate-400">{t.customerPO}</td>
                      <td className="px-3 py-2 text-slate-400">{t.scNumber}</td>
                      <td className="px-3 py-2">{t.owner&&<span className="px-1.5 py-0.5 bg-slate-100 rounded text-xs">{t.owner}</span>}</td>
                      <td className="px-3 py-2 text-slate-400">{t.completedDate||t.status}</td>
                      <td className="px-3 py-2"><DayTag item={t}/></td>
                      <td className="px-3 py-2"><ActionBtns onComplete={!t.completedDate?()=>completeTask(t.id):undefined} onEdit={()=>{setEditingTask(t);setModal('task')}} onDelete={()=>deleteTaskById(t.id)}/></td>
                    </tr>
                  ))}
                </tbody></table>}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-700 text-sm mb-3">每月訂單完成數（依負責人）</p>
            {ownerMonths.length===0 ? <p className="text-slate-300 text-xs">暫無資料</p>
              : <table className="w-full text-xs"><thead><tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="py-1.5 pr-3">月份</th><th className="py-1.5 text-right">B</th><th className="py-1.5 text-right">L</th><th className="py-1.5 text-right">G</th><th className="py-1.5 text-right font-semibold">合計</th>
              </tr></thead><tbody>
                {ownerMonths.map(m=>{const d=ownerMonthly[m]||{};const total=(d.B||0)+(d.L||0)+(d.G||0);return(
                  <tr key={m} className="border-b border-slate-50">
                    <td className="py-1.5 pr-3 font-medium text-slate-700">{m}</td>
                    <td className="py-1.5 text-right text-slate-600">{d.B||0}</td><td className="py-1.5 text-right text-slate-600">{d.L||0}</td><td className="py-1.5 text-right text-slate-600">{d.G||0}</td>
                    <td className="py-1.5 text-right font-semibold text-slate-700">{total}</td>
                  </tr>
                )})}
              </tbody></table>}
          </div>
        </div>}
      </main>

      {modal==='task' && <Modal title={editingTask.id?'編輯任務':'新增任務'} onClose={()=>setModal(null)}>
        <TaskForm data={editingTask} config={config} saving={saving} onChange={setEditingTask} onSubmit={saveTask} onCancel={()=>setModal(null)}/>
      </Modal>}

      {modal==='order' && <Modal title={editingOrder.id?'編輯訂單':'新增訂單'} onClose={()=>setModal(null)}>
        <OrderForm data={editingOrder} config={config} saving={saving} onChange={setEditingOrder} onSubmit={saveOrder} onCancel={()=>setModal(null)}/>
      </Modal>}
    </div>
  )
}
