# VELTRUVIA uptime watchdog — run from Task Scheduler every 15 minutes.
# Checks the public URL; on failure logs to file + Windows Event Log, so a
# persistent outage becomes visible even when the browser tab is closed.
$ErrorActionPreference = 'Continue'
$url = 'https://veltruvia.duckdns.org/health'
$logDir = 'C:\Users\Sara\Desktop\veltruvia-offsite-backups'
$log = Join-Path $logDir 'watchdog.log'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$ok = $false
try {
  $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
  $ok = ($resp.StatusCode -eq 200 -and $resp.Content -match '"ok":true')
} catch { $ok = $false }

$stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
Add-Content -Path $log -Value "$stamp ok=$ok"
if (-not $ok) {
  try {
    Write-EventLog -LogName Application -Source 'VELTRUVIA Watchdog' -EventId 1 `
      -EntryType Error -Message "VELTRUVIA public URL FAILED health check: $url" -ErrorAction Stop
  } catch {
    # Source not registered yet — create it once (needs no admin for Application log)
    if (-not [System.Diagnostics.EventLog]::SourceExists('VELTRUVIA Watchdog')) {
      [System.Diagnostics.EventLog]::CreateEventSource('VELTRUVIA Watchdog', 'Application')
    }
    try {
      Write-EventLog -LogName Application -Source 'VELTRUVIA Watchdog' -EventId 1 `
        -EntryType Error -Message "VELTRUVIA public URL FAILED health check: $url"
    } catch {}
  }
}
