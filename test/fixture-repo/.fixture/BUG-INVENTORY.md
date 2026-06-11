# Seeded bug inventory (ground truth)

This is the **authoritative manifest** of every bug intentionally introduced by the
seeded overlay (`.fixture/seeded/`). It is the truth that review-subtree tests
(U8/U9) score against: a reviewer's recall is measured against the bugs listed
here. Keep this file and the seeded source files in lockstep — if you change a
seeded file, update the matching row.

## How to read this

- `file:line` is the location in the **seeded** file (the buggy version). Line
  numbers are approximate anchors to the introduced defect; the `BUG-NN` comment
  in the seeded source is the exact marker.
- `severity` uses Banyan's scale:
  - **P0** — critical: security, data-loss, or data-corruption.
  - **P1** — high-impact: wrong results, broken contracts, reliability failures.
  - **P2** — moderate: performance or maintainability defects with limited blast radius.
- `category` is one of: correctness, security, performance, reliability,
  api-contract, data-migration, maintainability, testing.
- `reviewer-expected-to-catch` names the Banyan reviewer persona that should
  surface the bug (see `plugin/agents/bn-*-reviewer.md`).
- `caught-by-test?` — does the **baseline** `node --test` suite go red when this
  seeded file is overlaid? `yes` means a finding-owner can verify a fix by
  re-running tests; `no` means the bug escapes the suite and is reviewer-only.

## Summary

- **12 bugs** across **7 categories** (correctness, security, reliability,
  performance, api-contract, data-migration, maintainability).
- **3 P0** (BUG-01 security IDOR, BUG-02 security XSS, BUG-05 reliability/data-corruption).
- **6 caught by tests** (BUG-03, BUG-04, BUG-05, BUG-06, BUG-09, BUG-10).
- **6 escape the suite / reviewer-only** (BUG-01, BUG-02, BUG-07, BUG-08, BUG-11, BUG-12).

## Inventory

| id | file:line | severity | category | reviewer-expected-to-catch | caught-by-test? | description | intended fix |
|---|---|---|---|---|---|---|---|
| BUG-01 | src/orders.js:78 | P0 | security | bn-security-reviewer | no | `getOrder` dropped the ownership/authorization check — any actor can read any order by id (IDOR). | Restore `if (order.userId !== actor.id && !isAdmin(actor)) return null;` before returning the order. |
| BUG-02 | src/utils.js:46 | P0 | security | bn-security-reviewer | no | `escapeHtml` no longer escapes `<` and `>`, allowing stored XSS via injected `<script>` tags. | Re-add the `.replace(/</g,'&lt;')` and `.replace(/>/g,'&gt;')` steps. |
| BUG-03 | src/cart.js:35 | P1 | correctness | bn-correctness-reviewer | yes | `addItem` overwrites the existing line quantity instead of merging, silently losing previously added units. | Sum the existing line qty with the new qty before clamping: `const desired = current + qty;`. |
| BUG-04 | src/inventory.js:42 | P1 | correctness | bn-correctness-reviewer | yes | Off-by-one in `reserve` (`stock < qty - 1`) lets a request for `stock + 1` pass the guard and drive stock negative (oversell). | Use `if (product.stock < qty)` so any insufficient request throws. |
| BUG-05 | src/orders.js:38 | P0 | reliability | bn-reliability-reviewer | yes | `createOrder` rollback releases the line that FAILED to reserve and never releases the lines that succeeded, leaking inventory and corrupting stock. | Roll back over the `reserved` array: `for (const line of reserved) release(store, line.sku, line.qty);`. |
| BUG-06 | src/cart.js:78 | P1 | correctness | bn-correctness-reviewer | yes | `totalCents` adds the discount to the subtotal instead of subtracting it, overcharging on every promo. | Return `subtotal - discount`. |
| BUG-07 | src/users.js:62 | P1 | security | bn-security-reviewer | no | `publicView` spreads the whole user record, leaking `salt` and `passwordHash`. | Return only `{ id, email, role }`. |
| BUG-08 | src/inventory.js:20 | P2 | performance | bn-performance-reviewer | no | `hasStock` deep-clones the entire inventory map (via `JSON.parse(JSON.stringify(...))`) on every call, turning an O(1) lookup into O(n). | Read the product directly from `store.inventory.get(sku)` without cloning. |
| BUG-09 | src/db.js:34 | P1 | data-migration | bn-data-migration-reviewer | yes | `migrate` initializes `orders` to an empty Map instead of copying `snapshot.orders`, dropping every existing order. | Initialize `orders: new Map(snapshot.orders || [])`. |
| BUG-10 | src/orders.js:100 | P1 | api-contract | bn-api-contract-reviewer | yes | `cancelOrder` returns a boolean instead of the updated order object, breaking callers that read `.status`/`.id`. | Return the `order` object. |
| BUG-11 | src/users.js:24 | P1 | security | bn-security-reviewer | no | `safeEqual` early-returns on length mismatch and uses a non-constant-time `==` compare, abandoning the timing-safe guarantee. | Restore the `crypto.timingSafeEqual` Buffer comparison with an explicit length check that returns false. |
| BUG-12 | src/utils.js:25 | P2 | maintainability | bn-maintainability-reviewer | no | `formatCents` dropped the zero-padding, so amounts with cents < 10 render as e.g. `$19.5` instead of `$19.05`. | Re-add `.padStart(2, '0')` to the cents remainder. |

## Notes for fixture maintainers

- The escaped bugs (`caught-by-test?: no`) are deliberately not exercised by any
  test. `src/users.js` has **no** test file at all (BUG-07, BUG-11 escape by
  construction); the `escapeHtml` and `formatCents` tests avoid the `<`/`>` and
  cents-`< 10` cases respectively so BUG-02 and BUG-12 escape.
- The caught bugs are each guarded by a named test (see the `Guards BUG-NN`
  comments in `test/*.test.js`). Overlaying the seeded files turns those tests
  red and only those. **6 distinct bugs are caught, surfacing as 7 failing
  tests**: BUG-09 (migrate data loss) trips both `migrate preserves all orders`
  and `migrate is idempotent` because the empty-orders Map breaks both. The
  6-caught -> 7-failures mapping is the expected, verified result.

  | failing test | bug |
  |---|---|
  | addItem merges quantity for the same sku (no data loss) | BUG-03 |
  | totalCents subtracts the promo discount (never adds it) | BUG-06 |
  | migrate preserves all orders and backfills currency (no data loss) | BUG-09 |
  | migrate is idempotent on an already-current store | BUG-09 |
  | reserve refuses to oversell (off-by-one guard) | BUG-04 |
  | createOrder is atomic: a failing line rolls back earlier reservations | BUG-05 |
  | cancelOrder returns the updated order object and restores stock | BUG-10 |
- BUG-11's primary reviewer is listed as `bn-security-reviewer` (timing side
  channel is a security concern); a reliability reviewer may also flag it. Cross-
  reviewer agreement is expected and is a feature, not a double-count — dedup by
  the U8 fingerprint rule (file + line +/-3 + normalized title).
