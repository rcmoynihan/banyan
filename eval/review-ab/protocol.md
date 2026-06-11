# A/B evaluation protocol: Banyan `/bn-review` vs compound-engineering `/ce-code-review`

This protocol produces HONEST, reproducible evidence on whether the lead-owned
review subtree (`/bn-review`) is at least as good as the flat reviewer wave its
personas are vendored from (`/ce-code-review`). It is the go/no-go gate
referenced as unit U9 in the implementation plan
(`docs/plans/2026-06-10-001-feat-banyan-core-plan.md`).

The split of labor is deliberate:

- `run-ab.ps1` (the harness) only CAPTURES. It builds sandboxes, runs each arm
  headlessly, and records artifacts. It does not score and it does not judge.
- This document (`protocol.md`) defines WHAT is captured, HOW it maps to the
  ground truth, and the explicit GO / NO-GO rule.
- `SCORECARD-template.md` is the fill-in form a human or LLM judge completes
  from one results directory. Its metric names match this document exactly.

The trunk DRIVES the actual runs and the scoring; this file and the harness are
the instrument, not the verdict.

---

## 1. Targets

A "target" is a git repository plus a base ref. The diff under review is
`base..HEAD` (for the fixture, `main..seeded-bugs`).

### 1.1 Standing target: the seeded-bug fixture (reproducible)

The default, always-available target is the Banyan fixture repo
(`test/fixture-repo/`), materialized by `scripts/fixture-init.ps1` into a fresh
sandbox:

- branch `main` is the CLEAN baseline (passes `node --test`),
- branch `seeded-bugs` overlays the deliberate defects catalogued in
  `test/fixture-repo/.fixture/BUG-INVENTORY.md`,
- the review diff is `main..seeded-bugs` (12 seeded bugs across 7 categories).

The fixture is the standing target because it has a published ground truth
(`BUG-INVENTORY.md`): every reviewer claim and every applied change can be
scored objectively against a known answer key. This is the target the gate
verdict is primarily based on, because it is the only one with an answer key.

`run-ab.ps1` with no `-Target` builds this fixture sandbox automatically.

### 1.2 Real targets (the plan's "3-5 real PRs")

To exercise the arms on realistic diffs, point the harness at any local git
repo and a base ref:

```
pwsh -File eval/review-ab/run-ab.ps1 -Target /path/to/repo -Base origin/main
```

Requirements for a real target:

- it must be a git repo whose working tree / HEAD is the change under review,
- `-Base <ref>` must be a resolvable ref (`main`, `origin/main`, a SHA, a tag)
  such that `git diff <Base>..HEAD` is the intended review scope,
- ideally it has a runnable test suite (the harness auto-detects `node --test`,
  `npm test`, `pytest`, `cargo test`, `go test ./...`; "none detected" is valid
  but disables the fixed-and-green metric for that target).

Real targets have NO answer key, so for them seeded-bug recall and
false-positive rate are NOT computable. They contribute the wall-clock, token,
cost, and fixed-and-green (suite-passes) metrics, plus a human/LLM judgement of
finding quality. Run 3-5 of them per the plan; score each with its own
scorecard, and treat them as supporting evidence around the fixture verdict.

When a real target's working tree is dirty (the change is uncommitted), the
harness snapshots HEAD + a stash-free WIP commit inside the sandbox copy so the
arm sees the full change as `Base..HEAD`. See the harness header for details.

---

## 2. Arms

Both arms review the same diff in their OWN fresh sandbox copy (each arm mutates
the tree, so they must not share one). Each arm starts from the identical review
state (for the fixture: branch `seeded-bugs`, base `main`).

### 2.1 banyan arm

```
claude -p "/banyan:bn-review base:main" \
  --plugin-dir <in-target banyan plugin copy> \
  --dangerously-skip-permissions --output-format json
```

- cwd = the sandbox, checked out on `seeded-bugs`.
- NOTE: plugin commands loaded via `--plugin-dir` are NAMESPACED by plugin name.
  The bare `/bn-review` is NOT registered headlessly; the command is
  `/banyan:bn-review` (verified). The harness invokes the namespaced form.
