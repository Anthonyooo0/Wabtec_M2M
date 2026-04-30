import { chromium, type Browser, type Page } from 'playwright'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config()

const { WABTEC_USERNAME, WABTEC_PASSWORD, WABTEC_LOGIN_URL, HEADLESS } = process.env

if (!WABTEC_USERNAME || !WABTEC_PASSWORD || !WABTEC_LOGIN_URL) {
  console.error('Missing required env vars. Copy .env.example to .env and fill in values.')
  process.exit(1)
}

// Recon script — opens the first PO's detail modal and leaves the browser open
// so you can eyeball which additional fields should be captured by the real
// scraper. Force a headed run by default; override with HEADLESS=true if needed.
const headless = HEADLESS === 'true'
const screenshotDir = path.resolve(process.cwd(), 'screenshots')
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })
const downloadDir = path.resolve(process.cwd(), 'downloads')
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: path.join(screenshotDir, `${Date.now()}-${name}.png`),
    fullPage: true,
  })

async function loginAndNavigate(): Promise<{ browser: Browser; page: Page }> {
  // --- Verbatim copy of login.ts Steps 1a–3b. Do NOT edit these waits/selectors
  // without testing against the full SCC flow — they're battle-tested.
  console.log(`Launching browser (headless=${headless})...`)
  const browser = await chromium.launch({ headless })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()

  console.log('Step 1a: navigating to Okta login...')
  await page.goto(WABTEC_LOGIN_URL!, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await shot(page, '01-login-page')

  console.log('Step 1b: filling username...')
  const usernameInput = page.locator('input[name="identifier"], input[name="username"], input[type="text"]').first()
  await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
  await usernameInput.fill(WABTEC_USERNAME!)
  await shot(page, '02-username-filled')

  console.log('Step 1c: clicking Next...')
  const nextBtn = page.locator('input[type="submit"], button:has-text("Next")').first()
  await nextBtn.click()

  console.log('Step 1d: waiting for password page...')
  await page.waitForLoadState('networkidle', { timeout: 15000 })
  await page.waitForTimeout(1000)
  await shot(page, '03-password-page')

  console.log('Step 2a: filling password...')
  const passwordInput = page.locator('input[name="credentials.passcode"]').first()
  await passwordInput.waitFor({ state: 'visible', timeout: 15000 })
  await passwordInput.fill(WABTEC_PASSWORD!)
  await shot(page, '04-password-filled')

  console.log('Step 2b: clicking Verify...')
  const verifyBtn = page.locator('input[type="submit"], button:has-text("Verify")').first()
  await verifyBtn.click()

  console.log('Step 2c: waiting for redirect to scc.wabtec.com...')
  await page.waitForURL(/scc\.wabtec\.com/, { timeout: 20000 })

  console.log('Step 2d: waiting for SCC Dashboard to fully render (up to 20s)...')
  await page.waitForSelector('text=SCC Dashboard', { timeout: 20000 })
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, '05-scc-dashboard')

  console.log('Step 3a: clicking PO Collaboration...')
  const poLink = page.getByText('PO Collaboration', { exact: true }).first()
  await poLink.waitFor({ state: 'attached', timeout: 10000 })
  await poLink.click({ force: true })

  console.log('Step 3b: waiting for PO Collaboration page to render (up to 20s)...')
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(3000)
  await shot(page, '06-po-collaboration')
  // --- end verbatim copy ---

  return { browser, page }
}

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
  console.log(`PO Number column col-id: ${colId}`)
  return colId
}

