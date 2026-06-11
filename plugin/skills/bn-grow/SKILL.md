---
name: bn-grow
description: "End-to-end feature pipeline: open a run ledger, then research -> plan (with a judge panel) -> deliver -> review, each owned by its own subtree, with explicit gates between, finishing at a ship gate (push stays yours) and a background knowledge-curation dispatch. The trunk stays small -- it holds intent and reads artifacts, the subtrees do the work."
argument-hint: "[feature/task description]"
---

# bn-grow

The whole feature, from one nearly-empty trunk. This is THIN choreography: the trunk
opens ONE run ledger, then dispatches each phase to a lead or skill, READS the artifact
that phase produces (the file, not the child's prose -- invariant 3), and checks an
explicit GATE before moving on. The trunk does NOT do the research, write the plan's
units, edit the code, or run the reviewers -- the subtrees do. The trunk holds intent
and enforces gates. That is the entire job.

Read `AGENTS.md` (esp. invariant 1 context-centric decomposition, invariant 3
artifacts-over-prose, invariant 6 permission cliff),
`skills/bn-conventions/references/ledger.md`, and
`skills/bn-conventions/references/envelope.md`. The phases you choreograph each have
their own contract: `bn-research-lead` (the agent), `/bn-plan`, `/bn-work`, `/bn-review`.
You invoke them; you do not reimplement them here.

ONE run ledger spans the whole grow. Every phase reuses the same run dir, so the ledger
tells the full story end to end -- research brief, plan ref, delivery report, review
verdict, and the log of gate decisions all live under one `docs/runs/<run-id>/`.

## Phase 1 -- Clarify and open the run

Capture the user's intent as a 2-3 line objective (what the feature is; the done
condition). If the request is genuinely ambiguous, ask ONE clarifying question before
opening the run -- otherwise proceed; do not stall the pipeline on a question.

