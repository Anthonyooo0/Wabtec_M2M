// Orphan-PO lookup scraper.
//
// The bulk PO Collaboration export (login.ts) catches ~37% of M2M Wabtec POs.
// The remaining ~63% are "orphans" surfaced by the M2M Orphans tab — they DO
// exist in SCC but don't appear in the bulk grid because the default view has
// a 1000-row cap that filters older / archived / less-active POs out.
//
// This scraper uses the SCC Search filter to look up each orphan by PO number,
// then for each result captures the SAME data the existing two scrapers
// produce: PO Details (shipping, buyer, FOB, terms) AND PO History (revisions
// with Core Changes toggled off).
//
// Per-PO flow (reuses proven blocks from the existing scrapers):
//   1. Clear the "Enter numbers" filter input + type the orphan PO + Submit
//   2. Wait for grid summary to update
//   3. For each filtered row → open PO Details modal → extract details (re-
//      uses extractDetails() pattern from scrape-po-details.ts)
//   4. From the first filtered row → switch to History tab → toggle Core
//      Changes off → scrape history grid (re-uses inspect-po-details.ts)
//   5. Close modal, move to next orphan
//
// Output: JSON at downloads/orphan-lookup-<ts>.json with one entry per
// orphan, each containing { po, found, details[], history }.

import { chromium, Browser, Page } from 'playwright'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config()

const {
  WABTEC_USERNAME,
  WABTEC_PASSWORD,
  WABTEC_LOGIN_URL,
  HEADLESS,
} = process.env

if (!WABTEC_USERNAME || !WABTEC_PASSWORD || !WABTEC_LOGIN_URL) {
  console.error('Missing required env vars. Copy .env.example to .env and fill in values.')
  process.exit(1)
}

const headless = HEADLESS !== 'false'
const screenshotDir = path.resolve(process.cwd(), 'screenshots')
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })

const downloadDir = path.resolve(process.cwd(), 'downloads')
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(screenshotDir, `orphan-${Date.now()}-${name}.png`), fullPage: true })

// =============================================================================
// Pacing — small delays between actions to avoid hammering the SCC UI.
// =============================================================================
const PER_ORPHAN_DELAY_MS = 300
const PER_ROW_DELAY_MS = 200

// =============================================================================
// Orphan list source — three options, tried in order:
//   1. ORPHANS_INPUT_PATH env var → read JSON file with [{po}, ...] shape
//   2. M2M_ORPHANS_URL env var → POST SCC PO list, get orphan list back
//   3. Fallback canary POs (3 known orphans for smoke-testing)
//
// ORPHAN_LIMIT env var caps how many to process. Default is 50 to keep the
// first batch finishable in a single session (~5-7hr). Set to 0 for unlimited.
// =============================================================================
const CANARY_ORPHANS = [
  '210414649',  // SO 169422 — Bus Ring TB
  '210442837',  // SO 174893 — WTS, due 7/17/2026
  '210442836',  // SO 174894 — WTS, due 6/23/2026
]

// 0 = unlimited (process every orphan returned). Set ORPHAN_LIMIT=N to cap.
const ORPHAN_LIMIT = parseInt(process.env.ORPHAN_LIMIT || '0', 10)

// Resume control — RESUME_FROM points at a prior partial JSON. Its already-
// completed POs are skipped on the next run. The PO it crashed on (which
// never made it into the partial save) is naturally retried first.
const RESUME_FROM = process.env.RESUME_FROM || ''

