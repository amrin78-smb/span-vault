# SpanVault - Update Script
# Pulls latest from GitHub and rebuilds backend + frontend
# Run as Administrator from any directory

param(
  [string]$InstallDir  = "C:\SpanVault",
  [string]$RepoUrl     = "https://github.com/amrin78-smb/span-vault.git",
  [string]$ServerIP    = "",
  [int]   $ApiPort     = 3001,
  [int]   $FrontendPort = 3002
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK([string]$msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Fail([string]$msg) { Write-Host "    [XX] $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  SpanVault - Update" -ForegroundColor Blue
Write-Host "  ==================" -ForegroundColor Blue
Write-Host ""

# Detect server IP if not provided
if (-not $ServerIP) {
  $ServerIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback" -and $_.IPAddress -notmatch "^169" } | Select-Object -First 1).IPAddress
}

# ─── Step 1: Pull latest from GitHub ─────────────────────────────────────────
Write-Step "Pulling latest from GitHub"
$tempDir = "$env:TEMP\spanvault-update"
if (Test-Path $tempDir) { Remove-Item -Recurse -Force $tempDir }
git clone $RepoUrl $tempDir 2>$null
Write-OK "Downloaded latest code"

# ─── Step 2: Stop services ───────────────────────────────────────────────────
Write-Step "Stopping services"
$services = @("SpanVault-Frontend","SpanVault-API","SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator")
foreach ($svc in $services) {
  Stop-Service -Name $svc -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
Write-OK "Services stopped"

# ─── Step 3: Update backend source files ─────────────────────────────────────
Write-Step "Updating backend files"
$backendSrc = "$tempDir\backend\src"
$backendDst = "$InstallDir\backend"

# Copy all TypeScript source files maintaining folder structure but flattened
Get-ChildItem "$backendSrc" -Recurse -Filter "*.ts" | ForEach-Object {
  $relative = $_.FullName.Substring($backendSrc.Length + 1)
  $dest = Join-Path $backendDst $relative
  $destDir = Split-Path $dest
  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item -Force $_.FullName $dest
}
Write-OK "Backend files updated"

# ─── Step 4: Update scripts ───────────────────────────────────────────────────
Write-Step "Updating database scripts"
Copy-Item -Force "$tempDir\scripts\schema.sql" "$InstallDir\scripts\schema.sql"
Copy-Item -Force "$tempDir\scripts\seed.sql"   "$InstallDir\scripts\seed.sql"
Write-OK "Scripts updated"

# ─── Step 5: Update frontend source files ────────────────────────────────────
Write-Step "Updating frontend files"
$frontendSrc = "$tempDir\frontend"

# Copy all frontend source files
Get-ChildItem "$frontendSrc" -Recurse -Exclude "node_modules",".next" | Where-Object { -not $_.PSIsContainer } | ForEach-Object {
  $relative = $_.FullName.Substring($frontendSrc.Length + 1)
  # Skip node_modules and .next
  if ($relative -notmatch "^node_modules" -and $relative -notmatch "^\.next") {
    $dest = Join-Path "$InstallDir\frontend" $relative
    $destDir = Split-Path $dest
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -Force $_.FullName $dest
  }
}

# Fix tsconfig paths alias
$tsconfigPath = "$InstallDir\frontend\tsconfig.json"
$tsconfigRaw = Get-Content $tsconfigPath -Raw
$tsconfigRaw = $tsconfigRaw -replace '"@/\*":\s*\["./src/\*"\]', '"@/*": ["./*"]'
Set-Content $tsconfigPath $tsconfigRaw
Write-OK "Frontend files updated"

# ─── Step 6: Rebuild backend ─────────────────────────────────────────────────
Write-Step "Building backend"
Set-Location "$InstallDir\backend"

# Fix tsconfig for flat structure
$backendTsconfig = @{
  compilerOptions = @{
    target = "ES2020"; module = "commonjs"; lib = @("ES2020")
    outDir = "./dist"; rootDir = "./"
    strict = $false; esModuleInterop = $true
    skipLibCheck = $true; resolveJsonModule = $true
  }
  include = @("./**/*.ts")
  exclude = @("node_modules","dist")
} | ConvertTo-Json -Depth 5
Set-Content "$InstallDir\backend\tsconfig.json" $backendTsconfig

npm run build 2>&1 | Out-Null
if (-not (Test-Path "$InstallDir\backend\dist\index.js")) {
  Write-Fail "Backend build failed"
}
Write-OK "Backend built"

# ─── Step 7: Rebuild frontend ────────────────────────────────────────────────
Write-Step "Building frontend (2-3 minutes)"
Set-Location "$InstallDir\frontend"
$env:NEXT_PUBLIC_API_URL = "http://$ServerIP`:$ApiPort"
npm run build 2>&1 | Out-Null
Write-OK "Frontend built"

# ─── Step 8: Start services ──────────────────────────────────────────────────
Write-Step "Starting services"
foreach ($svc in $services) {
  try {
    Start-Service -Name $svc
    Start-Sleep -Milliseconds 500
    Write-OK "$svc - $((Get-Service $svc).Status)"
  } catch {
    Write-Host "    [!!] Could not start $svc" -ForegroundColor Yellow
  }
}

# ─── Cleanup ─────────────────────────────────────────────────────────────────
Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "  SpanVault updated successfully!" -ForegroundColor Green
Write-Host "  Dashboard: http://$ServerIP`:$FrontendPort" -ForegroundColor White
Write-Host ""
