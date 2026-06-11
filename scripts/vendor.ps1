#!/usr/bin/env pwsh
#requires -Version 7.0
<#
.SYNOPSIS
    Banyan vendoring pipeline + provenance / drift reporter.

.DESCRIPTION
    Reads vendor/vendor-map.json (the source of truth) and a pinned upstream SHA
    (a constant below) and reports drift between Banyan's local vendored files and
    EveryInc's compound-engineering plugin at the pinned commit.

    Two file modes (see vendor/MANIFEST.md):
      - verbatim : copied unchanged from the pinned SHA. -Status reports whether the
                   local file byte-matches the pinned-SHA upstream. -Sync may (re)write
                   these from the cache (refuses to overwrite a differing local file
                   unless -Force).
      - ported   : copied once then deliberately edited for Banyan. NEVER overwritten
                   or synced. -Status only confirms presence and points at the edit log.

    For BOTH modes, -Status also reports pinned-SHA-vs-upstream-HEAD drift per path so
    we can see whether upstream has moved on since we pinned (best-effort; skipped with
    a NOTE when offline).

.PARAMETER Status
    (default) Report drift for every mapped file. Read-only; never writes.

.PARAMETER Sync
    Copy verbatim-mode files from the pinned-SHA cache to their local paths. Refuses to
    overwrite an existing, differing local file unless -Force. Never touches ported files.

.PARAMETER Force
    With -Sync, allow overwriting an existing local verbatim file that differs from the cache.

.PARAMETER SyncInto
    With -Sync, write synced verbatim files into this directory (preserving their local
    relative paths) instead of their real repo locations. Used for safe self-testing so a
    sync never collides with files a sibling agent owns. Implies no -Force needed.

.PARAMETER NoFetch
    Skip the `git fetch` used for HEAD-drift detection (forces the offline path).

.EXAMPLE
    pwsh -File scripts/vendor.ps1 -Status

.EXAMPLE
    pwsh -File scripts/vendor.ps1 -Sync          # write verbatim files to real locations
    pwsh -File scripts/vendor.ps1 -Sync -Force   # ...overwriting local edits
