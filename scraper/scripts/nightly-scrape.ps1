# Nightly scrape — pulls fresh data from Wabtec SCC and publishes it to the
# dashboard via git push (which triggers Azure Static Web Apps to rebuild).
#
# Runs three scrapers in sequence:
#   1. login.ts              — exports the full PO Collaboration grid as XLSX/CSV
#   2. scrape-po-details.ts  — scrapes per-PO shipping address / buyer / FOB
#   3. inspect-po-details.ts — scrapes per-PO revision history
#
# Total runtime: ~4.5 hours. Output is atomic: if any stage fails, the commit
# is skipped so yesterday's data stays in production until the problem is
# fixed. Either way, a notification email is sent at the end via Outlook COM.

$ErrorActionPreference = 'Stop'

# ---- Paths -------------------------------------------------------------------
$scraperRoot   = Resolve-Path "$PSScriptRoot\.."
$repoRoot      = Resolve-Path "$scraperRoot\.."
$dashboardDir  = Join-Path $repoRoot 'dashboard'
$dashSampleDir = Join-Path $dashboardDir 'public\sample-data'
$dashDistDir   = Join-Path $dashboardDir 'dist'
$downloadDir   = Join-Path $scraperRoot 'downloads'
$logDir        = Join-Path $scraperRoot 'logs'

New-Item -ItemType Directory -Force -Path $logDir        | Out-Null
New-Item -ItemType Directory -Force -Path $dashSampleDir | Out-Null

$runDate  = Get-Date -Format 'yyyy-MM-dd'
$startedAt = Get-Date
$logFile  = Join-Path $logDir "$runDate.log"

