import React, { useMemo, useState } from 'react'
import type { M2MOrphan } from '../services/m2mData'

interface M2MOrphansProps {
  orphans: M2MOrphan[]
  totalM2MWabtec: number
  matchedToScc: number
  loading: boolean
  error: string | null
}

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—'
  if (iso.startsWith('1899') || iso.startsWith('1900-01')) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Tiny status pill with a colored dot prefix — Vercel-style.
const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const lower = status.toLowerCase()
  const dot =
    lower.startsWith('open') ? 'bg-green-500'
    : lower.startsWith('hold') ? 'bg-amber-500'
    : lower.startsWith('cancel') ? 'bg-red-500'
    : 'bg-zinc-400'
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-zinc-200 bg-white text-[10px] font-medium text-zinc-700">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  )
}

// Vercel-style stat: small label, oversized tabular number, optional sublabel.
const Stat: React.FC<{ label: string; value: number; sublabel?: string; tone?: 'default' | 'critical' | 'success' }> = ({
  label,
  value,
  sublabel,
  tone = 'default',
}) => {
  const dot =
    tone === 'critical' ? 'bg-red-500'
    : tone === 'success' ? 'bg-green-500'
    : 'bg-zinc-300'
  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-[11px] font-medium text-zinc-500 tracking-tight">{label}</span>
      </div>
      <div className="text-3xl font-semibold text-zinc-900 tabular-nums tracking-tight">
        {value.toLocaleString()}
      </div>
      {sublabel && <div className="text-[11px] text-zinc-500 mt-1">{sublabel}</div>}
    </div>
  )
}

