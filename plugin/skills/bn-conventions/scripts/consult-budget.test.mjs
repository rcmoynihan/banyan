import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CONFIG,
  buildAbortRecord,
  countNearDuplicateQuestions,
  evaluate,
  fingerprint,
  normalizeQuestion,
  similarity,
} from './consult-budget.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'consult-budget.mjs');

// --- Near-duplicate fingerprint (deterministic, LLM-free) -------------------

test('normalizeQuestion lowercases, strips punctuation, and drops filler words', () => {
  const tokens = normalizeQuestion('Should I use Postgres or, please, MySQL?');
  // 'should', 'i', 'or', 'please' are stop words; content tokens survive.
  assert.deepEqual(tokens, ['use', 'postgres', 'mysql']);
});

test('fingerprint is an order-free, deduplicated, sorted token set', () => {
  const a = fingerprint('Use Postgres or MySQL? Postgres?');
  const b = fingerprint('MySQL or Postgres -- which to use?');
  assert.deepEqual(a, b);
});

test('similarity of identical fingerprints is 1 and disjoint is 0', () => {
  assert.equal(similarity(['a', 'b'], ['a', 'b']), 1);
  assert.equal(similarity(['a', 'b'], ['c', 'd']), 0);
  // Two empty fingerprints (content-free re-asks) are maximally near-duplicate.
  assert.equal(similarity([], []), 1);
});

test('four reworded variants of one question count as 3 near-duplicate re-asks (AE6)', () => {
  const questions = [
    'Should I use the Postgres adapter or the MySQL adapter for the store?',
    'For the store, which adapter -- Postgres or MySQL -- should I pick?',
    'Again: do we want the Postgres adapter or the MySQL adapter for the store?',
    'Just to confirm, is it the MySQL adapter or the Postgres adapter for the store?',
  ];
  const count = countNearDuplicateQuestions(
    questions,
    DEFAULT_CONFIG.near_duplicate_similarity_threshold,
  );
  assert.equal(count, 3);
});

test('a genuinely different follow-up question is not a near-duplicate', () => {
  const questions = [
    'Should I use the Postgres adapter or the MySQL adapter for the store?',
    'What retry budget should the network client use on timeout?',
  ];
  assert.equal(
    countNearDuplicateQuestions(questions, DEFAULT_CONFIG.near_duplicate_similarity_threshold),
    0,
  );
});

// --- evaluate(): per-dimension caps -----------------------------------------

test('AE6: four near-duplicate re-asks with no diff progress trip the meter', () => {
  // The asker reworded the same goal/intent question four times while making no
  // measurable progress -- the canonical thrash case. Pass the raw question
  // history so the meter fingerprints it deterministically.
  const counters = {
    respawn_count: 4,
    cumulative_tokens: 50000,
    repeated_reread_count: 2,
    no_progress_diff_count: 3,
    questions: [
      'Should I use the Postgres adapter or the MySQL adapter for the store?',
      'For the store, which adapter -- Postgres or MySQL -- should I pick?',
      'Again: do we want the Postgres adapter or the MySQL adapter for the store?',
      'Just to confirm, is it the MySQL adapter or the Postgres adapter for the store?',
    ],
  };
  const result = evaluate(counters);
  assert.equal(result.trip, true);
  // no_progress_diff_count (cap 3) is checked before near_duplicate (cap 3) in
  // DIMENSIONS order, so it is the reported first-tripped dimension; either way a
  // no-progress / near-duplicate dimension trips, never a cost dimension.
  assert.ok(['no_progress_diff_count', 'near_duplicate_question_count'].includes(result.dimension));
  // The derived near-duplicate count is recorded for the abort record / audit.
  assert.equal(result.counters.near_duplicate_question_count, 3);
});

