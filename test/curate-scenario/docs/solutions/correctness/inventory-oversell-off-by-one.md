---
module: inventory
date: 2026-05-02
problem_type: logic_error
component: service_object
severity: high
symptoms:
  - "Stock count goes negative after an oversized reservation"
  - "An order is accepted for one more unit than is actually in stock"
  - "reserve() does not throw when asked for exactly stock + 1 units"
root_cause: logic_error
resolution_type: code_fix
related_components:
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

The `reserve(store, sku, qty)` guard in `src/inventory.js` decides whether a
stock reservation may proceed. A boundary mistake in that comparison lets a
request for one more unit than exists slip through, decrementing stock below
zero and overselling the product.

## Symptoms

- A product with `stock = 3` accepts `reserve(..., 4)` without throwing.
- `product.stock` becomes `-1` after the bad reservation.
- Downstream order creation succeeds for inventory that does not exist.

## Root cause

The comparison shifts the boundary by one unit, so the guard fires too late.
The exact-stock case must pass, and the stock-plus-one case must fail.

## Solution

Compare against the exact requested quantity, and fail instead of clamping:

```js
if (product.stock < qty) {
  throw new Error(`reserve: insufficient stock for ${sku}`);
}
product.stock -= qty;
```

## Prevention

- Test both `stock` and `stock + 1`; the bug only appears at the boundary.
- Treat inequality checks on resource limits as review hot spots.