async function getOrphanPos(): Promise<string[]> {
  // Path 1 — explicit JSON file
  const inputPath = process.env.ORPHANS_INPUT_PATH
  if (inputPath && fs.existsSync(inputPath)) {
    const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
    const pos = (Array.isArray(raw) ? raw : raw.orphans || []).map((x: any) =>
      typeof x === 'string' ? x : x.wabtecPo || x.po,
    ).filter(Boolean)
    console.log(`Loaded ${pos.length} orphans from ${inputPath}`)
    return pos
  }

  // Path 2 — fetch from the wabtec-m2m-orphans Azure Function
  const orphansUrl = process.env.M2M_ORPHANS_URL
  if (orphansUrl) {
    // Read the SCC PO list from the dashboard's sample-data CSV — these are
    // the POs the bulk export already caught. Anything in M2M but not in
    // this list is an orphan.
    const csvPath = path.resolve(process.cwd(), '..', 'dashboard', 'public', 'sample-data', 'wabtec-scc-po.csv')
    if (!fs.existsSync(csvPath)) throw new Error(`SCC CSV not found at ${csvPath}`)
    const csv = fs.readFileSync(csvPath, 'utf8')
    const lines = csv.split(/\r?\n/).filter((l) => l.length > 0)
    const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
    const poIdx = headers.findIndex((h) => /po\s*number/i.test(h))
    if (poIdx < 0) throw new Error('Could not find PO Number column in SCC CSV')
    const sccPos = lines
      .slice(1)
      .map((l) => l.split(',')[poIdx]?.trim().replace(/^"|"$/g, ''))
      .filter(Boolean) as string[]

    console.log(`Loaded ${sccPos.length} SCC POs from CSV; fetching orphans...`)
    const res = await fetch(orphansUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knownSccPos: sccPos }),
    })
    if (!res.ok) throw new Error(`Orphans API ${res.status}: ${await res.text()}`)
    const data: any = await res.json()
    const pos = (data.orphans || []).map((o: any) => o.wabtecPo).filter(Boolean)
    console.log(`Fetched ${pos.length} orphan POs from API`)
    return pos
  }

  // Path 3 — fallback to canaries
  console.log('M2M_ORPHANS_URL / ORPHANS_INPUT_PATH not set; using 3 canary POs')
  return CANARY_ORPHANS
}

// =============================================================================
// Result types — same shape as the other two scrapers' output JSON, so the
// dashboard can consume the orphan-lookup data with minimal code change.
// =============================================================================
interface PODetails {
  poNumber: string
  poLineNumber: string | null
  itemNumber: string | null
  shipTo: { address: string | null; city: string | null; state: string | null; zip: string | null; country: string | null }
  shipFrom: { name: string | null; address1: string | null; address2: string | null; city: string | null; state: string | null; zip: string | null; country: string | null }
  buyer: { name: string | null; email: string | null }
  sendVia: string | null
  fob: string | null
  shippingTerms: string | null
  shippingInstruction: string | null
  raw: Record<string, string>
  scrapedAt: string
}

interface PoHistoryEntry {
  poNumber: string
  historyRowCount: number
  columns: { colId: string; header: string }[]
  rows: Record<string, string>[]
  scrapedAt: string
  error?: string
}

// One filtered grid row = one PO line/release/shipment combination.
// Each line gets its own modal session: details + history both captured.
interface OrphanLineResult {
  rowIdx: number
  details: PODetails
  history: PoHistoryEntry
}

interface OrphanLookupResult {
  po: string
  found: boolean
  matchedRowCount: number
  lines: OrphanLineResult[]
  error?: string
  scrapedAt: string
}