- `/banyan:bn-review` is the thin trunk entry: it detects scope, stages the diff into a
  run dir, and dispatches `bn-review-lead`, which selects reviewers, dedupes
  findings, and then gives EACH surviving finding to a `bn-finding-owner` child
  that INDEPENDENTLY verifies (fresh context, re-runs the failing case), fixes,
  and re-tests in place. The lead writes an applied verdict to
  `docs/runs/<run-id>/review-verdict.md` and commits on a clean tree (never
  pushes).
- `--dangerously-skip-permissions` is REQUIRED so nested finding-owners can edit
  files headlessly; the sandbox is throwaway.
- `--output-format json` yields a final JSON object with `result` (the lead's
  one-line verdict text), `usage` (token counts), and `total_cost_usd`.

### 2.2 ce arm (compound-engineering v1)

```
claude -p "/compound-engineering:ce-code-review base:main" \
  --plugin-dir <in-target compound-engineering plugin copy> \
  --dangerously-skip-permissions --output-format json
```

- cwd = the sandbox, checked out on `seeded-bugs`.
- NOTE: namespaced like the banyan arm. The bare `/ce-code-review` is NOT
  registered headlessly; the command is `/compound-engineering:ce-code-review`
  (verified). The harness invokes the namespaced form.
- `/compound-engineering:ce-code-review` in DEFAULT mode (no `mode:agent`) applies safe, verified
  fixes and commits them when the tree is clean (it never pushes), mirroring the
  banyan arm's apply behavior so the comparison is like-for-like. It spawns
  parallel reviewer personas that return JSON, merges/dedupes with a
  confidence gate, runs an independent VALIDATOR wave (one validator per
  surviving finding, Stage 5b) and applies in Stage 5c.
- The v1 plugin lives at `tmp/compound-engineering-upstream/plugins/compound-engineering`
  (pinned vendor cache). If absent, run `scripts/vendor.ps1` to populate the
  cache (or clone the upstream repo there). Like banyan, the harness copies it
  INTO the sandbox and loads the in-target copy via `--plugin-dir`, because the
  ce skill loads `references/*.md` at runtime and a --plugin-dir outside the cwd
  is blocked by the file-access sandbox.
- Same flags and json output contract as the banyan arm.

### 2.3 The asymmetry, stated honestly

Both arms APPLY and commit on a clean tree. They are NOT identical in HOW they
gain confidence before applying:

- Banyan does INDEPENDENT PER-FINDING verification: each `bn-finding-owner` is a
  fresh-context child that re-derives the bug and re-runs tests before and after
  its own fix. Verification and fixing are fused per finding.
- v1 does a VALIDATOR WAVE then a separate apply stage (Stage 5b validators +
  Stage 5c apply): one validator sub-agent per surviving finding rejects or
  confirms, and confirmed findings are applied centrally.

Both therefore claim "fix-and-verify," but the unit of verification differs
(fused per-finding owner vs. a validate-then-apply pipeline). This asymmetry is
the thing under test; do not paper over it when scoring. The structural cost
difference (a finding-owner per finding vs. a validator per finding) is captured
by the token/cost metrics, not assumed.

A note on `mode:agent`: v1 also has a report-only `mode:agent` that returns JSON
and does NOT apply. We deliberately do NOT use it for the apply-vs-apply
comparison, because it would compare Banyan-applies against v1-reports. If a
future run wants a report-only quality comparison, it can be added as a third
arm; the gate verdict uses the apply-vs-apply arms above.

### 2.4 De-advertising the fixture (`-Deadvertise`): a FAIR apply comparison

The seeded-bug fixture wears its nature on its sleeve: every seeded `src/*.js`
file carries a `BUG-<n>` comment block describing the planted defect, and
`docs/solutions/` catalogs the exact bug classes. A cautious applier notices
this. In particular, v1's Stage 5c (apply) ABSTAINS on trees it recognizes as
an obvious test fixture - it declines to commit "fixes" to code that is plainly
a deliberate exercise. That asymmetry is not a quality difference between the
arms; it is the fixture leaking its answer key into the apply decision, which
makes a raw apply-vs-apply comparison UNFAIR to whichever arm is more cautious.

