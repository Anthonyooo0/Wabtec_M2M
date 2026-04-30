import React, { useMemo, useState } from 'react'
import {
  daysUnbooked,
  fmtShortDate,
  PENDING_INTAKE_DAYS,
  type Discrepancy,
  type DiscrepancyKind,
  type M2MPO,
  type OrphanDiscrepancy,
} from '../services/m2mData'
import type { WabtecPO } from '../services/wabtecData'
import { SCCStatusBadge, M2MStateBadge, fmtIsoDate } from '../components/StatusBadges'
import { PoLink } from '../components/PoLink'

interface DiscrepanciesProps {
  items: Discrepancy[]
  orphanDiscrepancies?: OrphanDiscrepancy[]
  loading: boolean
  error: string | null
  acceptedDateByPo?: Map<string, Date>
}

type Severity = 'critical' | 'medium' | 'value'

const severityOf = (kind: DiscrepancyKind): Severity => {
  if (kind === 'scc_cancelled_m2m_active' || kind === 'scc_active_m2m_cancelled') return 'critical'
  if (kind === 'ship_to_mismatch') return 'critical'
  if (kind === 'scc_active_m2m_closed' || kind === 'missing_in_m2m') return 'medium'
  return 'value'
}

export const Discrepancies: React.FC<DiscrepanciesProps> = ({
  items,
  orphanDiscrepancies = [],
  loading,
  error,
  acceptedDateByPo = new Map(),
}) => {
  const pendingIntake = useMemo(
    () => items.filter((d) => d.kind === 'pending_intake'),
    [items],
  )

  const grouped = useMemo(() => {
    const g: Record<Severity, Discrepancy[]> = { critical: [], medium: [], value: [] }
    for (const d of items) {
      if (d.kind === 'pending_intake') continue
      if (d.kind === 'awaiting_acceptance') continue
      g[severityOf(d.kind)].push(d)
    }
    return g
  }, [items])

  const realDiscrepancyCount =
    grouped.critical.length + grouped.medium.length + grouped.value.length

  if (loading) {
    return (
      <div className="bg-white border border-mauve-6 rounded-lg p-12 text-center">
        <div className="w-5 h-5 mx-auto border-2 border-mauve-6 border-t-mac-navy rounded-full animate-spin" />
        <p className="mt-3 text-[12px] text-mauve-11">Loading</p>
      </div>
    )
  }
  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <h3 className="text-sm font-semibold text-mauve-12">Couldn't load discrepancies</h3>
        </div>
        <p className="text-xs text-mauve-11 font-mono mt-2">{error}</p>
      </div>
    )
  }
  if (items.length === 0 && orphanDiscrepancies.length === 0) {
    return (
      <div className="bg-white border border-mauve-6 rounded-lg p-12 text-center">
        <h3 className="text-[15px] font-semibold text-mauve-12 tracking-tight">Nothing to show</h3>
        <p className="mt-2 text-[13px] text-mauve-11 max-w-md mx-auto">
          Every SCC row matches an equivalent M2M record within tolerance.
        </p>
      </div>
    )
  }

  if (realDiscrepancyCount === 0 && orphanDiscrepancies.length === 0 && pendingIntake.length > 0) {
    return (
      <div className="space-y-6 view-transition">
        <PendingIntakeSection items={pendingIntake} acceptedDateByPo={acceptedDateByPo} />
        <div className="bg-white border border-mauve-6 rounded-lg p-10 text-center">
          <h3 className="text-[15px] font-semibold text-mauve-12 tracking-tight">No discrepancies</h3>
          <p className="mt-2 text-[13px] text-mauve-11 max-w-md mx-auto">
            The section above isn&apos;t an issue — POs recently accepted in SCC and within the
            {' '}{PENDING_INTAKE_DAYS}-day intake grace period.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 view-transition">
      {/* Orphan-derived discrepancies appear ABOVE the regular Critical section
          because they are the highest-risk items: shipping decisions made
          against POs that Wabtec has cancelled or doesn't see at all. */}
      {orphanDiscrepancies.length > 0 && (
        <OrphanDiscrepancySection items={orphanDiscrepancies} />
      )}
      {pendingIntake.length > 0 && (
        <PendingIntakeSection items={pendingIntake} acceptedDateByPo={acceptedDateByPo} />
      )}
      <SeveritySection
        title="Critical"
        dot="bg-red-500"
        items={grouped.critical}
        blurb="Status conflicts — order is live on one side, dead on the other."
        acceptedDateByPo={acceptedDateByPo}
      />
      <SeveritySection
        title="Medium"
        dot="bg-amber-500"
        items={grouped.medium}
        blurb="Orphans and out-of-sync state — not immediate risk, but fix soon."
        acceptedDateByPo={acceptedDateByPo}
      />
      <SeveritySection
        title="Value"
        dot="bg-blue-500"
        items={grouped.value}
        blurb="Quantity and pricing drift between SCC and M2M."
        acceptedDateByPo={acceptedDateByPo}
      />
    </div>
  )
}

