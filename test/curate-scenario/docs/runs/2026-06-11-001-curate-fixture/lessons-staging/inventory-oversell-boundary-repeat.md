---
module: inventory
date: 2026-06-11
problem_type: logic_error
component: service_object
severity: high
status: candidate
symptoms:
  - "A reservation for stock + 1 units succeeds"
  - "Inventory goes negative after the oversized reservation"
  - "The order path accepts a product that should have failed reservation"
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

# Stock-plus-one reservations must fail

## Problem

Inventory reservations need an exact boundary check: reserving all available
stock is valid, but reserving one more than available stock must throw. The
stock-plus-one case is the smallest failing example and catches the oversell
defect directly.

## Symptoms

- `reserve(store, sku, stock + 1)` succeeds.
- Stock drops below zero after the reservation.
- Order creation treats the reservation as valid.

## Root cause

The stock guard is one unit too permissive.

## Solution

Use `product.stock < qty` as the failure condition, and leave the exact-stock
case as the successful boundary.

## Prevention

- Keep adjacent tests for exact-stock and stock-plus-one reservations.
- Name the stock-plus-one case explicitly so future reviewers see the intended
  boundary.