// =============================================================================
// Steps 1a–3b — VERBATIM copy of login.ts. Don't touch without retesting.
// =============================================================================
async function loginAndOpenPoCollaboration(): Promise<{ browser: Browser; page: Page }> {
  console.log(`Launching browser (headless=${headless})...`)
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  console.log('Step 1a: navigating to Okta login...')
  await page.goto(WABTEC_LOGIN_URL!, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await shot(page, '01-login-page')

  console.log('Step 1b: filling username...')
  const usernameInput = page.locator('input[name="identifier"], input[name="username"], input[type="text"]').first()
  await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
  await usernameInput.fill(WABTEC_USERNAME!)

  console.log('Step 1c: clicking Next...')
  const nextBtn = page.locator('input[type="submit"], button:has-text("Next")').first()
  await nextBtn.click()

  console.log('Step 1d: waiting for password page...')
  await page.waitForLoadState('networkidle', { timeout: 15000 })
  await page.waitForTimeout(1000)

  console.log('Step 2a: filling password...')
  const passwordInput = page.locator('input[name="credentials.passcode"]').first()
  await passwordInput.waitFor({ state: 'visible', timeout: 15000 })
  await passwordInput.fill(WABTEC_PASSWORD!)

  console.log('Step 2b: clicking Verify...')
  const verifyBtn = page.locator('input[type="submit"], button:has-text("Verify")').first()
  await verifyBtn.click()

  console.log('Step 2c: waiting for redirect to scc.wabtec.com...')
  await page.waitForURL(/scc\.wabtec\.com/, { timeout: 20000 })

  console.log('Step 2d: waiting for SCC Dashboard to fully render (up to 20s)...')
  await page.waitForSelector('text=SCC Dashboard', { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)

  console.log('Step 3a: clicking PO Collaboration...')
  const poLink = page.getByText('PO Collaboration', { exact: true }).first()
  await poLink.waitFor({ state: 'attached', timeout: 10000 })
  await poLink.click({ force: true })

  console.log('Step 3b: waiting for PO Collaboration page to render (up to 20s)...')
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, '06-po-collaboration')

  return { browser, page }
}

// =============================================================================
// Step 4 — open the Select Filters dropdown.
// =============================================================================
async function openSelectFilters(page: Page): Promise<void> {
  console.log('\nStep 4: opening Select Filters dropdown...')
  const selectFiltersDropdown = page
    .locator('mat-form-field:has(mat-label:has-text("Select Filters")) mat-select')
    .first()
  await selectFiltersDropdown.waitFor({ state: 'visible', timeout: 15000 })
  await selectFiltersDropdown.click()
  await page.waitForTimeout(1000)
}

// =============================================================================
// Step 5 — enable the PO Number filter, then close the dropdown.
// =============================================================================
async function enablePoNumberFilter(page: Page): Promise<void> {
  console.log('Step 5: enabling PO Number filter...')
  const dropdownSearch = page.locator('input[placeholder="Search..."]:visible').first()
  await dropdownSearch.fill('PO Number')
  await page.waitForTimeout(400)

  const poNumberOption = page
    .locator('mat-option:has-text("PO Number")')
    .filter({ hasText: /^\s*PO Number\s*$/ })
    .first()
  const target = (await poNumberOption.count()) > 0
    ? poNumberOption
    : page.locator('mat-option:has-text("PO Number")').first()

  await target.waitFor({ state: 'visible', timeout: 5000 })
  await target.click()
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)
}

// =============================================================================
// Step 6 — type a PO into the filter input, click Submit, wait for the grid
// to rebuild. We then count actual rendered .ag-row elements rather than
// parsing the "X Of Y Records" summary text — that summary stays stale until
// well after the filter applies and was the source of a bad row count in
// the previous run (parsed as 1000 instead of 3).
// =============================================================================
async function filterByPo(page: Page, poNumber: string): Promise<void> {
  const poInput = page.locator('input[placeholder="Enter numbers"]').first()
  await poInput.waitFor({ state: 'visible', timeout: 5000 })
  await poInput.fill('')
  await poInput.fill(poNumber)
  await page.waitForTimeout(250)

  const submitBtn = page.getByRole('button', { name: /^submit$/i }).first()
  await submitBtn.click()
  await page.waitForTimeout(2500) // grid rebuild + virtualization settle
}

// Count actual rendered rows after the filter applies. Polls until the count
// is stable for two consecutive samples, then returns it. Capped at 30s.
async function getFilteredRowCount(page: Page): Promise<number> {
  let last = -1
  let stableHits = 0
  const start = Date.now()
  while (Date.now() - start < 30000) {
    const cur = await page.evaluate(() =>
      document.querySelectorAll('.ag-center-cols-container .ag-row').length,
    )
    if (cur === last) {
      stableHits++
      if (stableHits >= 2) return cur
    } else {
      stableHits = 0
      last = cur
    }
    await page.waitForTimeout(500)
  }
  return last
}

