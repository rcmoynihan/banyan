#!/usr/bin/env node
// consult-metrics.mjs -- per-run consult metric roll-up (U13 / R29).
//
// Reads a run's consults/ dir (asks, answers, chains, aborts) and emits a JSON
// run summary, deriving each Success-Criteria signal MECHANICALLY from the audit
// artifacts so the metrics can never diverge from the audit trail
// (reconstructable-from-disk, R23/R29). It reads ONLY the bounded consult
// artifacts -- never a transcript (DI1).
//
// Usage:
//   node consult-metrics.mjs --run-dir <path> [--budget-tokens <n>]
//
// The share-of-consults-that-changed-a-decision is a Success-Criteria signal,
// not a gate: a low share flags possible rubber-stamping but does not fail.
//
// Zero dependencies: node:fs, node:path, node:process only.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { loadRun as loadChainRun, readJsonDir } from './check-consult-chain.mjs';
import { countNearDuplicateQuestions } from './consult-budget.mjs';

function fail(msg) {
  process.stderr.write(`consult-metrics: ${msg}\n`);
  process.exit(2);
}

// --- artifact loading -------------------------------------------------------
//
// The asks/answers/chains readers are check-consult-chain's loadRun (single
// definition, single error-handling policy). consult-metrics needs the aborts
// family on top, which the chain checker does not load, so we layer that one
// read here using the same shared readJsonDir.

function loadRun(runDir) {
  const { asks, answers, chains } = loadChainRun(runDir);
  const aborts = readJsonDir(path.join(runDir, 'consults', 'aborts'));
  return { asks, answers, chains, aborts };
}

// --- mechanical derivation --------------------------------------------------

const EXTERNAL_FETCH_BASES = new Set(['after-reading-code', 'after-web']);

function indexBy(list, key) {
  const map = new Map();
  for (const item of list) {
    if (item && item[key] != null) map.set(item[key], item);
  }
  return map;
}

// One metric record per logical unit, derived from that unit's artifacts.
function deriveMetrics(run, { budgetTokens } = {}) {
  const askById = indexBy(run.asks, 'ask_id');
  const answerById = indexBy(run.answers, 'answer_id');

  // Group artifacts by logical_unit. asks carry logical_unit; answers point at an
  // ask via ask_id; chains carry logical_unit directly.
  const units = new Map();
  const unit = (lu) => {
    if (!units.has(lu)) {
      units.set(lu, { logical_unit: lu, asks: [], answers: [], chains: [], aborts: [] });
    }
    return units.get(lu);
  };

  for (const ask of run.asks) if (ask.logical_unit) unit(ask.logical_unit).asks.push(ask);
  for (const ans of run.answers) {
    const ask = askById.get(ans.ask_id);
    const lu = ask?.logical_unit;
    if (lu) unit(lu).answers.push(ans);
  }
  for (const chain of run.chains) if (chain.logical_unit) unit(chain.logical_unit).chains.push(chain);
  for (const abort of run.aborts) if (abort.logical_unit) unit(abort.logical_unit).aborts.push(abort);

  const metrics = [];
  for (const u of units.values()) {
    metrics.push(deriveUnitMetric(u, { askById, answerById, budgetTokens }));
  }
  metrics.sort((a, b) => (a.logical_unit < b.logical_unit ? -1 : a.logical_unit > b.logical_unit ? 1 : 0));
  return metrics;
}

