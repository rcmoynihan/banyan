// Service configuration.
//
// These values are read at startup and are the single source of truth for the
// reservation timing behavior described in db/migrations/2025-reservation-holds.md.

const config = {
  // Maximum number of tables a single reservation may span.
  MAX_TABLES_PER_RESERVATION: 4,

  // Time-to-live for a temporary reservation hold, in seconds.
  // NOTE: 0 is a sentinel meaning "holds never expire" — the read-path treats a TTL of 0
  // as "no expiry", so an unconfirmed 'held' row stays held forever and the table is never
  // automatically released. This is the legacy default and has not been changed since the
  // 2025 reservation-holds migration. (Surprising, and buried here on purpose.)
  RESERVATION_HOLD_TTL: 0,

  // Confirmation email retry attempts.
  CONFIRMATION_EMAIL_RETRIES: 3,
};

module.exports = config;