#>
[CmdletBinding(DefaultParameterSetName = 'Status')]
param(
    [Parameter(ParameterSetName = 'Status')]
    [switch] $Status,

    [Parameter(ParameterSetName = 'Sync')]
    [switch] $Sync,

    [Parameter(ParameterSetName = 'Sync')]
    [switch] $Force,

    [Parameter(ParameterSetName = 'Sync')]
    [string] $SyncInto,

    [switch] $NoFetch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Constants ---------------------------------------------------------------

$PinnedSha   = '4719dc509fdc45656a830e3ed6060f674e206076'
$UpstreamUrl = 'https://github.com/EveryInc/compound-engineering-plugin.git'

# Repo root = parent of this script's directory (scripts/ -> repo root).
$ScriptDir = Split-Path -Parent $PSCommandPath
$RepoRoot  = Split-Path -Parent $ScriptDir

$VendorMapPath   = Join-Path $RepoRoot 'vendor/vendor-map.json'
$PreferredCache  = Join-Path $RepoRoot 'tmp/compound-engineering-upstream'
$FallbackCache   = Join-Path $RepoRoot 'tmp/vendor-cache'

# --- Output helpers ----------------------------------------------------------

$script:HadError = $false

function Write-Pass([string]$msg) { Write-Host "PASS " -ForegroundColor Green  -NoNewline; Write-Host $msg }
function Write-Note([string]$msg) { Write-Host "NOTE " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Fail([string]$msg) { Write-Host "FAIL " -ForegroundColor Red    -NoNewline; Write-Host $msg; $script:HadError = $true }
function Write-Section([string]$msg) { Write-Host ""; Write-Host "== $msg ==" -ForegroundColor Cyan }

# Run git in a given repo dir; throw on non-zero unless -AllowFail. Returns stdout (trimmed).
function Invoke-Git {
    param(
        [Parameter(Mandatory)] [string]   $RepoDir,
        [Parameter(Mandatory)] [string[]] $GitArgs,
        [switch] $AllowFail
    )
    $out = & git -C $RepoDir @GitArgs 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0 -and -not $AllowFail) {
        throw "git $($GitArgs -join ' ') failed (exit $code) in '$RepoDir': $out"
    }
    return [pscustomobject]@{ ExitCode = $code; Output = ($out | Out-String).TrimEnd() }
}

# --- Upstream cache management ------------------------------------------------

# Returns the path to a cache checkout positioned at the pinned SHA, or throws.
function Resolve-Cache {
    # Prefer the existing pinned clone if it is present and already at the pinned SHA.
    if (Test-Path (Join-Path $PreferredCache '.git')) {
        $head = (Invoke-Git -RepoDir $PreferredCache -GitArgs @('rev-parse', 'HEAD') -AllowFail)
        if ($head.ExitCode -eq 0 -and $head.Output -eq $PinnedSha) {
            Write-Pass "cache: reusing '$PreferredCache' at pinned SHA"
            return $PreferredCache
        }
        # Present but not at the pinned SHA: try to check it out if the object exists.
        $has = (Invoke-Git -RepoDir $PreferredCache -GitArgs @('cat-file', '-e', "$PinnedSha^{commit}") -AllowFail)
        if ($has.ExitCode -eq 0) {
            Invoke-Git -RepoDir $PreferredCache -GitArgs @('checkout', '--quiet', $PinnedSha) | Out-Null
            Write-Pass "cache: checked out pinned SHA in '$PreferredCache'"
            return $PreferredCache
        }
        Write-Note "cache: '$PreferredCache' exists but is not at the pinned SHA; falling back to '$FallbackCache'"
    }

    # Fall back to a managed clone under tmp/vendor-cache.
    if (-not (Test-Path (Join-Path $FallbackCache '.git'))) {
        $parent = Split-Path -Parent $FallbackCache
        if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        Write-Note "cache: cloning $UpstreamUrl into '$FallbackCache' (one-time)"
        & git clone --quiet $UpstreamUrl $FallbackCache 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "failed to clone upstream into '$FallbackCache' (offline?). Provide a pinned cache at '$PreferredCache' to work offline."
        }
    }
    $has = (Invoke-Git -RepoDir $FallbackCache -GitArgs @('cat-file', '-e', "$PinnedSha^{commit}") -AllowFail)
    if ($has.ExitCode -ne 0) {
        # Need to fetch the pinned object.
        & git -C $FallbackCache fetch --quiet origin 2>&1 | Out-Null
    }
    Invoke-Git -RepoDir $FallbackCache -GitArgs @('checkout', '--quiet', $PinnedSha) | Out-Null
    Write-Pass "cache: checked out pinned SHA in '$FallbackCache'"
    return $FallbackCache
}

