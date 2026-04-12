import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { parseMoneyToMinor, formatMoney } from '../lib/money'
import { formatYMDToLocale } from '../lib/date'
import { Modal, ModalBody, ModalActions } from '../components/ui/Modal'
import DateField from '../components/DateField'
import { useHolidays } from '../lib/holidays'

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export default function EventDetail() {
  const { eventId = '' } = useParams()
  const qc = useQueryClient()
  const today = new Date()
  const defaultDate = isoDate(new Date(today.getTime() + 24 * 3600 * 1000))
  const [forDate, setForDate] = React.useState<string>(defaultDate)
  const [search, setSearch] = useSearchParams()
  const activeTab = (search.get('tab') || 'day') as 'day'|'history'|'payments'|'admin'
  const setTab = (tab: string) => setSearch((prev) => { const n = new URLSearchParams(prev); n.set('tab', tab); return n })

  const ev = useQuery({ queryKey: ['event', eventId], queryFn: () => api.getEvent(eventId), enabled: !!eventId })
  const meQ = useQuery({ queryKey: ['me'], queryFn: () => api.getMe() })
  const price = useQuery({ queryKey: ['price', eventId], queryFn: () => api.listPriceItems(eventId), enabled: !!eventId })
  const priceAll = useQuery({ queryKey: ['priceAll', eventId], queryFn: () => api.listPriceItems(eventId, true), enabled: !!eventId })
  const members = useQuery({ queryKey: ['members', eventId], queryFn: () => api.listMembers(eventId), enabled: !!eventId })
  // Determine if user is inactive for selected date (based on membership left_at in event TZ)
  const meId = meQ.data?.id
  const meMember = React.useMemo(() => (members.data || []).find((m: any) => m.user_id === meId), [members.data, meId])
  const leftLocalDate = React.useMemo(() => {
    if (!meMember?.left_at || !ev.data) return null
    const tz = ev.data.timezone
    const d = new Date(meMember.left_at)
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    const parts = fmt.formatToParts(d)
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value || ''
    return `${get('year')}-${get('month')}-${get('day')}`
  }, [meMember?.left_at, ev.data])
  const inactiveForDate = !!leftLocalDate && forDate >= leftLocalDate
  const myOrder = useQuery({ queryKey: ['myOrder', eventId, forDate], queryFn: () => api.getMyOrder(eventId, forDate), enabled: !!eventId && !inactiveForDate, retry: false })
  const agg = useQuery({ queryKey: ['agg', eventId, forDate], queryFn: () => api.aggregate(eventId, forDate), enabled: !!eventId })
  const purchase = useQuery({
    queryKey: ['purchase', eventId, forDate],
    queryFn: () => api.getPurchase(eventId, forDate),
    enabled: !!eventId,
    retry: false,
  })
  const balances = useQuery({ queryKey: ['balances', eventId], queryFn: () => api.getBalances(eventId), enabled: !!eventId })
  const payments = useQuery({ queryKey: ['payments', eventId], queryFn: () => api.listPayments(eventId), enabled: !!eventId })
  // Invites (owner-only; 403 if not owner)
  const invites = useQuery({
    queryKey: ['invites', eventId],
    queryFn: () => api.listInvites(eventId),
    enabled: !!eventId && !!members.data && !!meQ.data && !!(members.data as any[]).find((x: any) => x.user_id === meQ.data!.id && x.role === 'owner'),
    retry: false,
  })

  const [quantities, setQuantities] = React.useState<Record<string, number>>({})
  // Rollover preference (per user per event) stored locally
  const prefKey = React.useMemo(() => (meQ.data?.id ? `rollover:${eventId}:${meQ.data.id}` : null), [eventId, meQ.data?.id])
  const [rolloverEnabled, setRolloverEnabled] = React.useState<boolean>(true)
  React.useEffect(() => {
    if (!prefKey) return
    const v = localStorage.getItem(prefKey)
    setRolloverEnabled(v ? v === '1' : true)
  }, [prefKey])
  const toggleRollover = React.useCallback(() => {
    if (!prefKey) return
    setRolloverEnabled((prev) => {
      const next = !prev
      localStorage.setItem(prefKey, next ? '1' : '0')
      return next
    })
  }, [prefKey])

  React.useEffect(() => {
    if (myOrder.data?.is_rolled_over && !rolloverEnabled) {
      setQuantities({})
      return
    }
    const q: Record<string, number> = {}
    myOrder.data?.items?.forEach((it) => (q[it.price_item_id] = it.qty))
    setQuantities(q)
  }, [myOrder.data, rolloverEnabled])

  // Fallback: if no explicit order returned but aggregate shows my quantities (e.g., viewing past active day), derive from aggregate
  React.useEffect(() => {
    if (!meQ.data?.id) return
    if (myOrder.data && (myOrder.data.items || []).length > 0) return
    if (!agg.data || !(agg.data.items || []).length) return
    const mine: Record<string, number> = {}
    for (const it of (agg.data.items as any[])) {
      const consumers = (it.consumers || []) as any[]
      const mineRow = consumers.find((c) => c.user_id === meQ.data!.id)
      if (mineRow && Number(mineRow.qty) > 0) {
        mine[it.price_item_id] = Number(mineRow.qty)
      }
    }
    if (Object.keys(mine).length > 0) setQuantities(mine)
  }, [agg.data, myOrder.data, meQ.data?.id])

  const upsert = useMutation({
    mutationFn: () => {
      const activeIds = new Set((price.data || []).map((pi) => pi.id))
      const items = Object.entries(quantities)
        .filter(([pid, qty]) => qty > 0 && activeIds.has(pid))
        .map(([price_item_id, qty]) => ({ price_item_id, qty }))
      return api.upsertMyOrder(eventId, forDate, items)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['myOrder', eventId, forDate] })
      qc.invalidateQueries({ queryKey: ['agg', eventId, forDate] })
    },
  })

  // --- Payments mutations
  const [paymentFormKey, setPaymentFormKey] = React.useState(0)
  const createPay = useMutation({
    mutationFn: (vars: { to_user_id: string; amount_minor: number; note?: string }) =>
      api.createPayment(eventId, vars.to_user_id, vars.amount_minor, vars.note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
      qc.invalidateQueries({ queryKey: ['balances', eventId] })
      setPaymentFormKey((k) => k + 1) // remount form to reset inputs
    },
  })
  const confirmPay = useMutation({
    mutationFn: (id: string) => api.confirmPayment(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
      qc.invalidateQueries({ queryKey: ['balances', eventId] })
    },
  })
  const declinePay = useMutation({
    mutationFn: (vars: { id: string; reason?: string }) => api.declinePayment(eventId, vars.id, vars.reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
    },
  })
  const cancelPay = useMutation({
    mutationFn: (id: string) => api.cancelPayment(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
    },
  })

  // Finalize purchase from aggregate
  const finalize = useMutation({
    mutationFn: async () => {
      if (!agg.data) throw new Error('No aggregate data')
      const lines = (agg.data.items || [])
        .filter((it: any) => Number(it.total_qty || 0) > 0)
        .map((it: any) => ({
          type: 'price_item',
          price_item_id: it.price_item_id,
          name: it.name,
          qty_final: Number(it.total_qty || 0),
          unit_price_minor: Number(it.unit_price_minor || 0),
          allocations: (it.consumers || []).map((c: any) => ({ user_id: c.user_id, qty: c.qty })),
        }))
      return api.createPurchase(eventId, forDate, lines)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase', eventId, forDate] })
      qc.invalidateQueries({ queryKey: ['balances', eventId] })
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
    },
  })
  const finalizeAdjust = useMutation({
    mutationFn: async ({ lines, notes }: { lines: { type: 'price_item'; price_item_id: string; qty_final: number; unit_price_minor: number; allocations?: { user_id: string; qty: number }[] }[]; notes?: string }) => {
      return api.createPurchase(eventId, forDate, lines, notes)
    },
    onSuccess: () => {
      setWorksheetOpen(false)
      setFinalizeOpen(false)
      qc.invalidateQueries({ queryKey: ['purchase', eventId, forDate] })
      qc.invalidateQueries({ queryKey: ['balances', eventId] })
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
    },
  })

  function finalizeFromWorksheet() {
    const lines = ws.map((ln) => {
      const allocs = Object.entries(ln.delivered)
        .map(([user_id, qty]) => ({ user_id, qty: Number(qty || 0) }))
        .filter((a) => a.qty > 0)
      const qty_final = allocs.reduce((s, a) => s + a.qty, 0)
      return {
        type: 'price_item' as const,
        price_item_id: ln.price_item_id as string,
        qty_final,
        unit_price_minor: ln.unit_price_minor,
        allocations: allocs,
      }
    }).filter((x) => x.qty_final > 0)
    if (!lines.length) {
      alert('No delivered items to finalize.')
      return
    }
    finalizeAdjust.mutate({ lines, notes: wsNotes })
  }
  const [finalizeOpen, setFinalizeOpen] = React.useState(false)
  const [precheckOpen, setPrecheckOpen] = React.useState(false)
  const [worksheetOpen, setWorksheetOpen] = React.useState(false)
  type WSLine = { key: string; price_item_id: string; name: string; unit_price_minor: number; delivered: Record<string, number> }
  const [ws, setWs] = React.useState<WSLine[]>([])
  const [wsNotes, setWsNotes] = React.useState('')
  const [addItemId, setAddItemId] = React.useState('')

  function openWorksheetFromAggregate() {
    if (!agg.data) return
    const lines: WSLine[] = []
    for (const it of (agg.data.items || [])) {
      const total = Number(it.total_qty || 0)
      if (total <= 0) continue
      const delivered: Record<string, number> = {}
      for (const c of (it.consumers || [])) {
        const q = Number(c.qty || 0)
        if (q > 0) delivered[c.user_id] = q
      }
      lines.push({ key: `pi:${it.price_item_id}`, price_item_id: it.price_item_id, name: it.name || '', unit_price_minor: Number(it.unit_price_minor || 0), delivered })
    }
    setWs(lines)
    setWorksheetOpen(true)
    setPrecheckOpen(false)
    setFinalizeOpen(false)
  }
  // Leave intent + leave actions
  const setLeaveIntent = useMutation({
    mutationFn: (wants: boolean) => api.setLeaveIntent(eventId, wants),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['balances', eventId] })
      qc.invalidateQueries({ queryKey: ['members', eventId] })
    },
  })
  const leave = useMutation({
    mutationFn: () => api.leaveEvent(eventId),
    onSuccess: () => {
      window.location.href = '/'
    },
  })

  const memberLabel = React.useMemo(() => {
    const map = new Map<string, string>()
    members.data?.forEach((m) => {
      const label = (m.name && m.name.trim()) || m.email || m.user_id
      map.set(m.user_id, label as string)
    })
    return (id?: string) => (id ? map.get(id) || id : '')
  }, [members.data])

  const isOwner = React.useMemo(() => {
    return meMember?.role === 'owner'
  }, [meMember?.role])

  const priceName = React.useMemo(() => {
    const dict: Record<string, string> = {}
    const list = (priceAll.data ?? price.data ?? []) as any[]
    for (const pi of list) {
      if (pi && pi.id) dict[String(pi.id)] = String(pi.name || '')
    }
    return (id?: string) => (id ? dict[id] || '' : '')
  }, [priceAll.data, price.data])

  // Compute cutoff lock status for the selected date in the event timezone (UI hides TZ name)
  const lockInfo = React.useMemo(() => {
    if (!ev.data) return { locked: false, label: '' }
    const tz = ev.data.timezone
    const cutoffTime = String(ev.data.cutoff_time || '20:00').slice(0,5) // HH:MM
    // now in event timezone
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false, hour: '2-digit', minute: '2-digit' })
    const parts = fmt.formatToParts(new Date())
    const get = (t: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === t)?.value || ''
    const nowDate = `${get('year')}-${get('month')}-${get('day')}`
    const nowHM = `${get('hour')}:${get('minute')}`
    // previous day of forDate (as plain date arithmetic)
    function prevDateStr(d: string) {
      const [y,m,da] = d.split('-').map(Number)
      const dt = new Date(Date.UTC(y, (m||1)-1, da||1))
      dt.setUTCDate(dt.getUTCDate() - 1)
      const yy = dt.getUTCFullYear()
      const mm = String(dt.getUTCMonth()+1).padStart(2,'0')
      const dd = String(dt.getUTCDate()).padStart(2,'0')
      return `${yy}-${mm}-${dd}`
    }
    const prev = prevDateStr(forDate)
    let locked = false
    if (nowDate > prev) locked = true
    else if (nowDate === prev) locked = nowHM >= cutoffTime
    const label = locked ? 'Locked' : `Open until ${cutoffTime}`
    return { locked, label }
  }, [ev.data, forDate])

  const readOnly = !!purchase.data || lockInfo.locked || inactiveForDate
  const statusChip = React.useMemo(() => {
    if (purchase.data) return { className: 'chip finalized', text: 'Finalized' }
    return { className: `chip ${lockInfo.locked ? 'locked' : 'open'}`, text: lockInfo.label }
  }, [purchase.data, lockInfo])

  // Tab-aware polling intervals
  const isDay = activeTab === 'day'
  const isPayments = activeTab === 'payments'
  const dayInterval: number | false = isDay ? (inactiveForDate ? false : (lockInfo.locked ? 60000 : 8000)) : false
  const payInterval: number | false = isPayments ? 8000 : false

  // Recreate queries that need intervals with options depending on tab
  // Note: We re-declare with the same keys, React Query dedupes; only options differ.
  // Day tab polling
  useQuery({
    queryKey: ['myOrder', eventId, forDate],
    queryFn: () => api.getMyOrder(eventId, forDate),
    enabled: !!eventId && isDay && !inactiveForDate,
    retry: false,
    refetchInterval: dayInterval,
    refetchIntervalInBackground: false,
  })
  useQuery({
    queryKey: ['agg', eventId, forDate],
    queryFn: () => api.aggregate(eventId, forDate),
    enabled: !!eventId,
    refetchInterval: dayInterval,
    refetchIntervalInBackground: false,
  })
  // Payments tab polling
  useQuery({
    queryKey: ['balances', eventId],
    queryFn: () => api.getBalances(eventId),
    enabled: !!eventId,
    refetchInterval: payInterval,
    refetchIntervalInBackground: false,
  })
  useQuery({
    queryKey: ['payments', eventId],
    queryFn: () => api.listPayments(eventId),
    enabled: !!eventId,
    refetchInterval: payInterval,
    refetchIntervalInBackground: false,
  })

  // Invalidate on tab change to pull fresh data immediately
  React.useEffect(() => {
    if (!eventId) return
    if (isDay) {
      qc.invalidateQueries({ queryKey: ['myOrder', eventId, forDate] })
      qc.invalidateQueries({ queryKey: ['agg', eventId, forDate] })
      qc.invalidateQueries({ queryKey: ['purchase', eventId, forDate] })
    } else if (isPayments) {
      qc.invalidateQueries({ queryKey: ['payments', eventId] })
      qc.invalidateQueries({ queryKey: ['balances', eventId] })
    }
  }, [activeTab])

  // Invalidate when date changes
  React.useEffect(() => {
    if (!eventId) return
    qc.invalidateQueries({ queryKey: ['myOrder', eventId, forDate] })
    qc.invalidateQueries({ queryKey: ['agg', eventId, forDate] })
    qc.invalidateQueries({ queryKey: ['purchase', eventId, forDate] })
  }, [forDate])

  // Holidays: call hook unconditionally to keep hook order stable
  const holidayCountry = ev.data?.holiday_country_code
  const holidayRegion = ev.data?.holiday_region_code
  const holidays = useHolidays(holidayCountry, holidayRegion, ev.data?.start_date, ev.data?.end_date)

  if (ev.isLoading) return <p className="muted">Loading…</p>
  if (ev.error) return <p className="danger">{String(ev.error)}</p>
  if (!ev.data) return <p className="danger">Event not found</p>

  // Date helpers
  function addDaysStr(dateStr: string, days: number) {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1))
    dt.setUTCDate(dt.getUTCDate() + days)
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }
  const startDate = ev.data?.start_date
  const endDate = ev.data?.end_date
  const prevDisabled = !!startDate && forDate <= startDate
  const nextDisabled = !!endDate && forDate >= endDate

  function changeDate(newDate: string) {
    setForDate(newDate)
    if (!eventId) return
    qc.invalidateQueries({ queryKey: ['myOrder', eventId, newDate] })
    qc.invalidateQueries({ queryKey: ['agg', eventId, newDate] })
    qc.invalidateQueries({ queryKey: ['purchase', eventId, newDate] })
  }

  return (
    <div>
      <p><Link to="/" className="btn ghost">← Back</Link></p>
      <h2 style={{ margin: '8px 0 4px' }}>{ev.data.name}</h2>
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="muted">{formatYMDToLocale(ev.data.start_date)} → {formatYMDToLocale(ev.data.end_date)} • {ev.data.currency}</div>
        {(() => {
          const m = meMember
          if (!m) return null
          if (m.left_at) {
            const left = new Date(m.left_at)
            return <span className="chip muted" style={{ marginLeft: 8 }}>You left on {left.toLocaleDateString()}</span>
          }
          return <span className="chip open" style={{ marginLeft: 8 }}>Active member</span>
        })()}
      </div>

      <div className="tabs section">
        <button className={`tab ${activeTab === 'day' ? 'active' : ''}`} onClick={() => setTab('day')}>Day</button>
        <button className={`tab ${activeTab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>History</button>
        <button className={`tab ${activeTab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>Payments</button>
        {isOwner && (
          <button className={`tab ${activeTab === 'admin' ? 'active' : ''}`} onClick={() => setTab('admin')}>Admin</button>
        )}
      </div>

      {activeTab === 'day' && (
      <>
      <div className="toolbar section">
        <label className="muted">Date</label>
        <div className="row" style={{ alignItems: 'center' }}>
          <button className="btn" onClick={() => !prevDisabled && changeDate(addDaysStr(forDate, -1))} disabled={prevDisabled}>◀</button>
          <DateField value={forDate} onChange={(d) => changeDate(d)} style={{ width: 200, maxWidth: '100%' }} holidaysLabelByDate={holidays.labelByDate} />
          <button className="btn" onClick={() => !nextDisabled && changeDate(addDaysStr(forDate, 1))} disabled={nextDisabled}>▶</button>
        </div>
        <span className={statusChip.className} style={{ marginLeft: 8 }}>{statusChip.text}</span>
        <span className="muted" style={{ marginLeft: 12 }}>
          Orders lock on the previous day at {String(ev.data.cutoff_time || '').slice(0,5)}.
        </span>
        {holidays.labelByDate.get(forDate) && (
          <span className="chip muted" style={{ marginLeft: 8 }}>{holidays.labelByDate.get(forDate)}</span>
        )}
        <span className="spacer" />
        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
          <label className="muted">Rollover</label>
          <button className="btn" onClick={toggleRollover}>{rolloverEnabled ? 'On' : 'Off'}</button>
        </div>
      </div>
      <div className="muted" style={{ marginTop: 6 }}>
        Your latest order rolls over to tomorrow unless changed before cutoff.
      </div>

      <section className="section">
        <div className="card">
          <h3>Your Order</h3>
        {myOrder.data?.is_rolled_over && rolloverEnabled && (
          <div className="chip warn" style={{ marginBottom: 8 }}>Using rolled-over order from a previous day</div>
        )}
        {myOrder.data?.is_rolled_over && !rolloverEnabled && (
          <div className="chip muted" style={{ marginBottom: 8 }}>Rollover disabled — starting empty for this day</div>
        )}
        {price.isLoading && <p>Loading price…</p>}
        {myOrder.isLoading && <p>Loading your order…</p>}
        {inactiveForDate && (
          <div className="muted">
            {meMember?.left_at ? `You left this event on ${new Date(meMember.left_at).toLocaleDateString()}. Orders after this date are not available.` : 'You are not an active member for this date.'}
          </div>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'right' }}>Unit</th>
              <th style={{ textAlign: 'right' }}>Qty</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {price.data?.map((pi) => {
              const qty = quantities[pi.id] || 0
              const total = qty * pi.unit_price_minor
              return (
                <tr key={pi.id}>
                  <td>{pi.name}</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(pi.unit_price_minor, ev.data.currency)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="qty-stepper">
                      <button className="btn" onClick={() => setQuantities((cur) => ({ ...cur, [pi.id]: Math.max(0, (cur[pi.id]||0) - 1) }))} disabled={readOnly || qty <= 0}>−</button>
                      <span className="qty">{qty}</span>
                      <button className="btn" onClick={() => setQuantities((cur) => ({ ...cur, [pi.id]: (cur[pi.id]||0) + 1 }))} disabled={readOnly}>+</button>
                  </div>
                </td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(total, ev.data.currency)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {(() => {
          const list = price.data || []
          let subtotal = 0
          for (const pi of list) {
            const qty = quantities[pi.id] || 0
            if (qty > 0) subtotal += qty * Number(pi.unit_price_minor || 0)
          }
          return (
            <>
              <div className="sticky-total">
                <strong>Your total: {formatMoney(subtotal, ev.data.currency)}</strong>
              </div>
            </>
          )
        })()}
        <button onClick={() => upsert.mutate()} disabled={upsert.isPending || !!purchase.data || lockInfo.locked || inactiveForDate} className="btn primary" style={{ marginTop: 10 }}>
          {purchase.data ? 'Finalized' : upsert.isPending ? 'Saving…' : 'Save Order'}
        </button>
        {upsert.error && <div className="danger">{String(upsert.error)}</div>}
        {lockInfo.locked && (
          <div className="muted" style={{ marginTop: 6 }}>
            Orders are locked since {String(ev.data.cutoff_time || '').slice(0,5)}.
          </div>
        )}
        {/* Inactive items warning */}
        {(() => {
          const activeIds = new Set((price.data || []).map((pi) => pi.id))
          const inactive = (myOrder.data?.items || []).filter((it: any) => !activeIds.has(it.price_item_id))
          if (inactive.length === 0) return null
          return (
            <div className="muted" style={{ marginTop: 8 }}>
              Note: {inactive.length} item(s) in your saved order are no longer available and will be ignored when saving.
            </div>
          )
        })()}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h3>Aggregated For Date</h3>
        {agg.isLoading && <p>Loading aggregate…</p>}
        {agg.error && <p className="danger">{String(agg.error)}</p>}
        {agg.data && (
          <div>
            <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 8 }}>
              <strong>Group Total: {formatMoney(Number(agg.data.total_minor || 0), ev.data.currency)}</strong>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Unit</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {agg.data.items.map((it: any) => (
                  <tr key={it.price_item_id}>
                    <td>{it.name || it.price_item_id}</td>
                    <td style={{ textAlign: 'right' }}>{it.total_qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(Number(it.unit_price_minor || 0), ev.data.currency)}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(Number(it.item_total_minor || 0), ev.data.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {/* Per-member delivery overview */}
            {(() => {
              const perMember = new Map<string, { name: string; items: { label: string; qty: number }[] }>()
              const list = agg.data?.items || []
              list.forEach((it: any) => {
                const label = it.name || priceName(it.price_item_id) || it.price_item_id
                ;(it.consumers || []).forEach((c: any) => {
                  const id = c.user_id as string
                  const qty = Number(c.qty || 0)
                  if (qty <= 0) return
                  if (!perMember.has(id)) perMember.set(id, { name: memberLabel(id), items: [] })
                  perMember.get(id)!.items.push({ label, qty })
                })
              })
              const rows = Array.from(perMember.entries())
              if (rows.length === 0) return null
              return (
                <div style={{ marginTop: 14 }}>
                  <h4 style={{ margin: '8px 0' }}>Per-member delivery</h4>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Items</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(([id, v]) => (
                        <tr key={id}>
                          <td>{v.name}</td>
                          <td>
                            {(v.items || []).map((x, i) => (
                              <span key={i} style={{ marginRight: 10 }}>{x.qty}× {x.label}</span>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </div>
        )}
        </div>
      </section>

      <section className="section">
        <div className="card">
          <h3>Purchase Finalization</h3>
        {purchase.isLoading && <p>Checking purchase…</p>}
        {purchase.data && (
          <div className="vstack">
            <div>Buyer: {memberLabel(purchase.data.buyer_id)}</div>
            <div>Total: {formatMoney(Number(purchase.data.total_minor || 0), ev.data.currency)}</div>
            <details style={{ marginTop: 8 }}>
              <summary>Lines</summary>
              <ul>
                {purchase.data.lines.map((ln: any, idx: number) => {
                  const label = ln.name || priceName(ln.price_item_id) || ln.price_item_id
                  return (
                    <li key={idx}>{label}: {ln.qty_final} × {formatMoney(Number(ln.unit_price_minor || 0), ev.data.currency)}</li>
                  )
                })}
              </ul>
            </details>
          </div>
        )}
        {purchase.error && String(purchase.error).includes('HTTP 404') && (
          <div>
            {(!agg.data || (agg.data.items || []).length === 0) ? (
              <p className="muted">Nothing to finalize yet. <button className="btn ghost" onClick={() => setTab('day')}>Go to Day</button></p>
            ) : (
              <button onClick={() => setPrecheckOpen(true)} disabled={finalize.isPending} className="btn primary">
                {finalize.isPending ? 'Finalizing…' : 'Finalize from Aggregate'}
              </button>
            )}
            {finalize.error && <div className="danger">{String(finalize.error)}</div>}
          </div>
        )}
        {finalizeOpen && agg.data && (
          <Modal open={true} onClose={() => !finalize.isPending && setFinalizeOpen(false)} size="lg" top>
            <ModalBody>
              <h3>Finalize purchase</h3>
              <div className="muted" style={{ marginBottom: 8 }}>
                {forDate} • Buyer: {memberLabel(meQ.data?.id)}
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(agg.data.items || []).filter((it: any) => Number(it.total_qty || 0) > 0).map((it: any) => (
                    <tr key={it.price_item_id}>
                      <td>{it.name || priceName(it.price_item_id) || it.price_item_id}</td>
                      <td style={{ textAlign: 'right' }}>{it.total_qty}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(Number(it.unit_price_minor || 0), ev.data.currency)}</td>
                      <td style={{ textAlign: 'right' }}>{formatMoney(Number(it.item_total_minor || 0), ev.data.currency)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={{ textAlign: 'right' }}><strong>Total</strong></td>
                    <td style={{ textAlign: 'right' }}><strong>{formatMoney(Number(agg.data.total_minor || 0), ev.data.currency)}</strong></td>
                  </tr>
                </tfoot>
              </table>
            </ModalBody>
            <ModalActions>
              <button className="btn" onClick={() => setFinalizeOpen(false)} disabled={finalize.isPending}>Cancel</button>
              <button className="btn primary" onClick={() => finalize.mutate()} disabled={finalize.isPending}>
                {finalize.isPending ? 'Finalizing…' : 'Confirm finalize'}
              </button>
            </ModalActions>
          </Modal>
        )}
        {precheckOpen && (
          <Modal open={true} onClose={() => setPrecheckOpen(false)} size="sm" top>
            <ModalBody>
              <h3>Everything bought as ordered?</h3>
              <p className="muted">Did you buy all items as requested, or do you need to record adjustments (shortages or substitutions)?</p>
            </ModalBody>
            <ModalActions>
              <button className="btn" onClick={() => setPrecheckOpen(false)}>Cancel</button>
              <button className="btn primary" onClick={() => { setPrecheckOpen(false); setFinalizeOpen(true) }}>Yes, finalize as is</button>
              <button className="btn" onClick={openWorksheetFromAggregate}>No, make adjustments</button>
            </ModalActions>
          </Modal>
        )}
        {worksheetOpen && (
          <Modal open={true} onClose={() => setWorksheetOpen(false)} size="lg" top dim>
            <ModalBody>
              <h3>Finalize with adjustments</h3>
              <div className="muted" style={{ marginBottom: 8 }}>{forDate} • Buyer: {memberLabel(meQ.data?.id)}</div>
              {!ws.length && <div className="muted">No lines to adjust.</div>}
              <div className="worksheet-row" style={{ marginBottom: 8 }}>
                <strong>Add price list item</strong>
                <div className="row" style={{ marginTop: 6, alignItems: 'center', gap: 8 }}>
                  {(() => {
                    const wsIds = new Set(ws.map((w) => w.price_item_id))
                    const items = (price.data || []).filter((pi: any) => pi && pi.id && !wsIds.has(pi.id))
                    return (
                      <>
                        <select className="input select" value={addItemId} onChange={(e)=> setAddItemId(e.target.value)} style={{ minWidth: 280 }}>
                          <option value="">-- choose item --</option>
                          {items.map((pi: any) => (
                            <option key={pi.id} value={pi.id}>{pi.name} • {formatMoney(Number(pi.unit_price_minor || 0), ev.data.currency)}</option>
                          ))}
                        </select>
                        <button className="btn" onClick={() => {
                          const id = addItemId
                          if (!id) return
                          const pi = (price.data || []).find((x: any) => String(x.id) === String(id))
                          if (!pi) return
                          setWs((cur) => ([...cur, { key: `pi:${id}:${Date.now()}`, price_item_id: String(id), name: String(pi.name || ''), unit_price_minor: Number(pi.unit_price_minor || 0), delivered: {} }]))
                          setAddItemId('')
                        }}>Add</button>
                      </>
                    )
                  })()}
                </div>
              </div>
              {ws.map((ln, idx) => {
                const sum = Object.values(ln.delivered).reduce((s, q) => s + Number(q || 0), 0)
                return (
                  <div key={ln.key} className="worksheet-row" style={{ marginBottom: 8 }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong>{ln.name || priceName(ln.price_item_id) || ln.price_item_id}</strong>
                        <span className="mini muted">• {formatMoney(ln.unit_price_minor, ev.data.currency)}</span>
                      </div>
                      <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                        <span className="mini">Delivered total: {sum}</span>
                      </div>
                    </div>
                    <table className="table" style={{ marginTop: 6 }}>
                      <thead>
                        <tr>
                          <th>Member</th>
                          <th style={{ textAlign: 'right' }}>Delivered</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.keys(ln.delivered).map((uid) => (
                          <tr key={uid}>
                            <td>{memberLabel(uid)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="qty-stepper">
                                <button className="btn" onClick={() => setWs((cur) => cur.map((w,i)=> i===idx?{...w, delivered:{...w.delivered, [uid]: Math.max(0, Number((w.delivered[uid]||0)-1))}}:w))}>−</button>
                                <span className="qty">{ln.delivered[uid] || 0}</span>
                                <button className="btn" onClick={() => setWs((cur) => cur.map((w,i)=> i===idx?{...w, delivered:{...w.delivered, [uid]: Number((w.delivered[uid]||0)+1)}}:w))}>+</button>
                              </div>
                            </td>
                            <td><button className="btn" onClick={() => setWs((cur)=> cur.map((w,i)=> { if (i!==idx) return w; const nd={...w}; const d={...nd.delivered}; delete d[uid]; nd.delivered=d; return nd }))}>Remove</button></td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={3}>
                            {(() => {
                              const existing = new Set(Object.keys(ln.delivered))
                              const candidates = (members.data || []).map((m:any)=> m.user_id).filter((id)=> id && !existing.has(id))
                              if (candidates.length === 0) return <div className="mini muted">All members included.</div>
                              let local = '' as string
                              return (
                                <div className="row">
                                  <label className="muted mini">Add member</label>
                                  <select className="input select" defaultValue="" onChange={(e)=> { local = e.target.value }} style={{ minWidth: 240 }}>
                                    <option value="">-- choose member --</option>
                                    {candidates.map((id)=> (<option key={id} value={id}>{memberLabel(id)}</option>))}
                                  </select>
                                  <button className="btn" onClick={() => { if (local) setWs((cur)=> cur.map((w,i)=> i===idx?{...w, delivered:{...w.delivered, [local]: 1}}:w)) }}>Add</button>
                                </div>
                              )
                            })()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <div className="row" style={{ marginTop: 10 }}>
                      <button className="btn" onClick={() => setWs((cur)=> cur.map((w,i)=> i===idx?{...w, delivered: Object.fromEntries(Object.keys(w.delivered).map(k=>[k,0]))}:w))}>Set all 0</button>
                    </div>
                  </div>
                )
              })}
              <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
                <div className="row">
                  <label className="muted">Notes</label>
                  <input className="input" value={wsNotes} onChange={(e)=> setWsNotes(e.target.value)} placeholder="Notes (optional)" style={{ minWidth: 280 }} />
                </div>
              </div>
            </ModalBody>
            <ModalActions>
              <button className="btn" onClick={() => setWorksheetOpen(false)}>Close</button>
              <button className="btn primary" onClick={() => finalizeFromWorksheet()}>Submit adjustments</button>
            </ModalActions>
          </Modal>
        )}
        </div>
      </section>
      </>
      )}

      {activeTab === 'payments' && (
      <section className="section">
        <div className="card">
          <h3>Balances</h3>
        {balances.isLoading && <p>Loading balances…</p>}
        {balances.error && <p className="danger">{String(balances.error)}</p>}
        {balances.data && (
          <>
          {(() => {
            const leavers = (balances.data?.totals || []).filter((t: any) => t.wants_to_leave)
            if (leavers.length === 0) return null
            return (
              <div className="muted" style={{ marginBottom: 8 }}>
                Members preparing to leave: {leavers.map((t: any) => memberLabel(t.user_id)).join(', ')}
              </div>
            )
          })()}
          <table className="table" style={{ maxWidth: 520 }}>
            <thead>
              <tr>
                <th>User</th>
                <th style={{ textAlign: 'right' }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {[...(balances.data.totals || [])]
                .sort((a: any, b: any) => (a.user_id < b.user_id ? -1 : 1))
                .map((b) => (
                  <tr key={b.user_id}>
                    <td>
                      {memberLabel(b.user_id)}
                      {b.wants_to_leave && <span className="chip warn" style={{ marginLeft: 6 }}>Leaving</span>}
                    </td>
                    <td style={{ textAlign: 'right' }} className={(b.balance_minor || 0) < 0 ? 'danger' : 'ok'}>
                      {formatMoney(Number(b.balance_minor || 0), balances.data?.currency)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {balances.data && (
            <SettleMyBalance
              me={myOrder.data?.user_id}
              totals={balances.data?.totals || []}
              currency={balances.data?.currency}
              label={memberLabel}
              onCreatePayment={(to, amount, note) => createPay.mutate({ to_user_id: to, amount_minor: amount, note })}
              isCreating={createPay.isPending}
            />
          )}
          {(() => {
            const me = myOrder.data?.user_id
            if (!me || !balances.data) return null
            const my = (balances.data.totals || []).find((t: any) => t.user_id === me)
            const myBal = Number(my?.balance_minor || 0)
            const wants = !!my?.wants_to_leave
            return (
              <div className="card" style={{ marginTop: 12 }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div>
                    <strong>Leaving the event</strong>
                    <div className="muted">Mark your intent and settle your balance to leave.</div>
                  </div>
                  <div className="row">
                    <label className="muted">Preparing to leave</label>
                    <input type="checkbox" checked={wants} onChange={(e) => setLeaveIntent.mutate(e.target.checked)} />
                  </div>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" onClick={() => leave.mutate()} disabled={leave.isPending}>
                    {myBal === 0 ? 'Leave event' : 'Try leave (show payout plan)'}
                  </button>
                </div>
                {leave.error && (
                  <div style={{ marginTop: 8 }}>
                    <LeavePlanView
                      detail={(leave.error as any).detail}
                      currency={balances.data.currency}
                      label={memberLabel}
                      onCreatePayment={(to, amt) => createPay.mutate({ to_user_id: to, amount_minor: amt, note: 'Balance settlement' })}
                      creating={createPay.isPending}
                    />
                  </div>
                )}
              </div>
            )
          })()}
          </>
        )}
        </div>
      </section>
      )}

      {activeTab === 'history' && (
      <section className="section">
        <div className="card">
          <h3>Purchases History</h3>
          <PurchasesHistory eventId={eventId} currency={ev.data.currency} onPickDate={(d) => setForDate(d)} label={memberLabel} itemName={priceName} />
        </div>
      </section>
      )}

      {activeTab === 'payments' && (
      <section className="section">
        <div className="card">
          <h3>Payments</h3>
        {payments.isLoading && <p>Loading payments…</p>}
        {payments.error && <p className="danger">{String(payments.error)}</p>}
        {(() => {
          const me = meQ.data?.id
          let list = (payments.data || []).filter((p: any) => !me || p.from_user_id === me || p.to_user_id === me)
          // Pin pending payouts to me at the top
          if (me) {
            list = list.sort((a: any, b: any) => {
              const aPin = a.status === 'pending' && a.to_user_id === me ? 1 : 0
              const bPin = b.status === 'pending' && b.to_user_id === me ? 1 : 0
              return bPin - aPin
            })
          }
          if (!list.length) return null
          return (
          <table className="table">
            <thead>
              <tr>
                <th>From → To</th>
                <th>Note</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p: any) => {
                const me = meQ.data?.id
                const isRecipient = me && p.to_user_id === me
                const isProposer = me && p.from_user_id === me
                const statusLabel = p.status === 'pending'
                  ? (isRecipient ? 'Awaiting you' : 'Awaiting recipient')
                  : (p.status === 'confirmed' ? 'Confirmed' : p.status === 'declined' ? 'Declined' : p.status === 'canceled' ? 'Canceled' : p.status)
                const statusClass = p.status === 'pending'
                  ? (isRecipient ? 'chip warn' : 'chip')
                  : (p.status === 'confirmed' ? 'chip ok' : (p.status === 'declined' || p.status === 'canceled') ? 'chip locked' : 'chip')
                return (
                  <tr key={p.id} className={p.status === 'pending' && isRecipient ? 'needs-action' : ''}>
                    <td>{memberLabel(p.from_user_id)} → {memberLabel(p.to_user_id)}</td>
                    <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.note}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(Number(p.amount_minor), p.currency)}</td>
                    <td><span className={statusClass}>{statusLabel}</span></td>
                    <td>
                      {p.status === 'pending' && isRecipient && (
                        <>
                          <button onClick={() => confirmPay.mutate(p.id)} disabled={confirmPay.isPending} className="btn" style={{ marginRight: 8 }}>Confirm</button>
                          <button onClick={() => {
                            const reason = window.prompt('Decline reason (optional)') || undefined
                            declinePay.mutate({ id: p.id, reason })
                          }} disabled={declinePay.isPending} className="btn">Decline</button>
                        </>
                      )}
                      {p.status === 'pending' && isProposer && (
                        <button onClick={() => cancelPay.mutate(p.id)} disabled={cancelPay.isPending} className="btn">Cancel</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          )
        })()}

        {(() => {
          // Always allow logging a payment manually
          const me = meQ.data?.id
          if (!me) return null
          const candidates = (members.data || []).map((m: any) => m.user_id).filter((id) => id && id !== me)
          const [open, setOpen] = [true, () => {}] // default open in this simple UI
          return (
            <div style={{ marginTop: 12 }}>
              <h4 style={{ margin: '6px 0' }}>Log a payment</h4>
              {open && (
                <NewPaymentForm
                  key={paymentFormKey}
                  currency={ev.data.currency}
                  me={me}
                  candidates={candidates}
                  totals={(balances.data?.totals || []) as any}
                  label={memberLabel}
                  onSubmit={(to, amount_minor, note) => createPay.mutate({ to_user_id: to, amount_minor, note })}
                />
              )}
            </div>
          )
        })()}
        {createPay.error && <div className="danger">{String(createPay.error)}</div>}
        </div>
      </section>
      )}

      {isOwner && activeTab === 'admin' && (
        <>
          <section className="section">
            <div className="card">
              <h3>Price List (Owner)</h3>
              <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
                Prices are fixed; to change prices, add a new item and deactivate the old one.
              </div>
              <PriceListAdmin eventId={eventId} currency={ev.data.currency} />
            </div>
          </section>
          <section className="section">
            <div className="card">
              <h3>Holidays</h3>
              <div className="muted" style={{ marginTop: -6, marginBottom: 8 }}>
                Configure which public holidays to show in the calendar and day view.
              </div>
              <EventHolidaysSettings eventId={eventId} country={ev.data.holiday_country_code} region={ev.data.holiday_region_code} />
            </div>
          </section>
          <section className="section">
            <div className="card">
              <h3>Invites</h3>
            {invites.isLoading && <p>Loading invites…</p>}
            {invites.error && String(invites.error).includes('HTTP 403') && (
              <p className="muted">Owner-only section.</p>
            )}
            {!invites.error && invites.data && (
              <>
                <div className="row" style={{ marginBottom: 8 }}>
                  <CreateGroupInviteButton eventId={eventId} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <CreateSingleInviteForm eventId={eventId} />
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Expires</th>
                      <th>Uses</th>
                      <th>Revoked</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.data.map((inv: any) => (
                      <tr key={inv.id}>
                        <td className="code">{inv.id}</td>
                        <td>{new Date(inv.expires_at).toLocaleString()}</td>
                        <td>{inv.used_count}{inv.max_uses ? ` / ${inv.max_uses}` : ''}</td>
                        <td>{inv.revoked_at ? new Date(inv.revoked_at).toLocaleString() : '-'}</td>
                        <td>
                          {!inv.revoked_at && (
                            <RevokeInviteButton eventId={eventId} inviteId={inv.id} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function NewPaymentForm({ currency, me, candidates, totals, label, onSubmit }: { currency: string; me?: string; candidates: string[]; totals: { user_id: string; balance_minor: number }[]; label: (id?: string) => string; onSubmit: (to: string, amount_minor: number, note?: string) => void }) {
  const [payTo, setPayTo] = React.useState('')
  const [payAmount, setPayAmount] = React.useState('') // display in major units
  const [payNote, setPayNote] = React.useState('')

  const filtered = candidates.filter((id) => id && id !== me)
  const parsedMinor = parseMoneyToMinor(payAmount)
  const disabled = !payTo || !payAmount || !isFinite(parsedMinor) || parsedMinor <= 0

  const myBal = Number((totals || []).find((t) => t.user_id === me)?.balance_minor || 0)
  const toBal = Number((totals || []).find((t) => t.user_id === payTo)?.balance_minor || 0)

  React.useEffect(() => {
    if (!payTo) return
    if (myBal < 0 && toBal > 0) {
      const exact = Math.min(-myBal, toBal)
      setPayAmount((exact / 100).toFixed(2))
    }
  }, [payTo])

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <h4 style={{ margin: 0, marginBottom: 8 }}>New Payment</h4>
      <div className="row">
        <label className="muted">To</label>
        <select className="input select" value={payTo} onChange={(e) => setPayTo(e.target.value)} style={{ width: 320 }}>
          <option value="">-- choose recipient --</option>
          {filtered.map((id) => (
            <option key={id} value={id}>{label(id)}</option>
          ))}
        </select>
        <label className="muted">Amount</label>
        <input
          className="input"
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
          placeholder={`0,00`}
          inputMode="decimal"
          style={{ width: 140 }}
        />
        <span className="muted">{currency}</span>
        {myBal < 0 && toBal > 0 && (
          <div className="hstack">
            <button type="button" className="btn" onClick={() => setPayAmount((Math.min(-myBal, toBal) / 100).toFixed(2))}>Exact my balance</button>
          </div>
        )}
        <input
          className="input"
          value={payNote}
          onChange={(e) => setPayNote(e.target.value)}
          placeholder="Note (optional)"
          style={{ minWidth: 240 }}
        />
        <button
          className="btn"
          onClick={() => {
            const amount_minor = parseMoneyToMinor(payAmount)
            if (isFinite(amount_minor) && amount_minor > 0 && payTo) {
              onSubmit(payTo, amount_minor, payNote || undefined)
            }
          }}
          disabled={disabled}
        >
          Create
        </button>
      </div>
    </div>
  )
}

function EventHolidaysSettings({ eventId, country, region }: { eventId: string; country?: string | null; region?: string | null }) {
  const qc = useQueryClient()
  const [c, setC] = React.useState(country || '')
  const [r, setR] = React.useState(region || '')
  const update = useMutation({
    mutationFn: () => api.updateEvent(eventId, {
      holiday_country_code: c.trim() ? c.trim().toUpperCase() : null,
      holiday_region_code: r.trim() ? r.trim().toUpperCase() : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', eventId] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
  return (
    <div className="vstack">
      <div className="row">
        <div className="field">
          <label className="muted">Country</label>
          <input className="input" placeholder="DE" value={c} onChange={(e) => setC(e.target.value)} style={{ width: 120 }} />
        </div>
        <div className="field">
          <label className="muted">Region (optional)</label>
          <input className="input" placeholder="DE-BE" value={r} onChange={(e) => setR(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn" onClick={() => update.mutate()} disabled={update.isPending}>Save</button>
      </div>
      {update.error && <span className="danger">{String(update.error)}</span>}
      {update.isSuccess && <span className="ok">Saved.</span>}
    </div>
  )
}

function CreateGroupInviteButton({ eventId }: { eventId: string }) {
  const qc = useQueryClient()
  const [created, setCreated] = React.useState<{ token: string; invite_url: string } | null>(null)
  const create = useMutation({
    mutationFn: () => api.createGroupInvite(eventId),
    onSuccess: (res) => {
      setCreated({ token: res.token, invite_url: res.invite_url })
      qc.invalidateQueries({ queryKey: ['invites', eventId] })
    },
  })
  return (
    <div>
      <button onClick={() => create.mutate()} disabled={create.isPending} className="btn">Create/Rotate Group Invite</button>
      {create.error && <span className="danger" style={{ marginLeft: 8 }}>{String(create.error)}</span>}
      {created && (
        <div className="card" style={{ marginTop: 8 }}>
          {(() => {
            const absolute = new URL(created.invite_url, window.location.origin).toString()
            return (
              <div className="row" style={{ alignItems: 'center' }}>
                <strong>Invite URL:</strong> <span className="code" style={{ overflowWrap: 'anywhere' }}>{absolute}</span>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(absolute)}>Copy URL</button>
              </div>
            )
          })()}
          <div><strong>Token:</strong> <span className="code">{created.token}</span></div>
          <div className="muted">Share either the URL or token. Users can redeem at /join.</div>
        </div>
      )}
    </div>
  )
}

function RevokeInviteButton({ eventId, inviteId }: { eventId: string; inviteId: string }) {
  const qc = useQueryClient()
  const revoke = useMutation({
    mutationFn: () => api.revokeInvite(eventId, inviteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites', eventId] }),
  })
  return (
    <button onClick={() => revoke.mutate()} disabled={revoke.isPending} className="btn">Revoke</button>
  )
}

function CreateSingleInviteForm({ eventId }: { eventId: string }) {
  const qc = useQueryClient()
  const [email, setEmail] = React.useState('')
  const [ttl, setTtl] = React.useState(14)
  const [created, setCreated] = React.useState<{ token: string; invite_url: string } | null>(null)
  const create = useMutation({
    mutationFn: () => api.createSingleInvite(eventId, ttl, email || undefined),
    onSuccess: (res) => {
      setCreated({ token: res.token, invite_url: res.invite_url })
      qc.invalidateQueries({ queryKey: ['invites', eventId] })
      setEmail('')
    },
  })
  return (
    <div className="row">
      <label className="muted">Single-use Invite</label>
      <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email (optional)" />
      <label className="muted">TTL days</label>
      <input className="input" type="number" min={1} value={ttl} onChange={(e) => setTtl(Math.max(1, parseInt(e.target.value || '1')))} style={{ width: 100 }} />
      <button onClick={() => create.mutate()} disabled={create.isPending} className="btn">Create</button>
      {create.error && <span className="danger">{String(create.error)}</span>}
      {created && (
        <div className="card" style={{ width: '100%' }}>
          {(() => {
            const absolute = new URL(created.invite_url, window.location.origin).toString()
            return (
              <div className="row" style={{ alignItems: 'center' }}>
                <strong>Invite URL:</strong> <span className="code" style={{ overflowWrap: 'anywhere' }}>{absolute}</span>
                <button className="btn" onClick={() => navigator.clipboard?.writeText(absolute)}>Copy URL</button>
              </div>
            )
          })()}
          <div><strong>Token:</strong> <span className="code">{created.token}</span></div>
        </div>
      )}
    </div>
  )
}

function PriceListAdmin({ eventId, currency }: { eventId: string; currency: string }) {
  const qc = useQueryClient()
  const items = useQuery({ queryKey: ['priceAll', eventId], queryFn: () => api.listPriceItems(eventId, true), enabled: !!eventId })
  const [name, setName] = React.useState('')
  const [price, setPrice] = React.useState('') // major units

  const add = useMutation({
    mutationFn: () => api.addPriceItem(eventId, name.trim(), parseMoneyToMinor(price)),
    onSuccess: () => {
      setName('')
      setPrice('')
      qc.invalidateQueries({ queryKey: ['priceAll', eventId] })
      qc.invalidateQueries({ queryKey: ['price', eventId] })
    },
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => api.deactivatePriceItem(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['priceAll', eventId] })
      qc.invalidateQueries({ queryKey: ['price', eventId] })
    },
  })
  const activate = useMutation({
    mutationFn: (id: string) => api.activatePriceItem(eventId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['priceAll', eventId] })
      qc.invalidateQueries({ queryKey: ['price', eventId] })
    },
  })

  const priceMinor = parseMoneyToMinor(price)
  const disabled = !name.trim() || !price || !isFinite(priceMinor) || priceMinor <= 0

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <input className="input" placeholder="Item name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Price (e.g. 1,50)" value={price} onChange={(e) => setPrice(e.target.value)} style={{ width: 160 }} />
        <span className="muted">{currency}</span>
        <button onClick={() => add.mutate()} disabled={add.isPending || disabled} className="btn">{add.isPending ? 'Adding…' : 'Add Item'}</button>
        {add.error && <span className="danger">{String(add.error)}</span>}
      </div>
      {(!name.trim()) && <div className="muted">Enter a name.</div>}
      {(!price || !isFinite(priceMinor)) && <div className="muted">Enter a valid price, e.g. 1,50.</div>}
      {(isFinite(priceMinor) && priceMinor <= 0) && <div className="muted">Price must be greater than 0.</div>}

      {items.isLoading && <p className="muted">Loading items…</p>}
      {items.error && <p className="danger">{String(items.error)}</p>}
      {items.data && (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Unit</th>
              <th>Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.data.map((pi) => (
              <tr key={pi.id}>
                <td>{pi.name}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(pi.unit_price_minor, currency)}</td>
                <td>{pi.active ? 'Yes' : 'No'}</td>
                <td>
                  {pi.active ? (
                    <button className="btn" onClick={() => deactivate.mutate(pi.id)} disabled={deactivate.isPending}>Deactivate</button>
                  ) : (
                    <button className="btn" onClick={() => activate.mutate(pi.id)} disabled={activate.isPending}>Activate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function PurchasesHistory({ eventId, currency, onPickDate, label, itemName }: { eventId: string; currency: string; onPickDate: (d: string) => void; label: (id?: string) => string; itemName: (id?: string) => string }) {
  const list = useQuery({ queryKey: ['purchases', eventId], queryFn: () => api.listPurchases(eventId), enabled: !!eventId })
  if (list.isLoading) return <p className="muted">Loading purchases…</p>
  if (list.error) return <p className="danger">{String(list.error)}</p>
  if (!list.data || list.data.length === 0) return <p className="muted">No purchases yet.</p>
  return (
    <table className="table">
      <thead>
        <tr>
          <th></th>
          <th>Date</th>
          <th>Buyer</th>
          <th style={{ textAlign: 'right' }}>Total</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {list.data.map((p: any) => (
          <PurchaseRow key={p.date} eventId={eventId} row={p} currency={currency} label={label} itemName={itemName} onPickDate={onPickDate} />
        ))}
      </tbody>
    </table>
  )
}

function SettleMyBalance({ me, totals, currency, label, onCreatePayment, isCreating }: {
  me?: string,
  totals: { user_id: string; balance_minor: number; wants_to_leave?: boolean }[],
  currency: string,
  label: (id?: string) => string,
  onCreatePayment: (to: string, amount_minor: number, note?: string) => void,
  isCreating?: boolean,
}) {
  const my = totals.find((t) => t.user_id === me)
  if (!me || !my) return null
  const myBal = Number(my.balance_minor || 0)
  if (myBal === 0) return <p className="ok" style={{ marginTop: 8 }}>You are even.</p>

  const creditors = totals.filter((t) => Number(t.balance_minor) > 0 && t.user_id !== me)
  const debtors = totals.filter((t) => Number(t.balance_minor) < 0 && t.user_id !== me)

  if (myBal < 0) {
    const ordered = [...creditors]
    // prioritize leavers first, then largest balances
    ordered.sort((a, b) => {
      const la = a.wants_to_leave ? 1 : 0
      const lb = b.wants_to_leave ? 1 : 0
      if (la !== lb) return lb - la
      return Number(b.balance_minor) - Number(a.balance_minor)
    })
    let remaining = -myBal
    const plan: { to: string; amount: number }[] = []
    for (const c of ordered) {
      if (remaining <= 0) break
      const canPay = Math.min(remaining, Number(c.balance_minor || 0))
      if (canPay > 0) {
        plan.push({ to: c.user_id, amount: canPay })
        remaining -= canPay
      }
    }
    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ margin: '6px 0' }}>Settle my balance</h4>
        <p className="muted">You owe {( -myBal / 100).toFixed(2)} {currency}. Pay the following to get even:</p>
        <ul>
          {plan.map((p, i) => (
            <li key={i}>
              Pay {(p.amount / 100).toFixed(2)} {currency} to {label(p.to)}
              <button
                className="btn"
                style={{ marginLeft: 8 }}
                onClick={() => onCreatePayment(p.to, p.amount, 'Balance settlement')}
                disabled={!!isCreating}
              >
                Create payment
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  } else {
    let remaining = myBal
    const plan: { from: string; amount: number }[] = []
    const ordered = [...debtors]
    // prioritize leavers first, then most negative balances
    ordered.sort((a, b) => {
      const la = a.wants_to_leave ? 1 : 0
      const lb = b.wants_to_leave ? 1 : 0
      if (la !== lb) return lb - la
      return Number(a.balance_minor) - Number(b.balance_minor)
    })
    for (const d of ordered) {
      if (remaining <= 0) break
      const willPay = Math.min(remaining, -Number(d.balance_minor || 0))
      if (willPay > 0) {
        plan.push({ from: d.user_id, amount: willPay })
        remaining -= willPay
      }
    }
    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ margin: '6px 0' }}>Settle my balance</h4>
        <p className="muted">You should receive {(myBal / 100).toFixed(2)} {currency}. Ask the following to pay you:</p>
        <ul>
          {plan.map((p, i) => (
            <li key={i}>
              {label(p.from)} should pay you {(p.amount / 100).toFixed(2)} {currency}
            </li>
          ))}
        </ul>
      </div>
    )
  }
}

function LeavePlanView({ detail, currency, label, onCreatePayment, creating }: {
  detail: any,
  currency: string,
  label: (id?: string) => string,
  onCreatePayment: (to: string, amount_minor: number) => void,
  creating?: boolean,
}) {
  const payload = detail && typeof detail === 'object' && 'detail' in detail ? (detail as any).detail : detail
  if (!payload || (payload as any).reason !== 'balance_not_zero') {
    return <div className="danger">Unable to leave.</div>
  }
  const [dismissed, setDismissed] = React.useState(false)
  if (dismissed) return <div className="muted">Dismissed.</div>
  const bal = Number((payload as any).balance_minor || 0)
  const plan: any[] = Array.isArray((payload as any).plan) ? (payload as any).plan : []
  return (
    <div>
      {bal < 0 ? (
        <div>
          <div className="danger">Your balance is not zero. You owe {( -bal / 100).toFixed(2)} {currency}.</div>
          <div className="muted">Pay the following to get even:</div>
          <ul>
            {plan.map((p, i) => (
              <li key={i}>
                <input type="checkbox" readOnly style={{ marginRight: 6 }} />
                Pay {(Number(p.amount_minor) / 100).toFixed(2)} {currency} to {label(p.to_user_id)}
                <button
                  className="btn"
                  style={{ marginLeft: 8 }}
                  onClick={() => onCreatePayment(p.to_user_id, Number(p.amount_minor))}
                  disabled={!!creating}
                >
                  Create payment
                </button>
              </li>
            ))}
          </ul>
          <button className="btn" onClick={() => setDismissed(true)}>Dismiss</button>
        </div>
      ) : (
        <div>
          <div className="danger">Your balance is not zero. You should receive {(bal / 100).toFixed(2)} {currency}.</div>
          <div className="muted">Ask the following to pay you:</div>
          <ul>
            {plan.map((p, i) => (
              <li key={i}>
                <input type="checkbox" readOnly style={{ marginRight: 6 }} />
                {label(p.from_user_id)} should pay you {(Number(p.amount_minor) / 100).toFixed(2)} {currency}
              </li>
            ))}
          </ul>
          <button className="btn" onClick={() => setDismissed(true)}>Dismiss</button>
        </div>
      )}
    </div>
  )
}

function PurchaseRow({ eventId, row, currency, label, itemName, onPickDate }: { eventId: string; row: any; currency: string; label: (id?: string) => string; itemName: (id?: string) => string; onPickDate: (d: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const details = useQuery({
    queryKey: ['purchase', eventId, row.date],
    queryFn: () => api.getPurchase(eventId, row.date),
    enabled: open,
    retry: false,
  })
  return (
    <>
      <tr>
        <td>
          <button className="btn" onClick={() => setOpen((v) => !v)}>{open ? '−' : '+'}</button>
        </td>
        <td>{row.date}</td>
        <td>{label(row.buyer_id)}</td>
        <td style={{ textAlign: 'right' }}>{formatMoney(Number(row.total_minor || 0), currency)}</td>
        <td>
          <button className="btn" onClick={() => onPickDate(row.date)}>View</button>
        </td>
      </tr>
      {open && (
        <tr>
          <td></td>
          <td colSpan={4}>
            {details.isLoading && <div className="muted">Loading…</div>}
            {details.error && <div className="danger">{String(details.error)}</div>}
            {details.data && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Aggregate</div>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Unit</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.data.lines.map((ln: any, idx: number) => {
                      const labelText = ln.name || itemName(ln.price_item_id) || ln.price_item_id
                      const unit = formatMoney(Number(ln.unit_price_minor || 0), currency)
                      const total = formatMoney(Number((ln.qty_final || 0) * (ln.unit_price_minor || 0)), currency)
                      return (
                        <tr key={idx}>
                          <td>{labelText}</td>
                          <td style={{ textAlign: 'right' }}>{ln.qty_final}</td>
                          <td style={{ textAlign: 'right' }}>{unit}</td>
                          <td style={{ textAlign: 'right' }}>{total}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {(() => {
                  // Build per-member view from allocations
                  const per: Map<string, { name: string; items: { label: string; qty: number }[] }> = new Map()
                  for (const ln of details.data.lines as any[]) {
                    const lbl = ln.name || itemName(ln.price_item_id) || ln.price_item_id
                    const allocs = Array.isArray(ln.allocations) ? (ln.allocations as any[]) : []
                    for (const a of allocs) {
                      const id = String(a.user_id)
                      const qty = Number(a.qty || 0)
                      if (qty <= 0) continue
                      if (!per.has(id)) per.set(id, { name: label(id), items: [] })
                      per.get(id)!.items.push({ label: lbl, qty })
                    }
                  }
                  const rows = Array.from(per.entries())
                  if (rows.length === 0) return null
                  rows.sort((a, b) => a[1].name.localeCompare(b[1].name))
                  return (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Per member</div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Member</th>
                            <th>Items</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map(([id, v]) => (
                            <tr key={id}>
                              <td>{v.name}</td>
                              <td>
                                {v.items.map((it, i) => (
                                  <span key={i} style={{ marginRight: 10 }}>{it.qty}× {it.label}</span>
                                ))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
