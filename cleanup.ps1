# mcp-gpt-auto Cleanup Tool v1.1
# Запуск: .\cleanup.ps1
# Проверка без удаления: .\cleanup.ps1 -DryRun
# Непрерывный режим: .\cleanup.ps1 -Select "1 3 8" -DryRun

param(
    [switch]$DryRun,
    [string]$Select
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:TotalFreed = 0

function Write-StepResult([string]$Text, [ConsoleColor]$Color = "Green") {
    if ($DryRun) {
        Write-Host " DRY-RUN: $Text" -ForegroundColor Yellow
    } else {
        Write-Host " $Text" -ForegroundColor $Color
    }
}

function ConvertTo-RepoPath([string]$Path) {
    $full = [System.IO.Path]::GetFullPath($Path)
    $root = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
    if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path is outside project root: $Path"
    }

    $relative = $full.Substring($root.Length).TrimStart('\')
    return ($relative -replace "\\", "/")
}

function Test-GitTracked([string]$Path) {
    $relative = ConvertTo-RepoPath $Path
    if ($relative -eq "") { return $false }

    $match = git -C $projectRoot ls-files -- "$relative" 2>$null
    return ($match -contains $relative)
}

function Get-DirSize($Path) {
    if (Test-Path -LiteralPath $Path) {
        $size = (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if (-not $size) { $size = 0 }
        if ($size -gt 1MB) { return "{0:N1} MB" -f ($size / 1MB) }
        if ($size -gt 1KB) { return "{0:N0} KB" -f ($size / 1KB) }
        return "$size bytes"
    }
    return "0 bytes"
}

function Get-FileCount($Path) {
    if (Test-Path -LiteralPath $Path) {
        return (Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue).Count
    }
    return 0
}

function Get-DirectoryEntryCount([string[]]$Paths) {
    $count = 0
    foreach ($path in $Paths) {
        if (Test-Path -LiteralPath $path) {
            $count += (Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue).Count
        }
    }
    return $count
}

function Remove-SafeDirectoryChildren([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        return @{ Removed = 0; SkippedTracked = 0; Freed = 0 }
    }

    $removed = 0
    $skipped = 0
    $freed = 0

    $files = Get-ChildItem -LiteralPath $Path -Recurse -File -Force -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        if (Test-GitTracked $file.FullName) {
            $skipped++
            continue
        }

        $freed += $file.Length
        $removed++
        if (-not $DryRun) {
            Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
        }
    }

    $dirs = Get-ChildItem -LiteralPath $Path -Recurse -Directory -Force -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending

    foreach ($dir in $dirs) {
        if (-not (Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue)) {
            if (-not $DryRun) {
                Remove-Item -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue
            }
        }
    }

    $script:TotalFreed += $freed
    return @{ Removed = $removed; SkippedTracked = $skipped; Freed = $freed }
}

function Invoke-GitCachedRemove([string[]]$Paths) {
    $removed = 0
    foreach ($path in $Paths) {
        if (-not $path) { continue }
        $match = git -C $projectRoot ls-files -- "$path" 2>$null
        if ($match -notcontains $path) { continue }

        $removed++
        if (-not $DryRun) {
            git -C $projectRoot rm --cached -- "$path" *> $null
            if ($LASTEXITCODE -ne 0) {
                throw "git rm --cached failed for $path"
            }
        }
    }
    return $removed
}

function Add-GitIgnoreLines([string[]]$Lines) {
    $gitignore = Join-Path $projectRoot ".gitignore"
    if (Test-Path -LiteralPath $gitignore) {
        $current = Get-Content -LiteralPath $gitignore -ErrorAction SilentlyContinue
    } else {
        $current = @()
    }

    $missing = @()
    foreach ($line in $Lines) {
        if ($current -notcontains $line) {
            $missing += $line
        }
    }

    if ($missing.Count -gt 0 -and -not $DryRun) {
        Add-Content -LiteralPath $gitignore -Value $missing
    }

    return $missing.Count
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   mcp-gpt-auto - Очистка мусора" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
if ($DryRun) {
    Write-Host "   DRY-RUN: файлы и Git не меняются" -ForegroundColor Yellow
}
Write-Host ""

$logDir = Join-Path $projectRoot ".agent\logs"
$doneDir = Join-Path $projectRoot ".agent-queue\done"
$failedDir = Join-Path $projectRoot ".agent-queue\failed"
$reportsDir = Join-Path $projectRoot ".agent-queue\reports"
$distDir = Join-Path $projectRoot "dist"
$cacheDir = Join-Path $projectRoot "node_modules\.cache"
$screenshotsDir = Join-Path $projectRoot "screenshots"

$options = @(
    @{ Name = "Логи агента"; Path = $logDir; Desc = "(.agent/logs/ - только untracked/ignored файлы)" }
    @{ Name = "Очередь задач (done+failed)"; Path = "queue"; Desc = "(без удаления tracked файлов и .gitkeep)" }
    @{ Name = "Отчеты задач"; Path = $reportsDir; Desc = "(.agent-queue/reports/ - только untracked/ignored файлы)" }
    @{ Name = "Git: удалить merged ветки"; Path = "git-branches"; Desc = "(локальные ветки уже влитые в main)" }
    @{ Name = "Git: очистка (gc + prune)"; Path = "git-gc"; Desc = "(сжатие репозитория без удаления рабочих файлов)" }
    @{ Name = "Node кэш"; Path = $cacheDir; Desc = "(node_modules/.cache/)" }
    @{ Name = "Пересборка (удалить dist/)"; Path = $distDir; Desc = "(безопасно только если dist/ не tracked)" }
    @{ Name = "GitHub: убрать скриншоты из индекса"; Path = "github-screenshots"; Desc = "(git rm --cached screenshots/*, локальные файлы остаются)" }
    @{ Name = "GitHub: убрать служебный мусор из индекса"; Path = "github-generated"; Desc = "(.agent-queue done/failed/reports, локальные файлы остаются)" }
)

Write-Host "Что почистить?" -ForegroundColor Yellow
Write-Host ""

$selected = @{}
for ($i = 0; $i -lt $options.Count; $i++) {
    $opt = $options[$i]
    $size = ""

    if ($opt.Path -eq "queue") {
        $size = "($(Get-DirectoryEntryCount @($doneDir, $failedDir)) задач)"
    } elseif ($opt.Path -eq "git-branches") {
        $branches = git -C $projectRoot branch --merged main 2>$null | Where-Object { $_ -notmatch "main|master|\*" }
        $size = "($($branches.Count) веток)"
    } elseif ($opt.Path -eq "git-gc") {
        $size = ""
    } elseif ($opt.Path -eq "github-screenshots") {
        $trackedShots = git -C $projectRoot ls-files "screenshots/*" "screenshot.png" 2>$null
        $size = "($($trackedShots.Count) tracked файлов)"
    } elseif ($opt.Path -eq "github-generated") {
        $trackedGenerated = git -C $projectRoot ls-files ".agent-queue/done/*" ".agent-queue/failed/*" ".agent-queue/reports/*" 2>$null |
            Where-Object { $_ -notmatch "\.gitkeep$" }
        $size = "($($trackedGenerated.Count) tracked файлов)"
    } elseif (Test-Path -LiteralPath $opt.Path) {
        $size = "($(Get-DirSize $opt.Path), $(Get-FileCount $opt.Path) файлов)"
    } else {
        $size = "(пусто)"
    }

    Write-Host "  [$($i+1)] $($opt.Name) $size" -ForegroundColor White
    Write-Host "      $($opt.Desc)" -ForegroundColor DarkGray
    $selected[$i] = $false
}

Write-Host ""
Write-Host "  [A] Выбрать ВСЕ" -ForegroundColor Green
Write-Host "  [0] Отмена" -ForegroundColor Red
Write-Host ""

if (-not $Select) {
    $Select = Read-Host "Введи номера через пробел (1 3 8) или A для всего"
}

if ($Select -eq "0" -or $Select -eq "") {
    Write-Host "Отменено." -ForegroundColor Red
    exit 0
}

if ($Select -eq "A" -or $Select -eq "a" -or $Select -eq "А" -or $Select -eq "а") {
    for ($i = 0; $i -lt $options.Count; $i++) { $selected[$i] = $true }
} else {
    foreach ($value in ($Select -split "\s+")) {
        $n = 0
        if ([int]::TryParse($value, [ref]$n)) {
            $idx = $n - 1
            if ($idx -ge 0 -and $idx -lt $options.Count) {
                $selected[$idx] = $true
            }
        }
    }
}

Write-Host ""
Write-Host "--- Начинаю очистку ---" -ForegroundColor Yellow
Write-Host ""

if ($selected[0]) {
    Write-Host "[1/9] Логи агента..." -NoNewline
    $result = Remove-SafeDirectoryChildren $logDir
    Write-StepResult "$($result.Removed) файлов удалено, $($result.SkippedTracked) tracked пропущено"
}

if ($selected[1]) {
    Write-Host "[2/9] Очередь (done+failed)..." -NoNewline
    $done = Remove-SafeDirectoryChildren $doneDir
    $failed = Remove-SafeDirectoryChildren $failedDir
    $removed = $done.Removed + $failed.Removed
    $skipped = $done.SkippedTracked + $failed.SkippedTracked
    Write-StepResult "$removed файлов удалено, $skipped tracked пропущено"
}

if ($selected[2]) {
    Write-Host "[3/9] Отчеты задач..." -NoNewline
    $result = Remove-SafeDirectoryChildren $reportsDir
    Write-StepResult "$($result.Removed) файлов удалено, $($result.SkippedTracked) tracked пропущено"
}

if ($selected[3]) {
    Write-Host "[4/9] Git merged ветки..." -NoNewline
    $branches = git -C $projectRoot branch --merged main 2>$null |
        Where-Object { $_ -notmatch "main|master|\*" } |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }

    $count = 0
    foreach ($br in $branches) {
        $count++
        if (-not $DryRun) {
            git -C $projectRoot branch -d $br 2>$null | Out-Null
        }
    }
    if (-not $DryRun) {
        git -C $projectRoot remote prune origin 2>$null | Out-Null
    }
    Write-StepResult "$count веток удалено"
}

if ($selected[4]) {
    Write-Host "[5/9] Git gc + prune..." -NoNewline
    if (-not $DryRun) {
        git -C $projectRoot gc --prune=now --quiet 2>$null
    }
    Write-StepResult "готово"
}

if ($selected[5]) {
    Write-Host "[6/9] Node кэш..." -NoNewline
    $result = Remove-SafeDirectoryChildren $cacheDir
    Write-StepResult "$($result.Removed) файлов удалено, $($result.SkippedTracked) tracked пропущено"
}

if ($selected[6]) {
    Write-Host "[7/9] dist/ (пересборка)..." -NoNewline
    $result = Remove-SafeDirectoryChildren $distDir
    Write-StepResult "$($result.Removed) файлов удалено, $($result.SkippedTracked) tracked пропущено" "Yellow"
}

if ($selected[7]) {
    Write-Host "[8/9] GitHub screenshots..." -NoNewline
    $paths = git -C $projectRoot ls-files "screenshots/*" "screenshot.png" 2>$null
    $removed = Invoke-GitCachedRemove $paths
    $ignored = Add-GitIgnoreLines @("screenshots/", "screenshot.png")
    Write-StepResult "$removed файлов убрано из Git, $ignored строк добавлено в .gitignore"
}

if ($selected[8]) {
    Write-Host "[9/9] GitHub служебный мусор..." -NoNewline
    $paths = git -C $projectRoot ls-files ".agent-queue/done/*" ".agent-queue/failed/*" ".agent-queue/reports/*" 2>$null |
        Where-Object { $_ -notmatch "\.gitkeep$" }
    $removed = Invoke-GitCachedRemove $paths
    $ignored = Add-GitIgnoreLines @(".agent-queue/done/", ".agent-queue/failed/", ".agent-queue/reports/")
    Write-StepResult "$removed файлов убрано из Git, $ignored строк добавлено в .gitignore"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($script:TotalFreed -gt 1MB) {
    Write-Host ("  Освобождено: {0:N1} MB" -f ($script:TotalFreed / 1MB)) -ForegroundColor Green
} elseif ($script:TotalFreed -gt 1KB) {
    Write-Host ("  Освобождено: {0:N0} KB" -f ($script:TotalFreed / 1KB)) -ForegroundColor Green
} else {
    Write-Host "  Освобождено: 0 bytes" -ForegroundColor Green
}
Write-Host "  Готово!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
