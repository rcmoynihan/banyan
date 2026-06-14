#!/usr/bin/env node

// check-consult-chain.mjs — a pure, zero-dependency reconstructability checker
// for a logical unit's continuation chain (R23/AE4). It is the executable proof
// that one logical unit is reconstructable from ledger artifacts alone: given a
// chain and the run's asks + answers, it confirms every link resolves and flags
// any dangling reference.
//
// What it checks, per the consult-chain schema's link semantics:
//
//   - Shape first: the chain itself is schema-valid (delegated to
//     validate-consult-artifacts.validateChain), and so is every ask/answer it
//     references. A structurally invalid artifact is reported as a finding, not
//     a thrown error.
//   - predecessor link: every entry except the first names a predecessor_agent_id
//     that is an EARLIER entry in the same chain (a continuation reads its direct
//     predecessor — R17). A predecessor that names no earlier entry, or the first
//     entry naming a predecessor, is dangling.
//   - acted_on_answer_id link: every continuation (an entry WITH a predecessor)
//     must carry acted_on_answer_id (a continuation exists because it is acting on
//     an answer), and that id must resolve to a real answer. A continuation
//     missing the link, or pointing at an unknown answer, is flagged (AE4).
//   - answer -> ask link: each referenced answer's ask_id must resolve to a real
//     ask in the run. A dangling answer->ask link breaks reconstructability.
//   - input_ask_id link: when an entry raised an ask, that ask must resolve.
//   - transcript_pointer: each entry's pointer must be schema-valid SHAPE (a
//     dangling/malformed pointer is flagged — AE4). This is a shape check only;
//     it does NOT read or hash the transcript (DI2 — locate/integrity is U2's
//     validate(), run at read time, not here).
//
// `check(...)` returns { ok, findings } where findings is an array of
// { code, where, detail } records, one per broken link, so each failure class is
// independently assertable. ok === true means the chain is fully reconstructable.
//
// Pure given its inputs; the only I/O is read-only artifact loading in the CLI
// and the loadRun() helper.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { validateChain, validateAsk, validateAnswer, validateAgainst } from './validate-consult-artifacts.mjs';

// Each entry's transcript_pointer SHAPE is checked as part of validateChain (the
// chain schema $refs the pointer schema), so a dangling/malformed pointer surfaces
// as a CHAIN_INVALID finding. check() adds the link-level findings on top.

const FINDING = {
  CHAIN_INVALID: 'chain-schema-invalid',
  ASK_INVALID: 'ask-schema-invalid',
  ANSWER_INVALID: 'answer-schema-invalid',
  PREDECESSOR_DANGLING: 'predecessor-dangling',
  PREDECESSOR_ON_ROOT: 'predecessor-on-root-entry',
  PREDECESSOR_NOT_DIRECT: 'predecessor-not-direct',
  ENTRY_MISSING_PREDECESSOR: 'entry-missing-predecessor',
  CONTINUATION_MISSING_ANSWER: 'continuation-missing-answer-id',
  ANSWER_DANGLING: 'acted-on-answer-dangling',
  ANSWER_ASK_DANGLING: 'answer-ask-dangling',
  INPUT_ASK_DANGLING: 'input-ask-dangling',
  DUPLICATE_AGENT_ID: 'duplicate-physical-agent-id',
};

