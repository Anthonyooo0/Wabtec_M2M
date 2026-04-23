import type { WabtecPO } from './wabtecData'

// Matches the shape returned by azure-functions/wabtec-po-compare.
export interface M2MPO {
  wabtecPo: string
  macSo: string
  soStatus: string
  cancelledDate: string | null
  closedDate: string | null
  orderDate: string | null
  lineNo: string
  item: string
  itemDesc: string
  totalQty: number
  promiseDate: string | null
  needByDate: string | null
  lineStatus: string | null
  unitPrice: number
  releaseQty: number
  shippedQty: number
  shipToCompany: string
  shipToCity: string
  shipToState: string
  shipToZip: string
  isActive: boolean
}

interface M2MResponse {
  requestedPos: number
  count: number
  elapsedMs: number
  generatedAt: string
  rows: M2MPO[]
}

const API_BASE = (import.meta.env.VITE_M2M_API_BASE as string | undefined)?.replace(/\/$/, '')
const FUNCTION_KEY = import.meta.env.VITE_M2M_FUNCTION_KEY as string | undefined

// Targeted lookup: send the exact SCC PO list, get back only matching
// M2M rows. Way cheaper than scanning history, and guarantees we don't
// miss anything behind a row-limit cap.
export async function loadM2MPOs(wabtecPos: string[]): Promise<M2MPO[]> {
  if (!API_BASE) {
    throw new Error('VITE_M2M_API_BASE not set — copy .env.example to .env and fill in values.')
  }

  const unique = [...new Set(wabtecPos.map((p) => p.trim()).filter(Boolean))]
  if (unique.length === 0) return []

  const url = new URL(`${API_BASE}/wabtec-po-compare`)
  if (FUNCTION_KEY) url.searchParams.set('code', FUNCTION_KEY)

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wabtecPos: unique }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`M2M fetch failed: ${res.status} ${text}`)
  }

  const data = (await res.json()) as M2MResponse
  return data.rows || []
}

// Convert a MM-DD-YYYY string (from the Wabtec CSV) to an ISO date
// so we can compare M2M and SCC dates with === on ISO prefixes.
function mmddyyyyToIso(mmddyyyy: string): string | null {
  const m = mmddyyyy.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[1]}-${m[2]}`
}

export type DiscrepancyKind =
  | 'scc_cancelled_m2m_active'    // SCC says cancelled, M2M still active (critical)
  | 'scc_active_m2m_cancelled'    // inverse (we won't deliver what they expect)
  | 'scc_active_m2m_closed'       // M2M thinks done, SCC still expects
  | 'missing_in_m2m'              // SCC has it, M2M doesn't (>= PENDING_INTAKE_DAYS old)
  | 'pending_intake'              // SCC has it, M2M doesn't, but recent — sales rep just hasn't booked yet
  | 'ship_to_mismatch'             // SCC destination org doesn't match M2M ship-to address
  | 'qty_mismatch'
  | 'price_mismatch'

// Anything missing in M2M for fewer days than this is workflow lag, not a discrepancy.
export const PENDING_INTAKE_DAYS = 5

// True for everything *except* pending_intake (which is informational, not an issue).
export const isDiscrepancy = (kind: DiscrepancyKind): boolean => kind !== 'pending_intake'

// Days between SCC creation date (mm-dd-yyyy from the CSV) and today.
// Returns null if the date string can't be parsed.
export const daysSinceCreation = (mmddyyyy: string): number | null => {
  const m = mmddyyyy?.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  const created = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00`)
  if (Number.isNaN(created.getTime())) return null
  const diffMs = Date.now() - created.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

