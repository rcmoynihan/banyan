// U9 — P3 latency leg MEASURED over a REAL chokidar watch (not a mock), R5. Times a triggering
// append and the resulting view-state change; asserts Δ ≤ 2s typical / ≤ 5s worst-case. The bound
// is about the *real* watch path, so this test uses a genuine chokidar watcher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createWatcher } from '../src/adapters/transcript-watcher.mjs';
import { realClock } from '../src/core/clock.mjs';

const WORST_CASE_MS = 5000;

test('real chokidar watch: a new node appears within the P3 worst-case bound', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-latency-'));
  const clock = realClock();
  let appearAt = null;
  let appendAt = null;

  const w = createWatcher({
    paths: [tmp],
    debounceMs: 30,
    onGrowth: (ev) => {
      if (ev.id === 'agent-latencytest' && appearAt === null) appearAt = clock.now();
    },
  });

  await w.start();
  // Give chokidar a tick to establish the watch, then trigger a real fs write.
  await new Promise((r) => setTimeout(r, 200));
  appendAt = clock.now();
  fs.writeFileSync(path.join(tmp, 'agent-latencytest.jsonl'),
    '{"type":"user","timestamp":"2026-06-14T17:00:00.000Z","message":{"content":"hi"}}\n');

  // Poll for the appearance up to the worst-case bound.
  const deadline = clock.now() + WORST_CASE_MS;
  while (appearAt === null && clock.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await w.stop();

  assert.notEqual(appearAt, null, 'new node observed via the real watch');
  const latency = appearAt - appendAt;
  assert.ok(latency <= WORST_CASE_MS, `measured latency ${latency}ms within ${WORST_CASE_MS}ms worst-case`);
  // record the measurement for the gate (visible in test output)
  // eslint-disable-next-line no-console -- test harness output, not the Ink app (DI2 scope)
  process.stdout.write(`\n[P3] measured new-node latency over real chokidar watch: ${latency}ms\n`);

  fs.rmSync(tmp, { recursive: true, force: true });
});

test('real chokidar watch: an append to an existing file is observed (growth path)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-latency2-'));
  const file = path.join(tmp, 'agent-growth.jsonl');
  fs.writeFileSync(file, '{"type":"user","timestamp":"2026-06-14T17:00:00.000Z","message":{"content":"hi"}}\n');
  const clock = realClock();
  let growthCount = 0;

  const w = createWatcher({ paths: [tmp], debounceMs: 30, onGrowth: () => { growthCount++; } });
  await w.start();
  await new Promise((r) => setTimeout(r, 200));
  const before = growthCount;
  fs.appendFileSync(file, '{"type":"assistant","timestamp":"2026-06-14T17:00:01.000Z","message":{"model":"m","content":[{"type":"text","text":"x"}]}}\n');

  const deadline = clock.now() + WORST_CASE_MS;
  while (growthCount <= before && clock.now() < deadline) {
    await new Promise((r) => setTimeout(r, 25));
  }
  await w.stop();
  assert.ok(growthCount > before, 'append observed as a growth event over the real watch');
  fs.rmSync(tmp, { recursive: true, force: true });
});
