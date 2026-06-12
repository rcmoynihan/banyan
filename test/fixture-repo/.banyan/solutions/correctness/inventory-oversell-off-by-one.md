---
module: inventory
date: 2026-05-02
problem_type: logic_error
component: service_object
severity: high
symptoms:
  - "Stock count goes negative after a burst of concurrent reservations"
  - "An order is accepted for one more unit than is actually in stock"
  - "reserve() does not throw when asked for exactly stock + 1 units"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - cart
  - orders
tags:
  - inventory
  - off-by-one
  - oversell
  - stock-reservation
  - boundary-condition
---

# Inventory reservation off-by-one allows overselling

## Problem

The `reserve(store, sku, qty)` guard in `src/inventory.js` is the single point
that decides whether a stock reservation may proceed. A boundary mistake in that
comparison lets a request for one more unit than exists slip through, decrementing
stock below zero and overselling the product.

## Symptoms

- A product with `stock = 3` accepts `reserve(..., 4)` without throwing.
- `product.stock` becomes `-1` after the bad reservation.
- Downstream order creation succeeds for inventory that does not exist.

## Root cause

The comparison was written as `product.stock < qty - 1` (or any variant that
shifts the boundary by one) instead of `product.stock < qty`. The `- 1` makes the
guard fire one unit too late: when `stock === qty - 1` the check is false, so the
code proceeds and drives stock negative. Off-by-one errors on inequality
boundaries are the classic source of oversell/undersell defects.

## Solution

Compare against the exact requested quantity, and fail (throw) rather than clamp:

```js
if (product.stock < qty) {
  throw new Error(
    `reserve: insufficient stock for ${sku} (have ${product.stock}, need ${qty})`
  );
}
product.stock -= qty;
```

Throwing (not silently clamping) is deliberate: the caller — order creation —
needs to roll back any sibling reservations atomically, which it can only do if
the failure is observable.

## Prevention

- Write a boundary test for **exactly** `stock` (must succeed) and **exactly**
  `stock + 1` (must throw). Off-by-one bugs only show up at the boundary; a test
  that reserves "a lot more than stock" passes even with the wrong operator.
- Treat any inequality on a resource-limit check as a review hot spot: state the
  intended boundary in a comment and assert it in a test.
- Keep the "fail, don't clamp" contract explicit so atomic rollback upstream
  stays correct.
