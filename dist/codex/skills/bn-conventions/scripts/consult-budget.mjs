#!/usr/bin/env node

// consult-budget.mjs -- deterministic per-logical-unit consult thrash/cost budget
// meter for the recursive consult-upward loop (plan U5; requirements R21/R22/R2).
//
// A "logical unit" is one chain of physical continuation children. The loop can
// thrash -- respawn endlessly, re-ask the same question in new words, re-read the
// same files, burn tokens without making progress. This meter is the deterministic
// circuit-breaker: given live counters and a config of dials, it reports whether
// the unit must abort to `blocked` (R2 rides the existing blocked path), which
// dimension tripped, and whether the absolute hard ceiling fired.
//
// Two backstops, both unconditional:
//   1. Per-dimension caps -- any single thrash/cost dimension over its cap trips.
//   2. An absolute hard ceiling on a composite cost score -- trips regardless of
//      which dimension, so a unit that stays just under every individual cap but
//      grinds on every axis at once still aborts.
//
// This meter is INDEPENDENT of the spawn budget (max_children / depth_remaining,
// R22): a unit can have spawn budget remaining and still be aborted here, and the
// transcript-ancestry depth and total transcript bytes are capped here separately.
//
// Determinism is the whole point (no LLM): the same counters + config always yield
// the same verdict, and near-duplicate-question detection is a pure normalized
// token-overlap fingerprint -- four reworded re-asks of the same question with no
// diff progress trip the meter (AE6).
//
// Usage (CLI):
//   evaluate:  consult-budget.mjs evaluate --counters <file.json> [--config <file.json>]
//   duplicates: consult-budget.mjs duplicates --questions <file.json> [--threshold 0.7]
// Each subcommand reads JSON from the named file (or '-' for stdin) and prints a
// JSON result to stdout. Bad usage exits 2; a successful evaluation exits 0.
//
// Zero dependencies: node:fs, node:process only.

import fs from 'node:fs';
import process from 'node:process';

// --- Default configuration --------------------------------------------------
// These are the documented constants the reference (consult-budget.md) fixes.
// The requirements doc defers the exact values to planning; they are settled here
// as the single source of truth and mirrored in the reference prose.

export const DEFAULT_CONFIG = Object.freeze({
  // Per-dimension caps. Reaching a cap (>=) trips that dimension on its own.
  caps: Object.freeze({
    // How many continuation respawns one logical unit may chain through.
    respawn_count: 6,
    // Cumulative model tokens spent across the whole logical-unit chain.
    cumulative_tokens: 400000,
    // How many times the same file is re-read across the chain (spinning).
    repeated_reread_count: 8,
    // Consecutive continuations that produced no measurable diff/progress.
    no_progress_diff_count: 3,
    // Near-duplicate reworded re-asks of an already-asked question.
    near_duplicate_question_count: 3,
    // R22: transcript-ancestry depth of the continuation chain.
    transcript_ancestry_depth: 8,
    // R22: total raw transcript bytes carried laterally across the chain.
    total_transcript_bytes: 8000000,
  }),

  // Composite cost score: each dimension's normalized fill (counter / cap) is
  // multiplied by a weight and summed. The absolute hard ceiling fires when the
  // weighted sum reaches `hard_ceiling`, regardless of any single dimension --
  // the unconditional backstop against grinding on every axis at once.
  weights: Object.freeze({
    respawn_count: 1,
    cumulative_tokens: 1,
    repeated_reread_count: 1,
    no_progress_diff_count: 1.5,
    near_duplicate_question_count: 1.5,
    transcript_ancestry_depth: 1,
    total_transcript_bytes: 1,
  }),

  // Absolute hard ceiling on the weighted composite score. Chosen below the sum
  // of weights so a unit pushing most dimensions near their caps trips even if no
  // single dimension has crossed. This is the backstop that cannot be reasoned
  // away by staying just under each individual cap.
  hard_ceiling: 4,

  // Near-duplicate fingerprint: two normalized questions are "near-duplicate" when
  // their token-overlap (Jaccard) similarity is >= this threshold. 0.6 captures
  // genuine reworders (which swap one or two filler/connective content words while
  // keeping the subject set) -- measured ~0.67 for four variants of one question --
  // while staying well above a genuinely different follow-up (~0.1).
  near_duplicate_similarity_threshold: 0.6,
});

// Dimensions evaluated against caps, in deterministic check order. The order fixes
// which dimension is reported first when several trip at once (stable verdicts).
export const DIMENSIONS = Object.freeze([
  'respawn_count',
  'cumulative_tokens',
  'repeated_reread_count',
  'no_progress_diff_count',
  'near_duplicate_question_count',
  'transcript_ancestry_depth',
  'total_transcript_bytes',
]);

// --- Question normalization + near-duplicate fingerprint --------------------

