# Rotate API keys

## Purpose

This runbook describes the best-practice workflow for rotating third-party API
keys without checkout downtime.

## When to Use

Use this workflow for scheduled key rotation, suspected credential exposure, or
vendor-requested key replacement.

## Workflow

1. Create the replacement key in the vendor console with the same scopes as the
   active key.
2. Store the replacement as `CHECKOUT_API_KEY_NEXT`.
3. Deploy and verify the service can authenticate with both the active and next
   key.
4. Promote the replacement to `CHECKOUT_API_KEY`.
5. Deploy again and revoke the old key only after checkout health is green for
   30 minutes.

## Verification

- `POST /checkout` succeeds in staging with the next key.
- Production checkout error rate stays below alert threshold after promotion.
- Vendor logs show traffic on the new key before the old key is revoked.

## Rollback

Restore the previous `CHECKOUT_API_KEY` value while it remains active in the
vendor console, redeploy, and pause revocation.
