import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { rollUp, rollUpRunDir } from './consult-metrics.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'consult-metrics.mjs');

// --- fixtures ---------------------------------------------------------------

function ask(id, lu, recommendation, question, extra = {}) {
  return {
    ask_id: id,
    asker_agent_id: `agent-${id}`,
    logical_unit: lu,
    question,
    recommendation,
    alternatives: [],
    evidence: [],
    classification_proof: 'goal/intent',
    would_change: 'new evidence',
    kind: 'goal-intent',
    created_at: '2026-06-13T00:00:00.000Z',
    ...extra,
  };
}

function answer(id, askId, answerText, basis, scope, disposition, answeredAt) {
  return {
    answer_id: id,
    ask_id: askId,
    goal_restatement: 'restated',
    answer: answerText,
    basis,
    decision_owner: 'lead',
    scope,
    disposition,
    answered_at: answeredAt || '2026-06-13T00:00:05.000Z',
  };
}

function chain(lu, entries) {
  return { logical_unit: lu, entries };
}

// A run with one rubber-stamp consult: answer == recommendation, basis answered-from-ask.
function rubberStampRun() {
  return {
    asks: [ask('a1', 'U-rs', 'use option A', 'which option?')],
    answers: [answer('ans1', 'a1', 'use option A', 'answered-from-ask', 'subtree-wide', 'answered')],
    chains: [chain('U-rs', [{ physical_agent_id: 'p1', acted_on_answer_id: 'ans1', outcome: 'answered-absorbed' }])],
    aborts: [],
  };
}

// --- direct (rollUp) tests --------------------------------------------------

test('rubber-stamp consult: no decision change, no fetch, fresh witness', () => {
  const s = rollUp(rubberStampRun());
  assert.equal(s.total_consults, 1);
  assert.equal(s.share_decision_changed, 0);
  assert.equal(s.share_external_fetch, 0);
  assert.equal(s.fresh_witness_count, 1);
  assert.equal(s.fresh_amnesia_count, 0);
});

test('decision-changed: answer differs from recommendation', () => {
  const run = {
    asks: [ask('a1', 'U1', 'use option A', 'which option?')],
    answers: [answer('ans1', 'a1', 'use option B', 'answered-from-ask', 'subtree-wide', 'answered')],
    chains: [chain('U1', [{ physical_agent_id: 'p1', acted_on_answer_id: 'ans1', outcome: 'answered-absorbed' }])],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.share_decision_changed, 1);
  assert.equal(s.per_unit[0].decision_changed, true);
});

test('external fetch: basis after-web / after-reading-code counts', () => {
  const run = {
    asks: [ask('a1', 'U1', 'x', 'q'), ask('a2', 'U2', 'y', 'q2')],
    answers: [
      answer('ans1', 'a1', 'x', 'after-web', 'run-wide', 'answered'),
      answer('ans2', 'a2', 'y', 'answered-from-ask', 'local', 'answered'),
    ],
    chains: [],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.share_external_fetch, 0.5);
});

test('contradiction caught: pushed-back then revised (not reaffirmed)', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q'), ask('pb1', 'U1', 'A', 'q-pushback', {})],
    answers: [
      answer('ans1', 'a1', 'A', 'answered-from-ask', 'local', 'answered'),
      // the push-back ask pb1 gets a REVISED answer (disposition answered, not reaffirmed)
      answer('ans2', 'pb1', 'B', 'after-reading-code', 'local', 'answered'),
    ],
    chains: [
      chain('U1', [
        { physical_agent_id: 'p1', input_ask_id: 'pb1', acted_on_answer_id: 'ans2', outcome: 'pushed-back' },
      ]),
    ],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.share_contradiction_caught, 1);
});

test('reaffirmed push-back is NOT a contradiction caught', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q'), ask('pb1', 'U1', 'A', 'q-pushback')],
    answers: [
      answer('ans1', 'a1', 'A', 'answered-from-ask', 'local', 'answered'),
      answer('ans2', 'pb1', 'A', 'answered-from-ask', 'local', 'reaffirmed'),
    ],
    chains: [
      chain('U1', [
        { physical_agent_id: 'p1', input_ask_id: 'pb1', acted_on_answer_id: 'ans2', outcome: 'pushed-back' },
      ]),
    ],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.share_contradiction_caught, 0);
});

test('reopened settled decision: two entries acting on the same answer id', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q')],
    answers: [answer('ans1', 'a1', 'A', 'answered-from-ask', 'local', 'answered')],
    chains: [
      chain('U1', [
        { physical_agent_id: 'p1', acted_on_answer_id: 'ans1', outcome: 'answered-absorbed' },
        { physical_agent_id: 'p2', acted_on_answer_id: 'ans1', outcome: 'answered-absorbed' },
      ]),
    ],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.per_unit[0].reopened_settled_decision, true);
  assert.equal(s.fresh_amnesia_count, 1);
  assert.equal(s.fresh_witness_count, 0);
});

