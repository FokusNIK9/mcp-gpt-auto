# autostart.ps1 — Установка автозапуска mcp-gpt-auto через Планировщик задач Windows
# Запустите от имени администратора

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$NodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodePath) {
    Write-Host "ОШИБКА: Node.js не найден. Установите Node.js и попробуйте снова." -ForegroundColor Red
    exit 1
}

$TaskName = "mcp-gpt-auto-bridge"
$ServerScript = Join-Path $ScriptDir "dist\action-bridge\server.js"

if (-not (Test-Path $ServerScript)) {
    Write-Host "ОШИБКА: $ServerScript не найден. Сначала выполните 'npm run build'" -ForegroundColor Red
    exit 1
}

# Читаем токен из .env или запрашиваем
$Token = $env:ACTION_BRIDGE_TOKEN
if (-not $Token) {
    if (Test-Path (Join-Path $ScriptDir ".env")) {
        $envContent = Get-Content (Join-Path $ScriptDir ".env")
        $tokenLine = $envContent | Where-Object { $_ -match "^ACTION_BRIDGE_TOKEN=" }
        if ($tokenLine) { $Token = ($tokenLine -split "=", 2)[1].Trim('"').Trim("'") }
    }
}
if (-not $Token) {
    $Token = Read-Host "Введите ACTION_BRIDGE_TOKEN"
}

# Удалить старую задачу если есть
schtasks /Delete /TN $TaskName /F 2>$null

# Создать bat-файл для запуска
$BatPath = Join-Path $ScriptDir "start-bridge.bat"
$BatContent = @"
@echo off
cd /d "$ScriptDir"
set ACTION_BRIDGE_TOKEN=$Token
set PORT=8787
"$NodePath" "$ServerScript"
"@
Set-Content -Path $BatPath -Value $BatContent -Encoding ASCII

# Создать задачу в Планировщике (запуск при входе пользователя)
schtasks /Create /TN $TaskName /TR "`"$BatPath`"" /SC ONLOGON /RL HIGHEST /F

Write-Host ""
Write-Host "Готово! Задача '$TaskName' создана в Планировщике." -ForegroundColor Green
Write-Host "Сервер будет запускаться автоматически при входе в систему." -ForegroundColor Green
Write-Host ""
Write-Host "Управление:" -ForegroundColor Cyan
Write-Host "  Запустить сейчас:  schtasks /Run /TN $TaskName"
Write-Host "  Остановить:        schtasks /End /TN $TaskName"
Write-Host "  Удалить:           schtasks /Delete /TN $TaskName /F"
Write-Host ""
