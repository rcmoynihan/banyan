# Process-pitfall catalog — the driver's-vigilance playbook

## How to use this
- The reflex inlined in every lead body is the TRIGGER (a lens held while reading); this catalog
  is the PLAYBOOK, pulled ONLY after a flag survives the lead's own judgment. Lens, not gate.
- Evidence-surface partition (R1): this catalog owns the *trajectory* form (legible in the child's
  artifact/verdict before a diff exists); the reviewer panel owns the *diff* form. The dual-surface
  pitfalls carry a trajectory tell only.
- Corrective vocabulary is Banyan's existing ladder — bounce / sharper-envelope re-dispatch within
  the per-child retry cap, or the §2.2 self-recovery → escalation ladder with a `blocker_class`.
  The rung is chosen by §2.2's "no defensible default" test; each entry's corrective is the
  *likely* rung, a hint not a rule. Retry caps and budgets always bound corrective action.
- Where a stronger local gate already owns a pitfall for a given lead, this catalog points you
  THERE by concept name. Defer to the gate; do not run parallel vigilance.

## The eight pitfalls
### Goal drift
- Tell: the artifact answers a subtly different question than the envelope objective; scope
  silently widened or narrowed; the verdict is for work the child chose, not work it was asked to do.
- Corrective (likely: re-dispatch): sharper-envelope re-dispatch naming the specific drift, within
  the retry cap. But if the child silently reinterpreted an ambiguous objective with no safe
  default → §2.2 ladder, `blocker_class: no-safe-default`.
- Bites hardest: delivery, unit, ask leads.

### Fixing the wrong problem
- Tell: the artifact treats a symptom; cause and effect are asserted by plausibility, not tested.
- Defers to local gate — the causal-chain gate (debug). It already requires every
  symptom → mechanism → root-cause link to carry tested evidence and refuses to fix a diagnosis
  that is not chain-confirmed (two-sided by design). For debug, point the reflex there, not here.
- Corrective elsewhere (likely: re-dispatch): re-dispatch demanding the mechanism be established
  before the fix.
- Bites hardest: debug (defers to the causal-chain gate), delivery.

### Assumption-driven development  [dual-surface]
- Tell (trajectory form): the artifact builds on a stated-or-implied assumption where a fact was
  gettable from the repo/brief; "I assumed X" with no confirmation path. The diff form is the
  reviewer panel's (spec-fidelity).
- Corrective (likely: §2.2 escalation): if the assumption papers over genuine ambiguity with no
  safe default → §2.2 ladder, `blocker_class: no-safe-default`. But if the correct value sits in
  the repo → sharper-envelope re-dispatch.
- Bites hardest: delivery, unit, plan.

### Solving uncertainty with code  [dual-surface]
- Tell (trajectory form): the artifact answers an open question by writing code/config to route
  around it — defensive branches, fallbacks, abstraction standing in for a decision nobody made.
  The diff form (overengineering) is the reviewer panel's (yagni).
- Corrective (likely: §2.2 escalation): §2.2 ladder, `blocker_class: no-safe-default`, so the user
  resolves the uncertainty — unless a defensible default exists, then re-dispatch.
- Bites hardest: delivery, unit, plan.

### Acting on partial understanding  [dual-surface]
- Tell (trajectory form): the verdict is confident over a thin/narrow reading; load-bearing
  files or threads unread. The diff form is the reviewer panel's.
- Defers to local gate — research's Step 3 triage (missing/malformed → one targeted repair;
  contradictions → one targeted follow-up; unresolved thread → one chaser). For research, point
  there.
- Corrective elsewhere (likely: re-dispatch): sharper-envelope re-dispatch naming the unread
  surface, within the retry cap.
- Bites hardest: research (defers to Step 3 triage), ask, debug.

### Hallucinated context
- Tell: the artifact cites files, APIs, symbols, or facts that do not exist in the repo/brief.
- Defers to local gates per lead. Plan: plan-judge's file-existence spot-check (a draft that
  invents files loses feasibility points) AND the plan-checker typed-finding fold (untraced-path /
  infeasible-claim must be repaired, fall back, or set verdict: needs-user) — point a plan-lead
  there. Research: research's Step 3 triage — point a research-lead there.
- Corrective elsewhere (likely: re-dispatch): re-dispatch demanding every load-bearing claim carry
  a repo citation.
- Bites hardest: plan (defers to plan-judge + plan-checker), research (defers to Step 3 triage), ask.

### Tool misuse  [dual-surface]
- Tell (trajectory form): the artifact reaches its result via the wrong instrument — a manual
  reconstruction where a deterministic script exists, a web search where the repo had the answer,
  a spawn where an inline Read sufficed (or vice versa). The diff form is the reviewer panel's
  (correctness/maintainability).
- Corrective (likely: re-dispatch): sharper-envelope re-dispatch naming the right instrument.
- Bites hardest: research, debug, delivery.

### Tunnel vision
- Tell: the artifact commits to the first viable path and never weighs an obvious alternative;
  narrowing the envelope did not ask for.
- Corrective (likely: re-dispatch): sharper-envelope re-dispatch asking for the alternative to be
  weighed, within the retry cap.
- Bites hardest: research, ask, debug.

## Per-lead quick index (R8)
- research / ask: tunnel vision, hallucinated context, acting on partial understanding bite
  hardest. Hallucinated/contradicting evidence defers to research's Step 3 triage.
- delivery / unit: goal drift, assumption-driven work, solving-uncertainty-with-code, tool misuse.
- debug: fixing the wrong problem (defers to the causal-chain gate), acting on partial
  understanding, tool misuse.
- plan: hallucinated context (defers to plan-judge's spot-check + the plan-checker typed-finding
  fold), assumption-driven development, solving-uncertainty-with-code.
- review: drives the reviewer panel; goal drift and tunnel vision in a reviewer's findings.

## What this catalog is not
- Not a per-spawn checklist; not a new reviewer persona; not a replacement for the local gates it
  points at; not a parallel recovery ladder.
