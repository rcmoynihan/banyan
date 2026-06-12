---
name: bn-grow
description: "End-to-end feature pipeline: open a run ledger, optionally run brainstorm intake for fuzzy ideas, then research -> spec stress -> plan (with a judge panel) -> deliver -> review, each owned by its own subtree, with explicit gates between, finishing at a ship gate (push stays yours) and a background knowledge-curation dispatch. The trunk stays small -- it holds intent and reads artifacts, the subtrees do the work."
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

Read `AGENTS.md` (esp. invariant 1 context-centric decomposition, invariant 3
artifacts-over-prose, invariant 6 permission cliff),
`skills/bn-conventions/references/ledger.md`, and
`skills/bn-conventions/references/envelope.md`. The phases you choreograph each have
their own contract: `/bn-brainstorm`, `bn-research-lead` (the agent), `/bn-spec-stress`,
`/bn-plan`, `/bn-work`, `/bn-review`. You invoke them; you do not reimplement them here.

ONE run ledger spans the whole grow. Every phase reuses the same run dir, so the ledger
tells the full story end to end -- optional requirements intake, research brief, spec-stress
brief when present, plan ref, delivery report, review verdict, and the log of gate decisions
all live under one `docs/runs/<run-id>/`.

## Phase 1 -- Assess intake and open the run

Capture the user's intent as a 2-3 line objective (what the feature is; the done
condition). Classify the input before choosing the intake path:

- **Clear feature/task** -- the request has a concrete done condition, expected behavior,
  and enough scope boundaries that planning should not invent product behavior.
- **Fuzzy idea** -- the request asks what to build, names an opportunity without a product
  shape, has contested scope, is ambitious enough that product choices matter, or uses
  language like "what if", "help me think through", "maybe", "explore", or "not sure".

If the request is genuinely ambiguous but not fuzzy, ask ONE clarifying question before
opening the run -- otherwise proceed; do not stall the pipeline on a question.

Open ONE run ledger via the scaffolder:

```
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs grow-<slug> --root <repo-root>
```

- `<slug>` -> kebab-case from the feature (e.g. `grow-add-oauth-login`). The script
  prints the run ID and absolute run dir on two lines; capture both.
