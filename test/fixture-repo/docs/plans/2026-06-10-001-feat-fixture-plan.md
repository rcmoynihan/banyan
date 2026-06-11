---
title: Add wishlist support to the shop fixture
type: feat
date: 2026-06-10
plan_id: "001"
status: draft
---

# Add wishlist support to the shop fixture

## Overview

Add a lightweight **wishlist** feature to the fixture shop app: a per-user list of
SKUs a customer wants to buy later, with the ability to move a wishlist entry into
the cart. This is a small, self-contained feature chosen to exercise the Banyan
delivery subtree (U12): three Implementation Units, two independent and one that
depends on both.

Scope is deliberately tiny and fully testable with the built-in `node --test`
runner so a delivery run produces a green suite without external dependencies.

## Design invariants

- Zero new dependencies — `node:test` + `node:assert` only.
- Integer cents everywhere; reuse `src/utils.js` helpers.
- One writer per file set: each unit owns disjoint files (see unit boundaries).

## Implementation Units

### U1: Wishlist store and core operations

- **Goal:** A `src/wishlist.js` module with `createWishlist`, `addSku`,
  `removeSku`, and `listSkus`, backed by a `wishlists` Map on the store.
- **Dependencies:** none (independent).
- **Files:** `src/wishlist.js` (new), `src/db.js` (add `wishlists: new Map()` to
  `createStore`). NOTE: if delivery isolates units in worktrees, the `db.js`
  touch is a shared-file edit — assign it to whichever unit-lead owns the store,
  or hoist it to the integrator.
- **Approach:** Mirror the cart module's shape. A wishlist belongs to one user;
  `addSku` is idempotent (adding the same SKU twice is a no-op).
- **Verification:** `test/wishlist.test.js` — add/remove/list, idempotent add,
  unknown-SKU rejection. Green under `node --test`.

### U2: Move-to-cart bridge

- **Goal:** A `moveToCart(store, wishlistId, cartId, sku)` operation that removes
  a SKU from the wishlist and adds one unit of it to the cart.
- **Dependencies:** U1 (needs the wishlist module).
- **Files:** `src/wishlist.js` (extend).
- **Approach:** Compose existing `cart.addItem` + `wishlist.removeSku`. Reject if
  the SKU is not on the wishlist. Respect stock clamping already in `addItem`.
- **Verification:** `test/wishlist.test.js` — moving a wished SKU adds it to the
  cart and removes it from the wishlist; moving a SKU not on the list throws.

### U3: Wishlist totals helper

- **Goal:** A `wishlistValueCents(store, wishlistId)` helper returning the sum of
  current prices of all wished SKUs (for a "your wishlist is worth $X" display).
- **Dependencies:** U1 (independent of U2).
- **Files:** `src/wishlist.js` (extend), reuse `src/inventory.getProduct`.
- **Approach:** Sum `getProduct(store, sku).priceCents` across the wishlist; skip
  SKUs no longer in the catalog rather than throwing.
- **Verification:** `test/wishlist.test.js` — value reflects current catalog
  prices; removed/unknown SKUs are skipped.

## Sequencing

```
U1 ──► U2
  └───► U3
```

U2 and U3 both depend on U1 but are independent of each other (can run in parallel
worktrees), then merge in dependency order. This shape is the point: it gives the
delivery subtree a real parallel-then-merge case with one shared-file hazard
(`db.js`) to partition.

## Verification (whole feature)

- `node --test` green on the merged result.
- Per-unit mini-review evidence present in the run ledger.
- No file written outside the unit boundaries declared above.