// check(chain, { asks, answers }) -> { ok, findings }
//
//   chain   : a consult-chain object (the logical unit's chain).
//   asks    : a Map<ask_id, ask> | a plain object keyed by ask_id | an array of asks.
//   answers : same, keyed by answer_id.
export function check(chain, { asks = {}, answers = {} } = {}) {
  const findings = [];
  const askIndex = indexBy(asks, 'ask_id');
  const answerIndex = indexBy(answers, 'answer_id');

  // 1. Whole-chain shape (also covers every entry's transcript_pointer shape via
  //    the schema's $ref). A shape failure is reported but we still attempt the
  //    link walk so the caller sees every problem at once.
  const chainShape = validateChain(chain);
  if (!chainShape.ok) {
    findings.push({ code: FINDING.CHAIN_INVALID, where: '$', detail: chainShape.errors });
  }

  // 2. Shape of every referenced ask/answer.
  for (const [askId, ask] of askIndex) {
    const r = validateAsk(ask);
    if (!r.ok) {
      findings.push({ code: FINDING.ASK_INVALID, where: `asks[${askId}]`, detail: r.errors });
    }
  }
  for (const [answerId, answer] of answerIndex) {
    const r = validateAnswer(answer);
    if (!r.ok) {
      findings.push({ code: FINDING.ANSWER_INVALID, where: `answers[${answerId}]`, detail: r.errors });
    }
  }

  const entries = Array.isArray(chain?.entries) ? chain.entries : [];
  const seenAgentIds = new Set();
  // Agent ids that appear at or before each index — a predecessor must be earlier.
  const idsSoFar = new Set();

  entries.forEach((entry, i) => {
    const where = `$.entries[${i}]`;
    const agentId = entry?.physical_agent_id;

    if (typeof agentId === 'string') {
      if (seenAgentIds.has(agentId)) {
        findings.push({ code: FINDING.DUPLICATE_AGENT_ID, where, detail: agentId });
      }
      seenAgentIds.add(agentId);
    }

    const hasPredecessor =
      entry?.predecessor_agent_id !== undefined && entry?.predecessor_agent_id !== null;

    // predecessor link semantics for a LINEAR continuation chain (R17/R23):
    //   - exactly one root: the first entry (and only the first) has no predecessor;
    //   - every later entry MUST name a predecessor (a non-root entry without one is
    //     a second root inside one logical unit — the chain is no longer a single
    //     connected line, breaking reconstructability, R23);
    //   - a continuation reads its DIRECT predecessor only (R17): the predecessor
    //     must be the immediately-preceding entry's physical_agent_id, so naming a
    //     grandparent (or any non-adjacent earlier id) is rejected — it would skip
    //     a real link in the chain.
    if (i === 0) {
      if (hasPredecessor) {
        findings.push({
          code: FINDING.PREDECESSOR_ON_ROOT,
          where,
          detail: 'first chain entry must not name a predecessor',
        });
      }
    } else if (!hasPredecessor) {
      findings.push({
        code: FINDING.ENTRY_MISSING_PREDECESSOR,
        where,
        detail: 'a non-root chain entry must name its direct predecessor (one connected chain from a single root)',
      });
    } else if (!idsSoFar.has(entry.predecessor_agent_id)) {
      findings.push({
        code: FINDING.PREDECESSOR_DANGLING,
        where,
        detail: `predecessor_agent_id ${entry.predecessor_agent_id} names no earlier entry`,
      });
    } else {
      // The predecessor resolves to an earlier entry; enforce DIRECTNESS — it must
      // be the immediately-preceding entry, not a skipped-over ancestor (R17).
      const directId = entries[i - 1]?.physical_agent_id;
      if (entry.predecessor_agent_id !== directId) {
        findings.push({
          code: FINDING.PREDECESSOR_NOT_DIRECT,
          where,
          detail:
            `predecessor_agent_id ${entry.predecessor_agent_id} is not the direct ` +
            `predecessor ${directId}; a continuation reads only its immediate predecessor (R17)`,
        });
      }
    }
    // Keep the dangling-on-root case for a first entry that names an unknown
    // predecessor (the PREDECESSOR_ON_ROOT finding above already flags the root
    // case; a forward/unknown reference is reported by the dangling check below).
    if (i === 0 && hasPredecessor && !idsSoFar.has(entry.predecessor_agent_id)) {
      findings.push({
        code: FINDING.PREDECESSOR_DANGLING,
        where,
        detail: `predecessor_agent_id ${entry.predecessor_agent_id} names no earlier entry`,
      });
    }

    // A continuation is any entry WITH a predecessor. It must have acted on an
    // answer, and that answer must resolve (AE4).
    if (hasPredecessor) {
      const answerId = entry?.acted_on_answer_id;
      if (answerId === undefined || answerId === null) {
        findings.push({
          code: FINDING.CONTINUATION_MISSING_ANSWER,
          where,
          detail: 'a continuation must carry acted_on_answer_id',
        });
      } else if (!answerIndex.has(answerId)) {
        findings.push({
          code: FINDING.ANSWER_DANGLING,
          where,
          detail: `acted_on_answer_id ${answerId} resolves to no answer`,
        });
      } else {
        // answer -> ask back-link must also resolve.
        const answer = answerIndex.get(answerId);
        if (!askIndex.has(answer.ask_id)) {
          findings.push({
            code: FINDING.ANSWER_ASK_DANGLING,
            where,
            detail: `answer ${answerId} references ask ${answer.ask_id}, which resolves to no ask`,
          });
        }
      }
    }

    // input_ask_id link (when this entry raised an ask).
    if (entry?.input_ask_id !== undefined && entry?.input_ask_id !== null) {
      if (!askIndex.has(entry.input_ask_id)) {
        findings.push({
          code: FINDING.INPUT_ASK_DANGLING,
          where,
          detail: `input_ask_id ${entry.input_ask_id} resolves to no ask`,
        });
      }
    }

    if (typeof agentId === 'string') {
      idsSoFar.add(agentId);
    }
  });

  return { ok: findings.length === 0, findings };
}

