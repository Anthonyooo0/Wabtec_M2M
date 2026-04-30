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

const headless = HEADLESS !== 'false'
const screenshotDir = path.resolve(process.cwd(), 'screenshots')
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true })
const downloadDir = path.resolve(process.cwd(), 'downloads')
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true })

const shot = (page: Page, name: string) =>
  page.screenshot({
    path: path.join(screenshotDir, `${Date.now()}-${name}.png`),
    fullPage: true,
  })

// How many pages of the SCC grid to walk. Each page = 25 POs.
// 40 = full dataset (1,000 POs). Start at 1 to smoke-test pagination.
const PAGES_TO_SCRAPE = 40
const ROWS_PER_PAGE = 25
const PER_PO_DELAY_MS = 1500          // pacing — don't hammer SCC

// Resume controls — set START_PAGE to skip pages already done in a prior run.
// RESUME_FROM points at the partial JSON file written by that prior run; its
// rows are preloaded into the results array so dedupe-by-PO-line keeps them.
const START_PAGE = Math.max(1, parseInt(process.env.START_PAGE || '1', 10) || 1)
const RESUME_FROM = process.env.RESUME_FROM || ''

interface PODetails {
  poNumber: string
  poLineNumber: string | null
  itemNumber: string | null
  shipTo: {
    address: string | null
    city: string | null
    state: string | null
    zip: string | null
    country: string | null
  }
  shipFrom: {
    name: string | null
    address1: string | null
    address2: string | null
    city: string | null
    state: string | null
    zip: string | null
    country: string | null
  }
  buyer: {
    name: string | null
    email: string | null
  }
  sendVia: string | null
  fob: string | null
  shippingTerms: string | null
  shippingInstruction: string | null
  raw: Record<string, string>
  scrapedAt: string
}

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
  // Locate the PO Number column by reading ag-Grid's header cells.
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

async function scrapeOneRow(
  page: Page,
  rowIdx: number,
  colId: string,
  labelPrefix: string,
): Promise<PODetails> {
  // Same selector that worked when we scraped the first PO successfully.
  // ag-Grid keeps row-index values consistent with the full dataset across
  // pagination (row 25 on page 2, etc.), so we pass the ABSOLUTE index here.
  const cell = page
    .locator(`.ag-center-cols-container .ag-row[row-index="${rowIdx}"] .ag-cell[col-id="${colId}"]`)
    .first()
  await cell.waitFor({ state: 'visible', timeout: 10000 })
  const poNumber = (await cell.textContent())?.trim() || ''
  console.log(`  ${labelPrefix} PO ${poNumber}`)

  // ag-Grid wraps the clickable text in an <a>; click that so the cell's
  // click handler fires. Fall back to the cell itself if no anchor.
  const link = cell.locator('a, span[class*="link" i], [role="link"]').first()
  if ((await link.count()) > 0) {
    await link.click()
  } else {
    await cell.click()
  }

  // Same timings as the single-PO run that extracted cleanly. The modal header
  // ("PO Details" text) appears fast but its <input value=...> fields populate
  // async, so we need a settled wait before extracting.
  await page.waitForTimeout(800)
  await page.waitForSelector('text=PO Details', { timeout: 15000 })
  await page.waitForTimeout(1500)

  // Defensively select the Shipping Details sub-tab in case Billing/Notes is default.
  const shippingTab = page.getByText(/^\s*Shipping Details\s*$/i).first()
  if ((await shippingTab.count()) > 0) {
    await shippingTab.click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)
  }

  // Wait until at least one labeled input has a value — guarantees the modal
  // has finished hydrating before we read the DOM.
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
    .catch(() => {}) // best-effort — fall through to extract either way

  const details = await extractDetails(page, poNumber)
  const fieldCount = Object.keys(details.raw).length
  // Real-time per-row confirmation so you can eyeball the data as it streams in.
  const shipTo = [details.shipTo.address, details.shipTo.city, details.shipTo.state, details.shipTo.zip]
    .filter(Boolean)
    .join(', ') || '—'
  const shipFrom = [details.shipFrom.city, details.shipFrom.state].filter(Boolean).join(', ') || '—'
  const buyer = details.buyer.name
    ? `${details.buyer.name}${details.buyer.email ? ` <${details.buyer.email}>` : ''}`
    : '—'
  console.log(`    Item:     ${details.itemNumber || '—'}`)
  console.log(`    Ship to:  ${shipTo}`)
  console.log(`    Ship fm:  ${shipFrom}`)
  console.log(`    Buyer:    ${buyer}`)
  console.log(`    Via:      ${details.sendVia || '—'}   FOB: ${details.fob || '—'}   Terms: ${details.shippingTerms || '—'}`)
  console.log(`    (${fieldCount} total fields)`)

  // Close the modal for the next iteration.
  const closeBtn = page.locator('button:has-text("×"), [aria-label="Close"]').first()
  if ((await closeBtn.count()) > 0) {
    await closeBtn.click().catch(() => {})
  } else {
    await page.keyboard.press('Escape')
  }
  await page.waitForTimeout(600)

  return details
}

