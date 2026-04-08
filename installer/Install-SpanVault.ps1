# SpanVault - Windows Server Installer v4
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
Write-Host "  SpanVault WAN Monitoring System - Installer v4" -ForegroundColor Blue
Write-Host "  ================================================" -ForegroundColor Blue
Write-Host ""

if (-not $DbPassword) {
  $DbPassword = Read-Host "Enter PostgreSQL password for user '$DbUser'"
}

# ─── Step 1: Check Node.js (must be v20) ─────────────────────────────────────
Write-Step "Checking Node.js"
try {
  $nodeVersion = & node --version 2>&1
  $nodeMajor   = [int]($nodeVersion -replace "v(\d+)\..*", '$1')
  if ($nodeMajor -eq 20) {
    Write-OK "Node.js $nodeVersion (v20 - compatible)"
  } elseif ($nodeMajor -gt 20) {
    Write-Warn "Node.js $nodeVersion detected. Next.js 14 requires Node v20. Switching..."
    try { & nvm install 20 2>&1 | Out-Null; & nvm use 20 2>&1 | Out-Null; Write-OK "Switched to Node v20 via nvm" }
    catch { Write-Warn "Could not switch via nvm. Build may hang. Install Node v20 manually if issues occur." }
  } else {
    Write-Warn "Node.js $nodeVersion is too old. Please install v20 from nodejs.org"
  }
} catch {
  Write-Fail "Node.js not found. Install from https://nodejs.org/en/download (v20 LTS)"
}

# ─── Step 2: Check PostgreSQL ─────────────────────────────────────────────────
Write-Step "Checking PostgreSQL"
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $pgService) { Write-Fail "PostgreSQL not found. Install from https://www.postgresql.org/download/windows/" }
Write-OK "PostgreSQL service: $($pgService.Name)"

$psqlPath = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if (-not $psqlPath) { Write-Fail "psql.exe not found in PostgreSQL installation" }
Write-OK "psql: $psqlPath"

$pgBin = Split-Path $psqlPath
$env:PATH = $env:PATH + ";$pgBin"
$env:PGPASSWORD = $DbPassword

# ─── Step 3: Create Database ─────────────────────────────────────────────────
Write-Step "Creating database"
$dbExists = & $psqlPath -U $DbUser -d postgres -t -c "SELECT 1 FROM pg_database WHERE datname='$DbName'" 2>&1
if ($dbExists -match "1") {
  Write-OK "Database '$DbName' already exists"
} else {
  & $psqlPath -U $DbUser -d postgres -c "CREATE DATABASE $DbName;" 2>&1 | Out-Null
  Write-OK "Database '$DbName' created"
}

# ─── Step 4: Run Schema ──────────────────────────────────────────────────────
Write-Step "Running database schema"
$sourceRoot = Split-Path $PSScriptRoot
$schemaPath = Join-Path $sourceRoot "scripts\schema.sql"
$env:PGOPTIONS = "--client-min-messages=warning"
$schemaOut = & cmd /c "`"$psqlPath`" -U $DbUser -d $DbName -v ON_ERROR_STOP=0 -f `"$schemaPath`" 2>&1"
Write-OK "Schema applied"

# ─── Step 5: Seed Data ───────────────────────────────────────────────────────
if (-not $SkipSeed) {
  Write-Step "Loading seed data"
  $seedPath = Join-Path $sourceRoot "scripts\seed.sql"
  & $psqlPath -U $DbUser -d $DbName -v ON_ERROR_STOP=0 -f $seedPath 2>&1 | Out-Null
  Write-OK "Seed data loaded"
}

# ─── Step 6: Create Directories & Copy Files ─────────────────────────────────
Write-Step "Setting up installation directory"
@("$InstallDir", "$InstallDir\logs", "$InstallDir\scripts") | ForEach-Object {
  New-Item -ItemType Directory -Path $_ -Force | Out-Null
}
Copy-Item -Recurse -Force "$sourceRoot\backend\*"  "$InstallDir\backend\"
Copy-Item -Recurse -Force "$sourceRoot\frontend\*" "$InstallDir\frontend\"
Copy-Item -Force "$sourceRoot\scripts\*"           "$InstallDir\scripts\"
Write-OK "Files copied to $InstallDir"

# ─── Step 7: Write config.json ───────────────────────────────────────────────
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

# ─── Step 8: Backend npm install + build ─────────────────────────────────────
Write-Step "Installing backend packages"
Set-Location "$InstallDir\backend"
& npm install --omit=dev 2>&1 | Out-Null
& npm install -D typescript 2>&1 | Out-Null
Write-OK "Backend packages installed"

Write-Step "Building backend"
& npm run build 2>&1 | Out-Null
if (-not (Test-Path "$InstallDir\backend\dist\index.js")) {
  Write-Fail "Backend build failed - dist\index.js not found"
}
Write-OK "Backend built"

# ─── Step 9: Frontend npm install + build ───────────────────────────────────
Write-Step "Installing frontend packages"
Set-Location "$InstallDir\frontend"
& npm install 2>&1 | Out-Null
& npm install -D tailwindcss@3 postcss autoprefixer 2>&1 | Out-Null
Write-OK "Frontend packages installed"