- `<repo-root>` -> the target repo root (`git rev-parse --show-toplevel`).
- Fill the seeded `ledger.md`: write the 2-3 line intent into `## Objective`, seed one
  `## Units` row per phase (intake when fuzzy, then research / spec-stress / plan / deliver
  / review, owner = the lead or trunk that runs it, status `pending`, artifact = that
  phase's gate file), and append the opening `## Log` line. The `## Plan` ref stays a
  placeholder until the plan phase writes the plan path.

This single run dir is reused by every phase below -- pass its run ID and run dir
through to `/bn-spec-stress`, `/bn-plan`, `/bn-work`, and `/bn-review` so they do NOT each
open a fresh run.

### Fuzzy intake (skill: /bn-brainstorm)

If the input is a fuzzy idea, invoke the `/bn-brainstorm` flow in **grow intake mode**:

- Use the user's raw idea as the feature description.
- Reuse THIS run dir for any optional research grounding the brainstorm needs; its
  grounding brief path is `docs/runs/<run-id>/briefs/brainstorm-grounding.md`.
- Run through the requirements artifact step, then return control here without offering
  `/bn-brainstorm`'s standalone handoff menu.
- Accept either a requirements document path under `docs/brainstorms/` or a concise
  finalized requirements summary when the brainstorm correctly decides no document is
  warranted.

**GATE:** fuzzy intake yields a requirements document or finalized requirements summary,
and it does not contain unresolved items that must be settled before planning. READ the
requirements document if one exists. If intake leaves a `Resolve Before Planning` section
or equivalent blocking open question, STOP and surface it -- do not research or plan from
unsettled product shape.

If the input is already a clear feature/task, skip fuzzy intake and treat the 2-3 line
objective as the finalized requirements summary.

## Phase 2 -- Research (subtree: bn-research-lead)

Spawn `bn-research-lead` with the finalized requirements document or summary framed as a
research question and an envelope naming `artifact_path:
docs/runs/<run-id>/briefs/research-brief.md` (see `bn-research-lead` for the envelope it
expects; set `effort_class` by question breadth). If fuzzy intake produced
`docs/runs/<run-id>/briefs/brainstorm-grounding.md`, include that path in `inputs` so the
research lead can reuse it instead of repeating the same grounding. The lead owns the
research subtree -- it dispatches the warranted researchers, chases threads, and
synthesizes ONE brief.

**GATE:** `docs/runs/<run-id>/briefs/research-brief.md` exists. READ that file (not the
lead's final-message prose). If the brief is MISSING, STOP and surface it -- do not plan
from nothing. If the brief stands but flags unresolved open questions that would change
the plan, carry them into Phase 3 and surface them to the user rather than barreling ahead.

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
`docs/runs/<run-id>/briefs/spec-stress.md`.

**GATE:** if skipped, record the skip and reason in the ledger. If run, `spec-stress.md` exists
and the trunk READS it (the file, not the skill's final-message prose). If `Resolve Before
Planning` is non-empty, STOP and surface the blockers and required dispositions. Otherwise pass
the requirements document or summary plus `spec-stress.md` to Phase 4.

## Phase 4 -- Plan (skill: /bn-plan, with a judge panel)

Invoke the `/bn-plan` flow with the requirements document path when fuzzy intake produced
one. Otherwise pass the finalized requirements summary (the clear-task objective or the
no-doc brainstorm summary). Reuse THIS run dir so `/bn-plan` also reads
`docs/runs/<run-id>/briefs/research-brief.md` and `docs/runs/<run-id>/briefs/spec-stress.md`
when present. `/bn-plan` reads the requirements document when present, the formal research
brief, the spec-stress brief, and any referenced brainstorm grounding brief;
classifies effort; runs its generator + judge panel for standard/deep (skips it for
lightweight); and -- as the single writer of the plan (invariant 2) -- writes the plan doc
and records which draft won + where the judge score sheets live.

**GATE:** a plan doc exists at `docs/plans/YYYY-MM-DD-NNN-<type>-<name>-plan.md` and the
ledger's `## Plan` ref points at it. READ the plan (its `## Implementation Units` and
`## Sequencing`). If NO plan file was produced, STOP and surface it -- there is nothing to
deliver.

**Natural checkpoint (do not hard-block):** this is the right moment for the user to
approve the plan before code changes. Surface the plan PATH, a one-line summary, and any
`[assumed]` R-IDs with their `(confirm by: ...)` clauses; if none exist, say there are no
assumed requirements. Let the user steer if they want to. Do not block the pipeline with a
question tool -- if the user does not intervene, proceed to delivery. (Plan is `Status:
draft`; delivery consumes it next.)

## Phase 5 -- Deliver (skill: /bn-work)

Invoke the `/bn-work` flow on the plan from Phase 4, reusing THIS run dir. `/bn-work`
dispatches `bn-delivery-lead`, which makes per-unit atomizer decisions, fans composite
units out to worktree-isolated unit-leads that self-test and mini-review, and merges in
dependency order via a single integrator. It commits per unit; it NEVER pushes.

**GATE:** `docs/runs/<run-id>/delivery-report.md` exists, code actually changed, and the
report says the units are done (or names blocked units explicitly). READ the report (the
file, not the lead's prose). If units are BLOCKED, STOP at this gate and surface the
blocked units and why -- do not proceed to review pretending the feature landed. A blocked
delivery is reported, not hidden.

## Phase 6 -- Review (skill: /bn-review)

Invoke the `/bn-review` flow on the delivered changes (the integrated branch from
Phase 5), reusing THIS run dir. `/bn-review` dispatches `bn-review-lead`, which selects
the reviewer panel, dedupes findings, and fixes-and-verifies them in place, returning an
applied verdict. It commits on a clean tree; it NEVER pushes.

**GATE:** `docs/runs/<run-id>/review-verdict.md` exists and the test suite is green, OR the
verdict explicitly carries `UNVERIFIED (no test command)`. READ the verdict (the file, not
the lead's prose). If the verdict is MISSING, or the suite is RED, or material findings
remain unaddressed, STOP and surface it -- a red suite or an unresolved blocking finding
does not pass the gate. If the gate passes via `UNVERIFIED (no test command)`, surface that
marker to the user; never treat it as green.

## Phase 7 -- Ship gate (permission cliff, invariant 6)

Present the review verdict to the user. **The pipeline NEVER pushes and NEVER opens a
PR.** Push / PR is a SEPARATE, explicit `bn-ship` step the USER invokes after reading the
record -- it is a trunk-level, foreground, permission-worthy action that stays the user's
call (invariant 6). State the review verdict's actual commit status: committed, applied
uncommitted, report-only, or unverified. When the verdict carries
`UNVERIFIED (no test command)`, say the review fixes are not committed by the review lead
and the result is not suite-green. Do not push here under any circumstances.

## Phase 8 -- Curate handoff (non-blocking)

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

## Phase 9 -- Present

Give the user a SHORT narrative: what was built, the phase outcomes (requirements intake
when present -> research brief -> spec-stress gate when present -> plan -> delivery -> review
verdict), the ship gate (the verdict's commit status, NOT pushed -- ship is yours), and the
curation handoff state
(background started, or run `/bn-curate <run-id>`). Point at the ledger path
`docs/runs/<run-id>/ledger.md` -- it tells the full story; the brief, plan, delivery
report, and verdict all live under that run dir.

**Trunk-stays-small target.** For a medium feature, the trunk should have spent a SMALL
fraction of its context window on the whole grow -- target under 20%. The trunk holds the
GATES and the artifact-READS, not the raw work; the subtrees carry the bulk. If the trunk
finds itself reading raw researcher dumps, transcribing plan units, or stepping through
diffs, the choreography has leaked work upward -- push it back into the owning subtree. The
ledger, not the trunk's context, is where the full run lives.

## Gates are explicit and fail-soft

Each phase has ONE gate, and the gate is a FILE plus a condition (see the per-phase GATE
lines). The trunk checks the gate before proceeding:

- intake  -> when fuzzy, a requirements doc or finalized requirements summary exists and
  no planning-blocking questions remain
- research -> `briefs/research-brief.md` exists
- spec-stress -> skipped for clear lightweight work, or `briefs/spec-stress.md` exists with
  empty `Resolve Before Planning`
- plan     -> `docs/plans/...-plan.md` exists and `ledger.md` `## Plan` points at it
- deliver  -> `delivery-report.md` exists, code changed, units done (not blocked)
- review   -> `review-verdict.md` exists and the suite is green, OR the verdict explicitly
  carries `UNVERIFIED (no test command)` surfaced to the user

If a gate is NOT met -- no brief, no plan, blocked units, a red suite, a missing verdict --
STOP at that gate and surface it to the user with the run dir and what failed. Do NOT
barrel ahead to the next phase. Each phase's failure is reported up the trunk, never
swallowed. A run can be resumed from its ledger once the blocker is cleared.