`run-ab.ps1 -Deadvertise` removes the tells WITHOUT changing the bugs, so both
arms face a tree that looks like ordinary (buggy) code. After `fixture-init`
builds the source sandbox and BEFORE any arm runs, on the `seeded-bugs` branch
the harness:

- (a) strips every `BUG-<n>` source-comment block from `src/*.js` (the whole
  contiguous `//` comment block anchored by the `BUG-<n>` line; only comment
  lines are removed, executable code is never touched),
- (b) removes the `docs/solutions/` directory (it documents these exact bug
  classes - a giveaway),
- (c) `git commit --amend`s the `seeded-bugs` commit so `main..seeded-bugs` no
  longer carries the tells (`main`, the clean baseline, is left untouched and
  green),
- (d) re-runs `node --test` and ASSERTS the bugs are still present: the failing
  count must be UNCHANGED from before the transform (the fixture fails ~7/30).
  If the count changed, a bug was accidentally removed (not just a comment), so
  the harness FAILS setup rather than running an invalid eval.

The de-advertised diff is still exactly the seeded-bug diff in BEHAVIOR (same
bugs, same failing tests), only the meta-commentary is gone. Recall / false-
positive scoring against `BUG-INVENTORY.md` is UNAFFECTED: the inventory's
`file:line` anchors and `intended fix` shapes still map (the `BUG-<n>` source
markers are not required for scoring; section 4.2 already allows mapping by
file + line +/- 5 + category). The mode is recorded in `<OutDir>/summary.txt`
(the `deadvert:` line) and in each `<arm>/deadvertised.txt`, and the displayed
"exact command" notes the de-advertised tree.

`-Deadvertise` is FIXTURE-ONLY (it is ignored, with a warning, for a real
`-Target`). Use it for the apply-vs-apply gate run so the apply decision is
driven by review quality, not by fixture recognition.

### 2.5 Capture integrity: clean-tree exclusion + symmetric report capture

Two harness mechanics keep the captured artifacts honest and symmetric:

- CLEAN-TREE EXCLUSION (eval validity). The harness installs each arm's plugin
  INTO the sandbox's `.claude/` (banyan via `dev-install`, ce via a direct
  copy). That leaves the sandbox's `git status --porcelain` DIRTY with an
  untracked `.claude/` before the review runs, which would both pollute the
  clean-tree commit-safety signal a scorer reads AND make the eval invalid (the
  arm would see a non-clean tree it never created). So, AFTER the plugin is
  installed but BEFORE the pre-review checkpoint, the harness writes the
  harness-injected scratch (`.claude/`) into the sandbox's
  `.git/info/exclude` - IDENTICALLY for both arms - and then VERIFIES
  `git status --porcelain` is EMPTY. The now-clean status is recorded to
  `<arm>/pre-status.txt` as before. If the tree is still non-empty after the
  exclusion, the harness writes a clear WARN (to `<arm>/WARN-dirty-tree.txt`
  and the summary) so the scorer knows the clean-tree test for that arm is
  compromised.

- SYMMETRIC REPORT CAPTURE. For BOTH arms the harness extracts the final
  `result` text from `<arm>/output.json` and writes it to `<arm>/report.md`, so
  each arm has a human-readable report artifact in the same place (if
  `output.json` has no `result`, `report.md` notes that). The banyan arm
  ADDITIONALLY gets its structured `docs/runs/*/review-verdict.md` copied to
  `<arm>/verdict.md` as before - `report.md` is in addition to, not instead of,
  `verdict.md`.

---

## 3. Metrics (captured per arm, scored per target)

The harness captures the raw artifacts; the judge derives these from them.

