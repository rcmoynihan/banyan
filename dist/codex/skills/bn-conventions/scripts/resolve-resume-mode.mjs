#!/usr/bin/env node

// resolve-resume-mode.mjs — lock a run into transcript or checkpoint resume mode
// from U1's locate-and-complete probe result, once, at run start (R19/R20/R28).
//
// This is the degrade-not-break hinge of the recursive-consult-loop feature.
// The #1 risk (the undocumented transcript path; plan risk R-A) is converted
// from "the feature breaks" into "the feature degrades" here: if a complete
// transcript is not locatable, the resolver returns CHECKPOINT mode and the run
// runs on the self-contained checkpoint contract (references/resume-protocol.md)
// instead of failing.
//
// Contract (pure function):
//   resolveResumeMode(locateResult) -> { mode, sessionPath, reason }
//
//   locateResult is U1's locateTranscript() output shape:
//     { located: boolean, path: string|null, complete: boolean, reason: string }
//   It is treated as OPAQUE evidence — this module never re-derives or re-probes;
//   it only reads located/complete/path/reason. (DI2: no internal-schema parse.)
//
//   mode is "transcript" iff the probe says a complete file IS locatable
//   (located === true AND complete === true). Anything else — not located,
//   located-but-incomplete, a missing/garbage probe, or no probe at all — locks
//   to "checkpoint", the safe degrade (R20). The lock is computed ONCE here and
//   recorded as a ledger fact by new-run.mjs; continuations read the lock from
//   the ledger rather than re-probing, so the mode survives a resumed trunk and
//   the run is files-only reconstructable.
//
// Zero dependencies — node:* only. resolveResumeMode() is PURE; it performs no
// probing and no filesystem access. (The side-effecting touch is new-run.mjs,
// which calls this and seeds the resulting facts into ledger.md. The CLI wrapper
// at the bottom reads JSON from a flag or stdin.)

import fs from 'node:fs';
import process from 'node:process';

export const TRANSCRIPT_MODE = 'transcript';
export const CHECKPOINT_MODE = 'checkpoint';

// Resolve the locked resume mode from a U1 locate result.
//
// A null/undefined/non-object locateResult means "no probe was run" (e.g. the
// run was opened without a probe, or on a host where the probe could not run) —
// this defaults to checkpoint, the safe degrade, with a reason that says so.
export function resolveResumeMode(locateResult) {
  if (locateResult === null || typeof locateResult !== 'object') {
    return {
      mode: CHECKPOINT_MODE,
      sessionPath: null,
      reason: 'no-probe-result',
    };
  }

  const located = locateResult.located === true;
  const complete = locateResult.complete === true;
  // sessionPath carries the resolved/discovered transcript path forward (R28)
  // so a transcript-mode continuation knows where the predecessor's transcript
  // is without re-probing. A non-string/empty path normalizes to null.
  const sessionPath =
    typeof locateResult.path === 'string' && locateResult.path !== '' ? locateResult.path : null;

  if (located && complete) {
    return {
      mode: TRANSCRIPT_MODE,
      sessionPath,
      // Carry the probe's own reason through so the ledger fact records WHY the
      // mode was chosen (e.g. "located-and-complete"), not just the verdict.
      reason: reasonOf(locateResult, 'located-and-complete'),
    };
  }

  // Degrade: not locatable, or located-but-incomplete (a truncated / actively
  // growing transcript is unsafe to treat as authoritative — R20 checks
  // locate-AND-complete, not just locate). Either way -> checkpoint mode. We
  // still carry sessionPath through (it may be a real but incomplete path) so
  // the ledger fact is honest about what the probe resolved; checkpoint mode
  // simply does not depend on it.
  return {
    mode: CHECKPOINT_MODE,
    sessionPath,
    reason: degradeReason(located, locateResult),
  };
}

function degradeReason(located, locateResult) {
  if (!located) {
    return reasonOf(locateResult, 'not-locatable');
  }
  // located but not complete
  return reasonOf(locateResult, 'located-but-incomplete');
}

// Prefer the probe's own reason string when present; otherwise the default.
function reasonOf(locateResult, fallback) {
  const r = locateResult.reason;
  return typeof r === 'string' && r !== '' ? r : fallback;
}

// ---------------------------------------------------------------------------
// CLI wrapper. Reads a locate result as JSON from --locate '<json>' or from
// piped stdin, and prints the resolved mode as JSON. With neither, it resolves
// the no-probe default (checkpoint), so operators and the scaffolder get the
// safe degrade by default rather than an error.
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = { locate: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--locate') {
      const value = argv[(i += 1)];
      // Fail hard on a missing flag value (matching new-run.mjs's readValue
      // semantics) rather than silently degrading: `--locate` with nothing
      // after it is an operator mistake, not "no probe". (The no-probe case is
      // expressed by omitting the flag entirely, which IS the safe default.)
      if (value === undefined) {
        process.stderr.write('resolve-resume-mode: --locate requires a value\n');
        process.exit(2);
      }
      opts.locate = value;
    } else {
      process.stderr.write(`resolve-resume-mode: unknown flag: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

// Synchronously drain stdin when it is a pipe (not a TTY). Returns null when
// there is no piped input so the CLI falls back to the no-probe default.
function readPipedStdin() {
  if (process.stdin.isTTY) {
    return null;
  }
  try {
    const text = fs.readFileSync(0, 'utf8').trim();
    return text === '' ? null : text;
  } catch {
    return null;
  }
}

function parseLocateJson(raw) {
  if (raw === null || raw === undefined || raw === '') {
    // No probe input -> safe degrade default (resolveResumeMode handles null).
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    process.stderr.write('resolve-resume-mode: --locate value is not valid JSON\n');
    process.exit(2);
  }
  return null;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  const raw = opts.locate !== null ? opts.locate : readPipedStdin();
  const locateResult = parseLocateJson(raw);
  const result = resolveResumeMode(locateResult);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
