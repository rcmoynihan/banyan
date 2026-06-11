'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../src/db');
const inv = require('../src/inventory');
const cart = require('../src/cart');
const orders = require('../src/orders');

const ALICE = { id: 'user-alice', email: 'alice@example.com', role: 'customer' };

function storeWithCart(items) {
  const store = createStore();
  inv.seedProduct(store, 'WIDGET', { priceCents: 1000, stock: 5 });
  inv.seedProduct(store, 'GADGET', { priceCents: 250, stock: 5 });
  // Pin actor ids deterministically so the cart's userId matches the actor.
  const c = { id: 'cart-1', userId: ALICE.id, items: new Map(), promo: null, createdAt: 0 };
  store.carts.set(c.id, c);
  for (const [sku, qty] of items) {
    cart.addItem(store, c.id, sku, qty);
  }
  return { store, cartId: c.id };
}

test('createOrder reserves stock and consumes the cart', () => {
  const { store, cartId } = storeWithCart([['WIDGET', 2]]);
  const order = orders.createOrder(store, ALICE, cartId);
  assert.equal(order.status, 'placed');
  assert.equal(inv.getProduct(store, 'WIDGET').stock, 3, 'stock decremented by 2');
  assert.equal(store.carts.get(cartId).items.size, 0, 'cart consumed');
});

test('createOrder records subtotal, total, and currency', () => {
  const { store, cartId } = storeWithCart([['WIDGET', 1], ['GADGET', 2]]);
  const order = orders.createOrder(store, ALICE, cartId);
  assert.equal(order.subtotalCents, 1500);
  assert.equal(order.totalCents, 1500);
  assert.equal(order.currency, 'USD');
});

test('createOrder is atomic: a failing line rolls back earlier reservations', () => {
  // Guards BUG-05: WIDGET reserves fine, GADGET overshoots stock -> the whole
  // order must fail AND WIDGET's stock must be fully restored.
  const { store, cartId } = storeWithCart([['WIDGET', 2]]);
  // Add a GADGET line that exceeds stock by mutating the cart directly.
  store.carts.get(cartId).items.set('GADGET', { sku: 'GADGET', qty: 99, priceCents: 250 });
  assert.throws(() => orders.createOrder(store, ALICE, cartId), /insufficient stock/);
  assert.equal(inv.getProduct(store, 'WIDGET').stock, 5, 'WIDGET stock fully restored after rollback');
  assert.equal(inv.getProduct(store, 'GADGET').stock, 5, 'GADGET stock untouched');
});

test('createOrder rejects an empty cart', () => {
  const { store, cartId } = storeWithCart([]);
  assert.throws(() => orders.createOrder(store, ALICE, cartId), /empty cart/);
});

test('getOrder returns the order for its owner', () => {
  const { store, cartId } = storeWithCart([['WIDGET', 1]]);
  const order = orders.createOrder(store, ALICE, cartId);
  const fetched = orders.getOrder(store, ALICE, order.id);
  assert.equal(fetched.id, order.id);
});

test('cancelOrder returns the updated order object and restores stock', () => {
  // Guards BUG-10 (return type is the order, not a boolean) and the stock release.
  const { store, cartId } = storeWithCart([['WIDGET', 2]]);
  const order = orders.createOrder(store, ALICE, cartId);
  assert.equal(inv.getProduct(store, 'WIDGET').stock, 3);
  const result = orders.cancelOrder(store, ALICE, order.id);
  assert.equal(typeof result, 'object', 'cancelOrder must return the order object');
  assert.equal(result.status, 'cancelled');
  assert.equal(inv.getProduct(store, 'WIDGET').stock, 5, 'stock released on cancel');
});

test('listOrders returns the owner own orders', () => {
  const { store, cartId } = storeWithCart([['WIDGET', 1]]);
  orders.createOrder(store, ALICE, cartId);
  const list = orders.listOrders(store, ALICE);
  assert.equal(list.length, 1);
});
