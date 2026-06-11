# Migration: 2025 reservation holds

Status: applied (this is the legacy hold-expiry mechanism referenced by ARCHITECTURE.md).

## What it does

This migration introduced the temporary-hold step in the reservation lifecycle. When a
guest begins a booking, a row is written with `status = 'held'` and a `held_at` timestamp.

## Hold expiry

Hold expiry is **not** driven by a background job in this legacy path. Instead, whether (and
when) a hold expires is governed entirely by the `RESERVATION_HOLD_TTL` config value
(defined in `src/config.js`). The reservation read-path compares `now - held_at` against
`RESERVATION_HOLD_TTL` to decide if a held row should be treated as expired and the table
released.

To understand the *actual* expiry behavior in this service, you must read the value of
`RESERVATION_HOLD_TTL` in `src/config.js` — the migration only wires up the comparison; the
config value decides the outcome.
