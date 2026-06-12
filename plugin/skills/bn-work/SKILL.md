---
name: bn-work
description: "Implement a plan via a delivery subtree: a lead makes per-unit atomizer decisions, spawns worktree-isolated unit-leads that self-test and mini-review, and a single integrator merges in dependency order. Commits per unit; never pushes. Use to execute an approved plan."
argument-hint: "[path to a plan doc | blank to discover the latest plan]"
---

# bn-work

Thin trunk-side entry to the Banyan delivery subtree. This skill does a few cheap
things -- locate the plan, run a pre-flight, open a run dir, build one envelope, and
dispatch `bn-delivery-lead` -- then presents the result the lead writes. ALL the
orchestration (per-unit atomizer decisions, worktree-isolated unit-leads, self-test,
mini-review, dependency-ordered integration, harvesting) lives inside the lead, not
here. Keep this procedure small.

The trunk NEVER switches the user's branch and NEVER pushes or opens a PR: executing a
plan is not permission to ship. The only writes this skill makes are the run dir and
the staged plan ref under it. Implement/commit happen inside the foreground lead, in
the user's session; push/PR remain a separate `bn-ship` step (permission cliff,
invariant 6).

Read `skills/bn-conventions/references/envelope.md`,
`skills/bn-conventions/references/ledger.md`, and `AGENTS.md` (esp. invariant 3
artifacts-over-prose, invariant 6 permission cliff).

## Step 1: Locate the plan

Resolve exactly one plan doc; never invent one.

- **Path arg given** -> use it verbatim. READ it.
- **No arg** -> discover the most recent `docs/plans/*-plan.md` (highest
  `YYYY-MM-DD-NNN` prefix; the plan naming is
  `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`). If the branch/context names a
  specific plan, prefer that. Do NOT ask the user before proceeding if a clear latest
  plan exists.
- **No plan found** -> STOP with a clear message naming where you looked
  (`docs/plans/`). Do NOT invent or draft a plan -- planning is `/bn-plan`'s job.

From the plan, READ the `## Implementation Units` (the stable U-IDs, each unit's
Files/Dependencies/Verification) and the `## Sequencing`. You only need enough to
populate the ledger and the envelope; the lead re-reads the plan in full.

## Step 2: Pre-flight

Detect the facts the lead needs; surface anything that would move the user's tree.

- **Base branch.** Note the current branch (`git rev-parse --abbrev-ref HEAD`) and
  treat it as the base the lead branches off. NEVER `git checkout` / `git switch` --
  selecting a base is not permission to move HEAD. If the tree is dirty in a way that
  blocks clean per-unit branching, SURFACE it (do not auto-stash or auto-commit).
- **Test command.** Detect the repo test command for the envelope: `package.json`
  `scripts.test` if present, else `node --test` (node project), `pytest` (python),
  `cargo test` (rust), `go test ./...` (go). "none detected" is a valid value -- record
  what you found.
- **Repo root.** `git rev-parse --show-toplevel` for the scaffolder `--root`.
- **Boundary check script.** Resolve the absolute path
  `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/check-boundary.mjs` and record it
  for the lead. If it is missing, set `boundary_check_script` to `missing`.

## Step 3: Open the run ledger

Scaffold a run dir so the lead reads files, not prose:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs work-<slug> --root <repo-root>
```

- `<slug>` -> kebab-case from the plan name (e.g. `work-add-oauth-login`). The script
  prints the run ID and absolute run dir on two lines; capture both.
- `<repo-root>` -> the value from Step 2.
- Fill the seeded `ledger.md`: set `## Objective` (implement this plan end to end), set
  the `## Plan` ref to the located plan path, record the base branch + detected test
  command under `## Facts / Context`, and append an opening `## Log` line.
- Seed the `## Units` table from the plan's Implementation Units -- one row per U-ID,
  owner `bn-delivery-lead`, status `pending`, artifact `docs/runs/<run-id>/progress/unit-<U>.md`
  (the unit-lead's progress artifact; its scoped mini-review pair lands separately at
  `findings/unit-<U>-review.json` and `findings/unit-<U>-spec-fidelity.json`). The lead owns
  these rows from here on (single-writer); the trunk does not rewrite them after dispatch.

