---
name: bn-doctor
description: "Capability doctor: checks the host environment (Claude Code >= 2.1.172, node, gh, python3, pwsh), verifies plugin assets are discoverable and well-formed, and runs a LIVE depth-2 nested-spawn probe plus an allowlist-enforcement probe. Prints a green/yellow/red checklist and leaves no files behind."
argument-hint: "[--static  (skip the live probe)]"
---

# Banyan Doctor

A capability check for the premise Banyan stands on: nested subagents. `/bn-hello` proves
the plugin loaded; this skill proves the *host can run it* — the version floor, the dev
toolchain, the asset integrity, and (live) whether a depth-2 nested spawn actually works
and whether the runtime enforces `Agent(...)` allowlists.

This is a health check, not a run: it opens **no run ledger**, and every file it creates
lives in a temporary probe directory that is deleted before the report prints. If the
argument contains `--static`, skip Check 3 entirely (note it as YELLOW / skipped).

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

**Plugin root (pre-resolved):** !`echo "${CLAUDE_PLUGIN_ROOT}"`

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
   not auto-denied by the permission cliff), outside `docs/runs/` (a health check is not
   a run, and the directory must be deletable):

   ```
   mkdir -p .claude/banyan-doctor/probe-<epoch-seconds>/
   ```

2. Generate a random token (e.g. `openssl rand -hex 8` or `$RANDOM$RANDOM`).

3. Spawn `bn-probe` **foreground** with this envelope, substituting the
   real paths and token:

   ```
   === BANYAN ENVELOPE ===
   objective:       Run the nesting and allowlist probes, write the probe report.
   artifact_path:   <probe-dir>/probe-report.txt
   output_format:   Two lines: "nesting: ..." and "allowlist: ...".
   doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                    ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md
   inputs:
     token:     <token>
     probe_dir: <probe-dir>
   boundaries:      Read and write ONLY inside <probe-dir>. Never touch docs/runs,
                    source, or any protected artifact.
   tool_guidance:   Read, Write; Agent(bn-probe-leaf) for the nesting probe.
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

5. **Cleanup**: `rm -rf .claude/banyan-doctor/` and confirm it is gone. The probe
   directory is the skill's own scratch space — it is not a protected artifact.

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
```

End with one line: overall GREEN (all green), YELLOW (any yellow, no red), or RED (any
red) — and for RED, the single most load-bearing failure to fix first.