// Normalize asks/answers given as an array, a Map, or a plain object into a
// Map keyed by `idField`.
function indexBy(collection, idField) {
  const map = new Map();
  if (collection instanceof Map) {
    return collection;
  }
  if (Array.isArray(collection)) {
    for (const item of collection) {
      if (item && typeof item[idField] === 'string') {
        map.set(item[idField], item);
      }
    }
    return map;
  }
  if (collection && typeof collection === 'object') {
    for (const value of Object.values(collection)) {
      if (value && typeof value[idField] === 'string') {
        map.set(value[idField], value);
      }
    }
  }
  return map;
}

// loadRun(runDir) -> { chains, asks, answers } — read the consult artifacts under
// a run dir's consults/{asks,answers,chains} subtrees. Read-only I/O.
export function loadRun(runDir) {
  const consults = path.join(runDir, 'consults');
  return {
    asks: readJsonDir(path.join(consults, 'asks')),
    answers: readJsonDir(path.join(consults, 'answers')),
    chains: readJsonDir(path.join(consults, 'chains')),
  };
}

export function readJsonDir(dir) {
  const out = [];
  let names = [];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch {
      // A malformed JSON file is surfaced as a checker finding only if it is
      // referenced; an unparseable standalone file is skipped here (the schema
      // validators handle referenced shape). Keep loadRun robust.
    }
  }
  return out;
}

// checkRun(runDir) -> { ok, results } — check every chain under a run dir against
// that run's asks + answers. `results` is one { logical_unit, ok, findings } per
// chain.
export function checkRun(runDir) {
  const { chains, asks, answers } = loadRun(runDir);
  const results = chains.map((chain) => {
    const r = check(chain, { asks, answers });
    return { logical_unit: chain?.logical_unit ?? '<unknown>', ok: r.ok, findings: r.findings };
  });
  return { ok: results.every((r) => r.ok), results };
}

// ---------------------------------------------------------------------------
// CLI: `check-consult-chain --run <run-dir>` checks every chain under the run.
// Exit 0 when all chains reconstruct; exit 1 when any finding is reported; exit 2
// on usage error.
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = { runDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run') {
      opts.runDir = argv[(i += 1)];
    } else {
      process.stderr.write(`check-consult-chain: unknown flag: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (!opts.runDir) {
    process.stderr.write('check-consult-chain --run <run-dir>\n');
    process.exit(2);
  }
  const result = checkRun(opts.runDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { FINDING };
// Re-export validateAgainst so callers needing it can import from one place.
export { validateAgainst };
