# ADR 0002: Move checkout state to Postgres

Status: Accepted
Date: 2025-04-02
Supersedes: [ADR 0001: Use SQLite for checkout state](0001-use-sqlite.md)

## Context

Checkout workers now run in multiple regions and need shared row locks for cart
finalization. Backups, read replicas, and point-in-time recovery are operational
requirements for revenue data.

## Decision

Move checkout state to Postgres. Use transactional row locks for cart
finalization, store payment attempt idempotency keys with a unique constraint,
and run migrations through the release pipeline.

## Consequences

Checkout can scale across workers while preserving one successful order per cart.
Local development uses a lightweight Postgres container.
