# Azure Functions — Wabtec ↔ M2M backend

Functions that power the dashboard's "Made2Manage" tab. Both are Node.js
HTTP-triggered functions on the `macpp-m2m-api` Function App. They live
**next to** the other MAC M2M functions (m2m-query, chat-sessions, etc.)
in the MAC-M2M-Assistant deployment zip — these copies are kept here for
visibility alongside the dashboard/scraper.

## `wabtec-po-compare/`

Primary lookup the dashboard calls on every load.

**POST** `/api/wabtec-po-compare`
```json
{
  "wabtecPos": ["174517285", "444983", ...],
  "scanRecentLimit": 50000
}
```

- **Primary match:** `LTRIM(RTRIM(SOMAST.FCUSTPONO)) IN (<posted POs>)`
  — exact Customer PO Number match against Sales Order Master.
- **Fallback match:** for POs with no primary hit, substring-scan the
  last `scanRecentLimit` SOMAST rows for `CHARINDEX(<po>, FCUSTPONO) > 0`.
  Catches prefix/suffix/embedded formatting.

Each returned row is tagged `matchedBy: "poNumber" | "substring"` so the
frontend can flag uncertain matches.

## `wabtec-po-find-everywhere/`

Diagnostic endpoint — takes a list of POs and checks **every M2M table
with a customer-PO column** (SOMAST, X850MAST, X830MAST, X860MAST,
X862MAST, X830MHST, X830RHST, INQUIRY, FSOINPUT, FSSERORD, FSWARNTY,
SYCSLM, SYRMAMA, UPSMAST, CLIPOUT — 15 total). Returns a `byPo` map
showing which tables each PO appears in.

Use to answer: *"We can't find this PO in SOMAST — is it anywhere else?"*

**POST** `/api/wabtec-po-find-everywhere`
```json
{ "wabtecPos": ["174496878", "210445493", ...] }
```

## Deploy

Functions are bundled with the rest of the `macpp-m2m-api` function app
in the MAC-M2M-Assistant project's `deploy.ps1`. To update the live
backend after changes here, copy the folder to
`MAC-M2M-Assistant/azure-functions/` and run that project's `deploy.ps1`.
Separating the two projects' deploy flows is future work.
