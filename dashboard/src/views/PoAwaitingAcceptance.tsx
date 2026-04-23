import React, { useMemo, useState } from 'react'
import { daysSinceCreation, type Discrepancy } from '../services/m2mData'

// Color the day-counter to escalate as a PO sits longer in SCC unaccepted.
// Same thresholds the Discrepancies "missing in M2M" card uses, so the
// signal is consistent across screens.
const ageColor = (days: number | null): { text: string; bg: string; border: string } => {
  if (days === null) return { text: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200' }
  if (days >= 30) return { text: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }
  if (days >= 14) return { text: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' }
  if (days >= 5) return { text: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' }
  return { text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200' }
}

interface Props {
  items: Discrepancy[]
  loading: boolean
  error: string | null
}

// Standalone view for POs that have never been accepted on Wabtec SCC
// (still NEW / REVISED / REJECTED). They aren't a discrepancy — there's
// nothing for M2M to match yet — so they live here, separated from the
// real issues queue.
export const PoAwaitingAcceptance: React.FC<Props> = ({ items, loading, error }) => {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const awaiting = useMemo(
    () => items.filter((d) => d.kind === 'awaiting_acceptance'),
    [items],
  )

  // Distinct SCC statuses present in the data (NEW / REVISED / REJECTED / etc.)
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
      <div className="view-transition bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
        Loading…
      </div>
    )
  }
  if (error) {
    return (
      <div className="view-transition bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="view-transition space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-bold text-slate-800">
              POs Awaiting Acceptance{' '}
              <span className="ml-2 px-2 py-0.5 text-xs font-mono bg-amber-100 text-amber-800 rounded">
                {awaiting.length.toLocaleString()}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              POs on Wabtec SCC that have never been accepted (still NEW, REVISED,
              or REJECTED in their History tab). Nothing for M2M to match — these
              are waiting on the Wabtec side, not a data discrepancy.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none bg-white"
            >
              <option value="all">All statuses</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO, item, buyer…"
              className="px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none w-64"
            />
          </div>
        </div>
      </div>

      {awaiting.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <h3 className="font-bold text-slate-700 text-lg">Nothing awaiting acceptance</h3>
          <p className="mt-2 text-slate-500 text-sm max-w-md mx-auto">
            Every PO on Wabtec SCC has at least one ACCEPTED event in its
            history.
          </p>
        </div>
      ) : (
        <StatusGroups items={filtered} />
      )}

      {filtered.length === 0 && awaiting.length > 0 && (
        <div className="text-center py-8 text-sm text-slate-500">
          No POs match the current filter.
        </div>
      )}
    </div>
  )
}

// Bucket discrepancies by SCC status. We special-case the three common
// states (NEW / REVISED / REJECTED) so they always get a section in a
// stable order, then dump anything else into "Other" — keeps the page
// predictable but doesn't hide unexpected values.
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

  const sections: { key: string; title: string; accent: string; subtitle: string }[] = [
    {
      key: 'NEW',
      title: 'New',
      accent: 'bg-blue-500',
      subtitle: 'First sent by Wabtec, not yet acted on',
    },
    {
      key: 'REVISED',
      title: 'Revised',
      accent: 'bg-orange-500',
      subtitle: 'Wabtec changed the PO and is awaiting re-acceptance',
    },
    {
      key: 'REJECTED',
      title: 'Rejected',
      accent: 'bg-red-500',
      subtitle: 'Sent back to Wabtec — they need to fix and resend',
    },
    { key: 'Other', title: 'Other', accent: 'bg-slate-400', subtitle: 'Uncommon SCC statuses' },
  ]

  return (
    <div className="space-y-8">
      {sections.map((s) => {
        const rows = buckets[s.key]
        if (!rows || rows.length === 0) return null
        return (
          <section key={s.key}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`w-1 h-8 ${s.accent} rounded-sm`} />
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 text-lg uppercase tracking-wider">
                    {s.title}
                  </h3>
                  <span className="px-2 py-0.5 text-xs font-mono bg-slate-100 rounded text-slate-600">
                    {rows.length.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{s.subtitle}</p>
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
  const statusClass =
    /reject/i.test(status)
      ? 'bg-red-50 text-red-700 border-red-200'
      : /revis/i.test(status)
        ? 'bg-orange-50 text-orange-700 border-orange-200'
        : /new/i.test(status)
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-slate-100 text-slate-700 border-slate-200'
  const days = daysSinceCreation(d.wabtec.creationDate)
  const age = ageColor(days)

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-bold text-slate-700">PO {d.wabtecPo}</span>
        <span className="text-slate-400 text-xs">Line {d.lineNo}</span>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase border rounded ${statusClass}`}>
          {status}
        </span>
        <div className={`px-2 py-1 rounded border ${age.bg} ${age.border} text-right`}>
          <div className={`text-lg font-bold leading-none tabular-nums ${age.text}`}>
            {days ?? '—'}
          </div>
          <div className={`text-[9px] font-bold uppercase tracking-wider mt-0.5 ${age.text}`}>
            day{days === 1 ? '' : 's'} in SCC
          </div>
        </div>
      </div>
      <div className="text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Item</span>
          <span className="font-mono text-slate-700">{d.item}</span>
        </div>
        {d.wabtec.itemDescription && (
          <div className="flex justify-between gap-2">
            <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Desc</span>
            <span className="text-slate-700 truncate max-w-[60%]" title={d.wabtec.itemDescription}>
              {d.wabtec.itemDescription}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Qty</span>
          <span className="tabular-nums text-slate-700">{d.wabtec.totalQuantity.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Buyer</span>
          <span className="text-slate-700 truncate ml-2">{d.wabtec.buyerName || '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Created</span>
          <span className="text-slate-700">{d.wabtec.creationDate || '—'}</span>
        </div>
      </div>
    </div>
  )
}