// Deterministic, LLM-free normalization: lowercase, strip punctuation, collapse
// whitespace, drop a small fixed stop-list of filler words that reworders swap in
// and out ("could you", "please", "again", etc.). The result is a stable token set
// used for the overlap fingerprint -- "Should I use X or Y?" and "Again, please
// tell me whether to use Y or X" normalize to overlapping token sets.
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'be', 'to', 'of', 'in', 'on', 'for',
  'and', 'or', 'do', 'i', 'we', 'you', 'should', 'could', 'would', 'can',
  'please', 'again', 'whether', 'what', 'which', 'this', 'that', 'it', 'me',
  'my', 'our', 'tell', 'let', 'know', 'just', 'so', 'now', 'still', 'really',
]);

export function normalizeQuestion(question) {
  if (typeof question !== 'string') return [];
  const tokens = question
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
  return tokens;
}

// A fingerprint is the sorted set of normalized tokens (deterministic, order-free).
export function fingerprint(question) {
  return [...new Set(normalizeQuestion(question))].sort();
}

// Jaccard similarity between two fingerprints: |intersection| / |union|.
// Two empty fingerprints are treated as identical (1.0) -- two content-free
// re-asks are maximally near-duplicate, which is the thrash we want to catch.
export function similarity(fpA, fpB) {
  const setA = new Set(fpA);
  const setB = new Set(fpB);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Count near-duplicate re-asks across an ordered list of questions. Each question
// (after the first) that is near-duplicate -- similarity >= threshold -- to ANY
// earlier question in the list counts once. The return is the number of
// near-duplicate re-asks, i.e. how many redundant re-asks happened. For the AE6
// case (four reworded variants of the same question), the count is 3 (the second,
// third, and fourth are each near-duplicate of the first).
export function countNearDuplicateQuestions(questions, threshold) {
  if (!Array.isArray(questions)) return 0;
  const limit = typeof threshold === 'number'
    ? threshold
    : DEFAULT_CONFIG.near_duplicate_similarity_threshold;
  const fingerprints = questions.map(fingerprint);
  let duplicates = 0;
  for (let i = 1; i < fingerprints.length; i++) {
    for (let j = 0; j < i; j++) {
      if (similarity(fingerprints[i], fingerprints[j]) >= limit) {
        duplicates++;
        break;
      }
    }
  }
  return duplicates;
}

// --- Counter derivation -----------------------------------------------------

// Resolve the live near_duplicate_question_count: prefer an explicit numeric
// counter, otherwise derive it deterministically from a `questions` list on the
// counters object. This lets a caller pass either a pre-counted number or the raw
// question history and have the meter fingerprint it.
function resolveNearDuplicateCount(counters, config) {
  const hasExplicit = typeof counters.near_duplicate_question_count === 'number';
  const hasHistory = Array.isArray(counters.questions);
  const explicit = hasExplicit ? sanitizeCounter(counters.near_duplicate_question_count) : 0;
  const derived = hasHistory
    ? countNearDuplicateQuestions(counters.questions, config.near_duplicate_similarity_threshold)
    : 0;
  // When BOTH an explicit count and a raw history are present, a circuit-breaker
  // must fail TOWARD tripping: take the larger so a caller that defaults the field
  // to 0 while attaching a real thrash history cannot silently disable the meter.
  if (hasExplicit && hasHistory) {
    return Math.max(explicit, derived);
  }
  if (hasExplicit) return explicit;
  if (hasHistory) return derived;
  return 0;
}

// A circuit-breaker must fail safe, not open: any non-finite or negative counter
// (out of the schema's `integer, minimum 0` contract) coerces to 0 rather than
// poisoning the composite score -- an unguarded NaN would make the whole weighted
// sum NaN and silently defeat the absolute hard ceiling (NaN >= ceiling is false).
function sanitizeCounter(raw) {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

function counterValue(dimension, counters, config) {
  if (dimension === 'near_duplicate_question_count') {
    return resolveNearDuplicateCount(counters, config);
  }
  return sanitizeCounter(counters[dimension]);
}

// Merge a partial user config over the defaults (shallow per nested object) so a
// caller can override just one cap or weight without restating the whole config.
//
// The backstop is "unconditional": a caller may make it STRICTER (lower a cap or
// the hard ceiling) but never LOOSER. Each merged cap is clamped to
// min(userCap, defaultCap) and the hard ceiling to min(userCeiling, default), so
// a permissive override cannot widen the meter into never tripping. A non-finite
// or non-positive override is rejected (falls back to the default) rather than
// poisoning the clamp.
function clampCap(userValue, defaultValue) {
  if (typeof userValue !== 'number' || !Number.isFinite(userValue) || userValue <= 0) {
    return defaultValue;
  }
  return Math.min(userValue, defaultValue);
}

function resolveConfig(config) {
  const base = DEFAULT_CONFIG;
  if (!config || typeof config !== 'object') return base;

  const userCaps = config.caps && typeof config.caps === 'object' ? config.caps : {};
  const caps = {};
  for (const dimension of DIMENSIONS) {
    caps[dimension] = clampCap(userCaps[dimension], base.caps[dimension]);
  }

  const userCeiling = config.hard_ceiling;
  const hardCeiling =
    typeof userCeiling === 'number' && Number.isFinite(userCeiling) && userCeiling >= 0
      ? Math.min(userCeiling, base.hard_ceiling)
      : base.hard_ceiling;

  return {
    caps,
    weights: { ...base.weights, ...(config.weights || {}) },
    hard_ceiling: hardCeiling,
    near_duplicate_similarity_threshold:
      typeof config.near_duplicate_similarity_threshold === 'number'
        ? config.near_duplicate_similarity_threshold
        : base.near_duplicate_similarity_threshold,
  };
}

// --- The meter --------------------------------------------------------------

// evaluate(counters, config) -> { trip, dimension, ceiling_hit, score, counters }
//
//   trip        : boolean -- abort this logical unit to `blocked` when true.
//   dimension   : the dimension that tripped, or 'hard_ceiling' when only the
//                 composite ceiling fired, or null when not tripped.
//   ceiling_hit : boolean -- the absolute composite ceiling fired (independent of
//                 any single dimension).
//   score       : the weighted composite score (for the abort record / audit).
//   counters    : the resolved per-dimension counter values (near-duplicate count
//                 is derived here if a question list was passed) -- the audit trail.
//
// Per-dimension caps are checked first in DIMENSIONS order (stable), so the
// reported `dimension` is deterministic when several trip together. The composite
// hard ceiling is always computed; if it fires it sets ceiling_hit and, when no
// single dimension tripped, reports dimension 'hard_ceiling'.
export function evaluate(counters, config) {
  const cfg = resolveConfig(config);
  const inputCounters = counters && typeof counters === 'object' ? counters : {};

  const resolved = {};
  for (const dimension of DIMENSIONS) {
    resolved[dimension] = counterValue(dimension, inputCounters, cfg);
  }

  // Per-dimension cap check (stable order).
  let dimensionTripped = null;
  for (const dimension of DIMENSIONS) {
    const cap = cfg.caps[dimension];
    if (typeof cap === 'number' && resolved[dimension] >= cap) {
      dimensionTripped = dimension;
      break;
    }
  }

  // Composite weighted score: sum of (normalized fill * weight) over dimensions.
  let score = 0;
  for (const dimension of DIMENSIONS) {
    const cap = cfg.caps[dimension];
    const weight = cfg.weights[dimension] ?? 0;
    if (typeof cap === 'number' && cap > 0) {
      score += (resolved[dimension] / cap) * weight;
    }
  }
  const roundedScore = Math.round(score * 1e6) / 1e6;
  const ceilingHit = roundedScore >= cfg.hard_ceiling;

  const trip = dimensionTripped !== null || ceilingHit;
  let dimension = dimensionTripped;
  if (dimension === null && ceilingHit) dimension = 'hard_ceiling';
  if (!trip) dimension = null;

  return {
    trip,
    dimension,
    ceiling_hit: ceilingHit,
    score: roundedScore,
    counters: resolved,
  };
}

// Build a reconstructable abort record (matches consult-budget.schema.json's
// abort_record) from an evaluation that tripped, for writing to consults/aborts/.
export function buildAbortRecord(logicalUnit, result, extra = {}) {
  return {
    logical_unit: logicalUnit,
    tripped_dimension: result.dimension,
    ceiling_hit: result.ceiling_hit,
    counter_values: result.counters,
    composite_score: result.score,
    last_progress_ref: extra.last_progress_ref ?? null,
    reason:
      extra.reason ??
      (result.ceiling_hit && result.dimension === 'hard_ceiling'
        ? 'absolute composite cost ceiling reached'
        : `dimension ${result.dimension} reached its cap`),
  };
}

// --- CLI --------------------------------------------------------------------

function fail(msg) {
  process.stderr.write(`consult-budget: ${msg}\n`);
  process.exit(2);
}

function readJsonArg(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1 || argv[index + 1] === undefined) {
    fail(`missing required ${flag} <file|->`);
  }
  const source = argv[index + 1];
  let text;
  try {
    text = source === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(source, 'utf8');
  } catch (err) {
    fail(`could not read ${flag} ${source}: ${err.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    fail(`invalid JSON for ${flag} ${source}: ${err.message}`);
  }
  return undefined;
}

function optionalNumberArg(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = Number(argv[index + 1]);
  if (!Number.isFinite(value)) fail(`${flag} requires a number`);
  return value;
}

function main(argv) {
  const command = argv[0];
  if (command === 'evaluate') {
    const counters = readJsonArg(argv, '--counters');
    const config = argv.includes('--config') ? readJsonArg(argv, '--config') : undefined;
    const result = evaluate(counters, config);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  } else if (command === 'duplicates') {
    const questions = readJsonArg(argv, '--questions');
    const threshold = optionalNumberArg(argv, '--threshold');
    const count = countNearDuplicateQuestions(questions, threshold);
    process.stdout.write(`${JSON.stringify({ near_duplicate_question_count: count }, null, 2)}\n`);
    process.exit(0);
  }
  fail('usage: consult-budget.mjs <evaluate|duplicates> ...');
}

// Run as CLI only when invoked directly, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
