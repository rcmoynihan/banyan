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

// R2-F2: stop() racing an unresolved start() must close the just-created chokidar watch and must
// NOT register 'add'/'change' handlers — otherwise a late-resolving start() leaks a live fs watch
// and can dispatch growth into a torn-down tree. We drive the race deterministically with a fake
// chokidar whose import resolution we hold open until after stop() has run.
test('R2-F2: stop() before start() resolves closes the watch and fires no post-teardown growth', async () => {
  let closed = false;
  const registered = []; // event names the watch handlers were registered for
  let growthDispatched = false;

  // A controllable chokidar import: start() awaits releaseImport() before it gets the chokidar obj.
  let releaseImport;
  const importGate = new Promise((resolve) => { releaseImport = resolve; });
  const fakeChokidar = {
    watch() {
      return {
        on(evt) { registered.push(evt); return this; },
        async close() { closed = true; },
      };
    },
  };

  const w = createWatcher({
    paths: ['/nonexistent'],
    onGrowth: () => { growthDispatched = true; },
    chokidarFactory: () => importGate.then(() => fakeChokidar),
  });

  // Kick off start() — it is now parked awaiting the import gate (watcher still null).
  const startResolved = w.start();
  // stop() races in BEFORE the import resolves.
  const stopResolved = w.stop();
  // Now let the chokidar "import" resolve; start() must observe stopped and tear down.
  releaseImport();
  await Promise.all([startResolved, stopResolved]);

  assert.equal(closed, true, 'the watch created by the racing start() was closed');
  assert.deepEqual(registered, [], 'no add/change handlers were registered after a pre-resolve stop()');
  assert.equal(growthDispatched, false, 'no growth dispatched after teardown');
});

// R2-F6 (option b): the fsImpl seam has a real consumer — a short-read test that hardens the F5
// readSync-byte-count guard. The injected fsImpl returns FEWER bytes than the requested length on
// the first tail (the trailing line is "not yet flushed"). The F5 guard (buf = buf.subarray(0, n))
// must keep the zero-padded unread tail out of advance() so that (a) cursor.offset advances by
// exactly n — NOT the full requested len — so the next reconcileSize does not trip replay-from-zero
// and RE-EMIT the already-delivered line; and (b) no NUL bytes are wedged into cursor.partial and
// later surface in a parsed line. We prove both by driving a SECOND tail after the partial line is
// completed: with the guard the second line emits exactly once and cleanly; without it line1 replays
// and/or a line is NUL-contaminated.
test('R2-F6: fsImpl short-read — guard advances by n, no replay and no NUL padding on the next tail', () => {
  const line1 = '{"type":"user","timestamp":"2026-06-14T17:00:00.000Z","message":{"content":"a"}}\n';
  const line2 = '{"type":"user","timestamp":"2026-06-14T17:00:01.000Z","message":{"content":"b"}}\n';

  // Mutable "disk": first tail sees line1 + an incomplete line2; second tail sees the completed line2.
  let onDisk = Buffer.from(line1 + '{"type":"use', 'utf8');
  let shortReadOnce = true; // only the FIRST read is short (stops at the line1 newline)

  const fakeFs = {
    statSync() { return { size: onDisk.length }; },
    openSync() { return 7; },
    closeSync() {},
    readSync(_fd, buf, offset, length, position) {
      const available = onDisk.subarray(position, position + length);
      let n = available.length;
      if (shortReadOnce) {
        const nlIdx = available.indexOf(0x0a); // deliver only through the first newline
        if (nlIdx >= 0) n = nlIdx + 1;
        shortReadOnce = false;
      }
      available.subarray(0, n).copy(buf, offset);
      return n; // n < length on the short read: the F5 guard must clip buf to these n bytes
    },
  };

  const emitted = [];
  const w = createWatcher({
    paths: ['/nonexistent'],
    onGrowth: (ev) => { emitted.push(...ev.lines); },
    fsImpl: fakeFs,
  });

  // First tail: short read delivers only the complete line1; the partial line2 stays unread.
  w._tail('/whatever.jsonl');
  assert.deepEqual(emitted, [line1.slice(0, -1)], 'first tail emits exactly line1, no NUL-padded extra');

  // line2 is now fully flushed; a normal read should pick it up exactly once, with no line1 replay.
  onDisk = Buffer.from(line1 + line2, 'utf8');
  w._tail('/whatever.jsonl');

  assert.deepEqual(
    emitted,
    [line1.slice(0, -1), line2.slice(0, -1)],
    'no replay of line1 and no NUL contamination — exactly line1 then line2',
  );
  for (const ln of emitted) {
    assert.ok(!ln.includes('\u0000'), 'no NUL byte wedged into an emitted line');
  }
});
