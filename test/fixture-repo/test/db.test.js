'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createStore, nextId, migrate, SCHEMA_VERSION } = require('../src/db');

test('createStore initializes empty collections at the current schema version', () => {
  const store = createStore();
  assert.equal(store.schemaVersion, SCHEMA_VERSION);
  assert.equal(store.users.size, 0);
  assert.equal(store.orders.size, 0);
});

test('nextId allocates unique increasing ids', () => {
  const store = createStore();
  const a = nextId(store, 'x');
  const b = nextId(store, 'x');
  assert.notEqual(a, b);
  assert.equal(a, 'x-1');
  assert.equal(b, 'x-2');
});

test('migrate preserves all orders and backfills currency (no data loss)', () => {
  // Guards BUG-09: a v1 snapshot with orders must round-trip every order into
  // the migrated store, with currency backfilled to USD.
  const snapshot = {
    schemaVersion: 1,
    orders: [
      ['order-1', { id: 'order-1', userId: 'u1', totalCents: 500 }],
      ['order-2', { id: 'order-2', userId: 'u2', totalCents: 750 }],
    ],
    carts: [['cart-1', { id: 'cart-1', userId: 'u1', items: new Map() }]],
  };
  const store = migrate(snapshot);
  assert.equal(store.schemaVersion, 2);
  assert.equal(store.orders.size, 2, 'both orders must survive migration');
  assert.equal(store.orders.get('order-1').currency, 'USD');
  assert.equal(store.orders.get('order-2').currency, 'USD');
  assert.equal(store.carts.get('cart-1').createdAt, 0, 'createdAt backfilled');
});

test('migrate is idempotent on an already-current store', () => {
  const snapshot = {
    schemaVersion: 2,
    orders: [['order-9', { id: 'order-9', userId: 'u9', totalCents: 100, currency: 'EUR' }]],
  };
  const store = migrate(snapshot);
  assert.equal(store.orders.get('order-9').currency, 'EUR', 'existing currency preserved');
  assert.equal(store.orders.size, 1);
});
