---
module: "review evaluation"
date: "2026-06-11"
problem_type: architecture_pattern
component: testing_framework
severity: medium
applies_when:
  - "Comparing a new review pipeline against an existing one before promoting it to production"
  - "A seeded-bug fixture with a published ground truth (BUG-INVENTORY.md) is available"
  - "Both arms apply fixes headlessly and their apply behavior must be compared like-for-like"
tags:
  - a-b-evaluation
  - review-pipeline
  - seeded-bugs
  - fixture
  - scoring-rubric
  - go-no-go
---

# Separate capture, scoring, and the GO / NO-GO gate when evaluating competing review pipelines

## Guidance

Structure a review-pipeline A/B evaluation as three distinct, independently auditable layers:

1. **Capture harness** (`run-ab.ps1`): builds isolated sandboxes, runs each arm headlessly against the same diff in its own copy of the target, and records artifacts. It never scores or judges.
2. **Protocol document** (`protocol.md`): defines what is captured, how findings map to ground truth, and the explicit GO / NO-GO criterion. It is the instrument, not the verdict.
3. **Scorecard template** (`SCORECARD-template.md`): the fill-in form a human or LLM judge completes from one results directory. Metric names match the protocol exactly.

Use a seeded-bug fixture with a published ground truth (an inventory of planted defects with file/line anchors and priority levels) as the primary target, because it is the only target with a known answer key. Supplement with 3–5 real PR targets for realistic-diff evidence, understanding that real targets have no answer key and cannot produce recall or false-positive rate metrics.

Before running the apply-vs-apply comparison on the fixture, strip fixture meta-commentary ("de-advertise") from the seeded branch — remove in-source bug-comment blocks and the `docs/solutions/` directory — so the apply decision in each arm is driven by review quality, not fixture recognition. Assert that the failing test count is unchanged after stripping; abort setup if it changes.

## Why

A pipeline comparison that conflates capture, scoring, and the gate verdict is difficult to audit and easy to game. Separating them means any party can independently rescore a results directory using only the captured artifacts and the ground truth, without re-running the arms.

The fixture is the gate target specifically because it has a published answer key (`BUG-INVENTORY.md`). Real targets contribute cost/quality evidence but cannot be scored for recall or false-positive rate without an answer key, so they are supporting, not decisive.

De-advertising the fixture is necessary because a cautious apply stage may recognize fixture tells (in-source `BUG-<n>` comments, a `docs/solutions/` catalog of the exact bug classes) and abstain from applying, producing an unfair asymmetry between arms that have different fixture-recognition sensitivity. The de-advertised diff is behaviorally identical to the original (same bugs, same failing tests); only the meta-commentary is removed.

## Applies when

- Two or more Claude Code review pipelines differ in how they gain confidence before applying fixes (e.g., fused per-finding verification vs. a validator-wave-then-apply pipeline).
- The evaluation must be reproducible by a human or an LLM judge from captured artifacts alone.
- One arm applies fixes and commits on a clean tree; the comparison must therefore be apply-vs-apply, not apply-vs-report.
- The fixture contains in-source defect markers or a `docs/solutions/` catalog that could influence the apply decision of a cautious arm.

## Verification

- After de-advertising, `node --test` (or the target's test command) reports the same number of failing tests as before stripping. Any change aborts setup.
- Both arms' sandboxes show `git status --porcelain` empty (after excluding harness-injected scratch via `.git/info/exclude`) before the review runs. Dirty-tree warnings appear in `<arm>/WARN-dirty-tree.txt` when the exclusion does not fully clean the tree.
- Scorecard metric names match `protocol.md` section 3 exactly; a mismatch indicates the scorecard template is out of sync with the protocol.
- The final gate verdict cites the fixture scorecard as primary and real-PR scorecards as supporting; a contradiction between them (e.g., wildly higher cost or noise on real diffs) triggers a NO-GO pending investigation.

## Source

[eval/review-ab/protocol.md](../../../../../eval/review-ab/protocol.md)
