#requires -Version 7
<#
.SYNOPSIS
    A/B capture harness: run Banyan's /bn-review and compound-engineering's
    /ce-code-review over the SAME diff, in isolated sandboxes, and record every
    artifact a judge needs to score them (see eval/review-ab/protocol.md). This
    is the U9 go/no-go gate instrument. It CAPTURES only; it does NOT score.

.DESCRIPTION
    ASSUMPTIONS (documented per the unit brief):

    * Both arms apply-and-commit on a clean tree (like-for-like). The banyan arm
      runs `/bn-review base:<Base>`; the ce arm runs `/ce-code-review base:<Base>`
      in DEFAULT mode (which applies + commits; mode:agent would only report and
      is deliberately NOT used - see protocol section 2.3).
    * Each arm runs in its OWN fresh sandbox copy, both starting from the
      identical review state, because each arm mutates the tree. They must not
      share a sandbox.
    * For the FIXTURE target (default, no -Target): scripts/fixture-init.ps1
      builds a sandbox with `main` (clean) + `seeded-bugs` (overlay). The arm
      operates on `seeded-bugs` with base `main`; the diff under review is
      `main..seeded-bugs`. -Base defaults to `main` for the fixture.
    * For a REAL target (-Target <repoPath> -Base <ref>): the harness copies the
      repo's tree (working-tree state) into a fresh sandbox, inits git there if
      needed, and ensures the change is visible as `<Base>..HEAD`. A dirty
      working tree is captured by committing a WIP snapshot inside the SANDBOX
      copy (never the original). The original repo is never touched.
    * BOTH plugins are copied INTO each sandbox and loaded via --plugin-dir
      pointing at the in-target copy. This avoids the file-access sandbox issue
      smoke.ps1 documented: a --plugin-dir OUTSIDE the session cwd cannot read
      its own SKILL.md / references/*.md (both plugins load reference files at
      runtime), which silently degrades the skill. The banyan in-target copy is
      placed by scripts/dev-install.ps1; the ce copy is placed by this harness.
    * Token/cost telemetry comes from `claude --output-format json` (`usage`,
      `total_cost_usd`). No OTEL is required.
    * `--dangerously-skip-permissions` is REQUIRED so nested finding-owners /
      validators may edit files headlessly. The sandbox is throwaway.

    DEFENSIVE behavior: a missing `claude`, an absent plugin dir, a timeout, or a
    crashed arm writes a clear <arm>/ERROR.txt and the harness CONTINUES with the
    other arm. The harness exits NON-ZERO only on its OWN failure to set up (e.g.
    cannot build any sandbox) - NOT because an arm found bugs or even errored. An
    arm error is recorded, not fatal.

    Per arm, the harness writes under <OutDir>/<arm>/:
      output.json    - raw stdout of the claude invocation (final json)
      stderr.txt     - stderr of the claude invocation
      timing.txt     - wall-clock seconds + start/end ISO timestamps
      pre-status.txt - `git status` + HEAD sha at the clean checkpoint (pre-run)
      applied.diff   - `git diff` of changes the arm applied to the tree
      applied-commits.txt - commits the arm added on top of the checkpoint
      test-after.txt - post-run test command output + exit code
      report.md      - final `result` text from output.json (BOTH arms; the
                       human-readable report artifact in the same place)
      verdict.md     - copied docs/runs/*/review-verdict.md (banyan; if present;
                       this is the structured verdict, kept ADDITIONALLY)
      telemetry.json - {tokens..., total_cost_usd, wall_clock_sec} extracted
      ERROR.txt      - present ONLY if the arm failed (with the reason)
    and a top-level <OutDir>/summary.txt + the captured paths are printed.

.PARAMETER Target
    A git repo path to review. Default: build a fresh fixture sandbox via
    fixture-init.ps1 (the standing reproducible target).

.PARAMETER Base
    Base ref for the diff under review. Default: `main` (the fixture baseline).

.PARAMETER Arms
    Which arms to run. Default: both. Values: banyan, ce.

.PARAMETER OutDir
    Where to write results. Default:
    eval/review-ab/results/<run-id>  where <run-id> is -RunId or a timestamp.

.PARAMETER RunId
    Explicit run id (folder name under results/). Default: a UTC timestamp.

.PARAMETER TimeoutSec
    Per-arm timeout for the claude invocation. Default: 1800 (30 min).

.PARAMETER DryRun
    Validate plumbing WITHOUT the full multi-minute review runs: build the
    sandboxes, copy both plugins in, confirm `claude -p "/bn-hello"
    --plugin-dir <copy>` works in each sandbox, and PRINT the exact
    /bn-review / /ce-code-review commands that WOULD run, then exit 0. Proves the
    plumbing (plugins resolvable, sandboxes built, hello works) without burning a
    real review. DryRun results go under results/<run-id> too (or
    results/dryrun if no RunId) and may be deleted afterward.

.PARAMETER KeepSandbox
    Do not delete the per-arm sandboxes after the run (default: keep them, since
    applied.diff/test-after are derived live during the run, not afterward; this
    switch is reserved for future cleanup behavior and currently always keeps).