| metric | definition | source artifacts |
|---|---|---|
| seeded-bug recall (P0/P1) | of the review-detectable P0/P1 bugs in the inventory, the fraction that the arm SURFACED (reported as a finding OR demonstrably fixed by an applied change). Denominator = count of inventory P0/P1 rows (see 4.4). | `output.json` (`result` + transcript), `report.md` (both arms), `applied.diff`, `verdict.md` (banyan) |
| seeded-bug recall (all) | same, over ALL inventory bugs (P0/P1/P2). Secondary; the gate uses the P0/P1 figure. | same |
| false-positive rate | findings or applied changes that match NO inventory bug and are not a defensible real improvement, as a fraction of total distinct findings/changes the arm produced. | `output.json`, `applied.diff` |
| fixed-and-green rate | of the bugs the arm CLAIMED to fix (applied a change for), the fraction where (a) the post-run suite passes AND (b) the per-bug buggy pattern is gone vs the clean baseline (see 4.5). | `applied.diff`, `test-after.txt`, fixture clean baseline |
| wall-clock | seconds from arm invocation to arm exit. | `timing.txt` |
| total tokens | input + output (+ cache) tokens for the whole arm run, from the json `usage`. | `telemetry.json` |
| total cost (USD) | `total_cost_usd` from the json. | `telemetry.json` |
| trunk-context proxy | APPROXIMATE only headlessly: the size of the final `result` text and the count of distinct sub-agent turns inferable from the transcript stand in for "how much landed back at the trunk." Note it is a proxy, not a true window measurement. | `output.json` |

Notes:

- Token/cost come straight from `--output-format json` (`usage`,
  `total_cost_usd`); no OTEL is required. If a future setup has OTEL
  `agent_id`/`parent_agent_id` spans, per-subtree attribution can refine the
  trunk-context proxy, but it is not needed for the gate.
- The trunk-context proxy is explicitly approximate. Headless `claude -p` does
  not expose the live context-window fraction, so do NOT report it as an exact
  percentage; report the proxy and label it as such.

---

## 4. Scoring rubric (judgeable by a human or an LLM)

A finding/change is scored against `BUG-INVENTORY.md`. Keep judgements
conservative and write the reasoning in the scorecard.

### 4.1 What is a "finding"

A distinct issue the arm reports OR an applied hunk in `applied.diff` that
clearly targets one defect. Multiple reviewers flagging the same defect (same
file + nearby line + same idea) count as ONE finding (dedupe first), matching
the fingerprint rule both pipelines use (file + line +/-3 + normalized title).

### 4.2 Mapping a finding to an inventory bug (a "hit")

A finding maps to inventory `BUG-NN` when ALL of:

1. FILE matches the inventory `file` (same source file), AND
2. LINE is within +/- 5 lines of the inventory `file:line` anchor (the anchors
   are approximate; the `BUG-NN` comment in the seeded source is the exact
   marker, so an applied change touching that marked region also satisfies
   this), AND
3. CATEGORY/DESCRIPTION matches: the finding describes the SAME defect as the
   inventory `description` (e.g. "auth/ownership check dropped -> IDOR" for
   BUG-01), not merely the same line for an unrelated reason.

A single inventory bug is counted as hit AT MOST ONCE even if several findings
map to it. Record the mapping (which finding -> which BUG-NN) in the scorecard's
per-bug checklist so it is auditable.

### 4.3 What counts as a false positive

A finding/applied change that maps to NO inventory bug under 4.2 AND is not a
defensible genuine improvement of the seeded code. Style nits and speculative
refactors with no behavioral basis count as false positives. A change that fixes
a REAL latent issue not in the inventory is NOT a false positive (note it as an
"extra real finding" instead) - but be strict: the inventory is the seeded
truth, and the fixture's clean baseline is known-good, so most off-inventory
"fixes" to baseline code are noise. When in doubt, record the reasoning and lean
toward calling speculative changes false positives.

False-positive RATE = (false-positive findings) / (total distinct findings).

### 4.4 The recall denominator (review-detectable P0/P1)