function Log($msg) {
  $ts = Get-Date -Format 'HH:mm:ss'
  $line = "[$ts] $msg"
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

# ---- Notification email via Outlook COM --------------------------------------
# Uses the user's already-signed-in Outlook profile — no app registration,
# no client secret, no SMTP config. Sends as you, to you. Best-effort: if
# Outlook isn't available, log and move on; we don't want a missing notify
# to fail an otherwise successful scrape.
function Send-NotificationEmail {
  param(
    [Parameter(Mandatory)][string]$Subject,
    [Parameter(Mandatory)][string]$Body
  )

  try {
    $outlook = New-Object -ComObject Outlook.Application
    $session = $outlook.Session

    # Primary SMTP of the first configured account = "myself" for the To line.
    $myEmail = $null
    if ($session.Accounts.Count -gt 0) {
      $myEmail = $session.Accounts.Item(1).SmtpAddress
    }
    if (-not $myEmail) {
      try { $myEmail = $session.CurrentUser.AddressEntry.GetExchangeUser().PrimarySmtpAddress } catch {}
    }
    if (-not $myEmail) {
      Log "  Notify: could not resolve current Outlook user — skipping email."
      return
    }

    $mail = $outlook.CreateItem(0)  # 0 = olMailItem
    $mail.Subject = $Subject
    $mail.To      = $myEmail
    $mail.Body    = $Body
    $mail.Send()
    Log "  Notify: email sent to $myEmail"
  } catch {
    # Don't blow up the run because we couldn't send a notification.
    Log "  Notify: email failed: $($_.Exception.Message)"
  } finally {
    if ($outlook) {
      [void][System.Runtime.Interopservices.Marshal]::ReleaseComObject($outlook)
    }
  }
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

# Tracker for the email body. Each stage flips its entry to OK or FAILED.
$stageStatus = [ordered]@{
  'Stage 1: grid export'         = 'pending'
  'Stage 2: PO shipping details' = 'pending'
  'Stage 3: PO history'          = 'pending'
  'Publish: SWA deploy'          = 'pending'
  'Publish: git push'            = 'pending'
}
$stageDetails = @{}
$failureReason = $null
$pushedFiles  = @()
$commitSha    = $null

try {
  # ---- Stage 1 — Grid export (login.ts) -------------------------------------
  Log "Stage 1/3: grid export (login.ts)"
  $preExport = (Get-LatestInDownloads '*SCC*').LastWriteTime
  npm run login 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'login.ts exited non-zero' }

  $exportCandidates = @(
    Get-ChildItem -Path $downloadDir -Filter '*SCC*.csv'  -File -ErrorAction SilentlyContinue
    Get-ChildItem -Path $downloadDir -Filter '*SCC*.xlsx' -File -ErrorAction SilentlyContinue
  ) | Where-Object { -not $preExport -or $_.LastWriteTime -gt $preExport } |
      Sort-Object LastWriteTime -Descending

  if (-not $exportCandidates) { throw 'no new export file landed in downloads/' }
  $exportFile = $exportCandidates[0]
  Log "  Export file: $($exportFile.Name) ($([math]::Round($exportFile.Length / 1KB)) KB)"

  $destCsv = Join-Path $dashSampleDir 'wabtec-scc-po.csv'
  Copy-Item -Force -Path $exportFile.FullName -Destination $destCsv
  Log "  Copied to $destCsv"
  $stageStatus['Stage 1: grid export'] = 'OK'
  $stageDetails['Stage 1: grid export'] = "$($exportFile.Name) ($([math]::Round($exportFile.Length / 1KB)) KB)"

  # ---- Stage 2 — PO shipping details (scrape-po-details.ts) -----------------
  Log "Stage 2/3: PO shipping details (scrape-po-details.ts)"
  npm run scrape:po-details 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'scrape-po-details.ts exited non-zero' }

  $detailsFile = Get-LatestInDownloads 'po-details-*.json'
  if (-not $detailsFile) { throw 'no po-details-*.json produced' }
  Log "  Details file: $($detailsFile.Name) ($([math]::Round($detailsFile.Length / 1KB)) KB)"
  Copy-Item -Force -Path $detailsFile.FullName -Destination (Join-Path $dashSampleDir 'wabtec-po-details.json')
  $stageStatus['Stage 2: PO shipping details'] = 'OK'
  $stageDetails['Stage 2: PO shipping details'] = "$($detailsFile.Name) ($([math]::Round($detailsFile.Length / 1KB)) KB)"

  # ---- Stage 3 — PO history (inspect-po-details.ts) -------------------------
  Log "Stage 3/3: PO revision history (inspect-po-details.ts)"
  npm run inspect:po-details 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'inspect-po-details.ts exited non-zero' }

  $historyFile = Get-LatestInDownloads 'po-history-*.json'
  if (-not $historyFile) { throw 'no po-history-*.json produced' }
  Log "  History file: $($historyFile.Name) ($([math]::Round($historyFile.Length / 1KB)) KB)"
  Copy-Item -Force -Path $historyFile.FullName -Destination (Join-Path $dashSampleDir 'po-history.json')
  $stageStatus['Stage 3: PO history'] = 'OK'
  $stageDetails['Stage 3: PO history'] = "$($historyFile.Name) ($([math]::Round($historyFile.Length / 1KB)) KB)"

  # ---- Publish step A: build + direct SWA CLI deploy ------------------------
  # GitHub Actions deploys via the Azure SWA action have been timing out on
  # confirmation, so we deploy straight to the SWA service from this machine.
  # Token comes from a stored env var ($env:SWA_DEPLOYMENT_TOKEN). To rotate:
  # Azure Portal -> Static Web App -> Manage deployment token -> Reset, then
  # update the env var on this machine.
  Log 'Publishing (A): building dashboard'
  Set-Location $dashboardDir
  if (-not (Test-Path (Join-Path $dashboardDir 'node_modules'))) {
    Log '  node_modules missing — running npm install (one-time on this machine)'
    npm install --prefer-offline --no-audit --no-fund 2>&1 |
      Tee-Object -FilePath $logFile -Append | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
  }
  npm run build 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'dashboard build failed' }
  if (-not (Test-Path $dashDistDir)) { throw 'dashboard build produced no dist/' }

  Log 'Publishing (A): swa deploy'
  $swaToken = $env:SWA_DEPLOYMENT_TOKEN
  if (-not $swaToken) { throw 'SWA_DEPLOYMENT_TOKEN env var not set on this machine' }
  npx -y `@azure/static-web-apps-cli deploy $dashDistDir `
    --deployment-token $swaToken --env production 2>&1 |
    Tee-Object -FilePath $logFile -Append | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'swa deploy failed' }
  Log '  SWA deploy succeeded — site is live with todays data.'
  $stageStatus['Publish: SWA deploy'] = 'OK'

  # ---- Publish step B: git commit + push for source tracking ---------------
  # Records the data snapshot in main so the repo matches what's live. Uses
  # [skip ci] in the commit message so GitHub Actions doesnt redundantly
  # try (and likely fail) its own SWA deploy on top of ours.
  Log 'Publishing (B): git add / commit / push'
  Set-Location $repoRoot

  git add dashboard/public/sample-data/wabtec-scc-po.csv `
          dashboard/public/sample-data/wabtec-po-details.json `
          dashboard/public/sample-data/po-history.json 2>&1 |
    Tee-Object -FilePath $logFile -Append | Out-Null

  $diff = git diff --cached --name-only
  if (-not $diff) {
    Log '  No data changes vs yesterday — skipping git commit/push.'
    $stageStatus['Publish: git push'] = 'skipped (no diff)'
  } else {
    $pushedFiles = @($diff -split "`n" | Where-Object { $_ })
    $msg = "data: nightly scrape $runDate [skip ci]"
    git commit -m $msg 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'git commit failed' }
    git push origin main 2>&1 | Tee-Object -FilePath $logFile -Append | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
    $commitSha = (git rev-parse --short HEAD) 2>$null
    Log "  Pushed $commitSha (with [skip ci] so GitHub Actions wont re-deploy)."
    $stageStatus['Publish: git push'] = "OK ($commitSha)"
  }
} catch {
  $failureReason = $_.Exception.Message
  Log "FAILED: $failureReason"
} finally {
  # ---- Cleanup — trim downloads/ to last 7 runs ---------------------------
  Get-ChildItem -Path $downloadDir -File | Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 21 | Remove-Item -Force -ErrorAction SilentlyContinue

  $endedAt  = Get-Date
  $duration = ($endedAt - $startedAt)
  $durStr   = '{0:hh\:mm\:ss}' -f $duration

  $isSuccess = -not $failureReason -and $stageStatus['Publish: SWA deploy'] -ne 'pending'
  $statusTag = if ($isSuccess) { 'SUCCESS' } else { 'FAILED' }

  $bodyLines = @(
    "Wabtec / M2M nightly scrape $statusTag for $runDate",
    "",
    "Started:  $($startedAt.ToString('yyyy-MM-dd HH:mm:ss'))",
    "Finished: $($endedAt.ToString('yyyy-MM-dd HH:mm:ss'))",
    "Duration: $durStr",
    ""
  )

  if ($failureReason) {
    $bodyLines += "FAILURE REASON: $failureReason"
    $bodyLines += ""
  }

  $bodyLines += "Stages:"
  foreach ($k in $stageStatus.Keys) {
    $line = "  - $k : $($stageStatus[$k])"
    if ($stageDetails.ContainsKey($k)) { $line += "    [$($stageDetails[$k])]" }
    $bodyLines += $line
  }

  if ($pushedFiles.Count -gt 0) {
    $bodyLines += ""
    $bodyLines += "Pushed files:"
    foreach ($f in $pushedFiles) { $bodyLines += "  - $f" }
    if ($commitSha) {
      $bodyLines += ""
      $bodyLines += "GitHub: https://github.com/Anthonyooo0/Wabtec_M2M/commit/$commitSha"
    }
  }

  $bodyLines += ""
  $bodyLines += "Log file: $logFile"

  $emailBody    = $bodyLines -join "`r`n"
  $emailSubject = "[Wabtec / M2M] Nightly scrape $statusTag — $runDate"

  Send-NotificationEmail -Subject $emailSubject -Body $emailBody
  Log "=== Nightly scrape complete ($statusTag) ==="

  if (-not $isSuccess) { exit 1 }
}