## Step 4: Build the envelope and spawn bn-delivery-lead

Embed this envelope verbatim in the Agent prompt and spawn `bn-delivery-lead` (one
child; foreground, in the user's session). Fill every field.

```
=== BANYAN ENVELOPE ===
objective:       Implement the plan end to end for run <run-id>: per-unit atomizer
                 decisions, worktree-isolated unit-leads that self-test and mini-review,
                 and a single integrator merging in dependency order. Commit per unit.
artifact_path:   docs/runs/<run-id>/delivery-report.md
output_format:   Markdown delivery report: units done/blocked, merge + suite status,
                 per-unit mini-review summary (findings/unit-*-review.json and
                 findings/unit-*-spec-fidelity.json), and the final branch/commit state.
                 Writes progress/ and ledger Units rows too.
inputs:
  plan_path:       <docs/plans/...-plan.md>
  base_branch:     <current branch from Step 2>
  test_command:    <detected repo test command, or "none detected">
  repo_root:       <repo root>
  boundary_check_script: <absolute path from Step 2, or "missing">
boundaries:      NEVER push or open a PR -- push/PR is the trunk-level bn-ship step
                 (permission cliff, invariant 6); REPORT the need upward, do not fail
                 silently against it. NEVER switch the user's checked-out branch without
                 surfacing it. Commit per unit on that unit's own branch. NEVER touch
                 protected artifacts docs/brainstorms, docs/plans, docs/solutions,
                 docs/runs (except this run's own artifacts). One writer per file set;
                 parallel unit-leads work in disjoint git worktrees, merged by the
                 integrator.
tool_guidance:   Read, Grep, Glob, Bash, Edit to read the plan and implement ATOMIC units
                 inline itself, and run the test command; Write to its own run artifacts.
                 Agent spawns are limited to its allowlist -- `bn-unit-lead` (composite
                 units, in worktrees) and `bn-integrator` (the single merge writer).
                 Atomizer decisions are inline judgment, not a spawned agent; harvesting
                 is not in this lead's roster.
budget:
  max_children:    6
  depth_remaining: 3
effort_class:    <lightweight | standard | deep>
=== END ENVELOPE ===
```

- **effort_class by plan size/risk:** 1-2 trivial units -> `lightweight`; several units
  -> `standard`; many units, OR any plan with migrations / auth / payments -> `deep`.
- The envelope is the whole contract: the plan path, the base branch, the detected test
  command, the boundary check script, and the repo root all travel inside it. The lead
  re-reads the plan and owns the whole implement/test/review/merge subtree -- the trunk
  does not decompose units.

## Step 5: Present the result

When the lead returns, READ `docs/runs/<run-id>/delivery-report.md` (the artifact, not
the lead's final-message prose -- invariant 3) and present to the user:

- **units done / blocked** -- which U-IDs landed, which are blocked and why;
- **merge + suite status** -- did the integrator merge all units in dependency order,
  and did the test command pass on the integrated result, or is the result
  `UNVERIFIED (no test command)`;
- **per-unit mini-review summary** -- the gist from each `findings/unit-*-review.json` and
  `findings/unit-*-spec-fidelity.json` (any residual findings the unit-leads could not
  resolve);
- **boundary findings** -- any OUT files reported by the lead or integrator, plus the
  lead's adjudication for each accepted violation or re-dispatch;
- **branch / commit state** -- the per-unit branches and commits, and the integrated
  branch the work now sits on.

Then state explicitly that **push / PR remains the user's step** -- the lead commits
per unit but NEVER pushes or opens a PR; shipping is a separate `bn-ship` step
(permission cliff, invariant 6). Point the user at `docs/runs/<run-id>/` for the full
record (the delivery report, per-unit reviews, progress notes, and ledger).

## Permission cliff (invariant 6)

Implement and commit happen inside the FOREGROUND lead, in the user's session, where
edit permissions are live. Pushes and PRs never happen here at all -- they are the
trunk-level `bn-ship` step the user invokes after reviewing the record. If this skill
is somehow driven where edits would be auto-denied (e.g. a background context), the
lead REPORTS its blocked units instead of failing silently -- the delivery report then
reflects what could not be applied, and the user resolves from the record.
