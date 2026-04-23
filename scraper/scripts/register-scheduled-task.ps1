# Registers a Windows Task Scheduler entry that runs nightly-scrape.ps1
# every day at 12:00 AM local time. Run this ONCE (as administrator) on the
# company machine that will host the nightly job.
#
# Usage (right-click → Run with PowerShell, or):
#   powershell -ExecutionPolicy Bypass -File .\register-scheduled-task.ps1

$ErrorActionPreference = 'Stop'

$taskName   = 'Wabtec-M2M Nightly Scrape'
$scriptPath = (Resolve-Path "$PSScriptRoot\nightly-scrape.ps1").Path
$workingDir = (Resolve-Path "$PSScriptRoot\..").Path

Write-Host "Registering scheduled task:"
Write-Host "  Name:    $taskName"
Write-Host "  Script:  $scriptPath"
Write-Host "  Runs:    Daily at 12:00 AM local time"
Write-Host "  WorkDir: $workingDir"
Write-Host ""

# Remove the task if it already exists, so this script is idempotent.
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
  Write-Host "Removing existing task with the same name..."
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# The action: run PowerShell 7 (pwsh) if present, else Windows PowerShell.
# -NoProfile keeps it lean; -ExecutionPolicy Bypass is needed because the
# script isn't signed.
$pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $pwsh) { $pwsh = "$Env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" }

$action = New-ScheduledTaskAction `
  -Execute $pwsh `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" `
  -WorkingDirectory $workingDir

$trigger = New-ScheduledTaskTrigger -Daily -At '12:00AM'

# Run whether the user is logged in or not, with highest privileges so git
# push works without UAC interruption. Wake the computer if needed.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 8) `
  -RestartCount 1 `
  -RestartInterval (New-TimeSpan -Minutes 15)

# Use the currently-logged-in user so git credentials (Windows Credential
# Manager) resolve the same way they do in a normal PowerShell session.
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType S4U `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Runs the 3 Wabtec SCC scrapers nightly, copies fresh data into the dashboard, and git-pushes to trigger an Azure SWA rebuild.' | Out-Null

Write-Host ""
Write-Host "Done. Verify with:  Get-ScheduledTask -TaskName `"$taskName`""
Write-Host "Run manually with:  Start-ScheduledTask -TaskName `"$taskName`""