The inventory has 3 P0 (BUG-01, BUG-02, BUG-05) and the P1 set (BUG-03, BUG-04,
BUG-06, BUG-07, BUG-09, BUG-10, BUG-11). All 12 bugs are review-detectable by
construction (each has a named expected reviewer), so the P0/P1 denominator is
the COUNT of P0+P1 inventory rows = 3 P0 + 7 P1 = 10. (P2 bugs BUG-08 and BUG-12
are excluded from the gate denominator; they contribute only to "recall (all)".)
The "caught-by-test?" column does NOT change the denominator - a reviewer is
expected to surface test-escaping bugs too; it only affects whether a
finding-owner can verify a fix by re-running tests (see 4.5).

### 4.5 Deciding "fixed-and-green"

For a bug the arm CLAIMED to fix (there is an applied hunk for it):

1. SUITE GREEN: run the target's test command in the post-run sandbox and read
   the exit code. For the fixture this is `node --test`; green = exit 0 with
   0 failing. The harness already captures this to `<arm>/test-after.txt`.
   - For the 6 test-caught bugs (BUG-03, BUG-04, BUG-05, BUG-06, BUG-09,
     BUG-10), a correct fix turns the suite GREEN; a wrong/absent fix leaves it
     RED. Green is necessary but, alone, only proves the test-caught bugs.
2. PATTERN GONE (per-bug, also covers the 6 test-escaping bugs): for each
   claimed bug, check that the buggy pattern from the seeded file is gone and the
   intended-fix shape is present, by comparing the arm's post-run file against
   the fixture's CLEAN baseline (`test/fixture-repo/src/<file>`) for that region.
   The inventory's `intended fix` column states the expected shape (e.g. BUG-02
   re-adds `.replace(/</g,'&lt;')`). This is how test-escaping bugs (BUG-01,
   BUG-02, BUG-07, BUG-08, BUG-11, BUG-12) are scored, since the suite cannot.

A bug is "fixed-and-green" when its claimed fix makes the suite green (or leaves
it green for test-escaping bugs) AND its buggy pattern is gone per the baseline
comparison. fixed-and-green RATE = (bugs fixed-and-green) / (bugs the arm
claimed to fix).

### 4.6 LLM-judge guidance

An LLM judge scoring a results dir should: dedupe findings (4.1), map each to an
inventory bug (4.2) or mark it a false positive (4.3), fill the per-bug recall
checklist, and apply 4.5 using `applied.diff` + `test-after.txt` + the fixture
baseline. Every non-obvious call gets a one-line reason in the scorecard. The
inventory file and the clean baseline are the only ground truth; do not infer
correctness from the arm's own prose.

---

## 5. GO / NO-GO criterion

Banyan's review subtree is **GO** if, on the seeded-bug fixture target, ALL hold:

1. RECALL: Banyan's seeded P0/P1 recall is >= v1's seeded P0/P1 recall.
2. FIXED-AND-GREEN: Banyan's fixed-and-green rate is HIGHER than, or comparable
   to (within a small margin, e.g. not more than ~1 bug / ~10 percentage points
   below), v1's.
3. FALSE POSITIVES: Banyan's false-positive rate is not MATERIALLY worse than
   v1's (a small increase is acceptable; roughly a doubling, or > ~15 absolute
   percentage points worse, is material).
4. COST: Banyan's token/cost is JUSTIFIABLE in the notes - i.e. any extra spend
   buys measurably better recall or fixed-and-green. The plan flags the 3-15x
   multiplier as the main external risk, so a large cost gap with NO quality gain
   is a NO-GO even if 1-3 pass.

Otherwise Banyan is **NO-GO**: either it does not beat the flat wave on quality,
or it costs materially more for no quality gain. A NO-GO sends the review subtree
back for rework (reviewer selection, dedup gate, or finding-owner verification).

The real-PR targets are supporting evidence: they should not CONTRADICT the
fixture verdict (e.g. Banyan should not be wildly more expensive or noisier on
real diffs). If they do, record the conflict and treat the gate as NO-GO pending
investigation. The single-line GO / NO-GO with its reasoning lives at the bottom
of each filled scorecard, and the trunk reconciles the fixture + real-PR
scorecards into the final gate call.
