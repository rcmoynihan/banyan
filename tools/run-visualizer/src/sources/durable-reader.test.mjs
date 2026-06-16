// U5 — durable-reader: both layouts (P12), ledger Units, ordinal-only log times.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  readActivityLog, readLedgerUnits, readLedgerLog, readProgressRoster,
  detectLayout, readReviewRounds, buildDurableRoster,
} from './durable-reader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (...p) => join(here, '..', '..', 'test', 'fixtures', ...p);
const NESTED = fixture('durable-only', 'nested');
const FLAT = fixture('durable-only', 'flat');

test('detectLayout distinguishes nested (review/round-N) from flat (P12)', () => {
  assert.equal(detectLayout(NESTED), 'nested');
  assert.equal(detectLayout(FLAT), 'flat');
});

test('readReviewRounds finds round dirs in the nested layout, none in flat', () => {
  assert.deepEqual(readReviewRounds(NESTED), ['round-1', 'round-2']);
  assert.deepEqual(readReviewRounds(FLAT), []);
});

test('activity.log parses to {ts, actor, message}', () => {
  const log = readActivityLog(NESTED);
  assert.ok(log.length >= 1);
  assert.match(log[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(typeof log[0].actor, 'string');
  assert.equal(typeof log[0].message, 'string');
});

test('ledger Units table parses (incl. a blocked unit)', () => {
  const units = readLedgerUnits(NESTED);
  assert.equal(units.length, 3);
  assert.deepEqual(units.map((u) => u.unit), ['U1', 'U2', 'U3']);
  assert.equal(units[2].status, 'blocked');
});

test('ledger ## Log times are ordinal-only (never used as real time)', () => {
  const log = readLedgerLog(NESTED);
  assert.ok(log.length >= 1);
  // No real timestamp is surfaced — only an ordinal index + the text.
  for (const e of log) {
    assert.equal(typeof e.ordinal, 'number');
    assert.equal(typeof e.text, 'string');
    assert.equal('ts' in e, false, 'ledger log must not expose a real timestamp');
  }
  assert.equal(log[0].ordinal, 0);
  assert.equal(log[1].ordinal, 1);
});

test('progress roster lists agent labels', () => {
  const roster = readProgressRoster(NESTED);
  assert.ok(roster.includes('bn-finding-owner-1'));
  assert.ok(roster.includes('bn-delivery-lead'));
});

test('buildDurableRoster: BOTH layouts produce a roster (P12)', () => {
  const nested = buildDurableRoster(NESTED);
  const flat = buildDurableRoster(FLAT);
  assert.equal(nested.degraded, true);
  assert.equal(flat.degraded, true);
  assert.ok(nested.roster.length > 0, 'nested roster non-empty');
  assert.ok(flat.roster.length > 0, 'flat roster non-empty');
  // nested collapses bn-finding-owner ×3
  const fo = nested.roster.find((r) => r.role === 'bn-finding-owner');
  assert.equal(fo.count, 3);
  // flat collapses bn-correctness-reviewer ×2
  const cr = flat.roster.find((r) => r.role === 'bn-correctness-reviewer');
  assert.equal(cr.count, 2);
});
