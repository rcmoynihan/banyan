// U4 — toolUseId tree-join risk-spike against real b5bf91de transcripts (F1 / R-C control).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { buildTree, buildTreeFromText, RUN_ROOT_ID } from './tree-builder.mjs';
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
  const tree = buildTreeFromText({
    transcriptTexts: [
      { id: 'agent-drift-parent', text: driftText },
      { id: 'agent-drift-child', text: '' },
    ],
    metas: [
      { id: 'agent-drift-parent', toolUseId: 'unmatched-parent', agentType: driftMeta.agentType },
      { id: 'agent-drift-child', toolUseId: 'toolu_DRIFTSPAWN0001', agentType: 'banyan:bn-correctness-reviewer' },
    ],
    rootTranscriptText: null,
  });
  const childEdge = tree.edges.find((e) => e.childId === 'agent-drift-child');
  assert.equal(childEdge.parentId, 'agent-drift-parent', 'Task spawn edge matched the child to its parent');
  assert.equal(childEdge.via, 'subagent');
});
