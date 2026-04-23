import React, { useMemo, useState } from 'react'
import { formatShipTo, type WabtecPO } from '../services/wabtecData'
import { isDiscrepancy, type Discrepancy, type M2MPO } from '../services/m2mData'
import { SCCStatusBadge, M2MStateBadge, fmtIsoDate } from '../components/StatusBadges'

type Tab = 'wabtec' | 'm2m' | 'side-by-side'
type M2MStateFilter = 'all' | 'active' | 'closed' | 'cancelled' | 'missing'

interface ComparisonProps {
  wabtec: WabtecPO[]
  m2m: M2MPO[]
  discrepancies: Discrepancy[]
  loading: boolean
  error: string | null
}

interface AlignedRow {
  wabtec: WabtecPO
  m2m: M2MPO | null
}

const PAGE_SIZE = 25

export const Comparison: React.FC<ComparisonProps> = ({
  wabtec,
  m2m,
  discrepancies,
  loading,
  error,
}) => {
  const [tab, setTab] = useState<Tab>('wabtec')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [sccStatus, setSccStatus] = useState<string>('all')
  const [m2mState, setM2mState] = useState<M2MStateFilter>('all')
  const [buyer, setBuyer] = useState<string>('all')
  const [onlyDiscrepancies, setOnlyDiscrepancies] = useState(false)

  // Single source of truth: iterate the Wabtec CSV in its natural order;
  // look up M2M by (PO + line). This guarantees row N is the same PO in
  // both the Wabtec and M2M tabs.
  // Line normalization: M2M FENUMBER is Character(3) so returns "001",
  // but SCC CSV uses plain integers like "1". Parse both to int-as-string.
  const keyFor = (po: string, line: string): string => {
    const n = parseInt(line || '0', 10)
    return `${po.trim()}|${Number.isFinite(n) ? n : 0}`
  }

  const aligned: AlignedRow[] = useMemo(() => {
    // Two-tier match. Exact (PO + line) is the confident path; if that misses
    // but the PO exists in M2M under any line, take the best-available row
    // (prefer open/active, else first). Catches cases where Wabtec and M2M
    // disagree on line numbering for the same order — e.g. PO 210439980 is
    // CSV line 1 but lives on M2M line 2. Without this fallback the row
    // shows "Not found in M2M" even though the PO is right there.
    const byKey = new Map<string, M2MPO>()
    const byPo = new Map<string, M2MPO[]>()
    for (const row of m2m) {
      byKey.set(keyFor(row.wabtecPo, row.lineNo), row)
      const po = (row.wabtecPo || '').trim()
      if (!byPo.has(po)) byPo.set(po, [])
      byPo.get(po)!.push(row)
    }

    const pickBest = (rows: M2MPO[]): M2MPO => {
      const active = rows.find((r) => r.isActive)
      return active || rows[0]
    }

    return wabtec.map((w) => {
      const exact = byKey.get(keyFor(w.poNumber, w.poLineNumber))
      if (exact) return { wabtec: w, m2m: exact }
      const poRows = byPo.get(w.poNumber.trim())
      if (poRows && poRows.length > 0) {
        return { wabtec: w, m2m: pickBest(poRows) }
      }
      return { wabtec: w, m2m: null }
    })
  }, [wabtec, m2m])

  // Orphan M2M rows — exist in M2M but not in current SCC export. Usually
  // historical/closed orders. Shown as a note, not in the main tabs.
  const m2mOnlyCount = useMemo(() => {
    const sccKeys = new Set(wabtec.map((w) => keyFor(w.poNumber, w.poLineNumber)))
    return m2m.filter((r) => !sccKeys.has(keyFor(r.wabtecPo, r.lineNo))).length
  }, [wabtec, m2m])

  const matchedCount = aligned.filter((r) => r.m2m !== null).length

  // Distinct dropdown values, derived from the loaded data (alphabetical).
  const sccStatusOptions = useMemo(() => {
    const set = new Set<string>()
    for (const w of wabtec) {
      const v = (w.action || '').trim()
      if (v) set.add(v)
    }
    return Array.from(set).sort()
  }, [wabtec])

  const buyerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const w of wabtec) {
      const v = (w.buyerName || '').trim()
      if (v) set.add(v)
    }
    return Array.from(set).sort()
  }, [wabtec])

  // Set of "PO|line" keys that show up in any *real* discrepancy. Excludes
  // pending_intake (under 5 days old — workflow lag, not an issue).
  const discrepantKeys = useMemo(() => {
    const set = new Set<string>()
    for (const d of discrepancies) {
      if (isDiscrepancy(d.kind)) set.add(keyFor(d.wabtecPo, d.lineNo))
    }
    return set
  }, [discrepancies])

  const m2mStateOf = (m: M2MPO | null): M2MStateFilter => {
    if (!m) return 'missing'
    if (m.cancelledDate) return 'cancelled'
    if (m.closedDate) return 'closed'
    return 'active'
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return aligned.filter(({ wabtec: w, m2m: m }) => {
      if (q) {
        const hit =
          w.poNumber.toLowerCase().includes(q) ||
          w.itemNumber.toLowerCase().includes(q) ||
          w.itemDescription.toLowerCase().includes(q) ||
          (m && (m.item.toLowerCase().includes(q) || m.itemDesc.toLowerCase().includes(q)))
        if (!hit) return false
      }
      if (sccStatus !== 'all' && (w.action || '').trim() !== sccStatus) return false
      if (m2mState !== 'all' && m2mStateOf(m) !== m2mState) return false
      if (buyer !== 'all' && (w.buyerName || '').trim() !== buyer) return false
      if (onlyDiscrepancies && !discrepantKeys.has(keyFor(w.poNumber, w.poLineNumber))) return false
      return true
    })
  }, [aligned, search, sccStatus, m2mState, buyer, onlyDiscrepancies, discrepantKeys])

  const filtersActive =
    search.trim() !== '' ||
    sccStatus !== 'all' ||
    m2mState !== 'all' ||
    buyer !== 'all' ||
    onlyDiscrepancies

  const clearFilters = () => {
    setSearch('')
    setSccStatus('all')
    setM2mState('all')
    setBuyer('all')
    setOnlyDiscrepancies(false)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const onTabChange = (next: Tab) => {
    setTab(next)
    setPage(1)
  }

  return (
    <div className="view-transition space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-200">
        <TabButton active={tab === 'wabtec'} onClick={() => onTabChange('wabtec')}>
          Wabtec SCC
          <Count n={wabtec.length} />
        </TabButton>
        <TabButton active={tab === 'm2m'} onClick={() => onTabChange('m2m')}>
          Made2Manage
          <Count n={matchedCount} label="matched" />
        </TabButton>
        <TabButton active={tab === 'side-by-side'} onClick={() => onTabChange('side-by-side')}>
          Side-by-Side Diff
        </TabButton>
      </div>

      {tab !== 'side-by-side' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              placeholder="Search PO number, item, description…"
              className="flex-1 max-w-md px-4 py-2 text-sm rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none"
            />
            <div className="text-xs text-slate-500 font-mono">
              {filtered.length.toLocaleString()} rows
              {m2mOnlyCount > 0 && tab === 'm2m' && (
                <span className="ml-3 text-slate-400">
                  (+{m2mOnlyCount.toLocaleString()} M2M-only, not in SCC)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <FilterField label="SCC Status">
              <FilterSelect
                value={sccStatus}
                onChange={(v) => {
                  setSccStatus(v)
                  setPage(1)
                }}
              >
                <option value="all">All</option>
                {sccStatusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <FilterField label="M2M State">
              <FilterSelect
                value={m2mState}
                onChange={(v) => {
                  setM2mState(v as M2MStateFilter)
                  setPage(1)
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
                <option value="cancelled">Cancelled</option>
                <option value="missing">Not in M2M</option>
              </FilterSelect>
            </FilterField>

            <FilterField label="Buyer">
              <FilterSelect
                value={buyer}
                onChange={(v) => {
                  setBuyer(v)
                  setPage(1)
                }}
              >
                <option value="all">All</option>
                {buyerOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </FilterSelect>
            </FilterField>

            <button
              onClick={() => {
                setOnlyDiscrepancies((v) => !v)
                setPage(1)
              }}
              className={`px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-lg border transition-colors ${
                onlyDiscrepancies
                  ? 'bg-red-50 text-red-600 border-red-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {onlyDiscrepancies ? 'Showing discrepancies only' : 'Only discrepancies'}
            </button>

            <div className="flex-1" />

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="text-xs font-bold uppercase tracking-wider text-mac-accent hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
          Loading…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && tab === 'wabtec' && <WabtecTable rows={pageRows} />}
      {!loading && !error && tab === 'm2m' && <M2MTable rows={pageRows} />}
      {!loading && !error && tab === 'side-by-side' && <SideBySidePlaceholder />}

      {!loading && !error && tab !== 'side-by-side' && filtered.length > PAGE_SIZE && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onChange={setPage}
          rows={filtered.length}
        />
      )}
    </div>
  )
}

const Count: React.FC<{ n: number; label?: string }> = ({ n, label }) => (
  <span className="ml-2 px-1.5 py-0.5 text-[9px] font-mono rounded bg-slate-100 text-slate-600">
    {n.toLocaleString()}
    {label ? ` ${label}` : ''}
  </span>
)

const FilterField: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {label}
    </span>
    {children}
  </div>
)

const FilterSelect: React.FC<{
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}> = ({ value, onChange, children }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none min-w-[140px]"
  >
    {children}
  </select>
)

const TabButton: React.FC<{
  active: boolean
  onClick: () => void
  children: React.ReactNode
}> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-4 py-3 text-sm font-medium flex items-center transition-colors ${
      active
        ? 'text-mac-accent border-b-2 border-mac-accent -mb-px'
        : 'text-slate-500 hover:text-slate-700'
    }`}
  >
    {children}
  </button>
)

const WabtecTable: React.FC<{ rows: AlignedRow[] }> = ({ rows }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left">
            <Th>PO</Th>
            <Th>Line</Th>
            <Th>Item</Th>
            <Th>Description</Th>
            <Th>Total Qty</Th>
            <Th>Received</Th>
            <Th>Open</Th>
            <Th>Promise Date</Th>
            <Th>Creation Date</Th>
            <Th>Unit Price</Th>
            <Th>Buyer</Th>
            <Th>Destination</Th>
            <Th>SCC Status</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ wabtec: r }, idx) => (
            <tr key={`${r.poNumber}-${r.poLineNumber}-${idx}`} className="hover:bg-slate-50">
              <Td mono>{r.poNumber}</Td>
              <Td>{r.poLineNumber}</Td>
              <Td mono>{r.itemNumber}</Td>
              <Td className="max-w-[220px] truncate">{r.itemDescription}</Td>
              <Td numeric>{r.totalQuantity.toLocaleString()}</Td>
              <Td numeric>{r.receivedQuantity.toLocaleString()}</Td>
              <Td numeric>{r.openQuantity.toLocaleString()}</Td>
              <Td mono>{r.promiseDate}</Td>
              <Td mono>{r.creationDate || '—'}</Td>
              <Td numeric>{r.unitPrice ? `$${r.unitPrice.toFixed(2)}` : '—'}</Td>
              <Td>{r.buyerName}</Td>
              <Td
                className="max-w-[280px] truncate"
                title={formatShipTo(r.shipTo) || r.destinationOrg || ''}
              >
                {r.shipTo ? (
                  <div className="leading-tight">
                    <div className="font-medium text-slate-700 truncate">
                      {r.shipTo.address || '—'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {[r.shipTo.city, r.shipTo.state]
                        .filter(Boolean)
                        .join(', ')}
                      {r.shipTo.zip ? ` ${r.shipTo.zip}` : ''}
                    </div>
                  </div>
                ) : r.destinationOrg ? (
                  <span className="text-slate-500 italic">{r.destinationOrg}</span>
                ) : (
                  '—'
                )}
              </Td>
              <Td>
                <SCCStatusBadge action={r.action} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const M2MTable: React.FC<{ rows: AlignedRow[] }> = ({ rows }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr className="text-left">
            <Th>Wabtec PO</Th>
            <Th>MAC SO</Th>
            <Th>Line</Th>
            <Th>Item</Th>
            <Th>Description</Th>
            <Th>Order Qty</Th>
            <Th>Shipped</Th>
            <Th>Unit Price</Th>
            <Th>Promise Date</Th>
            <Th>Order Date</Th>
            <Th>Ship To</Th>
            <Th>State</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map(({ wabtec: w, m2m: m }, idx) => {
            if (!m) {
              return (
                <tr key={`${w.poNumber}-${w.poLineNumber}-${idx}`} className="bg-red-50/40">
                  <Td mono>{w.poNumber}</Td>
                  <Td className="text-red-500 italic text-xs" colSpan={11}>
                    Not found in M2M
                  </Td>
                </tr>
              )
            }
            return (
              <tr key={`${m.wabtecPo}-${m.lineNo}-${idx}`} className="hover:bg-slate-50">
                <Td mono>{m.wabtecPo}</Td>
                <Td mono>{m.macSo}</Td>
                <Td>{m.lineNo}</Td>
                <Td mono>{m.item}</Td>
                <Td className="max-w-[220px] truncate">{m.itemDesc}</Td>
                <Td numeric>{m.totalQty.toLocaleString()}</Td>
                <Td numeric>{m.shippedQty.toLocaleString()}</Td>
                <Td numeric>{m.unitPrice ? `$${m.unitPrice.toFixed(2)}` : '—'}</Td>
                <Td mono>{fmtIsoDate(m.promiseDate)}</Td>
                <Td mono>{fmtIsoDate(m.orderDate)}</Td>
                <Td className="max-w-[180px] truncate">
                  {[m.shipToCity, m.shipToState].filter(Boolean).join(', ') || '—'}
                </Td>
                <Td>
                  <M2MStateBadge row={m} />
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
)


const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
    {children}
  </th>
)

const Td: React.FC<{
  children: React.ReactNode
  className?: string
  mono?: boolean
  numeric?: boolean
  colSpan?: number
  title?: string
}> = ({ children, className, mono, numeric, colSpan, title }) => (
  <td
    colSpan={colSpan}
    title={title}
    className={`px-4 py-2.5 text-slate-700 whitespace-nowrap ${
      mono ? 'font-mono text-xs' : ''
    } ${numeric ? 'text-right tabular-nums' : ''} ${className || ''}`}
  >
    {children}
  </td>
)

interface PaginationProps {
  page: number
  totalPages: number
  rows: number
  onChange: (p: number) => void
}
const Pagination: React.FC<PaginationProps> = ({ page, totalPages, rows, onChange }) => {
  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, rows)
  return (
    <div className="flex items-center justify-between text-sm text-slate-500">
      <div className="font-mono text-xs">
        {from}–{to} of {rows.toLocaleString()}
      </div>
      <div className="flex items-center gap-2">
        <PageBtn disabled={page <= 1} onClick={() => onChange(1)}>
          First
        </PageBtn>
        <PageBtn disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Prev
        </PageBtn>
        <span className="px-3 font-mono text-xs">
          Page {page} / {totalPages}
        </span>
        <PageBtn disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Next
        </PageBtn>
        <PageBtn disabled={page >= totalPages} onClick={() => onChange(totalPages)}>
          Last
        </PageBtn>
      </div>
    </div>
  )
}

const PageBtn: React.FC<{
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}> = ({ disabled, onClick, children }) => (
  <button
    disabled={disabled}
    onClick={onClick}
    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {children}
  </button>
)

const SideBySidePlaceholder: React.FC = () => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
    <h3 className="font-bold text-slate-700 text-lg">Side-by-Side Diff</h3>
    <p className="text-sm text-slate-500 mt-2 max-w-lg mx-auto">
      Coming next — render Wabtec and M2M side-by-side on the same row with
      mismatched fields highlighted inline. Currently the two separate tabs
      already stay row-aligned by PO + line.
    </p>
  </div>
)