test('near-duplicate alone trips when no_progress is below its cap', () => {
  const counters = {
    no_progress_diff_count: 0,
    questions: [
      'Should I use the Postgres adapter or the MySQL adapter for the store?',
      'For the store, which adapter -- Postgres or MySQL -- should I pick?',
      'Again: do we want the Postgres adapter or the MySQL adapter for the store?',
      'Just to confirm, is it the MySQL adapter or the Postgres adapter for the store?',
    ],
  };
  const result = evaluate(counters);
  assert.equal(result.trip, true);
  assert.equal(result.dimension, 'near_duplicate_question_count');
  assert.equal(result.ceiling_hit, false);
});

test('an explicit near_duplicate_question_count counter overrides a question list', () => {
  const result = evaluate({ near_duplicate_question_count: 5, questions: [] });
  assert.equal(result.counters.near_duplicate_question_count, 5);
  assert.equal(result.dimension, 'near_duplicate_question_count');
});

test('an explicit count of 0 alongside a real history uses the larger derived count (fails toward tripping)', () => {
  // A caller that defaults near_duplicate_question_count to 0 while ALSO attaching
  // the raw thrash history must not silently disable the meter -- the derived
  // count wins when it is larger. (AE6 thrash: 4 reworders -> derived 3.)
  const counters = {
    near_duplicate_question_count: 0,
    questions: [
      'Should I use the Postgres adapter or the MySQL adapter for the store?',
      'For the store, which adapter -- Postgres or MySQL -- should I pick?',
      'Again: do we want the Postgres adapter or the MySQL adapter for the store?',
      'Just to confirm, is it the MySQL adapter or the Postgres adapter for the store?',
    ],
  };
  const result = evaluate(counters);
  assert.equal(result.counters.near_duplicate_question_count, 3);
  assert.equal(result.trip, true);
  assert.equal(result.dimension, 'near_duplicate_question_count');
});

test('an explicit count larger than the derived history is honored (max of the two)', () => {
  const result = evaluate({
    near_duplicate_question_count: 5,
    questions: ['only one question'],
  });
  assert.equal(result.counters.near_duplicate_question_count, 5);
});

test('a permissive config override cannot disable the breaker (caps clamp downward only)', () => {
  // A fully-thrashed unit with a wildly permissive config -- caps raised to
  // astronomically high values and the hard ceiling raised too -- must still trip.
  // The override is allowed to make the meter STRICTER, never looser.
  const fullyThrashed = {
    respawn_count: 1000,
    cumulative_tokens: 99_000_000,
    repeated_reread_count: 9999,
    no_progress_diff_count: 9999,
    near_duplicate_question_count: 9999,
    transcript_ancestry_depth: 9999,
    total_transcript_bytes: 99_000_000,
  };
  const permissive = {
    caps: {
      respawn_count: 1e9,
      cumulative_tokens: 1e12,
      repeated_reread_count: 1e9,
      no_progress_diff_count: 1e9,
      near_duplicate_question_count: 1e9,
      transcript_ancestry_depth: 1e9,
      total_transcript_bytes: 1e12,
    },
    hard_ceiling: 1e9,
  };
  const result = evaluate(fullyThrashed, permissive);
  assert.equal(result.trip, true);
});

test('a config override may LOWER a cap to trip earlier', () => {
  // Lowering respawn_count's cap to 2 must let respawn_count:2 trip even though
  // the default cap is 6 -- stricter overrides are honored.
  const result = evaluate({ respawn_count: 2 }, { caps: { respawn_count: 2 } });
  assert.equal(result.trip, true);
  assert.equal(result.dimension, 'respawn_count');
});

test('respawn count over its cap trips on the respawn dimension', () => {
  const result = evaluate({ respawn_count: DEFAULT_CONFIG.caps.respawn_count });
  assert.equal(result.trip, true);
  assert.equal(result.dimension, 'respawn_count');
});

test('the R22 ancestry-depth and total-bytes caps are independent dimensions', () => {
  const depth = evaluate({ transcript_ancestry_depth: DEFAULT_CONFIG.caps.transcript_ancestry_depth });
  assert.equal(depth.dimension, 'transcript_ancestry_depth');
  const bytes = evaluate({ total_transcript_bytes: DEFAULT_CONFIG.caps.total_transcript_bytes });
  assert.equal(bytes.dimension, 'total_transcript_bytes');
});

