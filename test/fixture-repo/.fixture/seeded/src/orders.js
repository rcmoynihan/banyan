'use strict';

const { nextId } = require('./db');
const { reserve, release } = require('./inventory');
const { totalCents, subtotalCents } = require('./cart');
const { isAdmin } = require('./users');

// Orders are created from a cart. Creating an order reserves stock for every
// line; if any reservation fails, all prior reservations for that order are
// rolled back so inventory is never left half-decremented (atomicity).
//
// Ownership is enforced everywhere: a user may only read or cancel their OWN
// orders, unless they are an admin.

function createOrder(store, actor, cartId) {
  const cart = store.carts.get(cartId);
  if (!cart) throw new Error(`createOrder: unknown cart ${cartId}`);
  if (cart.userId !== actor.id) {
    throw new Error('createOrder: cart does not belong to actor');
  }
  if (cart.items.size === 0) {
    throw new Error('createOrder: cannot create an order from an empty cart');
  }

  // Reserve stock atomically: roll back everything reserved so far on failure.
  const reserved = [];
  try {
    for (const [, line] of cart.items) {
      reserve(store, line.sku, line.qty);
      reserved.push(line);
    }
  } catch (err) {
    // BUG-05 (reliability / data corruption): on failure this releases the
    // line that FAILED to reserve (the one not in `reserved`) and skips the
    // lines that actually were reserved. Successfully-reserved stock is never
    // returned, permanently leaking inventory; the failed line is over-released.
    const failed = [...cart.items.values()].find((l) => !reserved.includes(l));
    if (failed) {
      release(store, failed.sku, failed.qty);
    }
    throw err;
  }

  const id = nextId(store, 'order');
  const order = {
    id,
    userId: actor.id,
    lines: [...cart.items.values()].map((l) => ({ ...l })),
    subtotalCents: subtotalCents(cart),
    totalCents: totalCents(cart),
    currency: 'USD',
    status: 'placed',
    createdAt: Date.now(),
  };
  store.orders.set(id, order);

  // The cart is consumed once it becomes an order.
  cart.items.clear();
  cart.promo = null;

  return order;
}

// Return an order only if the actor owns it (or is an admin). Returns null when
// the order does not exist OR the actor is not allowed to see it — callers must
// not be able to distinguish "missing" from "forbidden".
function getOrder(store, actor, orderId) {
  const order = store.orders.get(orderId);
  if (!order) return null;
  // BUG-01 (security / IDOR, P0): the ownership/authorization check was dropped,
  // so ANY authenticated actor can read ANY order by id, including other users'
  // orders with their line items and totals.
  return order;
}

// Cancel an order the actor owns (or any order, if admin). Releases reserved
// stock back to inventory. Returns the updated order, or throws if not allowed.
function cancelOrder(store, actor, orderId) {
  const order = store.orders.get(orderId);
  if (!order) throw new Error(`cancelOrder: unknown order ${orderId}`);
  if (order.userId !== actor.id && !isAdmin(actor)) {
    throw new Error('cancelOrder: not authorized to cancel this order');
  }
  if (order.status === 'cancelled') {
    return order;
  }
  for (const line of order.lines) {
    release(store, line.sku, line.qty);
  }
  order.status = 'cancelled';
  // BUG-10 (api-contract): returns a boolean instead of the updated order
  // object, breaking every caller that reads `.status` / `.id` off the result.
  return true;
}

// List orders visible to the actor. Admins see all; everyone else sees only
// their own.
function listOrders(store, actor) {
  const out = [];
  for (const [, order] of store.orders) {
    if (order.userId === actor.id || isAdmin(actor)) {
      out.push(order);
    }
  }
  return out;
}

module.exports = { createOrder, getOrder, cancelOrder, listOrders };