// =============================================================================
// resolvePoNumberColId — VERBATIM from scrape-po-details.ts.
// ag-Grid assigns col-id values that aren't human-readable (e.g. "1", "5e1").
// We resolve the PO Number column dynamically so cell-level selectors work.
// =============================================================================
async function resolvePoNumberColId(page: Page): Promise<string> {
  const colId = await page.evaluate(() => {
    const cells = document.querySelectorAll('.ag-header-cell')
    for (const el of Array.from(cells)) {
      if ((el.textContent || '').trim().startsWith('PO Number')) {
        return el.getAttribute('col-id')
      }
    }
    return null
  })
  if (!colId) throw new Error('Could not find col-id for PO Number header')
  return colId
}

// =============================================================================
// extractDetails — VERBATIM from scrape-po-details.ts. Reads every label/input
// pair inside the PO Details modal.
// =============================================================================
async function extractDetails(page: Page, poNumber: string): Promise<PODetails> {
  const raw = await page.evaluate(() => {
    const result: Record<string, string> = {}
    const modal =
      document.querySelector('mat-dialog-container') ||
      document.querySelector('[role="dialog"]') ||
      document.body
    const labels = modal.querySelectorAll('label, .mat-form-field-label, .form-label, span')
    labels.forEach((label) => {
      const text = (label.textContent || '').trim()
      if (!text || text.length > 50) return
      let input: HTMLInputElement | null = null
      const container = label.closest('mat-form-field, .form-group, .field, .form-field, div')
      if (container) input = container.querySelector('input, textarea') as HTMLInputElement | null
      if (!input) {
        const next = label.nextElementSibling
        if (next) input = next.querySelector('input, textarea') as HTMLInputElement | null
      }
      if (input && input.value && !result[text]) result[text] = input.value.trim()
    })
    return result
  })

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) if (raw[k] && raw[k].trim()) return raw[k].trim()
    return null
  }

  return {
    poNumber,
    poLineNumber: pick('PO Line Number'),
    itemNumber: pick('Item Number'),
    shipTo: {
      address: pick('Ship To Address'),
      city: pick('Ship To City'),
      state: pick('Ship To State'),
      zip: pick('Send to zip code', 'Ship To Zip', 'Ship To Zip Code'),
      country: pick('Ship To Country'),
    },
    shipFrom: {
      name: pick('Vendor Name'),
      address1: pick('Ship From Address'),
      address2: null,
      city: pick('Ship From City'),
      state: pick('State Ship', 'Ship From State'),
      zip: pick('Send from zip code'),
      country: pick('Ship from country'),
    },
    buyer: {
      name: pick('Buyer Name'),
      email: pick("Buyer's email", 'Buyer Email'),
    },
    sendVia: pick('Send Via'),
    fob: pick('FOB'),
    shippingTerms: pick('Shipping terms'),
    shippingInstruction: pick('Shipping Instruction'),
    raw,
    scrapedAt: new Date().toISOString(),
  }
}

// =============================================================================
// scrapeOneRowDetails — opens the modal for filtered-grid row N, extracts
// details, closes the modal. Same pattern as scrape-po-details.ts but operates
// on the filtered grid where row indexes start at 0.
// =============================================================================
// (Previously had two single-purpose functions scrapeOneRowDetails +
// scrapeOneRowHistory that opened the modal twice per row. Combined into
// scrapeOneRowFull below — one modal session per row, both Details + History
// captured before closing.)

