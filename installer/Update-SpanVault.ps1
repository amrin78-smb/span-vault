# SpanVault - Update Script
# Run as Administrator to update SpanVault to a newer version
# Stops services, pulls latest code, rebuilds, restarts

param(
  [string]$InstallDir = "C:\SpanVault",
  [string]$SourceDir  = ""   # Path to new SpanVault source. Defaults to current script directory.
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [!!] $msg" -ForegroundColor Yellow }

if (-not $SourceDir) { $SourceDir = $PSScriptRoot }

Write-Host "`n  SpanVault Updater" -ForegroundColor Blue
Write-Host "  ==================" -ForegroundColor Blue

$services = @("SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator","SpanVault-API")

Write-Step "Stopping SpanVault services"
foreach ($svc in $services) {
  try {
    Stop-Service -Name $svc -Force -ErrorAction Stop
    Write-OK "Stopped: $svc"
  } catch {
    Write-Warn "$svc was not running"
  }
}

Write-Step "Copying updated files"
Copy-Item -Recurse -Force "$SourceDir\backend\*"  "$InstallDir\backend\"
Copy-Item -Recurse -Force "$SourceDir\frontend\*" "$InstallDir\frontend\"
Copy-Item -Force "$SourceDir\scripts\*" "$InstallDir\scripts\"
Write-OK "Files updated"

Write-Step "Rebuilding backend"
Set-Location "$InstallDir\backend"
& npm install --omit=dev 2>&1 | Out-Null
& npm run build 2>&1 | Out-Null
Write-OK "Backend rebuilt"

Write-Step "Rebuilding frontend"
Set-Location "$InstallDir\frontend"
& npm install 2>&1 | Out-Null

$config = Get-Content "$InstallDir\config.json" | ConvertFrom-Json
$env:NEXT_PUBLIC_API_URL = "http://localhost:$($config.api.port)"
& npm run build 2>&1 | Out-Null
Write-OK "Frontend rebuilt"

Write-Step "Applying schema updates"
$psqlPath = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if ($psqlPath) {
  $env:PGPASSWORD = $config.database.password
  & $psqlPath -U $config.database.user -d $config.database.name -f "$InstallDir\scripts\schema.sql" 2>&1 | Out-Null
  Write-OK "Schema updated"
} else {
  Write-Warn "psql not found - schema update skipped"
}

Write-Step "Starting SpanVault services"
foreach ($svc in $services) {
  try {
    Start-Service -Name $svc -ErrorAction Stop
    Write-OK "Started: $svc"
  } catch {
    Write-Warn "Could not start $svc - check logs at $InstallDir\logs"
  }
}

Write-Host "`n  Update complete. SpanVault is running at http://localhost:$($config.api.port)`n" -ForegroundColor Green
