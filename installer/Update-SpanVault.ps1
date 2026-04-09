# SpanVault - Update Script v2
# Pulls latest from GitHub and rebuilds backend + frontend
# Run as Administrator from C:\SpanVault\installer
# Usage: .\Update-SpanVault.ps1 -ServerIP "192.168.x.x"

param(
  [string]$InstallDir   = "C:\SpanVault",
  [string]$RepoUrl      = "https://github.com/amrin78-smb/span-vault.git",
  [string]$ServerIP     = "",
  [int]   $ApiPort      = 3001,
  [int]   $FrontendPort = 3002
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn([string]$msg) { Write-Host "    [!!] $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg) { Write-Host "    [XX] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  SpanVault - Update v2" -ForegroundColor Blue
Write-Host "  =====================" -ForegroundColor Blue
Write-Host ""

# Auto-detect server IP if not provided
if (-not $ServerIP) {
  $ServerIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169"
  } | Select-Object -First 1).IPAddress
  Write-OK "Auto-detected server IP: $ServerIP"
}

# Read existing config for DB credentials
$configPath = "$InstallDir\config.json"
if (-not (Test-Path $configPath)) { Write-Fail "config.json not found at $configPath. Run installer first." }
$config = Get-Content $configPath | ConvertFrom-Json

# ─── Step 1: Pull latest from GitHub ─────────────────────────────────────────
Write-Step "Pulling latest from GitHub"
$tempDir = "$env:TEMP\spanvault-update"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
$oldPref = $ErrorActionPreference; $ErrorActionPreference = "SilentlyContinue"
& git clone $RepoUrl $tempDir 2>&1 | Out-Null
$ErrorActionPreference = $oldPref
if (-not (Test-Path "$tempDir\backend")) { Write-Fail "Git clone failed. Check internet connection." }
Write-OK "Downloaded latest code"

# ─── Step 2: Stop services ───────────────────────────────────────────────────
Write-Step "Stopping services"
$allServices = @("SpanVault-Frontend","SpanVault-API","SpanVault-Aggregator","SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow")
foreach ($svc in $allServices) {
  Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
Write-OK "Services stopped"

# ─── Step 3: Update backend files (src/ → flat) ──────────────────────────────
Write-Step "Updating backend files"
$backendSrc = "$tempDir\backend\src"
Get-ChildItem $backendSrc -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
  $relative = $_.FullName.Substring($backendSrc.Length + 1)
  $dest = Join-Path "$InstallDir\backend" $relative
  New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
  Copy-Item -Force $_.FullName $dest
}
Write-OK "Backend source updated"

# ─── Step 4: Update frontend files (src/app → app, src/components → components, src/lib → lib) ──
Write-Step "Updating frontend files"
$frontendSrc = "$tempDir\frontend\src"

# app pages
Get-ChildItem "$frontendSrc\app" -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
  $relative = $_.FullName.Substring("$frontendSrc\app".Length + 1)
  $dest = Join-Path "$InstallDir\frontend\app" $relative
  New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
  Copy-Item -Force $_.FullName $dest
}

# components
if (Test-Path "$frontendSrc\components") {
  Get-ChildItem "$frontendSrc\components" -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $relative = $_.FullName.Substring("$frontendSrc\components".Length + 1)
    $dest = Join-Path "$InstallDir\frontend\components" $relative
    New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
    Copy-Item -Force $_.FullName $dest
  }
}

# lib
if (Test-Path "$frontendSrc\lib") {
  Get-ChildItem "$frontendSrc\lib" -Recurse | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
    $relative = $_.FullName.Substring("$frontendSrc\lib".Length + 1)
    $dest = Join-Path "$InstallDir\frontend\lib" $relative
    New-Item -ItemType Directory -Path (Split-Path $dest) -Force | Out-Null
    Copy-Item -Force $_.FullName $dest
  }
}

# Config files
@("next.config.js","tailwind.config.js","postcss.config.js","tsconfig.json") | ForEach-Object {
  $src = Join-Path "$tempDir\frontend" $_
  if (Test-Path $src) { Copy-Item -Force $src "$InstallDir\frontend\$_" }
}

# Fix tsconfig paths alias
$tsconfigRaw = Get-Content "$InstallDir\frontend\tsconfig.json" -Raw
$tsconfigRaw = $tsconfigRaw -replace '"@/\*":\s*\["./src/\*"\]', '"@/*": ["./*"]'
Set-Content "$InstallDir\frontend\tsconfig.json" $tsconfigRaw

