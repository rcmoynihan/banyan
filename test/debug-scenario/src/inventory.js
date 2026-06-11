'use strict';

// Per-SKU available stock. All quantities are non-negative integers.
const stock = new Map();

function setStock(sku, qty) {
  stock.set(sku, qty);
}

function available(sku) {
  return stock.get(sku) ?? 0;
}

function reserve(sku, qty) {
  const have = available(sku);
  if (qty > have) {
    const err = new Error(`insufficient stock for ${sku}: want ${qty}, have ${have}`);
    err.code = 'INSUFFICIENT_STOCK';
    throw err;
  }
  stock.set(sku, have - qty);
}

function release(sku, qty) {
  stock.set(sku, available(sku) + qty);
}

function reset() {
  stock.clear();
}

module.exports = { setStock, available, reserve, release, reset };
