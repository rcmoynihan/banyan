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

function fail(msg) {
  process.stderr.write(`consult-metrics: ${msg}\n`);
  process.exit(2);
}

// --- artifact loading -------------------------------------------------------

function readJsonDir(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return []; // a missing family is empty, not an error (degrade, don't break)
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    const full = path.join(dir, name);
    try {
      out.push({ file: name, obj: JSON.parse(fs.readFileSync(full, 'utf8')) });
    } catch (err) {
      fail(`could not parse ${full}: ${err.message}`);
    }
  }
  out.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return out;
}

function loadRun(runDir) {
  const consults = path.join(runDir, 'consults');
  return {
    asks: readJsonDir(path.join(consults, 'asks')).map((e) => e.obj),
    answers: readJsonDir(path.join(consults, 'answers')).map((e) => e.obj),
    chains: readJsonDir(path.join(consults, 'chains')).map((e) => e.obj),
    aborts: readJsonDir(path.join(consults, 'aborts')).map((e) => e.obj),
  };
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
  // OR an ask whose question duplicates an earlier resolved ask in the unit.
  const actedOn = entries.map((e) => e.acted_on_answer_id).filter(Boolean);
  const reopened =
    new Set(actedOn).size !== actedOn.length ||
    hasDuplicateQuestion(u.asks);

  // repeated_predecessor_exploration: an abort tripped on a re-read / no-progress dimension.
  const repeated = u.aborts.some(
    (ab) =>
      ab.tripped_dimension === 'repeated_reread' ||
      ab.tripped_dimension === 'no_progress_diff' ||
      ab.tripped_dimension === 'no-progress',
  );

  // any abort that surfaced upward counts as a human interruption too.
  if (u.aborts.some((ab) => ab.surfaced_to_human === true)) humanInterruption = true;

  return {
    logical_unit: u.logical_unit,
    decision_changed: decisionChanged,
    external_fetch: externalFetch,
    contradiction_caught: contradictionCaught,
    reopened_settled_decision: reopened,
    repeated_predecessor_exploration: repeated,
    consult_tokens: sumTokens(entries, u.aborts),
    consult_latency_ms: latency(u.asks, u.answers),
    human_interruption: humanInterruption,
  };
}

function normalize(v) {
  return typeof v === 'string' ? v.trim().toLowerCase() : v;
}

function hasDuplicateQuestion(asks) {
  const seen = new Set();
  for (const a of asks) {
    const q = normalize(a.question);
    if (q == null) continue;
    if (seen.has(q)) return true;
    seen.add(q);
  }
  return false;
}

function sumTokens(entries, aborts) {
  let total = 0;
  for (const e of entries) if (Number.isFinite(e.consult_tokens)) total += e.consult_tokens;
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