.PARAMETER Deadvertise
    FIXTURE-ONLY. After fixture-init builds the source sandbox, transform the
    seeded-bugs branch so a cautious reviewer cannot recognize it as a deliberate
    fixture WITHOUT changing the actual buggy behavior: strip every `BUG-<n>`
    source-comment block from src/*.js, remove docs/solutions/, then amend the
    seeded-bugs commit so `main..seeded-bugs` carries no tells. The bugs MUST
    remain (node --test still fails ~7/30); the harness FAILS setup if the bug
    behavior changed. This enables a FAIR apply-vs-apply comparison: v1's Stage 5c
    abstains on obviously-fixture trees, so the de-advertised tree is what makes
    the apply arms comparable. See protocol.md section 2.4.

.EXAMPLE
    pwsh -File eval/review-ab/run-ab.ps1 -DryRun
    pwsh -File eval/review-ab/run-ab.ps1
    pwsh -File eval/review-ab/run-ab.ps1 -Deadvertise
    pwsh -File eval/review-ab/run-ab.ps1 -Target C:\proj -Base origin/main -Arms banyan
#>
[CmdletBinding()]
param(
    [string]$Target = '',
    [string]$Base = 'main',
    [ValidateSet('banyan', 'ce')]
    [string[]]$Arms = @('banyan', 'ce'),
    [string]$OutDir = '',
    [string]$RunId = '',
    [int]$TimeoutSec = 1800,
    [switch]$DryRun,
    [switch]$Deadvertise,
    [switch]$KeepSandbox
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# --- Resolve paths (this script lives in <root>/eval/review-ab) --------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot  = Split-Path -Parent (Split-Path -Parent $ScriptDir)
$ScriptsDir = Join-Path $RepoRoot 'scripts'
$FixtureInit = Join-Path $ScriptsDir 'fixture-init.ps1'
$DevInstall  = Join-Path $ScriptsDir 'dev-install.ps1'
$VendorScript = Join-Path $ScriptsDir 'vendor.ps1'
$CeUpstreamPlugin = Join-Path $RepoRoot 'tmp/compound-engineering-upstream/plugins/compound-engineering'
$FixtureCleanSrc = Join-Path $RepoRoot 'test/fixture-repo/src'

# --- Run id + out dir --------------------------------------------------------
if ([string]::IsNullOrWhiteSpace($RunId)) {
    $RunId = if ($DryRun) { 'dryrun' } else { (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z' }
}
if ([string]::IsNullOrWhiteSpace($OutDir)) {
    $OutDir = Join-Path $RepoRoot ("eval/review-ab/results/$RunId")
}
$OutDir = [System.IO.Path]::GetFullPath($OutDir)

# Sandboxes live under tmp/ (gitignored). One per arm, per run.
$SandboxRoot = Join-Path $RepoRoot ("tmp/review-ab/$RunId")

Write-Host "=== Banyan A/B review harness (U9) ===" -ForegroundColor Cyan
Write-Host "  repo root   : $RepoRoot"
Write-Host "  target      : $(if ([string]::IsNullOrWhiteSpace($Target)) { 'FIXTURE (fixture-init seeded-bugs)' } else { $Target })"
Write-Host "  base ref    : $Base"
Write-Host "  arms        : $($Arms -join ', ')"
Write-Host "  out dir     : $OutDir"
Write-Host "  sandbox root: $SandboxRoot"
Write-Host "  mode        : $(if ($DryRun) { 'DRY-RUN (no full review)' } else { 'FULL' })"
Write-Host "  deadvertise : $(if ($Deadvertise) { 'ON (fixture tells stripped; fair apply-vs-apply)' } else { 'off' })"
Write-Host ""

if ($Deadvertise -and -not [string]::IsNullOrWhiteSpace($Target)) {
    Write-Host "  NOTE: -Deadvertise is FIXTURE-ONLY and is IGNORED for a real -Target." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
New-Item -ItemType Directory -Path $SandboxRoot -Force | Out-Null

# --- Tally for the summary ---------------------------------------------------
$summary = [System.Collections.Generic.List[string]]::new()
$harnessFailed = $false
function Say([string]$m, [string]$c = 'Gray') { Write-Host "  $m" -ForegroundColor $c }
function Add-Summary([string]$m) { $script:summary.Add($m) }

# --- helper: run git, return exit code; caller decides if fatal --------------
function Git-In {
    param([string]$Dir, [Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $out = & git -C $Dir @GitArgs 2>&1 | Out-String
    return [pscustomobject]@{ Code = $LASTEXITCODE; Out = $out }
}
function Git-OrThrow {
    param([string]$Dir, [Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $r = Git-In $Dir @GitArgs
    if ($r.Code -ne 0) { throw "git $($GitArgs -join ' ') failed ($($r.Code)): $($r.Out)" }
    return $r.Out
}

# --- Prerequisite: claude on PATH (a global check; arms still guard) ---------
$claudeCmd = Get-Command claude -ErrorAction SilentlyContinue
if ($null -eq $claudeCmd) {
    Say "claude CLI NOT found on PATH. Arms cannot run; will record ERROR per arm." 'Yellow'
    Add-Summary "WARN  claude CLI not on PATH"
} else {
    Say "claude CLI: $($claudeCmd.Source)" 'Green'
}

# =============================================================================
# Build the SHARED review-state source ONCE, then clone per arm.
# For the fixture: fixture-init builds a sandbox; we treat that as the source.
# For a real target: we stage the target's tree into a source sandbox.
# =============================================================================
$SourceSandbox = Join-Path $SandboxRoot '_source'
$ReviewBranch = ''   # branch the arm checks out (fixture: seeded-bugs)
$TestCmd = @('node', '--test')   # default; overridden by detection for real targets
$DeadvertiseApplied = $false     # set true once the fixture has been de-advertised
$DeadvertiseFailCount = $null    # post-transform failing-test count (for the summary)

# --- FIX 3: de-advertise the fixture (fair apply-vs-apply) -------------------
# Transform the seeded-bugs branch of $dir so a cautious reviewer cannot
# recognize it as a deliberate fixture, WITHOUT changing buggy behavior:
#   (a) strip every contiguous `//` comment block anchored by a `BUG-<n>` line
#       from src/*.js (comment lines only; executable code is never touched),
#   (b) remove docs/solutions/ (it documents these exact bug classes),
#   (c) amend the seeded-bugs commit so main..seeded-bugs carries no tells,
#   (d) verify the bugs are still present: `node --test` must still FAIL the
#       same way (~7/30). If the failing count changed, a bug was accidentally
#       removed -> throw so the harness FAILS setup (the eval would be invalid).
# Returns the number of failing tests observed post-transform (for the summary).
function Invoke-Deadvertise {
    param([string]$dir, [string]$Branch)
    Say "De-advertising fixture (stripping BUG- tells + docs/solutions) on '$Branch' ..." 'Cyan'
    Git-OrThrow $dir checkout -q $Branch | Out-Null

    # (pre) Establish the buggy-behavior baseline BEFORE the transform so we can
    # prove the transform did not change it.
    $preFail = Get-FailingTestCount $dir
    if ($preFail -lt 1) {
        throw "de-advertise precheck: expected the seeded-bugs branch to FAIL node --test before transform, but saw $preFail failing. Fixture is not seeded as expected."
    }

    # (a) strip BUG-<n> comment blocks from src/*.js (comment lines only).
    $srcDir = Join-Path $dir 'src'
    $strippedTells = 0
    if (Test-Path -LiteralPath $srcDir) {
        $srcFiles = @(Get-ChildItem -LiteralPath $srcDir -Filter '*.js' -File -ErrorAction SilentlyContinue)
        foreach ($f in $srcFiles) {
            $lines = Get-Content -LiteralPath $f.FullName
            $kept = [System.Collections.Generic.List[string]]::new()
            $inBugBlock = $false
            foreach ($ln in $lines) {
                $trimmed = $ln.TrimStart()
                # Anchor: a line-comment containing a BUG-<number> tell. Drop it and
                # any IMMEDIATELY-FOLLOWING `//` continuation comment lines (the rest
                # of the same comment block). Stop at the first non-comment line so we
                # never touch executable code.
                if ($trimmed -match '^//.*BUG-[0-9]') { $inBugBlock = $true; $strippedTells++; continue }
                if ($inBugBlock) {
                    if ($trimmed -match '^//') { continue }
                    $inBugBlock = $false
                }
                $kept.Add($ln)
            }
            Set-Content -LiteralPath $f.FullName -Value $kept -Encoding utf8
        }
    }

    # (b) remove docs/solutions/ (a giveaway: it catalogs these exact bug classes).
    $solDir = Join-Path $dir 'docs/solutions'
    $removedSolutions = $false
    if (Test-Path -LiteralPath $solDir) {
        Remove-Item -LiteralPath $solDir -Recurse -Force
        $removedSolutions = $true
    }

    # (c) amend the seeded-bugs commit so main..seeded-bugs no longer carries the
    #     tells. main (the clean baseline) is untouched.
    Git-OrThrow $dir add -A | Out-Null
    Git-OrThrow $dir commit --amend --no-edit -q | Out-Null

    # Guard: no BUG-<n> tell may remain anywhere in src/*.js, and docs/solutions/
    # must be gone. Scan the working-tree files directly (Select-String) rather
    # than `git grep` so flag-like args (e.g. -E) are not mis-bound by PowerShell.
    $remaining = @()
    if (Test-Path -LiteralPath $srcDir) {
        $remaining = @(Select-String -Path (Join-Path $srcDir '*.js') -Pattern 'BUG-[0-9]' -ErrorAction SilentlyContinue)
    }
    if ($remaining.Count -gt 0) {
        $hits = ($remaining | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }) -join "`n"
        throw "de-advertise failed: BUG-<n> tells still present in src/*.js after strip:`n$hits"
    }
    if (Test-Path -LiteralPath $solDir) {
        throw "de-advertise failed: docs/solutions/ still present after removal."
    }

    # (d) the bugs MUST still be present: same failing count as before.
    $postFail = Get-FailingTestCount $dir
    if ($postFail -ne $preFail) {
        throw "de-advertise CHANGED buggy behavior: node --test failing count went $preFail -> $postFail. A bug was accidentally removed (not just a comment). Aborting setup."
    }
    Say "de-advertised: stripped $strippedTells BUG- comment block(s); docs/solutions removed=$removedSolutions; node --test still fails $postFail/$(Get-TotalTestCount $dir) (bugs intact)." 'Green'
    return $postFail
}

# Run `node --test` in $dir and return the number of failing tests parsed from
# the TAP summary (`# fail N`). Returns -1 if it could not be parsed.
function Get-FailingTestCount {
    param([string]$dir)
    Push-Location $dir
    try { $out = & node --test 2>&1 | Out-String } catch { $out = "node --test threw: $($_.Exception.Message)" } finally { Pop-Location }
    $m = [regex]::Match($out, '(?m)^#\s*fail\s+(\d+)')
    if ($m.Success) { return [int]$m.Groups[1].Value }
    return -1
}

# Total test count from the TAP summary (`# tests N`); -1 if unparsed.
function Get-TotalTestCount {
    param([string]$dir)
    Push-Location $dir
    try { $out = & node --test 2>&1 | Out-String } catch { $out = '' } finally { Pop-Location }
    $m = [regex]::Match($out, '(?m)^#\s*tests\s+(\d+)')
    if ($m.Success) { return [int]$m.Groups[1].Value }
    return -1
}

function Detect-TestCommand([string]$dir) {
    $pkg = Join-Path $dir 'package.json'
    if (Test-Path -LiteralPath $pkg) {
        try {
            $j = Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json
            if ($j.PSObject.Properties.Name -contains 'scripts' -and $j.scripts -and ($j.scripts.PSObject.Properties.Name -contains 'test')) {
                return @('npm', 'test')
            }
        } catch { }
        return @('node', '--test')
    }
    if ((Test-Path (Join-Path $dir 'pyproject.toml')) -or (Test-Path (Join-Path $dir 'pytest.ini')) -or (Test-Path (Join-Path $dir 'setup.cfg'))) { return @('pytest') }
    if (Test-Path (Join-Path $dir 'Cargo.toml')) { return @('cargo', 'test') }
    if (Test-Path (Join-Path $dir 'go.mod')) { return @('go', 'test', './...') }
    return @('node', '--test')
}

try {
    if ([string]::IsNullOrWhiteSpace($Target)) {
        # ---- FIXTURE target -------------------------------------------------
        Say "Building fixture source sandbox via fixture-init.ps1 ..." 'Cyan'
        if (-not (Test-Path -LiteralPath $FixtureInit)) { throw "fixture-init.ps1 not found: $FixtureInit" }
        & $FixtureInit -Sandbox $SourceSandbox -Force | Out-Null
        if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "fixture-init exited $LASTEXITCODE" }
        if (-not (Test-Path -LiteralPath (Join-Path $SourceSandbox '.git'))) { throw "fixture-init produced no .git in $SourceSandbox" }
        $ReviewBranch = 'seeded-bugs'
        if ([string]::IsNullOrWhiteSpace($Base)) { $Base = 'main' }
        $TestCmd = @('node', '--test')
        Say "fixture source ready: branches main + seeded-bugs; review = $Base..seeded-bugs" 'Green'
        Add-Summary "OK    fixture source sandbox built ($Base..seeded-bugs)"

        # FIX 3: optionally de-advertise the fixture BEFORE any arm runs, so the
        # apply-vs-apply comparison is fair (v1 abstains on obviously-fixture
        # trees). This mutates the shared _source seeded-bugs commit; each arm's
        # fresh copy inherits the de-advertised tree.
        if ($Deadvertise) {
            $DeadvertiseFailCount = Invoke-Deadvertise -dir $SourceSandbox -Branch $ReviewBranch
            $DeadvertiseApplied = $true
            # Leave _source checked out on main (matching fixture-init's contract).
            Git-OrThrow $SourceSandbox checkout -q main | Out-Null
            Add-Summary "OK    fixture DE-ADVERTISED (BUG- tells + docs/solutions stripped; bugs intact, node --test fails $DeadvertiseFailCount)"
        }
    } else {
        # ---- REAL target ----------------------------------------------------
        $TargetFull = [System.IO.Path]::GetFullPath($Target)
        if (-not (Test-Path -LiteralPath $TargetFull)) { throw "Target repo not found: $TargetFull" }
        if (-not (Test-Path -LiteralPath (Join-Path $TargetFull '.git'))) { throw "Target is not a git repo (no .git): $TargetFull" }
        Say "Staging real target into source sandbox: $TargetFull" 'Cyan'
        # Copy the whole working tree (including uncommitted changes) into the source sandbox.
        New-Item -ItemType Directory -Path $SourceSandbox -Force | Out-Null
        # Robust copy of the tree. Use git to enumerate tracked + untracked-but-not-ignored
        # would be ideal, but a direct tree copy preserves the exact working state.
        Copy-Item -LiteralPath (Join-Path $TargetFull '*') -Destination $SourceSandbox -Recurse -Force
        # Re-point: we want a self-contained git repo in the sandbox. Reuse the copied .git.
        if (-not (Test-Path -LiteralPath (Join-Path $SourceSandbox '.git'))) {
            throw "Copied target has no .git; cannot derive the $Base..HEAD diff."
        }
        # Verify Base resolves; if the working tree is dirty, snapshot a WIP commit
        # in the SANDBOX so the change is visible as Base..HEAD.
        Git-OrThrow $SourceSandbox config user.name  'Banyan AB' | Out-Null
        Git-OrThrow $SourceSandbox config user.email 'ab@banyan.local' | Out-Null
        Git-OrThrow $SourceSandbox config commit.gpgsign false | Out-Null
        $baseCheck = Git-In $SourceSandbox rev-parse --verify "$Base"
        if ($baseCheck.Code -ne 0) { throw "Base ref '$Base' does not resolve in the target. Pass a valid -Base." }
        $statusOut = (Git-OrThrow $SourceSandbox status --porcelain).Trim()
        if (-not [string]::IsNullOrWhiteSpace($statusOut)) {
            Say "Target working tree is dirty; committing a WIP snapshot in the sandbox copy." 'Yellow'
            Git-OrThrow $SourceSandbox add -A | Out-Null
            Git-OrThrow $SourceSandbox commit -q -m 'ab-harness: WIP snapshot of working tree' | Out-Null
        }
        $ReviewBranch = (Git-OrThrow $SourceSandbox rev-parse --abbrev-ref HEAD).Trim()
        $TestCmd = Detect-TestCommand $SourceSandbox
        Say "real target staged: review = $Base..HEAD on branch '$ReviewBranch'; test = $($TestCmd -join ' ')" 'Green'
        Add-Summary "OK    real target staged ($Base..HEAD, test: $($TestCmd -join ' '))"
    }
} catch {
    $harnessFailed = $true
    Say "FATAL building source sandbox: $($_.Exception.Message)" 'Red'
    Add-Summary "FAIL  could not build source sandbox: $($_.Exception.Message)"
}

# =============================================================================
# Per-arm execution.
# =============================================================================

function New-ArmSandbox {
    param([string]$Arm)
    # Fresh copy of the source sandbox for this arm (each arm mutates the tree).
    $armSandbox = Join-Path $SandboxRoot $Arm
    if (Test-Path -LiteralPath $armSandbox) { Remove-Item -LiteralPath $armSandbox -Recurse -Force }
    Copy-Item -LiteralPath $SourceSandbox -Destination $armSandbox -Recurse -Force
    return $armSandbox
}

function Resolve-BanyanPlugin {
    param([string]$Sandbox)
    # dev-install copies the banyan plugin into <sandbox>/.claude/banyan-marketplace/plugin
    # and prints that path on its last stdout line (smoke.ps1 reads it the same way).
    $out = & $DevInstall -Target $Sandbox -Mode copy
    if ($LASTEXITCODE -ne 0 -and $null -ne $LASTEXITCODE) { throw "dev-install exited $LASTEXITCODE" }
    $inTarget = ($out | Select-Object -Last 1)
    if ([string]::IsNullOrWhiteSpace($inTarget) -or -not (Test-Path -LiteralPath $inTarget)) {
        # Fall back to the known layout if the last line wasn't the path.
        $inTarget = Join-Path $Sandbox '.claude/banyan-marketplace/plugin'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $inTarget 'skills/bn-review/SKILL.md'))) {
        throw "Banyan in-target plugin copy missing bn-review SKILL.md at $inTarget"
    }
    return $inTarget
}

function Resolve-CePlugin {
    param([string]$Sandbox)
    # The ce plugin loads references/*.md at runtime, so it needs an in-target copy
    # too (same file-access sandbox reason as banyan). Copy the pinned upstream
    # plugin into the sandbox and return the in-target path.
    if (-not (Test-Path -LiteralPath $CeUpstreamPlugin)) {
        throw "compound-engineering plugin not found at $CeUpstreamPlugin. Run scripts/vendor.ps1 to populate the pinned cache, or clone the upstream repo there."
    }
    if (-not (Test-Path -LiteralPath (Join-Path $CeUpstreamPlugin 'skills/ce-code-review/SKILL.md'))) {
        throw "compound-engineering plugin at $CeUpstreamPlugin is missing skills/ce-code-review/SKILL.md (incomplete cache). Re-run scripts/vendor.ps1."
    }
    $ceDir = Join-Path $Sandbox '.claude/ce-plugin/compound-engineering'
    if (Test-Path -LiteralPath $ceDir) { Remove-Item -LiteralPath $ceDir -Recurse -Force }
    New-Item -ItemType Directory -Path (Split-Path -Parent $ceDir) -Force | Out-Null
    Copy-Item -LiteralPath $CeUpstreamPlugin -Destination $ceDir -Recurse -Force
    return $ceDir
}

function Invoke-ClaudeArm {
    # Run `claude -p <prompt> --plugin-dir <plugin> ...` in $Sandbox with a timeout.
    # Returns @{ Code; TimedOut; Stdout; Stderr; Seconds; Start; End }.
    #
    # IMPORTANT: the prompt contains SPACES (e.g. "/bn-review base:main"). We MUST
    # pass it as a single argv entry. Start-Process -ArgumentList and a bare array
    # both re-split space-containing elements into multiple arguments (verified:
    # the prompt arrives truncated at the first space), which silently breaks the
    # whole run. ProcessStartInfo.ArgumentList adds each string as EXACTLY one argv
    # entry with no re-splitting, so we use that. Output is read asynchronously to
    # avoid a pipe-buffer deadlock on large json, and stdin is closed immediately
    # to supply EOF under -p (the CLI otherwise waits ~3s on stdin; smoke.ps1 piped
    # $null for the same reason).
    param([string]$Sandbox, [string]$Prompt, [string]$PluginDir, [int]$Timeout, [switch]$JsonOut)
    $psi = [System.Diagnostics.ProcessStartInfo]::new()
    $psi.FileName = 'claude'
    $psi.WorkingDirectory = $Sandbox
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.RedirectStandardInput = $true
    [void]$psi.ArgumentList.Add('-p')
    [void]$psi.ArgumentList.Add($Prompt)
    [void]$psi.ArgumentList.Add('--plugin-dir')
    [void]$psi.ArgumentList.Add($PluginDir)
    [void]$psi.ArgumentList.Add('--dangerously-skip-permissions')
    if ($JsonOut) {
        [void]$psi.ArgumentList.Add('--output-format')
        [void]$psi.ArgumentList.Add('json')
    }
    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $psi
    $sbOut = [System.Text.StringBuilder]::new()
    $sbErr = [System.Text.StringBuilder]::new()
    $outEvt = Register-ObjectEvent -InputObject $proc -EventName OutputDataReceived -Action { if ($null -ne $EventArgs.Data) { [void]$Event.MessageData.AppendLine($EventArgs.Data) } } -MessageData $sbOut
    $errEvt = Register-ObjectEvent -InputObject $proc -EventName ErrorDataReceived  -Action { if ($null -ne $EventArgs.Data) { [void]$Event.MessageData.AppendLine($EventArgs.Data) } } -MessageData $sbErr
    $start = (Get-Date).ToUniversalTime()
    $timedOut = $false
    try {
        [void]$proc.Start()
        $proc.BeginOutputReadLine()
        $proc.BeginErrorReadLine()
        try { $proc.StandardInput.Close() } catch { }   # EOF on stdin
        if (-not $proc.WaitForExit($Timeout * 1000)) {
            $timedOut = $true
            try { $proc.Kill($true) } catch { }
            try { $proc.WaitForExit(5000) | Out-Null } catch { }
        }
        # Flush async buffers (WaitForExit() with no timeout drains pending events).
        try { $proc.WaitForExit() | Out-Null } catch { }
    } finally {
        Unregister-Event -SourceIdentifier $outEvt.Name -ErrorAction SilentlyContinue
        Unregister-Event -SourceIdentifier $errEvt.Name -ErrorAction SilentlyContinue
    }
    $end = (Get-Date).ToUniversalTime()
    $code = if ($timedOut) { -1 } else { $proc.ExitCode }
    $stdout = $sbOut.ToString()
    $stderr = $sbErr.ToString()
    $proc.Dispose()
    return [pscustomobject]@{
        Code = $code; TimedOut = $timedOut; Stdout = $stdout; Stderr = $stderr
        Seconds = [math]::Round(($end - $start).TotalSeconds, 1); Start = $start; End = $end
    }
}

function Extract-Telemetry {
    # Pull usage/total_cost_usd out of the claude json result text.
    param([string]$JsonText, [double]$WallSec)
    $tel = [ordered]@{ wall_clock_sec = $WallSec; total_cost_usd = $null; usage = $null; num_turns = $null; note = '' }
    if ([string]::IsNullOrWhiteSpace($JsonText)) { $tel.note = 'empty output'; return $tel }
    try {
        $j = $JsonText | ConvertFrom-Json
        if ($j.PSObject.Properties.Name -contains 'total_cost_usd') { $tel.total_cost_usd = $j.total_cost_usd }
        if ($j.PSObject.Properties.Name -contains 'usage') { $tel.usage = $j.usage }
        if ($j.PSObject.Properties.Name -contains 'num_turns') { $tel.num_turns = $j.num_turns }
    } catch {
        $tel.note = "could not parse json usage: $($_.Exception.Message)"
    }
    return $tel
}

# FIX 2: pull the final `result` text out of a claude json result (the
# human-readable report). Returns the text, or $null if there is no `result`.
function Get-ResultText {
    param([string]$JsonText)
    if ([string]::IsNullOrWhiteSpace($JsonText)) { return $null }
    try {
        $j = $JsonText | ConvertFrom-Json
        if ($j.PSObject.Properties.Name -contains 'result' -and -not [string]::IsNullOrWhiteSpace([string]$j.result)) {
            return [string]$j.result
        }
    } catch { }
    return $null
}

function Run-Arm {
    param([string]$Arm)
    $armOut = Join-Path $OutDir $Arm
    New-Item -ItemType Directory -Path $armOut -Force | Out-Null

    # Record the de-advertise mode in EACH arm dir so a scorer reading one arm's
    # folder knows the tree was de-advertised (fair apply-vs-apply).
    if ($DeadvertiseApplied) {
        Set-Content -LiteralPath (Join-Path $armOut 'deadvertised.txt') `
            -Value ("This run was DE-ADVERTISED (-Deadvertise).`nBUG- comment tells stripped from src/*.js and docs/solutions/ removed on '$ReviewBranch' BEFORE the arm ran.`nBuggy behavior preserved: node --test still fails $DeadvertiseFailCount on the de-advertised branch.`nRationale: v1's Stage 5c abstains on obviously-fixture trees, so de-advertising is required for a FAIR apply-vs-apply comparison. See protocol.md section 2.4.") -Encoding utf8
    }
    function ArmErr([string]$msg) {
        Set-Content -LiteralPath (Join-Path $armOut 'ERROR.txt') -Value $msg -Encoding utf8
        Say "  [$Arm] ERROR: $msg" 'Red'
        Add-Summary "ERROR ${Arm}: $msg"
    }

    Write-Host ""
    Write-Host "--- arm: $Arm ---" -ForegroundColor Cyan

    # 1. Fresh sandbox + checkout the review branch.
    try {
        $sandbox = New-ArmSandbox -Arm $Arm
        $co = Git-In $sandbox checkout -q $ReviewBranch
        if ($co.Code -ne 0) { throw "could not checkout review branch '$ReviewBranch': $($co.Out)" }
    } catch {
        ArmErr "sandbox setup failed: $($_.Exception.Message)"
        return
    }

    # 2. Resolve + place the plugin (in-target copy).
    #    Plugin-provided slash commands are NAMESPACED by plugin name under
    #    --plugin-dir (verified empirically: the bare /bn-review and /ce-code-review
    #    are NOT registered; claude lists them as `banyan:bn-review` and
    #    `compound-engineering:ce-code-review`). A bare name would mis-dispatch to a
    #    built-in (/review, /code-review) or fail. So invoke the fully-qualified
    #    `/<plugin>:<command>` form. $cmdName is also what the dry-run probe checks.
    $pluginDir = $null
    $prompt = $null
    $cmdName = $null
    try {
        if ($Arm -eq 'banyan') {
            $pluginDir = Resolve-BanyanPlugin -Sandbox $sandbox
            $cmdName = 'banyan:bn-review'
        } else {
            $pluginDir = Resolve-CePlugin -Sandbox $sandbox
            $cmdName = 'compound-engineering:ce-code-review'
        }
        $prompt = "/$cmdName base:$Base"
        Say "  [$Arm] plugin: $pluginDir" 'Green'
    } catch {
        ArmErr "plugin resolution failed: $($_.Exception.Message)"
        return
    }

    # 2b. FIX 1: exclude harness-injected scratch from git BEFORE the checkpoint.
    #     dev-install (banyan) / the ce copy place a plugin tree under the
    #     sandbox's .claude/, which leaves `git status --porcelain` DIRTY with an
    #     untracked .claude/ before the arm runs. That (a) pollutes the clean-tree
    #     commit-safety test the scorer relies on and (b) makes the eval invalid.
    #     Write the harness-injected paths into .git/info/exclude (local, never
    #     committed, IDENTICAL for both arms) so the tree reads clean. Then VERIFY
    #     porcelain is empty; if anything remains, WARN loudly so the scorer knows
    #     the clean-tree test is compromised.
    try {
        $excludeFile = Join-Path $sandbox '.git/info/exclude'
        $excludeDir = Split-Path -Parent $excludeFile
        if (-not (Test-Path -LiteralPath $excludeDir)) { New-Item -ItemType Directory -Path $excludeDir -Force | Out-Null }
        # Harness-injected scratch that must NOT count as a working-tree change:
        #   .claude/ - the in-sandbox plugin install (banyan dev-install + ce copy)
        $injected = @('.claude/')
        $existingExcludes = @()
        if (Test-Path -LiteralPath $excludeFile) { $existingExcludes = @(Get-Content -LiteralPath $excludeFile) }
        $toAdd = @($injected | Where-Object { $existingExcludes -notcontains $_ })
        if ($toAdd.Count -gt 0) { Add-Content -LiteralPath $excludeFile -Value $toAdd -Encoding utf8 }
    } catch {
        ArmErr "could not write .git/info/exclude for harness scratch: $($_.Exception.Message)"
        return
    }
    $porcelain = (Git-In $sandbox status --porcelain).Out
    if (-not [string]::IsNullOrWhiteSpace($porcelain.Trim())) {
        $warn = "WARN  ${Arm}: sandbox tree NOT clean after .claude/ exclusion; clean-tree commit-safety test is COMPROMISED. Residual porcelain:`n$($porcelain.Trim())"
        Set-Content -LiteralPath (Join-Path $armOut 'WARN-dirty-tree.txt') -Value $warn -Encoding utf8
        Say "  [$Arm] $warn" 'Yellow'
        Add-Summary $warn
    } else {
        Say "  [$Arm] sandbox tree CLEAN after .claude/ exclusion (porcelain empty)." 'Green'
    }

    # 3. Pre-run checkpoint: git status + HEAD sha (the now-clean checkpoint).
    $checkpointSha = (Git-OrThrow $sandbox rev-parse HEAD).Trim()
    $statusOut = (Git-In $sandbox status).Out
    Set-Content -LiteralPath (Join-Path $armOut 'pre-status.txt') -Value ("HEAD: $checkpointSha`n`n$statusOut") -Encoding utf8

    # 4. Record the exact command that will run.
    $modeNote = if ($DeadvertiseApplied) { "  # tree DE-ADVERTISED (-Deadvertise): BUG- tells + docs/solutions stripped, bugs intact" } else { '' }
    $cmdLine = "cd `"$sandbox`"; claude -p `"$prompt`" --plugin-dir `"$pluginDir`" --dangerously-skip-permissions --output-format json$modeNote"
    Set-Content -LiteralPath (Join-Path $armOut 'command.txt') -Value $cmdLine -Encoding utf8
    Say "  [$Arm] command: $cmdLine" 'Gray'

    if ($DryRun) {
        # DRY-RUN: prove the plumbing WITHOUT the multi-minute review. Two checks
        # per arm, both WITHOUT executing the review command:
        #   (a) the THIS-ARM plugin actually loaded -- confirmed by asking claude
        #       to list available slash commands and asserting the arm's NAMESPACED
        #       review command ($cmdName) appears. A plugin that failed to load (or
        #       a --plugin-dir blocked by the file-access sandbox) would not list it.
        #       This is the real "plugins resolvable" signal and it also pins the
        #       exact namespaced command name the full run will invoke.
        #   (b) for banyan only, /bn-hello additionally proves the manifest is
        #       readable from the in-target copy (greeting mentions "banyan").
        $probePrompt = "Do NOT run any command. List the EXACT names of all available slash commands containing the word 'review', one per line, including any plugin namespace prefix."
        $probe = Invoke-ClaudeArm -Sandbox $sandbox -Prompt $probePrompt -PluginDir $pluginDir -Timeout 180
        $cmdListed = ($probe.Stdout -match [regex]::Escape($cmdName))
        $probeOk = ($probe.Code -eq 0) -and $cmdListed
        $probeWhat = "command '$cmdName' is registered (plugin loaded)"

        $helloNote = ''
        if ($Arm -eq 'banyan') {
            $hello = Invoke-ClaudeArm -Sandbox $sandbox -Prompt '/bn-hello' -PluginDir $pluginDir -Timeout 180
            $helloOk = ($hello.Code -eq 0) -and ($hello.Stdout -match '(?i)banyan')
            $helloNote = "`n--- /bn-hello probe (exit=$($hello.Code)) ---`n$($hello.Stdout)"
            $probeOk = $probeOk -and $helloOk
            if (-not $helloOk) { $probeWhat += " + /bn-hello greeting FAILED" }
        }

        Set-Content -LiteralPath (Join-Path $armOut 'dryrun-probe.txt') `
            -Value ("probe: $probeWhat`ncommand-list prompt: $probePrompt`nexit=$($probe.Code) timedOut=$($probe.TimedOut)`n--- stdout (command list) ---`n$($probe.Stdout)$helloNote`n--- stderr ---`n$($probe.Stderr)") -Encoding utf8
        if ($probeOk) {
            Say "  [$Arm] DRY-RUN OK: $probeWhat" 'Green'
            Add-Summary "OK    ${Arm}: plugin resolvable, sandbox built, $probeWhat; would run: $prompt"
        } else {
            ArmErr "DRY-RUN probe failed for ${Arm}: ${cmdName} not listed (or hello failed). exit=$($probe.Code) timedOut=$($probe.TimedOut). Plugin/CLI plumbing problem. See dryrun-probe.txt."
        }
        return
    }

    # 5. FULL run: invoke the arm with json output, timed.
    Say "  [$Arm] running review (timeout ${TimeoutSec}s)..." 'Yellow'
    $res = Invoke-ClaudeArm -Sandbox $sandbox -Prompt $prompt -PluginDir $pluginDir -Timeout $TimeoutSec -JsonOut
    Set-Content -LiteralPath (Join-Path $armOut 'output.json') -Value $res.Stdout -Encoding utf8
    Set-Content -LiteralPath (Join-Path $armOut 'stderr.txt') -Value $res.Stderr -Encoding utf8
    Set-Content -LiteralPath (Join-Path $armOut 'timing.txt') `
        -Value ("wall_clock_sec: $($res.Seconds)`nstart_utc: $($res.Start.ToString('o'))`nend_utc: $($res.End.ToString('o'))`nexit_code: $($res.Code)`ntimed_out: $($res.TimedOut)") -Encoding utf8

    if ($res.TimedOut) {
        ArmErr "arm TIMED OUT after ${TimeoutSec}s (partial output captured in output.json/stderr.txt)."
        # Still capture the diff/test below - partial work may have applied.
    } elseif ($res.Code -ne 0) {
        # Non-zero exit is recorded but is NOT a harness failure; capture artifacts.
        Say "  [$Arm] claude exited $($res.Code) (recorded; continuing capture)" 'Yellow'
        Add-Summary "WARN  ${Arm}: claude exit $($res.Code) (see stderr.txt)"
    } else {
        Add-Summary "OK    ${Arm}: review ran in $($res.Seconds)s"
    }

    # 6. Capture applied changes (diff + new commits vs the checkpoint).
    $applied = (Git-In $sandbox diff $checkpointSha).Out
    # Also include any committed-on-top changes: diff checkpoint..HEAD covers commits;
    # plain `git diff <sha>` covers working-tree changes. Capture both signals.
    $committedDiff = (Git-In $sandbox diff "$checkpointSha..HEAD").Out
    $fullApplied = if (-not [string]::IsNullOrWhiteSpace($committedDiff.Trim())) { $committedDiff } else { $applied }
    Set-Content -LiteralPath (Join-Path $armOut 'applied.diff') -Value $fullApplied -Encoding utf8
    $commits = (Git-In $sandbox log --oneline "$checkpointSha..HEAD").Out
    Set-Content -LiteralPath (Join-Path $armOut 'applied-commits.txt') -Value $commits -Encoding utf8

    # 7. Post-run test result + exit code.
    try {
        Push-Location $sandbox
        $testExe = $TestCmd[0]
        $testArgs = @($TestCmd | Select-Object -Skip 1)
        $testOut = & $testExe @testArgs 2>&1 | Out-String
        $testExit = $LASTEXITCODE
    } catch {
        $testOut = "test command threw: $($_.Exception.Message)"
        $testExit = -1
    } finally {
        Pop-Location
    }
    Set-Content -LiteralPath (Join-Path $armOut 'test-after.txt') `
        -Value ("test_command: $($TestCmd -join ' ')`nexit_code: $testExit`n--- output ---`n$testOut") -Encoding utf8

    # 8. FIX 2: SYMMETRIC final-report capture for BOTH arms. Extract the final
    #    `result` text from output.json and write it to <arm>/report.md so each
    #    arm has a human-readable report artifact in the SAME place.
    $resultText = Get-ResultText -JsonText $res.Stdout
    if ($null -ne $resultText) {
        Set-Content -LiteralPath (Join-Path $armOut 'report.md') -Value $resultText -Encoding utf8
        Say "  [$Arm] report.md written (final result text)" 'Green'
    } else {
        Set-Content -LiteralPath (Join-Path $armOut 'report.md') -Value '(no `result` text found in output.json for this arm)' -Encoding utf8
        Say "  [$Arm] no 'result' text in output.json; report.md notes that" 'Yellow'
    }

    # 8b. ADDITIONALLY copy the banyan structured verdict
    #     (docs/runs/*/review-verdict.md) if present. This is kept alongside
    #     report.md, not in place of it.
    if ($Arm -eq 'banyan') {
        $verdicts = @(Get-ChildItem -Path (Join-Path $sandbox 'docs/runs') -Recurse -Filter 'review-verdict.md' -ErrorAction SilentlyContinue)
        if ($verdicts.Count -gt 0) {
            $v = $verdicts | Sort-Object LastWriteTime | Select-Object -Last 1
            Copy-Item -LiteralPath $v.FullName -Destination (Join-Path $armOut 'verdict.md') -Force
            Say "  [$Arm] verdict copied: $($v.FullName)" 'Green'
        } else {
            Set-Content -LiteralPath (Join-Path $armOut 'verdict.md') -Value '(no review-verdict.md found under docs/runs/ in the sandbox)' -Encoding utf8
            Say "  [$Arm] no review-verdict.md found under docs/runs/" 'Yellow'
        }
    }

    # 9. Telemetry extraction.
    $tel = Extract-Telemetry -JsonText $res.Stdout -WallSec $res.Seconds
    ($tel | ConvertTo-Json -Depth 8) | Set-Content -LiteralPath (Join-Path $armOut 'telemetry.json') -Encoding utf8

    Say "  [$Arm] captured -> $armOut" 'Green'
}

