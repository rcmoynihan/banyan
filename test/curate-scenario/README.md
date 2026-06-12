# Curate verification scenario

This standalone target exercises `/bn-curate` and `bn-knowledge-curator`.

The scenario contains one existing `.banyan/solutions/` entry and one run with two
staged candidates:

- `inventory-oversell-boundary-repeat.md` overlaps the existing inventory
  off-by-one solution and should be merged into it.
- `idempotent-cancel-restores-stock.md` has no strong overlap and should be
  promoted into `.banyan/solutions/logic-errors/`.

Run from this directory with the Banyan plugin loaded:

```text
/bn-curate 2026-06-11-001-curate-fixture
```

Pass criteria:

1. The duplicate candidate is merged into
   `.banyan/solutions/correctness/inventory-oversell-off-by-one.md`.
2. The novel candidate is promoted to
   `.banyan/solutions/logic-errors/idempotent-cancel-restores-stock.md` with
   `status: candidate` stripped.
3. `.banyan/runs/2026-06-11-001-curate-fixture/lessons-staging/` is empty after
   curation.
4. `.banyan/runs/2026-06-11-001-curate-fixture/curation-summary.md` follows the
   shape in `expected/curation-summary.md`.
