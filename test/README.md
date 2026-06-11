# test/

Reproducible targets for exercising Banyan's subtrees.

- **`fixture-repo/`** — a zero-dependency Node app with a green 30-test baseline
  and a deterministic seeded-bug overlay (12 bugs across 7 categories, with a
  ground-truth inventory in `.fixture/BUG-INVENTORY.md`). Materialized into a
  throwaway sandbox by `scripts/fixture-init.ps1`; the standing target for the
  review subtree and the `eval/review-ab/` A/B harness. See its README.
- **`research-scenario/`** — a planted two-hop research trail (an architecture
  doc that names a migration that names a config whose real value is the buried
  leaf fact), for exercising `bn-research-lead` and `bn-thread-chaser`. See its
  README.
- **`onboard-scenario/`** — a compact repo-documentation corpus with classified
  source docs, linked derivative targets, curator bootstrap material, instruction
  drafts, and a manifest target for exercising `/bn-onboard`.
- **`curate-scenario/`** — a staged-lesson corpus with one duplicate candidate
  and one novel candidate, for exercising `/bn-curate` merge-vs-promote behavior.
- **`debug-scenario/`** — a planted single-bug app whose failing test blames the
  wrong module (the assertion points at inventory; the defect is the orders
  rollback), for exercising `bn-debug-lead` and `bn-hypothesis-investigator`.
  One test red by design; see its README for the answer key and live-run hygiene.
