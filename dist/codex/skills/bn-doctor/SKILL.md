---
name: bn-doctor
description: "Capability doctor: checks the host environment (Claude Code >= 2.1.172, node, gh, python3, pwsh), verifies plugin assets are discoverable and well-formed, and runs a LIVE depth-2 nested-spawn probe plus allowlist, transcript locate+complete, and nested user-question probes. Prints a green/yellow/red checklist and leaves no files behind."
argument-hint: "[--static  (skip the live probe)]"
---

# Banyan Doctor

A capability check for the premise Banyan stands on: nested subagents. `/bn-hello` proves
the plugin loaded; this skill proves the *host can run it* — the version floor, the dev
toolchain, the asset integrity, and (live) whether a depth-2 nested spawn actually works,
whether the runtime enforces `Agent(...)` allowlists, whether a complete per-agent transcript
is locatable at the undocumented Claude Code path, and whether a nested probe has a reliable
user-question path.

This is a health check, not a run: it opens **no run ledger**, and every file it creates
lives in a temporary probe directory that is deleted before the report prints. If the
argument contains `--static`, skip the live Checks 3 and 4 entirely (note them as YELLOW /
skipped) — Check 4 reuses Check 3's probe, so they stand or fall together.

## Check 1 — Static environment (read-only Bash)

| probe | requirement | on failure |
|---|---|---|
| `claude --version` | parses to a version `>= 2.1.172` (the nested-subagent floor) | RED (also RED if the binary is missing or the version is unparseable) |
| `node -v` | present (the run-ledger scaffolder and fixtures are Node) | RED |
| `gh --version` | present (PR-facing skills: `/bn-ship`, `/bn-resolve-pr`) | YELLOW — only PR flows are affected |
| `python3 --version` | present (the solution-doc frontmatter validator) | YELLOW — only validation is affected |
| `pwsh -v` | present (PowerShell 7 runs the Banyan *repo's own* dev scripts) | YELLOW — plugin runtime never uses it; only Banyan-repo development is affected |

## Check 2 — Plugin assets (structural)

Resolve the plugin root the same way `/bn-hello` does:

**Plugin root (pre-resolved):** !`echo "~/.codex/skills/banyan"`

If the line above is empty or still shows the literal token, fall back to locating a
`.claude-plugin/plugin.json` whose `name` is `banyan` with the native file-search tool.
Then check, RED only on structural failure:

1. `<plugin-root>/.claude-plugin/plugin.json` parses as JSON and its `name` is `banyan`
   (report the `version`).
2. `<plugin-root>/agents/bn-*.md` and `<plugin-root>/skills/*/SKILL.md` are enumerable.
   **Report** the counts (e.g. "<N> agents, <M> skills found") — counts are informational,
   not asserted against a hardcoded number.
3. Every agent file's frontmatter `name:` equals its filename stem (the load-bearing
   invariant from AGENTS.md §3). Any mismatch is RED, naming the file.

## Check 3 — Live nested-spawn probe (skipped under `--static`)

1. Create the probe directory **inside the current repo** (so the nested leaf's Write is
   not auto-denied by the permission cliff), outside `.banyan/runs/` (a health check is not
   a run, and the directory must be deletable):

   ```
   mkdir -p .claude/banyan-doctor/probe-<epoch-seconds>/
   ```

2. Generate a random token (e.g. `openssl rand -hex 8` or `$RANDOM$RANDOM`).

3. Spawn `bn-probe` **foreground** with this envelope, substituting the
   real paths and token:

   ```
   === BANYAN ENVELOPE ===
   objective:       Run the nesting, allowlist, transcript, and user-question probes; write
                    the probe report.
   artifact_path:   <probe-dir>/probe-report.txt
   output_format:   Four lines: "nesting: ...", "allowlist: ...", "transcript: ...", and
                    "user-question: ...".
   doctrine:        ~/.codex/skills/banyan/AGENTS.md,
                    ~/.codex/skills/banyan/skills/bn-conventions/references/envelope.md
   inputs:
     token:        <token>
     probe_dir:    <probe-dir>
     session_path: <the resolved Claude Code session path, if you can derive it; omit
                    otherwise to exercise the locator's filesystem-discovery fallback>
   boundaries:      Read and write ONLY inside <probe-dir>. Never touch .banyan/runs,
                    source, or any protected artifact.
   tool_guidance:   Read, Write; Agent(bn-probe-leaf) for the nesting + transcript probe.
   budget:
     max_children:    2
     depth_remaining: 2
   effort_class:    lightweight
   === END ENVELOPE ===
   ```

