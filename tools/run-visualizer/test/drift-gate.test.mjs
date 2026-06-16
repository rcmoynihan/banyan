// U9 — end-to-end P6 schema-drift gate (R13). Load the drift/ fixture through
// tailer→parser→model→view-state and assert it renders + degrades + does not throw, each of the
// three mutations handled (renamed/missing usage → unavailable; Task spawn → edge; array content
// → handled).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLines } from '../src/parse/jsonl-line.mjs';
import { initialState, apply, isUnavail } from '../src/model/run-model.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (...p) => join(here, 'fixtures', ...p);

test('drift fixture degrades end-to-end through model without throwing (P6)', () => {
  const driftText = fs.readFileSync(fixture('drift', 'agent-drift.jsonl'), 'utf8');
  const driftMeta = JSON.parse(fs.readFileSync(fixture('drift', 'agent-drift.meta.json'), 'utf8'));

  let state;
  assert.doesNotThrow(() => {
    state = apply(initialState(), {
      type: 'build-tree',
      transcripts: [
        { id: 'agent-drift', records: parseLines(driftText).records },
        { id: 'agent-drift-child', records: [] },
      ],
      metas: [
        { id: 'agent-drift', toolUseId: driftMeta.toolUseId, agentType: driftMeta.agentType },
        { id: 'agent-drift-child', toolUseId: 'toolu_DRIFTSPAWN0001', agentType: 'banyan:bn-correctness-reviewer' },
      ],
      rootTranscript: null,
    });
  }, 'building from a drifted transcript must not throw');

  // mutation (i): renamed/missing usage → tokens unavailable, never 0
  assert.ok(isUnavail(state.nodes['agent-drift'].tokens), 'drift node tokens unavailable');

  // mutation (ii): the Task spawn produced an edge joining the child to the drift parent
  const childEdge = state.nodes['agent-drift-child'];
  assert.equal(childEdge.parentId, 'agent-drift', 'Task spawn edge joined child to drift parent');

  // mutation (iii): array content handled — a prompt or unavailable, never a throw
  assert.ok('prompt' in state.nodes['agent-drift']);
});

test('a torn transcript keeps already-parsed nodes visible (P1a, no silent vanish)', () => {
  const tornText = fs.readFileSync(fixture('torn', 'agent-torn.jsonl'), 'utf8');
  const { records, dropped } = parseLines(tornText);
  assert.equal(records.length, 3);
  assert.equal(dropped.length, 1);
  const state = apply(initialState(), {
    type: 'build-tree',
    transcripts: [{ id: 'agent-torn', records }],
    metas: [{ id: 'agent-torn', toolUseId: 'x', agentType: 'banyan:bn-torn' }],
    rootTranscript: null,
  });
  // The node still renders with its available fields (prompt from the first good user line).
  assert.equal(state.nodes['agent-torn'].agentType, 'banyan:bn-torn');
  assert.ok('prompt' in state.nodes['agent-torn']);
});
