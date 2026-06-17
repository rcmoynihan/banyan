# Routing discipline — propose-never-patch handoff + disposition table

This is the `/bn-mock` handoff: it routes the mock-notes' findings forward through the **owning
skills** so the learning becomes durable, **without ever editing a protected artifact**.
`SKILL.md` invokes this rule after reading the mock-notes gate artifact.

## The identity rule: propose, never patch (AGENTS.md §5)

`/bn-mock` and its builder write **only** `mock/<slug>/**` and the run's own `briefs/mock-notes.md`.
They NEVER edit `.banyan/brainstorms/*`, `.banyan/plans/*`, `.banyan/solutions/*`, or any other
run's dir. Routing a finding forward is a **dispatch into the owning skill** (which then writes),
never a direct edit. A routing bug that patches a requirements doc or plan directly corrupts
product authority — this reference contains no edit/write instruction targeting a protected
artifact, and neither must any code path that invokes it.

## The disposition table

The mock-notes ends with a disposition table classifying **each finding into exactly one** of:

| disposition | meaning | routing (all propose-not-patch) |
|-------------|---------|----------------------------------|
| **fold into requirements** | the mock revealed a requirement that should change/be added | dispatch `/bn-brainstorm <doc>` (or a synthesized-summary offer if no doc) — the owning skill writes |
| **send to spec-stress** | a finding needs assumption/scenario/threat pressure-testing | SYNTHESIZE a finalized requirements summary and pass it to `/bn-spec-stress` |
| **replan** | the finding invalidates the current plan's approach | dispatch `/bn-plan` |
| **safe to plan/work** | the mock confirmed the idea; no change needed | report only — no dispatch |
| **mock-only** | the finding matters to the mock but not to the product | report only — no dispatch |

## Routing rules per disposition

- **fold into requirements** ⇒ dispatch `/bn-brainstorm <doc>` in the current session, passing the
  mock-notes' *suggested requirements patches* as context. The brainstorm skill — the owner of the
  requirements doc — writes the change. The trunk never edits the doc itself.
  - **Free-text input, no doc exists:** there is no requirements doc to fold into. Instead
    of editing a doc that does not exist, OFFER a synthesized finalized-requirements summary (from
    the notes' planning-impact + suggested-patches) that the user can carry into `/bn-brainstorm`
    or `/bn-spec-stress`. Never fabricate or write a `.banyan/brainstorms/*` file as a side effect.

- **send to spec-stress** ⇒ **SYNTHESIZE a finalized requirements summary** from the mock-notes'
  *planning-impact* + *suggested-patches* sections and pass that summary to `/bn-spec-stress`
  Never pass a raw `briefs/mock-notes.md` path — `/bn-spec-stress` accepts a requirements
  summary or a requirements doc, not a mock-notes path.

- **replan** ⇒ dispatch `/bn-plan` in the current session (it re-runs the planning panel and
  writes a new plan). The trunk does not edit the existing plan.

- **safe to plan/work** ⇒ report only. Name it in the handoff summary so the user knows the mock
  cleared the idea; take no dispatch action.

- **mock-only** ⇒ report only. Record it for completeness; it does not route anywhere.

## Plan-impact second axis — only when the input was a plan path

When `/bn-mock` was invoked on a `.banyan/plans/*-plan.md` path, EVERY finding additionally
carries one plan-impact classification, so a known-wrong plan is never silently carried into
`/bn-work`:

- **no replan needed** — the finding does not affect the plan's correctness.
- **requirements revision needed** — the finding means the requirements (and thus eventually the
  plan) should change; route via fold-into-requirements / spec-stress first.
- **replan before work** — the finding shows the plan's approach is wrong as written; the user
  must `/bn-plan` again before `/bn-work`. Surface this loudly.

### Walkthrough (plan input, known-wrong plan)

> `/bn-mock .banyan/plans/2026-..-feature-plan.md` builds the mock and the playtest reveals the
> plan's core flow does not actually serve the primary scenario. The disposition table classifies
> that finding `replan`, and — because the input was a plan path — the plan-impact axis marks it
> **replan before work**. The handoff surfaces: "Finding X: replan before work — do not carry this
> plan into `/bn-work`; re-run `/bn-plan`." The trunk dispatches `/bn-plan`; it never edits the
> existing plan file.

## The handoff summary the trunk prints

After classifying, the trunk presents the disposition table to the user and offers to execute the
dispatches (each is a bounded touchpoint, not an automatic action). For a plan input it shows the
plan-impact axis alongside each finding. The notes path is named as the durable record; the
*routing* is what turns it into durable knowledge.
