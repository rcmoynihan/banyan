# ADR 0001: Use SQLite for checkout state

Status: Accepted
Date: 2025-01-06

## Context

Checkout needs durable state for carts, payment attempts, and order receipts. The
initial service is a single Node process with low write volume and no read
replicas.

## Decision

Use SQLite for checkout state. Keep the database file on the application volume,
wrap checkout writes in transactions, and keep schema changes in checked-in SQL
migration files.

## Consequences

Local development is simple, tests run without a database service, and the app
can ship before operational traffic requires a networked database.
