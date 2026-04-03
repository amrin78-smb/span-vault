# SpanVault - Uninstaller
# Removes all SpanVault services, files, and database
# Leaves PostgreSQL, Node.js, and NSSM untouched
# Run as Administrator

param(
  [string]$InstallDir = "C:\SpanVault",
  [string]$DbUser     = "postgres",
  [string]$DbName     = "spanvault",
  [string]$DbPassword = "",
  [switch]$KeepDatabase,
  [switch]$KeepFiles
)

$ErrorActionPreference = "SilentlyContinue"

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [!!] $msg" -ForegroundColor Yellow }

# Check Admin
$current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Host "Please run this script as Administrator" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "  SpanVault Uninstaller" -ForegroundColor Red
Write-Host "  =====================" -ForegroundColor Red
Write-Host ""
Write-Host "  This will remove SpanVault from this machine." -ForegroundColor Yellow
Write-Host "  PostgreSQL, Node.js, and NSSM will NOT be touched." -ForegroundColor Yellow
Write-Host ""

$confirm = Read-Host "  Type YES to continue"
if ($confirm -ne "YES") {
  Write-Host "  Uninstall cancelled." -ForegroundColor Gray
  exit 0
}

# ─── Step 1: Stop and remove NSSM services ───────────────────────────────────
Write-Step "Stopping SpanVault services"

$services = @("SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator","SpanVault-API")

foreach ($svc in $services) {
  $existing = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
    Write-OK "Stopped: $svc"
  } else {
    Write-Warn "$svc was not installed - skipping"
  }
}

# Small wait to let services fully stop
Start-Sleep -Seconds 3

Write-Step "Removing NSSM service registrations"
$nssmPath = (Get-Command "nssm" -ErrorAction SilentlyContinue)?.Source
if (-not $nssmPath) {
  $nssmPath = "C:\Windows\System32\nssm.exe"
}

if (Test-Path $nssmPath) {
  foreach ($svc in $services) {
    & $nssmPath remove $svc confirm 2>&1 | Out-Null
    Write-OK "Removed service registration: $svc"
  }
} else {
  # Fall back to sc.exe if NSSM not found
  Write-Warn "NSSM not found - using sc.exe to remove services"
  foreach ($svc in $services) {
    & sc.exe delete $svc 2>&1 | Out-Null
    Write-OK "Removed: $svc"
  }
}

# ─── Step 2: Drop the database ───────────────────────────────────────────────
if (-not $KeepDatabase) {
  Write-Step "Dropping SpanVault database"

  if (-not $DbPassword) {
    $DbPassword = Read-Host "Enter PostgreSQL password for user '$DbUser' (or press Enter to skip)"
  }

  if ($DbPassword) {
    $psqlPath = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName

    if ($psqlPath) {
      $env:PGPASSWORD = $DbPassword
      # Terminate active connections first
      & $psqlPath -U $DbUser -d postgres -c `
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$DbName';" 2>&1 | Out-Null
      & $psqlPath -U $DbUser -d postgres -c "DROP DATABASE IF EXISTS $DbName;" 2>&1 | Out-Null
      Write-OK "Database '$DbName' dropped"
    } else {
      Write-Warn "psql.exe not found - database not dropped. Drop manually if needed:"
      Write-Warn "  DROP DATABASE $DbName;"
    }
  } else {
    Write-Warn "No password provided - database '$DbName' was NOT dropped"
    Write-Warn "Drop it manually if needed: DROP DATABASE $DbName;"
  }
} else {
  Write-Warn "Keeping database '$DbName' as requested"
}

# ─── Step 3: Remove install directory ────────────────────────────────────────
if (-not $KeepFiles) {
  Write-Step "Removing install directory: $InstallDir"
  if (Test-Path $InstallDir) {
    Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
    if (Test-Path $InstallDir) {
      Write-Warn "Could not fully remove $InstallDir - some files may be locked. Delete manually."
    } else {
      Write-OK "Removed: $InstallDir"
    }
  } else {
    Write-Warn "$InstallDir not found - skipping"
  }
} else {
  Write-Warn "Keeping files at $InstallDir as requested"
}

# ─── Done ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  SpanVault has been removed." -ForegroundColor Green
Write-Host ""
Write-Host "  The following were NOT removed:" -ForegroundColor Gray
Write-Host "    - PostgreSQL" -ForegroundColor Gray
Write-Host "    - Node.js" -ForegroundColor Gray
Write-Host "    - NSSM" -ForegroundColor Gray
if ($KeepDatabase) {
  Write-Host "    - Database '$DbName' (kept by request)" -ForegroundColor Gray
}
if ($KeepFiles) {
  Write-Host "    - Files at $InstallDir (kept by request)" -ForegroundColor Gray
}
Write-Host ""
