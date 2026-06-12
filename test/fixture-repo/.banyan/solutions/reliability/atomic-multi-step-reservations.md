---
module: orders
date: 2026-05-03
problem_type: best_practice
component: service_object
severity: medium
applies_when:
  - "A single operation must acquire several resources that can each fail"
  - "Partial acquisition would leave shared state (stock, balances) corrupted"
related_components:
  - inventory
tags:
  - atomicity
  - rollback
  - reliability
  - reservations
  - error-handling
---

# Roll back over what you actually acquired, not over what failed

## Guidance

When an operation reserves several resources in sequence (e.g. order creation
reserving stock for each cart line), and any step can throw, the cleanup path
must release **exactly the resources that were successfully acquired** — no more,
no less. Track the acquired set as you go and unwind that set on failure.

## Why

Two failure modes are easy to write and both corrupt shared state:

1. **Releasing the failed item.** The item that threw was never acquired, so
   releasing it adds phantom resources back (over-release), while the items that
   *were* acquired are never returned (leak). Net: stock drifts permanently.
2. **Releasing nothing.** Successfully reserved units stay decremented forever.

The correct shape keeps an explicit accumulator:

```js
const acquired = [];
try {
  for (const line of lines) {
    reserve(store, line.sku, line.qty);
    acquired.push(line);          // record only on success
  }
} catch (err) {
  for (const line of acquired) {   // unwind exactly the successes
    release(store, line.sku, line.qty);
  }
  throw err;
}
```

## Applies when

- Multi-step reservation, transfer, or allocation logic where steps are
  independent and individually fallible.
- Any place a `try/catch` compensates for a partial side effect.

## Verification

- Add a test where the **second** of two reservations fails and assert that the
  first resource's level is fully restored and the failing resource's level is
  untouched. This is the only test that distinguishes "release the successes"
  from "release the failure".
