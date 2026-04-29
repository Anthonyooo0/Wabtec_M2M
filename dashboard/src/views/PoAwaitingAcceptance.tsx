import React, { useMemo, useState } from 'react'
import { daysSinceCreation, type Discrepancy } from '../services/m2mData'
import { PoLink } from '../components/PoLink'

// Color the day-counter to escalate as a PO sits longer in SCC unaccepted.
const ageTone = (days: number | null): { text: string; border: string } => {
  if (days === null) return { text: 'text-zinc-400', border: 'border-zinc-200' }
  if (days >= 30) return { text: 'text-red-600', border: 'border-red-200' }
  if (days >= 14) return { text: 'text-amber-600', border: 'border-amber-200' }
  if (days >= 5) return { text: 'text-yellow-600', border: 'border-yellow-200' }
  return { text: 'text-zinc-700', border: 'border-zinc-200' }
}

interface Props {
  items: Discrepancy[]
  loading: boolean
  error: string | null
}

export const PoAwaitingAcceptance: React.FC<Props> = ({ items, loading, error }) => {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const awaiting = useMemo(
    () => items.filter((d) => d.kind === 'awaiting_acceptance'),
    [items],
  )

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const d of awaiting) {
      const s = (d.wabtec.action || '').trim()
      if (s) set.add(s)
    }
    return [...set].sort()
  }, [awaiting])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return awaiting.filter((d) => {
      if (statusFilter !== 'all' && d.wabtec.action !== statusFilter) return false
      if (!q) return true
      return (
        d.wabtecPo.toLowerCase().includes(q) ||
        d.item.toLowerCase().includes(q) ||
        (d.wabtec.itemDescription || '').toLowerCase().includes(q) ||
        (d.wabtec.buyerName || '').toLowerCase().includes(q)
      )
    })
  }, [awaiting, search, statusFilter])

  if (loading) {
    return (
      <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center">
        <div className="w-5 h-5 mx-auto border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
        <p className="mt-3 text-[12px] text-zinc-500">Loading</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-5 text-[13px] text-red-700">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5 view-transition">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-[22px] font-semibold text-zinc-900 tracking-tight">POs Awaiting Acceptance</h1>
          <span className="px-1.5 py-0.5 text-[11px] font-mono bg-zinc-100 rounded text-zinc-600 tabular-nums">
            {awaiting.length.toLocaleString()}
          </span>
        </div>
        <p className="text-[13px] text-zinc-500 mt-1 max-w-3xl">
          POs on Wabtec SCC that have never been accepted (still NEW, REVISED, or REJECTED). Nothing for
          M2M to match — these are waiting on the Wabtec side, not a data discrepancy.
        </p>
      </div>

      <div className="bg-white border border-zinc-200 rounded-lg p-3 flex items-center justify-end gap-2 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-[13px] border border-zinc-200 rounded-md bg-zinc-50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:ring-0 outline-none transition-colors"
        >
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search PO, item, buyer…"
          className="px-3 py-1.5 text-[13px] border border-zinc-200 rounded-md bg-zinc-50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:ring-0 outline-none w-72 transition-colors placeholder:text-zinc-400"
        />
      </div>

      {awaiting.length === 0 ? (
        <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center">
          <h3 className="text-[15px] font-semibold text-zinc-900 tracking-tight">Nothing awaiting acceptance</h3>
          <p className="mt-2 text-[13px] text-zinc-500 max-w-md mx-auto">
            Every PO on Wabtec SCC has at least one ACCEPTED event in its history.
          </p>
        </div>
      ) : (
        <StatusGroups items={filtered} />
      )}

      {filtered.length === 0 && awaiting.length > 0 && (
        <div className="text-center py-8 text-[13px] text-zinc-500">No POs match the current filter.</div>
      )}
    </div>
  )
}

