---
module: orders
date: 2026-05-04
problem_type: convention
component: authentication
severity: high
applies_when:
  - "An endpoint or function returns a record addressed by a client-supplied id"
  - "Records are owned by a user and must not be visible across tenants"
related_components:
  - users
tags:
  - authorization
  - idor
  - ownership-check
  - security
  - access-control
---

# Every id-addressed read must enforce resource ownership

## Convention

Any function that fetches a record by a client-supplied id (`getOrder`,
`getInvoice`, `getMessage`, ...) must check that the requesting actor is allowed
to see that record **before** returning it. "Looks it up by id" is not the same
as "is allowed to read it." Skipping this check is the Insecure Direct Object
Reference (IDOR) vulnerability class.

## Shape

```js
function getOrder(store, actor, orderId) {
  const order = store.orders.get(orderId);
  if (!order) return null;
  if (order.userId !== actor.id && !isAdmin(actor)) {
    return null; // forbidden is indistinguishable from missing
  }
  return order;
}
```

Two properties matter:

1. **The ownership predicate is present on the read path**, not only on the
   write/cancel path. A common regression is to guard `cancelOrder` but forget
   `getOrder`.
2. **Forbidden and missing return the same value** (`null`). Returning a
   distinct "403 vs 404" leaks the existence of records the actor may not see,
   an enumeration side channel.

## Applies when

- Any per-user / per-tenant record reachable by guessable or sequential ids.
- List endpoints too: filter the collection to the actor's own records (admins
  excepted) rather than returning everything.

## Why this is reviewer-only-catchable

A unit test that only ever reads a record back as its **owner** will pass whether
or not the ownership check exists. Catching a dropped ownership check requires
either a cross-actor test (read as a different user, expect `null`) or a reviewer
who knows the convention. Prefer writing the cross-actor test; treat a missing
one as a review gap.
