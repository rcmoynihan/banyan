#requires -Version 7
<#
.SYNOPSIS
    Materialize the Banyan fixture-repo into a sandbox git repo with a clean
    baseline on `main` and the seeded-bug overlay on `seeded-bugs`.

.DESCRIPTION
    The fixture lives at test/fixture-repo/. It holds:
      - a CLEAN baseline (src/, test/, .banyan/) that passes `node --test`, and
      - .fixture/seeded/<relpath> whole-file replacements that introduce the
        deliberate bugs catalogued in .fixture/BUG-INVENTORY.md.

    This script does NOT use hand-authored .patch files. It builds the diff from
    the two file trees:

      1. Wipe/create the sandbox.
      2. Copy test/fixture-repo/ into it, EXCLUDING the .fixture/ machinery dir.
      3. git init; set local user.name/user.email; add + commit "fixture: clean
         baseline" on branch `main`.
      4. Create branch `seeded-bugs`.
      5. Overlay every file under test/fixture-repo/.fixture/seeded/ onto its
         corresponding path in the sandbox.
      6. git add + commit "fixture: seeded bugs".

    Result: `git diff main..seeded-bugs` is exactly the seeded-bug diff, and
    `main` is green. The script prints the sandbox path and the diffstat.

    All git operations run INSIDE the sandbox only — never against the banyan
    repo itself.

.PARAMETER Sandbox
    Target sandbox directory. Default: tmp/fixture-sandbox (relative to repo root).
    tmp/ is gitignored, which is the intended location.

.PARAMETER Force
    Wipe an existing sandbox directory before recreating it.

.PARAMETER AllowOutsideTmp
    Escape hatch: permit a -Sandbox path outside <repo-root>/tmp/. Without this
    switch the script refuses any sandbox that does not resolve under tmp/, so a
    mistyped -Sandbox combined with -Force cannot recursively delete an arbitrary
    directory.

.EXAMPLE
    pwsh scripts/fixture-init.ps1 -Force
