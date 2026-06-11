# Architecture

This service manages table reservations for a restaurant booking platform.

## Reservations

A reservation moves through `pending -> held -> confirmed -> seated` (or `cancelled`).
When a guest starts a booking we place a temporary **hold** on the table so two guests
cannot grab the same slot at once. The hold is meant to be released automatically if the
guest never confirms.

Reservations use the **legacy hold-expiry mechanism** (see the 2025 reservations
migration, `db/migrations/2025-reservation-holds.md`). We have not yet moved holds onto
the newer scheduled-sweep job, so the behavior of an unconfirmed hold is governed entirely
by that legacy path. If you are touching reservation timing, read that migration note
first — the expiry semantics are not what most people assume.

## Other subsystems

- **Notifications** — sends confirmation emails; out of scope for this scenario.
- **Billing** — charges on `confirmed`; out of scope for this scenario.
