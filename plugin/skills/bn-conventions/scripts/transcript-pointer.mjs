#!/usr/bin/env node

// transcript-pointer.mjs — make a transcript pointer a validated structured
// capability (R18) and provide a transcript sanitizer (R15), so no read ever
// happens against an unverified or untrusted transcript.
//
// Two public functions, both pure (the only side effects are read-only fs.stat
// / fs.readFile against the file the pointer names, performed only by
// validate()):
//
//   validate(pointer, root) -> { ok, mismatches, located }
//     Confirms the pointer's SHAPE, that its project-root hash matches the root
//     it is being validated against, that the named transcript file EXISTS, and
//     that the file's SIZE and HASH match what the pointer recorded at spawn
//     time — i.e. the file has not changed since the pointer was minted. All of
//     this happens BEFORE any caller is allowed to treat the transcript as
//     authoritative: the only file content validate() itself reads is the byte
//     stream it hashes for the integrity check, and it returns ok:false rather
//     than handing back any content. A caller reads the transcript only after
//     ok === true.
//
//   sanitize(rawText) -> string
//     Line-filters a small, explicit strip-list of internal control material
//     that is not meant to be authoritative to a continuation. It REMOVES whole
//     lines; it never parses-and-reconstructs the transcript (DI2). Reasoning
//     turns and ask/decision events are preserved byte-for-byte. Over-stripping
//     is a defect: anything not on the explicit strip-list survives unchanged,
//     and a clean transcript round-trips to itself.
//
// Zero dependencies — node:* only. Reuses U1's path resolver rather than
// reimplementing path logic.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { resolveTranscriptPath } from './locate-transcript.mjs';

const HEX64 = /^[a-f0-9]{64}$/;

// The required capability fields (R18). Mirrors transcript-pointer.schema.json's
// `required` set; kept here so validate() is self-contained and does not depend
// on a JSON-schema runtime (zero-dependency).
const REQUIRED_FIELDS = [
  'agent_id',
  'session_id',
  'project_root_hash',
  'spawn_timestamp',
  'file_hash',
  'byte_size',
];

// ---------------------------------------------------------------------------
// Hashing helpers (pure given their inputs).
// ---------------------------------------------------------------------------

