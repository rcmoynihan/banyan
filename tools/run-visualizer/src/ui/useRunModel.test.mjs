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

test('apply liveness transition flips status (the model side of the hook)', () => {
  let s = apply({ mode: 'transcript', nodes: { 'agent-x': { id: 'agent-x', status: 'active' } }, expanded: {}, selectedId: null, durable: null, stats: {} }, { type: 'select', id: 'agent-x' });
  s = apply(s, { type: 'liveness', transitions: [{ id: 'agent-x', to: 'finished', endTime: 'T9' }] });
  assert.equal(s.nodes['agent-x'].status, 'finished');
});
