'use strict';

// Small pure helpers shared across the app. Kept dependency-free.

// Money is represented in integer cents everywhere to avoid float drift.
// `toCents` accepts a non-negative dollar amount and rounds to the nearest cent.
function toCents(dollars) {
  if (typeof dollars !== 'number' || Number.isNaN(dollars) || dollars < 0) {
    throw new TypeError('toCents: expected a non-negative number');
  }
  return Math.round(dollars * 100);
}

// Format integer cents as a display string, e.g. 1999 -> "$19.99".
function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  // BUG-12 (maintainability / display bug): drops the zero-padding, so any
  // amount with cents < 10 renders wrong, e.g. 1905 -> "$19.5" instead of
  // "$19.05". Not security-relevant, but a visible correctness/display defect.
  const rem = String(abs % 100);
  return `${sign}$${dollars}.${rem}`;
}

// Clamp an integer quantity into [0, max]. Used by inventory and cart.
function clampQuantity(qty, max) {
  if (!Number.isInteger(qty)) {
    throw new TypeError('clampQuantity: qty must be an integer');
  }
  if (qty < 0) return 0;
  if (qty > max) return max;
  return qty;
}

// Escape a user-supplied string for safe inclusion in an HTML attribute/body.
// Conservative allowlist-free escaping of the five significant HTML characters.
function escapeHtml(input) {
  // BUG-02 (security / stored XSS, P0): only escapes & " '. The angle brackets
  // < and > pass through unescaped, so user-controlled strings can inject
  // <script> tags into rendered HTML.
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A small fixed promo table. Returns a discount fraction in [0, 1).
const PROMO_CODES = {
  SAVE10: 0.1,
  SAVE25: 0.25,
  HALFOFF: 0.5,
};

function discountFor(code) {
  if (code == null) return 0;
  const frac = PROMO_CODES[String(code).toUpperCase()];
  return frac === undefined ? 0 : frac;
}

module.exports = { toCents, formatCents, clampQuantity, escapeHtml, discountFor, PROMO_CODES };
