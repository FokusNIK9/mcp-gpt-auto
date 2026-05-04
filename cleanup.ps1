# mcp-gpt-auto Cleanup Tool v2.0
# Запуск: .\cleanup.ps1

$ErrorActionPreference = "SilentlyContinue"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   mcp-gpt-auto — Очистка мусора v2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# --- Helper functions ---
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

function Add-ToGitignore($pattern) {
    $gitignore = Join-Path $projectRoot ".gitignore"
    $content = ""
    if (Test-Path $gitignore) { $content = Get-Content $gitignore -Raw }
    if ($content -notmatch [regex]::Escape($pattern)) {
        Add-Content -Path $gitignore -Value $pattern
    }
}

# --- Paths ---
$logDir = Join-Path $projectRoot ".agent\logs"
$distDir = Join-Path $projectRoot "dist"
$cacheDir = Join-Path $projectRoot "node_modules\.cache"
$screenshotsDir = Join-Path $projectRoot "screenshots"
$rootScreenshot = Join-Path $projectRoot "screenshot.png"

# Old files that are no longer needed in the repo
$oldFiles = @(
    "action-promt2.txt",
    "main-plan.md",
    "local-screenshot.skill"
)

# --- Menu ---
Write-Host "  --- ЛОКАЛЬНАЯ ОЧИСТКА ---" -ForegroundColor Magenta
Write-Host ""

$options = @(
    @{ Name = "Логи агента"; Type = "local"; Path = $logDir; Desc = "(.agent/logs/ — audit.jsonl и др.)" }
    @{ Name = "Очередь задач (done+failed)"; Type = "local"; Path = "queue"; Desc = "(выполненные и неудачные задачи)" }
    @{ Name = "Отчёты задач"; Type = "local"; Path = "reports"; Desc = "(.agent-queue/reports/)" }
    @{ Name = "Node кэш"; Type = "local"; Path = $cacheDir; Desc = "(node_modules/.cache/)" }
    @{ Name = "Пересборка (удалить dist/)"; Type = "local"; Path = $distDir; Desc = "(потребует npm run build)" }
)

$gitOptions = @(
    @{ Name = "Скриншоты из репо"; Type = "git-screenshots"; Path = $screenshotsDir; Desc = "(screenshots/ + screenshot.png — удалит из git + .gitignore)" }
    @{ Name = "Старые файлы из репо"; Type = "git-oldfiles"; Path = "oldfiles"; Desc = "(action-promt2.txt, main-plan.md, local-screenshot.skill)" }
    @{ Name = "Git: merged ветки (локальные + remote)"; Type = "git-branches"; Path = "git-branches"; Desc = "(удалит ветки уже влитые в main)" }
    @{ Name = "Git: очистка (gc + prune)"; Type = "git-gc"; Path = "git-gc"; Desc = "(сжатие репозитория)" }
)

$allOptions = $options + $gitOptions
$selected = @{}

