#requires -Version 7
<#
.SYNOPSIS
    Install the Banyan plugin into a target project for development.

.DESCRIPTION
    WHAT THIS DOES (and why)

    Claude Code can load a plugin for a project in two relevant ways:

      A. Marketplace + settings: register a marketplace in the project's
         .claude/settings.json under `extraKnownMarketplaces`, and enable the
         plugin under `enabledPlugins` ("banyan@banyan-local"). This is the
         INTERACTIVE path — when a user opens `claude` in the project and accepts
         the trust dialog, the plugin is offered/enabled.

      B. Direct directory load: `claude --plugin-dir <path>` loads a plugin from
         a directory for that session. This is the HEADLESS path: it works under
         `claude -p` where the trust dialog (and thus `extraKnownMarketplaces`)
         is skipped. smoke.ps1 uses --plugin-dir for exactly this reason.

    This script sets up BOTH so the fixture is usable interactively and headless:

      1. Places a copy (or symlink) of the marketplace at
         <target>/.claude/banyan-marketplace/ . The marketplace dir contains the
         repo's .claude-plugin/marketplace.json plus the plugin/ payload, so it
         is a self-contained local marketplace with a "directory" source.
      2. Merges into <target>/.claude/settings.json:
           - extraKnownMarketplaces["banyan-local"] = { source: { source:
             "directory", path: "./.claude/banyan-marketplace" } }
           - enabledPlugins += "banyan@banyan-local"
         Existing keys/values are preserved (idempotent deep-ish merge).
      3. Prints the exact `--plugin-dir` invocation for headless use.

    The script is IDEMPOTENT: re-running re-syncs the copy and leaves settings
    unchanged if already present.

    Mode `copy` (the default) physically copies the plugin tree — reliable
    everywhere, including Windows where symlinks require elevation/developer
    mode. Mode `symlink` links the plugin dir for fast iteration (no re-install
    after edits); it works without elevation on macOS/Linux and falls back to
    copy when link creation is denied.

.PARAMETER Target
    Target project path. Default: the fixture sandbox tmp/fixture-sandbox.

.PARAMETER Mode
    copy | symlink. Default: copy.

.EXAMPLE
    pwsh scripts/dev-install.ps1
    pwsh scripts/dev-install.ps1 -Target /path/to/project -Mode symlink
#>
[CmdletBinding()]
param(
    [string]$Target = '',
    [ValidateSet('copy', 'symlink')]
    [string]$Mode = 'copy'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
$PluginSrc       = Join-Path $RepoRoot 'plugin'
$MarketplaceSrc  = Join-Path $RepoRoot '.claude-plugin/marketplace.json'

if ([string]::IsNullOrWhiteSpace($Target)) {
    $Target = Join-Path $RepoRoot 'tmp/fixture-sandbox'
}
$Target = [System.IO.Path]::GetFullPath($Target)

Write-Host "Banyan dev-install" -ForegroundColor Cyan
Write-Host "  repo root : $RepoRoot"
Write-Host "  plugin    : $PluginSrc"
Write-Host "  target    : $Target"
Write-Host "  mode      : $Mode"

if (-not (Test-Path -LiteralPath $PluginSrc)) { throw "Plugin source not found: $PluginSrc" }
if (-not (Test-Path -LiteralPath $MarketplaceSrc)) { throw "Marketplace manifest not found: $MarketplaceSrc" }
if (-not (Test-Path -LiteralPath $Target)) { throw "Target project not found: $Target. Run fixture-init.ps1 first or pass -Target." }

# --- Lay down a self-contained local marketplace under the target's .claude/ --
$ClaudeDir   = Join-Path $Target '.claude'
$MarketDir   = Join-Path $ClaudeDir 'banyan-marketplace'
$MarketPluginDir = Join-Path $MarketDir 'plugin'
$MarketCatalogDir = Join-Path $MarketDir '.claude-plugin'

New-Item -ItemType Directory -Path $ClaudeDir -Force | Out-Null

# Reset the marketplace dir each run so copies/symlinks stay in sync (idempotent).
if (Test-Path -LiteralPath $MarketDir) {
    Remove-Item -LiteralPath $MarketDir -Recurse -Force
}
New-Item -ItemType Directory -Path $MarketDir -Force | Out-Null
New-Item -ItemType Directory -Path $MarketCatalogDir -Force | Out-Null

# marketplace.json must live at <marketplace>/.claude-plugin/marketplace.json and
# point at "./plugin" (a directory-relative source), matching the repo layout.
Copy-Item -LiteralPath $MarketplaceSrc -Destination (Join-Path $MarketCatalogDir 'marketplace.json') -Force

if ($Mode -eq 'symlink') {
    try {
        New-Item -ItemType SymbolicLink -Path $MarketPluginDir -Target $PluginSrc -ErrorAction Stop | Out-Null
        Write-Host "  linked plugin -> $MarketPluginDir" -ForegroundColor Green
    } catch {
        Write-Host "  symlink failed ($($_.Exception.Message)); falling back to copy" -ForegroundColor Yellow
        Copy-Item -LiteralPath $PluginSrc -Destination $MarketPluginDir -Recurse -Force
        Write-Host "  copied plugin -> $MarketPluginDir" -ForegroundColor Green
    }
} else {
    Copy-Item -LiteralPath $PluginSrc -Destination $MarketPluginDir -Recurse -Force
    Write-Host "  copied plugin -> $MarketPluginDir" -ForegroundColor Green
}

# --- Merge settings.json (idempotent) ----------------------------------------
$SettingsPath = Join-Path $ClaudeDir 'settings.json'
$settings = @{}
if (Test-Path -LiteralPath $SettingsPath) {
    $raw = Get-Content -LiteralPath $SettingsPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        try {
            $settings = $raw | ConvertFrom-Json -AsHashtable
        } catch {
            throw "Existing $SettingsPath is not valid JSON; refusing to overwrite. Fix or remove it. ($($_.Exception.Message))"
        }
    }
}
if ($null -eq $settings) { $settings = @{} }

