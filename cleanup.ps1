# mcp-gpt-auto Cleanup Tool v1.0
# Запуск: .\cleanup.ps1

$ErrorActionPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   mcp-gpt-auto — Очистка мусора" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Gather info ---
$logDir = Join-Path $projectRoot ".agent\logs"
$queueDirs = @("inbox", "running", "done", "failed") | ForEach-Object { Join-Path $projectRoot ".agent-queue\$_" }
$reportsDir = Join-Path $projectRoot ".agent-queue\reports"
$distDir = Join-Path $projectRoot "dist"
$cacheDir = Join-Path $projectRoot "node_modules\.cache"

function Get-DirSize($path) {
    if (Test-Path $path) {
        $size = (Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if ($size -gt 1MB) { return "{0:N1} MB" -f ($size / 1MB) }
        elseif ($size -gt 1KB) { return "{0:N0} KB" -f ($size / 1KB) }
        else { return "$size bytes" }
    }
    return "0 bytes"
}

function Get-FileCount($path) {
    if (Test-Path $path) {
        return (Get-ChildItem -Path $path -Recurse -File -ErrorAction SilentlyContinue).Count
    }
    return 0
}

# --- Menu ---
$options = @(
    @{ Name = "Логи агента"; Path = $logDir; Desc = "(.agent/logs/ — audit.jsonl и др.)" }
    @{ Name = "Очередь задач (done+failed)"; Path = "queue"; Desc = "(выполненные и неудачные задачи)" }
    @{ Name = "Отчёты задач"; Path = $reportsDir; Desc = "(.agent-queue/reports/)" }
    @{ Name = "Git: удалить merged ветки"; Path = "git-branches"; Desc = "(локальные ветки уже влитые в main)" }
    @{ Name = "Git: очистка (gc + prune)"; Path = "git-gc"; Desc = "(сжатие репозитория)" }
    @{ Name = "Node кэш"; Path = $cacheDir; Desc = "(node_modules/.cache/)" }
    @{ Name = "Пересборка (удалить dist/)"; Path = $distDir; Desc = "(потребует npm run build)" }
)

Write-Host "Что почистить?" -ForegroundColor Yellow
Write-Host ""

$selected = @{}
for ($i = 0; $i -lt $options.Count; $i++) {
    $opt = $options[$i]
    $size = ""
    if ($opt.Path -eq "queue") {
        $count = 0
        $doneDir = Join-Path $projectRoot ".agent-queue\done"
        $failedDir = Join-Path $projectRoot ".agent-queue\failed"
        if (Test-Path $doneDir) { $count += (Get-ChildItem $doneDir -ErrorAction SilentlyContinue).Count }
        if (Test-Path $failedDir) { $count += (Get-ChildItem $failedDir -ErrorAction SilentlyContinue).Count }
        $size = "($count задач)"
    } elseif ($opt.Path -eq "git-branches") {
        $branches = git -C $projectRoot branch --merged main 2>$null | Where-Object { $_ -notmatch "main|master|\*" }
        $size = "($($branches.Count) веток)"
    } elseif ($opt.Path -eq "git-gc") {
        $size = ""
    } elseif (Test-Path $opt.Path) {
        $size = "($(Get-DirSize $opt.Path), $(Get-FileCount $opt.Path) файлов)"
    } else {
        $size = "(пусто)"
    }

    Write-Host "  [$($i+1)] $($opt.Name) $size" -ForegroundColor White
    Write-Host "      $($opt.Desc)" -ForegroundColor DarkGray
    $selected[$i] = $false
}

Write-Host ""
Write-Host "  [A] Выбрать ВСЁ" -ForegroundColor Green
Write-Host "  [0] Отмена" -ForegroundColor Red
Write-Host ""

$input = Read-Host "Введи номера через пробел (1 3 5) или A для всего"

if ($input -eq "0" -or $input -eq "") {
    Write-Host "Отменено." -ForegroundColor Red
    exit
}

if ($input -eq "A" -or $input -eq "a" -or $input -eq "А" -or $input -eq "а") {
    for ($i = 0; $i -lt $options.Count; $i++) { $selected[$i] = $true }
} else {
    $nums = $input -split "\s+" | ForEach-Object { [int]$_ - 1 }
    foreach ($n in $nums) {
        if ($n -ge 0 -and $n -lt $options.Count) { $selected[$n] = $true }
    }
}

Write-Host ""
Write-Host "--- Начинаю очистку ---" -ForegroundColor Yellow
Write-Host ""

$totalFreed = 0

# 1. Логи агента
if ($selected[0]) {
    Write-Host "[1/7] Логи агента..." -NoNewline
    if (Test-Path $logDir) {
        $size = (Get-ChildItem $logDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Remove-Item "$logDir\*" -Recurse -Force -ErrorAction SilentlyContinue
        $totalFreed += $size
        Write-Host " ОЧИЩЕНО" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

# 2. Очередь задач
if ($selected[1]) {
    Write-Host "[2/7] Очередь (done+failed)..." -NoNewline
    $count = 0
    $doneDir = Join-Path $projectRoot ".agent-queue\done"
    $failedDir = Join-Path $projectRoot ".agent-queue\failed"
    if (Test-Path $doneDir) {
        $count += (Get-ChildItem $doneDir -ErrorAction SilentlyContinue).Count
        Remove-Item "$doneDir\*" -Recurse -Force -ErrorAction SilentlyContinue
    }
    if (Test-Path $failedDir) {
        $count += (Get-ChildItem $failedDir -ErrorAction SilentlyContinue).Count
        Remove-Item "$failedDir\*" -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host " $count задач удалено" -ForegroundColor Green
}

# 3. Отчёты
if ($selected[2]) {
    Write-Host "[3/7] Отчёты задач..." -NoNewline
    if (Test-Path $reportsDir) {
        $count = (Get-ChildItem $reportsDir -File -ErrorAction SilentlyContinue).Count
        Remove-Item "$reportsDir\*" -Force -ErrorAction SilentlyContinue
        Write-Host " $count отчётов удалено" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

# 4. Git merged branches
if ($selected[3]) {
    Write-Host "[4/7] Git merged ветки..." -NoNewline
    Push-Location $projectRoot
    $branches = git branch --merged main 2>$null | Where-Object { $_ -notmatch "main|master|\*" } | ForEach-Object { $_.Trim() }
    $count = 0
    foreach ($br in $branches) {
        if ($br) {
            git branch -d $br 2>$null | Out-Null
            $count++
        }
    }
    # Prune remote tracking refs
    git remote prune origin 2>$null | Out-Null
    Pop-Location
    Write-Host " $count веток удалено" -ForegroundColor Green
}

# 5. Git gc
if ($selected[4]) {
    Write-Host "[5/7] Git gc + prune..." -NoNewline
    Push-Location $projectRoot
    git gc --prune=now --quiet 2>$null
    Pop-Location
    Write-Host " готово" -ForegroundColor Green
}

# 6. Node cache
if ($selected[5]) {
    Write-Host "[6/7] Node кэш..." -NoNewline
    if (Test-Path $cacheDir) {
        $size = (Get-ChildItem $cacheDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Remove-Item $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
        $totalFreed += $size
        Write-Host " ОЧИЩЕНО" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

# 7. Dist
if ($selected[6]) {
    Write-Host "[7/7] dist/ (пересборка)..." -NoNewline
    if (Test-Path $distDir) {
        $size = (Get-ChildItem $distDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue
        $totalFreed += $size
        Write-Host " ОЧИЩЕНО (запусти npm run build!)" -ForegroundColor Yellow
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($totalFreed -gt 1MB) {
    Write-Host "  Освобождено: {0:N1} MB" -f ($totalFreed / 1MB) -ForegroundColor Green
} elseif ($totalFreed -gt 1KB) {
    Write-Host "  Освобождено: {0:N0} KB" -f ($totalFreed / 1KB) -ForegroundColor Green
}
Write-Host "  Готово!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