// --- evaluate(): the absolute hard ceiling ----------------------------------

test('the absolute ceiling trips regardless of dimension when all axes grind at once', () => {
  // Every dimension is held JUST below its own cap, so no single-dimension check
  // fires -- but the composite weighted score crosses the hard ceiling, so the
  // unit still aborts. This is the unconditional backstop (R21).
  const caps = DEFAULT_CONFIG.caps;
  const counters = {
    respawn_count: caps.respawn_count - 1,
    cumulative_tokens: caps.cumulative_tokens - 1,
    repeated_reread_count: caps.repeated_reread_count - 1,
    no_progress_diff_count: caps.no_progress_diff_count - 1,
    near_duplicate_question_count: caps.near_duplicate_question_count - 1,
    transcript_ancestry_depth: caps.transcript_ancestry_depth - 1,
    total_transcript_bytes: caps.total_transcript_bytes - 1,
  };
  const result = evaluate(counters);
  assert.equal(result.trip, true);
  assert.equal(result.ceiling_hit, true);
  assert.equal(result.dimension, 'hard_ceiling');
});

test('the ceiling fires independent of which dimension carries the cost', () => {
  // Push the composite score over the ceiling using a single cheap dial set high
  // via config, proving the ceiling is dimension-agnostic. Cumulative tokens at
  // 3x its cap with weight 1 contributes a fill of 3; combine with reread fill to
  // cross the ceiling of 4 without any single dimension >= its own cap... here we
  // instead confirm the ceiling can fire below all caps via a lowered ceiling.
  const result = evaluate(
    { cumulative_tokens: DEFAULT_CONFIG.caps.cumulative_tokens / 2 },
    { hard_ceiling: 0.5 },
  );
  assert.equal(result.ceiling_hit, true);
  assert.equal(result.trip, true);
});

// --- evaluate(): the healthy unit -------------------------------------------

test('a healthy unit does not trip', () => {
  const counters = {
    respawn_count: 1,
    cumulative_tokens: 12000,
    repeated_reread_count: 1,
    no_progress_diff_count: 0,
    transcript_ancestry_depth: 2,
    total_transcript_bytes: 40000,
    questions: [
      'Should I use the Postgres adapter or the MySQL adapter for the store?',
      'What retry budget should the network client use on timeout?',
    ],
  };
  const result = evaluate(counters);
  assert.equal(result.trip, false);
  assert.equal(result.dimension, null);
  assert.equal(result.ceiling_hit, false);
  assert.ok(result.score < DEFAULT_CONFIG.hard_ceiling);
});

test('empty/absent counters never trip (no false positive on a fresh unit)', () => {
  const result = evaluate({});
  assert.equal(result.trip, false);
  assert.equal(result.dimension, null);
  assert.equal(result.ceiling_hit, false);
});

test('the meter is independent of max_children / depth_remaining (R22)', () => {
  // Spawn-budget fields are not dimensions: passing them must not influence the
  // verdict. A unit with zero spawn budget but quiet counters does not trip here.
  const result = evaluate({ max_children: 0, depth_remaining: 0, respawn_count: 1 });
  assert.equal(result.trip, false);
});

// --- fail-safe on malformed counters (the ceiling must not fail open) -------

test('a non-finite counter fails safe: it coerces to 0, never poisons the ceiling', () => {
  // An out-of-contract NaN/Infinity must not turn the composite score into NaN and
  // silently defeat the absolute backstop. Hold every other dimension just below
  // its cap (which alone would trip the ceiling) and inject NaN into the
  // near-duplicate counter -- the ceiling must still fire.
  const caps = DEFAULT_CONFIG.caps;
  const result = evaluate({
    respawn_count: caps.respawn_count - 1,
    cumulative_tokens: caps.cumulative_tokens - 1,
    repeated_reread_count: caps.repeated_reread_count - 1,
    no_progress_diff_count: caps.no_progress_diff_count - 1,
    near_duplicate_question_count: NaN,
    transcript_ancestry_depth: caps.transcript_ancestry_depth - 1,
    total_transcript_bytes: caps.total_transcript_bytes - 1,
  });
  assert.equal(Number.isFinite(result.score), true);
  assert.equal(result.counters.near_duplicate_question_count, 0);
  assert.equal(result.ceiling_hit, true);
  assert.equal(result.trip, true);
});

