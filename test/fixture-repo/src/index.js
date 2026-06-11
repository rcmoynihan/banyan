'use strict';

// Public entry point for the fixture "shop" app. Re-exports the module surface
// so tests and downstream code import from one place.

const db = require('./db');
const utils = require('./utils');
const users = require('./users');
const inventory = require('./inventory');
const cart = require('./cart');
const orders = require('./orders');

module.exports = { db, utils, users, inventory, cart, orders };
