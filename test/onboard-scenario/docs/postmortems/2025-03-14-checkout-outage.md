# Checkout outage on 2025-03-14

## Impact

Checkout failed for 18 minutes. `POST /checkout` returned 500 for 312 requests,
and 47 carts stayed locked in `processing` until support replayed them. No
customers were charged twice.

## Timeline

- 09:12 UTC: Error rate alert fired for `POST /checkout`.
- 09:15 UTC: On-call confirmed payment retries were creating new provider calls.
- 09:22 UTC: Checkout traffic was paused at the edge.
- 09:28 UTC: The retry patch was deployed.
- 09:30 UTC: Traffic resumed and error rate returned to baseline.
- 09:42 UTC: Locked carts were replayed successfully.

## Symptoms

- `POST /checkout` returned 500 after transient payment-provider timeouts.
- Payment logs showed `idempotency key mismatch` on retry.
- Carts stayed in `processing` after the failed retry path.

## Root Cause

The retry wrapper generated a fresh payment idempotency key for each attempt.
The provider rejected the second call because the cart already had a pending
payment attempt with a different key. The checkout error path also skipped cart
unlocking after provider errors.

Root cause category: logic_error.

## Resolution

Checkout now persists one idempotency key per cart attempt and reuses it for all
payment retries. The cart lock is released in the provider-error path before the
error is returned to the caller.

Resolution type: code_fix.
