'use strict';

const { clampQuantity } = require('./utils');

// Inventory tracks available stock per SKU. Reservations decrement stock;
// releasing a reservation gives it back. Stock must never go negative, and a
// reservation must fail (not silently clamp) when there isn't enough stock.

function seedProduct(store, sku, { priceCents, stock }) {
  store.inventory.set(sku, { sku, priceCents, stock });
  return store.inventory.get(sku);
}

function getProduct(store, sku) {
  return store.inventory.get(sku) || null;
}

// Returns true if at least `qty` units of `sku` are in stock.
function hasStock(store, sku, qty) {
  const product = store.inventory.get(sku);
  if (!product) return false;
  return product.stock >= qty;
}

// Reserve `qty` units. Throws if the product is unknown or stock is insufficient.
// On success, decrements stock and returns the new stock level.
function reserve(store, sku, qty) {
  const product = store.inventory.get(sku);
  if (!product) {
    throw new Error(`reserve: unknown sku ${sku}`);
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('reserve: qty must be a positive integer');
  }
  if (product.stock < qty) {
    throw new Error(`reserve: insufficient stock for ${sku} (have ${product.stock}, need ${qty})`);
  }
  product.stock -= qty;
  return product.stock;
}

// Release a previously reserved quantity back to stock.
function release(store, sku, qty) {
  const product = store.inventory.get(sku);
  if (!product) {
    throw new Error(`release: unknown sku ${sku}`);
  }
  product.stock += clampQuantity(qty, Number.MAX_SAFE_INTEGER);
  return product.stock;
}

module.exports = { seedProduct, getProduct, hasStock, reserve, release };