// SHA-256 of a string (used for the project-root hash). The root is normalized
// to an absolute path first so the same checkout hashes identically regardless
// of how the caller spelled it.
export function hashProjectRoot(root) {
  const normalized = path.resolve(root);
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

// Is `child` the same path as, or a descendant of, `parent`? Compares
// realpath-resolved absolute paths so a symlink cannot smuggle a file from
// outside the boundary back in. Returns false on any resolution failure (fail
// closed). Both inputs must already be absolute.
function isWithin(parent, child) {
  let realParent;
  let realChild;
  try {
    realParent = fs.realpathSync(parent);
  } catch {
    // The parent boundary itself does not resolve; cannot prove containment.
    realParent = path.resolve(parent);
  }
  try {
    realChild = fs.realpathSync(child);
  } catch {
    // The file (or a path segment) does not resolve via realpath; fall back to a
    // lexical resolve so a not-yet-existing file is still boundary-checked.
    realChild = path.resolve(child);
  }
  const rel = path.relative(realParent, realChild);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// SHA-256 of a file's raw bytes. Returns null if the file cannot be read; the
// caller turns that into a `located`/`file-unreadable` mismatch rather than
// throwing.
function hashFileBytes(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// validate(pointer, root) -> { ok, mismatches, located }
// ---------------------------------------------------------------------------
//
// `mismatches` is an array of { field, reason } records — one per failed check —
// so every corruption class is independently asserted (table-driven). `located`
// reports whether the named transcript file was confirmed to exist (a separate
// signal from integrity: a present-but-tampered file is located:true, ok:false).
// On a terminal short-circuit reached BEFORE the file is examined (shape failure
// or project-root mismatch) `located` is false meaning "not examined"; callers
// must always gate on `ok` first and treat `located` as meaningful only once the
// file-existence stage has run.
//
// `root` is the absolute project root the pointer is being validated against.
// `sessionPath` (optional) is the envelope-pushed session path used to resolve
// the transcript file; when omitted the U1 resolver falls back to filesystem
// discovery keyed by the pointer's agent_id.
export function validate(pointer, root, { sessionPath } = {}) {
  const mismatches = [];

  // --- 1. Shape: the pointer must be an object with every required field, each
  //        well-typed. A missing or malformed field is a shape mismatch and we
  //        stop before any path resolution or read (a shapeless pointer is not a
  //        capability at all).
  if (pointer === null || typeof pointer !== 'object' || Array.isArray(pointer)) {
    return { ok: false, located: false, mismatches: [{ field: '<pointer>', reason: 'not-an-object' }] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in pointer) || pointer[field] === null || pointer[field] === undefined) {
      mismatches.push({ field, reason: 'missing-field' });
    }
  }

  // Field-level type/format checks (only for fields that are present).
  if ('agent_id' in pointer && pointer.agent_id !== null && typeof pointer.agent_id !== 'string') {
    mismatches.push({ field: 'agent_id', reason: 'not-a-string' });
  }
  if ('session_id' in pointer && pointer.session_id !== null && typeof pointer.session_id !== 'string') {
    mismatches.push({ field: 'session_id', reason: 'not-a-string' });
  }
  if (
    'project_root_hash' in pointer &&
    pointer.project_root_hash !== null &&
    !(typeof pointer.project_root_hash === 'string' && HEX64.test(pointer.project_root_hash))
  ) {
    mismatches.push({ field: 'project_root_hash', reason: 'not-a-sha256-hex' });
  }
  if (
    'file_hash' in pointer &&
    pointer.file_hash !== null &&
    !(typeof pointer.file_hash === 'string' && HEX64.test(pointer.file_hash))
  ) {
    mismatches.push({ field: 'file_hash', reason: 'not-a-sha256-hex' });
  }
  if (
    'byte_size' in pointer &&
    pointer.byte_size !== null &&
    !(Number.isInteger(pointer.byte_size) && pointer.byte_size >= 0)
  ) {
    mismatches.push({ field: 'byte_size', reason: 'not-a-non-negative-integer' });
  }

  // A shape failure is terminal: without a well-formed pointer we cannot safely
  // resolve a path or hash a file. Report shape mismatches and stop.
  if (mismatches.length > 0) {
    return { ok: false, located: false, mismatches };
  }

  // --- 2. Project-root binding: re-derive the hash of the root we are
  //        validating against and compare. A mismatch means the pointer was
  //        minted against a different repo/checkout; refuse before any read.
  const actualRootHash = hashProjectRoot(root);
  if (actualRootHash !== pointer.project_root_hash) {
    mismatches.push({
      field: 'project_root_hash',
      reason: 'project-root-mismatch',
    });
    // Project-root mismatch is terminal: this capability does not belong to this
    // root, so we do not go on to touch the filesystem under it.
    return { ok: false, located: false, mismatches };
  }

  // --- 3. File existence + size, via stat (cheap, before the hashing read).
  const resolved = resolveTranscriptPath({
    sessionPath,
    agentId: pointer.agent_id,
    env: process.env,
  });
  if (!resolved.path) {
    mismatches.push({ field: 'agent_id', reason: `unresolvable-path:${resolved.reason}` });
    return { ok: false, located: false, mismatches };
  }

  // --- 3a. Location binding: the capability claims a SPECIFIC predecessor's
  //         transcript, so location — not just content — must be bound. The
  //         resolved transcript file MUST live under the validated project root
  //         (realpath-resolved, so a symlink cannot point at a same-bytes file
  //         outside the tree). Without this, an out-of-band sessionPath can
  //         redirect validation to any same-bytes file anywhere on disk and it
  //         would still validate (the content hash alone is insufficient).
  if (!isWithin(root, resolved.path)) {
    mismatches.push({ field: 'session_id', reason: 'transcript-outside-project-root' });
    return { ok: false, located: false, mismatches };
  }

  let stat;
  try {
    stat = fs.statSync(resolved.path);
  } catch {
    mismatches.push({ field: 'file_hash', reason: 'file-not-found' });
    return { ok: false, located: false, mismatches };
  }
  if (!stat.isFile()) {
    mismatches.push({ field: 'file_hash', reason: 'not-a-file' });
    return { ok: false, located: false, mismatches };
  }

  const located = true;

  // Size check before the hash: a cheap integrity gate that yields a precise
  // `size-mismatch` reason. A size mismatch is terminal — the file already does
  // not match the pointer, `ok` will be false regardless, and the only tamper a
  // subsequent hash could add is the equal-size case (which by definition is NOT
  // a size mismatch). Short-circuiting here avoids a full read of a
  // potentially-large mismatched file with no effect on the verdict.
  if (stat.size !== pointer.byte_size) {
    mismatches.push({ field: 'byte_size', reason: 'size-mismatch' });
    return { ok: false, located, mismatches };
  }

  // --- 4. File-hash integrity: recompute the SHA-256 of the file's current
  //        bytes and compare to the spawn-time hash. This read is the integrity
  //        check itself — its bytes are not returned to the caller. A drift
  //        means the transcript changed since the pointer was minted; it is no
  //        longer authoritative.
  const actualFileHash = hashFileBytes(resolved.path);
  if (actualFileHash === null) {
    mismatches.push({ field: 'file_hash', reason: 'file-unreadable' });
    return { ok: false, located, mismatches };
  }
  if (actualFileHash !== pointer.file_hash) {
    mismatches.push({ field: 'file_hash', reason: 'hash-mismatch' });
  }

  return { ok: mismatches.length === 0, located, mismatches };
}

// ---------------------------------------------------------------------------
// sanitize(rawText) -> string
// ---------------------------------------------------------------------------
//
// Strip-list of internal control material (R18: "a sanitizer strips internal
// log material not meant to be authoritative"). Each entry is a PREDICATE over a
// single raw line. A line is dropped iff some predicate matches; everything else
// survives byte-for-byte (DI2: remove, never parse-and-reconstruct).
//
// The list is deliberately small and explicit. Over-stripping is a defect:
// reasoning turns and ask/decision events must NOT match any predicate, so the
// markers are narrow control-channel tokens, not content keywords. The markers
// chosen are internal harness control lines that the Claude Code runtime emits
// around tool/system bookkeeping and that carry no task authority:
//
//   - `[[banyan:internal-control ...]]` — Banyan's own internal-control marker.
//   - lines whose trimmed form is exactly a system-reminder open/close marker.
//   - heartbeat/liveness bookkeeping lines (`[[banyan:heartbeat ...]]`).
//
// Reasoning turns and ask/decision events are ordinary content lines and never
// carry these markers, so they pass through untouched.
const STRIP_PREDICATES = [
  // Banyan internal-control channel marker. The canonical form is a line whose
  // trimmed content begins with the internal-control sentinel.
  (line) => line.trimStart().startsWith('[[banyan:internal-control'),
  // Banyan liveness/heartbeat bookkeeping — re-derivable observability noise.
  (line) => line.trimStart().startsWith('[[banyan:heartbeat'),
  // Harness system-reminder envelope markers (the literal control tokens, not
  // any human-authored line that merely mentions them).
  (line) => line.trim() === '<system-reminder>' || line.trim() === '</system-reminder>',
];

function isStripped(line) {
  for (const predicate of STRIP_PREDICATES) {
    if (predicate(line)) {
      return true;
    }
  }
  return false;
}

export function sanitize(rawText) {
  if (typeof rawText !== 'string') {
    throw new TypeError('sanitize expects raw transcript text as a string');
  }
  if (rawText === '') {
    return '';
  }

  // Split on \n but remember whether the input ended with a trailing newline so
  // a clean transcript round-trips to itself byte-for-byte. `split('\n')` on a
  // trailing-newline string yields a final '' element we must not turn into an
  // extra blank line.
  const endsWithNewline = rawText.endsWith('\n');
  const body = endsWithNewline ? rawText.slice(0, -1) : rawText;
  const lines = body.split('\n');

  const kept = lines.filter((line) => !isStripped(line));

  // No line stripped and the line set is identical → exact no-op (preserves the
  // original trailing-newline state).
  let result = kept.join('\n');
  if (endsWithNewline) {
    result += '\n';
  }
  return result;
}

// ---------------------------------------------------------------------------
// CLI: `transcript-pointer --validate <pointer.json> --root <dir>` prints the
// validation result as JSON; `transcript-pointer --sanitize <file>` prints the
// sanitized text. Exit 0 on a clean run regardless of validity (a not-ok
// pointer is a legitimate signal, not a CLI error); exit 2 on a usage error.
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = { mode: null, pointerPath: null, root: null, sanitizePath: null, sessionPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--validate') {
      opts.mode = 'validate';
      opts.pointerPath = argv[(i += 1)];
    } else if (arg === '--root') {
      opts.root = argv[(i += 1)];
    } else if (arg === '--session-path') {
      opts.sessionPath = argv[(i += 1)];
    } else if (arg === '--sanitize') {
      opts.mode = 'sanitize';
      opts.sanitizePath = argv[(i += 1)];
    } else {
      process.stderr.write(`transcript-pointer: unknown flag: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (opts.mode === 'validate') {
    if (!opts.pointerPath || !opts.root) {
      process.stderr.write('transcript-pointer --validate <pointer.json> --root <dir>\n');
      process.exit(2);
    }
    let pointer;
    try {
      pointer = JSON.parse(fs.readFileSync(opts.pointerPath, 'utf8'));
    } catch (err) {
      process.stderr.write(`transcript-pointer: cannot read pointer: ${err.message}\n`);
      process.exit(2);
    }
    const result = validate(pointer, opts.root, { sessionPath: opts.sessionPath });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(0);
  }
  if (opts.mode === 'sanitize') {
    if (!opts.sanitizePath) {
      process.stderr.write('transcript-pointer --sanitize <file>\n');
      process.exit(2);
    }
    let raw;
    try {
      raw = fs.readFileSync(opts.sanitizePath, 'utf8');
    } catch (err) {
      process.stderr.write(`transcript-pointer: cannot read transcript: ${err.message}\n`);
      process.exit(2);
    }
    process.stdout.write(sanitize(raw));
    process.exit(0);
  }
  process.stderr.write('transcript-pointer: specify --validate or --sanitize\n');
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
