// U5 — RunModel core: serializability, import-purity (DI1 enforced), real-fixture enrichment,
// durable-only roster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { initialState, apply, childrenOf, isUnavail } from './run-model.mjs';
import { parseLines } from '../parse/jsonl-line.mjs';
import { buildDurableRoster } from '../sources/durable-reader.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const toolRoot = join(here, '..', '..');
const fixture = (...p) => join(toolRoot, 'test', 'fixtures', ...p);

const SESSION_ID = 'b5bf91de-f038-4e03-b691-9cbbc703613a';
const PROJECT = join(os.homedir(), '.claude', 'projects', '-Users-riley-repos-banyan');
const SUB = join(PROJECT, SESSION_ID, 'subagents');
const ROOT = join(PROJECT, `${SESSION_ID}.jsonl`);
const realDataPresent = fs.existsSync(SUB) && fs.existsSync(ROOT);

test('JSON.stringify(state) round-trips unchanged (KD2 serializability)', () => {
  let s = initialState();
  s = apply(s, {
    type: 'build-tree',
    transcripts: [{ id: 'agent-a', records: parseLines('{"type":"user","timestamp":"T0","message":{"content":"hi"}}').records }],
    metas: [{ id: 'agent-a', toolUseId: 'x', agentType: 'banyan:bn-x', description: 'd' }],
    rootTranscript: null,
  });
  const round = JSON.parse(JSON.stringify(s));
  assert.deepEqual(round, s, 'state survives a JSON round-trip with no class instances');
});

test('import-graph check: run-model.mjs imports NONE of ink/react/chokidar/fs (DI1 enforced)', () => {
  // Statically resolve the transitive import graph of run-model.mjs and assert purity.
  const banned = ['ink', 'react', 'chokidar', 'node:fs', "'fs'", '"fs"'];
  const visited = new Set();
  const stack = [join(here, 'run-model.mjs')];
  while (stack.length) {
    const file = stack.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    const src = fs.readFileSync(file, 'utf8');
    const importRe = /import\s+(?:[^'"]*\s+from\s+)?['"]([^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(src)) !== null) {
      const spec = m[1];
      // Any bare framework / fs import is a violation.
      for (const b of ['ink', 'react', 'chokidar', 'fs', 'node:fs']) {
        assert.ok(spec !== b && spec !== `node:${b}`, `${file} imports banned module '${spec}'`);
      }
      if (spec.startsWith('.')) {
        stack.push(join(dirname(file), spec));
      }
    }
  }
  assert.ok(visited.size >= 4, 'walked the run-model import graph');
});

test('fed real fixture transcripts → tree with prompts + timing + tokens (unavailable where absent)', { skip: !realDataPresent }, () => {
  const transcripts = [];
  const metas = [];
  for (const name of fs.readdirSync(SUB)) {
    if (name.endsWith('.meta.json')) {
      const id = name.slice(0, -'.meta.json'.length);
      metas.push({ id, ...JSON.parse(fs.readFileSync(join(SUB, name), 'utf8')) });
    } else if (name.endsWith('.jsonl')) {
      const id = name.slice(0, -'.jsonl'.length);
      transcripts.push({ id, records: parseLines(fs.readFileSync(join(SUB, name), 'utf8')).records });
    }
  }
  const rootTranscript = parseLines(fs.readFileSync(ROOT, 'utf8')).records;
  let s = apply(initialState(), { type: 'build-tree', transcripts, metas, rootTranscript });
  assert.equal(s.stats.total, 93);
  assert.equal(s.stats.attachedToRoot, 0);
  // At least one node has a real prompt, a model, and timing.
  const withPrompt = Object.values(s.nodes).filter((n) => typeof n.prompt === 'string');
  assert.ok(withPrompt.length > 0, 'real prompts derived');
  const withModel = Object.values(s.nodes).filter((n) => typeof n.model === 'string');
  assert.ok(withModel.length > 0, 'models derived');
  // tokens are either a summed object or the unavailable sentinel — never a bare 0.
  for (const n of Object.values(s.nodes)) {
    assert.ok(isUnavail(n.tokens) || typeof n.tokens.totalTokens === 'number');
  }
});

test('liveness transitions refine node status', () => {
  let s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [{ id: 'agent-a', records: [] }],
    metas: [{ id: 'agent-a', toolUseId: 'x', agentType: 'bn-x' }],
    rootTranscript: null,
  });
  assert.equal(s.nodes['agent-a'].status, 'active');
  s = apply(s, { type: 'liveness', transitions: [{ id: 'agent-a', to: 'finished', endTime: 'T9', endTimeApprox: true }] });
  assert.equal(s.nodes['agent-a'].status, 'finished');
  assert.equal(s.nodes['agent-a'].endTime, 'T9');
  assert.equal(s.nodes['agent-a'].endTimeApprox, true);
});

