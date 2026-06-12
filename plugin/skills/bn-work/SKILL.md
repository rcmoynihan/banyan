---
name: bn-work
description: "Implement a durable plan or lightweight direct-work spec via a delivery subtree: a lead makes per-unit atomizer decisions, spawns worktree-isolated unit-leads that self-test and mini-review, and a single integrator merges in dependency order. Commits per unit; never pushes."
argument-hint: "[path to docs/plans/*-plan.md | direct task/context | blank to discover the latest plan]"
---

# bn-work

Thin trunk-side entry to the Banyan delivery subtree. This skill does a few cheap
things -- resolve the delivery spec, run a pre-flight, open a run dir, build one
envelope, and dispatch `bn-delivery-lead` -- then presents the result the lead writes.
ALL the orchestration (per-unit atomizer decisions, worktree-isolated unit-leads,
self-test, mini-review, dependency-ordered integration, harvesting) lives inside the
lead, not here. Keep this procedure small.

The trunk NEVER switches the user's branch and NEVER pushes or opens a PR: executing
work is not permission to ship. The only writes this skill makes are the run dir, its
ledger setup, and -- in direct mode -- the run-local direct work spec. Implement/commit
happen inside the foreground lead, in the user's session; push/PR remain a separate
`bn-ship` step (permission cliff, invariant 6).

