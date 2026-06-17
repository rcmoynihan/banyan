# Routing discipline — propose-never-patch handoff + verdict-keyed disposition table

This is the `/bn-poc` handoff: it routes the poc-notes' verdict and findings forward through the
**owning skills** so the proven (or unproven) learning becomes durable, **without ever editing a
protected artifact**. `SKILL.md` invokes this rule after reading the poc-notes gate artifact.

## The identity rule: propose, never patch (AGENTS.md §5)

`/bn-poc` and its builder write **only** `poc/<slug>/**` and the run's own `briefs/poc-notes.md`.
They NEVER edit `.banyan/brainstorms/*`, `.banyan/plans/*`, `.banyan/solutions/*`, or any other
run's dir. Routing a finding forward is a **dispatch into the owning skill** (which then writes),
never a direct edit. A routing bug that patches a requirements doc or plan directly corrupts
product authority — this reference contains no edit/write instruction targeting a protected
artifact, and neither must any code path that invokes it.

## The two-axis disposition table

The poc-notes ends with a **two-axis** disposition table: the **verdict** keys the row, and
**has-owning-artifact** (does the input have a requirements doc / plan to route into, or is it
free-text standalone?) is the second axis. `poc-only` is the second-axis **mode** for free-text
standalone input — NOT a fourth verdict.

| verdict | has owning doc/plan ⇒ route | free-text standalone ⇒ `poc-only` mode |
|---------|------------------------------|-----------------------------------------|
| **confirmed** | safe to plan/work: dispatch `/bn-plan`, feeding the proven approach for reconstruction | report only — capture the proven approach in the notes; nothing to route into |
| **confirmed-with-caveats** | fold caveats into requirements, or SYNTHESIZE a summary to `/bn-spec-stress` before planning | report only — surface the caveats; nothing to route into |
| **could-not-confirm** | deeper research, rescope/pivot via `/bn-brainstorm`, or a deeper spike — never abandoned as "impossible" | report only — surface the wall hit + what it would take; nothing to route into |

## Routing rules per verdict

- **confirmed** ⇒ the PoC proved the crux. With an owning doc/plan, dispatch `/bn-plan` in the
  current session, feeding the poc-notes' **proven approach for reconstruction** (algorithm /
  structure / key parameters / corners cut) so the plan rebuilds from the proven design rather than
  cribbing the throwaway `poc/` code. Free-text standalone (`poc-only`): report only — the proven
  approach lives in the notes; there is nothing to route into.

- **confirmed-with-caveats** ⇒ the crux worked but with a named gap. **fold into requirements** ⇒
  dispatch `/bn-brainstorm <doc>` passing the caveats as context (the owning skill writes); OR
  **send to spec-stress** ⇒ **SYNTHESIZE a finalized requirements summary** from the notes'
  caveats + proven approach and pass that summary to `/bn-spec-stress`. Never pass a raw
  `briefs/poc-notes.md` path — `/bn-spec-stress` accepts a requirements summary or a requirements
  doc, not a poc-notes path. Free-text standalone (`poc-only`): report only.

- **could-not-confirm** ⇒ the crux genuinely resisted within the confirmed budget (distinct from
  an **environmental-inconclusive** outcome, which routes to "retry with infra," not pivot). Route
  to **deeper research**, **rescope/pivot via `/bn-brainstorm`**, or a **deeper spike** — never
  silently abandon the idea as "impossible" (the verdict scale has no "impossible"). Free-text
  standalone (`poc-only`): report only, surfacing the wall hit and what it would take.

- **environmental-inconclusive** (a sub-case of could-not-confirm) ⇒ report it as "retry with
  infra" — name the infra change (network access, a longer budget, a working install) that would
  unblock the spike. Do NOT route it to pivot/abandon the idea: the crux was never actually tested.

## Plan-impact axis — only when the input was a plan path

When `/bn-poc` was invoked on a `.banyan/plans/*-plan.md` path, a `could-not-confirm` or
`confirmed-with-caveats` verdict additionally carries one plan-impact classification, so a plan
resting on unproven core IP is never silently carried into `/bn-work`:

- **requirements revision needed** — the result means the requirements (and thus eventually the
  plan) should change; route via fold-into-requirements / spec-stress first.
- **replan before work** — the result shows the plan's approach is wrong as written; the user must
  `/bn-plan` again before `/bn-work`. Surface this loudly.

A plan-sourced **`could-not-confirm` HALTS the plan** and routes to research/pivot: "safe to
proceed" is **NOT** an available plan-impact value for a `could-not-confirm` — only `requirements
revision needed` or `replan before work` remain. Unproven core IP never reaches `/bn-work`.

### Walkthrough (plan input, unproven core IP)

> `/bn-poc .banyan/plans/2026-..-feature-plan.md` builds the core spike and the crux genuinely
> resists within the confirmed budget — verdict `could-not-confirm`. Because the input was a plan
> path, the plan-impact axis fires: the plan **halts and routes to research/pivot**. The handoff
> surfaces: "Verdict could-not-confirm — the plan rests on unproven core IP; do not carry it into
> `/bn-work`. Route to deeper research or rescope via `/bn-brainstorm`." There is no "safe to
> proceed" option for this verdict. The trunk dispatches the chosen route; it never edits the plan
> file.

## The handoff summary the trunk prints

After classifying, the trunk presents the disposition table to the user and offers to execute the
dispatches (each is a bounded touchpoint, not an automatic action). For a plan input it shows the
plan-impact axis alongside the verdict. The notes path is named as the durable record; the
*routing* is what turns it into durable knowledge.
