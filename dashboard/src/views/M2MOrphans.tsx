import React, { useMemo, useState } from 'react'
import type { M2MOrphan, OrphanLookupEntry, OrphanLookupLine } from '../services/m2mData'
import { sccStatusFromLookup } from '../services/m2mData'

interface M2MOrphansProps {
  orphans: M2MOrphan[]
  totalM2MWabtec: number
  matchedToScc: number
  loading: boolean
  error: string | null
  // Map of Wabtec PO (uppercase) -> orphan-lookup entry. Empty if the
  // wabtec-orphan-lookup.json hasn't been generated yet.
  orphanLookup: Map<string, OrphanLookupEntry>
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—'
  if (iso.startsWith('1899') || iso.startsWith('1900-01')) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const lower = status.toLowerCase()
  const dot =
    lower.startsWith('open') ? 'bg-green-500'
    : lower.startsWith('hold') ? 'bg-amber-500'
    : lower.startsWith('cancel') ? 'bg-red-500'
    : lower.startsWith('accept') || lower === 'active' ? 'bg-green-500'
    : lower.startsWith('reject') ? 'bg-red-500'
    : lower.startsWith('revis') ? 'bg-amber-500'
    : 'bg-mauve-9'
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[10px] font-medium text-mauve-12">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  )
}

const Stat: React.FC<{ label: string; value: number; sublabel?: string; tone?: 'default' | 'critical' | 'success' }> = ({
  label,
  value,
  sublabel,
  tone = 'default',
}) => {
  const dot =
    tone === 'critical' ? 'bg-red-500'
    : tone === 'success' ? 'bg-green-500'
    : 'bg-mauve-7'
  return (
    <div className="bg-white border border-mauve-6 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-[11px] font-medium text-mauve-11 tracking-tight">{label}</span>
      </div>
      <div className="text-3xl font-semibold text-mauve-12 tabular-nums tracking-tight">
        {value.toLocaleString()}
      </div>
      {sublabel && <div className="text-[11px] text-mauve-11 mt-1">{sublabel}</div>}
    </div>
  )
}

