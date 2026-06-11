'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../src/db');
const { seedProduct } = require('../src/inventory');
const cart = require('../src/cart');

function freshStore() {
  const store = createStore();
  seedProduct(store, 'WIDGET', { priceCents: 1000, stock: 50 });
  seedProduct(store, 'GADGET', { priceCents: 250, stock: 50 });
  return store;
}

test('addItem merges quantity for the same sku (no data loss)', () => {
  // Guards BUG-03: re-adding a sku must accumulate, not overwrite.
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  cart.addItem(store, c.id, 'WIDGET', 2);
  cart.addItem(store, c.id, 'WIDGET', 3);
  assert.equal(c.items.get('WIDGET').qty, 5, 're-adding WIDGET should total 5');
});

test('addItem records the current product price on the line', () => {
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  cart.addItem(store, c.id, 'GADGET', 1);
  assert.equal(c.items.get('GADGET').priceCents, 250);
});

test('subtotalCents sums all line items', () => {
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  cart.addItem(store, c.id, 'WIDGET', 2); // 2000
  cart.addItem(store, c.id, 'GADGET', 4); // 1000
  assert.equal(cart.subtotalCents(c), 3000);
});

test('totalCents subtracts the promo discount (never adds it)', () => {
  // Guards BUG-06: a 10% promo on $30.00 must yield $27.00, not $33.00.
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  cart.addItem(store, c.id, 'WIDGET', 3); // 3000 cents
  assert.equal(cart.applyPromo(store, c.id, 'SAVE10'), true);
  assert.equal(cart.totalCents(c), 2700, '10% off 3000 cents is 2700');
});

test('totalCents with no promo equals subtotal', () => {
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  cart.addItem(store, c.id, 'WIDGET', 1);
  assert.equal(cart.totalCents(c), cart.subtotalCents(c));
});

test('applyPromo rejects unknown codes', () => {
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  assert.equal(cart.applyPromo(store, c.id, 'NOPE'), false);
  assert.equal(c.promo, null);
});

test('removeItem deletes the line', () => {
  const store = freshStore();
  const c = cart.createCart(store, 'user-1');
  cart.addItem(store, c.id, 'WIDGET', 1);
  assert.equal(cart.removeItem(store, c.id, 'WIDGET'), true);
  assert.equal(c.items.has('WIDGET'), false);
});
