'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore } = require('../src/db');
const inv = require('../src/inventory');

function freshStore() {
  const store = createStore();
  inv.seedProduct(store, 'WIDGET', { priceCents: 1000, stock: 3 });
  return store;
}

test('reserve decrements stock', () => {
  const store = freshStore();
  const remaining = inv.reserve(store, 'WIDGET', 2);
  assert.equal(remaining, 1);
  assert.equal(inv.getProduct(store, 'WIDGET').stock, 1);
});

test('reserve refuses to oversell (off-by-one guard)', () => {
  // Guards BUG-04: reserving more than stock must throw, never go negative.
  const store = freshStore(); // stock = 3
  assert.throws(() => inv.reserve(store, 'WIDGET', 4), /insufficient stock/);
  assert.equal(inv.getProduct(store, 'WIDGET').stock, 3, 'stock must be untouched on failure');
});

test('reserve allows taking exactly the remaining stock', () => {
  const store = freshStore(); // stock = 3
  const remaining = inv.reserve(store, 'WIDGET', 3);
  assert.equal(remaining, 0);
});

test('release returns stock', () => {
  const store = freshStore();
  inv.reserve(store, 'WIDGET', 3);
  const after = inv.release(store, 'WIDGET', 2);
  assert.equal(after, 2);
});

test('hasStock reflects availability', () => {
  const store = freshStore(); // stock = 3
  assert.equal(inv.hasStock(store, 'WIDGET', 3), true);
  assert.equal(inv.hasStock(store, 'WIDGET', 4), false);
  assert.equal(inv.hasStock(store, 'UNKNOWN', 1), false);
});

test('reserve throws on unknown sku', () => {
  const store = freshStore();
  assert.throws(() => inv.reserve(store, 'NOPE', 1), /unknown sku/);
});
