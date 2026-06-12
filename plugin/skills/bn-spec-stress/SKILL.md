---
name: bn-spec-stress
description: "Stress-test a requirements document or finalized requirements summary before planning. Converts hidden assumptions, missing scenarios, acceptance gaps, and risk-bearing implications into a gate artifact at docs/runs/<run-id>/briefs/spec-stress.md so /bn-plan consumes repaired or explicitly constrained scope."
argument-hint: "[docs/brainstorms/*-requirements.md | finalized requirements summary]"
---

# bn-spec-stress

Stress-test an already-formed requirements artifact before planning. The skill looks for
unknown-unknowns that would otherwise surface after implementation starts: missing scenario
branches, hidden assumptions, unbounded data/trust implications, acceptance gaps, and product
decisions that compound downstream.

This skill is not a second PRD writer and not an implementation planner. The requirements
document remains the product and scope authority. `spec-stress.md` is a gate artifact:
unresolved items require disposition before planning, while resolved implications become
explicit plan inputs, accepted risks, or notes.

Read `${CLAUDE_PLUGIN_ROOT}/AGENTS.md` (especially protected artifacts, the lead pattern,
and self-recovery),
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md`, and
`${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/ledger.md` (skip any already in your context). The trunk is the single writer of the final
`spec-stress.md`; leaf reviewers write only their assigned briefs.

## Step 1 -- Resolve input and run

Take the argument as either:

- a path to `docs/brainstorms/*-requirements.md`;
- a concise finalized requirements summary; or
- when invoked from `/bn-grow`, the requirements document or finalized summary already
  accepted by intake.

If no usable input is present, ask for the requirements document path or finalized summary.
If the input is a requirements document, READ it in full and treat it as the scope authority.
If it contains a non-empty `Resolve Before Planning` section or equivalent planning blocker,
surface those blockers in standalone mode. In `/bn-grow`, return a grow handoff with the
blockers, proposed dispositions, and `resume_from_phase: intake`; the grow trunk owns the
recovery decision.

Reuse the active `docs/runs/<run-id>/` when invoked from `/bn-grow` or another Banyan flow.
If no run is active and the input is under `docs/runs/<run-id>/`, reuse that run. Otherwise
open a run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/scripts/new-run.mjs spec-stress-<slug> \
  --root <repo-root> \
  --input <requirements-doc-path-if-any> \
  --objective "<stress-test the requirements before planning>" \
  --plan-ref "<pending plan path>" \
  --unit "spec-stress|trunk|in-progress|docs/runs/<run-id>/briefs/spec-stress.md" \
  --actor trunk
```

Parse the JSON output and use `run_id`, `run_dir`, `ledger_path`, and `facts`. In a standalone
run, the script seeds the `spec-stress` unit row. **When reusing the grow run, call the script
with `--run-id <run-id>` and do NOT add a duplicate row** — the grow trunk already owns the
`spec-stress` phase row at phase granularity; per-skill detail stays in this skill's own
progress notes.

## Step 2 -- Read grounding

Read any grounding already attached to the run:

- `docs/runs/<run-id>/briefs/research-brief.md`;
- `docs/runs/<run-id>/briefs/brainstorm-grounding.md`;
- any `docs/runs/*/briefs/*.md` path referenced by the requirements document.

Grounding briefs inform the stress test; they do not override the requirements document.

## Step 3 -- Classify effort

Choose the smallest stress effort that can expose material unknowns:

- **`lightweight`** -- narrow, low-risk, well-specified, single actor or one obvious path.
  Run the trunk's inline pass only. Spawn count: **0**.
- **`standard`** -- normal feature requirements, multiple requirements, non-trivial
  behavior, material assumptions, or external dependencies. Use triggered leaf lenses.
- **`deep`** -- cross-cutting feature, ambiguous product boundary, sensitive data, auth,
  payments, permissions, public APIs, migration-like effects, or research with conflicting
  evidence. Use triggered leaf lenses and a stricter synthesis bar.

Record `effort_class` in the ledger before spawning.

## Step 4 -- Run the stress lenses

The trunk always performs an inline pass over:

- scenario completeness;
- assumption and dependency pressure;
- acceptance and verification gaps;
- downstream implications that would affect planning.

Spawn leaf reviewers only when their trigger is present. Spawn all triggered reviewers in
parallel.

### Scenario and acceptance lens

Spawn `bn-spec-scenario-reviewer` when the requirements involve any of:

- multi-step flows, multi-actor flows, or role-dependent behavior;
- conditional behavior, degraded states, retries, undo/redo, notifications, or background work;
- four or more material requirements;
- `standard` or `deep` effort.

Envelope:

```text
=== BANYAN ENVELOPE ===
objective:       Walk user-observable scenarios in the requirements and emit concrete
                 missing branches, acceptance gaps, or plan inputs tied to source
                 requirements.
artifact_path:   docs/runs/<run-id>/briefs/spec-scenario-stress.md
output_format:   Candidate list with Source, Scenario, Gap, and Disposition.
inputs:
  requirements_doc:     <docs/brainstorms/...-requirements.md, or "none">
  requirements_summary: <summary text, or "none">
  research_brief:       <docs/runs/.../briefs/research-brief.md, or "none">
  supplemental_grounding: <docs/runs/.../briefs/brainstorm-grounding.md, or "none">
  repo_root:            <repo root>
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md
boundaries:      Read-only against the repo except artifact_path. Do not edit source,
                 docs/brainstorms, docs/plans, docs/solutions, or other docs/runs files.
tool_guidance:   Read, Grep, Glob, and Write only to artifact_path. No Agent spawns.
budget:
  max_children:    0
  depth_remaining: 1
effort_class:    <standard | deep>
=== END ENVELOPE ===
```

### Assumption and premortem lens

Spawn `bn-spec-assumption-reviewer` when any of these are true:

- the requirements contain assumptions, dependencies, outstanding questions, or external facts;
- grounding evidence is sparse, conflicting, or absent for a material claim;
- the requirements came from outside `/bn-brainstorm`;
- effort is `standard` or `deep`.

Envelope:

```text
=== BANYAN ENVELOPE ===
objective:       Pressure-test assumptions, dependencies, contradictions, and downstream
                 implications in the requirements.
artifact_path:   docs/runs/<run-id>/briefs/spec-assumption-stress.md
output_format:   Candidate list with Source, Assumption or Premortem Trigger, Gap, and
                 Disposition.
inputs:
  requirements_doc:     <docs/brainstorms/...-requirements.md, or "none">
  requirements_summary: <summary text, or "none">
  research_brief:       <docs/runs/.../briefs/research-brief.md, or "none">
  supplemental_grounding: <docs/runs/.../briefs/brainstorm-grounding.md, or "none">
  repo_root:            <repo root>
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md
boundaries:      Read-only against the repo except artifact_path. Do not edit source,
                 docs/brainstorms, docs/plans, docs/solutions, or other docs/runs files.
tool_guidance:   Read, Grep, Glob, and Write only to artifact_path. No Agent spawns.
budget:
  max_children:    0
  depth_remaining: 1
effort_class:    <standard | deep>
=== END ENVELOPE ===
```

### Threat, data, and misuse lens

Spawn `bn-spec-threat-reviewer` only when the requirements create or touch a trust, data, or
abuse surface:

- auth, authorization, roles, permissions, tenancy, sharing, or visibility rules;
- personal, sensitive, regulated, billing, payment, secret, credential, or user-generated data;
- public endpoints, external tools, webhooks, uploads/downloads, third-party services, or
  background automation;
- explicit misuse, moderation, rate-limit, audit, retention, deletion, or compliance concerns.

Envelope:

```text
=== BANYAN ENVELOPE ===
objective:       Stress-test requirements-level trust, data, and misuse implications and
                 emit only planning-relevant gaps tied to source requirements.
artifact_path:   docs/runs/<run-id>/briefs/spec-threat-stress.md
output_format:   Candidate list with Source, Asset/Actor/Threat Trigger, Gap, and
                 Disposition.
inputs:
  requirements_doc:     <docs/brainstorms/...-requirements.md, or "none">
  requirements_summary: <summary text, or "none">
  research_brief:       <docs/runs/.../briefs/research-brief.md, or "none">
  supplemental_grounding: <docs/runs/.../briefs/brainstorm-grounding.md, or "none">
  repo_root:            <repo root>
doctrine:        ${CLAUDE_PLUGIN_ROOT}/AGENTS.md,
                 ${CLAUDE_PLUGIN_ROOT}/skills/bn-conventions/references/envelope.md
boundaries:      Read-only against the repo except artifact_path. Do not edit source,
                 docs/brainstorms, docs/plans, docs/solutions, or other docs/runs files.
tool_guidance:   Read, Grep, Glob, and Write only to artifact_path. No Agent spawns.
budget:
  max_children:    0
  depth_remaining: 1
effort_class:    <standard | deep>
=== END ENVELOPE ===
```

## Step 5 -- Synthesize findings

READ every triggered leaf artifact. Drop vague findings. A retained item must include:

- a source requirement ID, acceptance example ID, or explicit `whole document` source;
- the scenario, assumption, premortem, asset, actor, or threat trigger;
- the insufficiency in the current requirements text;
- a required disposition.

Classify each retained item into exactly one bucket:

- **`Resolve Before Planning`** -- the plan would materially differ depending on the answer,
  or implementation could satisfy the written text while failing the intended product.
- **`Plan Inputs`** -- planning can proceed if the implication is treated as an explicit
  `[assumed]` requirement, risk, verification obligation, file/repo check, or unit constraint.
- **`Accepted Risks`** -- the requirements intentionally leave the issue out of scope or defer
  it, and the plan should preserve that boundary.
- **`Notes`** -- useful trace context that does not change scope, sequencing, risk, or
  verification.

Do not update the requirements document automatically. If `Resolve Before Planning` is
non-empty in standalone mode, the product surface needs a requirements revision or a user
disposition. In `/bn-grow`, keep the existing buckets and add enough handoff detail for the
grow trunk to attempt one disposition pass: whether each blocker can be promoted into
`Plan Inputs`, preserved as an `Accepted Risk`, revised from existing requirements, or
requires user judgment.

## Step 6 -- Write `spec-stress.md`

Write exactly one final gate artifact:

```markdown
# Spec stress -- <topic>

**Input:** <requirements doc path or summary label>
**Grounding:** <brief paths read, or "none">
**Effort:** <lightweight | standard | deep>

## Resolve Before Planning

- B1. <blocker title>
  - **Source:** <R-ID / AE-ID / whole document>
  - **Trigger:** <scenario, assumption, premortem, asset, actor, or threat>
  - **Gap:** <what the current text does not decide>
  - **Disposition:** <what must be answered or revised before planning>

## Plan Inputs

- P1. <planning input>
  - **Source:** <R-ID / AE-ID / whole document>
  - **Trigger:** <...>
  - **Plan treatment:** <assumption, risk, verification, sequencing, repo check, or unit constraint>

## Accepted Risks

- AR1. <accepted risk or deliberate scope boundary>
  - **Source:** <...>
  - **Reason:** <why planning can proceed with this boundary>

## Notes

- <brief note, or "none">
```

When a section has no items, write `none` under that section. Update the ledger row to `done`
with `docs/runs/<run-id>/briefs/spec-stress.md` and append a log line with blocker count,
plan-input count, and triggered leaf artifacts.

## Step 7 -- Gate and handoff

If `Resolve Before Planning` is non-empty in standalone mode, surface:

- the `spec-stress.md` path;
- the blocker titles and dispositions;
- the requirements document path to revise, or the missing decision if the input was only a
  summary.

If the skill was invoked by `/bn-grow`, return the path and blocker status to the grow trunk;
do not show a standalone handoff menu. Include:

- `blocker_class`: `no-safe-default`, `missing-external-authority`, `permission-cliff`,
  `unsafe-working-tree`, or `recovery-exhausted`;
- `proposed_disposition`: `revise-requirements`, `promote-to-plan-input`,
  `record-accepted-risk`, or `ask-user`;
- `next_safe_action`: the concrete action the grow trunk can take;
- `resume_from_phase`: `spec-stress` unless the requirements document itself must be revised,
  in which case `intake`.

If no blockers remain, the standalone handoff is:

- plan from the requirements with `/bn-plan <requirements-doc-path>`;
- refine requirements with `/bn-brainstorm <requirements-doc-path>` when plan inputs should be
  promoted into the requirements document;
- stop when the artifact is only for recordkeeping.
