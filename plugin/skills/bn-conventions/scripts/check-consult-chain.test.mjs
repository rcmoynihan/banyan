import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { check, checkRun, loadRun, FINDING } from './check-consult-chain.mjs';

const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'check-consult-chain.mjs');

const HEX = 'a'.repeat(64);

function pointer(overrides = {}) {
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

function ask(overrides = {}) {
  return {
    ask_id: 'ask-1',
    asker_agent_id: 'agent-abc',
    logical_unit: 'U-1',
    question: 'q?',
    recommendation: 'r',
    alternatives: [],
    evidence: [{ file_or_tool: 'src/x.ts', ref: 'L1', claim: 'c' }],
    classification_proof: 'goal/intent because it changes the deliverable',
    would_change: 'new evidence',
    kind: 'goal-intent',
    transcript_pointer: pointer(),
    created_at: '2026-06-13T10:00:00Z',
    ...overrides,
  };
}

function answer(overrides = {}) {
  return {
    answer_id: 'ans-1',
    ask_id: 'ask-1',
    goal_restatement: 'goal restated',
    answer: 'do X',
    basis: 'answered-from-ask',
    decision_owner: 'bn-research-lead',
    scope: 'subtree-wide',
    disposition: 'answered',
    answered_at: '2026-06-13T10:05:00Z',
    ...overrides,
  };
}

function chain(overrides = {}) {
  return {
    logical_unit: 'U-1',
    entries: [
      {
        physical_agent_id: 'agent-abc',
        input_ask_id: 'ask-1',
        produced_artifact: 'consults/asks/ask-1.json',
        files_touched: [],
        transcript_pointer: pointer(),
        outcome: 'asked',
      },
      {
        physical_agent_id: 'agent-def',
        predecessor_agent_id: 'agent-abc',
        acted_on_answer_id: 'ans-1',
        produced_artifact: 'briefs/brief.md',
        files_touched: ['briefs/brief.md'],
        transcript_pointer: pointer({ agent_id: 'agent-def' }),
        outcome: 'completed',
      },
    ],
    ...overrides,
  };
}

// --- happy path ------------------------------------------------------------

test('a complete chain passes', () => {
  const result = check(chain(), { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

test('check accepts asks/answers as object maps too', () => {
  const result = check(chain(), {
    asks: { 'ask-1': ask() },
    answers: { 'ans-1': answer() },
  });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
});

// --- continuation missing its answer-id link (R23/AE4) ---------------------

test('a continuation missing its answer-id link is flagged', () => {
  const c = chain();
  delete c.entries[1].acted_on_answer_id;
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some(
      (f) => f.code === FINDING.CONTINUATION_MISSING_ANSWER && f.where === '$.entries[1]',
    ),
    JSON.stringify(result.findings),
  );
});

test('a continuation acting on an unknown answer is flagged (dangling answer)', () => {
  const c = chain();
  c.entries[1].acted_on_answer_id = 'ans-does-not-exist';
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.ANSWER_DANGLING));
});

test("an answer whose ask does not resolve is flagged (answer->ask dangling)", () => {
  // The answer points at an ask_id that is not in the run's asks.
  const result = check(chain(), {
    asks: [ask()],
    answers: [answer({ ask_id: 'ask-missing' })],
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.ANSWER_ASK_DANGLING));
});

// --- dangling / malformed pointer (AE4) ------------------------------------

test('a dangling (malformed) transcript_pointer is flagged via chain shape', () => {
  const c = chain();
  c.entries[1].transcript_pointer = pointer({ file_hash: 'not-a-hash' });
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(
    result.findings.some(
      (f) =>
        f.code === FINDING.CHAIN_INVALID &&
        f.detail.some((e) => /transcript_pointer\.file_hash/.test(e.path)),
    ),
    JSON.stringify(result.findings),
  );
});

// --- predecessor link integrity --------------------------------------------

test('a predecessor naming no earlier entry is flagged', () => {
  const c = chain();
  c.entries[1].predecessor_agent_id = 'agent-ghost';
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.PREDECESSOR_DANGLING));
});

test('the first entry naming a predecessor is flagged', () => {
  const c = chain();
  c.entries[0].predecessor_agent_id = 'agent-abc';
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.PREDECESSOR_ON_ROOT));
});

