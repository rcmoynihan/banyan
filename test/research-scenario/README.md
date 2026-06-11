# U10 research-subtree verification scenario

This is a **standalone test scenario** for the Banyan research subtree (`bn-research-lead`
+ `bn-thread-chaser`). It is deliberately **separate** from `test/fixture-repo/` (which is
in concurrent use by a live A/B eval) — nothing here touches that fixture. It is a tiny,
self-contained tree whose only purpose is to plant a **two-hop research trail** that a live
`bn-research-lead` run must follow to its leaf fact.

## The planted two-hop trail

The trail is intentionally structured so the surface documentation does **not** state the
answer — the answer is buried two hops away, at a surprising config value. A researcher
that reads only the architecture doc will get the wrong impression (that holds expire); only
by chasing the trail to its leaf does the truth surface. That is exactly the behavior
`bn-thread-chaser` exists to provide.

```
docs/ARCHITECTURE.md                         (hop 0: the question's surface)
  │  "reservations use the legacy hold-expiry mechanism (see the 2025 reservations migration)"
  ▼
db/migrations/2025-reservation-holds.md      (hop 1: the migration note)
  │  "hold expiry is governed by the RESERVATION_HOLD_TTL config (src/config.js)"
  ▼
src/config.js                                (hop 2: the leaf fact)
     RESERVATION_HOLD_TTL = 0   // 0 means "holds never expire"
```

## The expected leaf fact (what the research brief MUST surface)

A correct `research-brief.md` for a question like *"how does reservation hold expiry work
in this service?"* must surface the **leaf fact**, not the surface impression:

> **`RESERVATION_HOLD_TTL` is set to `0` in `src/config.js`, and `0` is a sentinel meaning
> "holds never expire." So an unconfirmed reservation hold is never automatically released —
> the table stays held forever.** This contradicts the surface reading of `ARCHITECTURE.md`,
> which implies holds are released automatically; the legacy default never enables expiry.

A brief that stops at hop 0 or hop 1 (e.g. "holds expire per the TTL config") has **failed**
the scenario — it must reach `src/config.js` and report the `0`/never-expire leaf fact, with
the `file:line` source.

## What the run also verifies (depth budget)

- The trail is two hops, so it is resolvable within a normal depth budget: the lead can chase
  it with **one** `bn-thread-chaser` (depth_remaining ≥ 1). The chaser should reach the leaf
  fact **without** needing to recurse — there is no third hop. A chaser handed
  `depth_remaining: 0` must still resolve it inline (the trail is short enough), and must
  **not** spawn a sub-chaser. Either way, the run must respect the budget it was handed: no
  spawn at depth 0, at most one chaser for this single thread.

## How the trunk uses this (the live test runs later)

The trunk (not this build step) will run a live `bn-research-lead` against this directory
and check that the resulting `briefs/research-brief.md`:
1. surfaces the leaf fact (`RESERVATION_HOLD_TTL = 0` → holds never expire), and
2. cites `src/config.js` as the source, and
3. respects the depth budget (one chaser at most; no spawn at depth 0).

## Files

- `docs/ARCHITECTURE.md` — hop 0; references the 2025 reservations migration.
- `db/migrations/2025-reservation-holds.md` — hop 1; references the `RESERVATION_HOLD_TTL` config.
- `src/config.js` — hop 2; defines `RESERVATION_HOLD_TTL = 0` with the "never expire" leaf fact.