# Robust raw-bytes read of a pinned blob via a temp file (git writes exact bytes).
function Get-PinnedBytesRaw {
    param([string]$CacheDir, [string]$UpstreamPath)
    $spec = "$PinnedSha`:$UpstreamPath"
    $exists = (Invoke-Git -RepoDir $CacheDir -GitArgs @('cat-file', '-e', $spec) -AllowFail)
    if ($exists.ExitCode -ne 0) { return $null }
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        # Redirect git's stdout to the temp file at the process level to preserve bytes.
        $psi = [System.Diagnostics.ProcessStartInfo]::new()
        $psi.FileName = 'git'
        $psi.ArgumentList.Add('-C'); $psi.ArgumentList.Add($CacheDir)
        $psi.ArgumentList.Add('cat-file'); $psi.ArgumentList.Add('blob'); $psi.ArgumentList.Add($spec)
        $psi.RedirectStandardOutput = $true
        $psi.UseShellExecute = $false
        $proc = [System.Diagnostics.Process]::Start($psi)
        $fs = [System.IO.File]::Open($tmp, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
        try { $proc.StandardOutput.BaseStream.CopyTo($fs) } finally { $fs.Dispose() }
        $proc.WaitForExit()
        if ($proc.ExitCode -ne 0) { return $null }
        return [System.IO.File]::ReadAllBytes($tmp)
    }
    finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Test-BytesEqual {
    param([byte[]]$A, [byte[]]$B)
    if ($null -eq $A -or $null -eq $B) { return $false }
    if ($A.Length -ne $B.Length) { return $false }
    for ($i = 0; $i -lt $A.Length; $i++) { if ($A[$i] -ne $B[$i]) { return $false } }
    return $true
}

# Best-effort: is the pinned-SHA version of $UpstreamPath identical to origin/HEAD's?
# Returns 'same', 'drifted', or 'unknown' (offline / fetch failed).
function Get-HeadDrift {
    param([string]$CacheDir, [string]$UpstreamPath, [ref]$FetchedOk)
    if ($NoFetch) { return 'unknown' }
    if (-not $FetchedOk.Value) { return 'unknown' }
    $headSpec = "origin/HEAD`:$UpstreamPath"
    $pinnedSpec = "$PinnedSha`:$UpstreamPath"
    $h = (Invoke-Git -RepoDir $CacheDir -GitArgs @('rev-parse', $headSpec) -AllowFail)
    $p = (Invoke-Git -RepoDir $CacheDir -GitArgs @('rev-parse', $pinnedSpec) -AllowFail)
    if ($h.ExitCode -ne 0 -or $p.ExitCode -ne 0) { return 'unknown' }
    if ($h.Output -eq $p.Output) { return 'same' } else { return 'drifted' }
}

# --- Load the vendor map -----------------------------------------------------

if (-not (Test-Path $VendorMapPath)) {
    Write-Fail "vendor map not found: $VendorMapPath"
    exit 1
}
try {
    $map = Get-Content -LiteralPath $VendorMapPath -Raw | ConvertFrom-Json
}
catch {
    Write-Fail "vendor map is not valid JSON: $($_.Exception.Message)"
    exit 1
}
if (-not $map.PSObject.Properties.Name.Contains('files')) {
    Write-Fail "vendor map missing 'files' array"
    exit 1
}
$entries = @($map.files)

# Sanity: the map's pinned SHA (if present) must match this script's constant.
if ($map.PSObject.Properties.Name.Contains('pinned_sha') -and $map.pinned_sha -ne $PinnedSha) {
    Write-Fail "pinned SHA mismatch: vendor-map.json has '$($map.pinned_sha)' but vendor.ps1 constant is '$PinnedSha'"
    exit 1
}

Write-Host "Banyan vendor pipeline" -ForegroundColor White
Write-Host "  pinned SHA : $PinnedSha"
Write-Host "  vendor map : $VendorMapPath ($($entries.Count) files)"

# Resolve the cache once.
try {
    $cache = Resolve-Cache
}
catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# Try a single fetch for HEAD-drift detection (best-effort, shared across files).
$fetchedOk = $false
if (-not $NoFetch) {
    & git -C $cache fetch --quiet origin 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $fetchedOk = $true
        # Ensure origin/HEAD points somewhere (older clones may lack the symref).
        $sym = (Invoke-Git -RepoDir $cache -GitArgs @('symbolic-ref', 'refs/remotes/origin/HEAD') -AllowFail)
        if ($sym.ExitCode -ne 0) {
            Invoke-Git -RepoDir $cache -GitArgs @('remote', 'set-head', 'origin', '--auto') -AllowFail | Out-Null
        }
    }
    else {
        Write-Note "git fetch failed (offline?); upstream HEAD-drift checks will be skipped"
    }
}
else {
    Write-Note "-NoFetch: skipping upstream HEAD-drift checks"
}

