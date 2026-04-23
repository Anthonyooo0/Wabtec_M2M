import React, { useEffect, useMemo, useState } from 'react'
import {
  loadPoHistory,
  type PoHistoryEntry,
  type PoHistoryRow,
} from '../services/poHistoryData'
import { PoLink } from '../components/PoLink'

// Columns to surface prominently (in this order). We keep a stable, curated
// column order rather than echoing the scraper's raw column array — the raw
// list includes the empty-header checkbox column and a redundant PO Number.
const PRIMARY_COLUMNS: { key: string; label: string; numeric?: boolean }[] = [
  { key: 'Revision number', label: 'Rev', numeric: true },
  { key: 'Change Type', label: 'Change Type' },
  { key: 'Type Of Change', label: 'Type Of Change' },
  { key: 'Before', label: 'Before' },
  { key: 'After', label: 'After' },
  { key: 'Net Change', label: 'Net Change' },
  { key: 'Updated time', label: 'Updated' },
  { key: 'Updated by', label: 'By' },
  { key: 'PO Release Number', label: 'Rel' },
  { key: 'PO Line Number', label: 'Line' },
  { key: 'PO Shipment Number', label: 'Ship' },
  { key: 'PO Shipment Revision No', label: 'Ship Rev' },
  { key: 'Provided Lead Time', label: 'Lead Time' },
]

export const PoHistory: React.FC = () => {
  const [entries, setEntries] = useState<PoHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    loadPoHistory()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as PoHistoryEntry[]
    return entries
      .filter((e) => e.poNumber.toLowerCase().includes(q))
      .slice(0, 12)
  }, [entries, query])

  const activeEntry = useMemo(() => {
    if (!selected) return null
    return entries.find((e) => e.poNumber === selected) || null
  }, [entries, selected])

  // Sort history rows newest-first by Updated time if parseable. Falls back
  // to the scraper's original DOM order when the date can't be parsed.
  const sortedRows: PoHistoryRow[] = useMemo(() => {
    if (!activeEntry) return []
    const parse = (v: string): number => {
      const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (!m) return 0
      const [, mm, dd, yyyy] = m
      const t = new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime()
      return Number.isFinite(t) ? t : 0
    }
    return [...activeEntry.rows].sort((a, b) => parse(b['Updated time'] || '') - parse(a['Updated time'] || ''))
  }, [activeEntry])

  return (
    <div className="view-transition space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
          Search PO Number
        </label>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 174496878"
            className="w-full px-4 py-3 pr-28 text-sm rounded-xl border border-slate-300 focus:border-mac-accent focus:ring-2 focus:ring-mac-accent/20 outline-none font-mono"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setSelected(null)
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 font-medium"
            >
              Clear
            </button>
          )}
        </div>

        {query && matches.length > 0 && !selected && (
          <div className="mt-3 border border-slate-200 rounded-lg max-h-72 overflow-y-auto divide-y divide-slate-100">
            {matches.map((e) => (
              <button
                key={e.poNumber}
                onClick={() => setSelected(e.poNumber)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between"
              >
                <span className="font-mono text-sm font-medium text-slate-800">
                  {e.poNumber}
                </span>
                <span className="text-[10px] font-mono text-slate-500 uppercase">
                  {e.historyRowCount} {e.historyRowCount === 1 ? 'revision' : 'revisions'}
                </span>
              </button>
            ))}
          </div>
        )}
        {query && matches.length === 0 && !loading && (
          <div className="mt-3 text-xs text-slate-500">
            No PO found. {entries.length.toLocaleString()} POs indexed.
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center text-slate-400">
          Loading history…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-red-700 text-sm">
          {error}
        </div>
      )}

      {activeEntry && (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Selected PO
                </div>
                <div className="text-xl font-bold font-mono text-slate-800 mt-0.5">
                  <PoLink poNumber={activeEntry.poNumber} chip />
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {activeEntry.historyRowCount}{' '}
                  {activeEntry.historyRowCount === 1 ? 'revision' : 'revisions'} · scraped{' '}
                  {new Date(activeEntry.scrapedAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
              >
                Back to search
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-left">
                    {PRIMARY_COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={`px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap ${
                          c.numeric ? 'text-right' : ''
                        }`}
                      >
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      {PRIMARY_COLUMNS.map((c) => (
                        <Cell key={c.key} value={row[c.key]} col={c} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!activeEntry && !query && !loading && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-10 text-center">
          <h3 className="font-bold text-slate-700 text-lg">Search a PO to see its history</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-lg mx-auto">
            History is sourced from the Wabtec SCC "PO Details → History" tab
            (scraped via Playwright). Shows every revision of a PO: who changed
            what, when, and whether it was a core (pricing/quantity) or non-core
            change.
          </p>
          <p className="mt-3 text-xs text-slate-400 font-mono">
            {entries.length.toLocaleString()} POs indexed
          </p>
        </div>
      )}

    </div>
  )
}

const Cell: React.FC<{
  value: string | undefined
  col: { key: string; numeric?: boolean }
}> = ({ value, col }) => {
  const v = value || ''
  let display: React.ReactNode = v || <span className="text-slate-300">—</span>

  // Color-code Type Of Change (CORE / NON-CORE / INITIAL) so a buyer can
  // scan the column at a glance — CORE = pricing/qty/ship changes that
  // affect M2M, NON-CORE = admin.
  if (col.key === 'Type Of Change' && v) {
    const kind = v.toUpperCase()
    let cls = 'bg-slate-100 text-slate-600 border-slate-200'
    if (kind === 'CORE') cls = 'bg-red-50 text-red-600 border-red-200'
    else if (kind === 'INITIAL') cls = 'bg-blue-50 text-blue-600 border-blue-200'
    else if (kind === 'NON-CORE') cls = 'bg-slate-100 text-slate-500 border-slate-200'
    display = (
      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${cls}`}>
        {kind}
      </span>
    )
  }

  if (col.key === 'Change Type' && v) {
    display = <span className="font-medium text-slate-800">{v}</span>
  }

  return (
    <td
      className={`px-4 py-2.5 text-slate-700 whitespace-nowrap ${
        col.numeric ? 'text-right tabular-nums font-mono text-xs' : ''
      } ${col.key === 'Updated time' ? 'font-mono text-xs' : ''}`}
    >
      {display}
    </td>
  )
}
