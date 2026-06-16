// U7 — detail pane: all P9 floor fields by name, tokens unavailable not 0, prompt scrolls.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';

// Unmount all Ink instances after each test so the integrated `node --test` run terminates.
afterEach(() => cleanup());

import { DetailPane, floorRows } from './DetailPane.mjs';
import { UNAVAILABLE } from '../parse/transcript-fields.mjs';

const e = React.createElement;

const fullNode = {
  id: 'agent-a',
  agentType: 'banyan:bn-plan-lead',
  model: 'claude-opus-4-8',
  cwd: '/Users/riley/repos/banyan',
  worktreePath: UNAVAILABLE,
  gitBranch: 'delivery/x',
  startTime: '2026-06-14T17:00:00.000Z',
  endTime: '2026-06-14T17:02:30.000Z',
  endTimeApprox: false,
  tokens: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
  depth: 2,
  prompt: '=== BANYAN ENVELOPE ===\nobjective: do the thing\n=== END ENVELOPE ===',
};

test('P9 floor: ALL required fields render by name (R10 cannot pass on role alone)', () => {
  const { lastFrame } = render(e(DetailPane, { node: fullNode }));
  const frame = lastFrame();
  for (const field of ['agentType', 'model', 'owningUnit', 'worktree', 'start', 'end', 'duration', 'tokens', 'depth']) {
    assert.match(frame, new RegExp(`${field}:`), `floor field '${field}' must be present by name`);
  }
  assert.match(frame, /banyan:bn-plan-lead/);
  assert.match(frame, /claude-opus-4-8/);
});

test('tokens render unavailable (not 0) when absent', () => {
  const node = { ...fullNode, tokens: UNAVAILABLE };
  const rows = floorRows(node);
  const tokenRow = rows.find(([k]) => k === 'tokens');
  assert.equal(tokenRow[1], 'unavailable');
  assert.notEqual(tokenRow[1], '0');
  const { lastFrame } = render(e(DetailPane, { node }));
  assert.match(lastFrame(), /tokens: unavailable/);
});

test('duration computes from start/end, flags approx', () => {
  const rows = floorRows(fullNode);
  assert.equal(rows.find(([k]) => k === 'duration')[1], '150.0s');
  const approx = floorRows({ ...fullNode, endTimeApprox: true });
  assert.match(approx.find(([k]) => k === 'duration')[1], /approx/);
});

test('prompt is rendered verbatim (no redaction, AR1)', () => {
  const { lastFrame } = render(e(DetailPane, { node: fullNode }));
  assert.match(lastFrame(), /objective: do the thing/);
});

test('a prompt longer than the viewport scrolls (offset changes the rendered slice)', () => {
  const longPrompt = Array.from({ length: 30 }, (_, i) => `line-${i}`).join('\n');
  const node = { ...fullNode, prompt: longPrompt };
  const top = render(e(DetailPane, { node, viewport: 5, scrollTop: 0 })).lastFrame();
  const scrolled = render(e(DetailPane, { node, viewport: 5, scrollTop: 10 })).lastFrame();
  assert.match(top, /line-0/);
  assert.equal(/line-20/.test(top), false, 'line-20 not visible at top');
  assert.match(scrolled, /line-10/);
  assert.equal(/line-0\b/.test(scrolled), false, 'line-0 scrolled off');
});

test('missing prompt shows a placeholder, not a crash', () => {
  const node = { ...fullNode, prompt: UNAVAILABLE };
  const { lastFrame } = render(e(DetailPane, { node }));
  assert.match(lastFrame(), /\(no prompt\)/);
});