// =============================================================================
// scrapeHistoryGrid — VERBATIM from inspect-po-details.ts. Finds the grid by
// header-signature (Revision number / Before / After) and scrolls horizontally
// to pick up virtualized columns.
// =============================================================================
async function scrapeHistoryGrid(page: Page): Promise<{
  columns: { colId: string; header: string }[]
  rows: Record<string, string>[]
}> {
  const viewportHandle = await page.evaluateHandle(() => {
    const HISTORY_SIGNATURE = ['revision number', 'before', 'after']
    const grids = Array.from(document.querySelectorAll('.ag-root-wrapper, .ag-root')) as HTMLElement[]
    let historyGrid: HTMLElement | null = null
    for (const g of grids) {
      const headers = Array.from(g.querySelectorAll('.ag-header-cell')).map((h) =>
        (h.textContent || '').trim().toLowerCase(),
      )
      const hits = HISTORY_SIGNATURE.filter((sig) => headers.some((h) => h.includes(sig))).length
      if (hits >= 2) { historyGrid = g; break }
    }
    if (!historyGrid) return null
    return historyGrid.querySelector(
      '.ag-body-horizontal-scroll-viewport, .ag-center-cols-viewport',
    ) as HTMLElement | null
  })

  const snapshot = async () =>
    page.evaluate((vp) => {
      const vpEl = vp as HTMLElement | null
      const grid: ParentNode =
        (vpEl && (vpEl.closest('.ag-root-wrapper') || vpEl.closest('.ag-root'))) || document
      const headers: Record<string, string> = {}
      grid.querySelectorAll('.ag-header-cell').forEach((h) => {
        const colId = h.getAttribute('col-id') || ''
        const label = (h.textContent || '').trim()
        if (colId) headers[colId] = label
      })
      const rowMap: Record<string, Record<string, string>> = {}
      grid.querySelectorAll('.ag-row').forEach((r) => {
        const idx = r.getAttribute('row-index') || ''
        if (!idx) return
        const rowCells: Record<string, string> = rowMap[idx] || {}
        r.querySelectorAll('.ag-cell').forEach((c) => {
          const colId = c.getAttribute('col-id') || ''
          if (!colId) return
          rowCells[colId] = (c.textContent || '').trim()
        })
        rowMap[idx] = rowCells
      })
      return { headers, rowMap }
    }, viewportHandle)

  const merged: Record<string, Record<string, string>> = {}
  const allHeaders: Record<string, string> = {}

  let cur = await snapshot()
  Object.assign(allHeaders, cur.headers)
  for (const [idx, cells] of Object.entries(cur.rowMap)) {
    merged[idx] = Object.assign({}, merged[idx] || {}, cells)
  }

  const scrollInfo = await page.evaluate((vp) => {
    const el = vp as HTMLElement | null
    if (!el) return { scrollWidth: 0, clientWidth: 0 }
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  }, viewportHandle)
  const step = Math.max(200, Math.floor(scrollInfo.clientWidth * 0.8))
  const maxScroll = Math.max(0, scrollInfo.scrollWidth - scrollInfo.clientWidth)

  for (let x = 0; x <= maxScroll + step; x += step) {
    const target = Math.min(x, maxScroll)
    await page.evaluate((args) => {
      const el = args.vp as HTMLElement | null
      if (el) el.scrollLeft = args.target
    }, { vp: viewportHandle, target })
    await page.waitForTimeout(350)
    cur = await snapshot()
    Object.assign(allHeaders, cur.headers)
    for (const [idx, cells] of Object.entries(cur.rowMap)) {
      merged[idx] = Object.assign({}, merged[idx] || {}, cells)
    }
    if (target === maxScroll) break
  }

  await page.evaluate((vp) => {
    const el = vp as HTMLElement | null
    if (el) el.scrollLeft = 0
  }, viewportHandle)

  const colIds = Object.keys(allHeaders)
  const columns = colIds.map((id) => ({ colId: id, header: allHeaders[id] }))
  const rowIdxs = Object.keys(merged).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  const rows = rowIdxs.map((idx) => {
    const cells = merged[String(idx)] || {}
    const out: Record<string, string> = {}
    for (const id of colIds) out[allHeaders[id] || id] = cells[id] || ''
    return out
  })
  return { columns, rows }
}