test('a negative counter is treated as 0 rather than reducing the composite score', () => {
  const result = evaluate({ respawn_count: -100, cumulative_tokens: -5 });
  assert.equal(result.counters.respawn_count, 0);
  assert.equal(result.counters.cumulative_tokens, 0);
  assert.equal(result.trip, false);
  assert.ok(result.score >= 0);
});

// --- buildAbortRecord(): reconstructable abort record -----------------------

test('buildAbortRecord captures the tripped dimension, counters, and reason', () => {
  const result = evaluate({ respawn_count: DEFAULT_CONFIG.caps.respawn_count });
  const record = buildAbortRecord('u5-logical-1', result, {
    last_progress_ref: 'consults/chains/u5-logical-1.json',
  });
  assert.equal(record.logical_unit, 'u5-logical-1');
  assert.equal(record.tripped_dimension, 'respawn_count');
  assert.equal(record.ceiling_hit, false);
  assert.equal(record.counter_values.respawn_count, DEFAULT_CONFIG.caps.respawn_count);
  assert.equal(record.last_progress_ref, 'consults/chains/u5-logical-1.json');
  assert.match(record.reason, /respawn_count/);
});

test('buildAbortRecord names the ceiling backstop when only the ceiling fired', () => {
  const caps = DEFAULT_CONFIG.caps;
  const result = evaluate({
    respawn_count: caps.respawn_count - 1,
    cumulative_tokens: caps.cumulative_tokens - 1,
    repeated_reread_count: caps.repeated_reread_count - 1,
    no_progress_diff_count: caps.no_progress_diff_count - 1,
    near_duplicate_question_count: caps.near_duplicate_question_count - 1,
    transcript_ancestry_depth: caps.transcript_ancestry_depth - 1,
    total_transcript_bytes: caps.total_transcript_bytes - 1,
  });
  const record = buildAbortRecord('u5-logical-2', result);
  assert.equal(record.tripped_dimension, 'hard_ceiling');
  assert.match(record.reason, /ceiling/);
});

// --- determinism ------------------------------------------------------------

test('evaluate is deterministic: same input yields the same verdict', () => {
  const counters = {
    respawn_count: 3,
    cumulative_tokens: 90000,
    questions: ['use postgres or mysql', 'postgres or mysql to use'],
  };
  const first = evaluate(counters);
  const second = evaluate(counters);
  assert.deepEqual(first, second);
});

// --- CLI --------------------------------------------------------------------

function runCli(args, stdin) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    input: stdin,
  });
}

test('CLI evaluate reads counters from stdin and prints the verdict', () => {
  const counters = JSON.stringify({ respawn_count: DEFAULT_CONFIG.caps.respawn_count });
  const result = runCli(['evaluate', '--counters', '-'], counters);
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.trip, true);
  assert.equal(parsed.dimension, 'respawn_count');
});

test('CLI duplicates fingerprints a question list', () => {
  const questions = JSON.stringify([
    'Should I use the Postgres adapter or the MySQL adapter for the store?',
    'For the store, which adapter -- Postgres or MySQL -- should I pick?',
    'Again: do we want the Postgres adapter or the MySQL adapter for the store?',
    'Just to confirm, is it the MySQL adapter or the Postgres adapter for the store?',
  ]);
  const result = runCli(['duplicates', '--questions', '-'], questions);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).near_duplicate_question_count, 3);
});

test('CLI exits 2 on an unknown subcommand', () => {
  const result = runCli(['frobnicate'], '');
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});
