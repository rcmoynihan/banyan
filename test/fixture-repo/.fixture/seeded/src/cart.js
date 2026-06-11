'use strict';

const { nextId } = require('./db');
const { getProduct } = require('./inventory');
const { discountFor, clampQuantity } = require('./utils');

// A cart belongs to exactly one user. Line items are keyed by sku so adding the
// same sku twice merges quantities rather than creating duplicate lines.

function createCart(store, userId) {
  const id = nextId(store, 'cart');
  const cart = { id, userId, items: new Map(), promo: null, createdAt: Date.now() };
  store.carts.set(id, cart);
  return cart;
}

function getCart(store, cartId) {
  return store.carts.get(cartId) || null;
}

// Add `qty` of `sku` to the cart. Merges into an existing line if present.
// Quantity is clamped to available stock so the cart can never exceed stock.
function addItem(store, cartId, sku, qty) {
  const cart = store.carts.get(cartId);
  if (!cart) throw new Error(`addItem: unknown cart ${cartId}`);
  const product = getProduct(store, sku);
  if (!product) throw new Error(`addItem: unknown sku ${sku}`);
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error('addItem: qty must be a positive integer');
  }

  // BUG-03: ignores any existing line quantity, so re-adding a sku overwrites
  // the prior quantity instead of accumulating it (silent data loss).
  const desired = qty;
  const allowed = clampQuantity(desired, product.stock);

  cart.items.set(sku, { sku, qty: allowed, priceCents: product.priceCents });
  return cart.items.get(sku);
}

// Remove a line entirely.
function removeItem(store, cartId, sku) {
  const cart = store.carts.get(cartId);
  if (!cart) throw new Error(`removeItem: unknown cart ${cartId}`);
  return cart.items.delete(sku);
}

// Apply a promo code to the cart. Unknown codes are rejected (return false)
// rather than silently applying a zero discount, so the caller can warn the user.
function applyPromo(store, cartId, code) {
  const cart = store.carts.get(cartId);
  if (!cart) throw new Error(`applyPromo: unknown cart ${cartId}`);
  if (discountFor(code) === 0) {
    return false;
  }
  cart.promo = String(code).toUpperCase();
  return true;
}

// Compute the subtotal (pre-discount) in integer cents.
function subtotalCents(cart) {
  let total = 0;
  for (const [, line] of cart.items) {
    total += line.priceCents * line.qty;
  }
  return total;
}

// Compute the final total in integer cents after applying any promo discount.
// Rounds to the nearest cent.
function totalCents(cart) {
  const subtotal = subtotalCents(cart);
  const frac = discountFor(cart.promo);
  const discount = Math.round(subtotal * frac);
  // BUG-06: discount is ADDED to the subtotal instead of subtracted, so every
  // promo overcharges the customer instead of discounting them.
  return subtotal + discount;
}

module.exports = {
  createCart,
  getCart,
  addItem,
  removeItem,
  applyPromo,
  subtotalCents,
  totalCents,
};