// Walks the grid page-by-page. Each page has up to ROWS_PER_PAGE rows; the
// last page in the dataset may have fewer. Saves progress incrementally so a
// mid-run crash doesn't lose everything.
async function scrapePages(
  page: Page,
  pagesToScrape: number,
  outPath: string,
  startPage: number,
  preloaded: PODetails[],
): Promise<PODetails[]> {
  const colId = await resolvePoNumberColId(page)
  const results: PODetails[] = [...preloaded]

  // Advance grid to startPage by clicking Next (startPage - 1) times.
  for (let i = 1; i < startPage; i++) {
    const nextBtn = page.locator('button:has-text("Next")').first()
    const disabled = await nextBtn.getAttribute('disabled').catch(() => null)
    if (disabled !== null) {
      console.log(`  Next disabled while seeking to page ${startPage} (stopped at ${i}).`)
      break
    }
    await nextBtn.click()
    await page.waitForTimeout(2500)
  }
  if (startPage > 1) console.log(`  Resumed at page ${startPage} (${results.length} preloaded rows).`)

  for (let pageNum = startPage; pageNum <= pagesToScrape; pageNum++) {
    console.log(`\n=== Page ${pageNum} / ${pagesToScrape} ===`)

    // Same pattern as the single-PO test that worked. ag-Grid keeps row-index
    // values absolute across pagination, so page N's rows are at indexes
    // (N-1)*25 .. (N*25)-1.
    const baseIdx = (pageNum - 1) * ROWS_PER_PAGE
    for (let i = 0; i < ROWS_PER_PAGE; i++) {
      const rowIdx = baseIdx + i
      const label = `[Page ${pageNum}, Row ${i + 1}/${ROWS_PER_PAGE} idx=${rowIdx}]`
      try {
        const details = await scrapeOneRow(page, rowIdx, colId, label)
        results.push(details)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  ${label} FAILED: ${msg}`)
        // Try to recover by pressing Escape so a stuck modal doesn't cascade.
        await page.keyboard.press('Escape').catch(() => {})
        await page.waitForTimeout(800)
      }
      await page.waitForTimeout(PER_PO_DELAY_MS)
    }

    // Incremental save after every page so a crash loses at most one page's work.
    // Dedupe by PO+line — a resumed run may re-scrape rows that exist in preloaded.
    const dedupedMap = new Map<string, PODetails>()
    for (const r of results) dedupedMap.set(`${r.poNumber}|${r.poLineNumber ?? ''}`, r)
    const deduped = Array.from(dedupedMap.values())
    fs.writeFileSync(outPath, JSON.stringify(deduped, null, 2))
    console.log(`  Saved ${deduped.length} rows so far to ${path.basename(outPath)} (raw=${results.length})`)

    // Advance to next page (unless this was the last one).
    if (pageNum < pagesToScrape) {
      const nextBtn = page.locator('button:has-text("Next")').first()
      const disabled = await nextBtn.getAttribute('disabled').catch(() => null)
      if (disabled !== null) {
        console.log('  Next button disabled — done.')
        break
      }
      await nextBtn.click()
      await page.waitForTimeout(2500) // give the new page time to render
    }
  }

  return results
}

// Each field in the modal is a <label>Field Name</label><input value="..."> pair.
// We find every label and grab its associated input value. This is resilient to
// field reordering and works for both Shipping Details and the top block.
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
      // Try to find a sibling or nearby input
      let input: HTMLInputElement | null = null
      const container = label.closest('mat-form-field, .form-group, .field, .form-field, div')
      if (container) {
        input = container.querySelector('input, textarea') as HTMLInputElement | null
      }
      if (!input) {
        const next = label.nextElementSibling
        if (next) input = next.querySelector('input, textarea') as HTMLInputElement | null
      }
      if (input && input.value) {
        if (!result[text]) result[text] = input.value.trim()
      }
    })
    return result
  })

  const pick = (...keys: string[]): string | null => {
    for (const k of keys) {
      if (raw[k] && raw[k].trim()) return raw[k].trim()
    }
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

;(async () => {
  // Preload prior partial run if RESUME_FROM points at one. Failures are non-fatal —
  // we just start with an empty array.
  let preloaded: PODetails[] = []
  if (RESUME_FROM) {
    try {
      const resumePath = path.isAbsolute(RESUME_FROM)
        ? RESUME_FROM
        : path.resolve(downloadDir, RESUME_FROM)
      preloaded = JSON.parse(fs.readFileSync(resumePath, 'utf-8'))
      console.log(`Preloaded ${preloaded.length} rows from ${path.basename(resumePath)}`)
    } catch (e) {
      console.warn(`RESUME_FROM "${RESUME_FROM}" failed to load:`, e)
    }
  }

  const { browser, page } = await loginAndNavigate()
  const outPath = path.join(downloadDir, `po-details-${Date.now()}.json`)
  try {
    const started = Date.now()
    const results = await scrapePages(page, PAGES_TO_SCRAPE, outPath, START_PAGE, preloaded)
    const elapsedMin = ((Date.now() - started) / 60000).toFixed(1)
    console.log(
      `\nDone. ${results.length} POs scraped in ${elapsedMin} min.\nFinal file: ${outPath}`,
    )
    if (!headless) {
      console.log('Browser left open for 10s so you can inspect.')
      await new Promise((r) => setTimeout(r, 10000))
    }
  } catch (err) {
    console.error('Scrape failed:', err)
    console.error(`Partial results (if any) saved to: ${outPath}`)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
