// U6 — App two-pane render + the watcher adapter deterministic tail.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';

// Unmount all Ink instances after each test so the integrated `node --test` run terminates.
afterEach(() => cleanup());

import { App } from './App.mjs';
import { initialState, apply } from '../model/run-model.mjs';
import { createWatcher } from '../adapters/transcript-watcher.mjs';

const e = React.createElement;

function oneNodeState() {
  let s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [{ id: 'agent-a', records: [{ type: 'user', timestamp: 'T0', message: { content: 'env' } }] }],
    metas: [{ id: 'agent-a', toolUseId: 'x', agentType: 'banyan:bn-a' }],
    rootTranscript: null,
  });
  s = apply(s, { type: 'select', id: 'agent-a' });
  return s;
}

test('App renders both panes (tree + detail shell)', () => {
  const { lastFrame } = render(e(App, { state: oneNodeState() }));
  const frame = lastFrame();
  assert.match(frame, /Run tree/);
  assert.match(frame, /Detail/);
  assert.match(frame, /banyan:bn-a/);
});

test('App shows the durable-only degraded view', () => {
  const roster = { layout: 'flat', roster: [{ role: 'bn-delivery-lead', count: 1, instances: [] }] };
  const s = apply(initialState(), { type: 'durable-only', roster });
  const { lastFrame } = render(e(App, { state: s }));
  assert.match(lastFrame(), /DEGRADED/);
});

test('watcher tail emits a growth event with the new complete lines (deterministic)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-watch-'));
  const file = path.join(tmp, 'agent-deadbeef.jsonl');
  fs.writeFileSync(file, '{"type":"user","timestamp":"T0","message":{"content":"hi"}}\n');
  const events = [];
  const w = createWatcher({ paths: [tmp], onGrowth: (ev) => events.push(ev) });
  // drive a single tail directly (no real chokidar event needed)
  w._tail(file);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'agent-deadbeef');
  assert.equal(events[0].records.length, 1);
  // append more, tail again — only the NEW line is emitted (offset advanced)
  fs.appendFileSync(file, '{"type":"assistant","timestamp":"T1","message":{"model":"m","content":[{"type":"text","text":"x"}]}}\n');
  w._tail(file);
  assert.equal(events.length, 2);
  assert.equal(events[1].records.length, 1, 'only the appended line, not a re-read');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('watcher derives ids for subagent files and the sibling root', () => {
  const w = createWatcher({ paths: [], onGrowth: () => {} });
  assert.equal(w._idForPath('/x/subagents/agent-abc123.jsonl'), 'agent-abc123');
  assert.equal(w._idForPath('/x/b5bf91de-f038.jsonl'), 'root:b5bf91de-f038');
});