export const M2MOrphans: React.FC<M2MOrphansProps> = ({
  orphans,
  totalM2MWabtec,
  matchedToScc,
  loading,
  error,
}) => {
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  const customers = useMemo(() => {
    const set = new Set<string>()
    for (const o of orphans) if (o.customerName) set.add(o.customerName.trim())
    return Array.from(set).sort()
  }, [orphans])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orphans.filter((o) => {
      if (customerFilter !== 'all' && o.customerName.trim() !== customerFilter) return false
      if (!q) return true
      return (
        o.wabtecPo.toLowerCase().includes(q) ||
        o.macSo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        o.item.toLowerCase().includes(q) ||
        o.itemDesc.toLowerCase().includes(q)
      )
    })
  }, [orphans, search, customerFilter])

  const handleExportCSV = () => {
    const header = [
      'Wabtec PO', 'M2M SO', 'Status', 'Customer', 'Order Date',
      'Line Count', 'First Item', 'Description', 'Total Qty', 'Promise Date',
    ].join(',')
    const rows = filtered.map((o) => {
      const cells = [
        o.wabtecPo, o.macSo, o.soStatus, o.customerName, fmtDate(o.orderDate),
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
          <div className="w-5 h-5 mx-auto border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
          <p className="mt-3 text-zinc-500 text-xs tracking-tight">Loading orphans</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white border border-red-200 rounded-lg p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
          <h3 className="text-sm font-semibold text-zinc-900">Failed to load orphans</h3>
        </div>
        <p className="text-xs text-zinc-600 font-mono mt-2 leading-relaxed">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header — title + thin context line. Replaces the prior blue banner. */}
      <div>
        <h1 className="text-[22px] font-semibold text-zinc-900 tracking-tight">M2M Orphans</h1>
        <p className="text-[13px] text-zinc-500 mt-1 leading-relaxed max-w-3xl">
          Open WTS sales orders (FPRODCL 04 or 40) whose customer PO does not appear in the SCC scrape.
          Some entries belong on a different SCC instance we don&apos;t yet have credentials for —
          use this list to triage which subgroups need separate scrapers.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Total WTS lines" value={totalM2MWabtec} sublabel="Open · FPRODCL 04/40" />
        <Stat label="Matched to SCC" value={matchedToScc} sublabel="PO present in scrape" tone="success" />
        <Stat label="Orphans" value={orphans.length} sublabel="Triage required" tone="critical" />
      </div>

      {/* Card containing toolbar + table */}
      <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
              {filtered.length.toLocaleString()} <span className="text-zinc-400">of {orphans.length.toLocaleString()}</span>
            </span>
            <div className="w-px h-4 bg-zinc-200 mx-1" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO, SO, customer, part…"
              className="px-3 py-1.5 text-[13px] border border-zinc-200 rounded-md bg-zinc-50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:ring-0 outline-none w-72 transition-colors placeholder:text-zinc-400"
            />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-1.5 text-[13px] border border-zinc-200 rounded-md bg-zinc-50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:ring-0 outline-none max-w-[260px] transition-colors"
            >
              <option value="all">All customers ({customers.length})</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-[12px] font-medium text-zinc-100 bg-zinc-900 hover:bg-zinc-800 rounded-md transition-colors inline-flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50/50">
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">Wabtec PO</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">M2M SO</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">Customer</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">Ordered</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">First item</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide tabular-nums">Lines</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide tabular-nums">Qty</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-medium text-zinc-500 tracking-wide">Promise</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => {
                const key = `${o.macSo}-${o.wabtecPo}`
                const isOpen = expanded === key
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="border-t border-zinc-100 hover:bg-zinc-50/60 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-[12px] text-zinc-900">{o.wabtecPo}</td>
                      <td className="px-4 py-2.5 font-mono text-[12px] text-zinc-700">{o.macSo}</td>
                      <td className="px-4 py-2.5"><StatusPill status={o.soStatus} /></td>
                      <td className="px-4 py-2.5 text-zinc-700 max-w-[220px] truncate" title={o.customerName}>{o.customerName}</td>
                      <td className="px-4 py-2.5 text-zinc-500 tabular-nums">{fmtDate(o.orderDate)}</td>
                      <td className="px-4 py-2.5 max-w-[220px] truncate" title={`${o.item} — ${o.itemDesc}`}>
                        <span className="font-mono text-[12px] text-zinc-700">{o.item}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 tabular-nums">{o.lineCount}</td>
                      <td className="px-4 py-2.5 text-right text-zinc-700 tabular-nums">{o.totalQty.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-zinc-500 tabular-nums">{fmtDate(o.promiseDate)}</td>
                    </tr>
                    {isOpen && o.lineItems.length > 0 && (
                      <tr className="bg-zinc-50">
                        <td colSpan={9} className="px-8 py-4 border-t border-zinc-100">
                          <div className="text-[10px] font-medium text-zinc-500 tracking-wide uppercase mb-2">
                            All {o.lineItems.length} line item{o.lineItems.length !== 1 ? 's' : ''} on SO {o.macSo}
                          </div>
                          <div className="rounded-md border border-zinc-200 bg-white overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead className="bg-zinc-50/50">
                                <tr className="border-b border-zinc-200">
                                  <th className="text-left py-2 px-3 text-[10px] font-medium text-zinc-500 tracking-wide">Line</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-medium text-zinc-500 tracking-wide">Part</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-medium text-zinc-500 tracking-wide">Description</th>
                                  <th className="text-right py-2 px-3 text-[10px] font-medium text-zinc-500 tracking-wide tabular-nums">Qty</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-medium text-zinc-500 tracking-wide">Promise</th>
                                  <th className="text-left py-2 px-3 text-[10px] font-medium text-zinc-500 tracking-wide">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {o.lineItems.map((li, i) => (
                                  <tr key={i} className="border-t border-zinc-100">
                                    <td className="py-1.5 px-3 font-mono text-zinc-600">{li.lineNo}</td>
                                    <td className="py-1.5 px-3 font-mono text-zinc-900">{li.item}</td>
                                    <td className="py-1.5 px-3 text-zinc-700">{li.itemDesc}</td>
                                    <td className="py-1.5 px-3 text-right text-zinc-700 tabular-nums">{li.totalQty.toLocaleString()}</td>
                                    <td className="py-1.5 px-3 text-zinc-500 tabular-nums">{fmtDate(li.promiseDate)}</td>
                                    <td className="py-1.5 px-3 text-zinc-500">{li.lineStatus || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <div className="text-[13px] text-zinc-500">No orphans match your filters.</div>
                    {(search || customerFilter !== 'all') && (
                      <button
                        onClick={() => { setSearch(''); setCustomerFilter('all') }}
                        className="text-[12px] text-zinc-700 hover:text-zinc-900 underline mt-1"
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
