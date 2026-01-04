# GXML Desktop Development Script
# Starts the frontend dev server AND Electron in dev mode
#
# Usage: .\dev.ps1
#
# This script:
# 1. Kills any existing processes on ports 5173/5174 (Vite)
# 2. Kills any existing GXML Electron processes
# 3. Starts the Vite dev server for hot reload
# 4. Waits for Vite to be ready
# 5. Starts Electron in dev mode pointing to Vite

$ErrorActionPreference = "SilentlyContinue"

Write-Host "🚀 Starting GXML Desktop in Development Mode" -ForegroundColor Green

# Function to kill processes on a specific port
function Stop-ProcessOnPort {
    param([int]$Port)
    
    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
    if ($connections) {
        foreach ($conn in $connections) {
            $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
            if ($proc -and $proc.Name -ne "System" -and $proc.Id -ne $PID) {
                Write-Host "  Killing $($proc.Name) (PID: $($proc.Id)) on port $Port" -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
            }
        }
    }
}

# Step 1: Clean up existing processes
Write-Host "`n🧹 Cleaning up existing processes..." -ForegroundColor Cyan

# Kill any GXML Electron processes
Get-Process -Name "GXML" -ErrorAction SilentlyContinue | Stop-Process -Force

# Kill processes on Vite ports (this prevents "Port in use" issues)
Write-Host "  Checking port 5173..." -ForegroundColor Gray
Stop-ProcessOnPort -Port 5173
Write-Host "  Checking port 5174..." -ForegroundColor Gray
Stop-ProcessOnPort -Port 5174

Start-Sleep -Seconds 1

# Get paths
$DesktopDir = $PSScriptRoot
$FrontendDir = Join-Path (Split-Path $DesktopDir -Parent) "frontend"

Write-Host "📁 Frontend: $FrontendDir" -ForegroundColor Gray
Write-Host "📁 Desktop: $DesktopDir" -ForegroundColor Gray

# Start frontend dev server in background
Write-Host "`n🔥 Starting Vite dev server..." -ForegroundColor Cyan
$viteJob = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    npm run dev 2>&1
} -ArgumentList $FrontendDir

# Wait for Vite to start (check for port listening, not HTTP response)
Write-Host "  Waiting for Vite server..." -ForegroundColor Gray
$vitePort = $null
$maxWait = 30
$waited = 0

while (-not $vitePort -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 1
    $waited++
    
    # Check if 5173 is listening
    $conn5173 = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
    if ($conn5173) {
        $vitePort = 5173
        break
    }
    
    # Check if 5174 is listening (Vite uses this if 5173 is taken)
    $conn5174 = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
    if ($conn5174) {
        $vitePort = 5174
        break
    }
    
    Write-Host "." -NoNewline -ForegroundColor Gray
}

if (-not $vitePort) {
    Write-Host "`n❌ Vite failed to start within $maxWait seconds" -ForegroundColor Red
    Write-Host "Check Vite output:" -ForegroundColor Yellow
    Receive-Job $viteJob
    Stop-Job $viteJob
    Remove-Job $viteJob
    exit 1
}

Write-Host "`n  ✅ Vite ready on port $vitePort" -ForegroundColor Green

# Start Electron in dev mode
Write-Host "`n⚡ Starting Electron in dev mode..." -ForegroundColor Cyan
Write-Host "  Electron loading from http://localhost:$vitePort" -ForegroundColor Gray
Write-Host "`n📝 Dev mode running! Frontend changes will hot-reload." -ForegroundColor Green
Write-Host "   Press Ctrl+C to stop.`n" -ForegroundColor Gray

Set-Location $DesktopDir
$env:NODE_ENV = "development"
$env:VITE_DEV_PORT = $vitePort

try {
    npm run start
} finally {
    # Cleanup on exit
    Write-Host "`n🛑 Shutting down..." -ForegroundColor Cyan
    Stop-Job $viteJob -ErrorAction SilentlyContinue
    Remove-Job $viteJob -ErrorAction SilentlyContinue
}