# =============================================================================
# STATUS (default)
# =============================================================================
function Invoke-Status {
    Write-Section "Status — $($entries.Count) mapped files"

    $verbatimDrift = 0
    $missingLocal  = 0
    $headDrift     = 0

    foreach ($e in $entries) {
        $local    = $e.local
        $upstream = $e.upstream
        $mode     = $e.mode
        $localAbs = Join-Path $RepoRoot $local

        # The pinned-SHA upstream bytes must exist for every mapped path.
        $pinnedBytes = Get-PinnedBytesRaw -CacheDir $cache -UpstreamPath $upstream
        if ($null -eq $pinnedBytes) {
            Write-Fail "$local  <-  $upstream  (mode=$mode): upstream path ABSENT at pinned SHA"
            continue
        }

        # HEAD-drift (best-effort, both modes).
        $drift = Get-HeadDrift -CacheDir $cache -UpstreamPath $upstream -FetchedOk ([ref]$fetchedOk)
        $driftTag = switch ($drift) {
            'same'    { 'upstream-HEAD: in sync' }
            'drifted' { 'upstream-HEAD: DRIFTED since pin'; }
            default   { 'upstream-HEAD: unknown' }
        }
        if ($drift -eq 'drifted') { $headDrift++ }

        $localExists = Test-Path -LiteralPath $localAbs

        if ($mode -eq 'ported') {
            if ($localExists) {
                Write-Pass "$local  (ported)  -- intentionally edited; never synced. See vendor/edits/. [$driftTag]"
            }
            else {
                Write-Note "$local  (ported)  -- not yet present / owned by sibling agent this wave. [$driftTag]"
                $missingLocal++
            }
        }
        elseif ($mode -eq 'verbatim') {
            if (-not $localExists) {
                Write-Note "$local  (verbatim)  -- not yet present / owned by sibling agent this wave. [$driftTag]"
                $missingLocal++
            }
            else {
                $localBytes = [System.IO.File]::ReadAllBytes($localAbs)
                if (Test-BytesEqual -A $localBytes -B $pinnedBytes) {
                    Write-Pass "$local  (verbatim)  -- byte-matches pinned upstream. [$driftTag]"
                }
                else {
                    Write-Note "$local  (verbatim)  -- DIFFERS from pinned upstream (local edits). [$driftTag]"
                    $verbatimDrift++
                }
            }
        }
        else {
            Write-Fail "$local : unknown mode '$mode' (expected 'ported' or 'verbatim')"
        }
    }

    Write-Section "Summary"
    Write-Host ("  files mapped            : {0}" -f $entries.Count)
    Write-Host ("  local files missing     : {0}  (expected during the porting wave)" -f $missingLocal)
    Write-Host ("  verbatim local-edit     : {0}" -f $verbatimDrift)
    if ($fetchedOk -and -not $NoFetch) {
        Write-Host ("  upstream-HEAD drifted   : {0}  (paths changed upstream since we pinned)" -f $headDrift)
    }
    else {
        Write-Host  "  upstream-HEAD drifted   : n/a  (offline / fetch skipped)"
    }
}

# =============================================================================
# SYNC (verbatim-only)
# =============================================================================
function Invoke-Sync {
    $intoLabel = if ($SyncInto) { "into throwaway dir '$SyncInto'" } else { "into real local paths" }
    Write-Section "Sync verbatim files $intoLabel"

    if ($SyncInto -and -not (Test-Path $SyncInto)) {
        New-Item -ItemType Directory -Force -Path $SyncInto | Out-Null
    }

    $written = 0; $skipped = 0
    foreach ($e in $entries) {
        if ($e.mode -ne 'verbatim') {
            if ($e.mode -eq 'ported') {
                Write-Note "$($e.local)  (ported)  -- skipped; ported files are never synced."
            }
            continue
        }

        $pinnedBytes = Get-PinnedBytesRaw -CacheDir $cache -UpstreamPath $e.upstream
        if ($null -eq $pinnedBytes) {
            Write-Fail "$($e.local)  <-  $($e.upstream): upstream path ABSENT at pinned SHA; cannot sync"
            continue
        }

        # Destination: throwaway dir (preserving relative path) or the real repo path.
        if ($SyncInto) {
            $destAbs = Join-Path $SyncInto $e.local
        }
        else {
            $destAbs = Join-Path $RepoRoot $e.local
        }
        $destDir = Split-Path -Parent $destAbs
        if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Force -Path $destDir | Out-Null }

        if ((Test-Path -LiteralPath $destAbs) -and -not $SyncInto) {
            $existing = [System.IO.File]::ReadAllBytes($destAbs)
            if (Test-BytesEqual -A $existing -B $pinnedBytes) {
                Write-Pass "$($e.local)  -- already in sync; nothing to do."
                continue
            }
            if (-not $Force) {
                Write-Note "$($e.local)  -- exists and DIFFERS from pinned upstream; refusing to overwrite (use -Force)."
                $skipped++
                continue
            }
        }

        [System.IO.File]::WriteAllBytes($destAbs, $pinnedBytes)
        Write-Pass "$($e.local)  -- wrote $($pinnedBytes.Length) bytes from pinned upstream."
        $written++
    }

    Write-Section "Summary"
    Write-Host ("  verbatim written : {0}" -f $written)
    Write-Host ("  skipped (differs): {0}  (re-run with -Force to overwrite local edits)" -f $skipped)
}

# --- Dispatch ----------------------------------------------------------------

if ($Sync) {
    Invoke-Sync
}
else {
    Invoke-Status
}

if ($script:HadError) {
    Write-Host ""
    Write-Fail "completed with errors (see FAIL lines above)"
    exit 1
}
Write-Host ""
Write-Host "Done." -ForegroundColor Green
exit 0
