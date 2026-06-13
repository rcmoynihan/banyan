---
name: bn-grow
description: "Hands-off end-to-end feature pipeline: open a run ledger, optionally run brainstorm intake for fuzzy ideas, then research -> spec stress -> plan (with a judge panel) -> deliver -> review, each owned by its own subtree, with explicit artifact gates and bounded self-recovery before user escalation. Finishes at a ship gate (push stays yours) and a background knowledge-curation dispatch. The trunk stays small -- it holds intent and reads artifacts, the subtrees do the work."
argument-hint: "[idea | feature/task description]"
---

# bn-grow

The whole feature, from one nearly-empty trunk. This is THIN choreography: the trunk
opens ONE run ledger, optionally runs a brainstorm intake for fuzzy ideas, then
dispatches each phase to a lead or skill, READS the artifact that phase produces (the
file, not the child's prose -- invariant 3), and checks an explicit GATE before moving
on. The trunk does NOT do the research, write the plan's units, edit the code, or run
the reviewers -- the subtrees do. The trunk holds intent and enforces gates. That is the
entire job.

Read `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (esp. invariant 1 context-centric decomposition,
invariant 3 artifacts-over-prose, invariant 6 permission cliff, and §2.2 self-recovery),
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md`, and
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md` (skip any already in your context). The phases you
choreograph each have their own contract: `/bn-brainstorm`, `bn-research-lead` (the agent),
`/bn-spec-stress`, `/bn-plan`, `/bn-work`, `/bn-review`. You invoke them; you do not
reimplement them here.

ONE run ledger spans the whole grow. Every phase reuses the same run dir, so the ledger
tells the full story end to end -- optional requirements intake, research brief, spec-stress
brief when present, plan ref, delivery report, review verdict, and the log of gate decisions
all live under one `.banyan/runs/<run-id>/`.

This skill is hands-off by default. Do not ask the user or exit at the first failed gate.
A failed gate is a recovery signal for the phase that owns it. Use the stage recovery
caps in **Gates recover before surfacing**; write `.banyan/runs/<run-id>/residuals.md` only
when bounded recovery is exhausted or the blocker requires user authority. Honor prompt-local
autonomy steering from the user without inventing formal modes.

## Phase 1 -- Assess intake and open the run

Capture the user's intent as a 2-3 line objective (what the feature is; the done
condition). Classify the input before choosing the intake path:

- **Clear feature/task** -- the request has a concrete done condition, expected behavior,
  and enough scope boundaries that planning should not invent product behavior.
- **Fuzzy idea** -- the request asks what to build, names an opportunity without a product
  shape, has contested scope, is ambitious enough that product choices matter, or uses
  language like "what if", "help me think through", "maybe", "explore", or "not sure".

If the request is ambiguous but not fuzzy, route it into fuzzy intake or proceed with explicit
assumptions. Ask before opening the run only when the missing decision would be unsafe to
default because it is product-defining, permission-sensitive, destructive, or dependent on
external authority the repo cannot infer.

Open ONE run ledger via the scaffolder. Pass the phase rows up front so the ledger is usable
without hand-written setup:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs grow-<slug> \
  --root <repo-root> \
  --objective "<2-3 line objective and done condition>" \
  --plan-ref "<pending plan path>" \
  --unit "research|bn-research-lead|pending|.banyan/runs/<run-id>/briefs/research-brief.md" \
  --unit "spec-stress|trunk|pending|.banyan/runs/<run-id>/briefs/spec-stress.md" \
  --unit "plan|trunk|pending|.banyan/plans/<pending-plan-path>" \
  --unit "deliver|bn-delivery-lead|pending|.banyan/runs/<run-id>/delivery-report.md" \
  --unit "review|bn-review-lead|pending|.banyan/runs/<run-id>/review-verdict.md"
```

- `<slug>` -> kebab-case from the feature (e.g. `grow-add-oauth-login`). The script emits
  JSON; capture `run_id`, `run_dir`, `ledger_path`, and `facts`.
- `<repo-root>` -> the target repo root (`git rev-parse --show-toplevel`).
- If fuzzy intake is in scope, include an additional
  `--unit "intake|trunk|pending|.banyan/brainstorms/<pending-requirements>.md"` row. The script
  seeds `## Objective`, `## Plan`, `## Facts / Context`, and the phase rows.

This single run dir is reused by every phase below -- pass its run ID and run dir to
`/bn-spec-stress`, `bn-plan-lead`, `/bn-work`, and `/bn-review` so they do NOT each open a
fresh run.

When resuming from an existing plan-created run, normalize the ledger before entering phases
that were not seeded by the original `/bn-grow` scaffold. If `## Units` has only a `plan`
row, add missing phase rows for `deliver|bn-delivery-lead|pending|.banyan/runs/<run-id>/delivery-report.md`
and `review|bn-review-lead|pending|.banyan/runs/<run-id>/review-verdict.md`. Append a `trunk`
log line that names the resume phase and the rows added. Do this once before the phase dispatch;
do not rewrite existing rows or replace phase rows with per-implementation-unit rows.

### Fuzzy intake (skill: /bn-brainstorm)

If the input is a fuzzy idea, invoke the `/bn-brainstorm` flow in **grow intake mode**:

- Use the user's raw idea as the feature description.
- Reuse THIS run dir for any optional research grounding the brainstorm needs; its
  grounding brief path is `.banyan/runs/<run-id>/briefs/brainstorm-grounding.md`.
- Run through the requirements artifact step, then return control here without offering
  `/bn-brainstorm`'s standalone handoff menu.
- Accept either a requirements document path under `.banyan/brainstorms/` or a concise
  finalized requirements summary when the brainstorm correctly decides no document is
  warranted.

**GATE:** fuzzy intake yields a requirements document or finalized requirements summary.
READ the requirements document if one exists. If intake leaves a `Resolve Before Planning`
section or equivalent blocking open question, run one intake disposition pass: ask
`/bn-brainstorm` in grow intake mode to either revise the requirements, record a safe
assumption, or identify the item as no-safe-default. Continue when the blocker is resolved
or safely recorded. If no safe default exists, write `residuals.md` and exit with the
blocker, evidence, recovery attempt, and resume phase.

If the input is already a clear feature/task, skip fuzzy intake and treat the 2-3 line
objective as the finalized requirements summary.

## Phase 2 -- Research (subtree: bn-research-lead)

Spawn `bn-research-lead` with the finalized requirements document or summary framed as a
research question and an envelope naming `artifact_path:
.banyan/runs/<run-id>/briefs/research-brief.md` plus `doctrine:
${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md` (see
`bn-research-lead` for the envelope it expects; set `effort_class` by question breadth).
If fuzzy intake produced
`.banyan/runs/<run-id>/briefs/brainstorm-grounding.md`, include that path in `inputs` so the
research lead can reuse it instead of repeating the same grounding. The lead owns the
research subtree -- it dispatches the warranted researchers, chases threads, and
synthesizes ONE brief.

**GATE:** `.banyan/runs/<run-id>/briefs/research-brief.md` exists. READ that file (not the
lead's final-message prose). If the brief is missing or malformed, re-enter
`bn-research-lead` once with the same run dir, the missing artifact path, and the concrete
artifact failure. If the brief stands but flags unresolved open questions that would change
the plan, send those questions into spec stress or planning as explicit assumptions unless
they have no safe default. If recovery still leaves no usable brief, write `residuals.md`
with phase `research` and exit.

## Phase 3 -- Stress requirements (skill: /bn-spec-stress)

Run `/bn-spec-stress` when a requirements document exists and any of these are true:

- intake was fuzzy;
- the expected work is standard/deep rather than lightweight;
- the research or brainstorm grounding surfaced uncertainty, unresolved assumptions, contested
  evidence, or downstream implications;
- the user asked for stress testing.

Skip this phase for a clear lightweight task when no ambiguity flags are present. If there is
no requirements document and only a concise finalized summary, usually skip spec stress; run it
only when the feature is standard/deep or the research brief names ambiguity that can affect
the plan.

When running spec stress, invoke `/bn-spec-stress` with the requirements document path, or with
the finalized requirements summary if no document exists. Reuse THIS run dir. The output path is
`.banyan/runs/<run-id>/briefs/spec-stress.md`.

**GATE:** if skipped, record the skip and reason in the ledger. If run, `spec-stress.md`
exists and the trunk READS it (the file, not the skill's final-message prose). If
`Resolve Before Planning` is non-empty, run one disposition pass through `/bn-spec-stress`
or `/bn-brainstorm` using the same run dir: promote safe items into `Plan Inputs` or
`Accepted Risks`, revise the requirements when the answer is inferable, and leave only
no-safe-default decisions in `Resolve Before Planning`. Continue when that section is
empty. If no-safe-default blockers remain, write `residuals.md` with phase `spec-stress`
and exit.

## Phase 4 -- Plan (subtree: bn-plan-lead, with a judge panel)

Spawn `bn-plan-lead` with the requirements document path when fuzzy intake produced one.
Otherwise pass the finalized requirements summary (the clear-task objective or the no-doc
brainstorm summary). Reuse THIS run dir so `bn-plan-lead` also reads
`.banyan/runs/<run-id>/briefs/research-brief.md`, `.banyan/runs/<run-id>/briefs/spec-stress.md`,
and any referenced brainstorm grounding brief. The plan lead classifies effort; runs its
generator + judge panel for standard/deep (skips it for lightweight); dispatches the checker
when warranted; writes the plan doc as the single writer; records planning detail in
`progress/bn-plan-lead.md`; writes `.banyan/runs/<run-id>/briefs/plan-lead-report.md`; and
harvests lessons before returning.

```
=== BANYAN ENVELOPE ===
objective:       Produce a durable implementation plan for the grow run's finalized scope.
artifact_path:   .banyan/runs/<run-id>/briefs/plan-lead-report.md
output_format:   Markdown plan lead report with verdict, plan path, run path, effort, panel,
                 precheck, assumed requirements, and recovery metadata.
inputs:
  task:            <finalized requirements summary or one-line label for requirements_doc>
  primary_input:   <requirements doc path, or "none">
  active_run_id:   <run-id>
  active_run_dir:  .banyan/runs/<run-id>/
  invocation:      grow
  repo_root:       <repo root>
  precheck:        auto
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md
boundaries:      The lead may write this run's planning artifacts and one durable plan under
                 .banyan/plans/. It must not edit source, switch branches, push, open a PR,
                 delete protected artifacts, or write outside this run's artifacts.
tool_guidance:   Use the run scaffolder once with --run-id; Read/Grep/Glob/Bash for grounding;
                 Write the plan, progress, ledger plan ref, and report; Agent(...) only for
                 bn-plan-generator, bn-plan-judge, bn-plan-checker, and bn-lesson-harvester.
budget:
  max_children:    8
  depth_remaining: 3
effort_class:    auto
=== END ENVELOPE ===
```

**GATE:** a plan doc exists at `.banyan/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md` and the
ledger's `## Plan` ref points at it. READ `.banyan/runs/<run-id>/briefs/plan-lead-report.md`,
then READ the plan's `## Implementation Units` and `## Sequencing`. If no plan file was
produced, or the report surfaces an infeasible claim that has a clear repo-grounded fix,
re-enter `bn-plan-lead` once with the same run dir and the research/spec-stress artifacts
explicitly named. The repair pass may correct the winning draft, fall back to a runner-up
draft, or convert safe unknowns to `[assumed]` R-IDs. If no usable plan exists after the
repair pass, write `residuals.md` with phase `plan` and exit.

**Natural checkpoint (do not hard-block):** this is the right moment for the user to
approve the plan before code changes. Surface the plan PATH, a one-line summary, and any
`[assumed]` R-IDs with their `(confirm by: ...)` clauses; if none exist, say there are no
assumed requirements. Let the user steer if they want to. Do not block the pipeline with a
question tool -- if the user does not intervene, proceed to delivery. (Plan is `Status:
draft`; delivery consumes it next.)

## Phase 5 -- Deliver (skill: /bn-work)

Before invoking delivery, ensure the active ledger has a `deliver` row. If this grow resumed
from a plan-only run and the row is missing, add it now with owner `bn-delivery-lead`, status
`in-progress`, and artifact `.banyan/runs/<run-id>/delivery-report.md`; also ensure a pending
`review` row exists for the next gate. Append a `trunk: entering deliver via /bn-work` log line
before dispatch so a user tailing the ledger can see delivery started even if the child spawn
fails before writing its report.

Invoke the `/bn-work` flow on the plan from Phase 4, reusing THIS run dir. `/bn-work`
dispatches `bn-delivery-lead`, which makes per-unit atomizer decisions, fans composite
units out to worktree-isolated unit-leads that self-test and mini-review, and merges in
dependency order via a single integrator. It commits per unit; it NEVER pushes.

**GATE:** `.banyan/runs/<run-id>/delivery-report.md` exists, code actually changed, and the
report says the units are done or names blocked units explicitly. READ the report (the
file, not the lead's prose). If the delivery spawn returns an internal/missing tool result
and `delivery-report.md` does not exist, append a `trunk` log line with the dispatch failure
and re-enter `/bn-work` once with the same run dir, same plan path, and the concrete note
`previous delivery dispatch returned missing/internal tool result before report`. If units
are blocked, inspect the report's recovery section. When the blocker is recoverable by
delivery ownership (boundary under-scope, shared-file assignment, worktree isolation fallback,
a bounced unit with a concrete fix path), re-enter `/bn-work` once with the blocked-unit
context and the same run dir. Do not proceed to review unless the report says all required
units are done. If delivery remains blocked after the retry, write `residuals.md` with phase
`deliver` and exit.

## Phase 6 -- Review (skill: /bn-review)

Invoke the `/bn-review` flow on the delivered changes (the integrated branch from
Phase 5), reusing THIS run dir. `/bn-review` dispatches `bn-review-lead`, which selects
the reviewer panel, dedupes findings, and fixes-and-verifies them in place, returning an
applied verdict. It commits on a clean tree; it NEVER pushes.

**GATE:** `.banyan/runs/<run-id>/review-verdict.md` exists and the test suite is green, OR the
verdict explicitly carries `UNVERIFIED (no test command)`. READ the verdict (the file, not
the lead's prose). If the verdict is missing, the suite is red, or material findings remain
unaddressed with a clear fix/routing path, re-enter `/bn-review` once with the same run dir
and the verdict's recovery metadata. If the result is still red or still carries unresolved
blocking findings after that retry, write `residuals.md` with phase `review` and exit. If the
gate passes via `UNVERIFIED (no test command)`, surface that marker to the user; never treat
it as green.

## Phase 7 -- Ship gate (permission cliff, invariant 6)

Present the review verdict to the user. **The pipeline NEVER pushes and NEVER opens a
PR.** Push / PR is a SEPARATE, explicit `bn-ship` step the USER invokes after reading the
record -- it is a trunk-level, foreground, permission-worthy action that stays the user's
call (invariant 6). State the review verdict's actual commit status: committed, applied
uncommitted, report-only, or unverified. When the verdict carries
`UNVERIFIED (no test command)`, say the review fixes are not committed by the review lead
and the result is not suite-green. Do not push here under any circumstances.

## Phase 8 -- Curate handoff (non-blocking)

Prepare curation for this run's `.banyan/runs/<run-id>/lessons-staging/` candidates. The
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

## Phase 9 -- Present

Give the user a SHORT narrative: what was built, the phase outcomes (requirements intake
when present -> research brief -> spec-stress gate when present -> plan -> delivery -> review
verdict), any recovery attempts that materially changed the path, the ship gate (the verdict's
commit status, NOT pushed -- ship is yours), and the curation handoff state
(background started, or run `/bn-curate <run-id>`). Point at the ledger path
`.banyan/runs/<run-id>/ledger.md` -- it tells the full story; the brief, plan, delivery
report, and verdict all live under that run dir.

**Trunk-stays-small target.** For a medium feature, the trunk should have spent a SMALL
fraction of its context window on the whole grow -- target under 20%. The trunk holds the
GATES and the artifact-READS, not the raw work; the subtrees carry the bulk. If the trunk
finds itself reading raw researcher dumps, transcribing plan units, or stepping through
diffs, the choreography has leaked work upward -- push it back into the owning subtree. The
ledger, not the trunk's context, is where the full run lives.

## Gates recover before surfacing

Each phase has ONE gate, and the gate is a FILE plus a condition stated inline at that phase
above (the per-phase `GATE` lines are authoritative). The trunk checks each phase's gate
before proceeding.

If a gate is not met, recover before surfacing:

1. **Retry the owning phase once** when the failure is a missing/malformed artifact, blocked
   unit, red suite, or unresolved finding with a concrete owner.
2. **Keep the same run dir** and record the attempt in `ledger.md`; do not open a sibling run
   for recovery.
3. **Promote safe uncertainty** into explicit assumptions, `Plan Inputs`, accepted risks, or
   `[assumed]` R-IDs with confirm-by clauses.
4. **Respect nested caps.** Delivery's per-unit retry cap and review's owner-recovery cap are
   owned inside those leads; the grow trunk counts one re-entry into the phase, not every child
   retry inside it.
5. **Exit only for unrecoverable state:** permission cliffs, no-safe-default product/business
   decisions, missing external authority, unsafe dirty-tree conflicts, or exhausted recovery.

When exiting before the ship gate, write `.banyan/runs/<run-id>/residuals.md` using the ledger
template, point `ledger.md` at it, and then surface the residual path plus the next safe action.
