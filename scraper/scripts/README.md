# Nightly Scrape — Setup

Automates the three Wabtec SCC scrapers on a daily cadence and publishes the
fresh data **directly to the Azure Static Web App** via the SWA CLI (bypassing
GitHub Actions, which had been timing out on confirmation). Git is still
updated as a source-of-truth record.

## One-time setup (company machine)

```powershell
# 1. Scraper deps
cd ..\
npm install
npx playwright install chromium
Copy-Item .env.example .env  # edit with WABTEC_USERNAME / WABTEC_PASSWORD

# 2. Dashboard deps (used by the publish step's local build)
cd ..\dashboard
npm install

# 3. SWA deployment token — store as a persistent user env var on this machine.
#    Get the value from Azure Portal -> Static Web App -> Manage deployment token.
[Environment]::SetEnvironmentVariable('SWA_DEPLOYMENT_TOKEN', 'paste-token-here', 'User')

# 4. Verify git push works without prompting
cd ..
git push origin main --dry-run  # if this hangs, set up Credential Manager / PAT first
```

Then register the scheduled task (run PowerShell as Administrator):

```powershell
cd scraper\scripts
powershell -ExecutionPolicy Bypass -File .\register-scheduled-task.ps1
```

## What runs at midnight

`nightly-scrape.ps1` executes in sequence:

| Stage | What | Runtime |
|-------|------|---------|
| 1 | `login.ts` — PO Collaboration CSV export | ~2 min |
| 2 | `scrape-po-details.ts` — per-PO shipping JSON | ~30 min |
| 3 | `inspect-po-details.ts` — per-PO history JSON | ~4 hr |
| Publish A | `npm run build` + `swa deploy ./dist` direct to Azure | ~2 min |
| Publish B | `git add` / commit (`[skip ci]`) / push | ~10 sec |

The SWA deploy lands the data on the live URL within ~60s. The git push is
just for source tracking — `[skip ci]` in the commit message stops GitHub
Actions from running its own redundant deploy on top.

**Atomic:** if any stage fails (including the SWA deploy), the git commit
is skipped too — yesterday's data stays live until the issue is fixed.

**Notification email:** at the end of every run (success or failure), an
email is sent via Outlook COM to the user signed in to Outlook on this
machine. Subject: `[Wabtec / M2M] Nightly scrape SUCCESS|FAILED — YYYY-MM-DD`.
Body lists per-stage status, duration, pushed file list, commit SHA + GitHub
link, and the path to the day's log file. If Outlook isn't available the
email is silently skipped — the run itself isn't affected.

## Logs

Each run appends to `scraper/logs/YYYY-MM-DD.log`.

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
