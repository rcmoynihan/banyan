// U2 — liveness FSM risk-spike: correct flips, no oscillation, ≤2s budget, approx end-time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createLivenessFsm, DEFAULT_QUIESCENCE_MS } from './liveness-fsm.mjs';
import { parseLines } from '../parse/jsonl-line.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (...p) => join(here, '..', '..', 'test', 'fixtures', ...p);

test('quiescent complete file flips to finished exactly once (no oscillation)', () => {
  const fsm = createLivenessFsm({ quiescenceMs: 2500 });
  fsm.apply({ type: 'growth', id: 'n1', now: 0, lastLineComplete: true, lastGoodTs: 'T0' });
  // repeated quiescence ticks past the window: exactly one finished transition, then silence.
  const flips = [];
  for (const now of [1000, 3000, 4000, 5000]) {
    flips.push(...fsm.apply({ type: 'quiescence-tick', id: 'n1', now }));
  }
  const finishes = flips.filter((f) => f.to === 'finished');
  assert.equal(finishes.length, 1, 'finished emitted exactly once (no oscillation)');
  assert.equal(fsm.statusOf('n1'), 'finished');
});

test('post-finish re-grow returns active (monotonic-but-correctable)', () => {
  const fsm = createLivenessFsm({ quiescenceMs: 2500 });
  fsm.apply({ type: 'growth', id: 'n1', now: 0, lastLineComplete: true, lastGoodTs: 'T0' });
  fsm.apply({ type: 'quiescence-tick', id: 'n1', now: 3000 });
  assert.equal(fsm.statusOf('n1'), 'finished');
  const re = fsm.apply({ type: 'growth', id: 'n1', now: 4000, lastLineComplete: true, lastGoodTs: 'T1' });
  assert.equal(re.length, 1);
  assert.equal(re[0].to, 'active');
  assert.equal(fsm.statusOf('n1'), 'active');
});

test('unparseable last line sets endTime = approx(lastGood.ts)', () => {
  const fsm = createLivenessFsm({ quiescenceMs: 2500 });
  fsm.apply({ type: 'growth', id: 'n1', now: 0, lastLineComplete: false, lastGoodTs: '2026-06-14T17:00:00.000Z' });
  const [flip] = fsm.apply({ type: 'quiescence-tick', id: 'n1', now: 3000 });
  assert.equal(flip.to, 'finished');
  assert.equal(flip.endTime, '2026-06-14T17:00:00.000Z');
  assert.equal(flip.endTimeApprox, true, 'approximate flag set on unparseable last line');
});

test('durable-done flips to finished even without quiescence', () => {
  const fsm = createLivenessFsm();
  fsm.apply({ type: 'growth', id: 'n1', now: 0, lastLineComplete: true, lastGoodTs: 'T0' });
  const [flip] = fsm.apply({ type: 'durable-done', id: 'n1', now: 100 });
  assert.equal(flip.to, 'finished');
  assert.equal(fsm.statusOf('n1'), 'finished');
});

test('active→finished flip is emitted within the ≤2s budget (P3 unit proxy)', () => {
  // With a 1500ms quiescence window, a flip must be observable ≤2000ms after last growth.
  const fsm = createLivenessFsm({ quiescenceMs: 1500 });
  const growthAt = 1000;
  fsm.apply({ type: 'growth', id: 'n1', now: growthAt, lastLineComplete: true, lastGoodTs: 'T0' });
  const [flip] = fsm.apply({ type: 'quiescence-tick', id: 'n1', now: growthAt + 1600 });
  assert.ok(flip, 'flip emitted');
  assert.ok(flip.at - growthAt <= 2000, `flip latency ${flip.at - growthAt}ms within 2s budget`);
});

test('replay-log fixture drives the expected active→finished→active→finished sequence', () => {
  const raw = readFileSync(fixture('liveness', 'replay-log.jsonl'), 'utf8');
  const { records } = parseLines(raw);
  const fsm = createLivenessFsm({ quiescenceMs: 2500 });
  const flips = [];
  for (const ev of records) flips.push(...fsm.apply(ev));
  // Sequence: finished (after the first quiescence past window), active (re-grow), finished (final tick).
  const tos = flips.map((f) => f.to);
  assert.deepEqual(tos, ['finished', 'active', 'finished']);
});

test('snapshot is JSON-serializable (pure-core contract)', () => {
  const fsm = createLivenessFsm();
  fsm.apply({ type: 'growth', id: 'n1', now: 0, lastLineComplete: true, lastGoodTs: 'T0' });
  const snap = fsm.snapshot();
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), snap);
});

test('DEFAULT_QUIESCENCE_MS is within the R17 2-3s band', () => {
  assert.ok(DEFAULT_QUIESCENCE_MS >= 2000 && DEFAULT_QUIESCENCE_MS <= 3000);
});
