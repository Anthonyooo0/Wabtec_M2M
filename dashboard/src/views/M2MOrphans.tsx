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
  // Treat the M2M sentinel "1899-12-31" / "1900-01-01" as not-set
  if (iso.startsWith('1899') || iso.startsWith('1900-01')) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString()
}

export const M2MOrphans: React.FC<M2MOrphansProps> = ({ orphans, totalM2MWabtec, matchedToScc, loading, error }) => {
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  // Group customers for the filter dropdown
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
      <div className="view-transition flex items-center justify-center py-20">
        <div className="text-center">
          <div className="w-8 h-8 mx-auto border-4 border-slate-200 border-t-mac-navy rounded-full animate-spin"></div>
          <p className="mt-3 text-slate-500 text-sm">Loading M2M orphans...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="view-transition bg-red-50 border border-red-200 rounded-xl p-6">
        <h3 className="font-bold text-red-700">Failed to load orphans</h3>
        <p className="mt-2 text-red-600 text-sm font-mono">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 view-transition">
      {/* Context banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h3 className="font-bold text-blue-900 text-sm">What you're looking at</h3>
        <p className="mt-1 text-blue-700 text-xs leading-relaxed">
          Sales orders in M2M with Wabtec product class (FPRODCL=04) whose customer PO does NOT appear
          in the Wabtec SCC scrape. Some entries are expected — they likely live on a different
          SCC instance (Wabtec Global Services, Progress Rail, etc.) we don't yet have credentials for.
          Use this list to triage which subgroups need separate scrapers.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border-l-4 border-l-slate-300 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Total M2M Wabtec lines</div>
          <div className="text-3xl font-bold text-slate-800">{totalM2MWabtec.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-1">Open, FPRODCL=04</div>
        </div>
        <div className="bg-white p-5 rounded-xl border-l-4 border-l-green-500 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Matched to SCC</div>
          <div className="text-3xl font-bold text-slate-800">{matchedToScc.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-1">PO found in scraped grid</div>
        </div>
        <div className="bg-white p-5 rounded-xl border-l-4 border-l-red-500 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase">Orphans (not in SCC)</div>
          <div className="text-3xl font-bold text-slate-800">{orphans.length.toLocaleString()}</div>
          <div className="text-[10px] text-slate-400 mt-1">Triage required</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {filtered.length} of {orphans.length} orphan{orphans.length !== 1 ? 's' : ''}
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO, SO, customer, part..."
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-mac-accent outline-none w-64"
            />
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:border-mac-accent outline-none bg-white max-w-[260px]"
            >
              <option value="all">All customers ({customers.length})</option>
              {customers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 text-[10px] font-bold text-mac-accent hover:bg-blue-50 border border-slate-200 rounded-lg uppercase tracking-wider transition-colors"
          >
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Wabtec PO</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">M2M SO</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Status</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Customer</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Order Date</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">First Item</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Lines</th>
                <th className="text-right px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Qty</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-600 uppercase">Promise</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((o) => {
                const key = `${o.macSo}-${o.wabtecPo}`
                const isOpen = expanded === key
                return (
                  <React.Fragment key={key}>
                    <tr
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">{o.wabtecPo}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-700">{o.macSo}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          o.soStatus.toLowerCase().startsWith('open')
                            ? 'bg-blue-50 text-blue-600 border-blue-200'
                            : o.soStatus.toLowerCase().startsWith('hold')
                              ? 'bg-orange-50 text-orange-600 border-orange-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}>
                          {o.soStatus}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-600 text-xs max-w-[200px] truncate" title={o.customerName}>{o.customerName}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs">{fmtDate(o.orderDate)}</td>
                      <td className="px-4 py-2 text-slate-600 text-xs max-w-[180px] truncate" title={`${o.item} — ${o.itemDesc}`}>
                        <span className="font-mono">{o.item}</span>
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600 text-xs">{o.lineCount}</td>
                      <td className="px-4 py-2 text-right text-slate-600 text-xs">{o.totalQty}</td>
                      <td className="px-4 py-2 text-slate-500 text-xs">{fmtDate(o.promiseDate)}</td>
                    </tr>
                    {isOpen && o.lineItems.length > 0 && (
                      <tr className="bg-slate-50">
                        <td colSpan={9} className="px-8 py-3">
                          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            All {o.lineItems.length} line item{o.lineItems.length !== 1 ? 's' : ''} on SO {o.macSo}
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[10px] text-slate-500 uppercase">
                                <th className="text-left py-1">Line</th>
                                <th className="text-left py-1">Part</th>
                                <th className="text-left py-1">Description</th>
                                <th className="text-right py-1">Qty</th>
                                <th className="text-left py-1">Promise</th>
                                <th className="text-left py-1">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {o.lineItems.map((li, i) => (
                                <tr key={i} className="border-t border-slate-200">
                                  <td className="py-1 font-mono text-slate-600">{li.lineNo}</td>
                                  <td className="py-1 font-mono text-slate-700">{li.item}</td>
                                  <td className="py-1 text-slate-600">{li.itemDesc}</td>
                                  <td className="py-1 text-right text-slate-600">{li.totalQty}</td>
                                  <td className="py-1 text-slate-500">{fmtDate(li.promiseDate)}</td>
                                  <td className="py-1 text-slate-500">{li.lineStatus || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">
                    No orphans match your filters.
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