// Close the PO Details modal AND nuke any lingering cdk-overlay-backdrop.
// The mat-dialog-container removes itself on close, but the backdrop element
// can persist and block pointer events on the grid below — that's what made
// row 1 unreachable after row 0 finished. We aggressively remove orphan
// backdrops as part of close.
async function closeModal(page: Page): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const closeBtn = page
      .locator('mat-dialog-container, [role="dialog"]')
      .locator('button:has-text("×"), [aria-label="Close"]')
      .first()

    const btnCount = await closeBtn.count()
    if (btnCount > 0) {
      await closeBtn.click({ force: true }).catch(() => {})
    } else {
      await page.keyboard.press('Escape').catch(() => {})
    }

    await page.waitForTimeout(400)

    // Check both: dialog gone AND no orphan backdrop. The backdrop is what
    // intercepts pointer events on the grid, so we have to clean it up too.
    const state = await page.evaluate(() => {
      const dialog = document.querySelectorAll('mat-dialog-container, [role="dialog"]').length
      const backdrops = document.querySelectorAll(
        '.cdk-overlay-backdrop:not(.cdk-overlay-transparent-backdrop)',
      )
      // If the dialog is gone but a backdrop persists, force-remove it.
      let removed = 0
      if (dialog === 0) {
        backdrops.forEach((b) => { b.remove(); removed++ })
      }
      const overlayPanes = document.querySelectorAll('.cdk-overlay-pane:empty')
      overlayPanes.forEach((p) => p.remove())
      return { dialog, backdrops: backdrops.length - removed }
    })

    if (state.dialog === 0 && state.backdrops === 0) return

    if (attempt === 2) {
      await page.mouse.click(10, 10).catch(() => {})
      await page.waitForTimeout(300)
    }
  }
  console.log('    [closeModal] WARNING: modal/backdrop still up after 4 attempts')
}

// Confirm the grid is actually interactive before clicking the next row.
// Reads the filter input visibility — that input lives in the toolbar above
// the grid and is only hittable when no overlay is intercepting pointer
// events. Cheap (200ms typical) and catches any sticky-overlay state.
async function ensureGridInteractive(page: Page): Promise<void> {
  // Belt-and-suspenders: explicit Escape + remove any orphan backdrop one
  // more time before the next row's click.
  await page.keyboard.press('Escape').catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('mat-dialog-container, [role="dialog"]').length === 0 &&
      document.querySelectorAll('.cdk-overlay-backdrop:not(.cdk-overlay-transparent-backdrop)').forEach((b) => b.remove())
  }).catch(() => {})

  const filterInput = page.locator('input[placeholder="Enter numbers"]').first()
  await filterInput.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
}

