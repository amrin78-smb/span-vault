# SpanVault - Windows Server Installer v3
# Installs SpanVault WAN Monitoring System on Windows Server
# Run as Administrator

param(
  [string]$InstallDir   = "C:\SpanVault",
  [string]$DbPassword   = "",
  [string]$DbUser       = "postgres",
  [string]$DbName       = "spanvault",
  [int]   $ApiPort      = 3001,
  [int]   $FrontendPort = 3002,
  [int]   $FlowPort     = 2055,
  [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "    [XX] $msg" -ForegroundColor Red; exit 1 }

# Check Admin
$current = [Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
if (-not $current.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Fail "Please run this script as Administrator"
}

Write-Host ""
Write-Host "  SpanVault WAN Monitoring System - Installer v3" -ForegroundColor Blue
Write-Host "  ================================================" -ForegroundColor Blue
Write-Host ""

if (-not $DbPassword) {
  $DbPassword = Read-Host "Enter PostgreSQL password for user '$DbUser'"
}

# ─── Step 1: Check Node.js (must be v20) ─────────────────────────────────────
Write-Step "Checking Node.js"
$nodeOk = $false
try {
  $nodeVersion = & node --version 2>&1
  $nodeMajor   = [int]($nodeVersion -replace "v(\d+)\..*", '$1')
  if ($nodeMajor -eq 20) {
    Write-OK "Node.js $nodeVersion (v20 - compatible)"
    $nodeOk = $true
  } elseif ($nodeMajor -gt 20) {
    Write-Warn "Node.js $nodeVersion detected (v$nodeMajor). Next.js 14 requires Node v20."
    Write-Warn "Installing Node v20 via nvm-windows..."
  } else {
    Write-Warn "Node.js $nodeVersion is too old. Installing v20..."
  }
} catch {
  Write-Warn "Node.js not found. Installing v20..."
}

if (-not $nodeOk) {
  # Try nvm first
  try {
    & nvm install 20 2>&1 | Out-Null
    & nvm use 20    2>&1 | Out-Null
    $nodeVersion = & node --version 2>&1
    Write-OK "Node.js $nodeVersion installed via nvm"
    $nodeOk = $true
  } catch {
    # Fall back to direct MSI install
    Write-Warn "nvm not found. Downloading Node.js v20 MSI..."
    $nodeInstaller = "$env:TEMP\node-v20-installer.msi"
    Invoke-WebRequest "https://nodejs.org/dist/v20.15.0/node-v20.15.0-x64.msi" -OutFile $nodeInstaller
    Start-Process msiexec -ArgumentList "/i `"$nodeInstaller`" /qn" -Wait
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + $env:PATH
    $nodeVersion = & node --version 2>&1
    Write-OK "Node.js $nodeVersion installed"
  }
}

# ─── Step 2: Check PostgreSQL ─────────────────────────────────────────────────
Write-Step "Checking PostgreSQL"
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pgService) { Write-Fail "PostgreSQL not found. Install from https://www.postgresql.org/download/windows/ then re-run." }
Write-OK "PostgreSQL service found: $($pgService.Name)"

$psqlPath = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $psqlPath) { Write-Fail "psql.exe not found." }
Write-OK "psql found: $psqlPath"

$pgBin = Split-Path $psqlPath
$env:PATH = $env:PATH + ";$pgBin"

# ─── Step 3: Check TimescaleDB ───────────────────────────────────────────────
Write-Step "Checking TimescaleDB"
$env:PGPASSWORD = $DbPassword
$tsdbCheck = & $psqlPath -U $DbUser -d postgres -t -c "SELECT name FROM pg_available_extensions WHERE name='timescaledb'" 2>&1
if ($tsdbCheck -notmatch "timescaledb") {
  Write-Fail "TimescaleDB not found. Install from https://docs.timescale.com/self-hosted/latest/install/installation-windows/ then re-run."
}
Write-OK "TimescaleDB available"

# ─── Step 4: Create Database ─────────────────────────────────────────────────
Write-Step "Creating SpanVault database"
$dbExists = & $psqlPath -U $DbUser -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>&1
if ($dbExists -match "1") {
  Write-OK "Database '$DbName' already exists"
} else {
  & $psqlPath -U $DbUser -d postgres -c "CREATE DATABASE $DbName;" 2>&1 | Out-Null
  Write-OK "Database '$DbName' created"
}

# ─── Step 5: Run Schema ──────────────────────────────────────────────────────
Write-Step "Running database schema"
$schemaPath = Join-Path (Split-Path $PSScriptRoot) "scripts\schema.sql"
& $psqlPath -U $DbUser -d $DbName -f $schemaPath 2>&1 | Out-Null
Write-OK "Schema applied"

# ─── Step 6: Seed Data ───────────────────────────────────────────────────────
if (-not $SkipSeed) {
  Write-Step "Loading sample seed data"
  $seedPath = Join-Path (Split-Path $PSScriptRoot) "scripts\seed.sql"
  & $psqlPath -U $DbUser -d $DbName -f $seedPath 2>&1 | Out-Null
  Write-OK "Seed data loaded"
}

# ─── Step 7: Create Directories ──────────────────────────────────────────────
Write-Step "Setting up directories"
@("$InstallDir", "$InstallDir\logs", "$InstallDir\scripts") | ForEach-Object {
  if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ | Out-Null }
}

$sourceRoot = Split-Path $PSScriptRoot
Copy-Item -Recurse -Force "$sourceRoot\backend\*"  "$InstallDir\backend\"
Copy-Item -Recurse -Force "$sourceRoot\frontend\*" "$InstallDir\frontend\"
Copy-Item -Force "$sourceRoot\scripts\*" "$InstallDir\scripts\"
Write-OK "Files copied to $InstallDir"

# ─── Step 8: Write config.json ───────────────────────────────────────────────
Write-Step "Writing config.json"
$config = @{
  database   = @{ host="localhost"; port=5432; name=$DbName; user=$DbUser; password=$DbPassword }
  api        = @{ port=$ApiPort; secret=[System.Guid]::NewGuid().ToString("N") }
  snmp       = @{ pollIntervalSeconds=60; community="public"; version="2c"; timeout=5000; retries=2; maxConcurrent=10 }
  icmp       = @{ criticalIntervalSeconds=15; normalIntervalSeconds=60; probesPerCycle=3; timeoutMs=2000 }
  flow       = @{ udpPort=$FlowPort; aggregationIntervalSeconds=60 }
  thresholds = @{ utilizationWarningPercent=70; utilizationCriticalPercent=80; latencyWarningMs=100; latencyCriticalMs=200; packetLossWarningPercent=1; packetLossCriticalPercent=5 }
  logging    = @{ level="info"; dir="$InstallDir\logs" }
} | ConvertTo-Json -Depth 5
Set-Content -Path "$InstallDir\config.json" -Value $config
Write-OK "config.json written"

# ─── Step 9: Backend npm install + build ─────────────────────────────────────
Write-Step "Installing backend packages"
Set-Location "$InstallDir\backend"
& npm install --omit=dev 2>&1 | Out-Null
Write-OK "Backend packages installed"

Write-Step "Building backend"
& npm run build 2>&1 | Out-Null
Write-OK "Backend built"

# ─── Step 10: Frontend npm install + build ───────────────────────────────────
Write-Step "Installing frontend packages"
Set-Location "$InstallDir\frontend"
& npm install 2>&1 | Out-Null
& npm install -D tailwindcss@3 postcss autoprefixer 2>&1 | Out-Null
Write-OK "Frontend packages installed"

Write-Step "Building frontend (this takes 2-3 minutes)"
$env:NEXT_PUBLIC_API_URL = "http://localhost:$ApiPort"
& npm run build 2>&1 | Out-Null
Write-OK "Frontend built"

Write-Step "Copying frontend static files"
$standalonePath = "$InstallDir\frontend\.next\standalone"
if (Test-Path $standalonePath) {
  Copy-Item -Recurse -Force "$InstallDir\frontend\.next\static"  "$standalonePath\.next\static"
  Copy-Item -Recurse -Force "$InstallDir\frontend\public"        "$standalonePath\public" -ErrorAction SilentlyContinue
  Write-OK "Static files copied"
} else {
  Write-Warn "Standalone folder not found - frontend will run via 'next start' instead"
}

# ─── Step 11: NSSM ───────────────────────────────────────────────────────────
Write-Step "Checking NSSM"
$nssmCmd = Get-Command "nssm" -ErrorAction SilentlyContinue
if (-not $nssmCmd) { Write-Fail "NSSM not found. Download nssm.exe from https://nssm.cc and place in C:\Windows\System32\ then re-run." }
Write-OK "NSSM found"

$nodePath = (Get-Command "node").Source
$logDir   = "$InstallDir\logs"

$services = @(
  @{ Name="SpanVault-SNMP";       Script="dist/services/snmp/poller.js";       Env="SPANVAULT_SERVICE=snmp-poller;SPANVAULT_LOG_DIR=$logDir" },
  @{ Name="SpanVault-ICMP";       Script="dist/services/icmp/monitor.js";      Env="SPANVAULT_SERVICE=icmp-monitor;SPANVAULT_LOG_DIR=$logDir" },
  @{ Name="SpanVault-Flow";       Script="dist/services/flow/collector.js";    Env="SPANVAULT_SERVICE=flow-collector;SPANVAULT_LOG_DIR=$logDir" },
  @{ Name="SpanVault-Aggregator"; Script="dist/services/aggregator/worker.js"; Env="SPANVAULT_SERVICE=aggregator;SPANVAULT_LOG_DIR=$logDir" },
  @{ Name="SpanVault-API";        Script="dist/index.js";                      Env="SPANVAULT_SERVICE=api;SPANVAULT_LOG_DIR=$logDir" }
)

Write-Step "Registering backend services"
foreach ($svc in $services) {
  $existing = Get-Service -Name $svc.Name -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
    & nssm remove $svc.Name confirm 2>&1 | Out-Null
  }
  & nssm install $svc.Name $nodePath "$InstallDir\backend\$($svc.Script)"
  & nssm set     $svc.Name AppDirectory        "$InstallDir\backend"
  & nssm set     $svc.Name AppEnvironmentExtra $svc.Env
  & nssm set     $svc.Name AppStdout           "$logDir\$($svc.Name).log"
  & nssm set     $svc.Name AppStderr           "$logDir\$($svc.Name)-error.log"
  & nssm set     $svc.Name AppRotateFiles      1
  & nssm set     $svc.Name AppRotateBytes      10485760
  & nssm set     $svc.Name Start               SERVICE_AUTO_START
  Write-OK "Registered: $($svc.Name)"
}

# Frontend service — use standalone server.js if it exists, otherwise next start
Write-Step "Registering frontend service"
$existing = Get-Service -Name "SpanVault-Frontend" -ErrorAction SilentlyContinue
if ($existing) {
  Stop-Service -Name "SpanVault-Frontend" -Force -ErrorAction SilentlyContinue
  & nssm remove "SpanVault-Frontend" confirm 2>&1 | Out-Null
}

$standalonServer = "$InstallDir\frontend\.next\standalone\server.js"
if (Test-Path $standalonServer) {
  & nssm install "SpanVault-Frontend" $nodePath $standalonServer
  & nssm set     "SpanVault-Frontend" AppDirectory "$InstallDir\frontend\.next\standalone"
} else {
  # Fallback: run via next start
  $nextBin = "$InstallDir\frontend\node_modules\.bin\next"
  & nssm install "SpanVault-Frontend" $nodePath "$nextBin"
  & nssm set     "SpanVault-Frontend" AppParameters "start -p $FrontendPort"
  & nssm set     "SpanVault-Frontend" AppDirectory  "$InstallDir\frontend"
}
& nssm set "SpanVault-Frontend" AppEnvironmentExtra "PORT=$FrontendPort;NEXT_PUBLIC_API_URL=http://localhost:$ApiPort;SPANVAULT_LOG_DIR=$logDir"
& nssm set "SpanVault-Frontend" AppStdout           "$logDir\SpanVault-Frontend.log"
& nssm set "SpanVault-Frontend" AppStderr           "$logDir\SpanVault-Frontend-error.log"
& nssm set "SpanVault-Frontend" Start               SERVICE_AUTO_START
Write-OK "Registered: SpanVault-Frontend"

# ─── Step 12: Start all services ─────────────────────────────────────────────
Write-Step "Starting all services"
$allServices = @("SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator","SpanVault-API","SpanVault-Frontend")
foreach ($svc in $allServices) {
  try {
    & nssm start $svc 2>&1 | Out-Null
    Start-Sleep -Milliseconds 500
    $status = (Get-Service -Name $svc).Status
    Write-OK "Started: $svc ($status)"
  } catch {
    Write-Warn "Could not start $svc - check logs at $logDir"
  }
}

# ─── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  SpanVault installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Dashboard:   http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  API:         http://localhost:$ApiPort"       -ForegroundColor White
Write-Host "  NetFlow UDP: port $FlowPort"                  -ForegroundColor White
Write-Host "  Logs:        $logDir"                         -ForegroundColor White
Write-Host ""
Write-Host "  Manage services:" -ForegroundColor Gray
Write-Host "    nssm status SpanVault-API" -ForegroundColor Gray
Write-Host "    nssm restart SpanVault-Frontend" -ForegroundColor Gray
Write-Host ""
