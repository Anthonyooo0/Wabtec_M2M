import { chromium, Browser, Page } from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config();

const {
  WABTEC_USERNAME,
  WABTEC_PASSWORD,
  WABTEC_LOGIN_URL,
  HEADLESS,
} = process.env;

if (!WABTEC_USERNAME || !WABTEC_PASSWORD || !WABTEC_LOGIN_URL) {
  console.error('Missing required env vars. Copy .env.example to .env and fill in values.');
  process.exit(1);
}

const headless = HEADLESS !== 'false';
const screenshotDir = path.resolve(process.cwd(), 'screenshots');
if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

const downloadDir = path.resolve(process.cwd(), 'downloads');
if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

const shot = (page: Page, name: string) =>
  page.screenshot({ path: path.join(screenshotDir, `${Date.now()}-${name}.png`), fullPage: true });

async function login(): Promise<{ browser: Browser; page: Page }> {
  console.log(`Launching browser (headless=${headless})...`);
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('Step 1a: navigating to Okta login...');
  await page.goto(WABTEC_LOGIN_URL!, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await shot(page, '01-login-page');

  console.log('Step 1b: filling username...');
  const usernameInput = page.locator('input[name="identifier"], input[name="username"], input[type="text"]').first();
  await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
  await usernameInput.fill(WABTEC_USERNAME!);
  await shot(page, '02-username-filled');

  console.log('Step 1c: clicking Next...');
  const nextBtn = page.locator('input[type="submit"], button:has-text("Next")').first();
  await nextBtn.click();

  console.log('Step 1d: waiting for password page...');
  await page.waitForLoadState('networkidle', { timeout: 15000 });
  await page.waitForTimeout(1000);
  await shot(page, '03-password-page');

  console.log('Step 2a: filling password...');
  const passwordInput = page.locator('input[name="credentials.passcode"]').first();
  await passwordInput.waitFor({ state: 'visible', timeout: 15000 });
  await passwordInput.fill(WABTEC_PASSWORD!);
  await shot(page, '04-password-filled');

  console.log('Step 2b: clicking Verify...');
  const verifyBtn = page.locator('input[type="submit"], button:has-text("Verify")').first();
  await verifyBtn.click();

  console.log('Step 2c: waiting for redirect to scc.wabtec.com...');
  await page.waitForURL(/scc\.wabtec\.com/, { timeout: 20000 });

  console.log('Step 2d: waiting for SCC Dashboard to fully render (up to 20s)...');
  await page.waitForSelector('text=SCC Dashboard', { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await shot(page, '05-scc-dashboard');

  console.log('Landed on:', page.url());
  console.log('Page title:', await page.title());

  console.log('\nSidebar items (aria-label / title / text / href):');
  const sidebarItems = await page.locator(
    'nav a, nav button, aside a, aside button, [class*="sidebar" i] a, [class*="sidebar" i] button, [class*="menu" i] a, [class*="menu" i] button, [role="navigation"] a, [role="navigation"] button'
  ).all();
  const seen = new Set<string>();
  for (const item of sidebarItems) {
    const aria = await item.getAttribute('aria-label');
    const title = await item.getAttribute('title');
    const href = await item.getAttribute('href');
    const text = (await item.textContent())?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
    const key = `${aria}|${title}|${href}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  - aria="${aria}" title="${title}" text="${text}" href="${href}"`);
  }

  console.log('\nStep 3a: clicking PO Collaboration...');
  const poLink = page.getByText('PO Collaboration', { exact: true }).first();
  await poLink.waitFor({ state: 'attached', timeout: 10000 });
  await poLink.click({ force: true });

  console.log('Step 3b: waiting for PO Collaboration page to render (up to 20s)...');
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(3000);
  await shot(page, '06-po-collaboration');

  console.log('PO Collaboration URL:', page.url());

  console.log('\nPO Collaboration page — headings & tab labels:');
  const headings = await page.locator('h1, h2, h3, h4, [role="tab"], mat-tab, .mat-tab-label').all();
  for (const h of headings.slice(0, 20)) {
    const text = (await h.textContent())?.trim().replace(/\s+/g, ' ').slice(0, 80) || '';
    if (text) console.log(`  - ${text}`);
  }

  console.log('\nPO Collaboration page — buttons (first 30):');
  const buttons = await page.locator('button, [role="button"], .mat-button, .mat-raised-button, mat-icon-button').all();
  const btnSeen = new Set<string>();
  let btnCount = 0;
  for (const b of buttons) {
    if (btnCount >= 30) break;
    const text = (await b.textContent())?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
    const aria = await b.getAttribute('aria-label');
    const title = await b.getAttribute('title');
    const key = `${text}|${aria}|${title}`;
    if (btnSeen.has(key) || (!text && !aria && !title)) continue;
    btnSeen.add(key);
    console.log(`  - text="${text}" aria="${aria}" title="${title}"`);
    btnCount++;
  }

  console.log('\nPO Collaboration page — table/grid columns (if any):');
  const columns = await page.locator('th, .mat-header-cell, [role="columnheader"], .ag-header-cell-label').all();
  for (const c of columns.slice(0, 30)) {
    const text = (await c.textContent())?.trim().replace(/\s+/g, ' ').slice(0, 60) || '';
    if (text) console.log(`  - ${text}`);
  }

  console.log('\nStep 4a: clicking ag-Grid Columns side-button...');
  const columnsSideBtn = page.locator('button.ag-side-button-button:has-text("Columns")').first();
  await columnsSideBtn.waitFor({ state: 'visible', timeout: 10000 });
  await columnsSideBtn.click();
  await page.waitForTimeout(1500);

  await page.locator('input[aria-label="Toggle Select All Columns"]').first()
    .waitFor({ state: 'visible', timeout: 10000 });
  await shot(page, '07-columns-panel-open');

  console.log('Step 4b: checking "Creation Date" column toggle...');
  const creationDateCb = page.locator('input[aria-label^="Creation Date"][aria-label$="Toggle Selection"]').first();
  await creationDateCb.scrollIntoViewIfNeeded();
  const creationAria = await creationDateCb.getAttribute('aria-label');
  const creationWasChecked = await creationDateCb.isChecked().catch(() => false);
  console.log(`  Matched: aria="${creationAria}" checked=${creationWasChecked}`);

  if (!creationWasChecked) {
    // ag-Grid's real <input> is visually hidden; click the row wrapper so the toggle handler fires.
    const creationDateRow = page.locator(
      '.ag-column-select-column:has(input[aria-label^="Creation Date"])'
    ).first();
    const rowFound = await creationDateRow.count();
    if (rowFound > 0) {
      console.log('  Clicking .ag-column-select-column row wrapper...');
      await creationDateRow.click();
    } else {
      console.log('  Row wrapper not found — dispatching native click on input...');
      await creationDateCb.evaluate((el: HTMLInputElement) => el.click());
    }
    await page.waitForTimeout(700);

    const nowChecked = await creationDateCb.isChecked().catch(() => false);
    console.log(`  After click: checked=${nowChecked}`);
  }
  await shot(page, '08-creation-date-checked');

  console.log('\nStep 5: clicking "Action" header checkbox to select all rows...');
  const selectAllRows = page.locator('input[aria-label="Toggle Selection of All Rows"]').first();
  await selectAllRows.waitFor({ state: 'attached', timeout: 10000 });
  const rowsWereSelected = await selectAllRows.isChecked().catch(() => false);
  console.log(`  Before: checked=${rowsWereSelected}`);

  const selectAllWrapper = page.locator(
    '.ag-header-select-all:has(input[aria-label="Toggle Selection of All Rows"]), ' +
    '.ag-checkbox-input-wrapper:has(input[aria-label="Toggle Selection of All Rows"])'
  ).first();

  if ((await selectAllWrapper.count()) > 0) {
    console.log('  Clicking header-select-all wrapper...');
    await selectAllWrapper.click();
  } else {
    console.log('  Wrapper not found — dispatching native click on input...');
    await selectAllRows.evaluate((el: HTMLInputElement) => el.click());
  }
  await page.waitForTimeout(1500);
  const rowsNowSelected = await selectAllRows.isChecked().catch(() => false);
  console.log(`  After: checked=${rowsNowSelected}`);
  await shot(page, '10-all-rows-selected');

  console.log('\nStep 6a: clicking "Export Actions"...');
  const exportActionsBtn = page.getByText('Export Actions', { exact: true }).first();
  await exportActionsBtn.waitFor({ state: 'visible', timeout: 10000 });
  await exportActionsBtn.click();
  await page.waitForTimeout(1000);
  await shot(page, '11-export-menu-open');

  console.log('Step 6b: clicking "EXCEL EXPORT" and capturing download...');
  const excelOption = page
    .getByRole('menuitem', { name: /excel export/i })
    .or(page.locator('.mat-menu-item:has-text("Excel Export"), button:has-text("Excel Export")').locator('visible=true').first())
    .first();
  await excelOption.waitFor({ state: 'visible', timeout: 10000 });

  const downloadPromise = page.waitForEvent('download', { timeout: 60000 });
  await excelOption.click();

  let savedPath: string | null = null;
  try {
    const download = await downloadPromise;
    const suggested = download.suggestedFilename() || `wabtec-scc-po-${Date.now()}.xlsx`;
    savedPath = path.join(downloadDir, `${Date.now()}-${suggested}`);
    await download.saveAs(savedPath);
    console.log(`  Download saved: ${savedPath}`);
  } catch (err) {
    console.log(`  No download event fired within 60s — may be queued report (check Exported Reports tab).`);
    console.log(`  Error: ${(err as Error).message}`);
  }

  await page.waitForTimeout(2000);
  await shot(page, '12-after-excel-export');

  console.log('Current URL:', page.url());
  if (savedPath) console.log(`Final file: ${savedPath}`);

  return { browser, page };
}

(async () => {
  try {
    const { browser } = await login();
    console.log('\nAll steps complete. Screenshots saved to ./screenshots/');
    if (!headless) {
      console.log('Browser left open for 20s so you can inspect. Press Ctrl+C to quit early.');
      await new Promise((r) => setTimeout(r, 20000));
    }
    await browser.close();
  } catch (err) {
    console.error('Login failed:', err);
    process.exit(1);
  }
})();