Read `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`, and
`${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (esp. invariant 3 artifacts-over-prose, invariant 6
permission cliff, and §2.2 self-recovery). Skip any already in your context.

## Step 1: Resolve the delivery input

Resolve exactly one delivery input. There are two modes:

- **Durable-plan mode** -- execute an existing plan doc under `docs/plans/`.
- **Direct mode** -- synthesize a lightweight run-local delivery spec from the command
  argument, readable non-plan input files, and the current conversation context.

Dispatch rules:

- **No arg** -> discover the most recent `docs/plans/*-plan.md` (highest
  `YYYY-MM-DD-NNN` prefix; the plan naming is
  `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md`). If the branch/context names a
  specific plan, prefer that. Do NOT ask the user before proceeding if a clear latest
  plan exists. If no plan exists, STOP with a clear message naming where you looked
  (`docs/plans/`) and tell the user to pass a direct task/context argument for direct
  mode or run `/bn-plan`.
- **Arg is a readable path resolving under `docs/plans/` and matching `*-plan.md`** ->
  use that plan verbatim. READ it.
- **Arg is a readable path resolving under `docs/plans/` but not matching `*-plan.md`** ->
  STOP and say `docs/plans/` is reserved for durable plan docs. Ask for a valid plan path
  or direct task/context outside `docs/plans/`.
- **Arg is anything else** -> enter direct mode. If the arg is a readable file path
  outside `docs/plans/`, READ it as input context. Otherwise treat the arg as direct task
  context. The current conversation is valid input in direct mode, but only after this
  skill materializes the load-bearing details into a run-local direct work spec before
  spawning the lead.

Never search for the latest durable plan when the user gives a non-plan argument. The
argument is the user's intent for this run; executing an unrelated latest plan would be
the wrong work.

## Step 2: Direct-to-work gate

In durable-plan mode, skip this gate and proceed to pre-flight.

In direct mode, fail closed. Before opening delivery, decide whether the task can be
made executable without a durable plan:

- **Scope:** The objective and done condition fit in 1-2 concrete sentences without
  inventing product behavior.
- **Units:** The work decomposes into 1-2 implementation units, or at most 3 when each is
  mechanical and low-risk.
- **Files:** Likely file boundaries can be named from the conversation, the input file,
  and a quick repo scan.
- **Dependencies:** Unit dependencies are absent or simple enough to express directly.
- **Verification:** There is an obvious runnable test, lint, typecheck, or manual check.
- **Risk:** The work does not touch auth, payments, migrations, data loss paths,
  security-sensitive behavior, broad refactors, public API contracts, rollout/rollback
  behavior, or other high-risk surfaces.
- **Open questions:** No unresolved decision would materially change the implementation.

If exactly one bounded fact is missing, ask one targeted question and resume from the
answer. If broader uncertainty remains, STOP and say which gate failed; recommend
`/bn-plan <task>` or a more explicit `/bn-work <task with files and done condition>`.

## Step 3: Pre-flight

Detect the facts the lead needs; surface anything that would move the user's tree.

- **Base branch.** Note the current branch (`git rev-parse --abbrev-ref HEAD`) and
  treat it as the base the lead branches off. NEVER `git checkout` / `git switch` --
  selecting a base is not permission to move HEAD. If the tree is dirty in a way that
  blocks clean per-unit branching, surface it in standalone mode (do not auto-stash or
  auto-commit). When called by `/bn-grow`, return blocker metadata for `residuals.md` if
  the dirty files are user-owned and unsafe to entangle; otherwise continue when the
  delivery lead can isolate the work safely.
- **Test command.** Detect the repo test command for the envelope. Prefer explicit
  project instructions first. The scaffolder emits this fact; use its `facts.test_command`
  and `facts.test_source` after Step 4. "none detected" is a valid value.
- **Repo root.** `git rev-parse --show-toplevel` for the scaffolder `--root`.
- **Boundary check script.** Resolve the absolute path
  `${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/check-boundary.mjs` and record it
  for the lead. If it is missing, set `boundary_check_script` to `missing`.

## Step 4: Open the run ledger and prepare the delivery spec

**Locate the run.** If you are already in a run (this skill was reached from `/bn-grow` or
a prior step that passed its run ID and run dir), reuse that run dir — do NOT scaffold a
new one; the delivery report and progress notes belong under the same `docs/runs/<run-id>/`
the grow ledger already tracks. Otherwise scaffold a run dir so the lead reads files, not
prose:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs work-<slug> \
  --root <repo-root> \
  --input <delivery-spec-path-if-known> \
  --objective "<execute this delivery spec or direct work task>" \
  --plan-ref "<docs/plans/...-plan.md OR pending direct-work spec>" \
  --actor trunk
```

- `<slug>` -> durable-plan mode: kebab-case from the plan name (e.g.
  `work-add-oauth-login`); direct mode: kebab-case from the direct task. The script emits
  JSON; capture `run_id`, `run_dir`, `ledger_path`, and `facts`.
- `<repo-root>` -> the value from Step 3.
- When reusing a grow run, call the script with `--run-id <run-id>` so it returns the same
  structured facts without overwriting the existing ledger. Append only the delivery-specific
  log line or progress note the active run needs.

Set the delivery spec path:

- **Durable-plan mode** -> `delivery_spec_path` is the located `docs/plans/*-plan.md`;
  `delivery_spec_kind` is `durable-plan`; the ledger `## Plan` ref is the plan path.
- **Direct mode** -> write `docs/runs/<run-id>/briefs/direct-work-plan.md`;
  `delivery_spec_kind` is `direct-work`; the ledger `## Plan` ref is
  `none -- direct work spec docs/runs/<run-id>/briefs/direct-work-plan.md`.

The direct work spec is written by the trunk as a run artifact, not by the user and not
under `docs/plans/`. Write it in this structure:

```markdown
# Direct work plan: <task name>

**Spec kind:** direct-work
**Status:** executable

## Source context

- Command: <the `/bn-work` argument, or "none">
- Input files: <paths read, or "none">
- Conversation context: <1-3 bullets with the agreed behavior/constraints>

## Direct-to-work gate

| criterion | result |
|-----------|--------|
| scope | pass: <why> |
| units | pass: <why> |
| files | pass: <why> |
| dependencies | pass: <why> |
| verification | pass: <why> |
| risk | pass: <why> |
| open questions | pass: <why> |

## Requirements

- R1 [confirmed] <testable requirement>

## Implementation Units

### U1: <name>

- **Goal:** <one sentence>
- **Dependencies:** <U-IDs or "none">
- **Files:** <repo-relative paths or dir/** entries>
- **Approach:** <concise implementation approach>
- **Verification:** <specific check, including the detected test command when relevant>

## Sequencing

<dependency order and parallelism, even if "U1 only">

## Verification (whole feature)

<end-to-end done check>
```

For both modes, READ the `## Implementation Units` and `## Sequencing` from
`delivery_spec_path`. You only need enough to populate the ledger and the envelope; the
lead re-reads the spec in full.

In a standalone run, seed the `## Units` table from the delivery spec's Implementation
Units -- one row per U-ID, owner `bn-delivery-lead`, status `pending`, artifact
`docs/runs/<run-id>/progress/unit-<U>.md` (the unit-lead's progress artifact; its scoped
mini-review pair lands separately at `findings/unit-<U>-review.json` and
`findings/unit-<U>-spec-fidelity.json`). The lead owns these rows from here on
(single-writer); the trunk does not rewrite them after dispatch. **When reusing the grow
run, do NOT re-seed this table** -- the grow trunk already owns it at phase granularity
(the `deliver` row the Phase 4 gate tracks), so per-unit detail stays in the delivery
lead's `progress/` notes rather than colliding with grow's phase rows.

## Step 5: Build the envelope and spawn bn-delivery-lead

Embed this envelope verbatim in the Agent prompt and spawn `bn-delivery-lead` (one
child; foreground, in the user's session). Fill every field.

```
=== BANYAN ENVELOPE ===
objective:       Implement the delivery spec end to end for run <run-id>: per-unit atomizer
                 decisions, worktree-isolated unit-leads that self-test and mini-review,
                 and a single integrator merging in dependency order. Commit per unit.
artifact_path:   docs/runs/<run-id>/delivery-report.md
output_format:   Markdown delivery report: units done/blocked, merge + suite status,
                 per-unit mini-review summary (findings/unit-*-review.json and
                 findings/unit-*-spec-fidelity.json), and the final branch/commit state.
                 Writes progress/ and ledger Units rows too.
inputs:
  delivery_spec_path: <docs/plans/...-plan.md OR docs/runs/<run-id>/briefs/direct-work-plan.md>
  delivery_spec_kind: <durable-plan | direct-work>
  base_branch:     <current branch from Step 3>
  test_command:    <detected repo test command, or "none detected">
  repo_root:       <repo root>
  boundary_check_script: <absolute path from Step 3, or "missing">
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
boundaries:      NEVER push or open a PR -- push/PR is the trunk-level bn-ship step
                 (permission cliff, invariant 6); REPORT the need upward, do not fail
                 silently against it. NEVER switch the user's checked-out branch without
                 surfacing it. Commit per unit on that unit's own branch. NEVER touch
                 protected artifacts docs/brainstorms, docs/plans, docs/solutions,
                 docs/runs (except this run's own artifacts). One writer per file set;
                 parallel unit-leads work in disjoint git worktrees, merged by the
                 integrator.
tool_guidance:   Read, Grep, Glob, Bash, Edit to read the delivery spec and implement
                 ATOMIC units inline itself, and run the test command; Write to its own run artifacts.
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

- **effort_class by spec size/risk:** direct mode always uses `lightweight`; durable
  specs with 1-2 trivial units -> `lightweight`; several units -> `standard`; many units,
  OR any spec with migrations / auth / payments -> `deep`.
- The envelope is the whole contract: the delivery spec path/kind, the base branch, the
  detected test command, the boundary check script, and the repo root all travel inside
  it. The lead re-reads the spec and owns the whole implement/test/review/merge subtree
  -- the trunk does not decompose units after dispatch.

When called by `/bn-grow`, the delivery report must give the grow trunk structured recovery
metadata for every blocked unit or unsafe pre-flight condition:

- `blocker_class`: `permission-cliff`, `no-safe-default`, `missing-external-authority`,
  `unsafe-working-tree`, or `recovery-exhausted`;
- `recovery_owner`: `bn-delivery-lead`, `bn-work`, `bn-grow`, or `user`;
- `next_safe_action`: the concrete action a resumed grow trunk can take;
- `resume_from_phase`: `deliver` unless planning must change, in which case `plan`.

## Step 6: Present the result

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
- **recovery metadata** -- any blocked unit or pre-flight blocker, with `blocker_class`,
  `recovery_owner`, `next_safe_action`, and `resume_from_phase`; say `none` when all units
  are done.

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
