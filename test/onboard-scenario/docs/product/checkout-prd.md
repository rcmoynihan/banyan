# Checkout recovery PRD

## Summary

Checkout should help customers recover from transient payment failures without
losing their cart or creating duplicate orders.

## User Stories

- As a customer, I can retry payment after a provider timeout without rebuilding
  my cart.
- As a customer, I see one clear failure message when payment cannot be completed.
- As support, I can tell whether a cart is retryable or already converted into an
  order.

## Acceptance Criteria

- A timed-out payment leaves the cart retryable for the same customer.
- Retrying a cart cannot create more than one successful order.
- The checkout page shows a retry action for retryable failures.
- Support tooling displays the cart status, latest payment attempt, and order id
  when one exists.

## Non-goals

- Changing product inventory allocation.
- Adding alternative payment providers.
- Rewriting the cart page.