# --- Run the arms (only if the source sandbox built) -------------------------
if (-not $harnessFailed) {
    foreach ($arm in $Arms) {
        try {
            Run-Arm -Arm $arm
        } catch {
            # A bug in arm handling must not crash the harness; record + continue.
            $armOut = Join-Path $OutDir $arm
            New-Item -ItemType Directory -Path $armOut -Force | Out-Null
            Set-Content -LiteralPath (Join-Path $armOut 'ERROR.txt') -Value "unexpected arm failure: $($_.Exception.Message)`n$($_.ScriptStackTrace)" -Encoding utf8
            Say "[$arm] UNEXPECTED failure recorded: $($_.Exception.Message)" 'Red'
            Add-Summary "ERROR ${arm}: unexpected failure: $($_.Exception.Message)"
        }
    }
}

# =============================================================================
# Summary table.
# =============================================================================
Write-Host ""
Write-Host "=== capture summary ($RunId) ===" -ForegroundColor Cyan
$summaryText = [System.Collections.Generic.List[string]]::new()
$summaryText.Add("run id   : $RunId")
$summaryText.Add("mode     : $(if ($DryRun) { 'DRY-RUN' } else { 'FULL' })")
$summaryText.Add("target   : $(if ([string]::IsNullOrWhiteSpace($Target)) { 'fixture (main..seeded-bugs)' } else { "$Target ($Base..HEAD)" })")
$summaryText.Add("deadvert : $(if ($DeadvertiseApplied) { "ON - BUG- tells + docs/solutions stripped; bugs intact (node --test fails $DeadvertiseFailCount). Fair apply-vs-apply." } else { 'off' })")
$summaryText.Add("out dir  : $OutDir")
$summaryText.Add("")
foreach ($s in $summary) { $summaryText.Add($s) }
$summaryText.Add("")
$summaryText.Add("per-arm artifacts:")
foreach ($arm in $Arms) {
    $armOut = Join-Path $OutDir $arm
    if (Test-Path -LiteralPath $armOut) {
        $files = Get-ChildItem -LiteralPath $armOut -File -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }
        $summaryText.Add("  [$arm] $armOut")
        $summaryText.Add("        files: $($files -join ', ')")
    } else {
        $summaryText.Add("  [$arm] (no output dir - arm did not start)")
    }
}
foreach ($line in $summaryText) {
    $color = if ($line -match '^\s*(FAIL|ERROR)') { 'Red' } elseif ($line -match '^\s*WARN') { 'Yellow' } elseif ($line -match '^\s*OK') { 'Green' } else { 'Gray' }
    Write-Host "  $line" -ForegroundColor $color
}
Set-Content -LiteralPath (Join-Path $OutDir 'summary.txt') -Value ($summaryText -join "`n") -Encoding utf8

Write-Host ""
if ($harnessFailed) {
    Write-Host "A/B HARNESS: FAIL (could not build the source sandbox; no arm ran)" -ForegroundColor Red
    exit 1
}
# Arm-level errors are recorded in <arm>/ERROR.txt but are NOT a harness failure.
# Scoring is a separate, judgeable step (see SCORECARD-template.md). The harness
# exits 0 when it captured what it could.
Write-Host "A/B HARNESS: done. Results in $OutDir" -ForegroundColor Green
if ($DryRun) {
    Write-Host "DRY-RUN complete: plumbing validated. Delete tmp/review-ab/$RunId and results/$RunId when done." -ForegroundColor Cyan
}
exit 0
