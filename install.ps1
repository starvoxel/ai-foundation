# AI Foundation — Install / Uninstall Script
# Deploys agent definitions to supported AI harnesses via symlinks.
# Run as Administrator for symlink creation on Windows.
#
# Usage:
#   .\install.ps1           — install all agents to all detected harnesses
#   .\install.ps1 -Uninstall — remove all installed symlinks
#   .\install.ps1 -Harness Kiro    — install to Kiro only
#   .\install.ps1 -Harness Copilot — install to VS Code Copilot only
#   .\install.ps1 -DryRun   — show what would be done without doing it

param(
    [switch]$Uninstall,
    [string]$Harness = "All",
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Paths ────────────────────────────────────────────────────────────────────

$RepoRoot     = $PSScriptRoot
$AgentsDir    = Join-Path $RepoRoot "agents"
$StandardsDir = Join-Path $RepoRoot "standards"

$KiroAgentsDir    = Join-Path $env:USERPROFILE ".kiro\agents"
$CopilotAgentsDir = Join-Path $env:APPDATA "Code\User\globalStorage\github.copilot-chat"

# ── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step($msg) { Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Skip($msg) { Write-Host "  ~ $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  ✗ $msg" -ForegroundColor Red }

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        if ($DryRun) {
            Write-Step "Would create directory: $path"
        } else {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
            Write-Ok "Created directory: $path"
        }
    }
}

function Create-Symlink($target, $link) {
    if (Test-Path $link) {
        $existing = Get-Item $link
        if ($existing.LinkType -eq "SymbolicLink" -and $existing.Target -eq $target) {
            Write-Skip "Already linked: $link"
            return
        }
        if ($DryRun) {
            Write-Step "Would replace: $link → $target"
            return
        }
        Remove-Item $link -Force
    }
    if ($DryRun) {
        Write-Step "Would link: $link → $target"
    } else {
        New-Item -ItemType SymbolicLink -Path $link -Target $target | Out-Null
        Write-Ok "Linked: $(Split-Path $link -Leaf)"
    }
}

function Remove-Symlink($link) {
    if (Test-Path $link) {
        $existing = Get-Item $link
        if ($existing.LinkType -eq "SymbolicLink") {
            if ($DryRun) {
                Write-Step "Would remove: $link"
            } else {
                Remove-Item $link -Force
                Write-Ok "Removed: $link"
            }
        } else {
            Write-Skip "Not a symlink, skipping: $link"
        }
    } else {
        Write-Skip "Not found, skipping: $link"
    }
}

# ── Agent list ────────────────────────────────────────────────────────────────
# Each entry: source file (relative to agents/) and the display name

$Agents = @(
    @{ File = "architect.md";               Name = "Architect" }
    @{ File = "tech-lead.md";               Name = "Tech-Lead" }
    @{ File = "software-engineer.md";       Name = "Software-Engineer" }
    @{ File = "principal-engineer.md";      Name = "Principal-Engineer" }
    @{ File = "test-engineer.md";           Name = "Test-Engineer" }
    @{ File = "engineering-tech-writer.md"; Name = "Engineering-Tech-Writer" }
)

# ── Kiro install ─────────────────────────────────────────────────────────────

function Install-Kiro {
    Write-Host "`nKiro CLI" -ForegroundColor White
    if (-not (Test-Path (Join-Path $env:USERPROFILE ".kiro"))) {
        Write-Skip "Kiro not detected — skipping"
        return
    }
    Ensure-Dir $KiroAgentsDir
    foreach ($agent in $Agents) {
        $source = Join-Path $AgentsDir $agent.File
        $link   = Join-Path $KiroAgentsDir $agent.File
        Create-Symlink $source $link
    }
    # Link the standards directory so agents can reference it
    $standardsLink = Join-Path $KiroAgentsDir "standards"
    Create-Symlink $StandardsDir $standardsLink
}