$marketName = 'banyan-local'
$pluginRef  = 'banyan@banyan-local'

# extraKnownMarketplaces["banyan-local"] = { source: { source: "directory", path: "./.claude/banyan-marketplace" } }
if (-not $settings.ContainsKey('extraKnownMarketplaces') -or $null -eq $settings['extraKnownMarketplaces']) {
    $settings['extraKnownMarketplaces'] = @{}
}
$settings['extraKnownMarketplaces'][$marketName] = @{
    source = @{
        source = 'directory'
        path   = './.claude/banyan-marketplace'
    }
}

# enabledPlugins += "banyan@banyan-local" (dedup)
$existing = @()
if ($settings.ContainsKey('enabledPlugins') -and $null -ne $settings['enabledPlugins']) {
    $existing = @($settings['enabledPlugins'])
}
if ($existing -notcontains $pluginRef) {
    $existing += $pluginRef
}
$settings['enabledPlugins'] = $existing

# Write back as pretty JSON.
($settings | ConvertTo-Json -Depth 12) | Set-Content -LiteralPath $SettingsPath -Encoding utf8
Write-Host "  merged settings -> $SettingsPath" -ForegroundColor Green

# --- Report ------------------------------------------------------------------
Write-Host ""
Write-Host "Banyan installed into $Target" -ForegroundColor Cyan
Write-Host "  marketplace : $MarketDir (source type 'directory')"
Write-Host "  settings    : extraKnownMarketplaces['$marketName'] + enabledPlugins['$pluginRef']"
Write-Host ""
Write-Host "Interactive use:" -ForegroundColor Cyan
Write-Host "  cd `"$Target`"; claude   # accept trust dialog -> banyan plugin enabled"
Write-Host ""
Write-Host "Headless use (trust dialog is skipped under -p, so load the plugin directly):" -ForegroundColor Cyan
Write-Host "  Use the IN-TARGET copy as --plugin-dir so the skill can read its own"
Write-Host "  manifest (a --plugin-dir OUTSIDE the session CWD is blocked by the"
Write-Host "  file-access sandbox, which forces a 'version unknown' fallback):"
Write-Host "    cd `"$Target`"; claude -p `"/bn-hello`" --plugin-dir `"$MarketPluginDir`""

# Emit the in-target plugin dir on the last line for callers (smoke.ps1 reads it).
Write-Output $MarketPluginDir
