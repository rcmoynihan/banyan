'use strict';

const test = require('node:test');
const assert = require('node:assert');

const inventory = require('../src/inventory');
const orders = require('../src/orders');

test.beforeEach(() => {
  inventory.reset();
});

test('reserve and release round-trip', () => {
  inventory.setStock('apple', 5);
  inventory.reserve('apple', 3);
  assert.equal(inventory.available('apple'), 2);
  inventory.release('apple', 3);
  assert.equal(inventory.available('apple'), 5);
});

test('successful order decrements stock for every line', () => {
  inventory.setStock('apple', 5);
  inventory.setStock('pear', 4);
  const order = orders.createOrder([
    { sku: 'apple', qty: 2 },
    { sku: 'pear', qty: 1 },
  ]);
  assert.equal(order.status, 'created');
  assert.equal(inventory.available('apple'), 3);
  assert.equal(inventory.available('pear'), 3);
});

test('failed order leaves stock exactly as it was', () => {
  inventory.setStock('apple', 5);
  inventory.setStock('pear', 1);
  assert.throws(
    () => orders.createOrder([
      { sku: 'apple', qty: 3 },
      { sku: 'pear', qty: 2 },
    ]),
    /insufficient stock/
  );
  assert.equal(
    inventory.available('apple'), 5,
    'apple stock drifted after a failed order -- inventory release looks broken: reservations are not being restored'
  );
  assert.equal(
    inventory.available('pear'), 1,
    'pear stock drifted after a failed order -- inventory release looks broken: stock appeared out of nowhere'
  );
});