# Remove output: standalone from next.config.js (causes silent build hangs on Windows)
$nextConfig = Get-Content "$InstallDir\frontend\next.config.js" -Raw
$nextConfig  = $nextConfig -replace "output:\s*['\"]standalone['\"],?\s*", ""
Set-Content "$InstallDir\frontend\next.config.js" $nextConfig

Write-OK "Frontend source updated"

# ─── Step 5: Update scripts ───────────────────────────────────────────────────
Copy-Item -Force "$tempDir\scripts\schema.sql" "$InstallDir\scripts\schema.sql"
Copy-Item -Force "$tempDir\scripts\seed.sql"   "$InstallDir\scripts\seed.sql"
Write-OK "Scripts updated"

# ─── Step 6: Apply schema updates ────────────────────────────────────────────
Write-Step "Applying schema updates"
$psqlPath = Get-ChildItem "C:\Program Files\PostgreSQL" -Recurse -Filter "psql.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
if ($psqlPath) {
  $env:PGPASSWORD = $config.database.password
  $env:PGOPTIONS  = "--client-min-messages=warning"
  $oldPref = $ErrorActionPreference; $ErrorActionPreference = "SilentlyContinue"
  & $psqlPath -U $config.database.user -d $config.database.name -v ON_ERROR_STOP=0 -f "$InstallDir\scripts\schema.sql" 2>&1 | Out-Null
  # Drop FK constraints that conflict with NetVault site IDs
  & $psqlPath -U $config.database.user -d $config.database.name -c "ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_site_id_fkey" 2>&1 | Out-Null
  & $psqlPath -U $config.database.user -d $config.database.name -c "ALTER TABLE topology_nodes DROP CONSTRAINT IF EXISTS topology_nodes_site_id_fkey" 2>&1 | Out-Null
  $ErrorActionPreference = $oldPref
  Write-OK "Schema updated"
} else {
  Write-Warn "psql not found — schema update skipped"
}

# ─── Step 7: Rebuild backend ──────────────────────────────────────────────────
Write-Step "Building backend"
Set-Location "$InstallDir\backend"

# Fix tsconfig for flat structure
@{
  compilerOptions = @{
    target="ES2020"; module="commonjs"; lib=@("ES2020")
    outDir="./dist"; rootDir="./"
    strict=$false; esModuleInterop=$true; skipLibCheck=$true; resolveJsonModule=$true
  }
  include = @("./**/*.ts")
  exclude = @("node_modules","dist")
} | ConvertTo-Json -Depth 5 | Set-Content "$InstallDir\backend\tsconfig.json"

& npm run build 2>&1 | Out-Null
if (-not (Test-Path "$InstallDir\backend\dist\index.js")) {
  Write-Fail "Backend build failed — dist\index.js not found. Check source files."
}
Write-OK "Backend built"

# ─── Step 8: Rebuild frontend ────────────────────────────────────────────────
Write-Step "Building frontend (2-3 minutes)"
Set-Location "$InstallDir\frontend"
Write-Host "    API URL: http://$ServerIP`:$($config.api.port)" -ForegroundColor Gray
$env:NEXT_PUBLIC_API_URL = "http://$ServerIP`:$($config.api.port)"
& npm run build 2>&1 | Out-Null
if (-not (Test-Path "$InstallDir\frontend\.next\BUILD_ID")) {
  Write-Fail "Frontend build failed — .next\BUILD_ID not found."
}
Write-OK "Frontend built"

# ─── Step 9: Start services ───────────────────────────────────────────────────
Write-Step "Starting services"
# Start backend services first, then frontend
$startOrder = @("SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator","SpanVault-API","SpanVault-Frontend")
foreach ($svc in $startOrder) {
  try {
    Start-Service -Name $svc
    Start-Sleep -Milliseconds 800
    $status = (Get-Service -Name $svc).Status
    Write-OK "$svc — $status"
  } catch {
    Write-Warn "Could not start $svc — check $InstallDir\logs\$svc-error.log"
  }
}

# ─── Cleanup ──────────────────────────────────────────────────────────────────
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  SpanVault updated successfully!" -ForegroundColor Green
Write-Host "  Dashboard: http://$ServerIP`:$FrontendPort" -ForegroundColor White
Write-Host ""
