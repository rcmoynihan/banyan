import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  validateAsk,
  validateAnswer,
  validateChain,
  validateAgainst,
} from './validate-consult-artifacts.mjs';

const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-consult-artifacts.mjs');

// A SHA-256-hex (64 lowercase hex chars) satisfying the transcript-pointer
// project_root_hash / file_hash patterns.
const HEX = 'a'.repeat(64);

function validPointer(overrides = {}) {
  return {
    agent_id: 'agent-abc',
    session_id: 'sess-1',
    project_root_hash: HEX,
    spawn_timestamp: '2026-06-13T10:00:00Z',
    file_hash: HEX,
    byte_size: 1024,
    ...overrides,
  };
}

function validAsk(overrides = {}) {
  return {
    ask_id: 'ask-1',
    asker_agent_id: 'agent-abc',
    logical_unit: 'U-research-auth',
    question: 'Should the brief cover the deprecated v1 auth path?',
    recommendation: 'Cover it briefly — it is still wired in.',
    alternatives: ['Omit v1 entirely', 'Cover v1 in full depth'],
    evidence: [
      { file_or_tool: 'src/auth/v1.ts', ref: 'L1-40', claim: 'v1 path is still imported by the router' },
    ],
    classification_proof:
      'This is a scope/intent question about what the brief should include, not how to write a paragraph — it changes the deliverable, so it is goal/intent.',
    would_change: 'If v1 were behind a disabled feature flag, I would omit it.',
    kind: 'goal-intent',
    transcript_pointer: validPointer(),
    created_at: '2026-06-13T10:00:00Z',
    ...overrides,
  };
}

function validAnswer(overrides = {}) {
  return {
    answer_id: 'ans-1',
    ask_id: 'ask-1',
    goal_restatement: 'The goal is a brief that maps the live auth wiring for the planner.',
    answer: 'Yes — cover v1 briefly; the planner needs to know it is still live.',
    basis: 'answered-from-ask',
    decision_owner: 'bn-research-lead',
    scope: 'subtree-wide',
    disposition: 'answered',
    answered_at: '2026-06-13T10:05:00Z',
    ...overrides,
  };
}

function validChain(overrides = {}) {
  return {
    logical_unit: 'U-research-auth',
    entries: [
      {
        physical_agent_id: 'agent-abc',
        input_ask_id: 'ask-1',
        produced_artifact: 'consults/asks/ask-1.json',
        files_touched: [],
        transcript_pointer: validPointer(),
        outcome: 'asked',
      },
      {
        physical_agent_id: 'agent-def',
        predecessor_agent_id: 'agent-abc',
        acted_on_answer_id: 'ans-1',
        produced_artifact: 'briefs/repo-auth-middleware.md',
        files_touched: ['briefs/repo-auth-middleware.md'],
        transcript_pointer: validPointer({ agent_id: 'agent-def' }),
        outcome: 'completed',
      },
    ],
    ...overrides,
  };
}

// --- ask -------------------------------------------------------------------