test('repeated predecessor exploration from a no-progress abort', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q')],
    answers: [answer('ans1', 'a1', 'A', 'answered-from-ask', 'local', 'answered')],
    chains: [],
    aborts: [{ logical_unit: 'U1', tripped_dimension: 'no-progress', counter_values: { cumulative_tokens: 4200 } }],
  };
  const s = rollUp(run);
  assert.equal(s.per_unit[0].repeated_predecessor_exploration, true);
  assert.equal(s.fresh_amnesia_count, 1);
  assert.equal(s.total_consult_tokens, 4200);
});

test('human interruption: human-level scope', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q')],
    answers: [answer('ans1', 'a1', 'A', 'assumed', 'human-level', 'escalated')],
    chains: [],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.human_interruption_count, 1);
});

test('latency is last answered_at minus first ask created_at', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q', { created_at: '2026-06-13T00:00:00.000Z' })],
    answers: [answer('ans1', 'a1', 'A', 'answered-from-ask', 'local', 'answered', '2026-06-13T00:00:12.000Z')],
    chains: [],
    aborts: [],
  };
  const s = rollUp(run);
  assert.equal(s.per_unit[0].consult_latency_ms, 12000);
});

test('token budget overrun flag', () => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q')],
    answers: [answer('ans1', 'a1', 'A', 'answered-from-ask', 'local', 'answered')],
    chains: [chain('U1', [{ physical_agent_id: 'p1', acted_on_answer_id: 'ans1', outcome: 'answered-absorbed', consult_tokens: 5000 }])],
    aborts: [],
  };
  const over = rollUp(run, { budgetTokens: 1000 });
  assert.equal(over.token_budget_overrun, true);
  assert.equal(over.total_consult_tokens, 5000);
  const under = rollUp(run, { budgetTokens: 100000 });
  assert.equal(under.token_budget_overrun, false);
});

test('empty run is all zeros, not a crash', () => {
  const s = rollUp({ asks: [], answers: [], chains: [], aborts: [] });
  assert.equal(s.total_consults, 0);
  assert.equal(s.share_decision_changed, 0);
  assert.equal(s.human_interruption_count, 0);
});

// --- on-disk (rollUpRunDir) test --------------------------------------------

function seedRunDir(t, run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-metrics-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const consults = path.join(root, 'consults');
  for (const fam of ['asks', 'answers', 'chains', 'aborts', 'metrics']) {
    fs.mkdirSync(path.join(consults, fam), { recursive: true });
  }
  run.asks.forEach((a, i) => fs.writeFileSync(path.join(consults, 'asks', `ask-${i}.json`), JSON.stringify(a)));
  run.answers.forEach((a, i) => fs.writeFileSync(path.join(consults, 'answers', `ans-${i}.json`), JSON.stringify(a)));
  run.chains.forEach((c, i) => fs.writeFileSync(path.join(consults, 'chains', `chain-${i}.json`), JSON.stringify(c)));
  run.aborts.forEach((a, i) => fs.writeFileSync(path.join(consults, 'aborts', `abort-${i}.json`), JSON.stringify(a)));
  return root;
}

test('rollUpRunDir reads crafted artifacts from disk', (t) => {
  const run = {
    asks: [ask('a1', 'U1', 'A', 'q')],
    answers: [answer('ans1', 'a1', 'B', 'after-web', 'subtree-wide', 'answered')],
    chains: [chain('U1', [{ physical_agent_id: 'p1', acted_on_answer_id: 'ans1', outcome: 'answered-absorbed' }])],
    aborts: [],
  };
  const root = seedRunDir(t, run);
  const s = rollUpRunDir(root);
  assert.equal(s.total_consults, 1);
  assert.equal(s.share_decision_changed, 1);
  assert.equal(s.share_external_fetch, 1);
});

test('rollUpRunDir on a missing consults dir degrades to empty', (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-metrics-empty-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const s = rollUpRunDir(root);
  assert.equal(s.total_consults, 0);
});

// --- CLI test ---------------------------------------------------------------

test('CLI emits a JSON summary and exits 0', (t) => {
  const run = rubberStampRun();
  const root = seedRunDir(t, run);
  const res = spawnSync(process.execPath, [SCRIPT_PATH, '--run-dir', root], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  const out = JSON.parse(res.stdout);
  assert.equal(out.total_consults, 1);
});

test('CLI rejects a missing --run-dir with exit 2', () => {
  const res = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(res.status, 2);
});