const StatusGroups: React.FC<{ items: Discrepancy[] }> = ({ items }) => {
  const buckets = useMemo(() => {
    const m: Record<string, Discrepancy[]> = { NEW: [], REVISED: [], REJECTED: [], Other: [] }
    for (const d of items) {
      const a = (d.wabtec.action || '').trim().toUpperCase()
      if (a === 'NEW') m.NEW.push(d)
      else if (a === 'REVISED') m.REVISED.push(d)
      else if (a === 'REJECTED') m.REJECTED.push(d)
      else m.Other.push(d)
    }
    return m
  }, [items])

  const sections: { key: string; title: string; dot: string; subtitle: string }[] = [
    { key: 'NEW', title: 'New', dot: 'bg-blue-500', subtitle: 'First sent by Wabtec, not yet acted on' },
    { key: 'REVISED', title: 'Revised', dot: 'bg-amber-500', subtitle: 'Wabtec changed the PO and is awaiting re-acceptance' },
    { key: 'REJECTED', title: 'Rejected', dot: 'bg-red-500', subtitle: 'Sent back to Wabtec — they need to fix and resend' },
    { key: 'Other', title: 'Other', dot: 'bg-zinc-400', subtitle: 'Uncommon SCC statuses' },
  ]

  return (
    <div className="space-y-6">
      {sections.map((s) => {
        const rows = buckets[s.key]
        if (!rows || rows.length === 0) return null
        return (
          <section key={s.key}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-[14px] font-semibold text-zinc-900 tracking-tight">{s.title}</h3>
                  <span className="px-1.5 py-0.5 text-[11px] font-mono bg-zinc-100 rounded text-zinc-600 tabular-nums">
                    {rows.length.toLocaleString()}
                  </span>
                </div>
                <p className="text-[12px] text-zinc-500 mt-0.5">{s.subtitle}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {rows.map((d, i) => (
                <AwaitingCard key={`${d.wabtecPo}-${d.lineNo}-${i}`} d={d} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

const AwaitingCard: React.FC<{ d: Discrepancy }> = ({ d }) => {
  const status = (d.wabtec.action || '').trim() || '—'
  const statusDot =
    /reject/i.test(status) ? 'bg-red-500'
    : /revis/i.test(status) ? 'bg-amber-500'
    : /new/i.test(status) ? 'bg-blue-500'
    : 'bg-zinc-400'
  const days = daysSinceCreation(d.wabtec.creationDate)
  const age = ageTone(days)

  return (
    <div className="bg-white border border-zinc-200 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[12px] text-zinc-900">
          PO <PoLink poNumber={d.wabtecPo} />
        </span>
        <span className="text-zinc-400 text-[11px]">Line {d.lineNo}</span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-zinc-200 bg-white text-[10px] font-medium text-zinc-700">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          {status}
        </span>
        <div className={`px-2 py-1 rounded-md border ${age.border} text-right`}>
          <div className={`text-[18px] font-semibold leading-none tabular-nums tracking-tight ${age.text}`}>
            {days ?? '—'}
          </div>
          <div className="text-[9px] text-zinc-500 mt-0.5">
            day{days === 1 ? '' : 's'} in SCC
          </div>
        </div>
      </div>
      <div className="text-[12px] space-y-1">
        <Row label="Item" value={<span className="font-mono">{d.item}</span>} />
        {d.wabtec.itemDescription && (
          <Row label="Desc" value={<span className="truncate max-w-[60%] inline-block" title={d.wabtec.itemDescription}>{d.wabtec.itemDescription}</span>} />
        )}
        <Row label="Qty" value={<span className="tabular-nums">{d.wabtec.totalQuantity.toLocaleString()}</span>} />
        <Row label="Buyer" value={<span className="truncate ml-2">{d.wabtec.buyerName || '—'}</span>} />
        <Row label="Created" value={d.wabtec.creationDate || '—'} />
      </div>
    </div>
  )
}

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-[11px] text-zinc-500">{label}</span>
    <span className="text-zinc-700">{value}</span>
  </div>
)