function Uninstall-Kiro {
    Write-Host "`nKiro CLI" -ForegroundColor White
    if (-not (Test-Path $KiroAgentsDir)) {
        Write-Skip "Kiro agents directory not found — nothing to remove"
        return
    }
    foreach ($agent in $Agents) {
        $link = Join-Path $KiroAgentsDir $agent.File
        Remove-Symlink $link
    }
    Remove-Symlink (Join-Path $KiroAgentsDir "standards")
}

# ── VS Code Copilot install ───────────────────────────────────────────────────
# Copilot custom agents use .agent.md files with YAML frontmatter.
# We generate wrapper files that include the agent definition content
# since Copilot expects its own frontmatter format.

function Get-CopilotFrontmatter($agentName, $description) {
    return @"
---
name: $agentName
description: $description
target: vscode
tools: ['search', 'read', 'vscode/memory', 'vscode/askQuestions']
---
"@
}

$CopilotDescriptions = @{
    "Architect"               = "Technical decision-making and option exploration"
    "Tech-Lead"               = "Epic and Chunk Plan authoring and decomposition"
    "Software-Engineer"       = "Implementation and correction of review findings"
    "Principal-Engineer"      = "Code review, security enforcement, standards verification"
    "Test-Engineer"           = "Test authoring and execution"
    "Engineering-Tech-Writer" = "Inline docs, README updates, and CHANGELOG"
}

function Install-Copilot {
    Write-Host "`nVS Code Copilot" -ForegroundColor White
    if (-not (Test-Path $CopilotAgentsDir)) {
        Write-Skip "VS Code Copilot not detected — skipping"
        return
    }
    foreach ($agent in $Agents) {
        $agentDir  = Join-Path $CopilotAgentsDir "$($agent.Name)-agent"
        $agentFile = Join-Path $agentDir "$($agent.Name).agent.md"
        $sourceFile = Join-Path $AgentsDir $agent.File

        Ensure-Dir $agentDir

        if ($DryRun) {
            Write-Step "Would create Copilot wrapper: $agentFile"
            continue
        }

        # Build wrapper: Copilot frontmatter + content from our agent definition
        $frontmatter = Get-CopilotFrontmatter $agent.Name $CopilotDescriptions[$agent.Name]
        $agentContent = Get-Content $sourceFile -Raw
        $combined = $frontmatter + "`n" + $agentContent

        Set-Content -Path $agentFile -Value $combined -Encoding UTF8
        Write-Ok "Installed Copilot agent: $($agent.Name)"
    }
}

function Uninstall-Copilot {
    Write-Host "`nVS Code Copilot" -ForegroundColor White
    foreach ($agent in $Agents) {
        $agentDir = Join-Path $CopilotAgentsDir "$($agent.Name)-agent"
        if (Test-Path $agentDir) {
            if ($DryRun) {
                Write-Step "Would remove Copilot agent dir: $agentDir"
            } else {
                Remove-Item $agentDir -Recurse -Force
                Write-Ok "Removed Copilot agent: $($agent.Name)"
            }
        } else {
            Write-Skip "Not found: $($agent.Name)"
        }
    }
}

# ── Entry point ───────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "AI Foundation — Agent $( if ($Uninstall) { 'Uninstall' } else { 'Install' } )" -ForegroundColor White
Write-Host "Repo: $RepoRoot" -ForegroundColor DarkGray
if ($DryRun) { Write-Host "(Dry run — no changes will be made)" -ForegroundColor Yellow }

if ($Uninstall) {
    switch ($Harness) {
        "Kiro"    { Uninstall-Kiro }
        "Copilot" { Uninstall-Copilot }
        default   { Uninstall-Kiro; Uninstall-Copilot }
    }
    Write-Host "`nUninstall complete.`n" -ForegroundColor Green
} else {
    switch ($Harness) {
        "Kiro"    { Install-Kiro }
        "Copilot" { Install-Copilot }
        default   { Install-Kiro; Install-Copilot }
    }
    Write-Host "`nInstall complete.`n" -ForegroundColor Green
    if (-not $DryRun) {
        Write-Host "Note: Symlinks mean 'git pull' updates all harnesses automatically." -ForegroundColor DarkGray
        Write-Host "      Copilot wrapper files are regenerated on each install run." -ForegroundColor DarkGray
    }
}
