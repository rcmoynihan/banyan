'use strict';

function checkoutTotalCents(lines) {
  return lines.reduce((total, line) => total + line.priceCents * line.quantity, 0);
}

module.exports = { checkoutTotalCents };
