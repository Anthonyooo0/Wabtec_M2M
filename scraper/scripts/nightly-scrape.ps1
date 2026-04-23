# Nightly scrape — pulls fresh data from Wabtec SCC and publishes it to the
# dashboard via git push (which triggers Azure Static Web Apps to rebuild).
#
# Runs three scrapers in sequence:
#   1. login.ts              — exports the full PO Collaboration grid as XLSX/CSV
#   2. scrape-po-details.ts  — scrapes per-PO shipping address / buyer / FOB
#   3. inspect-po-details.ts — scrapes per-PO revision history
#
# Total runtime: ~4.5 hours. Output is atomic: if any stage fails, the commit
# is skipped so yesterday's data stays in production until the problem is fixed.

$ErrorActionPreference = 'Stop'

# ---- Paths -------------------------------------------------------------------
$scraperRoot   = Resolve-Path "$PSScriptRoot\.."
$repoRoot      = Resolve-Path "$scraperRoot\.."
$dashSampleDir = Join-Path $repoRoot 'dashboard\public\sample-data'
$downloadDir   = Join-Path $scraperRoot 'downloads'
$logDir        = Join-Path $scraperRoot 'logs'

New-Item -ItemType Directory -Force -Path $logDir        | Out-Null
New-Item -ItemType Directory -Force -Path $dashSampleDir | Out-Null

$runDate = Get-Date -Format 'yyyy-MM-dd'
$logFile = Join-Path $logDir "$runDate.log"

function Log($msg) {
  $ts = Get-Date -Format 'HH:mm:ss'
  $line = "[$ts] $msg"
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

Log "=== Nightly scrape started ($runDate) ==="

# Pin CWD to the scraper dir so tsx + playwright resolve correctly.
Set-Location $scraperRoot

# Headless for all runs — no desktop interaction at midnight.
$env:HEADLESS = 'true'

# ---- Helper: latest matching file in downloads/ ------------------------------
function Get-LatestInDownloads {
  param([string]$Pattern)
  Get-ChildItem -Path $downloadDir -Filter $Pattern -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}

# ---- Stage 1 — Grid export (login.ts) ---------------------------------------
Log "Stage 1/3: grid export (login.ts)"
$preExport = (Get-LatestInDownloads '*SCC*').LastWriteTime
npm run login 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
if ($LASTEXITCODE -ne 0) { Log 'FAILED: login.ts exited non-zero'; exit 1 }

# Export lands in downloads/ with a timestamped name. Wabtec returns CSV but
# occasionally XLSX — accept either and prefer the one written during this run.
$exportCandidates = @(
  Get-ChildItem -Path $downloadDir -Filter '*SCC*.csv'  -File -ErrorAction SilentlyContinue
  Get-ChildItem -Path $downloadDir -Filter '*SCC*.xlsx' -File -ErrorAction SilentlyContinue
) | Where-Object { -not $preExport -or $_.LastWriteTime -gt $preExport } |
    Sort-Object LastWriteTime -Descending

if (-not $exportCandidates) { Log 'FAILED: no new export file landed in downloads/'; exit 1 }
$exportFile = $exportCandidates[0]
Log "  Export file: $($exportFile.Name) ($([math]::Round($exportFile.Length / 1KB)) KB)"

# Dashboard expects wabtec-scc-po.csv specifically. If we got an XLSX, note it
# in the log — someone will need to convert or we accept the name change.
$destCsv = Join-Path $dashSampleDir 'wabtec-scc-po.csv'
Copy-Item -Force -Path $exportFile.FullName -Destination $destCsv
Log "  Copied to $destCsv"

# ---- Stage 2 — PO shipping details (scrape-po-details.ts) -------------------
Log "Stage 2/3: PO shipping details (scrape-po-details.ts)"
npm run scrape:po-details 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
if ($LASTEXITCODE -ne 0) { Log 'FAILED: scrape-po-details.ts exited non-zero'; exit 1 }

$detailsFile = Get-LatestInDownloads 'po-details-*.json'
if (-not $detailsFile) { Log 'FAILED: no po-details-*.json produced'; exit 1 }
Log "  Details file: $($detailsFile.Name) ($([math]::Round($detailsFile.Length / 1KB)) KB)"
Copy-Item -Force -Path $detailsFile.FullName -Destination (Join-Path $dashSampleDir 'wabtec-po-details.json')

# ---- Stage 3 — PO history (inspect-po-details.ts) ---------------------------
Log "Stage 3/3: PO revision history (inspect-po-details.ts)"
npm run inspect:po-details 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
if ($LASTEXITCODE -ne 0) { Log 'FAILED: inspect-po-details.ts exited non-zero'; exit 1 }

$historyFile = Get-LatestInDownloads 'po-history-*.json'
if (-not $historyFile) { Log 'FAILED: no po-history-*.json produced'; exit 1 }
Log "  History file: $($historyFile.Name) ($([math]::Round($historyFile.Length / 1KB)) KB)"
Copy-Item -Force -Path $historyFile.FullName -Destination (Join-Path $dashSampleDir 'po-history.json')

# ---- Publish: commit + push -------------------------------------------------
Log 'Publishing: git add / commit / push'
Set-Location $repoRoot

git add dashboard/public/sample-data/wabtec-scc-po.csv `
        dashboard/public/sample-data/wabtec-po-details.json `
        dashboard/public/sample-data/po-history.json 2>&1 |
  Tee-Object -FilePath $logFile -Append | Out-Null

$diff = git diff --cached --name-only
if (-not $diff) {
  Log '  No data changes vs yesterday — skipping commit/push.'
} else {
  $msg = "data: nightly scrape $runDate"
  git commit -m $msg 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { Log 'FAILED: git commit'; exit 1 }
  git push origin main 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { Log 'FAILED: git push'; exit 1 }
  Log "  Pushed. SWA rebuild will pick this up within ~3 min."
}

# ---- Cleanup — trim downloads/ to last 7 runs to keep disk bounded ----------
Get-ChildItem -Path $downloadDir -File | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip 21 | Remove-Item -Force -ErrorAction SilentlyContinue

Log "=== Nightly scrape complete ==="
