# eval/

Evaluation harnesses for Banyan's subtrees.

## review-ab/

An A/B evaluation of Banyan's `/bn-review` against compound-engineering's
`/ce-code-review` over the same diff, on a reproducible target with published
ground truth (the seeded-bug fixture in `test/fixture-repo/`).

- `protocol.md` — what is captured, how it maps to ground truth, and the
  explicit GO / NO-GO scoring rule.
- `run-ab.ps1` — the capture harness: builds isolated per-arm sandboxes, runs
  each arm headlessly, and records every artifact a judge needs (diffs, commits,
  test results, reports, telemetry). It captures only; it does not score.
- `SCORECARD-template.md` — the fill-in form a human or LLM judge completes from
  one results directory.
- `results/SCORECARD.md` — the filled scorecard for the standing fixture target.
  Per-run capture directories under `results/` are gitignored (reproducible
  artifacts; the scorecard is the kept record).

Run it:

```
pwsh eval/review-ab/run-ab.ps1 -DryRun        # validate plumbing only
pwsh eval/review-ab/run-ab.ps1                # full run, both arms
pwsh eval/review-ab/run-ab.ps1 -Deadvertise   # fair mode: strip fixture tells first
```
