# SpanVault - Service Status Check
# Quick health check for all SpanVault services and API

param([string]$ApiPort = 3001)

Write-Host "`n  SpanVault Service Status" -ForegroundColor Blue
Write-Host "  ========================`n" -ForegroundColor Blue

$services = @("SpanVault-SNMP","SpanVault-ICMP","SpanVault-Flow","SpanVault-Aggregator","SpanVault-API")

foreach ($svc in $services) {
  $s = Get-Service -Name $svc -ErrorAction SilentlyContinue
  if (-not $s) {
    Write-Host "  $svc" -NoNewline
    Write-Host "  NOT INSTALLED" -ForegroundColor Red
  } elseif ($s.Status -eq "Running") {
    Write-Host "  $svc" -NoNewline
    Write-Host "  Running" -ForegroundColor Green
  } else {
    Write-Host "  $svc" -NoNewline
    Write-Host "  $($s.Status)" -ForegroundColor Yellow
  }
}

Write-Host ""

# Check API health endpoint
try {
  $resp = Invoke-RestMethod -Uri "http://localhost:$ApiPort/health" -TimeoutSec 5
  Write-Host "  API Health: " -NoNewline
  Write-Host "OK - $($resp.service)" -ForegroundColor Green
} catch {
  Write-Host "  API Health: " -NoNewline
  Write-Host "UNREACHABLE" -ForegroundColor Red
}

Write-Host "`n  Dashboard: http://localhost:$ApiPort`n"
