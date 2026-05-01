param(
    [Parameter(Mandatory=$false, Position=0)]
    [string]$taskId,
    
    [Parameter(Mandatory=$false, Position=1)]
    [string]$title,
    
    [Parameter(Mandatory=$false, Position=2)]
    [string]$type = "shell",
    
    [Parameter(Mandatory=$false, Position=3, ValueFromRemainingArguments=$true)]
    [string[]]$commands
)

$repoRoot = Join-Path $PSScriptRoot "..\.."
$inboxDir = Join-Path $repoRoot ".agent-queue\inbox"

# Generate taskId if not provided
if (-not $taskId) {
    $date = Get-Date -Format "yyyy-MM-dd"
    $random = Get-Random -Minimum 100 -Maximum 999
    $taskId = "$date-task-$random"
}

# Generate title if not provided
if (-not $title) {
    $title = "Manual Task: $taskId"
}

# If no commands provided, ask or use default
if (-not $commands) {
    $commands = @("npm run build")
}

# Prepare task object
$task = @{
    taskId = $taskId
    title = $title
    createdAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    createdBy = "manual-cli"
    type = $type
    priority = "normal"
    workspace = "."
    allowedFiles = @(
        "README.md",
        "docs/**",
        "scripts/**",
        "src/**",
        ".agent-queue/**",
        "package.json",
        "tsconfig.json"
    )
    instructions = "Manually queued task: $title"
    commands = @()
    requiresPush = $true
}

foreach ($cmdStr in $commands) {
    # Simple split for space-separated commands. 
    # For complex args, users should probably edit the JSON or we'd need better parsing.
    $parts = $cmdStr -split " "
    $cmdObj = @{
        command = $parts[0]
        args = if ($parts.Length -gt 1) { [string[]]$parts[1..($parts.Length-1)] } else { [string[]]@() }
    }
    $task.commands += $cmdObj
}

# Ensure inbox exists
if (-not (Test-Path $inboxDir)) {
    New-Item -ItemType Directory -Path $inboxDir -Force | Out-Null
}

$outputPath = Join-Path $inboxDir "$taskId.json"
$json = $task | ConvertTo-Json -Depth 10

# Write file without BOM
[System.IO.File]::WriteAllText($outputPath, $json)

Write-Host "[Success] Task created: $taskId" -ForegroundColor Green
Write-Host "Path: $outputPath"
Write-Host "You can now commit and push this file, then run the task runner."