Open ONE run ledger via the scaffolder:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs grow-<slug> --root <repo-root>
```

- `<slug>` -> kebab-case from the feature (e.g. `grow-add-oauth-login`). The script
  prints the run ID and absolute run dir on two lines; capture both.
- `<repo-root>` -> the target repo root (`git rev-parse --show-toplevel`).
- Fill the seeded `ledger.md`: write the 2-3 line intent into `## Objective`, seed one
  `## Units` row per phase (research / plan / deliver / review, owner = the lead or
  trunk that runs it, status `pending`, artifact = that phase's gate file), and append
  the opening `## Log` line. The `## Plan` ref stays a placeholder until Phase 3 writes
  the plan path.

This single run dir is reused by every phase below -- pass its run ID and run dir
through to `/bn-plan`, `/bn-work`, and `/bn-review` so they do NOT each open a fresh run.

## Phase 2 -- Research (subtree: bn-research-lead)

Spawn `bn-research-lead` with the feature framed as a research question and an envelope
naming `artifact_path: docs/runs/<run-id>/briefs/research-brief.md` (see `bn-research-lead`
for the envelope it expects; set `effort_class` by question breadth). The lead owns the
research subtree -- it dispatches the warranted researchers, chases threads, and
synthesizes ONE brief.

**GATE:** `docs/runs/<run-id>/briefs/research-brief.md` exists. READ that file (not the
lead's final-message prose). If the brief is MISSING, STOP and surface it -- do not plan
from nothing. If the brief stands but flags unresolved open questions that would change
the plan, note them for Phase 3 (and surface to the user) rather than barreling ahead.

## Phase 3 -- Plan (skill: /bn-plan, with a judge panel)

Invoke the `/bn-plan` flow with the research brief as input
(`docs/runs/<run-id>/briefs/research-brief.md`), reusing THIS run dir. `/bn-plan`
classifies effort, runs its generator + judge panel for standard/deep (skips it for
lightweight), and -- as the single writer of the plan (invariant 2) -- writes the plan
doc and records which draft won + where the judge score sheets live.

**GATE:** a plan doc exists at `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md` and the
ledger's `## Plan` ref points at it. READ the plan (its `## Implementation Units` and
`## Sequencing`). If NO plan file was produced, STOP and surface it -- there is nothing to
deliver.

**Natural checkpoint (do not hard-block):** this is the right moment for the user to
approve the plan before code changes. Surface the plan PATH and a one-line summary; let
the user steer if they want to. Do not block the pipeline with a question tool -- if the
user does not intervene, proceed to delivery. (Plan is `Status: draft`; delivery consumes
it next.)

## Phase 4 -- Deliver (skill: /bn-work)

Invoke the `/bn-work` flow on the plan from Phase 3, reusing THIS run dir. `/bn-work`
dispatches `bn-delivery-lead`, which makes per-unit atomizer decisions, fans composite
units out to worktree-isolated unit-leads that self-test and mini-review, and merges in
dependency order via a single integrator. It commits per unit; it NEVER pushes.

**GATE:** `docs/runs/<run-id>/delivery-report.md` exists, code actually changed, and the
report says the units are done (or names blocked units explicitly). READ the report (the
file, not the lead's prose). If units are BLOCKED, STOP at this gate and surface the
blocked units and why -- do not proceed to review pretending the feature landed. A blocked
delivery is reported, not hidden.

## Phase 5 -- Review (skill: /bn-review)

Invoke the `/bn-review` flow on the delivered changes (the integrated branch from
Phase 4), reusing THIS run dir. `/bn-review` dispatches `bn-review-lead`, which selects
the reviewer panel, dedupes findings, and fixes-and-verifies them in place, returning an
applied verdict. It commits on a clean tree; it NEVER pushes.

**GATE:** `docs/runs/<run-id>/review-verdict.md` exists and the test suite is green. READ
the verdict (the file, not the lead's prose). If the verdict is MISSING, or the suite is
RED, or material findings remain unaddressed, STOP and surface it -- a red suite or an
unresolved blocking finding does not pass the gate.

## Phase 6 -- Ship gate (permission cliff, invariant 6)

Present the review verdict to the user. **The pipeline NEVER pushes and NEVER opens a
PR.** Push / PR is a SEPARATE, explicit `bn-ship` step the USER invokes after reading the
record -- it is a trunk-level, foreground, permission-worthy action that stays the user's
call (invariant 6). State this clearly: the work is committed per unit and review-clean
on its branch, but it has NOT been shipped, and shipping is the user's next deliberate
step. Do not push here under any circumstances.

## Phase 7 -- Curate handoff (non-blocking)

Prepare curation for this run's `docs/runs/<run-id>/lessons-staging/` candidates. The
`bn-lesson-harvester` already fired at each subtree boundary throughout the grow, so
staging is already populated; curation is sleep-time consolidation, not a grow gate.

Use the lightest available handoff:

- If the runtime provides a real detached/background invocation mechanism, dispatch
  `/bn-curate <run-id>` (or the `bn-knowledge-curator` agent with `/bn-curate`'s envelope)
  through that mechanism and do not wait for it.
- If no detached/background mechanism is available, append the handoff to the ledger and
  present `/bn-curate <run-id>` as the follow-up command.

Do not claim a background curator is running unless one was actually started. Curation
consolidates knowledge files only and pushes nothing.

## Phase 8 -- Present

Give the user a SHORT narrative: what was built, the phase outcomes (research brief ->
plan -> delivery -> review verdict), the ship gate (committed, review-clean, NOT pushed --
ship is yours), and the curation handoff state (background started, or run
`/bn-curate <run-id>`). Point at the ledger path `docs/runs/<run-id>/ledger.md` -- it
tells the full story; the brief, plan, delivery report, and verdict all live under that
run dir.

**Trunk-stays-small target.** For a medium feature, the trunk should have spent a SMALL
fraction of its context window on the whole grow -- target under 20%. The trunk holds the
GATES and the artifact-READS, not the raw work; the subtrees carry the bulk. If the trunk
finds itself reading raw researcher dumps, transcribing plan units, or stepping through
diffs, the choreography has leaked work upward -- push it back into the owning subtree. The
ledger, not the trunk's context, is where the full run lives.

## Gates are explicit and fail-soft

Each phase has ONE gate, and the gate is a FILE plus a condition (see the per-phase GATE
lines). The trunk checks the gate before proceeding:

- research -> `briefs/research-brief.md` exists
- plan     -> `docs/plans/...-plan.md` exists and `ledger.md` `## Plan` points at it
- deliver  -> `delivery-report.md` exists, code changed, units done (not blocked)
- review   -> `review-verdict.md` exists and the suite is green

If a gate is NOT met -- no brief, no plan, blocked units, a red suite, a missing verdict --
STOP at that gate and surface it to the user with the run dir and what failed. Do NOT
barrel ahead to the next phase. Each phase's failure is reported up the trunk, never
swallowed. A run can be resumed from its ledger once the blocker is cleared.
