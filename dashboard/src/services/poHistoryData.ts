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
