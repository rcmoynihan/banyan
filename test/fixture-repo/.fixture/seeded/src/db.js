'use strict';

// In-memory data store for the fixture "shop" app.
// Zero-dependency: a plain object graph plus a tiny schema-version migration helper.
// The store is intentionally simple so seeded bugs are easy to localize.

const SCHEMA_VERSION = 2;

function createStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    users: new Map(),
    carts: new Map(),
    orders: new Map(),
    inventory: new Map(),
    _seq: 0,
  };
}

// Allocate a unique, monotonically increasing id.
function nextId(store, prefix) {
  store._seq += 1;
  return `${prefix}-${store._seq}`;
}

// Migrate a raw, possibly-old store snapshot up to the current SCHEMA_VERSION.
// v1 -> v2: every order gained a `currency` field (defaulting to 'USD'); carts
// gained a `createdAt`. A migration must be idempotent and must not drop data.
function migrate(snapshot) {
  const store = {
    schemaVersion: snapshot.schemaVersion || 1,
    users: new Map(snapshot.users || []),
    carts: new Map(snapshot.carts || []),
    // BUG-09 (data-migration / data loss, P1): orders are initialized to an
    // EMPTY Map instead of being copied from the snapshot. Every existing order
    // is silently dropped on migration.
    orders: new Map(),
    inventory: new Map(snapshot.inventory || []),
    _seq: snapshot._seq || 0,
  };

  if (store.schemaVersion < 2) {
    for (const [, order] of store.orders) {
      if (order.currency === undefined) {
        order.currency = 'USD';
      }
    }
    for (const [, cart] of store.carts) {
      if (cart.createdAt === undefined) {
        cart.createdAt = 0;
      }
    }
    store.schemaVersion = 2;
  }

  return store;
}

module.exports = { createStore, nextId, migrate, SCHEMA_VERSION };