const PendingIntakeSection: React.FC<{
  items: Discrepancy[]
  acceptedDateByPo: Map<string, Date>
}> = ({ items, acceptedDateByPo }) => {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null

  return (
    <section className="bg-white border border-mauve-6 rounded-lg p-5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-mauve-9" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[14px] font-semibold text-mauve-12 tracking-tight">Awaiting intake</h3>
            <span className="px-1.5 py-0.5 text-[11px] font-mono bg-mauve-3 rounded text-mauve-11 tabular-nums">
              {items.length.toLocaleString()}
            </span>
          </div>
          <p className="text-[12px] text-mauve-11 mt-0.5">
            New in SCC, not yet booked in M2M — under {PENDING_INTAKE_DAYS} days old, expected lag.
          </p>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-mauve-9 transition-transform ${open ? 'rotate-90' : ''}`}
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
            <PendingIntakeCard
              key={`${d.wabtecPo}-${d.lineNo}-${i}`}
              d={d}
              acceptedDateByPo={acceptedDateByPo}
            />
          ))}
        </div>
      )}
    </section>
  )
}

const PendingIntakeCard: React.FC<{
  d: Discrepancy
  acceptedDateByPo: Map<string, Date>
}> = ({ d, acceptedDateByPo }) => {
  const unbooked = daysUnbooked(d.wabtec.poNumber, d.wabtec.creationDate, acceptedDateByPo)
  const days = unbooked.days
  return (
    <div className="bg-white border border-mauve-6 rounded-md p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[12px] text-mauve-12">
          PO <PoLink poNumber={d.wabtecPo} />
        </span>
        <span className="text-mauve-9 text-[11px]">Line {d.lineNo}</span>
      </div>

      <div className="flex items-end gap-2 mb-1">
        <span className="text-[28px] font-semibold text-mauve-12 tabular-nums leading-none tracking-tight">
          {days ?? '—'}
        </span>
        <span className="text-[11px] text-mauve-11 mb-0.5">
          day{days === 1 ? '' : 's'} since {unbooked.source === 'accepted' ? 'accepted' : 'created'}
        </span>
      </div>
      <div className="text-[10px] text-mauve-9 font-mono mb-3">
        {unbooked.source === 'accepted' && unbooked.date
          ? `accepted ${fmtShortDate(unbooked.date)}`
          : `created ${d.wabtec.creationDate || '—'}`}
      </div>

      <div className="text-[12px] space-y-1">
        <FactRow label="Item" value={<span className="font-mono">{d.item}</span>} />
        <FactRow label="Qty" value={<span className="tabular-nums">{d.wabtec.totalQuantity.toLocaleString()}</span>} />
        <FactRow label="Buyer" value={<span className="truncate ml-2">{d.wabtec.buyerName || '—'}</span>} />
      </div>
    </div>
  )
}

const FactRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-mauve-11 text-[11px]">{label}</span>
    <span className="text-mauve-12">{value}</span>
  </div>
)

const SeveritySection: React.FC<{
  title: string
  dot: string
  blurb: string
  items: Discrepancy[]
  acceptedDateByPo: Map<string, Date>
}> = ({ title, dot, blurb, items, acceptedDateByPo }) => {
  const [open, setOpen] = useState(true)
  if (items.length === 0) return null

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left mb-3"
      >
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-mauve-12 tracking-tight">{title}</h3>
            <span className="px-1.5 py-0.5 text-[11px] font-mono bg-mauve-3 rounded text-mauve-11 tabular-nums">
              {items.length.toLocaleString()}
            </span>
          </div>
          <p className="text-[12px] text-mauve-11 mt-0.5">{blurb}</p>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-mauve-9 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3">
          {items.map((d, i) => (
            <DiscrepancyCard
              key={`${d.wabtecPo}-${d.lineNo}-${d.kind}-${i}`}
              d={d}
              acceptedDateByPo={acceptedDateByPo}
            />
          ))}
        </div>
      )}
    </section>
  )
}

const DiscrepancyCard: React.FC<{
  d: Discrepancy
  acceptedDateByPo: Map<string, Date>
}> = ({ d, acceptedDateByPo }) => {
  if (d.kind === 'missing_in_m2m')
    return <MissingInM2MCard d={d} acceptedDateByPo={acceptedDateByPo} />
  if (!d.m2m) return null
  if (d.kind === 'ship_to_mismatch') return <ShipToMismatchCard d={d} m={d.m2m} />
  if (d.kind === 'qty_mismatch') return <QtyMismatchCard d={d} m={d.m2m} />
  if (d.kind === 'price_mismatch') return <PriceMismatchCard d={d} m={d.m2m} />
  return <StatusConflictCard d={d} m={d.m2m} />
}

// -----------------------------------------------------------------------------

const StatusConflictCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => (
  <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
    <CardHeader d={d} />

    <div className="grid grid-cols-2 divide-x divide-mauve-4">
      <div className="p-5">
        <SideLabel>Wabtec SCC</SideLabel>
        <div className="flex flex-col items-center gap-2 py-3">
          <span className="text-[10px] text-mauve-11">Status</span>
          <SCCStatusBadge action={d.wabtec.action} size="lg" />
        </div>
        <MiniFacts w={d.wabtec} />
      </div>
      <div className="p-5 bg-mauve-3/50">
        <SideLabel>Made2Manage</SideLabel>
        <div className="flex flex-col items-center gap-2 py-3">
          <span className="text-[10px] text-mauve-11">State</span>
          <M2MStateBadge row={m} size="lg" />
        </div>
        <MiniFactsM m={m} />
      </div>
    </div>

    <CardFooter summary={d.summary} />
  </div>
)

// -----------------------------------------------------------------------------

const MissingInM2MCard: React.FC<{
  d: Discrepancy
  acceptedDateByPo: Map<string, Date>
}> = ({ d, acceptedDateByPo }) => {
  const unbooked = daysUnbooked(d.wabtec.poNumber, d.wabtec.creationDate, acceptedDateByPo)
  const days = unbooked.days
  const staleness = stalenessClass(days)

  return (
    <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
      <CardHeader d={d} />

      <div className="grid grid-cols-2 divide-x divide-mauve-4">
        <div className="p-5">
          <SideLabel>Wabtec SCC</SideLabel>
          <MiniFacts w={d.wabtec} />
        </div>
        <div className="p-4 bg-mauve-3/50">
          <div
            className={`h-full border border-dashed rounded-md flex flex-col items-center justify-center py-6 ${staleness.border}`}
          >
            <span className="text-[10px] text-mauve-11 mb-2">Not in M2M</span>
            {days !== null ? (
              <>
                <div className={`text-5xl font-semibold tabular-nums tracking-tight leading-none ${staleness.text}`}>
                  {days}
                </div>
                <div className={`text-[11px] mt-1 ${staleness.text}`}>
                  day{days === 1 ? '' : 's'} unbooked
                </div>
                <div className="text-[10px] text-mauve-11 mt-2 font-mono">
                  {unbooked.source === 'accepted' && unbooked.date
                    ? `accepted ${fmtShortDate(unbooked.date)}`
                    : `created ${d.wabtec.creationDate || '—'}`}
                </div>
                {unbooked.source === 'created' && (
                  <div className="text-[10px] text-mauve-9 mt-0.5 italic">
                    no accepted record — using creation
                  </div>
                )}
              </>
            ) : (
              <div className="text-[12px] text-mauve-11 italic">No date — can't age</div>
            )}
          </div>
        </div>
      </div>

      <CardFooter summary="Book this PO in M2M, or confirm with the buyer that it's been cancelled on their side." />
    </div>
  )
}

// -----------------------------------------------------------------------------

const ShipToMismatchCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const sccShip = d.wabtec.shipTo
  const m2mCityState = [m.shipToCity, m.shipToState].filter(Boolean).join(', ') || '—'
  return (
    <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
      <CardHeader d={d} />

      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch">
        <div className="p-5">
          <SideLabel>Wabtec SCC</SideLabel>
          <div className="mt-2">
            <div className="text-[10px] text-mauve-11 mb-1">Ship-to</div>
            {sccShip ? (
              <>
                <div className="text-[13px] text-mauve-12">{sccShip.address || '—'}</div>
                <div className="text-[12px] text-mauve-11 mt-0.5">
                  {[sccShip.city, sccShip.state].filter(Boolean).join(', ') || '—'}
                </div>
                {sccShip.zip && (
                  <div className="text-[11px] text-mauve-9 font-mono mt-0.5">{sccShip.zip}</div>
                )}
              </>
            ) : (
              <div className="text-[13px] italic text-mauve-11">{d.wabtec.destinationOrg || '—'}</div>
            )}
            {d.wabtec.destinationOrg && sccShip && (
              <div className="mt-2 text-[10px] text-mauve-9 font-mono">{d.wabtec.destinationOrg}</div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-center px-2">
          <div className="w-7 h-7 rounded-full border border-red-300 text-red-600 flex items-center justify-center text-[14px]">
            ≠
          </div>
        </div>

        <div className="p-5 bg-mauve-3/50">
          <SideLabel>Made2Manage</SideLabel>
          <div className="mt-2">
            <div className="text-[10px] text-mauve-11 mb-1">Ship-to</div>
            <div className="text-[13px] text-mauve-12">{m.shipToCompany || '—'}</div>
            <div className="text-[12px] text-mauve-11 mt-0.5">{m2mCityState}</div>
            {m.shipToZip && (
              <div className="text-[11px] text-mauve-9 font-mono mt-0.5">{m.shipToZip}</div>
            )}
          </div>
        </div>
      </div>

      <CardFooter summary="Verify the correct destination with the buyer. Update M2M ship-to or confirm SCC destination." />
    </div>
  )
}

// -----------------------------------------------------------------------------

const QtyMismatchCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const delta = m.totalQty - d.wabtec.totalQuantity
  const deltaColor = delta === 0 ? 'text-mauve-11' : delta < 0 ? 'text-red-600' : 'text-amber-600'

  return (
    <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
      <CardHeader d={d} />

      <div className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <div className="text-center">
            <div className="text-[10px] text-mauve-11 mb-2">Wabtec SCC</div>
            <div className="text-[44px] font-semibold text-mauve-12 tabular-nums tracking-tight leading-none">
              {d.wabtec.totalQuantity.toLocaleString()}
            </div>
            <div className="text-[10px] text-mauve-11 mt-1">units ordered</div>
          </div>

          <div className="text-center px-3">
            <div className={`text-[28px] font-semibold tabular-nums tracking-tight ${deltaColor}`}>
              {delta > 0 ? `+${delta}` : delta}
            </div>
            <div className="text-[10px] text-mauve-11 mt-1">delta</div>
          </div>

          <div className="text-center">
            <div className="text-[10px] text-mauve-11 mb-2">Made2Manage</div>
            <div className="text-[44px] font-semibold text-mauve-12 tabular-nums tracking-tight leading-none">
              {m.totalQty.toLocaleString()}
            </div>
            <div className="text-[10px] text-mauve-11 mt-1">units ordered</div>
          </div>
        </div>
      </div>

      <CardFooter summary={d.summary} />
    </div>
  )
}

// -----------------------------------------------------------------------------

const PriceMismatchCard: React.FC<{ d: Discrepancy; m: M2MPO }> = ({ d, m }) => {
  const delta = m.unitPrice - d.wabtec.unitPrice
  const qty = d.wabtec.totalQuantity || 1
  const revenueImpact = delta * qty
  const deltaColor = delta > 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
      <CardHeader d={d} />

      <div className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 mb-4">
          <div className="text-center">
            <div className="text-[10px] text-mauve-11 mb-2">Wabtec SCC</div>
            <div className="text-[36px] font-semibold text-mauve-12 tabular-nums tracking-tight leading-none">
              ${d.wabtec.unitPrice.toFixed(2)}
            </div>
            <div className="text-[10px] text-mauve-11 mt-1">per unit</div>
          </div>

          <div className="text-center px-3">
            <div className={`text-[22px] font-semibold tabular-nums tracking-tight ${deltaColor}`}>
              {delta > 0 ? '+' : ''}${delta.toFixed(2)}
            </div>
            <div className="text-[10px] text-mauve-11 mt-1">delta</div>
          </div>

          <div className="text-center">
            <div className="text-[10px] text-mauve-11 mb-2">Made2Manage</div>
            <div className="text-[36px] font-semibold text-mauve-12 tabular-nums tracking-tight leading-none">
              ${m.unitPrice.toFixed(2)}
            </div>
            <div className="text-[10px] text-mauve-11 mt-1">per unit</div>
          </div>
        </div>

        <div className="border-t border-mauve-4 pt-3 flex items-center justify-center gap-2 text-[12px]">
          <span className="text-mauve-11">Revenue impact</span>
          <span className={`font-semibold tabular-nums ${deltaColor}`}>
            {revenueImpact > 0 ? '+' : ''}${revenueImpact.toFixed(2)}
          </span>
          <span className="text-mauve-9 text-[11px]">({qty.toLocaleString()} units)</span>
        </div>
      </div>

      <CardFooter summary={d.summary} />
    </div>
  )
}

// -----------------------------------------------------------------------------
// Shared
// -----------------------------------------------------------------------------

const CardHeader: React.FC<{ d: Discrepancy }> = ({ d }) => (
  <div className="px-4 py-2.5 border-b border-mauve-4 flex items-center justify-between gap-3">
    <div className="flex items-center gap-2 min-w-0">
      <SeverityPill kind={d.kind} />
      <span className="font-mono text-[12px] text-mauve-12">
        PO <PoLink poNumber={d.wabtecPo} />
      </span>
      <span className="text-mauve-7">·</span>
      <span className="text-[12px] text-mauve-11">Line {d.lineNo}</span>
      <span className="text-mauve-7">·</span>
      <span className="font-mono text-[11px] text-mauve-11 truncate">{d.item}</span>
    </div>
    {d.m2m && (
      <span className="font-mono text-[11px] text-mauve-9 flex-shrink-0">
        SO {d.m2m.macSo}
      </span>
    )}
  </div>
)

const CardFooter: React.FC<{ summary: string }> = ({ summary }) => (
  <div className="px-4 py-2 border-t border-mauve-4 bg-mauve-3/50 text-[11px] text-mauve-11">
    {summary}
  </div>
)

const SideLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] text-mauve-11 text-center mb-2">{children}</div>
)

const MiniFacts: React.FC<{ w: WabtecPO }> = ({ w }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] border-t border-mauve-4 pt-3">
    <Fact label="Qty" value={w.totalQuantity.toLocaleString()} />
    <Fact label="Received" value={w.receivedQuantity.toLocaleString()} />
    <Fact label="Promise" value={w.promiseDate || '—'} />
    <Fact label="Unit $" value={w.unitPrice ? `$${w.unitPrice.toFixed(2)}` : '—'} />
  </div>
)

const MiniFactsM: React.FC<{ m: M2MPO }> = ({ m }) => (
  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px] border-t border-mauve-4 pt-3">
    <Fact label="Qty" value={m.totalQty.toLocaleString()} />
    <Fact label="Shipped" value={m.shippedQty.toLocaleString()} />
    <Fact label="Promise" value={fmtIsoDate(m.promiseDate)} />
    <Fact label="Unit $" value={m.unitPrice ? `$${m.unitPrice.toFixed(2)}` : '—'} />
  </div>
)

const Fact: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-center justify-between">
    <span className="text-[11px] text-mauve-11">{label}</span>
    <span className="text-mauve-12 tabular-nums">{value}</span>
  </div>
)

// Tiny status pill with colored dot. Replaces the prior solid-bg badges.
const SeverityPill: React.FC<{ kind: DiscrepancyKind }> = ({ kind }) => {
  const map: Record<DiscrepancyKind, { label: string; dot: string }> = {
    scc_cancelled_m2m_active: { label: 'Critical', dot: 'bg-red-500' },
    scc_active_m2m_cancelled: { label: 'Critical', dot: 'bg-red-500' },
    scc_active_m2m_closed: { label: 'Medium', dot: 'bg-amber-500' },
    missing_in_m2m: { label: 'Unbooked', dot: 'bg-amber-500' },
    pending_intake: { label: 'Intake', dot: 'bg-mauve-9' },
    awaiting_acceptance: { label: 'Awaiting', dot: 'bg-amber-500' },
    ship_to_mismatch: { label: 'Ship-to', dot: 'bg-red-500' },
    qty_mismatch: { label: 'Qty off', dot: 'bg-blue-500' },
    price_mismatch: { label: 'Price off', dot: 'bg-blue-500' },
  }
  const { label, dot } = map[kind]
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[10px] font-medium text-mauve-12">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

const stalenessClass = (days: number | null): { text: string; border: string } => {
  if (days === null) return { text: 'text-mauve-9', border: 'border-mauve-7' }
  if (days >= 14) return { text: 'text-red-600', border: 'border-red-300' }
  if (days >= 7) return { text: 'text-amber-600', border: 'border-amber-300' }
  return { text: 'text-mauve-12', border: 'border-mauve-7' }
}

// =============================================================================
// Orphan-derived discrepancies — sourced from cross-referencing the M2M
// orphan list against the orphan-lookup scraper output. Pinned to the top
// of the Discrepancies view because both kinds are critical.
// =============================================================================
const OrphanDiscrepancySection: React.FC<{ items: OrphanDiscrepancy[] }> = ({ items }) => {
  const [open, setOpen] = useState(true)

  const cancelled = items.filter((i) => i.kind === 'orphan_scc_cancelled_m2m_active')
  const notInScc = items.filter((i) => i.kind === 'orphan_not_in_scc')

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 text-left mb-3"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-mauve-12 tracking-tight">
              Critical — Orphan-derived
            </h3>
            <span className="px-1.5 py-0.5 text-[11px] font-mono bg-mauve-3 rounded text-mauve-11 tabular-nums">
              {items.length.toLocaleString()}
            </span>
          </div>
          <p className="text-[12px] text-mauve-11 mt-0.5">
            M2M sales orders that conflict with the orphan-lookup data:
            {cancelled.length > 0 && ` ${cancelled.length} cancelled in SCC but open in M2M`}
            {cancelled.length > 0 && notInScc.length > 0 && ' ·'}
            {notInScc.length > 0 && ` ${notInScc.length} not found in SCC at all`}.
          </p>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-mauve-9 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="space-y-3">
          {items.map((d, i) => (
            <OrphanDiscrepancyCard key={`${d.kind}-${d.orphan.wabtecPo}-${i}`} d={d} />
          ))}
        </div>
      )}
    </section>
  )
}

const OrphanDiscrepancyCard: React.FC<{ d: OrphanDiscrepancy }> = ({ d }) => {
  const { orphan, lookup, sccStatus, kind } = d
  const isCancelled = kind === 'orphan_scc_cancelled_m2m_active'

  return (
    <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 border-b border-mauve-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <OrphanSeverityPill kind={kind} />
          <span className="font-mono text-[12px] text-mauve-12">
            PO <PoLink poNumber={orphan.wabtecPo} />
          </span>
          <span className="text-mauve-7">·</span>
          <span className="text-[12px] text-mauve-11">SO {orphan.macSo}</span>
          <span className="text-mauve-7">·</span>
          <span className="font-mono text-[11px] text-mauve-11 truncate max-w-[200px]" title={orphan.item}>
            {orphan.item}
          </span>
        </div>
        <span className="text-[11px] text-mauve-11 truncate max-w-[260px]" title={orphan.customerName}>
          {orphan.customerName}
        </span>
      </div>

      <div className="grid grid-cols-2 divide-x divide-mauve-4">
        <div className="p-4">
          <div className="text-[10px] text-mauve-11 mb-2">Wabtec SCC</div>
          {isCancelled ? (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[11px] font-medium text-mauve-12">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                {sccStatus || 'Cancelled'}
              </div>
              {lookup && lookup.lines[0]?.details && (
                <div className="text-[11px] text-mauve-11">
                  {lookup.lines[0].details.itemNumber && <>Item <span className="font-mono">{lookup.lines[0].details.itemNumber}</span></>}
                  {lookup.lines[0].details.buyer.name && <> · Buyer {lookup.lines[0].details.buyer.name}</>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[11px] font-medium text-mauve-11">
                <span className="w-1.5 h-1.5 rounded-full bg-mauve-7" />
                Not found in SCC
              </div>
              <div className="text-[11px] text-mauve-11">
                Even the per-PO filter lookup didn&apos;t return a match.
              </div>
            </div>
          )}
        </div>

        <div className="p-4 bg-mauve-3/40">
          <div className="text-[10px] text-mauve-11 mb-2">Made2Manage</div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[11px] font-medium text-mauve-12">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {orphan.soStatus || 'Open'}
            </div>
            <div className="text-[11px] text-mauve-11">
              Qty {orphan.totalQty.toLocaleString()} · {orphan.lineCount} line{orphan.lineCount !== 1 ? 's' : ''}
              {orphan.promiseDate && <> · promise <span className="font-mono">{orphan.promiseDate.slice(0, 10)}</span></>}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-2 border-t border-mauve-4 bg-mauve-2/50 text-[11px] text-mauve-11">
        {d.summary}
      </div>
    </div>
  )
}

const OrphanSeverityPill: React.FC<{ kind: 'orphan_scc_cancelled_m2m_active' | 'orphan_not_in_scc' }> = ({ kind }) => {
  const label = kind === 'orphan_scc_cancelled_m2m_active' ? 'Cancelled vs Open' : 'Not in SCC'
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[10px] font-medium text-mauve-12">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {label}
    </span>
  )
}
