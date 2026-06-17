# Message-grading rubric — the canonical per-call grading lens

These names are canonical. Every other layer quotes them byte-identically; do not synonymize.

This file is the single source for the message-grading lens `bn-harness-engineer` applies to each
subagent call within a `bn-evolve` corpus scope. It defines: every axis name, the field each axis
targets, the backbone tag each maps to, which direction's authoring agent each grade attributes to,
whether each axis is transcript-dependent or artifact-derivable, the bound on the misleading axis,
and the recurrence floor. The downstream layers — the `bn-evolve` SKILL grading instruction and
Step-4 read-back, and the `bn-harness-engineer` catalog bullet and proposal template — quote the
axis names from here verbatim.

## What gets graded

Each graded call is one subagent round-trip within the scoped corpus:

- the **down-going envelope** the parent constructed, echoed in `progress/<agent>.md`;
- the **up-returning brief + verdict** the child wrote (`briefs/`, named artifacts);
- any **consult messages** present (transcript-only; see "Evidence-requirement tagging").

The lens grades calls regardless of outcome, including calls that succeeded — its job is to surface
token-waste and message-internal misleading-context that a pass/fail outcome hides.

## Backbone tags

Every axis maps to exactly one of the five conceptual backbone tags, the shared vocabulary the
grade resolves to: relevant / useful / harmful / misleading / token-wasting.

## Envelope axes

Graded against the down-going envelope's fields (the field table in
`~/.codex/skills/banyan/skills/bn-conventions/references/envelope.md`). Each axis lists its canonical
name (code-spanned), the one envelope field it targets, and its backbone tag.

- `objective-clarity` — Targets the envelope `objective` field. Is the objective one crisp,
  testable target rather than a vague role or a multi-headed ask? Backbone tag: relevant.
- `boundary-right-sizing` — Targets the envelope `boundaries` field. Are the do-not-touch paths and
  forbidden actions sized to the actual file set — neither so loose the child can stray nor so tight
  it cannot do the work? Backbone tag: useful.
- `budget-fit` — Targets the envelope `budget` field. Do `max_children` and `depth_remaining` match
  the work the objective actually demands — not starved, not padded? Backbone tag: useful.
- `doctrine-relevance` — Targets the envelope `doctrine` field. Is every doctrine/context path the
  envelope hands down actually load-bearing for this child, or is it boilerplate the child carries
  and never uses? A low grade here is the token-waste signal on the down-going side. Backbone tag:
  token-wasting.
- `context-accuracy` — Targets the envelope `inputs`/`doctrine` fields. Are the inputs and context
  the envelope passes internally consistent and non-stale relative to what the child returns? See
  "Misleading axis bound" — this is call-internal contradiction detection (envelope vs. brief), not
  fact-checking. Backbone tag: misleading.

## Brief axes

Graded against the up-returning brief + verdict the child wrote. Each axis lists its canonical name
(code-spanned), the one Banyan field or contract it targets, and its backbone tag.

- `answers-the-objective` — Targets the envelope `objective` the brief was written against. Does
  the brief actually answer the objective it was given, or does it drift to an adjacent question?
  Backbone tag: relevant.
- `artifacts-over-prose` — Targets the invariant-3 return contract
  (`~/.codex/skills/banyan/AGENTS.md`, invariant 3): the brief is a verdict-plus-path, never the
  payload, with no raw dumps of content that belongs in the artifact file. Does the returned message
  honor verdict-plus-path, or does it inline the payload and dump raw content? Backbone tag:
  token-wasting.
- `confidence-calibration` — Targets the verdict's stated confidence. Does the brief's expressed
  certainty match its evidence — neither over-claiming a result it did not establish nor hedging a
  result it did? Backbone tag: misleading.
- `token-economy` — Targets the brief's overall size against its information content. Does the brief
  distill, or does it pad and repeat — quadrupling its source instead of compressing it? Backbone
  tag: token-wasting.

## Per-direction attribution

A grade attributes to the agent that AUTHORED the graded message, per direction:

- **Envelope axes** grade the envelope-CONSTRUCTING agent — the parent that built the down-going
  envelope. A weak `objective-clarity`, `boundary-right-sizing`, `budget-fit`, `doctrine-relevance`,
  or `context-accuracy` grade is debt against that parent's body.
- **Brief axes** grade the brief-WRITING agent — the child that wrote the up-returning brief. A weak
  `answers-the-objective`, `artifacts-over-prose`, `confidence-calibration`, or `token-economy`
  grade is debt against that child's body.

The aggregation key is `(authoring-agent, axis)`. No grade is ever keyed to the wrong author, so
each downstream proposal's Target file is the correct `plugin/` body.

## Evidence-requirement tagging

Each axis is either artifact-derivable (gradable from the persisted envelope in `progress/` and the
brief in `briefs/` alone) or transcript-dependent (needs the child's transcript to grade honestly).
**Artifact-derivable:** `objective-clarity`, `boundary-right-sizing`, `budget-fit`,
`answers-the-objective`, `artifacts-over-prose`, `token-economy`, and the envelope-vs-brief case of
`context-accuracy`. **Transcript-dependent:** `doctrine-relevance` (the "doctrine the child never
opened" signal is knowable only from the transcript), a strong `confidence-calibration` claim (the
supporting evidence trail is fuller there), and any `context-accuracy` contradiction that surfaces in
transcript turns rather than the brief. Consults are transcript-only — graded only when the
transcript is present.

The governing degraded-mode rule: with no transcripts the lens lowers confidence on or withholds
every transcript-dependent axis; it **never** converts an absence of evidence into an assertion of a
weakness.

## Misleading axis bound

`context-accuracy` is bounded to CALL-INTERNAL contradiction detection — contradictions found
within the call's own two messages, the down-going envelope and the up-returning brief, never
against anything outside them. In scope: the envelope `inputs` or `doctrine` being contradicted by
what the returned brief reports; `inputs` that are stale or internally contradictory. This axis does
not fact-check the envelope's claims against the real code or repository state. External ground-truth
verification is out of scope for this axis.

## Recurrence floor

A message-quality proposal fires only when a weakness recurs `>=2` occurrences for the same
`(agent, axis)` within the scoped corpus. A single low-graded message produces no proposal.

One occurrence = one graded call inside the current `bn-evolve` scope. Per-call grades are working
evidence that exist only within a run; nothing persists across `bn-evolve` runs. So "three runs" in an
acceptance example means three graded calls inside one `bn-evolve` scope, not three separate `bn-evolve`
invocations over time.

## Failure taxonomy

For the shared catalog of process-level failure modes (goal drift, fixing the wrong problem, and the
rest), cite — do not duplicate —
`~/.codex/skills/banyan/skills/bn-conventions/references/process-pitfalls.md`. This rubric's only
novelty over that catalog is the per-call grading operationalization above: the axis set, their
fields and backbone tags, the per-direction attribution key, the evidence-requirement tagging, and
the recurrence floor.
