'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const { checkoutTotalCents } = require('../src');

test('checkoutTotalCents totals line items', () => {
  const total = checkoutTotalCents([
    { priceCents: 1200, quantity: 2 },
    { priceCents: 350, quantity: 3 },
  ]);

  assert.equal(total, 3450);
});

test('checkoutTotalCents returns zero for an empty cart', () => {
  assert.equal(checkoutTotalCents([]), 0);
});
