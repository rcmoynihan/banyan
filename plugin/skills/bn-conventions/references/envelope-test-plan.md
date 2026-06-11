# Envelope budget test plan

This is the documented fixture test plan for the delegation envelope's budget
behaviors (see `envelope.md`). The behaviors are prompt-level disciplines, not
runtime-enforced, so they can only be tested once real leads exist to honor them.
These tests become executable at U8 (the `bn-review-lead` is the first real lead)
and run against the fixture repo (`test/fixture-repo/`).

Every PASS criterion is **observable from the run ledger** -- no instrumentation
beyond what a Banyan run already writes. A lead echoes its envelope into
`docs/runs/<run-id>/progress/<lead>.md` on start and logs each spawn there, so spawn
counts, model tiers, and depth values are all readable after the fact from
`progress/` and the run's `findings/` and `briefs/` output dirs.

Each test below gives: **setup**, **action**, and **PASS criterion**.

---

## T1 -- max_children cap

A lead must spawn no more children than `max_children`.

- **Setup:** Construct a review run whose input would normally trigger more than two
  reviewers (a diff touching source + tests + config, which the standard panel would
  fan out across). Hand the lead an envelope with `budget.max_children: 2`.
- **Action:** Dispatch the lead against the fixture diff.
- **PASS:** The lead's `progress/<lead>.md` records at most 2 child spawns, and at
  most 2 child artifacts appear under the run's `findings/`. The lead either does the
  remaining work inline or reports the shortfall upward in its verdict -- it does not
  spawn a 3rd child.

## T2 -- depth_remaining floor (inline at zero)

A child handed `depth_remaining: 0` must complete its work inline and spawn nothing.

- **Setup:** Pick a leaf-capable agent (e.g. a reviewer, or a recursive worker that
  *could* split) and hand it an envelope with `budget.depth_remaining: 0`, on an
  input it would otherwise be tempted to subdivide.
- **Action:** Dispatch the agent.
- **PASS:** The agent writes its own `artifact_path` and returns a verdict, and its
  `progress` entry records **zero** child spawns. No child progress file or child
  artifact is created under it in the run dir.

## T3 -- envelope echo

Every lead's progress file must open with the envelope it received, so budget
violations are auditable.

- **Setup:** Any run that dispatches a lead with a fully-populated envelope.
- **Action:** Dispatch the lead; let it run to its first spawn (or to completion).
- **PASS:** The first block of `docs/runs/<run-id>/progress/<lead>.md` is the echoed
  envelope, and its field values (`objective`, `artifact_path`, `boundaries`,
  `budget.max_children`, `budget.model_tier`, `budget.depth_remaining`,
  `effort_class`) match the envelope the lead was handed. The echoed `max_children`
  and `depth_remaining` are consistent with the spawn behavior checked in T1/T2.

## T4 -- effort_class scaling

On the same input, a `lightweight` run must spawn strictly fewer agents than a
`standard` run.

- **Setup:** Fix one fixture input (one diff/scope). Prepare two envelopes identical
  except for `effort_class`: one `lightweight`, one `standard`.
- **Action:** Dispatch the lead twice on that same input, once per envelope. Count
  child spawns from each run's `progress/` and child artifacts.
- **PASS:** `count(lightweight spawns) < count(standard spawns)`, strictly. The
  `lightweight` run does a minimal/inline check (zero or one spawn); the `standard`
  run builds its normal panel. The two runs' `effort_class` values are visible in
  their echoed envelopes (T3), tying the spawn-count delta to the classification.

---

## Status

These four behaviors are **executed at U8 against the fixture repo**, as part of the
`bn-review-lead` verification (plan U8: "a lead given `max_children: 2` spawns <=2; a
child given `depth_remaining: 0` completes inline; envelope echoed in progress
files"; plan cross-cut "effort scaling ... assert in fixture tests"). Until a real
lead exists there is nothing to honor the envelope, so these remain a documented plan
rather than a running suite.

Related but out of scope here: whether the harness *itself* enforces the
`Agent(agent_type)` allowlist in nested contexts is a separate empirical question
(the Phase 2 nested-spawn probe; full allowlist-enforcement test also at U8). These
four tests assume only the prompt-level envelope discipline, not runtime allowlist
enforcement.
