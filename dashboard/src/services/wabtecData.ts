import { parseCsv, type CsvRow } from '../utils/csv'

export interface ShipAddress {
  address: string
  city: string
  state: string
  zip: string
  country: string
}

export interface WabtecPO {
  action: string
  vendorGslId: string
  availableToShipDate: string
  poNumber: string
  poReleaseNumber: string
  poLineNumber: string
  poShipmentNumber: string
  itemNumber: string
  itemDescription: string
  totalQuantity: number
  receivedQuantity: number
  openQuantity: number
  needByDate: string
  promiseDate: string
  destinationOrg: string
  shipTo: ShipAddress | null
  unitPrice: number
  totalPrice: number
  currencyCode: string
  buyerName: string
  creationDate: string
  raw: CsvRow
}

interface ScrapedPO {
  poNumber: string
  poLineNumber: string
  shipTo?: Partial<ShipAddress> | null
}

const parseNum = (v: string | undefined): number => {
  if (!v) return 0
  const n = Number(v.replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

const normLine = (v: string | undefined): string => {
  const n = parseInt(String(v ?? '').trim(), 10)
  return Number.isFinite(n) ? String(n) : ''
}

async function loadScrapedShipTo(): Promise<Map<string, ShipAddress>> {
  const map = new Map<string, ShipAddress>()
  try {
    const res = await fetch('/sample-data/wabtec-po-details.json')
    if (!res.ok) return map
    const data = (await res.json()) as ScrapedPO[]
    for (const row of data) {
      const po = String(row.poNumber || '').trim()
      const line = normLine(row.poLineNumber)
      if (!po || !row.shipTo) continue
      map.set(`${po}|${line}`, {
        address: row.shipTo.address || '',
        city: row.shipTo.city || '',
        state: row.shipTo.state || '',
        zip: row.shipTo.zip || '',
        country: row.shipTo.country || '',
      })
    }
  } catch {
    // Non-fatal: scraped data is an enrichment, not required.
  }
  return map
}

export async function loadWabtecPOs(): Promise<WabtecPO[]> {
  const [csvRes, shipToByKey] = await Promise.all([
    fetch('/sample-data/wabtec-scc-po.csv'),
    loadScrapedShipTo(),
  ])
  if (!csvRes.ok) throw new Error(`Failed to fetch Wabtec CSV: ${csvRes.status}`)
  const text = await csvRes.text()
  const { rows } = parseCsv(text)

  return rows.map((r) => {
    const poNumber = r['PO Number'] || ''
    const poLineNumber = r['PO Line Number'] || ''
    const key = `${poNumber.trim()}|${normLine(poLineNumber)}`
    // Fall back to PO-only match if line-level miss — scraper often only has
    // line 1 but the SCC export may have additional lines on the same PO.
    const shipTo =
      shipToByKey.get(key) || shipToByKey.get(`${poNumber.trim()}|1`) || null

    return {
      action: r['Action'] || '',
      vendorGslId: r['Vendor GSL ID'] || '',
      availableToShipDate: r['Available To Ship Date (mm/dd/yyyy)'] || '',
      poNumber,
      poReleaseNumber: r['PO Release Number'] || '',
      poLineNumber,
      poShipmentNumber: r['PO Shipment Number'] || '',
      itemNumber: r['Item Number'] || '',
      itemDescription: r['Item Description'] || '',
      totalQuantity: parseNum(r['Total Quantity']),
      receivedQuantity: parseNum(r['Received Quantity']),
      openQuantity: parseNum(r['Open Quantity']),
      needByDate: r['Need By Date (mm/dd/yyyy)'] || '',
      promiseDate: r['Promise Date (mm/dd/yyyy)'] || '',
      destinationOrg: r['Destination Org'] || '',
      shipTo,
      unitPrice: parseNum(r['Unit Price Amount']),
      totalPrice: parseNum(r['Total Price']),
      currencyCode: r['Currency Code'] || '',
      buyerName: r['Buyer Name'] || '',
      creationDate: r['Creation Date (mm/dd/yyyy)'] || '',
      raw: r,
    }
  })
}

export const formatShipTo = (s: ShipAddress | null): string => {
  if (!s) return ''
  const line1 = s.address?.trim() || ''
  const cityState = [s.city, s.state].filter(Boolean).join(', ')
  const tail = [cityState, s.zip].filter(Boolean).join(' ')
  return [line1, tail].filter(Boolean).join(', ')
}
