// U8 — useRunModel: dispatch updates state; a growth event routes through the FSM into a
// liveness transition. Driven via a tiny Ink component using ink-testing-library.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { Text } from 'ink';
import { render, cleanup } from 'ink-testing-library';

// Unmount all Ink instances after each test so `node --test` (no --test-force-exit) terminates.
afterEach(() => cleanup());

import { useRunModel } from './useRunModel.mjs';
import { apply } from '../model/run-model.mjs';
import { manualClock } from '../core/clock.mjs';

const e = React.createElement;

test('dispatch(build-tree) populates state; a growth routes to a finished liveness transition', async () => {
  const clock = manualClock(0);
  let captured = null;

  function Harness() {
    const [state, dispatch] = useRunModel({
      quiescenceMs: 2500,
      clock,
      bootstrap: (dispatchEvent, onGrowth) => {
        // build a one-node tree, then drive a growth that the FSM should treat as active.
        dispatchEvent({
          type: 'build-tree',
          transcripts: [{ id: 'agent-x', records: [] }],
          metas: [{ id: 'agent-x', toolUseId: 't', agentType: 'banyan:bn-x' }],
          rootTranscript: null,
        });
        onGrowth({ id: 'agent-x', records: [{ timestamp: 'T0' }], lastLineComplete: true });
      },
    });
    captured = state;
    const n = state.nodes['agent-x'];
    return e(Text, null, n ? `${n.id}:${n.status}` : 'empty');
  }

  const { lastFrame } = render(e(Harness));
  // allow the effect to run
  await new Promise((r) => setTimeout(r, 30));
  assert.match(lastFrame(), /agent-x:active/);
  assert.ok(captured.nodes['agent-x'], 'node present after build-tree dispatch');
});

test('a growth for an UNKNOWN id materializes the node live (R2-F1 post-launch growth)', async () => {
  const clock = manualClock(0);
  let captured = null;

  function Harness() {
    const [state] = useRunModel({
      quiescenceMs: 2500,
      clock,
      bootstrap: (dispatchEvent, onGrowth) => {
        // snapshot tree has ONE known node; then a growth arrives for an id the snapshot never built.
        dispatchEvent({
          type: 'build-tree',
          transcripts: [{ id: 'agent-known', records: [] }],
          metas: [{ id: 'agent-known', toolUseId: 't', agentType: 'banyan:bn-x' }],
          rootTranscript: null,
        });
        onGrowth({ id: 'agent-fresh', records: [{ timestamp: 'T0' }], lastLineComplete: true });
      },
    });
    captured = state;
    const n = state.nodes['agent-fresh'];
    return e(Text, null, n ? `${n.id}:${n.status}` : 'absent');
  }

  const { lastFrame } = render(e(Harness));
  await new Promise((r) => setTimeout(r, 30));
  assert.match(lastFrame(), /agent-fresh:active/, 'a newly-spawned child surfaces from a live growth');
  assert.ok(captured.nodes['agent-fresh'], 'unknown-id growth materialized the node (not silently dropped)');
});

test('quiescence-tick producer flips an idle active node to finished live (F3)', async () => {
  const clock = manualClock(0);
  let driveTick = null; // captured tick callback (injected scheduler — no real timer)
  let captured = null;

  function Harness() {
    const [state] = useRunModel({
      quiescenceMs: 2500,
      clock,
      // Inject the scheduler so the test drives ticks deterministically; cleanup is a no-op so no
      // real interval leaks and `node --test` still terminates.
      scheduleTick: (cb) => { driveTick = cb; return () => { driveTick = null; }; },
      bootstrap: (dispatchEvent, onGrowth) => {
        dispatchEvent({
          type: 'build-tree',
          transcripts: [{ id: 'agent-q', records: [] }],
          metas: [{ id: 'agent-q', toolUseId: 't', agentType: 'banyan:bn-q' }],
          rootTranscript: null,
        });
        onGrowth({ id: 'agent-q', records: [{ timestamp: 'T0' }], lastLineComplete: true });
      },
    });
    captured = state;
    const n = state.nodes['agent-q'];
    return e(Text, null, n ? `${n.id}:${n.status}` : 'empty');
  }

  const { lastFrame } = render(e(Harness));
  await new Promise((r) => setTimeout(r, 30));
  // growth at t=0 marks it active; before the window elapses, a tick must NOT flip it.
  assert.match(lastFrame(), /agent-q:active/, 'still active before the quiescence window');
  assert.ok(typeof driveTick === 'function', 'the producer registered a tick scheduler');

  // advance past the quiescence window and drive a tick → active→finished.
  clock.advance(3000);
  driveTick();
  await new Promise((r) => setTimeout(r, 10));
  assert.match(lastFrame(), /agent-q:finished/, 'idle node flips to finished after a tick past the window');
  assert.equal(captured.nodes['agent-q'].status, 'finished');
});

test('apply liveness transition flips status (the model side of the hook)', () => {
  let s = apply({ mode: 'transcript', nodes: { 'agent-x': { id: 'agent-x', status: 'active' } }, expanded: {}, selectedId: null, durable: null, stats: {} }, { type: 'select', id: 'agent-x' });
  s = apply(s, { type: 'liveness', transitions: [{ id: 'agent-x', to: 'finished', endTime: 'T9' }] });
  assert.equal(s.nodes['agent-x'].status, 'finished');
});
