#requires -Version 7
<#
.SYNOPSIS
    End-to-end smoke test for the Banyan dev/test harness.

.DESCRIPTION
    Steps:
      1. fixture-init.ps1 -Force        -> build the sandbox (main + seeded-bugs).
      2. dev-install.ps1                -> install the plugin into the sandbox.
      3. node --test on `main`          -> assert the clean baseline is GREEN
                                           (capture pass count).
      4. Invoke the install-check skill headlessly: `claude -p "/bn-hello"
         --plugin-dir <plugin>` in the sandbox. If headless skill invocation is
         not reliably scriptable in this environment, FALL BACK to asserting the
         plugin files (marketplace.json, plugin.json, bn-hello SKILL.md) are
         discoverable from the target, and print a clear MANUAL-STEP note instead
         of failing.

    Exit code: non-zero on real failures (tests red, manifests missing); zero on
    success (including the documented fallback for the headless skill step).

.PARAMETER Sandbox
    Sandbox path passed through to fixture-init/dev-install.
    Default: tmp/fixture-sandbox.

.PARAMETER SkipClaude
    Skip attempting the live `claude -p` invocation and go straight to the
    file-discoverability fallback. Useful in CI without the claude CLI.

.EXAMPLE
    pwsh scripts/smoke.ps1
#>
[CmdletBinding()]
param(
    [string]$Sandbox = '',
    [switch]$SkipClaude
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
$PluginSrc = Join-Path $RepoRoot 'plugin'

if ([string]::IsNullOrWhiteSpace($Sandbox)) {
    $Sandbox = Join-Path $RepoRoot 'tmp/fixture-sandbox'
}
$Sandbox = [System.IO.Path]::GetFullPath($Sandbox)

$results = [System.Collections.Generic.List[string]]::new()
$failed = $false
function Pass([string]$msg) { Write-Host "  PASS  $msg" -ForegroundColor Green; $script:results.Add("PASS  $msg") }
function Fail([string]$msg) { Write-Host "  FAIL  $msg" -ForegroundColor Red;   $script:results.Add("FAIL  $msg"); $script:failed = $true }
function Note([string]$msg) { Write-Host "  NOTE  $msg" -ForegroundColor Yellow; $script:results.Add("NOTE  $msg") }

Write-Host "=== Banyan smoke test ===" -ForegroundColor Cyan
Write-Host "  repo root : $RepoRoot"
Write-Host "  sandbox   : $Sandbox"
Write-Host ""

# --- Step 1: fixture-init ----------------------------------------------------
Write-Host "[1/4] fixture-init.ps1 -Force" -ForegroundColor Cyan
try {
    & (Join-Path $ScriptDir 'fixture-init.ps1') -Sandbox $Sandbox -Force
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "fixture-init exit $LASTEXITCODE" }
    if (-not (Test-Path -LiteralPath (Join-Path $Sandbox '.git'))) { throw "no .git in sandbox" }
    Pass "fixture sandbox built with git repo"
} catch {
    Fail "fixture-init failed: $($_.Exception.Message)"
}

# Verify both branches exist and the diff is non-empty.
if (-not $failed) {
    $branches = & git -C $Sandbox branch --format='%(refname:short)'
    if (($branches -contains 'main') -and ($branches -contains 'seeded-bugs')) {
        Pass "branches present: main, seeded-bugs"
    } else {
        Fail "expected branches main + seeded-bugs, got: $($branches -join ', ')"
    }
    $diffstat = (& git -C $Sandbox diff --stat main..seeded-bugs | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($diffstat)) {
        Fail "git diff main..seeded-bugs is empty"
    } else {
        Pass "seeded-bug diff is non-empty"
    }
}

# --- Step 2: dev-install -----------------------------------------------------
Write-Host ""
Write-Host "[2/4] dev-install.ps1" -ForegroundColor Cyan
if (-not $failed) {
    try {
        & (Join-Path $ScriptDir 'dev-install.ps1') -Target $Sandbox -Mode copy
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "dev-install exit $LASTEXITCODE" }
        Pass "plugin installed into sandbox"
    } catch {
        Fail "dev-install failed: $($_.Exception.Message)"
    }
}

# --- Step 3: baseline tests on main ------------------------------------------
Write-Host ""
Write-Host "[3/4] node --test on main (clean baseline)" -ForegroundColor Cyan
$passCount = 0
if (-not $failed) {
    & git -C $Sandbox checkout -q main
    Push-Location $Sandbox
    try {
        # TAP is requested explicitly: the parse below reads the TAP summary lines,
        # and Node's default reporter is version-dependent (spec since Node 23).
        $testOut = & node --test --test-reporter tap 2>&1 | Out-String
    } finally {
        Pop-Location
    }
    $testExit = $LASTEXITCODE
    Write-Host $testOut
    $m = [regex]::Match($testOut, '(?m)^# pass (\d+)')
    if ($m.Success) { $passCount = [int]$m.Groups[1].Value }
    $fm = [regex]::Match($testOut, '(?m)^# fail (\d+)')
    $failCount = if ($fm.Success) { [int]$fm.Groups[1].Value } else { -1 }
    if ($testExit -eq 0 -and $failCount -eq 0 -and $passCount -gt 0) {
        Pass "baseline GREEN: $passCount passing, 0 failing"
    } else {
        Fail "baseline tests not green (exit=$testExit pass=$passCount fail=$failCount)"
    }
}

