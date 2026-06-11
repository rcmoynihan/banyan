# Debug-subtree verification scenario

This is a **standalone test scenario** for the Banyan debug subtree (`bn-debug-lead` +
`bn-hypothesis-investigator`). It is deliberately **separate** from `test/fixture-repo/`
(the review A/B eval's standing target) — nothing here touches that fixture. It is a
tiny, zero-dependency Node app with ONE planted bug whose **surface symptom misleads**:
the failing assertion blames the inventory module, but the defect lives in the orders
module's rollback path.

> **Live-run hygiene:** this README is the answer key. When running `/bn-debug` against
> the scenario, copy `src/`, `test/`, and `package.json` into a scratch git repo
> **without this README**, so the subtree must earn the diagnosis from experiments
> rather than reading it here. (The same applies to grep-able markers — the source
> deliberately carries none.)

## The planted bug

`src/orders.js` `createOrder` reserves stock line by line. When a line fails, the
rollback is wrong in two ways at once:

```
inventory.release(line.sku, line.qty);   // releases the line that FAILED (never reserved)
                                         // ...and never releases the lines in `reserved`
```

So a failed multi-line order (1) **leaks** every reservation taken before the failure —
that stock stays held forever — and (2) **conjures** stock for the failed SKU, which was
never reserved. The correct rollback releases each line in `reserved` and nothing else.

## The misleading surface

`node --test` fails on exactly one test — `failed order leaves stock exactly as it was`
in `test/orders.test.js` — and its assertion message points the wrong way on purpose:

> *"apple stock drifted after a failed order -- inventory release looks broken:
> reservations are not being restored"*

A debugger that follows the message lands in `src/inventory.js`, where `reserve`,
`release`, and the bookkeeping are all correct. Only by testing that hypothesis (and
refuting it with evidence) does the trail lead to the rollback in `src/orders.js`.

## What a correct run must produce

1. **Reproduce first**: the run starts by running `node --test` and capturing the one
   red test (the other two tests are green — a diagnosis that breaks them fails too).
2. **The misleading hypothesis is tested and refuted**: a ranked hypothesis list that
   includes "inventory release/bookkeeping is wrong" (the surface reading), with an
   investigator verdict of **refuted** backed by evidence (e.g. the round-trip test is
   green; direct probes of `reserve`/`release` behave).
3. **The true hypothesis is confirmed**: "createOrder's rollback releases the wrong
   line(s)" — **confirmed**, citing `src/orders.js` at the `release` call in the catch
   block.
4. **The diagnosis** (`docs/runs/<run-id>/debug-diagnosis.md`) carries the two-link
   chain with evidence per link — failed order → wrong rollback (failed line released,
   reserved lines kept) → leaked reservation + conjured stock → the assertion deltas
   (apple 5→2 held, pear 1→1 only by accident of the arithmetic) — and
   `chain: confirmed`.
5. **Fix mode** (if exercised): the regression test is written FIRST and observed to
   fail for the diagnosed reason; the minimal fix releases the `reserved` lines (and not
   the failed one); `node --test` goes fully green; on a clean tree, one
   `fix(debug): ...` commit, never pushed; a bug-track solution candidate lands in
   `lessons-staging/` and passes `python3 scripts/validate-frontmatter.py`.
6. **Budget respected**: at most `max_children` investigators; no investigator spawns
   anything; at `depth_remaining: 0` nothing spawns at all.

**Failure criteria:** a diagnosis blaming `src/inventory.js`, a chain link asserted
without a tested prediction, or a "confirmed" verdict produced without running the
failing test.

## Files

- `src/inventory.js` — per-SKU stock with `reserve`/`release` (correct).
- `src/orders.js` — `createOrder` with the planted rollback defect.
- `test/orders.test.js` — two green tests + the one red, misleadingly-messaged test.
- `package.json` — zero-dep; `node --test`.