# Show local options
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
    } elseif ($opt.Path -eq "reports") {
        $rDir = Join-Path $projectRoot ".agent-queue\reports"
        if (Test-Path $rDir) {
            $size = "($(Get-FileCount $rDir) отчётов)"
        } else {
            $size = "(пусто)"
        }
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
Write-Host "  --- GIT / GITHUB ---" -ForegroundColor Magenta
Write-Host ""

# Show git options
for ($j = 0; $j -lt $gitOptions.Count; $j++) {
    $i = $options.Count + $j
    $opt = $gitOptions[$j]
    $size = ""

    if ($opt.Type -eq "git-screenshots") {
        $gitFiles = @()
        Push-Location $projectRoot
        $gitFiles = git ls-files "screenshots/" "screenshot.png" 2>$null
        Pop-Location
        $fCount = ($gitFiles | Where-Object { $_ }).Count
        if ($fCount -gt 0) {
            $totalSize = 0
            foreach ($f in $gitFiles) {
                $fp = Join-Path $projectRoot $f
                if (Test-Path $fp) { $totalSize += (Get-Item $fp).Length }
            }
            if ($totalSize -gt 1MB) { $sizeStr = "{0:N1} MB" -f ($totalSize / 1MB) }
            elseif ($totalSize -gt 1KB) { $sizeStr = "{0:N0} KB" -f ($totalSize / 1KB) }
            else { $sizeStr = "$totalSize bytes" }
            $size = "($fCount файлов, $sizeStr)"
        } else {
            $size = "(пусто)"
        }
    } elseif ($opt.Type -eq "git-oldfiles") {
        $existCount = 0
        Push-Location $projectRoot
        foreach ($f in $oldFiles) {
            $tracked = git ls-files $f 2>$null
            if ($tracked) { $existCount++ }
        }
        Pop-Location
        $size = "($existCount файлов)"
    } elseif ($opt.Type -eq "git-branches") {
        Push-Location $projectRoot
        $localBranches = git branch --merged main 2>$null | Where-Object { $_ -notmatch "main|master|\*" }
        $remoteBranches = git branch -r --merged main 2>$null | Where-Object { $_ -notmatch "main|master|HEAD|backup-phase3-stable" }
        Pop-Location
        $lCount = ($localBranches | Where-Object { $_ }).Count
        $rCount = ($remoteBranches | Where-Object { $_ }).Count
        $size = "($lCount локальных, $rCount remote)"
    } elseif ($opt.Type -eq "git-gc") {
        $size = ""
    }

    Write-Host "  [$($i+1)] $($opt.Name) $size" -ForegroundColor White
    Write-Host "      $($opt.Desc)" -ForegroundColor DarkGray
    $selected[$i] = $false
}

Write-Host ""
Write-Host "  [A] Выбрать ВСЁ" -ForegroundColor Green
Write-Host "  [0] Отмена" -ForegroundColor Red
Write-Host ""

$input = Read-Host "Введи номера через пробел (1 3 6) или A для всего"

if ($input -eq "0" -or $input -eq "") {
    Write-Host "Отменено." -ForegroundColor Red
    exit
}

if ($input -eq "A" -or $input -eq "a" -or $input -eq "А" -or $input -eq "а") {
    for ($i = 0; $i -lt $allOptions.Count; $i++) { $selected[$i] = $true }
} else {
    $nums = $input -split "\s+" | ForEach-Object { [int]$_ - 1 }
    foreach ($n in $nums) {
        if ($n -ge 0 -and $n -lt $allOptions.Count) { $selected[$n] = $true }
    }
}

Write-Host ""
Write-Host "--- Начинаю очистку ---" -ForegroundColor Yellow
Write-Host ""

$totalFreed = 0
$gitChanged = $false
$totalSteps = $allOptions.Count
$stepNum = 0

# ===== LOCAL CLEANUP =====

# 1. Логи агента
$stepNum++
if ($selected[0]) {
    Write-Host "[$stepNum/$totalSteps] Логи агента..." -NoNewline
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
$stepNum++
if ($selected[1]) {
    Write-Host "[$stepNum/$totalSteps] Очередь (done+failed)..." -NoNewline
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
$stepNum++
if ($selected[2]) {
    Write-Host "[$stepNum/$totalSteps] Отчёты задач..." -NoNewline
    $rDir = Join-Path $projectRoot ".agent-queue\reports"
    if (Test-Path $rDir) {
        $count = (Get-ChildItem $rDir -File -ErrorAction SilentlyContinue).Count
        Remove-Item "$rDir\*" -Force -ErrorAction SilentlyContinue
        Write-Host " $count отчётов удалено" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

# 4. Node cache
$stepNum++
if ($selected[3]) {
    Write-Host "[$stepNum/$totalSteps] Node кэш..." -NoNewline
    if (Test-Path $cacheDir) {
        $size = (Get-ChildItem $cacheDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Remove-Item $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
        $totalFreed += $size
        Write-Host " ОЧИЩЕНО" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

# 5. Dist
$stepNum++
if ($selected[4]) {
    Write-Host "[$stepNum/$totalSteps] dist/ (пересборка)..." -NoNewline
    if (Test-Path $distDir) {
        $size = (Get-ChildItem $distDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        Remove-Item $distDir -Recurse -Force -ErrorAction SilentlyContinue
        $totalFreed += $size
        Write-Host " ОЧИЩЕНО" -ForegroundColor Yellow
        Write-Host "         Запусти: npm run build" -ForegroundColor Yellow
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
}

# ===== GIT / GITHUB CLEANUP =====

# 6. Screenshots
$stepNum++
if ($selected[5]) {
    Write-Host "[$stepNum/$totalSteps] Скриншоты из репо..." -NoNewline
    Push-Location $projectRoot
    $gitFiles = git ls-files "screenshots/" "screenshot.png" 2>$null
    $fCount = ($gitFiles | Where-Object { $_ }).Count

    if ($fCount -gt 0) {
        # Remove from git tracking
        git rm --cached -r "screenshots/" 2>$null | Out-Null
        git rm --cached "screenshot.png" 2>$null | Out-Null

        # Add to .gitignore
        Add-ToGitignore "screenshots/"
        Add-ToGitignore "screenshot.png"

        # Delete local files
        if (Test-Path $screenshotsDir) {
            $size = (Get-ChildItem $screenshotsDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            Remove-Item $screenshotsDir -Recurse -Force -ErrorAction SilentlyContinue
            $totalFreed += $size
        }
        if (Test-Path $rootScreenshot) {
            $totalFreed += (Get-Item $rootScreenshot).Length
            Remove-Item $rootScreenshot -Force -ErrorAction SilentlyContinue
        }

        $gitChanged = $true
        Write-Host " $fCount файлов удалено из git" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
    Pop-Location
}

# 7. Old files
$stepNum++
if ($selected[6]) {
    Write-Host "[$stepNum/$totalSteps] Старые файлы из репо..." -NoNewline
    Push-Location $projectRoot
    $removed = 0

    foreach ($f in $oldFiles) {
        $tracked = git ls-files $f 2>$null
        if ($tracked) {
            git rm --cached $f 2>$null | Out-Null
            if (Test-Path (Join-Path $projectRoot $f)) {
                Remove-Item (Join-Path $projectRoot $f) -Force -ErrorAction SilentlyContinue
            }
            $removed++
        }
    }

    if ($removed -gt 0) {
        $gitChanged = $true
        Write-Host " $removed файлов удалено из git" -ForegroundColor Green
    } else {
        Write-Host " пусто" -ForegroundColor DarkGray
    }
    Pop-Location
}

# 8. Git merged branches (local + remote)
$stepNum++
if ($selected[7]) {
    Write-Host "[$stepNum/$totalSteps] Git merged ветки..." -NoNewline
    Push-Location $projectRoot

    # Local branches
    $localBranches = git branch --merged main 2>$null | Where-Object { $_ -notmatch "main|master|\*" } | ForEach-Object { $_.Trim() }
    $localCount = 0
    foreach ($br in $localBranches) {
        if ($br) {
            git branch -d $br 2>$null | Out-Null
            $localCount++
        }
    }

    # Remote branches
    git remote prune origin 2>$null | Out-Null
    $remoteBranches = git branch -r --merged main 2>$null | Where-Object { $_ -notmatch "main|master|HEAD|backup-phase3-stable" } | ForEach-Object { $_.Trim() -replace "^origin/", "" }
    $remoteCount = 0
    foreach ($br in $remoteBranches) {
        if ($br) {
            git push origin --delete $br 2>$null | Out-Null
            $remoteCount++
        }
    }

    Pop-Location
    Write-Host " $localCount локальных + $remoteCount remote удалено" -ForegroundColor Green
}

# 9. Git gc
$stepNum++
if ($selected[8]) {
    Write-Host "[$stepNum/$totalSteps] Git gc + prune..." -NoNewline
    Push-Location $projectRoot
    git gc --prune=now --quiet 2>$null
    Pop-Location
    Write-Host " готово" -ForegroundColor Green
}

# ===== COMMIT & PUSH GIT CHANGES =====

if ($gitChanged) {
    Write-Host ""
    Write-Host "--- Git: коммит и пуш изменений ---" -ForegroundColor Yellow

    Push-Location $projectRoot
    git add .gitignore 2>$null | Out-Null
    git commit -m "chore: cleanup — удалены скриншоты и старые файлы" 2>$null | Out-Null

    $pushResult = git push origin main 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Запушено в GitHub" -ForegroundColor Green
    } else {
        Write-Host "  Push не удался: $pushResult" -ForegroundColor Red
        Write-Host "  Сделай вручную: git push origin main" -ForegroundColor Yellow
    }
    Pop-Location
}

# ===== SUMMARY =====

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($totalFreed -gt 1MB) {
    Write-Host ("  Освобождено: {0:N1} MB" -f ($totalFreed / 1MB)) -ForegroundColor Green
} elseif ($totalFreed -gt 1KB) {
    Write-Host ("  Освобождено: {0:N0} KB" -f ($totalFreed / 1KB)) -ForegroundColor Green
} elseif ($totalFreed -gt 0) {
    Write-Host "  Освобождено: $totalFreed bytes" -ForegroundColor Green
}
if ($gitChanged) {
    Write-Host "  Изменения запушены в GitHub" -ForegroundColor Green
}
Write-Host "  Готово!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
