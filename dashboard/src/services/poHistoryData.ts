export interface PoHistoryColumn {
  colId: string
  header: string
}

export type PoHistoryRow = Record<string, string>

export interface PoHistoryEntry {
  poNumber: string
  rowIdx: number
  pageNum: number
  historyRowCount: number
  columns: PoHistoryColumn[]
  rows: PoHistoryRow[]
  scrapedAt: string
  error?: string
}

export async function loadPoHistory(): Promise<PoHistoryEntry[]> {
  const res = await fetch('/sample-data/po-history.json')
  if (!res.ok) throw new Error(`Failed to fetch PO history JSON: ${res.status}`)
  const data = (await res.json()) as PoHistoryEntry[]
  return data.filter((e) => e.poNumber)
}

export const findHistoryForPo = (
  entries: PoHistoryEntry[],
  poNumber: string,
): PoHistoryEntry | null => {
  const needle = (poNumber || '').trim()
  if (!needle) return null
  return entries.find((e) => e.poNumber.trim() === needle) || null
}

// Parse the "Updated time" column from the SCC History grid — it comes back
// as "MM-DD-YYYY". Returns null if unparseable.
const parseUpdatedTime = (s: string): Date | null => {
  const m = (s || '').match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  const d = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

// Find the LATEST date where the PO's SCC Status flipped to "ACCEPTED".
// A PO can be Accepted, Revised, then Accepted again — we want the most
// recent acceptance, since any revision between then and now means the old
// acceptance was superseded.
export const latestAcceptedDate = (entry: PoHistoryEntry | null): Date | null => {
  if (!entry) return null
  let best: Date | null = null
  for (const row of entry.rows) {
    const changeType = (row['Change Type'] || '').trim().toLowerCase()
    const after = (row['After'] || '').trim().toLowerCase()
    if (changeType !== 'scc status' || after !== 'accepted') continue
    const d = parseUpdatedTime(row['Updated time'] || '')
    if (d && (!best || d.getTime() > best.getTime())) best = d
  }
  return best
}

// Build an O(1) lookup: PO number → its latest accepted date. Run once on
// app load and pass around; re-running per row would be O(N*M).
export const buildAcceptedDateIndex = (
  entries: PoHistoryEntry[],
): Map<string, Date> => {
  const map = new Map<string, Date>()
  for (const e of entries) {
    const d = latestAcceptedDate(e)
    if (d) map.set(e.poNumber.trim(), d)
  }
  return map
}