async function openPoDetailsAt(
  page: Page,
  rowIdx: number,
  colId: string,
  labelPrefix: string,
): Promise<string> {
  // Same selector the full scraper uses. row-index is absolute across pages —
  // ag-Grid keeps it that way (page 2 is rows 25..49).
  const cell = page
    .locator(`.ag-center-cols-container .ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`)
    .first()
  await cell.waitFor({ state: 'visible', timeout: 10000 })
  const poNumber = (await cell.textContent())?.trim() || ''
  console.log(`${labelPrefix} Opening PO Details for PO ${poNumber}...`)

  const link = cell.locator('a, span[class*="link" i], [role="link"]').first()
  if ((await link.count()) > 0) {
    await link.click()
  } else {
    await cell.click()
  }

  await page.waitForTimeout(800)
  await page.waitForSelector('text=PO Details', { timeout: 15000 })
  await page.waitForTimeout(1500)
  await shot(page, '07-po-details-open')
  console.log(`PO Details modal is open for PO ${poNumber}.`)

  // Let the Details tab finish populating before switching tabs — History
  // tab click fires too early otherwise and the modal stays on Details.
  console.log('Waiting 6s for Details tab to fully render before switching...')
  await page.waitForTimeout(6000)

  // Click the History tab inside the modal.
  console.log('Clicking History tab...')
  const historyTab = page
    .locator('mat-dialog-container, [role="dialog"]')
    .getByText(/^\s*History\s*$/i)
    .first()
  await historyTab.waitFor({ state: 'visible', timeout: 10000 })
  await historyTab.click({ force: true })
  await page.waitForTimeout(2000)
  await shot(page, '08-po-details-history')
  console.log('History tab is now open.')

  // Toggle Core Changes off. DOM has 3 mat-slide-toggles total, so a bare
  // index isn't safe. Instead: find the "Core Changes" text node, then pick
  // the nearest preceding mat-slide-toggle in document order — the label
  // sits immediately after its own toggle: "[toggle] Core Changes".
  console.log('Waiting for Core Changes toggle to appear...')
  const toggleClicked = await page.waitForFunction(
    () => {
      const toggles = Array.from(
        document.querySelectorAll(
          'mat-slide-toggle, mat-mdc-slide-toggle, .mat-slide-toggle, .mat-mdc-slide-toggle',
        ),
      ) as HTMLElement[]
      if (toggles.length === 0) return null

      // Find the text node whose trimmed content is exactly "Core Changes".
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

      // Find the toggle whose position comes BEFORE the text node and is the
      // closest such toggle. compareDocumentPosition returns a bitmask;
      // DOCUMENT_POSITION_FOLLOWING (0x04) means "arg follows ref".
      let best: HTMLElement | null = null
      let bestIdx = -1
      for (let i = 0; i < toggles.length; i++) {
        const pos = toggles[i].compareDocumentPosition(textNode)
        const textFollowsToggle = (pos & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        if (textFollowsToggle && i > bestIdx) {
          best = toggles[i]
          bestIdx = i
        }
      }
      if (!best) return null

      const inner = (best.querySelector('button[role="switch"], [role="switch"], input[type="checkbox"]') ||
        best) as HTMLElement
      inner.click()
      return `toggles=${toggles.length} picked=${bestIdx} inner=${inner.tagName}`
    },
    { timeout: 20000, polling: 500 },
  ).catch(() => null)

  if (toggleClicked) {
    const val = await toggleClicked.jsonValue()
    console.log(`Clicked Core Changes toggle: ${val}`)
  } else {
    console.log('Could not find Core Changes toggle within 20s.')
  }

  await page.waitForTimeout(1500)
  await shot(page, '09-core-changes-off')
  console.log('Core Changes toggled.')

  return poNumber
}

// Extract every row x column from the History ag-Grid. ag-Grid virtualizes
// columns that are off-screen, so we scroll the grid body horizontally and
// accumulate cell values keyed by row-index + col-id across scroll positions.
async function scrapeHistoryGrid(page: Page): Promise<{
  columns: { colId: string; header: string }[]
  rows: Record<string, string>[]
}> {
  console.log('Scraping history grid (scrolling horizontally to pick up all columns)...')

  // Find the HISTORY grid, not the PO Collaboration grid behind the modal.
  // Pick the ag-Grid whose header row contains the signature history columns
  // ("Revision number" / "Before" / "After"). Return its horizontal scroller.
  const viewportHandle = await page.evaluateHandle(() => {
    const HISTORY_SIGNATURE = ['revision number', 'before', 'after']
    const grids = Array.from(document.querySelectorAll('.ag-root-wrapper, .ag-root')) as HTMLElement[]
    let historyGrid: HTMLElement | null = null
    for (const g of grids) {
      const headers = Array.from(g.querySelectorAll('.ag-header-cell')).map((h) =>
        (h.textContent || '').trim().toLowerCase(),
      )
      const hits = HISTORY_SIGNATURE.filter((sig) => headers.some((h) => h.includes(sig))).length
      if (hits >= 2) {
        historyGrid = g
        break
      }
    }
    if (!historyGrid) return null
    const vp = historyGrid.querySelector(
      '.ag-body-horizontal-scroll-viewport, .ag-center-cols-viewport',
    ) as HTMLElement | null
    return vp
  })

  const snapshot = async () =>
    page.evaluate((vp) => {
      const vpEl = vp as HTMLElement | null
      const grid: ParentNode =
        (vpEl && (vpEl.closest('.ag-root-wrapper') || vpEl.closest('.ag-root'))) || document
      // Header map — col-id → display text
      const headers: Record<string, string> = {}
      grid.querySelectorAll('.ag-header-cell').forEach((h) => {
        const colId = h.getAttribute('col-id') || ''
        const label = (h.textContent || '').trim()
        if (colId) headers[colId] = label
      })
      // Row data — row-index → col-id → text
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

  // Initial capture.
  let cur = await snapshot()
  Object.assign(allHeaders, cur.headers)
  for (const [idx, cells] of Object.entries(cur.rowMap)) {
    merged[idx] = Object.assign({}, merged[idx] || {}, cells)
  }

  // Get max scroll and step across the viewport in chunks.
  const scrollInfo = await page.evaluate((vp) => {
    const el = vp as HTMLElement | null
    if (!el) return { scrollWidth: 0, clientWidth: 0 }
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
  }, viewportHandle)
  const step = Math.max(200, Math.floor(scrollInfo.clientWidth * 0.8))
  const maxScroll = Math.max(0, scrollInfo.scrollWidth - scrollInfo.clientWidth)
  console.log(`  grid scrollWidth=${scrollInfo.scrollWidth}, clientWidth=${scrollInfo.clientWidth}, step=${step}`)

  for (let x = 0; x <= maxScroll + step; x += step) {
    const target = Math.min(x, maxScroll)
    await page.evaluate(
      (args) => {
        const el = args.vp as HTMLElement | null
        if (el) el.scrollLeft = args.target
      },
      { vp: viewportHandle, target },
    )
    await page.waitForTimeout(350) // let virtualization re-render
    cur = await snapshot()
    Object.assign(allHeaders, cur.headers)
    for (const [idx, cells] of Object.entries(cur.rowMap)) {
      merged[idx] = Object.assign({}, merged[idx] || {}, cells)
    }
    if (target === maxScroll) break
  }

  // Reset scroll back to 0 (leaves the grid visually tidy).
  await page.evaluate((vp) => {
    const el = vp as HTMLElement | null
    if (el) el.scrollLeft = 0
  }, viewportHandle)

  // Shape the output. Sort rows by numeric row-index, columns by header order.
  const colIds = Object.keys(allHeaders)
  const columns = colIds.map((id) => ({ colId: id, header: allHeaders[id] }))
  const rowIdxs = Object.keys(merged)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
  const rows = rowIdxs.map((idx) => {
    const cells = merged[String(idx)] || {}
    const out: Record<string, string> = {}
    for (const id of colIds) {
      const label = allHeaders[id] || id
      out[label] = cells[id] || ''
    }
    return out
  })
  return { columns, rows }
}

// Pagination constants — same shape as scrape-po-details.ts so behavior is
// consistent with the production scraper. Full dataset is 1,000 POs = 40 pages.
const PAGES_TO_SCRAPE = 40
const ROWS_PER_PAGE = 25
const PER_PO_DELAY_MS = 1200

// Resume controls — START_PAGE skips pages already done; RESUME_FROM preloads
// the partial JSON written by that prior run.
const START_PAGE = Math.max(1, parseInt(process.env.START_PAGE || '1', 10) || 1)
const RESUME_FROM = process.env.RESUME_FROM || ''

interface PoHistoryEntry {
  poNumber: string
  rowIdx: number
  pageNum: number
  historyRowCount: number
  columns: { colId: string; header: string }[]
  rows: Record<string, string>[]
  scrapedAt: string
  error?: string
}

async function closeModal(page: Page): Promise<void> {
  const closeBtn = page.locator('button:has-text("×"), [aria-label="Close"]').first()
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click().catch(() => {})
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(600)
}

async function scrapeOnePoHistory(
  page: Page,
  rowIdx: number,
  colId: string,
  pageNum: number,
  labelPrefix: string,
): Promise<PoHistoryEntry> {
  const started = Date.now()
  try {
    const poNumber = await openPoDetailsAt(page, rowIdx, colId, labelPrefix)
    // Grid can take a moment to re-render after the Core Changes toggle.
    await page.waitForTimeout(2000)
    const grid = await scrapeHistoryGrid(page)
    const entry: PoHistoryEntry = {
      poNumber,
      rowIdx,
      pageNum,
      historyRowCount: grid.rows.length,
      columns: grid.columns,
      rows: grid.rows,
      scrapedAt: new Date().toISOString(),
    }
    console.log(
      `${labelPrefix} PO ${poNumber} — ${grid.rows.length} history rows, ${grid.columns.length} cols (${Date.now() - started}ms)`,
    )
    await closeModal(page)
    return entry
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`${labelPrefix} FAILED: ${msg}`)
    // Try to recover — close any stuck modal so the next PO can open.
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(600)
    return {
      poNumber: '',
      rowIdx,
      pageNum,
      historyRowCount: 0,
      columns: [],
      rows: [],
      scrapedAt: new Date().toISOString(),
      error: msg,
    }
  }
}

;(async () => {
  // Preload prior partial run if RESUME_FROM points at one.
  let preloaded: PoHistoryEntry[] = []
  if (RESUME_FROM) {
    try {
      const resumePath = path.isAbsolute(RESUME_FROM)
        ? RESUME_FROM
        : path.resolve(downloadDir, RESUME_FROM)
      preloaded = JSON.parse(fs.readFileSync(resumePath, 'utf-8'))
      console.log(`Preloaded ${preloaded.length} entries from ${path.basename(resumePath)}`)
    } catch (e) {
      console.warn(`RESUME_FROM "${RESUME_FROM}" failed to load:`, e)
    }
  }

  const { browser, page } = await loginAndNavigate()
  const outPath = path.join(downloadDir, `po-history-${Date.now()}.json`)
  const results: PoHistoryEntry[] = [...preloaded]

  try {
    const colId = await resolvePoNumberColId(page)

    // Advance grid to START_PAGE before iterating.
    for (let i = 1; i < START_PAGE; i++) {
      const nextBtn = page.locator('button:has-text("Next")').first()
      const disabled = await nextBtn.getAttribute('disabled').catch(() => null)
      if (disabled !== null) {
        console.log(`  Next disabled while seeking to page ${START_PAGE} (stopped at ${i}).`)
        break
      }
      await nextBtn.click()
      await page.waitForTimeout(2500)
    }
    if (START_PAGE > 1) console.log(`  Resumed at page ${START_PAGE} (${results.length} preloaded entries).`)

    for (let pageNum = START_PAGE; pageNum <= PAGES_TO_SCRAPE; pageNum++) {
      console.log(`\n=== Page ${pageNum} / ${PAGES_TO_SCRAPE} ===`)
      const baseIdx = (pageNum - 1) * ROWS_PER_PAGE
      for (let i = 0; i < ROWS_PER_PAGE; i++) {
        const rowIdx = baseIdx + i
        const label = `[Page ${pageNum}, Row ${i + 1}/${ROWS_PER_PAGE} idx=${rowIdx}]`
        const entry = await scrapeOnePoHistory(page, rowIdx, colId, pageNum, label)
        results.push(entry)
        await page.waitForTimeout(PER_PO_DELAY_MS)
      }
      // Incremental save after each page — dedupe by rowIdx so resumed runs
      // overwrite their re-scraped rows instead of doubling them.
      const dedupedMap = new Map<number, PoHistoryEntry>()
      for (const r of results) dedupedMap.set(r.rowIdx, r)
      const deduped = Array.from(dedupedMap.values()).sort((a, b) => a.rowIdx - b.rowIdx)
      fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2))
      console.log(`  Saved ${deduped.length} PO histories so far to ${path.basename(outPath)} (raw=${results.length})`)

      // Advance to next page — same pattern as the working scraper.
      if (pageNum < PAGES_TO_SCRAPE) {
        const nextBtn = page.locator('button:has-text("Next")').first()
        const disabled = await nextBtn.getAttribute('disabled').catch(() => null)
        if (disabled !== null) {
          console.log('  Next button disabled — done.')
          break
        }
        await nextBtn.click()
        await page.waitForTimeout(2500)
      }
    }

    console.log('\n=======================================================')
    console.log(`Done. Scraped ${results.length} POs across ${PAGES_TO_SCRAPE} pages.`)
    const withHistory = results.filter((r) => r.historyRowCount > 0).length
    const failed = results.filter((r) => r.error).length
    console.log(`  ${withHistory} POs had history rows · ${failed} errors`)
    console.log(`Final file: ${outPath}`)
    console.log('=======================================================\n')
  } catch (err) {
    console.error('Inspection run failed:', err)
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
    console.error(`Partial results (if any) saved to: ${outPath}`)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