4. **Verify the files yourself** — do not trust the probe's prose:
   - `<probe-dir>/probe-leaf.txt` exists and its first line equals the token →
     **GREEN: depth-2 nested spawning works.** Missing or wrong → **RED**, name what
     failed (no leaf file = the depth-2 spawn never ran; wrong token = it ran but the
     envelope's inputs did not survive the hop).
   - `<probe-dir>/probe-report.txt` `allowlist:` line — `enforced` → GREEN;
     `not-enforced` → **YELLOW**, with this honest note: Banyan's budgets and allowlists
     are prompt-level discipline by design (AGENTS.md); this result only means the
     runtime will not backstop them; `indeterminate` → YELLOW with the probe's reason.
   - `<probe-dir>/probe-report.txt` `user-question:` line — `unavailable` → GREEN; this is
     the expected trunk-only boundary. `available` → YELLOW and report that Banyan still keeps
     user decisions at the trunk because background nested prompts are not a reliable control
     surface. Missing or malformed → YELLOW.

5. **Cleanup**: `rm -rf .claude/banyan-doctor/` and confirm it is gone. The probe
   directory is the skill's own scratch space — it is not a protected artifact. **Read the
   probe report's `transcript:` line for Check 4 *before* cleanup** — once the probe directory
   is gone the report is gone with it.

## Check 4 — Transcript locate+complete probe (skipped under `--static`)

This is the kill-or-confirm for the recursive-consult-loop's #1 risk: the per-agent
transcript path is undocumented Claude Code internal state, and the consult loop's
continuation needs a **complete** transcript to be **locatable** at it. The probe is
**locate-and-complete only** (Design invariant DI2) — it confirms a non-empty, terminated,
non-growing file exists at the resolved path; it never parses any internal transcript field.

The work was already done inside Check 3: `bn-probe-leaf`, the deepest agent in the nesting
probe, ran `locate-transcript.mjs` on its own per-agent transcript path and reported a
`transcript:` line, which `bn-probe` carried into `<probe-dir>/probe-report.txt`. Read that
line (before the Check-3 cleanup) and grade it:

- `transcript: locatable+complete (<path>)` → **GREEN: a complete per-agent transcript is
  locatable** at the resolved path — print the path. Transcript mode is viable; the run may
  lock to transcript mode.
- `transcript: not-locatable (<reason>)` → **YELLOW: the transcript is not locatable on this
  host** — print the reason. This is **not** a failure: per R19/R20 the run locks to
  **checkpoint mode** and the consult loop degrades rather than breaks. Note: "the run will
  run in checkpoint mode."
- line missing or malformed → **YELLOW** (treat as not-locatable, reason `no-probe-result`).

Under `--static`, skip this check the same way as Check 3 (note it YELLOW / skipped).

## Report

Print one table and stop — no files are left behind, nothing else is written:

```
| check                      | status | detail                                  |
|----------------------------|--------|-----------------------------------------|
| claude >= 2.1.172          | GREEN  | 2.1.180                                 |
| node                       | GREEN  | v22                                     |
| gh / python3 / pwsh        | YELLOW | gh missing: /bn-ship, /bn-resolve-pr    |
| plugin manifest + assets   | GREEN  | banyan v0.1.0; <N> agents, <M> skills   |
| frontmatter name = stem    | GREEN  | all agents                              |
| depth-2 nested spawn       | GREEN  | token round-tripped                     |
| allowlist enforcement      | YELLOW | not enforced by runtime (prompt-level by design) |
| transcript locate+complete | GREEN  | locatable+complete at <resolved path>   |
| nested user question       | GREEN  | unavailable in nested probe (trunk-only) |
```

The `transcript locate+complete` row is YELLOW (`not-locatable → run will lock to checkpoint
mode`) rather than RED when the transcript is not found — checkpoint mode is the designed
degrade path, not a broken host.

End with one line: overall GREEN (all green), YELLOW (any yellow, no red), or RED (any
red) — and for RED, the single most load-bearing failure to fix first.
