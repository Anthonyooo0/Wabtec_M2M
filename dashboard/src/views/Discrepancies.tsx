import React, { useMemo, useState } from 'react'
import {
  daysSinceCreation,
  PENDING_INTAKE_DAYS,
  type Discrepancy,
  type DiscrepancyKind,
  type M2MPO,
} from '../services/m2mData'
import type { WabtecPO } from '../services/wabtecData'
import { SCCStatusBadge, M2MStateBadge, fmtIsoDate } from '../components/StatusBadges'

interface DiscrepanciesProps {
  items: Discrepancy[]
  loading: boolean
  error: string | null
}

type Severity = 'critical' | 'medium' | 'value'

const severityOf = (kind: DiscrepancyKind): Severity => {
  if (kind === 'scc_cancelled_m2m_active' || kind === 'scc_active_m2m_cancelled') return 'critical'
  if (kind === 'ship_to_mismatch') return 'critical'
  if (kind === 'scc_active_m2m_closed' || kind === 'missing_in_m2m') return 'medium'
  return 'value'
}

export const Discrepancies: React.FC<DiscrepanciesProps> = ({ items, loading, error }) => {
  const pendingIntake = useMemo(
    () => items.filter((d) => d.kind === 'pending_intake'),
    [items],
  )

  const grouped = useMemo(() => {
    const g: Record<Severity, Discrepancy[]> = { critical: [], medium: [], value: [] }
    for (const d of items) {
      if (d.kind === 'pending_intake') continue
      g[severityOf(d.kind)].push(d)
    }
    return g
  }, [items])

  const realDiscrepancyCount =
    grouped.critical.length + grouped.medium.length + grouped.value.length

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
  if (items.length === 0) {
    return (
      <div className="view-transition bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
        <h3 className="font-bold text-slate-700 text-lg">Nothing to show</h3>
        <p className="mt-2 text-slate-500 text-sm">
          Every SCC row matches an equivalent M2M record within tolerance.
        </p>
      </div>
    )
  }

  if (realDiscrepancyCount === 0 && pendingIntake.length > 0) {
    return (
      <div className="view-transition space-y-8">
        <PendingIntakeSection items={pendingIntake} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
          <h3 className="font-bold text-slate-700 text-lg">No discrepancies</h3>
          <p className="mt-2 text-slate-500 text-sm max-w-md mx-auto">
            The section above is workflow lag — POs that just arrived in SCC and haven&apos;t
            been booked yet (under {PENDING_INTAKE_DAYS} days old). Not an issue.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="view-transition space-y-8">
      {pendingIntake.length > 0 && <PendingIntakeSection items={pendingIntake} />}
      <SeveritySection
        title="Critical"
        accent="bg-red-500"
        items={grouped.critical}
        blurb="Status conflicts — order is live on one side, dead on the other"
      />
      <SeveritySection
        title="Medium"
        accent="bg-orange-500"
        items={grouped.medium}
        blurb="Orphans and out-of-sync state — not immediate risk, but fix soon"
      />
      <SeveritySection
        title="Value"
        accent="bg-blue-500"
        items={grouped.value}
        blurb="Quantity and pricing drift between SCC and M2M"
      />
    </div>
  )
}

const PendingIntakeSection: React.FC<{ items: Discrepancy[] }> = ({ items }) => {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null

  return (
    <section className="bg-slate-50/50 border border-slate-200 rounded-xl p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="w-1 h-8 bg-slate-400 rounded-sm" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-700 text-base uppercase tracking-wider">
              Awaiting Intake
            </h3>
            <span className="px-2 py-0.5 text-xs font-mono bg-white border border-slate-200 rounded text-slate-600">
              {items.length.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            New in SCC, not yet booked in M2M — under {PENDING_INTAKE_DAYS} days old, so this is
            expected lag, not a discrepancy.
          </p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((d, i) => (
            <PendingIntakeCard key={`${d.wabtecPo}-${d.lineNo}-${i}`} d={d} />
          ))}
        </div>
      )}
    </section>
  )
}