export const M2MOrphans: React.FC<M2MOrphansProps> = ({
  orphans,
  totalM2MWabtec,
  matchedToScc,
  loading,
  error,
  orphanLookup,
}) => {
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [sccFilter, setSccFilter] = useState<'all' | 'found' | 'not-found'>('all')
  const [sccStatusFilter, setSccStatusFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const customers = useMemo(() => {
    const set = new Set<string>()
    for (const o of orphans) if (o.customerName) set.add(o.customerName.trim())
    return Array.from(set).sort()
  }, [orphans])

  const lookupKey = (po: string) => po.trim().toUpperCase()

  // Distinct SCC statuses present in the loaded orphan-lookup data. Pulled
  // dynamically so we don't hardcode "Accepted / Cancelled / Revised" — if
  // SCC ever introduces a new status it just shows up.
  const sccStatuses = useMemo(() => {
    const set = new Set<string>()
    for (const o of orphans) {
      const lookup = orphanLookup.get(lookupKey(o.wabtecPo))
      const s = sccStatusFromLookup(lookup)
      if (s) set.add(s)
    }
    return Array.from(set).sort()
  }, [orphans, orphanLookup])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orphans.filter((o) => {
      if (customerFilter !== 'all' && o.customerName.trim() !== customerFilter) return false
      const lookup = orphanLookup.get(lookupKey(o.wabtecPo))
      const inScc = !!(lookup && lookup.found)
      if (sccFilter === 'found' && !inScc) return false
      if (sccFilter === 'not-found' && inScc) return false
      if (sccStatusFilter !== 'all') {
        const status = sccStatusFromLookup(lookup) || ''
        if (status !== sccStatusFilter) return false
      }
      if (!q) return true
      return (
        o.wabtecPo.toLowerCase().includes(q) ||
        o.macSo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.item.toLowerCase().includes(q) ||
        o.itemDesc.toLowerCase().includes(q)
      )
    })
  }, [orphans, search, customerFilter, sccFilter, sccStatusFilter, orphanLookup])

  const foundInSccCount = useMemo(
    () => orphans.filter((o) => orphanLookup.get(lookupKey(o.wabtecPo))?.found).length,
    [orphans, orphanLookup],
  )

  const handleExportCSV = () => {
    const header = [
      'Wabtec PO', 'M2M SO', 'M2M Status', 'SCC Status', 'Customer', 'Order Date',
      'Line Count', 'First Item', 'Description', 'Total Qty', 'Promise Date',
    ].join(',')
    const rows = filtered.map((o) => {
      const lookup = orphanLookup.get(lookupKey(o.wabtecPo))
      const sccStatus = sccStatusFromLookup(lookup) || (lookup?.found ? 'In SCC' : 'Not in SCC')
      const cells = [
        o.wabtecPo, o.macSo, o.soStatus, sccStatus, o.customerName, fmtDate(o.orderDate),
        String(o.lineCount), o.item, o.itemDesc, String(o.totalQty), fmtDate(o.promiseDate),
      ].map((v) => {
        const s = String(v ?? '')
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s
      })
      return cells.join(',')
    })
    const csv = [header, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `m2m-orphans-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-center">
          <div className="w-5 h-5 mx-auto border-2 border-mauve-6 border-t-mac-navy rounded-full animate-spin" />
          <p className="mt-3 text-mauve-11 text-xs tracking-tight">Loading orphans</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <h3 className="text-sm font-semibold text-mauve-12">Failed to load orphans</h3>
        </div>
        <p className="text-xs text-mauve-11 font-mono mt-2 leading-relaxed">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-semibold text-mauve-12 tracking-tight">M2M Orphans</h1>
        <p className="text-[13px] text-mauve-11 mt-1 leading-relaxed max-w-3xl">
          Open WTS sales orders (FPRODCL 04 or 40) whose customer PO does not appear in the bulk SCC export.
          The orphan-lookup scraper searches each one in SCC&apos;s filter UI; rows with a green &quot;In SCC&quot;
          pill have full details + history captured. Click any row for the breakdown.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Stat label="Total WTS lines" value={totalM2MWabtec} sublabel="Open · FPRODCL 04/40" />
        <Stat label="Matched to SCC export" value={matchedToScc} sublabel="Bulk grid hit" tone="success" />
        <Stat label="Orphans" value={orphans.length} sublabel="Not in bulk export" tone="critical" />
        <Stat label="Found via lookup" value={foundInSccCount} sublabel="Per-PO filter hit" tone="success" />
      </div>

      <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-mauve-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-mauve-11 tabular-nums">
              {filtered.length.toLocaleString()} <span className="text-mauve-9">of {orphans.length.toLocaleString()}</span>
            </span>
            <div className="w-px h-4 bg-mauve-4 mx-1" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO, SO, customer, part…"
              className="px-3 py-1.5 text-[13px] border border-mauve-6 rounded-md bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none w-72 transition-colors placeholder:text-mauve-9"
            />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-1.5 text-[13px] border border-mauve-6 rounded-md bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none max-w-[260px] transition-colors"
            >
              <option value="all">All customers ({customers.length})</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={sccFilter}
              onChange={(e) => setSccFilter(e.target.value as 'all' | 'found' | 'not-found')}
              className="px-3 py-1.5 text-[13px] border border-mauve-6 rounded-md bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none transition-colors"
            >
              <option value="all">All SCC states</option>
              <option value="found">Found in SCC</option>
              <option value="not-found">Not in SCC</option>
            </select>
            <select
              value={sccStatusFilter}
              onChange={(e) => setSccStatusFilter(e.target.value)}
              disabled={sccStatuses.length === 0}
              className="px-3 py-1.5 text-[13px] border border-mauve-6 rounded-md bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title={sccStatuses.length === 0 ? 'No SCC status data loaded' : 'Filter by SCC status (Accepted / Cancelled / Revised / etc.)'}
            >
              <option value="all">All SCC statuses</option>
              {sccStatuses.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-[12px] font-medium text-mauve-1 bg-mac-navy hover:bg-mac-blue rounded-md transition-colors inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-mauve-6 bg-mauve-3/50">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">Wabtec PO</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">M2M SO</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">M2M Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">SCC Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">Customer</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">Ordered</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">First item</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide tabular-nums">Lines</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide tabular-nums">Qty</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-mauve-11 tracking-wide">Promise</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const key = `${o.macSo}-${o.wabtecPo}`
                const isOpen = expanded === key
                const lookup = orphanLookup.get(lookupKey(o.wabtecPo))
                const sccStatus = sccStatusFromLookup(lookup)
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="border-t border-mauve-4 hover:bg-mauve-3/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-[12px] text-mauve-12">{o.wabtecPo}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-mauve-12">{o.macSo}</td>
                      <td className="px-4 py-2.5"><StatusPill status={o.soStatus} /></td>
                      <td className="px-4 py-2.5">
                        {lookup?.found ? (
                          <StatusPill status={sccStatus || 'In SCC'} />
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-mauve-6 bg-white text-[10px] font-medium text-mauve-11">
                            <span className="w-1.5 h-1.5 rounded-full bg-mauve-7" />
                            Not in SCC
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-mauve-12 max-w-[220px] truncate" title={o.customerName}>{o.customerName}</td>
                      <td className="px-4 py-2.5 text-mauve-11 tabular-nums">{fmtDate(o.orderDate)}</td>
                      <td className="px-4 py-2.5 max-w-[220px] truncate" title={`${o.item} — ${o.itemDesc}`}>
                        <span className="font-mono text-[12px] text-mauve-12">{o.item}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-mauve-12 tabular-nums">{o.lineCount}</td>
                      <td className="px-4 py-2.5 text-right text-mauve-12 tabular-nums">{o.totalQty.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-mauve-11 tabular-nums">{fmtDate(o.promiseDate)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-mauve-2">
                        <td colSpan={10} className="px-8 py-5 border-t border-mauve-4">
                          <ExpandedRow orphan={o} lookup={lookup} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="text-[13px] text-mauve-11">No orphans match your filters.</div>
                    {(search || customerFilter !== 'all' || sccFilter !== 'all' || sccStatusFilter !== 'all') && (
                      <button
                        onClick={() => { setSearch(''); setCustomerFilter('all'); setSccFilter('all'); setSccStatusFilter('all') }}
                        className="text-[12px] text-mauve-12 hover:text-mauve-12 underline mt-1"
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// ExpandedRow — drill-in view shown when a user clicks an orphan row.
// Renders BOTH sides of the picture:
//   1. M2M sales order line items (already had this)
//   2. Wabtec SCC details + history per line, from orphan-lookup scraper data
//      Iterates lookup.lines so all 12 multi-line POs show every line, not
//      just the first (per the user's instruction).
// =============================================================================
const ExpandedRow: React.FC<{ orphan: M2MOrphan; lookup: OrphanLookupEntry | undefined }> = ({ orphan, lookup }) => (
  <div className="space-y-5">
    {/* M2M side */}
    <div>
      <div className="text-[10px] font-medium text-mauve-11 tracking-wide uppercase mb-2">
        M2M sales order — {orphan.lineItems.length} line item{orphan.lineItems.length !== 1 ? 's' : ''} on SO {orphan.macSo}
      </div>
      <div className="rounded-md border border-mauve-6 bg-white overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-mauve-3/50">
            <tr className="border-b border-mauve-6">
              <th className="text-left py-2 px-3 text-[10px] font-medium text-mauve-11 tracking-wide">Line</th>
              <th className="text-left py-2 px-3 text-[10px] font-medium text-mauve-11 tracking-wide">Part</th>
              <th className="text-left py-2 px-3 text-[10px] font-medium text-mauve-11 tracking-wide">Description</th>
              <th className="text-right py-2 px-3 text-[10px] font-medium text-mauve-11 tracking-wide tabular-nums">Qty</th>
              <th className="text-left py-2 px-3 text-[10px] font-medium text-mauve-11 tracking-wide">Promise</th>
              <th className="text-left py-2 px-3 text-[10px] font-medium text-mauve-11 tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {orphan.lineItems.map((li, i) => (
              <tr key={i} className="border-t border-mauve-4">
                <td className="py-1.5 px-3 font-mono text-mauve-11">{li.lineNo}</td>
                <td className="py-1.5 px-3 font-mono text-mauve-12">{li.item}</td>
                <td className="py-1.5 px-3 text-mauve-12">{li.itemDesc}</td>
                <td className="py-1.5 px-3 text-right text-mauve-12 tabular-nums">{li.totalQty.toLocaleString()}</td>
                <td className="py-1.5 px-3 text-mauve-11 tabular-nums">{fmtDate(li.promiseDate)}</td>
                <td className="py-1.5 px-3 text-mauve-11">{li.lineStatus || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

    {/* SCC side from orphan-lookup */}
    {lookup && lookup.found && lookup.lines.length > 0 ? (
      <div>
        <div className="text-[10px] font-medium text-mauve-11 tracking-wide uppercase mb-2">
          Wabtec SCC — {lookup.lines.length} line{lookup.lines.length !== 1 ? 's' : ''} captured via lookup
        </div>
        <div className="space-y-4">
          {lookup.lines.map((line, i) => (
            <SccLineCard key={i} line={line} lineNumber={i + 1} totalLines={lookup.lines.length} />
          ))}
        </div>
      </div>
    ) : (
      <div className="rounded-md border border-mauve-6 bg-white p-4 text-[12px] text-mauve-11">
        Not yet captured by the orphan-lookup scraper. Run{' '}
        <code className="font-mono text-[11px] bg-mauve-3 px-1 py-0.5 rounded">npm run scrape:orphan-lookup</code>
        {' '}to populate SCC details + history for this PO.
      </div>
    )}
  </div>
)

// One SCC line: details + collapsed history. History expands inline so users
// can drill all the way down without leaving the row.
const SccLineCard: React.FC<{
  line: OrphanLookupLine
  lineNumber: number
  totalLines: number
}> = ({ line, lineNumber, totalLines }) => {
  const [historyOpen, setHistoryOpen] = useState(false)
  const d = line.details
  const ship = [d.shipTo.address, d.shipTo.city, d.shipTo.state, d.shipTo.zip].filter(Boolean).join(', ') || '—'
  const buyer = d.buyer.name ? `${d.buyer.name}${d.buyer.email ? ` (${d.buyer.email})` : ''}` : '—'
  return (
    <div className="rounded-md border border-mauve-6 bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-mauve-6 bg-mauve-3/50 flex items-center justify-between">
        <span className="text-[11px] font-medium text-mauve-12">
          Line {lineNumber} of {totalLines}
          {d.poLineNumber ? <span className="font-mono text-mauve-11 ml-2">PO Line {d.poLineNumber}</span> : null}
        </span>
        <span className="text-[10px] text-mauve-11">scraped {new Date(d.scrapedAt).toLocaleDateString()}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 px-3 py-3 text-[12px]">
        <Field label="Item" value={d.itemNumber} mono />
        <Field label="Buyer" value={buyer} />
        <Field label="Ship via" value={d.sendVia} />
        <Field label="FOB" value={d.fob} />
        <Field label="Shipping terms" value={d.shippingTerms} />
        <Field label="Vendor" value={d.shipFrom.name} />
        <Field label="Ship to" value={ship} className="col-span-2 md:col-span-3" />
      </div>

      <div className="border-t border-mauve-6 px-3 py-2">
        <button
          onClick={() => setHistoryOpen((v) => !v)}
          className="text-[11px] font-medium text-mauve-12 hover:text-mauve-12 inline-flex items-center gap-1.5"
        >
          <svg
            className={`w-3 h-3 transition-transform ${historyOpen ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          {historyOpen ? 'Hide' : 'Show'} history ({line.history.historyRowCount} row{line.history.historyRowCount !== 1 ? 's' : ''})
        </button>
        {historyOpen && line.history.rows.length > 0 && <HistoryTable history={line.history} />}
        {historyOpen && line.history.rows.length === 0 && (
          <div className="mt-2 text-[11px] text-mauve-11">No history rows captured (Core Changes filter may have hidden everything).</div>
        )}
      </div>
    </div>
  )
}

const Field: React.FC<{ label: string; value: string | null; mono?: boolean; className?: string }> = ({
  label,
  value,
  mono,
  className,
}) => (
  <div className={className}>
    <div className="text-[10px] font-medium text-mauve-11 tracking-wide">{label}</div>
    <div className={`text-mauve-12 ${mono ? 'font-mono text-[11px]' : ''}`}>{value || '—'}</div>
  </div>
)

const HISTORY_COLS = [
  'Revision number',
  'Change Type',
  'Type Of Change',
  'Before',
  'After',
  'Net Change',
  'Updated time',
  'Updated by',
] as const

const HistoryTable: React.FC<{ history: OrphanLookupLine['history'] }> = ({ history }) => {
  // Sort newest-first by Updated time when parseable
  const parse = (v: string): number => {
    const m = (v || '').match(/^(\d{2})-(\d{2})-(\d{4})$/)
    if (!m) return 0
    const [, mm, dd, yyyy] = m
    const t = new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime()
    return Number.isFinite(t) ? t : 0
  }
  const sorted = useMemo(() =>
    [...history.rows].sort((a, b) => parse(b['Updated time'] || '') - parse(a['Updated time'] || '')),
  [history.rows])

  return (
    <div className="mt-3 rounded-md border border-mauve-6 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="bg-mauve-3/50">
            <tr className="border-b border-mauve-6">
              {HISTORY_COLS.map((col) => (
                <th key={col} className="text-left py-1.5 px-2 text-[10px] font-medium text-mauve-11 tracking-wide whitespace-nowrap">
                  {col === 'Updated time' ? 'Updated' : col === 'Updated by' ? 'By' : col === 'Revision number' ? 'Rev' : col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const kind = (row['Type Of Change'] || '').toUpperCase()
              const dot =
                kind === 'CORE' ? 'bg-red-500'
                : kind === 'INITIAL' ? 'bg-blue-500'
                : 'bg-mauve-7'
              return (
                <tr key={i} className="border-t border-mauve-4">
                  {HISTORY_COLS.map((col) => {
                    const v = row[col] || ''
                    if (col === 'Type Of Change' && v) {
                      return (
                        <td key={col} className="py-1 px-2">
                          <span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border border-mauve-6 bg-white text-[10px] font-medium text-mauve-12">
                            <span className={`w-1 h-1 rounded-full ${dot}`} />
                            {kind}
                          </span>
                        </td>
                      )
                    }
                    const isMono = col === 'Updated time' || col === 'Revision number'
                    return (
                      <td key={col} className={`py-1 px-2 text-mauve-12 whitespace-nowrap ${isMono ? 'font-mono' : ''}`}>
                        {v || <span className="text-mauve-7">—</span>}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
