'use strict';

const { nextId } = require('./db');

// User + session management. Passwords are never stored in clear; we keep a
// salted hash. The hash here is a toy (not cryptographically strong) but the
// CONTRACT it models — constant-time compare, never echo the secret — is real,
// and the seeded overlay violates that contract.

const crypto = require('node:crypto');

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${useSalt}:${password}`)
    .digest('hex');
  return { salt: useSalt, hash };
}

// Constant-time-ish comparison so a timing side channel can't leak the hash.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function createUser(store, { email, password, role = 'customer' }) {
  if (!email || !password) {
    throw new Error('createUser: email and password are required');
  }
  const id = nextId(store, 'user');
  const { salt, hash } = hashPassword(password);
  const user = { id, email, role, salt, passwordHash: hash };
  store.users.set(id, user);
  return user;
}

function authenticate(store, email, password) {
  for (const [, user] of store.users) {
    if (user.email === email) {
      const { hash } = hashPassword(password, user.salt);
      if (safeEqual(hash, user.passwordHash)) {
        return { id: user.id, email: user.email, role: user.role };
      }
      return null;
    }
  }
  return null;
}

// Return a public-safe view of a user: never include salt or passwordHash.
function publicView(user) {
  return { id: user.id, email: user.email, role: user.role };
}

function isAdmin(user) {
  return !!user && user.role === 'admin';
}

module.exports = { hashPassword, safeEqual, createUser, authenticate, publicView, isAdmin };