const PendingIntakeCard: React.FC<{ d: Discrepancy }> = ({ d }) => {
  const days = daysSinceCreation(d.wabtec.creationDate)
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-xs font-bold text-slate-700">
          PO {d.wabtecPo}
        </span>
        <span className="text-slate-400 text-xs">Line {d.lineNo}</span>
      </div>

      <div className="flex items-end gap-2 mb-3">
        <span className="text-3xl font-bold text-slate-600 tabular-nums leading-none">
          {days ?? '—'}
        </span>
        <span className="text-xs text-slate-500 mb-1">
          day{days === 1 ? '' : 's'} old
        </span>
      </div>

      <div className="text-xs text-slate-500 space-y-1">
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Item</span>
          <span className="font-mono text-slate-700">{d.item}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Qty</span>
          <span className="tabular-nums text-slate-700">
            {d.wabtec.totalQuantity.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="font-bold text-slate-400 uppercase text-[10px] tracking-wider">Buyer</span>
          <span className="text-slate-700 truncate ml-2">{d.wabtec.buyerName || '—'}</span>
        </div>
      </div>
    </div>
  )
}

const SeveritySection: React.FC<{
  title: string
  accent: string
  blurb: string
  items: Discrepancy[]
}> = ({ title, accent, blurb, items }) => {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left mb-4 group"
      >
        <span className={`w-1 h-8 ${accent} rounded-sm`} />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-slate-800 text-lg uppercase tracking-wider">
              {title}
            </h3>
            <span className="px-2 py-0.5 text-xs font-mono bg-slate-100 rounded text-slate-600">
              {items.length.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{blurb}</p>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-4">
          {items.map((d, i) => (
            <DiscrepancyCard key={`${d.wabtecPo}-${d.lineNo}-${d.kind}-${i}`} d={d} />
          ))}
        </div>
      )}
    </section>
  )
}

const DiscrepancyCard: React.FC<{ d: Discrepancy }> = ({ d }) => {
  if (d.kind === 'missing_in_m2m') return <MissingInM2MCard d={d} />
  if (!d.m2m) return null
  if (d.kind === 'ship_to_mismatch') return <ShipToMismatchCard d={d} m={d.m2m} />
  if (d.kind === 'qty_mismatch') return <QtyMismatchCard d={d} m={d.m2m} />
  if (d.kind === 'price_mismatch') return <PriceMismatchCard d={d} m={d.m2m} />
  return <StatusConflictCard d={d} m={d.m2m} />
}

// -----------------------------------------------------------------------------
// Card: Status Conflict (CRITICAL / MEDIUM)
// -----------------------------------------------------------------------------

const StatusConflictCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const sev = severityOf(d.kind)
  const accentBorder =
    sev === 'critical' ? 'border-l-red-500' : 'border-l-orange-500'

  return (
    <div
      className={`bg-white rounded-xl border border-slate-200 border-l-4 ${accentBorder} shadow-sm overflow-hidden`}
    >
      <CardHeader d={d} />

      <div className="grid grid-cols-2 divide-x divide-slate-100">
        {/* Wabtec side */}
        <div className="p-6">
          <SideLabel>Wabtec SCC</SideLabel>
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Status
            </span>
            <SCCStatusBadge action={d.wabtec.action} size="lg" />
          </div>
          <MiniFacts w={d.wabtec} />
        </div>

        {/* M2M side */}
        <div className="p-6 bg-slate-50/40">
          <SideLabel>Made2Manage</SideLabel>
          <div className="flex flex-col items-center gap-3 py-4">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              State
            </span>
            <M2MStateBadge row={m} size="lg" />
          </div>
          <MiniFactsM m={m} />
        </div>
      </div>

      <CardFooter summary={d.summary} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Card: Missing in M2M — with staleness days counter (recomputed on render)
// -----------------------------------------------------------------------------

const MissingInM2MCard: React.FC<{ d: Discrepancy }> = ({ d }) => {
  const days = daysSinceCreation(d.wabtec.creationDate)
  const staleness = stalenessClass(days)

  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-orange-500 shadow-sm overflow-hidden">
      <CardHeader d={d} />

      <div className="grid grid-cols-2 divide-x divide-slate-100">
        {/* SCC side — real data */}
        <div className="p-6">
          <SideLabel>Wabtec SCC</SideLabel>
          <MiniFacts w={d.wabtec} />
        </div>

        {/* M2M side — missing/ghost panel with staleness counter */}
        <div className="p-4 bg-slate-50/40">
          <div
            className={`h-full border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-6 ${staleness.border}`}
          >
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Not in Made2Manage
            </span>
            {days !== null ? (
              <>
                <div className={`text-6xl font-bold tabular-nums ${staleness.text}`}>
                  {days}
                </div>
                <div className={`text-xs font-bold uppercase tracking-wider mt-1 ${staleness.text}`}>
                  day{days === 1 ? '' : 's'} unbooked
                </div>
                <div className="text-[11px] text-slate-500 mt-3">
                  SCC created {d.wabtec.creationDate}
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400 italic">
                No creation date in SCC — can't age this
              </div>
            )}
          </div>
        </div>
      </div>

      <CardFooter summary="Book this PO in M2M, or confirm with the buyer that it's been cancelled on their side." />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Card: Ship-To Mismatch — two address panels with a "≠" in the middle
// -----------------------------------------------------------------------------

const ShipToMismatchCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const sccShip = d.wabtec.shipTo
  const m2mCityState = [m.shipToCity, m.shipToState].filter(Boolean).join(', ') || '—'
  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-red-500 shadow-sm overflow-hidden">
      <CardHeader d={d} />

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
        <div className="p-5">
          <SideLabel>Wabtec SCC</SideLabel>
          <div className="mt-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Ship-To Address
            </div>
            {sccShip ? (
              <>
                <div className="text-sm font-medium text-slate-800 break-words">
                  {sccShip.address || '—'}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {[sccShip.city, sccShip.state].filter(Boolean).join(', ') || '—'}
                </div>
                {sccShip.zip && (
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {sccShip.zip}
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm italic text-slate-500">
                {d.wabtec.destinationOrg || '—'}
              </div>
            )}
            {d.wabtec.destinationOrg && sccShip && (
              <div className="mt-2 text-[10px] text-slate-400 font-mono">
                {d.wabtec.destinationOrg}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center px-2">
          <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xl font-bold">
            ≠
          </div>
        </div>

        <div className="p-5 bg-slate-50/40">
          <SideLabel>Made2Manage</SideLabel>
          <div className="mt-3">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              Ship-To Address
            </div>
            <div className="text-sm font-medium text-slate-800">{m.shipToCompany || '—'}</div>
            <div className="text-xs text-slate-500 mt-0.5">{m2mCityState}</div>
            {m.shipToZip && (
              <div className="text-xs text-slate-400 font-mono mt-0.5">{m.shipToZip}</div>
            )}
          </div>
        </div>
      </div>

      <CardFooter summary="Verify the correct destination with the buyer. Update the M2M ship-to address or confirm SCC destination, whichever is wrong." />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Card: Qty Mismatch — numbers dominate
// -----------------------------------------------------------------------------

const QtyMismatchCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const delta = m.totalQty - d.wabtec.totalQuantity
  const deltaColor = delta === 0 ? 'text-slate-500' : delta < 0 ? 'text-red-600' : 'text-orange-600'

  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-blue-500 shadow-sm overflow-hidden">
      <CardHeader d={d} />

      <div className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Wabtec SCC
            </div>
            <div className="text-5xl font-bold text-slate-800 tabular-nums">
              {d.wabtec.totalQuantity.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">units ordered</div>
          </div>

          <div className="text-center px-4">
            <div className={`text-3xl font-bold tabular-nums ${deltaColor}`}>
              {delta > 0 ? `+${delta}` : delta}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">delta</div>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Made2Manage
            </div>
            <div className="text-5xl font-bold text-slate-800 tabular-nums">
              {m.totalQty.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">units ordered</div>
          </div>
        </div>
      </div>

      <CardFooter summary={d.summary} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Card: Price Mismatch — currency dominates
// -----------------------------------------------------------------------------

const PriceMismatchCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const delta = m.unitPrice - d.wabtec.unitPrice
  const qty = d.wabtec.totalQuantity || 1
  const revenueImpact = delta * qty
  const deltaColor = delta > 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="bg-white rounded-xl border border-slate-200 border-l-4 border-l-blue-500 shadow-sm overflow-hidden">
      <CardHeader d={d} />

      <div className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 mb-4">
          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Wabtec SCC
            </div>
            <div className="text-4xl font-bold text-slate-800 tabular-nums">
              ${d.wabtec.unitPrice.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">per unit</div>
          </div>

          <div className="text-center px-4">
            <div className={`text-2xl font-bold tabular-nums ${deltaColor}`}>
              {delta > 0 ? '+' : ''}${delta.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">delta</div>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Made2Manage
            </div>
            <div className="text-4xl font-bold text-slate-800 tabular-nums">
              ${m.unitPrice.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1">per unit</div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-4 flex items-center justify-center gap-2 text-sm">
          <span className="text-slate-500">Revenue impact</span>
          <span className={`font-bold tabular-nums ${deltaColor}`}>
            {revenueImpact > 0 ? '+' : ''}${revenueImpact.toFixed(2)}
          </span>
          <span className="text-slate-400 text-xs">({qty.toLocaleString()} units)</span>
        </div>
      </div>

      <CardFooter summary={d.summary} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Shared card bits
// -----------------------------------------------------------------------------

const CardHeader: React.FC<{ d: Discrepancy }> = ({ d }) => (
  <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between gap-3">
    <div className="flex items-center gap-3 min-w-0">
      <SeverityPill kind={d.kind} />
      <span className="font-mono text-sm font-bold text-slate-700">
        PO {d.wabtecPo}
      </span>
      <span className="text-slate-300">·</span>
      <span className="text-sm text-slate-600">Line {d.lineNo}</span>
      <span className="text-slate-300">·</span>
      <span className="font-mono text-xs text-slate-500 truncate">{d.item}</span>
    </div>
    {d.m2m && (
      <span className="font-mono text-[11px] text-slate-400 flex-shrink-0">
        MAC SO {d.m2m.macSo}
      </span>
    )}
  </div>
)

const CardFooter: React.FC<{ summary: string }> = ({ summary }) => (
  <div className="px-5 py-2.5 border-t bg-slate-50 text-[11px] text-slate-500 italic">
    {summary}
  </div>
)

const SideLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mb-3">
    {children}
  </div>
)

const MiniFacts: React.FC<{ w: WabtecPO }> = ({ w }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-slate-100 pt-3">
    <Fact label="Qty" value={w.totalQuantity.toLocaleString()} />
    <Fact label="Received" value={w.receivedQuantity.toLocaleString()} />
    <Fact label="Promise" value={w.promiseDate || '—'} />
    <Fact label="Unit $" value={w.unitPrice ? `$${w.unitPrice.toFixed(2)}` : '—'} />
  </div>
)

const MiniFactsM: React.FC<{ m: M2MPO }> = ({ m }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs border-t border-slate-100 pt-3">
    <Fact label="Qty" value={m.totalQty.toLocaleString()} />
    <Fact label="Shipped" value={m.shippedQty.toLocaleString()} />
    <Fact label="Promise" value={fmtIsoDate(m.promiseDate)} />
    <Fact label="Unit $" value={m.unitPrice ? `$${m.unitPrice.toFixed(2)}` : '—'} />
  </div>
)

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    <span className="text-slate-700 font-medium tabular-nums">{value}</span>
  </div>
)

const SeverityPill: React.FC<{ kind: DiscrepancyKind }> = ({ kind }) => {
  const map: Record<DiscrepancyKind, { label: string; bg: string }> = {
    scc_cancelled_m2m_active: { label: 'CRITICAL', bg: 'bg-red-600' },
    scc_active_m2m_cancelled: { label: 'CRITICAL', bg: 'bg-red-600' },
    scc_active_m2m_closed: { label: 'MEDIUM', bg: 'bg-orange-500' },
    missing_in_m2m: { label: 'UNBOOKED', bg: 'bg-orange-500' },
    pending_intake: { label: 'AWAITING', bg: 'bg-slate-400' },
    ship_to_mismatch: { label: 'SHIP-TO', bg: 'bg-red-600' },
    qty_mismatch: { label: 'QTY OFF', bg: 'bg-blue-600' },
    price_mismatch: { label: 'PRICE OFF', bg: 'bg-blue-600' },
  }
  const { label, bg } = map[kind]
  return (
    <span className={`${bg} text-white px-2 py-0.5 text-[10px] font-bold uppercase rounded`}>
      {label}
    </span>
  )
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

const stalenessClass = (days: number | null): { text: string; border: string } => {
  if (days === null) return { text: 'text-slate-400', border: 'border-slate-300' }
  if (days >= 14) return { text: 'text-red-600', border: 'border-red-300' }
  if (days >= 7) return { text: 'text-orange-600', border: 'border-orange-300' }
  return { text: 'text-yellow-600', border: 'border-yellow-300' }
}