#>
[CmdletBinding()]
param(
    [string]$Sandbox = '',
    [switch]$Force,
    [switch]$AllowOutsideTmp
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Resolve repo root (this script lives in <root>/scripts) -----------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent $ScriptDir
$FixtureSrc = Join-Path $RepoRoot 'test/fixture-repo'
$SeededDir  = Join-Path $FixtureSrc '.fixture/seeded'

if (-not (Test-Path -LiteralPath $FixtureSrc)) {
    throw "Fixture source not found at: $FixtureSrc"
}

if ([string]::IsNullOrWhiteSpace($Sandbox)) {
    $Sandbox = Join-Path $RepoRoot 'tmp/fixture-sandbox'
}
# Normalize to an absolute path without requiring the path to exist yet.
$Sandbox = [System.IO.Path]::GetFullPath($Sandbox)

Write-Host "Banyan fixture-init" -ForegroundColor Cyan
Write-Host "  repo root : $RepoRoot"
Write-Host "  fixture   : $FixtureSrc"
Write-Host "  sandbox   : $Sandbox"

# --- Guard: refuse destructive deletion of anything outside <root>/tmp/ -------
# The sandbox is wiped with `Remove-Item -Recurse -Force` below, so a mistyped
# -Sandbox could erase an arbitrary directory. Require the resolved path to live
# under <repo-root>/tmp/ unless -AllowOutsideTmp is explicitly passed. Compare
# normalized full paths (case-insensitive on Windows) with a trailing separator
# so a sibling like "<root>/tmpfoo" cannot satisfy the prefix.
$TmpRoot = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot 'tmp')).TrimEnd([char]'\', [char]'/') + [System.IO.Path]::DirectorySeparatorChar
$SandboxFull = $Sandbox.TrimEnd([char]'\', [char]'/') + [System.IO.Path]::DirectorySeparatorChar
if ($Sandbox -eq $RepoRoot) {
    throw "Refusing to use the repo root as the sandbox."
}
if (-not $AllowOutsideTmp -and -not $SandboxFull.StartsWith($TmpRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to wipe a sandbox outside '$TmpRoot' (resolved: '$Sandbox'). Pass -AllowOutsideTmp to override."
}

# --- Wipe / create sandbox ---------------------------------------------------
if (Test-Path -LiteralPath $Sandbox) {
    if (-not $Force) {
        throw "Sandbox already exists: $Sandbox. Re-run with -Force to wipe it."
    }
    Write-Host "  wiping existing sandbox (-Force)" -ForegroundColor Yellow
    Remove-Item -LiteralPath $Sandbox -Recurse -Force
}
New-Item -ItemType Directory -Path $Sandbox -Force | Out-Null

# --- Step 1: copy baseline, EXCLUDING the .fixture/ machinery dir -------------
# Copy everything under the fixture except the top-level .fixture directory.
Get-ChildItem -LiteralPath $FixtureSrc -Force | Where-Object { $_.Name -ne '.fixture' } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $Sandbox -Recurse -Force
}

# --- helper: run git inside the sandbox, fail loudly on non-zero --------------
function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    & git -C $Sandbox @GitArgs
    if ($LASTEXITCODE -ne 0) {
        throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE"
    }
}

# --- Step 2/3: init, identity, baseline commit on `main` ---------------------
Invoke-Git init -q -b main
Invoke-Git config user.name  'Banyan Fixture'
Invoke-Git config user.email 'fixture@banyan.local'
# Keep the sandbox hermetic: don't sign, don't inherit hooks behavior surprises.
Invoke-Git config commit.gpgsign false
Invoke-Git add -A
Invoke-Git commit -q -m 'fixture: clean baseline'

Write-Host "  committed clean baseline on 'main'" -ForegroundColor Green

# --- Step 4: branch seeded-bugs ----------------------------------------------
Invoke-Git checkout -q -b seeded-bugs

# --- Step 5: overlay seeded whole-file replacements --------------------------
if (-not (Test-Path -LiteralPath $SeededDir)) {
    throw "Seeded overlay dir not found: $SeededDir"
}
$seededFiles = Get-ChildItem -LiteralPath $SeededDir -Recurse -File -Force
if ($seededFiles.Count -eq 0) {
    throw "No seeded files found under $SeededDir"
}
foreach ($f in $seededFiles) {
    # Path of this seeded file relative to the seeded root => same relpath in sandbox.
    $rel = [System.IO.Path]::GetRelativePath($SeededDir, $f.FullName)
    $dest = Join-Path $Sandbox $rel
    $destDir = Split-Path -Parent $dest
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
    Write-Host "    overlay -> $rel"
}

# --- Step 6: commit seeded bugs ----------------------------------------------
Invoke-Git add -A
Invoke-Git commit -q -m 'fixture: seeded bugs'
Write-Host "  committed seeded overlay on 'seeded-bugs'" -ForegroundColor Green

# Leave the sandbox checked out on main (clean/green) for downstream consumers.
Invoke-Git checkout -q main

# --- Report ------------------------------------------------------------------
Write-Host ""
Write-Host "Sandbox ready: $Sandbox" -ForegroundColor Cyan
Write-Host "  branches: main (clean/green), seeded-bugs (overlay)"
Write-Host ""
Write-Host "git diff --stat main..seeded-bugs:" -ForegroundColor Cyan
$diffstat = & git -C $Sandbox diff --stat main..seeded-bugs
if ($LASTEXITCODE -ne 0) { throw "git diff failed with exit code $LASTEXITCODE" }
if ([string]::IsNullOrWhiteSpace(($diffstat | Out-String).Trim())) {
    throw "git diff main..seeded-bugs is EMPTY — seeded overlay produced no diff."
}
$diffstat | ForEach-Object { Write-Host "  $_" }

# Emit the sandbox path on the last line for easy capture by callers.
Write-Output $Sandbox