test('unresolved session → durable-only roster with bn-finding-owner ×3 collapsed (P5/P8)', () => {
  const roster = buildDurableRoster(fixture('durable-only', 'nested'));
  const s = apply(initialState(), { type: 'durable-only', roster });
  assert.equal(s.mode, 'durable-only');
  const fo = roster.roster.find((r) => r.role === 'bn-finding-owner');
  assert.ok(fo, 'bn-finding-owner role present');
  assert.equal(fo.count, 3, 'three concurrent instances collapsed to ×3');
  assert.equal(roster.fidelityLoss, true, 'fidelity loss recorded');
});

test('build-tree materializes the run-root node so root-transcript liveness is observable (R2-F1)', () => {
  const s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [{ id: 'agent-a', records: [] }],
    metas: [{ id: 'agent-a', toolUseId: 'x', agentType: 'bn-x' }],
    rootTranscript: null,
  });
  assert.ok(s.nodes.__run_root__, 'the synthetic run-root is a real node');
  assert.equal(s.nodes.__run_root__.depth, 0);
  // a liveness transition for the run-root now lands (previously dropped: id absent from nodes).
  const s2 = apply(s, { type: 'liveness', transitions: [{ id: '__run_root__', to: 'finished', endTime: 'T9' }] });
  assert.equal(s2.nodes.__run_root__.status, 'finished');
});

test('add-node materializes a node first seen LIVE for an UNKNOWN id (R2-F1)', () => {
  let s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [{ id: 'agent-known', records: [] }],
    metas: [{ id: 'agent-known', toolUseId: 'x', agentType: 'bn-x' }],
    rootTranscript: null,
  });
  assert.equal(s.nodes['agent-new'], undefined, 'unknown id absent from the snapshot tree');
  s = apply(s, { type: 'add-node', id: 'agent-new', records: [] });
  assert.ok(s.nodes['agent-new'], 'a growth for an unknown id materializes the node');
  assert.equal(s.nodes['agent-new'].parentId, '__run_root__', 'new node attaches to the run-root, marked');
  assert.ok(s.rootChildren.includes('agent-new'), 'new node is walkable as a run-root child');
  // a subsequent liveness now refines the freshly-added node (previously dropped).
  s = apply(s, { type: 'liveness', transitions: [{ id: 'agent-new', to: 'finished', endTime: 'T1' }] });
  assert.equal(s.nodes['agent-new'].status, 'finished');
});

test('add-node is idempotent — an already-present id is left untouched (R2-F1)', () => {
  let s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [{ id: 'agent-a', records: [] }],
    metas: [{ id: 'agent-a', toolUseId: 'x', agentType: 'bn-real' }],
    rootTranscript: null,
  });
  const before = s.nodes['agent-a'];
  s = apply(s, { type: 'add-node', id: 'agent-a', records: [] });
  assert.equal(s.nodes['agent-a'], before, 'present node kept (so a real meta is not clobbered)');
});

test('waiting flag set then cleared when a node materializes (R2-F4 recovery)', () => {
  let s = apply(initialState(), { type: 'waiting', message: 'waiting for session transcripts…' });
  assert.ok(s.waiting, 'waiting flag set');
  assert.match(s.waiting.message, /waiting/);
  s = apply(s, { type: 'add-node', id: 'agent-late', records: [] });
  assert.equal(s.waiting, null, 'waiting cleared once a live node appears');
});

test('toggle-expand and select are immutable updates', () => {
  const s0 = initialState();
  const s1 = apply(s0, { type: 'toggle-expand', id: 'n1' });
  assert.equal(s0.expanded.n1, undefined, 'original untouched (immutable)');
  assert.equal(s1.expanded.n1, true);
  const s2 = apply(s1, { type: 'select', id: 'n1' });
  assert.equal(s2.selectedId, 'n1');
});

test('childrenOf walks the tree', () => {
  const s = apply(initialState(), {
    type: 'build-tree',
    transcripts: [
      { id: 'agent-parent', records: [{ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'sp1', name: 'Agent', input: { subagent_type: 'bn-x' } }] } }] },
      { id: 'agent-child', records: [] },
    ],
    metas: [
      { id: 'agent-parent', toolUseId: 'unmatched', agentType: 'bn-p' },
      { id: 'agent-child', toolUseId: 'sp1', agentType: 'bn-c' },
    ],
    rootTranscript: null,
  });
  assert.deepEqual(childrenOf(s, 'agent-parent'), ['agent-child']);
});