# Fix tsconfig paths alias (files copied flat, not in src/)
$tsconfigPath = "$InstallDir\frontend\tsconfig.json"
$tsconfigRaw = Get-Content $tsconfigPath -Raw
$tsconfigRaw = $tsconfigRaw -replace '"@/\*":\s*\["./src/\*"\]', '"@/*": ["./*"]'
Set-Content $tsconfigPath $tsconfigRaw
Write-OK "Fixed tsconfig paths alias"

Write-Step "Building frontend (2-3 minutes)"
$env:NEXT_PUBLIC_API_URL = "http://localhost:$ApiPort"
& npm run build 2>&1 | Out-Null
Write-OK "Frontend built"

# ─── Step 10: NSSM Services ──────────────────────────────────────────────────
Write-Step "Checking NSSM"
if (-not (Get-Command "nssm" -ErrorAction SilentlyContinue)) {
  Write-Fail "NSSM not found. Download nssm.exe from https://nssm.cc and place in C:\Windows\System32\"
}
Write-OK "NSSM found"

$nodePath = (Get-Command "node").Source
$logDir   = "$InstallDir\logs"

$services = @(
  @{ Name="SpanVault-SNMP";       Script="dist/services/snmp/poller.js" },
  @{ Name="SpanVault-ICMP";       Script="dist/services/icmp/monitor.js" },
  @{ Name="SpanVault-Flow";       Script="dist/services/flow/collector.js" },
  @{ Name="SpanVault-Aggregator"; Script="dist/services/aggregator/worker.js" },
  @{ Name="SpanVault-API";        Script="dist/index.js" }
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
  & nssm set     $svc.Name AppEnvironmentExtra "SPANVAULT_LOG_DIR=$logDir"
  & nssm set     $svc.Name AppStdout           "$logDir\$($svc.Name).log"
  & nssm set     $svc.Name AppStderr           "$logDir\$($svc.Name)-error.log"
  & nssm set     $svc.Name AppRotateFiles      1
  & nssm set     $svc.Name AppRotateBytes      10485760
  & nssm set     $svc.Name Start               SERVICE_AUTO_START
  Write-OK "Registered: $($svc.Name)"
}

Write-Step "Registering frontend service"
$existing = Get-Service -Name "SpanVault-Frontend" -ErrorAction SilentlyContinue
if ($existing) {
  Stop-Service -Name "SpanVault-Frontend" -Force -ErrorAction SilentlyContinue
  & nssm remove "SpanVault-Frontend" confirm 2>&1 | Out-Null
}
# Use full node.exe path with next binary as argument - avoids NSSM module resolution issues
$nodeExe = (Get-Command "node").Source
& nssm install "SpanVault-Frontend" $nodeExe "$InstallDir\frontend\node_modules\next\dist\bin\next start -p $FrontendPort"
& nssm set     "SpanVault-Frontend" AppDirectory           "$InstallDir\frontend"
& nssm set     "SpanVault-Frontend" AppEnvironmentExtra    "PORT=$FrontendPort;NEXT_PUBLIC_API_URL=http://localhost:$ApiPort"
& nssm set     "SpanVault-Frontend" AppStdout              "$logDir\SpanVault-Frontend.log"
& nssm set     "SpanVault-Frontend" AppStderr              "$logDir\SpanVault-Frontend-error.log"
& nssm set     "SpanVault-Frontend" Start                  SERVICE_AUTO_START
Write-OK "Registered: SpanVault-Frontend"

# ─── Step 11: Firewall Rules ─────────────────────────────────────────────────
Write-Step "Adding firewall rules"
New-NetFirewallRule -DisplayName "SpanVault API"      -Direction Inbound -Protocol TCP -LocalPort $ApiPort      -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "SpanVault Frontend" -Direction Inbound -Protocol TCP -LocalPort $FrontendPort -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "SpanVault NetFlow"  -Direction Inbound -Protocol UDP -LocalPort $FlowPort     -Action Allow -ErrorAction SilentlyContinue | Out-Null
Write-OK "Firewall rules added"

# ─── Step 12: Start Services ─────────────────────────────────────────────────
Write-Step "Starting all services"
$allServices = @("SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator","SpanVault-API","SpanVault-Frontend")
foreach ($svc in $allServices) {
  try {
    Start-Service -Name $svc
    Start-Sleep -Seconds 2
    $status = (Get-Service -Name $svc).Status
    Write-OK "$svc - $status"
  } catch {
    Write-Warn "Could not start $svc - check $logDir\$svc-error.log"
  }
}

# ─── Done ─────────────────────────────────────────────────────────────────────
$serverIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169" } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "  SpanVault installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Local:   http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  Network: http://$serverIP`:$FrontendPort" -ForegroundColor White
Write-Host "  API:     http://localhost:$ApiPort" -ForegroundColor White
Write-Host "  Logs:    $logDir" -ForegroundColor White
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor Gray
Write-Host "  1. Delete seed devices and add your real network devices" -ForegroundColor Gray
Write-Host "  2. Configure routers to export NetFlow to UDP $FlowPort" -ForegroundColor Gray
Write-Host "  3. Set correct SNMP community strings per device" -ForegroundColor Gray
Write-Host ""
