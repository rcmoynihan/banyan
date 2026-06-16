// U4 — toolUseId tree-join risk-spike against real b5bf91de transcripts (F1 / R-C control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildTree, RUN_ROOT_ID } from './tree-builder.mjs';
import { parseLines } from '../parse/jsonl-line.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (...p) => join(here, '..', '..', 'test', 'fixtures', ...p);

const SESSION_ID = 'b5bf91de-f038-4e03-b691-9cbbc703613a';
const PROJECT = join(os.homedir(), '.claude', 'projects', '-Users-riley-repos-banyan');
const SUB = join(PROJECT, SESSION_ID, 'subagents');
const ROOT = join(PROJECT, `${SESSION_ID}.jsonl`);
const realDataPresent = fs.existsSync(SUB) && fs.existsSync(ROOT);

function loadRealInputs() {
  const transcripts = [];
  const metas = [];
  for (const name of fs.readdirSync(SUB)) {
    if (name.endsWith('.meta.json')) {
      const id = name.slice(0, -'.meta.json'.length);
      const meta = JSON.parse(fs.readFileSync(join(SUB, name), 'utf8'));
      metas.push({ id, ...meta });
    } else if (name.endsWith('.jsonl')) {
      const id = name.slice(0, -'.jsonl'.length);
      transcripts.push({ id, records: parseLines(fs.readFileSync(join(SUB, name), 'utf8')).records });
    }
  }
  const rootRecords = parseLines(fs.readFileSync(ROOT, 'utf8')).records;
  return { transcripts, metas, rootTranscript: rootRecords };
}

test('JOIN: 82 inter-subagent + 11 root = 93, 0 unmatched WHEN the sibling root is read (F1)', { skip: !realDataPresent }, () => {
  const { transcripts, metas, rootTranscript } = loadRealInputs();
  const tree = buildTree({ transcripts, metas, rootTranscript });
  assert.equal(tree.stats.total, 93, '93 child transcripts');
  assert.equal(tree.stats.matchedViaSubagent, 82, '82 inter-subagent edges');
  assert.equal(tree.stats.matchedViaRoot, 11, '11 root edges via sibling root');
  assert.equal(tree.stats.attachedToRoot, 0, '0 unmatched when the root is read');
});

test('CONTROL: omitting the sibling root leaves the 11 trunk-spawned roots dangling (R-C)', { skip: !realDataPresent }, () => {
  const { transcripts, metas } = loadRealInputs();
  const tree = buildTree({ transcripts, metas, rootTranscript: null });
  assert.equal(tree.stats.matchedViaSubagent, 82);
  assert.equal(tree.stats.matchedViaRoot, 0, 'no root edges without the root file');
  assert.equal(tree.stats.attachedToRoot, 11, 'the 11 roots dangle to the synthetic run-root');
});

test('every node has a computed depth >= 1', { skip: !realDataPresent }, () => {
  const { transcripts, metas, rootTranscript } = loadRealInputs();
  const tree = buildTree({ transcripts, metas, rootTranscript });
  for (const n of tree.nodes) assert.ok(n.depth >= 1, `node ${n.id} depth ${n.depth}`);
});

// A transcript that emits a single spawn tool_use carrying `spawnId` (the .id a child's
// meta.toolUseId joins to). Mirrors extractSpawnEdges' shape match (assistant + tool_use + id).
function spawnTranscript(spawnId) {
  return [{
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id: spawnId, name: 'Agent', input: { subagent_type: 'banyan:bn-x' } }] },
  }];
}

// Walk parentId links from a node to RUN_ROOT_ID; false if a cycle is hit before the root.
function reachesRootById(nodes, startId) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set();
  let cur = startId;
  while (cur !== RUN_ROOT_ID) {
    if (seen.has(cur)) return false;
    seen.add(cur);
    const n = byId.get(cur);
    if (!n) return false;
    cur = n.parentId;
  }
  return true;
}

test('F4: a self-referential toolUseId (self-loop) is re-attached to the run-root, reachable', () => {
  // agent-self emits spawn toolu_SELF and its own meta points back at toolu_SELF ⇒ self-parent cycle.
  const tree = buildTree({
    transcripts: [{ id: 'agent-self', records: spawnTranscript('toolu_SELF') }],
    metas: [{ id: 'agent-self', toolUseId: 'toolu_SELF', agentType: 'banyan:bn-x' }],
    rootTranscript: null,
  });
  assert.equal(tree.stats.total, 1, 'still counted (never dropped)');
  const n = tree.nodes.find((x) => x.id === 'agent-self');
  assert.equal(n.attachedToRoot, true, 'cycle member re-attached to run-root, marked');
  assert.equal(n.parentId, RUN_ROOT_ID);
  assert.ok(reachesRootById(tree.nodes, 'agent-self'), 'reachable from RUN_ROOT_ID after repair');
  assert.equal(tree.stats.attachedToRoot, 1, 'stat reflects the re-attachment');
  assert.equal(tree.stats.matchedViaSubagent, 0, 'unreachable join was reclassified, not double-counted');
});