test('a forward predecessor reference (names a later entry) is flagged', () => {
  // entry 0 must not point at entry 1; only earlier ids resolve.
  const c = chain();
  // Make entry 0 a continuation pointing forward — also needs an answer to avoid
  // a separate finding masking the predecessor one; assert the predecessor finding.
  c.entries[0].predecessor_agent_id = 'agent-def';
  c.entries[0].acted_on_answer_id = 'ans-1';
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.PREDECESSOR_DANGLING && f.where === '$.entries[0]'));
});

test('a duplicate physical_agent_id is flagged', () => {
  const c = chain();
  c.entries[1].physical_agent_id = 'agent-abc';
  c.entries[1].predecessor_agent_id = 'agent-abc';
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.DUPLICATE_AGENT_ID));
});

test('an input_ask_id that resolves to no ask is flagged', () => {
  const c = chain();
  c.entries[0].input_ask_id = 'ask-missing';
  const result = check(c, { asks: [ask()], answers: [answer()] });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === FINDING.INPUT_ASK_DANGLING));
});

// --- filesystem round-trip (loadRun / checkRun) ----------------------------

test('checkRun reconstructs and checks chains from a run dir on disk', (t) => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-chain-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));

  for (const sub of ['consults/asks', 'consults/answers', 'consults/chains']) {
    fs.mkdirSync(path.join(runDir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(runDir, 'consults/asks/ask-1.json'), JSON.stringify(ask()));
  fs.writeFileSync(path.join(runDir, 'consults/answers/ans-1.json'), JSON.stringify(answer()));
  fs.writeFileSync(path.join(runDir, 'consults/chains/U-1.json'), JSON.stringify(chain()));

  const loaded = loadRun(runDir);
  assert.equal(loaded.asks.length, 1);
  assert.equal(loaded.answers.length, 1);
  assert.equal(loaded.chains.length, 1);

  const result = checkRun(runDir);
  assert.equal(result.ok, true, JSON.stringify(result.results));
  assert.equal(result.results[0].logical_unit, 'U-1');
});

test('checkRun on a run dir with no consults dir returns ok with no chains', (t) => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-chain-empty-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  const result = checkRun(runDir);
  assert.equal(result.ok, true);
  assert.deepEqual(result.results, []);
});

// --- CLI exit codes (0 ok / 1 findings / 2 usage) --------------------------

function seedRun(t, { withAnswer }) {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-chain-cli-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  for (const sub of ['consults/asks', 'consults/answers', 'consults/chains']) {
    fs.mkdirSync(path.join(runDir, sub), { recursive: true });
  }
  fs.writeFileSync(path.join(runDir, 'consults/asks/ask-1.json'), JSON.stringify(ask()));
  if (withAnswer) {
    fs.writeFileSync(path.join(runDir, 'consults/answers/ans-1.json'), JSON.stringify(answer()));
  }
  fs.writeFileSync(path.join(runDir, 'consults/chains/U-1.json'), JSON.stringify(chain()));
  return runDir;
}

test('CLI exits 0 when all chains reconstruct', (t) => {
  const runDir = seedRun(t, { withAnswer: true });
  const r = spawnSync(process.execPath, [SCRIPT_PATH, '--run', runDir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('CLI exits 1 when a chain has a dangling link', (t) => {
  const runDir = seedRun(t, { withAnswer: false });
  const r = spawnSync(process.execPath, [SCRIPT_PATH, '--run', runDir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
});

test('CLI exits 2 on a usage error (no --run)', () => {
  const r = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});

test('checkRun surfaces a broken on-disk chain', (t) => {
  const runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-chain-bad-'));
  t.after(() => fs.rmSync(runDir, { recursive: true, force: true }));
  for (const sub of ['consults/asks', 'consults/answers', 'consults/chains']) {
    fs.mkdirSync(path.join(runDir, sub), { recursive: true });
  }
  // A chain whose continuation acts on an answer that was never written to disk.
  fs.writeFileSync(path.join(runDir, 'consults/asks/ask-1.json'), JSON.stringify(ask()));
  fs.writeFileSync(path.join(runDir, 'consults/chains/U-1.json'), JSON.stringify(chain()));

  const result = checkRun(runDir);
  assert.equal(result.ok, false);
  assert.ok(result.results[0].findings.some((f) => f.code === FINDING.ANSWER_DANGLING));
});
