// U9 — deterministic P10 CI shadow (R14). Append a new agent-*.jsonl + a growth chunk to a temp
// dir and assert a new-node event then an active→finished event fire. This is SUPPLEMENTARY — the
// genuinely-live leg (U10) is the mandatory one; GATE.md records that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createWatcher } from '../src/adapters/transcript-watcher.mjs';
import { createLivenessFsm } from '../src/model/liveness-fsm.mjs';
import { manualClock } from '../src/core/clock.mjs';

test('controlled append: new-node growth then active→finished via the FSM', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-ctl-'));
  const file = path.join(tmp, 'agent-newnode.jsonl');
  const clock = manualClock(0);
  const fsm = createLivenessFsm({ quiescenceMs: 2500 });
  const transitions = [];

  const w = createWatcher({
    paths: [tmp],
    onGrowth: (ev) => {
      // feed growth into the FSM (injected clock time)
      const last = ev.records[ev.records.length - 1];
      transitions.push(...fsm.apply({
        type: 'growth', id: ev.id, now: clock.now(),
        lastLineComplete: ev.lastLineComplete,
        lastGoodTs: last?.timestamp,
      }));
    },
  });

  // 1. a new node appears (first write + tail)
  fs.writeFileSync(file, '{"type":"user","timestamp":"2026-06-14T17:00:00.000Z","message":{"content":"hi"}}\n');
  w._tail(file);
  assert.equal(fsm.statusOf('agent-newnode'), 'active', 'new node is active on first growth');

  // 2. a growth chunk
  clock.advance(500);
  fs.appendFileSync(file, '{"type":"assistant","timestamp":"2026-06-14T17:00:00.500Z","message":{"model":"m","usage":{"input_tokens":5,"output_tokens":2},"content":[{"type":"text","text":"working"}]}}\n');
  w._tail(file);

  // 3. quiescence past the window → active→finished
  clock.advance(3000);
  const flips = fsm.apply({ type: 'quiescence-tick', id: 'agent-newnode', now: clock.now() });
  assert.equal(flips.length, 1);
  assert.equal(flips[0].to, 'finished');
  assert.equal(fsm.statusOf('agent-newnode'), 'finished');

  fs.rmSync(tmp, { recursive: true, force: true });
});
