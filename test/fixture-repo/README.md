# Banyan fixture repo

A small, realistic, **zero-dependency** Node.js app that is the standing test bed
for every Banyan unit (review, research, delivery, harvesting). It exists to give
later phases a real git repo with a reviewable diff, seeded knowledge, and a tiny
plan — without any npm install or external packages.

## The app

A minimal e-commerce "shop" service. All money is integer cents; the data store
is in-memory. Modules:

| file | responsibility |
|---|---|
| `src/db.js` | in-memory store + a v1->v2 schema migration helper |
| `src/utils.js` | pure helpers: money math, quantity clamping, HTML escaping, promo table |
| `src/users.js` | user creation, auth, salted-hash compare, public views, roles |
| `src/inventory.js` | per-SKU stock, reservations, releases (must never oversell) |
| `src/cart.js` | per-user carts, line merging, promo codes, totals |
| `src/orders.js` | order creation from a cart (atomic stock reservation), ownership-gated reads/cancels |
| `src/index.js` | re-exports the module surface |

Tests live in `test/*.test.js` and use only the Node built-in runner
(`node:test` + `node:assert`). Run them with:

```bash
node --test
```

The **clean baseline** (the files actually committed under `src/` and `test/`)
is green: every test passes.

## Baseline vs seeded split

The review subtree (U8/U9) needs a real diff between a clean branch and a buggy
branch. We represent that **without hand-authored `.patch` files**:

- `src/` + `test/` here are the **CLEAN baseline**. `node --test` passes green.
- `.fixture/seeded/<same relative path>` holds **whole-file replacements** that
  introduce deliberate bugs. For example `.fixture/seeded/src/cart.js` is the
  buggy version of `src/cart.js`.
- `.fixture/BUG-INVENTORY.md` is the **ground-truth manifest**: one row per
  seeded bug (id, file:line, severity, category, expected reviewer, whether the
  test suite catches it, description, intended fix). It is the truth that review
  recall is scored against.

`scripts/fixture-init.ps1` materializes this into a sandbox git repo: it commits
the clean baseline on `main`, branches `seeded-bugs`, overlays every file from
`.fixture/seeded/`, and commits again. The result is a repo where
`git diff main..seeded-bugs` is exactly the seeded-bug diff and `main` is green.
The `.fixture/` directory itself is **excluded** from the sandbox copy — it is
fixture machinery, not app content.

## Seeded knowledge and plan (present on BOTH branches)

These live in the clean baseline so they exist on `main` and `seeded-bugs`:

- `docs/solutions/<category>/<slug>.md` — v1-schema solution docs (validate
  against the compound-engineering `schema.yaml`). One of them
  (`inventory-oversell-off-by-one`) is directly relevant to a seeded bug
  (BUG-04), so the U4 learnings-researcher retrieval test can surface it.
- `docs/plans/2026-06-10-001-feat-fixture-plan.md` — a tiny v1-style plan with
  three Implementation Units, for the U12 delivery tests.

## What uses this fixture

- **U4** — learnings-researcher retrieves `docs/solutions/.../inventory-oversell-off-by-one.md`.
- **U8/U9** — review subtree runs against `seeded-bugs`; recall scored vs `.fixture/BUG-INVENTORY.md`.
- **U10** — research subtree (a planted multi-hop trail can be added later).
- **U12** — delivery subtree executes `docs/plans/2026-06-10-001-feat-fixture-plan.md`.
- **U13** — lesson harvester runs over a review of this fixture.

See `.fixture/BUG-INVENTORY.md` for the bug list and the test-coverage mapping.
