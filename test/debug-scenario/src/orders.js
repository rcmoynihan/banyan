'use strict';

const inventory = require('./inventory');

let nextId = 1;

function createOrder(lines) {
  const reserved = [];
  for (const line of lines) {
    try {
      inventory.reserve(line.sku, line.qty);
      reserved.push(line);
    } catch (err) {
      inventory.release(line.sku, line.qty);
      throw err;
    }
  }
  return { id: nextId++, lines: [...lines], status: 'created' };
}

module.exports = { createOrder };
