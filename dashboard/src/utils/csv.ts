export type CsvRow = Record<string, string>

// Minimal CSV parser — handles UTF-8 BOM, quoted fields with embedded commas/quotes,
// and CRLF line endings. Good enough for Wabtec SCC exports. Not a general-purpose parser.
export function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const c = text[i]

    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      field += c
      i++
      continue
    }

    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      field = ''
      row = []
      i++
      continue
    }

    field += c
    i++
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  if (rows.length === 0) return { headers: [], rows: [] }

  const headers = rows[0].map((h) => h.trim())
  const data = rows.slice(1).filter((r) => r.some((cell) => cell.length > 0))

  const parsed: CsvRow[] = data.map((cells) => {
    const obj: CsvRow = {}
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] ?? ''
    })
    return obj
  })

  return { headers, rows: parsed }
}