// =============================================================================
// scrapeOneRowFull — open modal, extract details, switch to History, toggle
// Core Changes off, scrape history grid, close modal. ONE modal session per
// row — no exiting and re-opening between Details and History.
// =============================================================================
async function scrapeOneRowFull(
  page: Page,
  rowIdx: number,
  colId: string,
  poNumber: string,
): Promise<{ details: PODetails; history: PoHistoryEntry }> {
  // ---- Open the modal for this row -----------------------------------------
  const cell = page
    .locator(`.ag-center-cols-container .ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`)
    .first()
  await cell.waitFor({ state: 'visible', timeout: 10000 })

  const link = cell.locator('a, span[class*="link" i], [role="link"]').first()
  if ((await link.count()) > 0) await link.click()
  else await cell.click()

  await page.waitForTimeout(800)
  await page.waitForSelector('text=PO Details', { timeout: 15000 })
  await page.waitForTimeout(1500)

  // ---- Step A: Details ------------------------------------------------------
  // Switch to Shipping Details sub-tab if it isn't already active.
  const shippingTab = page.getByText(/^\s*Shipping Details\s*$/i).first()
  if ((await shippingTab.count()) > 0) {
    await shippingTab.click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)
  }

  // Wait for hydration — at least one input has a value.
  await page
    .waitForFunction(
      () => {
        const dialog =
          document.querySelector('mat-dialog-container') ||
          document.querySelector('[role="dialog"]') ||
          document.body
        return Array.from(dialog.querySelectorAll('input')).some(
          (i) => (i as HTMLInputElement).value && (i as HTMLInputElement).value.trim().length > 0,
        )
      },
      { timeout: 10000 },
    )
    .catch(() => {})

  const details = await extractDetails(page, poNumber)

  // ---- Step B: switch to History tab inside the SAME modal ------------------
  // Let Details finish rendering — switching too fast keeps the modal stuck
  // on Details (per inspect-po-details.ts comment).
  await page.waitForTimeout(2000)

  const historyTab = page
    .locator('mat-dialog-container, [role="dialog"]')
    .getByText(/^\s*History\s*$/i)
    .first()
  await historyTab.waitFor({ state: 'visible', timeout: 10000 })
  await historyTab.click({ force: true })
  await page.waitForTimeout(2000)

  // ---- Step C: toggle Core Changes off --------------------------------------
  // Find the toggle nearest preceding the "Core Changes" text node — the
  // label sits immediately after its own toggle. VERBATIM from inspect-po-details.ts.
  await page
    .waitForFunction(
      () => {
        const toggles = Array.from(
          document.querySelectorAll(
            'mat-slide-toggle, mat-mdc-slide-toggle, .mat-slide-toggle, .mat-mdc-slide-toggle',
          ),
        ) as HTMLElement[]
        if (toggles.length === 0) return null
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        let textNode: Text | null = null
        while (walker.nextNode()) {
          const tn = walker.currentNode as Text
          if ((tn.textContent || '').trim().toLowerCase() === 'core changes') {
            textNode = tn
            break
          }
        }
        if (!textNode) return null
        let best: HTMLElement | null = null
        let bestIdx = -1
        for (let i = 0; i < toggles.length; i++) {
          const pos = toggles[i].compareDocumentPosition(textNode)
          if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && i > bestIdx) {
            best = toggles[i]
            bestIdx = i
          }
        }
        if (!best) return null
        const inner = (best.querySelector('button[role="switch"], [role="switch"], input[type="checkbox"]') ||
          best) as HTMLElement
        inner.click()
        return true
      },
      { timeout: 20000, polling: 500 },
    )
    .catch(() => null)

  await page.waitForTimeout(2000)

  // ---- Step D: scrape history grid ------------------------------------------
  const grid = await scrapeHistoryGrid(page)
  const history: PoHistoryEntry = {
    poNumber,
    historyRowCount: grid.rows.length,
    columns: grid.columns,
    rows: grid.rows,
    scrapedAt: new Date().toISOString(),
  }

  // ---- Close modal — only AFTER both Details + History are captured --------
  await closeModal(page)
  return { details, history }
}

