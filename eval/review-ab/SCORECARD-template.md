# A/B scorecard: `/bn-review` vs `/ce-code-review`

Fill this in from ONE results directory produced by `run-ab.ps1`
(`eval/review-ab/results/<run-id>/`). Score against the rubric in
`protocol.md` sections 4-5. Metric names here match `protocol.md` section 3.
One filled scorecard per target (the fixture, then one per real PR).

---

## Run metadata

- results dir: `eval/review-ab/results/<run-id>/`
- target: `<fixture | repo path>`
- base ref: `<main | origin/main | sha>`
- review diff: `<base>..<head>`  (fixture: `main..seeded-bugs`)
- arms run: `<banyan, ce>`
- date scored / scorer: `<YYYY-MM-DD>` / `<human name | LLM judge model>`
- has answer key? `<yes = fixture | no = real PR>`  (no -> recall + FP not computable)

---

## 1. Per-arm metrics

| metric | banyan | ce (v1) | notes |
|---|---|---|---|
| seeded P0/P1 recall (gate)   | __ / 10 = __% | __ / 10 = __% | denominator = 10 P0/P1 (protocol 4.4) |
| seeded recall, all bugs      | __ / 12 = __% | __ / 12 = __% | secondary (incl. P2 BUG-08, BUG-12) |
| false-positive rate          | __ / __ = __% | __ / __ = __% | FP findings / total distinct findings |
| fixed-and-green rate         | __ / __ = __% | __ / __ = __% | green+pattern-gone / claimed-fixed |
| wall-clock (s)               | __            | __            | from `timing.txt` |
| total tokens                 | __            | __            | from `telemetry.json` (usage) |
| total cost (USD)             | __            | __            | from `telemetry.json` |
| trunk-context proxy          | __            | __            | APPROXIMATE (result size / sub-agent turns) |

---

## 2. Per-bug recall checklist (fixture only)

One row per inventory bug (`test/fixture-repo/.fixture/BUG-INVENTORY.md`). For
each arm: detected? (a finding maps to it, protocol 4.2); fixed? (an applied
change targets it); verified-green? (fixed-and-green, protocol 4.5). Put the
mapping note (which finding / hunk) in the last column.

Legend: Y = yes, N = no, - = n/a. `det` detected, `fix` applied a fix,
`grn` fixed-and-green.

| bug | sev | cat | file:line | banyan det/fix/grn | ce det/fix/grn | mapping note |
|---|---|---|---|---|---|---|
| BUG-01 | P0 | security        | src/orders.js:78    | _/_/_ | _/_/_ | IDOR ownership check |
| BUG-02 | P0 | security        | src/utils.js:46     | _/_/_ | _/_/_ | escapeHtml `<`/`>` (test-escaping) |
| BUG-03 | P1 | correctness     | src/cart.js:35      | _/_/_ | _/_/_ | addItem merge qty (test-caught) |
| BUG-04 | P1 | correctness     | src/inventory.js:42 | _/_/_ | _/_/_ | reserve off-by-one (test-caught) |
| BUG-05 | P0 | reliability     | src/orders.js:38    | _/_/_ | _/_/_ | rollback leak (test-caught) |
| BUG-06 | P1 | correctness     | src/cart.js:78      | _/_/_ | _/_/_ | totalCents discount sign (test-caught) |
| BUG-07 | P1 | security        | src/users.js:62     | _/_/_ | _/_/_ | publicView leaks salt/hash (test-escaping) |
| BUG-08 | P2 | performance     | src/inventory.js:20 | _/_/_ | _/_/_ | hasStock deep-clone (test-escaping) |
| BUG-09 | P1 | data-migration  | src/db.js:34        | _/_/_ | _/_/_ | migrate drops orders (test-caught, 2 tests) |
| BUG-10 | P1 | api-contract    | src/orders.js:100   | _/_/_ | _/_/_ | cancelOrder returns bool (test-caught) |
| BUG-11 | P1 | security        | src/users.js:24     | _/_/_ | _/_/_ | safeEqual not constant-time (test-escaping) |
| BUG-12 | P2 | maintainability | src/utils.js:25     | _/_/_ | _/_/_ | formatCents zero-pad (test-escaping) |

Tallies (fill from the rows above):

- banyan: P0/P1 detected __/10, fixed __, fixed-and-green __
- ce:     P0/P1 detected __/10, fixed __, fixed-and-green __

Sanity check against the suite: the 6 test-caught bugs are BUG-03, BUG-04,
BUG-05, BUG-06, BUG-09, BUG-10 (7 failing tests baseline; BUG-09 trips 2). A
fully-fixed arm should show `test-after.txt` GREEN. The 6 test-escaping bugs
(BUG-01, BUG-02, BUG-07, BUG-08, BUG-11, BUG-12) are scored by pattern-gone vs
the clean baseline (protocol 4.5), since the suite cannot see them.

---

## 3. False positives

Findings / applied changes that map to NO inventory bug and are not a defensible
real improvement (protocol 4.3). One row each; note the reasoning.

| arm | finding / change (file:line + summary) | why it is a false positive |
|---|---|---|
| banyan | | |
| ce | | |

Extra REAL findings (off-inventory but defensible improvements - NOT false
positives, recorded for honesty):

| arm | finding / change | why it is real |
|---|---|---|
| | | |

---

## 4. Cost / time comparison

| | banyan | ce (v1) | delta (banyan - ce) |
|---|---|---|---|
| wall-clock (s) | __ | __ | __ |
| total tokens   | __ | __ | __ |
| total cost USD | __ | __ | __ |

Cost justification (protocol 5.4): did Banyan's extra spend (if any) buy
measurably better recall or fixed-and-green? `<one or two sentences>`

---

## 5. GO / NO-GO

Evaluate the four gate conditions (protocol section 5) on the FIXTURE target:

1. RECALL - Banyan P0/P1 recall >= v1: `<PASS | FAIL>`  (__ vs __)
2. FIXED-AND-GREEN - Banyan higher or comparable: `<PASS | FAIL>`  (__ vs __)
3. FALSE POSITIVES - Banyan not materially worse: `<PASS | FAIL>`  (__ vs __)
4. COST - extra spend justified by quality: `<PASS | FAIL>`  (`<reason>`)

Real-PR targets do not contradict the fixture verdict: `<yes | no - explain>`

**VERDICT: GO / NO-GO**

Reasoning (2-4 sentences, cite the numbers above; if NO-GO, name what the review
subtree should rework - reviewer selection, dedup/confidence gate, or
finding-owner verification):

`<...>`
