# Nightly Scrape — Setup

Automates the three Wabtec SCC scrapers on a daily cadence and publishes the
fresh data to the dashboard via `git push` (which triggers the Azure Static
Web Apps rebuild).

## One-time setup (company machine)

Run these from the scraper directory:

```powershell
cd ..\
npm install
npx playwright install chromium
Copy-Item .env.example .env  # then edit .env with real credentials
```

Verify git is configured to push without prompting:

```powershell
# If this hangs or prompts, you need to set up Windows Credential Manager
# or a GitHub personal access token first.
git push origin main --dry-run
```

Then register the scheduled task (run PowerShell as Administrator):

```powershell
cd scripts
powershell -ExecutionPolicy Bypass -File .\register-scheduled-task.ps1
```

## What runs at midnight

`nightly-scrape.ps1` executes in sequence:

| Stage | Script | Output | Runtime |
|-------|--------|--------|---------|
| 1 | `login.ts` | PO Collaboration CSV export | ~2 min |
| 2 | `scrape-po-details.ts` | Per-PO shipping address JSON | ~30 min |
| 3 | `inspect-po-details.ts` | Per-PO revision history JSON | ~4 hr |

After stage 3 succeeds, the three outputs are copied into
`dashboard/public/sample-data/`, committed, and pushed. The SWA rebuild
typically takes another 2–3 minutes.

**Atomic publish:** if any stage fails, the commit is skipped — yesterday's
data stays live in production until the issue is resolved.

## Logs

Each run appends to `scraper/logs/YYYY-MM-DD.log`. In the morning, check
either that file or the GitHub Actions tab in Wabtec_M2M to see if fresh data
went out.

## Verify / test

```powershell
# Confirm the task is registered
Get-ScheduledTask -TaskName 'Wabtec-M2M Nightly Scrape'

# Manually trigger a run right now (useful for first-time validation)
Start-ScheduledTask -TaskName 'Wabtec-M2M Nightly Scrape'

# Or just run the script directly (bypasses Task Scheduler, for debugging)
powershell -ExecutionPolicy Bypass -File .\nightly-scrape.ps1
```

## Unregister

```powershell
Unregister-ScheduledTask -TaskName 'Wabtec-M2M Nightly Scrape' -Confirm:$false
```