// Days between a given Date and today. Used for "unbooked days" based on
// the latest SCC acceptance date (from the History tab).
export const daysSince = (d: Date | null): number | null => {
  if (!d) return null
  const diffMs = Date.now() - d.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

// MM-DD-YYYY for display — matches the style the SCC CSV uses elsewhere.
export const fmtShortDate = (d: Date): string => {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}-${dd}-${d.getFullYear()}`
}

// Preferred benchmark for "unbooked" age: the PO's latest SCC acceptance
// date (from the scraped History). Falls back to creation date if there's
// no accepted event in history (e.g. brand-new PO not scraped yet, or a PO
// never accepted). Returns days + the source used so callers can label.
export const daysUnbooked = (
  poNumber: string,
  creationDate: string,
  acceptedDateByPo: Map<string, Date>,
): { days: number | null; source: 'accepted' | 'created'; date: Date | null } => {
  const accepted = acceptedDateByPo.get((poNumber || '').trim())
  if (accepted) return { days: daysSince(accepted), source: 'accepted', date: accepted }
  const m = (creationDate || '').match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return { days: null, source: 'created', date: null }
  const created = new Date(`${m[3]}-${m[1]}-${m[2]}T00:00:00`)
  if (Number.isNaN(created.getTime())) return { days: null, source: 'created', date: null }
  return { days: daysSince(created), source: 'created', date: created }
}

// Ship-to match — both sides now carry real addresses (scraped from the SCC
// detail page on the Wabtec side, SYADDR on the M2M side). Direct city+state
// comparison; zip is a tiebreaker for same-city/different-facility cases.
// Returns:
//   'match'   — city + state equal (case-insensitive)
//   'unknown' — missing data on either side
//   'mismatch' — both have data, city/state differ
export const shipToMatch = (
  sccShipTo: { city?: string; state?: string; zip?: string } | null,
  m2mCity: string,
  m2mState: string,
  m2mZip?: string,
): 'match' | 'unknown' | 'mismatch' => {
  const sccCity = (sccShipTo?.city || '').toLowerCase().trim()
  const sccState = (sccShipTo?.state || '').toLowerCase().trim()
  const sccZip = (sccShipTo?.zip || '').trim()
  const city = (m2mCity || '').toLowerCase().trim()
  const state = (m2mState || '').toLowerCase().trim()
  const zip = (m2mZip || '').trim()
  if (!sccCity && !sccState && !sccZip) return 'unknown'
  if (!city && !state && !zip) return 'unknown'
  // 5-digit zip equality is conclusive on its own.
  if (sccZip && zip && sccZip.slice(0, 5) === zip.slice(0, 5)) return 'match'
  if (sccCity && city && sccState && state) {
    return sccCity === city && sccState === state ? 'match' : 'mismatch'
  }
  // Partial data: fall back to whichever field is present on both sides.
  if (sccState && state && sccState !== state) return 'mismatch'
  if (sccCity && city && sccCity !== city) return 'mismatch'
  return 'unknown'
}

export interface Discrepancy {
  kind: DiscrepancyKind
  wabtecPo: string
  lineNo: string
  item: string
  summary: string
  wabtec: WabtecPO
  m2m: M2MPO | null
}

// Line normalization — M2M FENUMBER is Character(3) ("001") but SCC CSV
// uses plain integers ("1"). Parse both to a canonical int-as-string.
const makeKey = (po: string, line: string): string => {
  const n = parseInt(line || '0', 10)
  return `${(po || '').trim()}|${Number.isFinite(n) ? n : 0}`
}

// Primary comparison rule (per user):
// If SCC shows a PO as Cancelled but M2M still has it ACTIVE
// (FCANC_DT null AND FCLOS_DT null), flag as a critical discrepancy.
// Also surfaces the inverse and a few secondary checks.
//
// `acceptedDateByPo` — map from the scraped PO history giving each PO's
// latest "SCC Status → ACCEPTED" date. Used to age unbooked POs; the
// previous version used creationDate which over-counted POs that sat in
// NEW/REVISED for weeks before acceptance.
export function diff(
  wabtec: WabtecPO[],
  m2m: M2MPO[],
  acceptedDateByPo: Map<string, Date> = new Map(),
): Discrepancy[] {
  const byKey = new Map<string, M2MPO>()
  for (const row of m2m) {
    byKey.set(makeKey(row.wabtecPo, row.lineNo), row)
  }

  const discrepancies: Discrepancy[] = []

  for (const w of wabtec) {
    const m = byKey.get(makeKey(w.poNumber, w.poLineNumber)) || null

    const sccCancelled = /cancel/i.test(w.action)
    const sccActive = !sccCancelled && !/closed/i.test(w.action)

    if (!m) {
      // Only surface if SCC says the row is still meaningful (not a stale cancelled ghost).
      if (sccActive) {
        const { days, source, date } = daysUnbooked(w.poNumber, w.creationDate, acceptedDateByPo)
        const isRecent = days !== null && days < PENDING_INTAKE_DAYS
        const sourceLabel =
          source === 'accepted'
            ? `accepted ${date ? fmtShortDate(date) : ''}`.trim()
            : `created ${w.creationDate || ''}`.trim()
        discrepancies.push({
          kind: isRecent ? 'pending_intake' : 'missing_in_m2m',
          wabtecPo: w.poNumber,
          lineNo: w.poLineNumber,
          item: w.itemNumber,
          summary: isRecent
            ? `Accepted on SCC ${days} day${days === 1 ? '' : 's'} ago — give the sales rep a moment to book it.`
            : `SCC ${sourceLabel}, no matching line in M2M.`,
          wabtec: w,
          m2m: null,
        })
      }
      continue
    }

    if (sccCancelled && m.isActive) {
      discrepancies.push({
        kind: 'scc_cancelled_m2m_active',
        wabtecPo: w.poNumber,
        lineNo: w.poLineNumber,
        item: w.itemNumber,
        summary: 'SCC cancelled; M2M still active. Close or remove the M2M record.',
        wabtec: w,
        m2m: m,
      })
      continue
    }

    if (sccActive && m.cancelledDate) {
      discrepancies.push({
        kind: 'scc_active_m2m_cancelled',
        wabtecPo: w.poNumber,
        lineNo: w.poLineNumber,
        item: w.itemNumber,
        summary: 'Wabtec expects delivery; M2M shows cancelled. Reopen or re-quote.',
        wabtec: w,
        m2m: m,
      })
      continue
    }

    if (sccActive && m.closedDate) {
      discrepancies.push({
        kind: 'scc_active_m2m_closed',
        wabtecPo: w.poNumber,
        lineNo: w.poLineNumber,
        item: w.itemNumber,
        summary: 'M2M closed but SCC still shows it open.',
        wabtec: w,
        m2m: m,
      })
      continue
    }

    const shipMatch = shipToMatch(w.shipTo, m.shipToCity, m.shipToState, m.shipToZip)
    if (shipMatch === 'mismatch') {
      const sccLoc =
        [w.shipTo?.city, w.shipTo?.state].filter(Boolean).join(', ') ||
        w.destinationOrg ||
        '—'
      const m2mLoc =
        [m.shipToCity, m.shipToState].filter(Boolean).join(', ') || '—'
      discrepancies.push({
        kind: 'ship_to_mismatch',
        wabtecPo: w.poNumber,
        lineNo: w.poLineNumber,
        item: w.itemNumber,
        summary: `Ship-to mismatch — SCC "${sccLoc}" vs M2M "${m2mLoc}".`,
        wabtec: w,
        m2m: m,
      })
      continue
    }

    // Value-based checks (qty_mismatch, price_mismatch) are disabled for now
    // while we work out the right comparison rules. Types are kept in the
    // DiscrepancyKind union so re-enabling is a one-block change.
  }

  return discrepancies
}

// For quick access to the ISO conversion helper from the frontend (used by the
// diff logic when comparing Wabtec's mm-dd-yyyy strings to M2M's ISO timestamps).
export const _mmddyyyyToIso = mmddyyyyToIso
