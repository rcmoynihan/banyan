'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { toCents, formatCents, clampQuantity, escapeHtml, discountFor } = require('../src/utils');

test('toCents rounds dollars to integer cents', () => {
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0), 0);
  assert.equal(toCents(1.005), 100); // banker-ish rounding via Math.round
});

test('toCents rejects negative and non-numeric input', () => {
  assert.throws(() => toCents(-1), TypeError);
  assert.throws(() => toCents('5'), TypeError);
});

test('formatCents renders whole-and-fractional dollars', () => {
  // Only asserts amounts whose cents component is >= 10, so the seeded
  // zero-padding bug (BUG-12) is NOT exercised by the suite.
  assert.equal(formatCents(1999), '$19.99');
  assert.equal(formatCents(2550), '$25.50');
});

test('clampQuantity bounds into [0, max]', () => {
  assert.equal(clampQuantity(5, 10), 5);
  assert.equal(clampQuantity(-3, 10), 0);
  assert.equal(clampQuantity(50, 10), 10);
});

test('discountFor maps known promo codes case-insensitively', () => {
  assert.equal(discountFor('SAVE10'), 0.1);
  assert.equal(discountFor('save25'), 0.25);
  assert.equal(discountFor('UNKNOWN'), 0);
  assert.equal(discountFor(null), 0);
});

test('escapeHtml escapes ampersands and quotes', () => {
  // Deliberately does NOT assert on < or > so the seeded XSS bug (BUG-02),
  // which only breaks angle-bracket escaping, is not caught by the suite.
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
  assert.equal(escapeHtml('say "hi"'), 'say &quot;hi&quot;');
});
