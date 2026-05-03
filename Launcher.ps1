# mcp-gpt-auto Unified Launcher
# Version: 1.0.0

$ErrorActionPreference = "Stop"
$PORT = 8787
$HOST_ADDR = "127.0.0.1"

function Write-Header($Text) {
    Write-Host "`n==== $Text ====" -ForegroundColor Cyan
}

function Write-Success($Text) {
    Write-Host "[+] $Text" -ForegroundColor Green
}

function Write-Info($Text) {
    Write-Host "[*] $Text" -ForegroundColor Gray
}

function Write-Warning($Text) {
    Write-Host "[!] $Text" -ForegroundColor Yellow
}

function Write-ErrorMsg($Text) {
    Write-Host "[X] $Text" -ForegroundColor Red
}

# 1. Check Port Availability
Write-Header "Checking Environment"
$existingProcess = Get-NetTCPConnection -LocalPort $PORT -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existingProcess) {
    $proc = Get-Process -Id $existingProcess.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
        if ($proc.Id -eq 0) {
            Write-Warning "Port $PORT is in transient state (System Idle). Please wait a few seconds..."
            Start-Sleep -Seconds 5
            return # Skip the rest of the check this time
        }
        Write-Warning "Port $PORT is already occupied by $($proc.ProcessName) (PID: $($proc.Id))"
        $choice = Read-Host "Do you want to stop this process? (y/n)"
        if ($choice -eq 'y') {
            Stop-Process -Id $proc.Id -Force
            Write-Success "Process stopped."
            Start-Sleep -Seconds 1
        } else {
            Write-ErrorMsg "Cannot start Bridge while port is occupied. Exiting."
            exit 1
        }
    }
} else {
    Write-Success "Port $PORT is free."
}

# 2. Extract Ngrok URL
Write-Header "Connecting to Ngrok"
try {
    $ngrokApi = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -ErrorAction SilentlyContinue
    $publicUrl = $ngrokApi.tunnels[0].public_url
    if ($publicUrl) {
        $env:ACTION_BRIDGE_PUBLIC_URL = $publicUrl
        Write-Success "Ngrok URL found: $publicUrl"
    } else {
        Write-Warning "Ngrok is running but no active tunnels found."
    }
} catch {
    Write-Warning "Ngrok is not running or API (4040) is unreachable."
    Write-Info "Bridge will start without a public URL (Local Mode)."
}

# 3. Validate Token
if (Test-Path ".env") {
    Write-Info "Loading environment from .env file..."
    Get-Content .env | Where-Object { $_ -match "=" -and $_ -notmatch "^#" } | ForEach-Object {
        $name, $value = $_.Split('=', 2)
        [System.Environment]::SetEnvironmentVariable($name.Trim(), $value.Trim())
    }
}

if (-not $env:ACTION_BRIDGE_TOKEN) {
    Write-Warning "ACTION_BRIDGE_TOKEN is not set in environment."
    $token = Read-Host "Please enter your Action Bridge Token"
    if ($token) {
        $env:ACTION_BRIDGE_TOKEN = $token
        Write-Success "Token set for this session."
    } else {
        Write-ErrorMsg "Token is required. Exiting."
        exit 1
    }
} else {
    Write-Success "Token found in environment."
}

# 4. Build Project
Write-Header "Building Project"
Write-Info "Checking for changes..."
# Basic change detection: if dist folder doesn't exist, we must build
if (-not (Test-Path "dist")) {
    Write-Info "Initial build required..."
    npm run build
} else {
    Write-Info "Skipping automatic build to save time. Run 'npm run build' manually if needed."
}

# 5. Launch Services
Write-Header "Launching Services"

# Start Runner as a Background Job (so it stays in Tabby/current shell)
Write-Info "Starting Task Runner (Background Job)..."
$runnerJob = Get-Job -Name "mcp-runner" -ErrorAction SilentlyContinue
if ($runnerJob) {
    Stop-Job $runnerJob
    Remove-Job $runnerJob
}
Start-Job -Name "mcp-runner" -ScriptBlock {
    param($path)
    cd $path
    node dist/runner/github-task-runner.js --loop
} -ArgumentList $PSScriptRoot

Write-Success "Runner is now running in the background."
Write-Info "To see Runner logs, type: Receive-Job -Name mcp-runner -Keep"

# Start Bridge in current window
Write-Info "Starting Action Bridge..."
Write-Info "Dashboard: http://${HOST_ADDR}:${PORT}/ui"
Write-Host "--------------------------------------------" -ForegroundColor DarkGray
node dist/action-bridge/server.js