test('F4: a 2-cycle (A→B, B→A) leaves BOTH nodes reachable from the run-root', () => {
  // agent-a emits toolu_B; agent-b emits toolu_A. a.meta=toolu_A (emitted by b), b.meta=toolu_B (by a).
  // ⇒ parentOf(a)=b, parentOf(b)=a — a closed cycle, unreachable from the root without repair.
  const tree = buildTree({
    transcripts: [
      { id: 'agent-a', records: spawnTranscript('toolu_B') },
      { id: 'agent-b', records: spawnTranscript('toolu_A') },
    ],
    metas: [
      { id: 'agent-a', toolUseId: 'toolu_A', agentType: 'banyan:bn-x' },
      { id: 'agent-b', toolUseId: 'toolu_B', agentType: 'banyan:bn-y' },
    ],
    rootTranscript: null,
  });
  assert.equal(tree.stats.total, 2);
  assert.ok(reachesRootById(tree.nodes, 'agent-a'), 'agent-a reachable from root after repair');
  assert.ok(reachesRootById(tree.nodes, 'agent-b'), 'agent-b reachable from root after repair');
  // Breaking the cycle re-attaches the minimal set (the first member walked); the other then
  // reaches the root THROUGH it. Both are reachable; at least one is re-attached to run-root.
  const reattached = tree.nodes.filter((n) => n.attachedToRoot);
  assert.ok(reattached.length >= 1, 'at least one cycle member re-attached to run-root');
  assert.equal(tree.stats.attachedToRoot, reattached.length, 'stat matches the re-attached count');
});

test('a dangling toolUseId attaches to the run-root, flagged, not dropped', () => {
  const tree = buildTree({
    transcripts: [{ id: 'agent-orphan', records: [] }],
    metas: [{ id: 'agent-orphan', toolUseId: 'toolu_NEVER_EMITTED', agentType: 'banyan:bn-x' }],
    rootTranscript: null,
  });
  assert.equal(tree.stats.total, 1);
  assert.equal(tree.stats.attachedToRoot, 1);
  const n = tree.nodes[0];
  assert.equal(n.parentId, RUN_ROOT_ID);
  assert.equal(n.attachedToRoot, true);
});

test('a node missing its .meta.json still renders with agentType unavailable', () => {
  const tree = buildTree({
    transcripts: [{ id: 'agent-nometa', records: [] }],
    metas: [], // no meta for this child
    rootTranscript: null,
  });
  const n = tree.nodes[0];
  assert.equal(n.hasMeta, false);
  assert.deepEqual(n.agentType, { unavailable: true });
  assert.equal(n.attachedToRoot, true, 'no toolUseId ⇒ attached to run-root, not dropped');
});

test('the drift fixture Task spawn still produces an edge', () => {
  const driftText = fs.readFileSync(fixture('drift', 'agent-drift.jsonl'), 'utf8');
  const driftMeta = JSON.parse(fs.readFileSync(fixture('drift', 'agent-drift.meta.json'), 'utf8'));
  // A child whose meta.toolUseId == the Task spawn .id emitted by the drift transcript.
  // (parseLines per-line is the same one-liner the removed buildTreeFromText wrapper performed.)
  const tree = buildTree({
    transcripts: [
      { id: 'agent-drift-parent', records: parseLines(driftText).records },
      { id: 'agent-drift-child', records: parseLines('').records },
    ],
    metas: [
      { id: 'agent-drift-parent', toolUseId: 'unmatched-parent', agentType: driftMeta.agentType },
      { id: 'agent-drift-child', toolUseId: 'toolu_DRIFTSPAWN0001', agentType: 'banyan:bn-correctness-reviewer' },
    ],
    rootTranscript: null,
  });
  const childEdge = tree.edges.find((e) => e.childId === 'agent-drift-child');
  assert.equal(childEdge.parentId, 'agent-drift-parent', 'Task spawn edge matched the child to its parent');
  assert.equal(childEdge.via, 'subagent');
});
