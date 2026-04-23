# Wabtec ↔ M2M

Cross-reference tool for reconciling Wabtec Supply Chain Connect (SCC) purchase orders against MAC Products' Made2Manage (M2M) ERP.

## Projects

### `dashboard/`
React + Vite + TypeScript app. Loads a Wabtec SCC PO export (CSV), fetches matching orders from M2M via an Azure Function, and surfaces discrepancies (status mismatches, missing POs, ship-to conflicts, etc.). Includes a **PO History** tab for drilling into the revision timeline of any PO.

- Microsoft Entra SSO (MSAL) with domain enforcement
- MAC Products design system (navy/blue/accent palette, DM Sans + Space Mono)
- Deployed via Azure Static Web Apps

### `scraper/`
Playwright scrapers that log into Wabtec SCC through Okta and extract data the CSV export doesn't carry:

- `scrape-po-details.ts` — per-PO shipping address, FOB, buyer, shipping terms (~1,000 POs)
- `inspect-po-details.ts` — per-PO revision history from the SCC History tab

Output JSON is consumed by the dashboard for richer comparisons.

## Setup

Each subproject has its own `package.json`. Start with:

```
cd dashboard && npm install && npm run dev
cd scraper && npm install && npm run install:browsers
```

Copy `.env.example` to `.env` in each and fill in credentials.

## Data flow

```
Wabtec SCC  ──(CSV export + Playwright scrape)──▶  dashboard/public/sample-data/
M2M DB      ──(Azure Function /api/wabtec-po-compare)──▶  dashboard
dashboard   ──(diff logic)──▶  Discrepancies view
```
