# Review A/B scorecard — Banyan `/bn-review` vs compound-engineering `/ce-code-review`

> **⚠️ HISTORICAL — describes the pre-refactor design.** These results were captured when
> `/bn-review` reviewed *and* applied fixes (finding-owners + clean-tree commit). `/bn-review`
> is now **read-only**; the apply-and-verify path moved to `/bn-work` (`bn-delivery-lead`'s
> bounded review→fix loop). The detection / false-positive findings below still characterize
> the reviewer panel, but the "applied + verified / committed" rows now correspond to
> `/bn-work`, not `/bn-review`. A re-baseline pointing the apply arm at `/bn-work` is pending
> (see `protocol.md`). The numbers below are NOT rewritten — they remain the honest record of
> the prior design.

**Date:** 2026-06-10/11 · **Target:** fixture-repo `seeded-bugs` vs `main` (12 seeded bugs / 7 categories / 3 P0)
**Protocol:** `eval/review-ab/protocol.md` · **Both arms:** `claude -p` headless, default (apply-capable) mode, `--dangerously-skip-permissions`, a fresh isolated sandbox each, the in-sandbox `.claude/` excluded from git so the pre-review tree is genuinely clean.

Two runs:
- **Run A (advertised):** the fixture with its `BUG-NN` comments + `.banyan/solutions/` intact. `results/u8u9-banyan-001/`, `results/u8u9-ce-002/`.
- **Run B (de-advertised, FAIR):** `BUG-NN` comments stripped + `.banyan/solutions/` removed so a cautious reviewer cannot pattern-match the fixture. Clean pre-review trees, full telemetry. `results/u9-fair-002/{banyan,ce}/`.

## Headline (Run B, the fair run; Run A consistent)

| Metric | Banyan `/bn-review` | v1 `/ce-code-review` | Notes |
|---|---|---|---|
| Seeded-bug **recall** (12) | **12 / 12** | **12 / 12** | Detection parity. Replicated in both runs. Same ported reviewer personas. |
| Seeded **P0/P1 recall** (10) | **10 / 10** | **10 / 10** | All 3 P0 + 7 P1 found by both, cross-confirmed by multiple reviewers each. |
| **False positives** | **0** | **0** | Neither invented non-bugs on the seeded diff. |
| **Applied + verified** | **12 / 12 fixed, suite 23->30/30 green** | **0 applied (reported "Not ready")** | v1 abstained from applying in BOTH runs — see Apply behavior. |
| Committed | yes — one `fix(review)` commit on a **genuinely clean** tree, **not pushed** | none | Banyan preserved v1's clean-tree-commit / never-push contract; the clean-tree commit is now proven (pre-status empty). |
| **Trunk output tokens** (trunk-context proxy) | **7,199** | 51,292 | **~7x smaller trunk footprint** — replicated (Run A: 7,673 vs 63,527, ~8x). This is the context-management win. |
| **Total fleet output tokens** (incl. all nested agents) | 108,173 | 120,635 | **Comparable.** Banyan does NOT do less total work — it *redistributes* work off the trunk into the subtree. Honest framing: nesting buys context management, not raw efficiency. |
| Total input tokens (mostly cached) | 4.26M | 2.48M | Banyan loads more total context (~1.7x, the nesting overhead), absorbed by prompt caching. |
| **Total cost (USD)** | $7.17 | $5.98 | Comparable. Banyan slightly more because it did the apply+verify work; v1 only reported. The feared 3-15x nesting cost multiplier did **not** materialize. |
| Wall-clock | 884 s | 874 s | Comparable. |
| Trunk turns | **13** | 31 | ~2.4x fewer trunk turns. |

## Apply behavior (the honest core of the comparison)

In **both** runs, v1 (`ce-code-review`, default mode) **detected every bug but did not apply any fix** — it returned a "Not ready" report. Reasons, stated plainly:
- **Run A:** v1's Stage 5c explicitly recognized the fixture (it read the `BUG-NN` comments + `.banyan/solutions/`) and declined to "destroy the fixture's purpose," offering to apply on request.
- **Run B (de-advertised):** even with the tells stripped, v1 still abstained. Two residual confounds remained — the seeded commit message is literally `fixture: seeded bugs`, and removing `.banyan/solutions/` made that deletion appear in the `main..seeded-bugs` diff, which v1 flagged as suspicious — **and** v1's Stage 5c is genuinely conservative about auto-reverting a diff that "rewrites core logic." It chose to report.

Banyan, in both runs, applied and verified all 12 fixes (suite green, safe commit). So on **this benchmark**: detection is at parity, and **Banyan reliably delivers applied-and-verified outcomes where v1 delivers a report.** A fully clean apply-vs-apply still wants a target with no fixture residue at all (real PRs) — the harness supports that via `-Target <repo> -Base <ref>`.

## What this gate establishes (replicated across two runs)

1. **Detection parity** — the subtree's reviewer panel finds what the flat wave finds (same personas, ported faithfully). No quality regression from the architecture change.
2. **Fix-and-verify-in-place works and is safe** — Banyan reviews, dedupes, fixes, re-tests, and commits on a genuinely clean tree, turning a red suite green, 0 false positives, no out-of-scope writes, never pushing. v1 did not apply on this benchmark.
3. **The trunk stays small** — ~7-8x less trunk-context burn and ~2.4x fewer trunk turns, by pushing work into the subtree. Total fleet token work is *comparable* to the flat wave (108k vs 121k output), not smaller — the win is context locality, not efficiency.
4. **Cost is not the headline risk** — single-digit dollars both ways; the nesting multiplier did not bite on a medium review.

## Verdict

**QUALIFIED GO for Phase 4.**

The subtree design matches v1 on detection and false positives (replicated), demonstrably delivers applied-and-verified fixes from a ~7-8x smaller trunk (replicated), and does so at comparable cost. That is enough to proceed: the central architectural bet — context-centric ownership keeps the trunk small at parity quality — is supported by direct, repeated measurement.

It is **qualified**, not unconditional, because:
- The apply-vs-apply head-to-head is benchmark-confounded: v1 abstained from applying on the fixture in both runs (partly fixture caution, partly genuine Stage-5c conservatism, partly de-advertise residue). Banyan's apply path is independently proven green and safe, but "Banyan applies, v1 reports" is a property of this target as much as of the tools.
- The ~7-8x trunk advantage is a *trunk-context* proxy (top-level `output_tokens`), not total context burn; the full-fleet token totals are comparable. Do not over-read it as a total-cost win.

### Recommended follow-ups (not gating)
- Run the A/B on 3-5 real PRs (`run-ab.ps1 -Target <repo> -Base <ref>`) for a residue-free apply comparison and broader recall.
- For a fully clean de-advertise, also normalize the seeded commit message and remove `.banyan/solutions/` from *both* branches so its deletion is not in the diff.
- Capture per-agent OTEL spans (`agent_id`/`parent_agent_id`) to attribute the subtree token totals precisely rather than via the modelUsage aggregate.