test('a complete ask validates', () => {
  const result = validateAsk(validAsk());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('an ask missing classification_proof fails (AE2)', () => {
  const ask = validAsk();
  delete ask.classification_proof;
  const result = validateAsk(ask);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.classification_proof' && /missing required/.test(e.reason)),
    JSON.stringify(result.errors),
  );
});

test('an ask with an empty evidence array fails minItems (thin ask, R14)', () => {
  const result = validateAsk(validAsk({ evidence: [] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.evidence' && /minItems/.test(e.reason)));
});

test('an ask evidence line missing a ref fails', () => {
  const result = validateAsk(
    validAsk({ evidence: [{ file_or_tool: 'src/x.ts', claim: 'x' }] }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.evidence[0].ref' && /missing required/.test(e.reason)));
});

test('an ask with a bad kind enum fails', () => {
  const result = validateAsk(validAsk({ kind: 'question' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.kind' && /enum/.test(e.reason)));
});

test('an ask with an additional property fails (additionalProperties:false)', () => {
  const result = validateAsk(validAsk({ urgency: 'high' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.urgency' && /additional property/.test(e.reason)));
});

test('an ask whose transcript_pointer has a bad file_hash fails (nested $ref)', () => {
  const result = validateAsk(validAsk({ transcript_pointer: validPointer({ file_hash: 'nothex' }) }));
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.transcript_pointer.file_hash' && /pattern/.test(e.reason)),
    JSON.stringify(result.errors),
  );
});

test('an ask whose transcript_pointer is missing a required field fails (nested $ref required)', () => {
  const pointer = validPointer();
  delete pointer.byte_size;
  const result = validateAsk(validAsk({ transcript_pointer: pointer }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.transcript_pointer.byte_size' && /missing required/.test(e.reason)));
});

test('an ask with a non-ISO created_at fails date-time', () => {
  const result = validateAsk(validAsk({ created_at: 'last tuesday' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.created_at' && /date-time/.test(e.reason)));
});

// --- answer ----------------------------------------------------------------

test('a complete answer validates', () => {
  const result = validateAnswer(validAnswer());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('an answer without basis fails (R24)', () => {
  const answer = validAnswer();
  delete answer.basis;
  const result = validateAnswer(answer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.basis' && /missing required/.test(e.reason)));
});

test('an answer without scope fails (R24)', () => {
  const answer = validAnswer();
  delete answer.scope;
  const result = validateAnswer(answer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.scope' && /missing required/.test(e.reason)));
});

test('an answer without goal_restatement fails (R8 goal-recheck)', () => {
  const answer = validAnswer();
  delete answer.goal_restatement;
  const result = validateAnswer(answer);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.goal_restatement' && /missing required/.test(e.reason)));
});

test('an answer with a basis outside the enum fails', () => {
  const result = validateAnswer(validAnswer({ basis: 'after-reading-transcript' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.basis' && /enum/.test(e.reason)));
});

test('an answer with a scope outside the enum fails', () => {
  const result = validateAnswer(validAnswer({ scope: 'global' }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.scope' && /enum/.test(e.reason)));
});

test('a rejected-as-local disposition is valid (R14 reject path)', () => {
  const result = validateAnswer(validAnswer({ disposition: 'rejected-as-local' }));
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

// --- chain -----------------------------------------------------------------

test('a complete chain validates', () => {
  const result = validateChain(validChain());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a chain with an empty entries array fails minItems', () => {
  const result = validateChain(validChain({ entries: [] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.entries' && /minItems/.test(e.reason)));
});

test('a chain entry missing produced_artifact fails', () => {
  const chain = validChain();
  delete chain.entries[1].produced_artifact;
  const result = validateChain(chain);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.entries[1].produced_artifact' && /missing required/.test(e.reason)));
});

test('a chain entry with a bad outcome enum fails', () => {
  const chain = validChain();
  chain.entries[1].outcome = 'finished';
  const result = validateChain(chain);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.entries[1].outcome' && /enum/.test(e.reason)));
});

test('a chain entry with a malformed nested transcript_pointer fails', () => {
  const chain = validChain();
  chain.entries[0].transcript_pointer = validPointer({ project_root_hash: 'short' });
  const result = validateChain(chain);
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.entries[0].transcript_pointer.project_root_hash' && /pattern/.test(e.reason)),
  );
});

// --- top-level type + numeric-keyword coverage -----------------------------

test('a non-object top-level artifact fails (string)', () => {
  const result = validateAsk('not an object');
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$' && /expected type object/.test(e.reason)));
});

test('a non-object top-level artifact fails (array)', () => {
  const result = validateAnswer([]);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$' && /expected type object/.test(e.reason)));
});

test('a present-but-null required field is treated as missing', () => {
  // Deliberate divergence from strict draft-07: a null required field is invalid.
  const result = validateAnswer(validAnswer({ basis: null }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.basis' && /missing required/.test(e.reason)));
});

test('a negative byte_size fails minimum 0 (pointer integer minimum)', () => {
  const result = validateAsk(validAsk({ transcript_pointer: validPointer({ byte_size: -1 }) }));
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.transcript_pointer.byte_size' && /minimum/.test(e.reason)),
    JSON.stringify(result.errors),
  );
});

test('a fractional byte_size fails the integer type', () => {
  const result = validateAsk(validAsk({ transcript_pointer: validPointer({ byte_size: 1.5 }) }));
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.transcript_pointer.byte_size' && /expected type integer/.test(e.reason)),
    JSON.stringify(result.errors),
  );
});

// --- CLI exit codes (0 valid / 1 invalid / 2 usage) ------------------------

function runCli(args, t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-validate-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const resolved = args.map((a) => (a.startsWith('@') ? path.join(dir, a.slice(1)) : a));
  return { dir, resolved };
}

test('CLI exits 0 on a valid artifact', (t) => {
  const { dir, resolved } = runCli(['--ask', '@ask.json'], t);
  fs.writeFileSync(path.join(dir, 'ask.json'), JSON.stringify(validAsk()));
  const r = spawnSync(process.execPath, [SCRIPT_PATH, ...resolved], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('CLI exits 1 on an invalid artifact', (t) => {
  const { dir, resolved } = runCli(['--answer', '@answer.json'], t);
  const bad = validAnswer();
  delete bad.scope;
  fs.writeFileSync(path.join(dir, 'answer.json'), JSON.stringify(bad));
  const r = spawnSync(process.execPath, [SCRIPT_PATH, ...resolved], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});

test('CLI exits 2 on a usage error (no flag)', () => {
  const r = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

// --- dispatch --------------------------------------------------------------

test('validateAgainst rejects an unknown schema name', () => {
  assert.throws(() => validateAgainst({}, 'nope'), /unknown consult schema/);
});
