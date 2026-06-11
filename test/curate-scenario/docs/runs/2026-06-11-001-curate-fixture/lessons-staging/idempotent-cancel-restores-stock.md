---
module: orders
date: 2026-06-11
problem_type: logic_error
component: service_object
severity: medium
status: candidate
symptoms:
  - "Cancelling the same order twice restores inventory twice"
  - "Stock count exceeds catalog quantity after duplicate cancel requests"
root_cause: missing_workflow_step
resolution_type: code_fix
related_components:
  - inventory
tags:
  - orders
  - cancellation
  - idempotency
  - stock-restore
---

# Order cancellation must restore stock once

## Problem

`cancelOrder` restores reserved inventory as a side effect. A duplicate cancel
request must not run the restore path twice, because the second restore creates
stock that was not reserved.

## Symptoms

- Calling `cancelOrder(orderId)` twice increases stock twice.
- The cancelled order remains cancelled, but inventory exceeds the catalog's
  original stock count.

## Root cause

The cancellation path lacks an idempotency guard around the stock restore side
effect.

## Solution

Return the already-cancelled order without touching inventory when the order is
already in a terminal cancelled state. Restore line-item stock only during the
first transition into cancellation.

## Prevention

- Add a duplicate-cancel test that captures stock before the second cancel and
  asserts that it is unchanged afterward.
- Treat state-transition side effects as one-shot actions, guarded by the prior
  state.
