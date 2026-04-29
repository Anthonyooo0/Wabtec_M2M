import React, { useMemo, useState } from 'react'
import { formatShipTo, type WabtecPO } from '../services/wabtecData'
import { PoLink } from '../components/PoLink'
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

  const keyFor = (po: string, line: string): string => {
    const n = parseInt(line || '0', 10)
    return `${po.trim()}|${Number.isFinite(n) ? n : 0}`
  }

  const aligned: AlignedRow[] = useMemo(() => {
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
      if (poRows && poRows.length > 0) return { wabtec: w, m2m: pickBest(poRows) }
      return { wabtec: w, m2m: null }
    })
  }, [wabtec, m2m])

  const m2mOnlyCount = useMemo(() => {
    const sccKeys = new Set(wabtec.map((w) => keyFor(w.poNumber, w.poLineNumber)))
    return m2m.filter((r) => !sccKeys.has(keyFor(r.wabtecPo, r.lineNo))).length
  }, [wabtec, m2m])

  const matchedCount = aligned.filter((r) => r.m2m !== null).length

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
    <div className="space-y-4 view-transition">
      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-mauve-6">
        <TabButton active={tab === 'wabtec'} onClick={() => onTabChange('wabtec')}>
          Wabtec SCC <Count n={wabtec.length} />
        </TabButton>
        <TabButton active={tab === 'm2m'} onClick={() => onTabChange('m2m')}>
          Made2Manage <Count n={matchedCount} label="matched" />
        </TabButton>
        <TabButton active={tab === 'side-by-side'} onClick={() => onTabChange('side-by-side')}>
          Side-by-side
        </TabButton>
      </div>

      {tab !== 'side-by-side' && (
        <div className="bg-white border border-mauve-6 rounded-lg p-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search PO, item, description…"
              className="flex-1 max-w-md px-3 py-1.5 text-[13px] border border-mauve-6 rounded-md bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none transition-colors placeholder:text-mauve-9"
            />
            <div className="text-[11px] text-mauve-11 tabular-nums">
              {filtered.length.toLocaleString()} rows
              {m2mOnlyCount > 0 && tab === 'm2m' && (
                <span className="ml-2 text-mauve-9">
                  (+{m2mOnlyCount.toLocaleString()} M2M-only, not in SCC)
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect value={sccStatus} onChange={(v) => { setSccStatus(v); setPage(1) }}>
              <option value="all">All SCC statuses</option>
              {sccStatusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </FilterSelect>

            <FilterSelect value={m2mState} onChange={(v) => { setM2mState(v as M2MStateFilter); setPage(1) }}>
              <option value="all">All M2M states</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
              <option value="cancelled">Cancelled</option>
              <option value="missing">Not in M2M</option>
            </FilterSelect>

            <FilterSelect value={buyer} onChange={(v) => { setBuyer(v); setPage(1) }}>
              <option value="all">All buyers</option>
              {buyerOptions.map((b) => <option key={b} value={b}>{b}</option>)}
            </FilterSelect>

            <button
              onClick={() => { setOnlyDiscrepancies((v) => !v); setPage(1) }}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium rounded-md border transition-colors ${
                onlyDiscrepancies
                  ? 'bg-mac-navy text-white border-mac-navy'
                  : 'bg-white text-mauve-12 border-mauve-6 hover:bg-mauve-2'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${onlyDiscrepancies ? 'bg-red-400' : 'bg-mauve-7'}`} />
              {onlyDiscrepancies ? 'Discrepancies only' : 'Only discrepancies'}
            </button>

            <div className="flex-1" />

            {filtersActive && (
              <button
                onClick={clearFilters}
                className="text-[12px] font-medium text-mauve-12 hover:text-mauve-12 underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white border border-mauve-6 rounded-lg p-12 text-center">
          <div className="w-5 h-5 mx-auto border-2 border-mauve-6 border-t-mac-navy rounded-full animate-spin" />
          <p className="mt-3 text-[12px] text-mauve-11">Loading</p>
        </div>
      )}
      {error && (
        <div className="bg-white border border-red-200 rounded-lg p-5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && tab === 'wabtec' && <WabtecTable rows={pageRows} />}
      {!loading && !error && tab === 'm2m' && <M2MTable rows={pageRows} />}
      {!loading && !error && tab === 'side-by-side' && <SideBySidePlaceholder />}

      {!loading && !error && tab !== 'side-by-side' && filtered.length > PAGE_SIZE && (
        <Pagination page={currentPage} totalPages={totalPages} onChange={setPage} rows={filtered.length} />
      )}
    </div>
  )
}

const Count: React.FC<{ n: number; label?: string }> = ({ n, label }) => (
  <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-mono rounded bg-mauve-3 text-mauve-11 tabular-nums">
    {n.toLocaleString()}{label ? ` ${label}` : ''}
  </span>
)

const FilterSelect: React.FC<{
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}> = ({ value, onChange, children }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="px-2.5 py-1.5 text-[12px] rounded-md border border-mauve-6 bg-mauve-2 hover:bg-white focus:bg-white focus:border-mauve-8 focus:ring-0 outline-none min-w-[140px] transition-colors"
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
    className={`px-3 py-2.5 text-[13px] font-medium flex items-center transition-colors ${
      active
        ? 'text-mauve-12 border-b-2 border-mac-navy -mb-px'
        : 'text-mauve-11 hover:text-mauve-12 border-b-2 border-transparent -mb-px'
    }`}
  >
    {children}
  </button>
)

const WabtecTable: React.FC<{ rows: AlignedRow[] }> = ({ rows }) => (
  <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-mauve-6 bg-mauve-3/50">
            <Th>PO</Th><Th>Line</Th><Th>Item</Th><Th>Description</Th>
            <Th numeric>Total</Th><Th numeric>Recv</Th><Th numeric>Open</Th>
            <Th>Promise</Th><Th>Created</Th><Th numeric>Unit $</Th>
            <Th>Buyer</Th><Th>Destination</Th><Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ wabtec: r }, idx) => (
            <tr key={`${r.poNumber}-${r.poLineNumber}-${idx}`} className="border-t border-mauve-4 hover:bg-mauve-3/60">
              <Td mono><PoLink poNumber={r.poNumber} /></Td>
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
              <Td className="max-w-[260px] truncate" title={formatShipTo(r.shipTo) || r.destinationOrg || ''}>
                {r.shipTo ? (
                  <div className="leading-tight">
                    <div className="text-mauve-12 truncate">{r.shipTo.address || '—'}</div>
                    <div className="text-[11px] text-mauve-11 truncate">
                      {[r.shipTo.city, r.shipTo.state].filter(Boolean).join(', ')}
                      {r.shipTo.zip ? ` ${r.shipTo.zip}` : ''}
                    </div>
                  </div>
                ) : r.destinationOrg ? (
                  <span className="text-mauve-11 italic">{r.destinationOrg}</span>
                ) : '—'}
              </Td>
              <Td><SCCStatusBadge action={r.action} /></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
)

const M2MTable: React.FC<{ rows: AlignedRow[] }> = ({ rows }) => (
  <div className="bg-white border border-mauve-6 rounded-lg overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-mauve-6 bg-mauve-3/50">
            <Th>Wabtec PO</Th><Th>MAC SO</Th><Th>Line</Th><Th>Item</Th>
            <Th>Description</Th><Th numeric>Order</Th><Th numeric>Shipped</Th>
            <Th numeric>Unit $</Th><Th>Promise</Th><Th>Ordered</Th>
            <Th>Ship to</Th><Th>State</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ wabtec: w, m2m: m }, idx) => {
            if (!m) {
              return (
                <tr key={`${w.poNumber}-${w.poLineNumber}-${idx}`} className="border-t border-mauve-4 bg-red-50/30">
                  <Td mono><PoLink poNumber={w.poNumber} /></Td>
                  <Td className="text-red-600 italic" colSpan={11}>Not found in M2M</Td>
                </tr>
              )
            }
            return (
              <tr key={`${m.wabtecPo}-${m.lineNo}-${idx}`} className="border-t border-mauve-4 hover:bg-mauve-3/60">
                <Td mono><PoLink poNumber={m.wabtecPo} /></Td>
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
                <Td><M2MStateBadge row={m} /></Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  </div>
)

const Th: React.FC<{ children: React.ReactNode; numeric?: boolean }> = ({ children, numeric }) => (
  <th className={`px-3 py-2.5 text-[11px] font-medium text-mauve-11 tracking-tight whitespace-nowrap ${numeric ? 'text-right' : 'text-left'}`}>
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
    className={`px-3 py-2 text-mauve-12 whitespace-nowrap ${mono ? 'font-mono text-[12px] text-mauve-12' : ''} ${numeric ? 'text-right tabular-nums' : ''} ${className || ''}`}
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
    <div className="flex items-center justify-between text-[12px] text-mauve-11">
      <div className="font-mono tabular-nums">{from}–{to} of {rows.toLocaleString()}</div>
      <div className="flex items-center gap-1">
        <PageBtn disabled={page <= 1} onClick={() => onChange(1)}>First</PageBtn>
        <PageBtn disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</PageBtn>
        <span className="px-2 font-mono tabular-nums">{page} / {totalPages}</span>
        <PageBtn disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</PageBtn>
        <PageBtn disabled={page >= totalPages} onClick={() => onChange(totalPages)}>Last</PageBtn>
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
    className="px-2.5 py-1 text-[12px] font-medium border border-mauve-6 rounded-md hover:bg-mauve-2 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
  >
    {children}
  </button>
)

const SideBySidePlaceholder: React.FC = () => (
  <div className="bg-white border border-mauve-6 rounded-lg p-12 text-center">
    <h3 className="text-[15px] font-semibold text-mauve-12 tracking-tight">Side-by-side diff</h3>
    <p className="text-[13px] text-mauve-11 mt-2 max-w-lg mx-auto">
      Coming next — render Wabtec and M2M side-by-side on the same row with mismatched fields highlighted inline.
      Currently the two separate tabs already stay row-aligned by PO + line.
    </p>
  </div>
)