function deriveUnitMetric(u, { askById }) {
  const entries = u.chains.flatMap((c) => (Array.isArray(c.entries) ? c.entries : []));

  // decision_changed: any acted-on answer differs from its ask's recommendation.
  let decisionChanged = false;
  let externalFetch = false;
  let humanInterruption = false;
  for (const ans of u.answers) {
    const ask = askById.get(ans.ask_id);
    if (ask && normalize(ask.recommendation) !== normalize(ans.answer)) decisionChanged = true;
    if (EXTERNAL_FETCH_BASES.has(ans.basis)) externalFetch = true;
    if (ans.scope === 'human-level') humanInterruption = true;
  }

  // contradiction_caught: a pushed-back entry whose follow-up answer revised
  // (disposition != reaffirmed) -- a real contradiction adopted, not just reaffirmed.
  const pushedBack = entries.filter((e) => e.outcome === 'pushed-back');
  let contradictionCaught = false;
  for (const pb of pushedBack) {
    const follow = u.answers.find((a) => a.ask_id === pb.input_ask_id && a.disposition !== 'reaffirmed');
    if (follow) contradictionCaught = true;
  }

  // reopened_settled_decision: two distinct chain entries acting on the SAME answer id,
  // OR an ask whose question re-asks an earlier resolved ask in the unit. Re-ask
  // detection uses the canonical near-duplicate fingerprint (consult-budget), so a
  // REWORDED re-ask counts, not only a byte-identical string -- one definition of
  // "duplicate question" shared with the thrash meter.
  const actedOn = entries.map((e) => e.acted_on_answer_id).filter(Boolean);
  const questions = u.asks.map((a) => a.question).filter((q) => typeof q === 'string');
  const reopened =
    new Set(actedOn).size !== actedOn.length ||
    countNearDuplicateQuestions(questions) > 0;

  // repeated_predecessor_exploration: an abort tripped on a re-read / no-progress
  // dimension. The dimension names are the canonical abort_record enum values
  // (consult-budget.schema.json) -- the ONLY producer, buildAbortRecord, emits
  // exactly these; matching anything else is dead on real data.
  const repeated = u.aborts.some(
    (ab) =>
      ab.tripped_dimension === 'repeated_reread_count' ||
      ab.tripped_dimension === 'no_progress_diff_count',
  );

  return {
    logical_unit: u.logical_unit,
    decision_changed: decisionChanged,
    external_fetch: externalFetch,
    contradiction_caught: contradictionCaught,
    reopened_settled_decision: reopened,
    repeated_predecessor_exploration: repeated,
    consult_tokens: sumTokens(u.aborts),
    consult_latency_ms: latency(u.asks, u.answers),
    human_interruption: humanInterruption,
  };
}

function normalize(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : v;
}

// Per-unit token tally. The ONLY schema-valid token source on disk is an abort
// record's counter_values.cumulative_tokens (consult-budget.schema.json);
// consult-chain entries carry NO token field (the chain schema is
// additionalProperties:false), so a per-entry read would always be 0 on real
// data. Source the tally solely from the field a producer actually emits.
function sumTokens(aborts) {
  let total = 0;
  for (const ab of aborts) {
    const t = ab.counter_values?.cumulative_tokens;
    if (Number.isFinite(t)) total += t;
  }
  return total;
}

function latency(asks, answers) {
  const askTimes = asks.map((a) => Date.parse(a.created_at)).filter((n) => Number.isFinite(n));
  const ansTimes = answers.map((a) => Date.parse(a.answered_at)).filter((n) => Number.isFinite(n));
  if (askTimes.length === 0 || ansTimes.length === 0) return 0;
  const span = Math.max(...ansTimes) - Math.min(...askTimes);
  return span > 0 ? span : 0;
}

// --- run summary ------------------------------------------------------------

function share(count, total) {
  return total === 0 ? 0 : count / total;
}

export function rollUp(run, opts = {}) {
  const metrics = deriveMetrics(run, opts);
  const total = metrics.length;
  const totalTokens = metrics.reduce((s, m) => s + m.consult_tokens, 0);

  const summary = {
    total_consults: total,
    share_decision_changed: share(metrics.filter((m) => m.decision_changed).length, total),
    share_external_fetch: share(metrics.filter((m) => m.external_fetch).length, total),
    share_contradiction_caught: share(metrics.filter((m) => m.contradiction_caught).length, total),
    fresh_witness_count: metrics.filter(
      (m) => !m.reopened_settled_decision && !m.repeated_predecessor_exploration,
    ).length,
    fresh_amnesia_count: metrics.filter(
      (m) => m.reopened_settled_decision || m.repeated_predecessor_exploration,
    ).length,
    human_interruption_count: metrics.filter((m) => m.human_interruption).length,
    total_consult_tokens: totalTokens,
    total_consult_latency_ms: metrics.reduce((s, m) => s + m.consult_latency_ms, 0),
    per_unit: metrics,
  };

  if (Number.isFinite(opts.budgetTokens)) {
    summary.token_budget = opts.budgetTokens;
    summary.token_budget_overrun = totalTokens > opts.budgetTokens;
  }

  return summary;
}

export function rollUpRunDir(runDir, opts = {}) {
  return rollUp(loadRun(runDir), opts);
}

// --- CLI --------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { runDir: null, budgetTokens: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run-dir') {
      opts.runDir = argv[(i += 1)];
      if (opts.runDir === undefined) fail('--run-dir requires a value');
    } else if (arg === '--budget-tokens') {
      const v = argv[(i += 1)];
      if (v === undefined) fail('--budget-tokens requires a value');
      const n = Number(v);
      if (!Number.isFinite(n)) fail(`--budget-tokens must be a number: ${v}`);
      opts.budgetTokens = n;
    } else {
      fail(`unknown flag: ${arg}`);
    }
  }
  if (!opts.runDir) fail('missing required --run-dir <path>');
  return opts;
}

function main(argv) {
  const opts = parseArgs(argv);
  const summary = rollUpRunDir(opts.runDir, { budgetTokens: opts.budgetTokens });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
