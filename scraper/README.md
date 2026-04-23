# MAC Wabtec SCC Scraper

Automates data extraction from Wabtec Supply Chain Connect (SCC) so we can diff it against Made2Manage data.

## Setup

```bash
cd "c:\Users\ajimenez\Downloads\MAC-Software-Engineering\Projects\MAC-Wabtec-SCC-Scraper"
npm install
npm run install:browsers
cp .env.example .env
# edit .env and fill in WABTEC_PASSWORD
```

## Run step 1 (username -> Next -> password page)

```bash
npm run login:headed   # watch the browser
npm run login          # headless
```

Screenshots land in `./screenshots/`. After step 1 runs, inspect `03-password-page.png` and the logged input list — we use those selectors to build step 2 (password + final submit + landing page).

## Roadmap

- [x] Step 1: navigate, fill username, click Next, capture password page
- [ ] Step 2: fill password, submit, confirm redirect to scc.wabtec.com
- [ ] Step 3: navigate to sales/order data view
- [ ] Step 4: apply filters, export CSV
- [ ] Step 5: post export to MAC function app for M2M diff
