// U1b — committed verification fixtures shape assertions (fixtures BEFORE parsers).
// These tests assert ONLY that the committed fixtures exist and carry the shapes the gate
// asserts against; the parsing/joining LOGIC is U1/U3/U4/U5/U9, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const F = (...p) => join(here, 'fixtures', ...p);

test('drift/ fixture carries the three coherent schema mutations', () => {
  const lines = readFileSync(F('drift', 'agent-drift.jsonl'), 'utf8')
    .split('\n').filter((l) => l.length > 0).map((l) => JSON.parse(l));
  // (ii) a Task-named spawn tool_use carrying subagent_type + .id
  const spawn = lines
    .flatMap((d) => (Array.isArray(d?.message?.content) ? d.message.content : []))
    .find((b) => b?.type === 'tool_use' && b?.name === 'Task');
  assert.ok(spawn, 'expected a Task-named spawn tool_use');
  assert.equal(typeof spawn.id, 'string');
  assert.ok(spawn.input?.subagent_type, 'Task spawn must carry subagent_type');
  // (iii) array message.content as the common/spawn-bearing case
  assert.ok(lines.some((d) => Array.isArray(d?.message?.content)), 'expected array content');
  // (i) renamed/missing usage: no assistant line has a plain `usage` object
  const hasPlainUsage = lines.some((d) => d?.type === 'assistant' && d?.message?.usage);
  assert.equal(hasPlainUsage, false, 'usage must be renamed/absent in the drift fixture');

  const meta = JSON.parse(readFileSync(F('drift', 'agent-drift.meta.json'), 'utf8'));
  assert.equal(typeof meta.toolUseId, 'string');
  assert.equal(typeof meta.agentType, 'string');
});

test('torn/ fixture: earlier lines parse, last (truncated) line fails JSON.parse', () => {
  const raw = readFileSync(F('torn', 'agent-torn.jsonl'), 'utf8');
  const physical = raw.split('\n').filter((l) => l.length > 0);
  let good = 0, bad = 0;
  for (const l of physical) {
    try { JSON.parse(l); good++; } catch { bad++; }
  }
  assert.equal(good, 3, 'expected exactly 3 well-formed lines');
  assert.equal(bad, 1, 'expected exactly 1 truncated trailing line');
  // multi-byte UTF-8 present (byte-vs-char tailing hazard)
  assert.match(raw, /café|→|☕/u);
  // the torn line has no trailing newline (a real torn write)
  assert.equal(raw.endsWith('\n'), false, 'torn fixture must end mid-line, no trailing newline');
});

test('durable-only/ both layouts present with NO transcript tier', () => {
  for (const layout of ['nested', 'flat']) {
    assert.ok(existsSync(F('durable-only', layout, 'activity.log')), `${layout}/activity.log`);
    assert.ok(existsSync(F('durable-only', layout, 'ledger.md')), `${layout}/ledger.md`);
    assert.ok(statSync(F('durable-only', layout, 'progress')).isDirectory(), `${layout}/progress/`);
    // no resolvable transcript tier
    assert.equal(existsSync(F('durable-only', layout, 'subagents')), false, `${layout} must have no subagents/`);
  }
  // nested carries the review/round-N subtree; flat does NOT (layout discriminator, P12)
  assert.ok(existsSync(F('durable-only', 'nested', 'review', 'round-1')), 'nested needs review/round-1');
  assert.ok(existsSync(F('durable-only', 'nested', 'review', 'round-2')), 'nested needs review/round-2');
  assert.equal(existsSync(F('durable-only', 'flat', 'review')), false, 'flat must have no review/');
  // concurrent same-role instances for the ×N collapse test
  for (const n of [1, 2, 3]) {
    assert.ok(existsSync(F('durable-only', 'nested', 'progress', `bn-finding-owner-${n}.md`)));
  }
});

test('cold-bridge/expected.json names a session dir that exists on disk', () => {
  const exp = JSON.parse(readFileSync(F('cold-bridge', 'expected.json'), 'utf8'));
  assert.equal(exp.runId, '2026-06-14-001-plan-bn-mock-skill');
  assert.equal(exp.expectedSessionId, 'b5bf91de-f038-4e03-b691-9cbbc703613a');
  // The answer key records the grounded F2 evidence the bridge must reproduce.
  assert.equal(exp.inWindowEvidence.transcriptsStartingInWindow, 7);
  assert.equal(exp.inWindowEvidence.harvesterInWindow, false);
  assert.equal(exp.inWindowEvidence.otherSessionsInWindowTranscripts, 0);
  // The named session dir exists on this machine (authoring-time ground truth).
  const projects = join(process.env.HOME, '.claude', 'projects', '-Users-riley-repos-banyan');
  const sess = join(projects, exp.expectedSessionId);
  if (existsSync(projects)) {
    assert.ok(existsSync(sess) || existsSync(`${sess}.jsonl`),
      'expected session dir or sibling root transcript on disk');
  }
});