# --- Step 4: headless skill invocation (with fallback) -----------------------
Write-Host ""
Write-Host "[4/4] headless /bn-hello invocation" -ForegroundColor Cyan

# Always assert plugin files are discoverable from the target — this is the
# fallback signal and also a useful invariant on its own.
# Use the IN-TARGET plugin copy for headless --plugin-dir: a plugin dir outside
# the session CWD is blocked by the file-access sandbox (the skill then can't
# read its own manifest and falls back to "version unknown"). The in-target copy
# lets /bn-hello read the manifest and print the real version.
$InTargetPlugin = Join-Path $Sandbox '.claude/banyan-marketplace/plugin'
$marketJson = Join-Path $Sandbox '.claude/banyan-marketplace/.claude-plugin/marketplace.json'
$pluginJson = Join-Path $InTargetPlugin '.claude-plugin/plugin.json'
$helloSkill = Join-Path $InTargetPlugin 'skills/bn-hello/SKILL.md'
$filesOk = (Test-Path -LiteralPath $marketJson) -and (Test-Path -LiteralPath $pluginJson) -and (Test-Path -LiteralPath $helloSkill)

if (-not $failed) {
    if (-not $filesOk) {
        Fail "plugin files NOT discoverable from target (marketplace.json/plugin.json/bn-hello SKILL.md missing)"
    } else {
        Pass "plugin files discoverable from target (marketplace.json, plugin.json, bn-hello SKILL.md)"
    }
}

if (-not $failed) {
    $claude = Get-Command claude -ErrorAction SilentlyContinue
    if ($SkipClaude) {
        Note "headless claude invocation skipped (-SkipClaude). Manual step: run"
        Note "  cd `"$Sandbox`"; claude -p `"/bn-hello`" --plugin-dir `"$InTargetPlugin`"  (expect a 'Banyan v... installed' line)"
    } elseif ($null -eq $claude) {
        Note "claude CLI not found on PATH; relied on file-discoverability assertion above."
        Note "Manual step: cd `"$Sandbox`"; claude -p `"/bn-hello`" --plugin-dir `"$InTargetPlugin`""
    } else {
        # Try a live headless invocation. Treat tooling flakiness as a documented
        # manual step (NOTE), not a hard failure — the file assertion already
        # proves the plugin is installed.
        Push-Location $Sandbox
        try {
            # Pipe empty input so the CLI does not wait on stdin under -p.
            # (PowerShell has no `<` stdin redirect; piping $null supplies EOF.)
            $claudeOut = $null | & claude -p "/bn-hello" --plugin-dir "$InTargetPlugin" 2>&1 | Out-String
            $claudeExit = $LASTEXITCODE
        } catch {
            $claudeOut = $_.Exception.Message
            $claudeExit = -1
        } finally {
            Pop-Location
        }
        Write-Host "  --- claude output (truncated) ---"
        Write-Host (($claudeOut -split "`n" | Select-Object -First 12) -join "`n")
        if ($claudeExit -eq 0 -and $claudeOut -match '(?i)banyan') {
            Pass "headless /bn-hello ran and mentioned Banyan"
        } else {
            # When the claude CLI is present and not explicitly skipped, a failed
            # /bn-hello is a HARD failure -- silently passing would hide a broken
            # skill-dispatch path. Use -SkipClaude to opt out on machines where the
            # CLI is unusable.
            Fail "headless /bn-hello did not return a clean Banyan greeting (exit=$claudeExit). Re-run with -SkipClaude only if the claude CLI is known-unusable here."
            Note "Confirm interactively: cd `"$Sandbox`"; claude -p `"/bn-hello`" --plugin-dir `"$InTargetPlugin`""
        }
    }
}

Note "Doctor: for the full capability check (incl. the live depth-2 nested-spawn probe),"
Note "  run interactively in the sandbox: claude --plugin-dir `"$InTargetPlugin`" then /bn-doctor"

# --- Summary -----------------------------------------------------------------
Write-Host ""
Write-Host "=== Smoke summary ===" -ForegroundColor Cyan
foreach ($r in $results) {
    $color = if ($r.StartsWith('PASS')) { 'Green' } elseif ($r.StartsWith('FAIL')) { 'Red' } else { 'Yellow' }
    Write-Host "  $r" -ForegroundColor $color
}
Write-Host ""
if ($failed) {
    Write-Host "SMOKE: FAIL" -ForegroundColor Red
    exit 1
} else {
    Write-Host "SMOKE: PASS (baseline green: $passCount tests)" -ForegroundColor Green
    exit 0
}
