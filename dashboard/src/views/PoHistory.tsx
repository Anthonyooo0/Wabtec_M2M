import React, { useEffect, useMemo, useState } from 'react'
import {
  loadPoHistory,
  type PoHistoryEntry,
  type PoHistoryRow,
} from '../services/poHistoryData'
import { PoLink } from '../components/PoLink'

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
    return entries.filter((e) => e.poNumber.toLowerCase().includes(q)).slice(0, 12)
  }, [entries, query])

  const activeEntry = useMemo(() => {
    if (!selected) return null
    return entries.find((e) => e.poNumber === selected) || null
  }, [entries, selected])

  const sortedRows: PoHistoryRow[] = useMemo(() => {
    if (!activeEntry) return []
    const parse = (v: string): number => {
      const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (!m) return 0
      const [, mm, dd, yyyy] = m
      const t = new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime()
      return Number.isFinite(t) ? t : 0
    }
    return [...activeEntry.rows].sort(
      (a, b) => parse(b['Updated time'] || '') - parse(a['Updated time'] || ''),
    )
  }, [activeEntry])

  return (
    <div className="space-y-4 view-transition">
      <div className="bg-white border border-zinc-200 rounded-lg p-4">
        <label className="block text-[11px] font-medium text-zinc-500 mb-2">Search PO number</label>
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. 174496878"
            className="w-full px-3 py-2 pr-20 text-[13px] rounded-md border border-zinc-200 bg-zinc-50 hover:bg-white focus:bg-white focus:border-zinc-400 focus:ring-0 outline-none font-mono transition-colors placeholder:text-zinc-400"
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setSelected(null) }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-zinc-500 hover:text-zinc-900 font-medium px-2 py-0.5 hover:bg-zinc-100 rounded"
            >
              Clear
            </button>
          )}
        </div>

        {query && matches.length > 0 && !selected && (
          <div className="mt-3 border border-zinc-200 rounded-md max-h-72 overflow-y-auto">
            {matches.map((e, i) => (
              <button
                key={e.poNumber}
                onClick={() => setSelected(e.poNumber)}
                className={`w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors flex items-center justify-between ${i > 0 ? 'border-t border-zinc-100' : ''}`}
              >
                <span className="font-mono text-[13px] text-zinc-900">{e.poNumber}</span>
                <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                  {e.historyRowCount} {e.historyRowCount === 1 ? 'revision' : 'revisions'}
                </span>
              </button>
            ))}
          </div>
        )}
        {query && matches.length === 0 && !loading && (
          <div className="mt-3 text-[12px] text-zinc-500">
            No PO found. {entries.length.toLocaleString()} POs indexed.
          </div>
        )}
      </div>

      {loading && (
        <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center">
          <div className="w-5 h-5 mx-auto border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin" />
          <p className="mt-3 text-[12px] text-zinc-500">Loading history</p>
        </div>
      )}

      {error && (
        <div className="bg-white border border-red-200 rounded-lg p-5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {activeEntry && (
        <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[11px] text-zinc-500">Selected PO</div>
              <div className="text-[16px] font-mono text-zinc-900 mt-0.5">
                <PoLink poNumber={activeEntry.poNumber} chip />
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                <span className="tabular-nums">{activeEntry.historyRowCount}</span>{' '}
                {activeEntry.historyRowCount === 1 ? 'revision' : 'revisions'}
                {' · scraped '}
                <span className="font-mono">{new Date(activeEntry.scrapedAt).toLocaleString()}</span>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100 rounded-md transition-colors"
            >
              Back to search
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/50">
                  {PRIMARY_COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      className={`px-3 py-2.5 text-[11px] font-medium text-zinc-500 tracking-tight whitespace-nowrap ${c.numeric ? 'text-right' : 'text-left'}`}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, idx) => (
                  <tr key={idx} className="border-t border-zinc-100 hover:bg-zinc-50/60">
                    {PRIMARY_COLUMNS.map((c) => (
                      <Cell key={c.key} value={row[c.key]} col={c} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!activeEntry && !query && !loading && (
        <div className="bg-white border border-zinc-200 rounded-lg p-12 text-center">
          <h3 className="text-[15px] font-semibold text-zinc-900 tracking-tight">
            Search a PO to see its history
          </h3>
          <p className="mt-2 text-[13px] text-zinc-500 max-w-lg mx-auto">
            Sourced from the Wabtec SCC "PO Details → History" tab. Shows every revision of a PO:
            who changed what, when, and whether it was a core (pricing/quantity) or non-core change.
          </p>
          <p className="mt-3 text-[11px] text-zinc-400 font-mono tabular-nums">
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
  let display: React.ReactNode = v || <span className="text-zinc-300">—</span>

  // Type Of Change pill — CORE = pricing/qty/ship (impacts M2M), NON-CORE = admin.
  if (col.key === 'Type Of Change' && v) {
    const kind = v.toUpperCase()
    const dot =
      kind === 'CORE' ? 'bg-red-500'
      : kind === 'INITIAL' ? 'bg-blue-500'
      : 'bg-zinc-400'
    display = (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-zinc-200 bg-white text-[10px] font-medium text-zinc-700">
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        {kind}
      </span>
    )
  }

  if (col.key === 'Change Type' && v) {
    display = <span className="text-zinc-900">{v}</span>
  }

  return (
    <td
      className={`px-3 py-2 text-zinc-700 whitespace-nowrap ${
        col.numeric ? 'text-right tabular-nums font-mono text-[12px]' : ''
      } ${col.key === 'Updated time' ? 'font-mono text-[12px]' : ''}`}
    >
      {display}
    </td>
  )
}
