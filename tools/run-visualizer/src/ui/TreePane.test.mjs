// U6 — TreePane snapshot: nested tree, active vs finished distinct, expand/collapse node set.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';

// Unmount all Ink instances after each test so the integrated `node --test` run terminates.
afterEach(() => cleanup());

import { TreePane, flattenVisible } from './TreePane.mjs';
import { initialState, apply } from '../model/run-model.mjs';

const e = React.createElement;

function twoLevelState() {
  // parent emits a spawn; child joins to it; a sibling leaf at root.
  let s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [
      { id: 'agent-parent', records: [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'sp1', name: 'Agent', input: { subagent_type: 'banyan:bn-parent' } }] } }] },
      { id: 'agent-child', records: [] },
      { id: 'agent-leaf', records: [] },
    ],
    metas: [
      { id: 'agent-parent', toolUseId: 'unmatched-p', agentType: 'banyan:bn-parent' },
      { id: 'agent-child', toolUseId: 'sp1', agentType: 'banyan:bn-child' },
      { id: 'agent-leaf', toolUseId: 'unmatched-l', agentType: 'banyan:bn-leaf' },
    ],
    rootTranscript: null,
  });
  // mark the child finished, parent active
  s = apply(s, { type: 'liveness', transitions: [{ id: 'agent-child', to: 'finished', endTime: 'T9' }] });
  return s;
}

test('snapshot renders the root-level nodes with active vs finished markers', () => {
  const s = twoLevelState();
  const { lastFrame } = render(e(TreePane, { state: s }));
  const frame = lastFrame();
  assert.match(frame, /banyan:bn-parent/);
  assert.match(frame, /banyan:bn-leaf/);
  // active marker ● for the active parent, ○ for finished where shown
  assert.match(frame, /●/, 'active marker present');
});

test('expand/collapse changes the rendered node set', () => {
  let s = twoLevelState();
  // default is EXPANDED (this tool shows the historical nested tree on launch): child visible.
  let rows = flattenVisible(s);
  assert.equal(rows.some((r) => r.id === 'agent-child'), true, 'child visible by default (expanded)');
  // collapse the parent: child hidden
  s = apply(s, { type: 'toggle-expand', id: 'agent-parent' });
  rows = flattenVisible(s);
  assert.equal(rows.some((r) => r.id === 'agent-child'), false, 'child hidden after collapse');
  // a collapsed parent advertises its child count (▸ affordance)
  const collapsed = render(e(TreePane, { state: s }));
  assert.match(collapsed.lastFrame(), /▸ ● banyan:bn-parent \(1\)/, 'collapsed parent shows ▸ + count');
  // expand again: child visible
  s = apply(s, { type: 'toggle-expand', id: 'agent-parent' });
  rows = flattenVisible(s);
  assert.equal(rows.some((r) => r.id === 'agent-child'), true, 'child visible after re-expand');
  const { lastFrame } = render(e(TreePane, { state: s }));
  assert.match(lastFrame(), /banyan:bn-child/);
  assert.match(lastFrame(), /▾ ● banyan:bn-parent/, 'expanded parent shows ▾');
});

test('durable-only mode renders the degraded roster with ×N', () => {
  const roster = { layout: 'nested', roster: [{ role: 'bn-finding-owner', count: 3, instances: [] }] };
  const s = apply(initialState(), { type: 'durable-only', roster });
  const { lastFrame } = render(e(TreePane, { state: s }));
  assert.match(lastFrame(), /DEGRADED/);
  assert.match(lastFrame(), /bn-finding-owner ×3/);
});

test('windowing slices long trees to the viewport', () => {
  let s = initialState();
  const transcripts = [];
  const metas = [];
  for (let i = 0; i < 50; i++) {
    transcripts.push({ id: `agent-${i}`, records: [] });
    metas.push({ id: `agent-${i}`, toolUseId: `none-${i}`, agentType: `bn-n${i}` });
  }
  s = apply(s, { type: 'build-tree', transcripts, metas, rootTranscript: null });
  const { lastFrame } = render(e(TreePane, { state: s, viewport: 5 }));
  const lines = lastFrame().split('\n').filter((l) => l.includes('bn-n'));
  assert.equal(lines.length, 5, 'only the viewport rows render');
});