// =============================================================================
// lookupAndScrapeOrphan — full per-orphan flow:
//   1. Filter by PO number
//   2. Count rendered rows
//   3. For each row, open modal once and capture both details + history
//   4. Move to next row, then next PO
// =============================================================================
async function lookupAndScrapeOrphan(
  page: Page,
  po: string,
  colId: string,
): Promise<OrphanLookupResult> {
  const started = Date.now()
  console.log(`\n>>> Looking up orphan PO ${po}...`)

  try {
    await filterByPo(page, po)
    const matchedCount = await getFilteredRowCount(page)
    console.log(`    Filter returned ${matchedCount} row(s)`)

    if (matchedCount === 0) {
      return {
        po,
        found: false,
        matchedRowCount: 0,
        lines: [],
        scrapedAt: new Date().toISOString(),
      }
    }

    // Per-row: ONE modal session capturing details + history together.
    const lines: OrphanLineResult[] = []
    for (let rowIdx = 0; rowIdx < matchedCount; rowIdx++) {
      // Defensive cleanup before each row click — verifies no orphan backdrop
      // is still intercepting pointer events from a previous modal close.
      if (rowIdx > 0) await ensureGridInteractive(page)

      try {
        const result = await scrapeOneRowFull(page, rowIdx, colId, po)
        lines.push({ rowIdx, ...result })
        const ship = [result.details.shipTo.city, result.details.shipTo.state].filter(Boolean).join(', ') || '—'
        console.log(
          `    Row ${rowIdx + 1}/${matchedCount} — item=${result.details.itemNumber || '—'} ship=${ship} · ` +
            `history=${result.history.historyRowCount} rows`,
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`    Row ${rowIdx + 1}/${matchedCount} FAILED: ${msg}`)
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(400)
      }
      await page.waitForTimeout(PER_ROW_DELAY_MS)
    }

    console.log(`    Done in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    return {
      po,
      found: lines.length > 0,
      matchedRowCount: matchedCount,
      lines,
      scrapedAt: new Date().toISOString(),
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`>>> Orphan ${po} FAILED: ${msg}`)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(800)
    return {
      po,
      found: false,
      matchedRowCount: 0,
      lines: [],
      error: msg,
      scrapedAt: new Date().toISOString(),
    }
  }
}

// =============================================================================
// Main loop
// =============================================================================
;(async () => {
  const orphans = await getOrphanPos()
  const subset = ORPHAN_LIMIT > 0 ? orphans.slice(0, ORPHAN_LIMIT) : orphans

  console.log(`Will look up ${subset.length} orphan PO(s)${ORPHAN_LIMIT > 0 ? ` (capped at ORPHAN_LIMIT=${ORPHAN_LIMIT})` : ''}`)
  if (subset.length <= 10) console.log(`  POs: ${subset.join(', ')}`)
  else console.log(`  First 5: ${subset.slice(0, 5).join(', ')}... (+${subset.length - 5} more)`)

  // Preload prior partial run if RESUME_FROM points at one — its completed
  // POs are skipped, the crashed PO (not yet saved) gets retried first.
  let preloaded: OrphanLookupResult[] = []
  if (RESUME_FROM) {
    try {
      const resumePath = path.isAbsolute(RESUME_FROM)
        ? RESUME_FROM
        : path.resolve(downloadDir, RESUME_FROM)
      preloaded = JSON.parse(fs.readFileSync(resumePath, 'utf-8'))
      console.log(`Preloaded ${preloaded.length} orphan results from ${path.basename(resumePath)}`)
    } catch (e) {
      console.warn(`RESUME_FROM "${RESUME_FROM}" failed to load:`, e)
    }
  }
  const completedPos = new Set(preloaded.map((r) => r.po))
  const remaining = subset.filter((po) => !completedPos.has(po))
  if (preloaded.length > 0) {
    console.log(`  Skipping ${completedPos.size} already-done POs; ${remaining.length} remaining.`)
  }

  const { browser, page } = await loginAndOpenPoCollaboration()
  const outPath = path.join(downloadDir, `orphan-lookup-${Date.now()}.json`)
  const results: OrphanLookupResult[] = [...preloaded]

  try {
    await openSelectFilters(page)
    await enablePoNumberFilter(page)
    const colId = await resolvePoNumberColId(page)

    for (const po of remaining) {
      const result = await lookupAndScrapeOrphan(page, po, colId)
      results.push(result)

      // Incremental save — crash loses at most one orphan's work
      fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
      console.log(`    Saved ${results.length}/${subset.length} to ${path.basename(outPath)}`)
      await page.waitForTimeout(PER_ORPHAN_DELAY_MS)
    }

    const found = results.filter((r) => r.found).length
    const totalLines = results.reduce((s, r) => s + r.lines.length, 0)
    const totalHistoryRows = results.reduce(
      (s, r) => s + r.lines.reduce((ls, ln) => ls + ln.history.historyRowCount, 0),
      0,
    )
    console.log(`\n=======================================================`)
    console.log(`Done. ${found}/${subset.length} orphans found in SCC.`)
    console.log(`  Total lines (details+history pairs): ${totalLines}`)
    console.log(`  Total history rows: ${totalHistoryRows}`)
    console.log(`  Output: ${outPath}`)
    console.log(`=======================================================\n`)

    if (!headless) {
      console.log('Browser left open for 10s. Press Ctrl+C to quit early.')
      await page.waitForTimeout(10_000)
    }
  } catch (err) {
    console.error('Orphan lookup scraper failed:', err)
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
    console.error(`Partial results (if any) saved to: ${outPath}`)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
