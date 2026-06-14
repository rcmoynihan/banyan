#!/usr/bin/env node

// transcript-slicer.mjs — a deterministic, non-LLM oversize transcript slicer
// (R16). When a (already-sanitized, R15) transcript exceeds a configured
// fraction of the continuation's context window, this keeps reasoning turns and
// ask/decision events intact and truncates large, re-derivable tool-result
// blocks, returning the sliced text PLUS a drop manifest (an audit record of
// what was truncated).
//
// The whole point is determinism: the same input + the same budget always yield
// byte-for-byte the same slice and the same manifest. There is NO clock, NO
// randomness, NO filesystem, and NO model call — slice() is a pure function of
// its arguments. The threshold is a parameter the continuation passes from its
// own measured budget (R16: "measured by the continuation"); the parent is
// never involved.
//
// The transcript is treated as OPAQUE TEXT (DI2 / R15): the slicer never parses
// internal transcript fields as load-bearing. It splits the text into blocks on
// blank-line boundaries and classifies each block by a small, explicit set of
// marker predicates over its raw lines. Anything it cannot positively classify
// as a re-derivable tool result is KEPT — over-dropping is a defect.
//
// Public surface:
//   slice(text, { budgetFraction, windowTokens }) -> { text, manifest }
//
// Zero dependencies — node:* only (node:process for the CLI).

import process from 'node:process';

// ---------------------------------------------------------------------------
// Tunable constants — the keep/drop rule set's thresholds, settled in-unit.
// Documented in this unit's progress note; U6 mirrors the RULE NAMES in
// consult-protocol.md. Exported so tests can pin behavior against the exact
// constants rather than hard-coding magic numbers in two places.
// ---------------------------------------------------------------------------

export const DEFAULT_BUDGET_FRACTION = 0.5;
export const DEFAULT_WINDOW_TOKENS = 200_000;

// Deterministic, non-LLM byte->token estimate. A continuation measures its
// window in tokens; we convert the byte budget with a fixed ratio so the slicer
// stays a pure text function (no tokenizer dependency).
export const CHARS_PER_TOKEN = 4;

// A tool-result block must exceed this byte length to be a truncation candidate
// — truncating a small block costs more (the marker) than it saves.
export const TOOL_BLOCK_MIN_TRUNCATE_BYTES = 512;

// Bytes of head context preserved when a tool-result block is truncated, so the
// continuation still sees what the output was about before the re-derivable
// marker.
export const TOOL_BLOCK_HEAD_BYTES = 200;

// ---------------------------------------------------------------------------
// Block classification — pure predicates over a block's raw text.
// ---------------------------------------------------------------------------
//
// Priority order matters: a block that carries BOTH an ask marker and a tool
// marker is classified as keep (ask wins) — we never truncate a block that
// carries decision authority. The four classes:
//
//   'keep:ask-decision' — ask / decision / answer events. Never truncated. (R16)
//   'keep:reasoning'    — reasoning turns. Never truncated. (R16)
//   'trunc:tool-result' — large re-derivable tool output. Truncation candidate.
//   'keep:other'        — unclassified. Kept (conservative default).
//
// Markers are matched per-line, case-insensitively, against the block's lines so
// a marker anywhere in the block classifies it. The Banyan control-marker forms
// (`[[banyan:...]]`) are the canonical machine markers; the bare-prefix forms
// (`ASK:` etc.) are human-readable fallbacks a transcript may carry.

const ASK_DECISION_PREDICATES = [
  (line) => /\[\[banyan:(ask|decision|answer)\b/i.test(line),
  (line) => /^\s*(ASK|DECISION|ANSWER)\s*:/i.test(line),
];

const REASONING_PREDICATES = [
  (line) => /\[\[banyan:reasoning\b/i.test(line),
  (line) => /^\s*(REASONING|THOUGHT)\s*:/i.test(line),
  (line) => /^\s*#{1,6}\s+reasoning\b/i.test(line),
];

const TOOL_RESULT_PREDICATES = [
  (line) => /\[\[banyan:tool-result\b/i.test(line),
  (line) => /^\s*(TOOL[-_ ]RESULT|TOOL OUTPUT)\s*:/i.test(line),
];

function anyLineMatches(lines, predicates) {
  for (const line of lines) {
    for (const predicate of predicates) {
      if (predicate(line)) {
        return true;
      }
    }
  }
  return false;
}

// Parse a short, stable label for the manifest from a tool-result marker line,
// e.g. `[[banyan:tool-result name=read_file]]` -> "read_file". Falls back to the
// generic class name when no name is present. Pure; deterministic.
function toolResultLabel(lines) {
  for (const line of lines) {
    const named = line.match(/\[\[banyan:tool-result[^\]]*\bname=([A-Za-z0-9._-]+)/i);
    if (named) {
      return named[1];
    }
    const prefixed = line.match(/^\s*(?:TOOL[-_ ]RESULT|TOOL OUTPUT)\s*:\s*([A-Za-z0-9._-]+)/i);
    if (prefixed) {
      return prefixed[1];
    }
  }
  return 'tool-result';
}

// classifyBlock(blockText) -> one of the four class strings. Exported for tests.
export function classifyBlock(blockText) {
  const lines = blockText.split('\n');
  if (anyLineMatches(lines, ASK_DECISION_PREDICATES)) {
    return 'keep:ask-decision';
  }
  if (anyLineMatches(lines, REASONING_PREDICATES)) {
    return 'keep:reasoning';
  }
  if (anyLineMatches(lines, TOOL_RESULT_PREDICATES)) {
    return 'trunc:tool-result';
  }
  return 'keep:other';
}

// ---------------------------------------------------------------------------
// JSONL record classification — the REAL production transcript shape.
// ---------------------------------------------------------------------------
//
// The plugin's transcripts are JSONL: one complete JSON record per line, with no
// `[[banyan:...]]` markers and no blank-line block structure. The marker
// vocabulary above is a human-readable convenience that no producer emits, so on
// a real transcript the block path is a no-op (R16/AE3 would be inert). To make
// the slicer honestly operate on the real input we classify each LINE as an
// opaque JSONL record and treat a parseable, re-derivable record as a truncation
// candidate by byte size — exactly as DI2 prescribes (the record is opaque text;
// we never read an internal field as load-bearing for keep/drop EXCEPT the
// minimal, explicit "is this an ask/decision/reasoning event?" guard so decision
// authority is never truncated).

// A line is a re-derivable JSONL tool/observation record (truncation candidate)
// iff it parses as a complete JSON object AND does not carry ask/decision/answer
// or reasoning authority. We inspect only the small, explicit set of keys that
// mark decision authority; everything else about the record stays opaque.
const JSONL_AUTHORITY_KEYS = new Set(['ask', 'decision', 'answer', 'reasoning']);
const JSONL_AUTHORITY_TYPES = new Set(['ask', 'decision', 'answer', 'reasoning']);

function isAuthorityRecord(obj) {
  if (!obj || typeof obj !== 'object') return false;
  for (const key of Object.keys(obj)) {
    if (JSONL_AUTHORITY_KEYS.has(key.toLowerCase())) return true;
  }
  if (typeof obj.type === 'string' && JSONL_AUTHORITY_TYPES.has(obj.type.toLowerCase())) {
    return true;
  }
  if (typeof obj.event === 'string' && JSONL_AUTHORITY_TYPES.has(obj.event.toLowerCase())) {
    return true;
  }
  return false;
}

// classifyJsonlLine(line) -> 'trunc:jsonl-record' | 'keep'. A line that parses as
// a JSON object and carries no decision authority is a re-derivable record we may
// truncate; anything else (non-JSON prose, an authority record) is kept.
export function classifyJsonlLine(line) {
  const trimmed = line.trim();
  if (trimmed === '' || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return 'keep';
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return 'keep';
  }
  if (parsed === null || typeof parsed !== 'object') return 'keep';
  if (isAuthorityRecord(parsed)) return 'keep';
  return 'trunc:jsonl-record';
}

// A short, stable label for a JSONL record's manifest entry, derived from its
// `type` (or `event`) field when present. Deterministic; falls back to a generic.
function jsonlRecordLabel(line) {
  try {
    const obj = JSON.parse(line.trim());
    if (obj && typeof obj === 'object') {
      const raw = obj.type ?? obj.event;
      if (typeof raw === 'string') {
        const safe = raw.replace(/[^A-Za-z0-9._-]/g, '');
        if (safe.length > 0) return safe;
      }
    }
  } catch {
    // fall through to the generic label
  }
  return 'jsonl-record';
}

// ---------------------------------------------------------------------------
// Byte helpers — the budget is in BYTES (UTF-8), so all sizing uses byteLength,
// not string .length, to stay correct for multibyte content.
// ---------------------------------------------------------------------------

function byteLen(str) {
  return Buffer.byteLength(str, 'utf8');
}

// Take the first `maxBytes` UTF-8 bytes of `str` without splitting a multibyte
// character. Returns the largest whole-character prefix that fits. Pure.
function headBytes(str, maxBytes) {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) {
    return str;
  }
  // Decode the first maxBytes bytes; toString may leave a replacement char if
  // the cut lands mid-codepoint. Trim any trailing U+FFFD so we never emit a
  // broken/garbled character.
  let slice = buf.subarray(0, maxBytes).toString('utf8');
  if (slice.endsWith('�')) {
    slice = slice.slice(0, -1);
  }
  return slice;
}

// ---------------------------------------------------------------------------
// Budget computation.
// ---------------------------------------------------------------------------

// budgetBytes({ budgetFraction, windowTokens }) -> integer byte budget. Defaults
// applied for omitted/invalid params. Deterministic.
export function budgetBytes({ budgetFraction, windowTokens } = {}) {
  const fraction =
    typeof budgetFraction === 'number' && budgetFraction > 0 && budgetFraction <= 1
      ? budgetFraction
      : DEFAULT_BUDGET_FRACTION;
  const window =
    typeof windowTokens === 'number' && windowTokens > 0 ? windowTokens : DEFAULT_WINDOW_TOKENS;
  return Math.round(window * fraction * CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Block splitting — split on blank-line boundaries while preserving enough
// structure to rejoin byte-for-byte when nothing is truncated.
// ---------------------------------------------------------------------------
//
// We split the text into segments on runs of "\n\n" so that joining the segments
// back with the same separators reproduces the input exactly. To keep this
// reversible we capture the separators too: text === segments.join('') after we
// interleave bodies and separators. We model the transcript as an alternating
// list of [body, sep, body, sep, ...]; each body is a block, each sep is the
// blank-line gap that followed it (possibly empty for the last block).

function splitBlocks(text) {
  // Split keeping the delimiters: a delimiter is a run of >=2 newlines (a blank
  // line between blocks). Single newlines stay inside a block.
  const parts = text.split(/(\n{2,})/);
  // parts alternates body, sep, body, sep, ... Bodies at even indices, seps at
  // odd. Build blocks with their trailing separator so reassembly is exact.
  const blocks = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = parts[i];
    const sep = i + 1 < parts.length ? parts[i + 1] : '';
    blocks.push({ body, sep });
  }
  return blocks;
}

function joinBlocks(blocks) {
  let out = '';
  for (const b of blocks) {
    out += b.body + b.sep;
  }
  return out;
}

// ---------------------------------------------------------------------------
// slice(text, opts) -> { text, manifest }
// ---------------------------------------------------------------------------
//
// manifest = {
//   sliced:        boolean,         // whether any truncation happened
//   budget_met:    boolean,         // final_bytes <= budget_bytes — the caller's
//                                   //   fit signal: false means the result STILL
//                                   //   exceeds budget (nothing safe was left to
//                                   //   drop), so the caller must fail closed
//                                   //   rather than load an over-budget transcript.
//   budget_bytes:  number,
//   original_bytes: number,
//   final_bytes:   number,
//   dropped: [ { block, label, original_bytes, kept_bytes, dropped_bytes } ],
// }
//
// Determinism guarantees:
//   - Truncation candidates are ordered (bytes DESC, then block index ASC) — a
//     total order, so the greedy choice is reproducible.
//   - Classification is pure regex / pure JSON-parse; the marker is a fixed template.
//   - Output preserves original block and line order; only candidate bodies change.
export function slice(text, opts = {}) {
  if (typeof text !== 'string') {
    throw new TypeError('slice expects transcript text as a string');
  }

  const budget = budgetBytes(opts);
  const originalBytes = byteLen(text);

  // Under (or at) budget: return the input UNCHANGED, byte-for-byte. (R15: the
  // continuation loads the transcript whole by default; the slicer only acts
  // when over budget.)
  if (originalBytes <= budget) {
    return {
      text,
      manifest: {
        sliced: false,
        budget_met: true,
        budget_bytes: budget,
        original_bytes: originalBytes,
        final_bytes: originalBytes,
        dropped: [],
      },
    };
  }

  const blocks = splitBlocks(text);

  // Build the candidate list: tool-result blocks large enough to be worth
  // truncating. Each carries its index, classification-derived label, and the
  // current body byte length.
  const candidates = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const cls = classifyBlock(blocks[i].body);
    if (cls !== 'trunc:tool-result') {
      continue;
    }
    const bytes = byteLen(blocks[i].body);
    if (bytes <= TOOL_BLOCK_MIN_TRUNCATE_BYTES) {
      continue;
    }
    candidates.push({
      index: i,
      label: toolResultLabel(blocks[i].body.split('\n')),
      bytes,
    });
  }

  // Total order: largest blocks first (most budget reclaimed per truncation),
  // then ascending index as a stable, deterministic tiebreak.
  candidates.sort((a, b) => (b.bytes - a.bytes) || (a.index - b.index));

  const dropped = [];
  let currentBytes = originalBytes;

  for (const cand of candidates) {
    if (currentBytes <= budget) {
      break;
    }
    const block = blocks[cand.index];
    const original = block.body;
    const head = headBytes(original, TOOL_BLOCK_HEAD_BYTES);
    // The marker reports the block's ORIGINAL byte size, not a dropped count.
    // original_bytes is known before the marker is built (no fixed-point: the
    // marker's own length does not feed back into the number it prints), and it
    // is unambiguous — a `dropped_bytes` in the marker would necessarily disagree
    // with the manifest, because the replacement is head + "\n" + marker, so the
    // bytes actually removed depend on the marker's own length. The EXACT drop
    // accounting (original/kept/dropped, where dropped == original - kept) lives
    // in the manifest, which is the single source of truth; the marker carries
    // only the original size and the re-derivable flag so a reader knows how much
    // re-derivable output was elided here.
    const marker =
      `[[banyan:truncated block=${cand.index} label="${cand.label}" ` +
      `original_bytes=${cand.bytes} re-derivable]]`;
    // The truncated body is the preserved head + a newline + the marker. We use
    // a newline so the marker is on its own line and never merges into the head.
    const replacement = head.length > 0 ? `${head}\n${marker}` : marker;

    const before = byteLen(block.body);
    block.body = replacement;
    const after = byteLen(block.body);
    currentBytes -= before - after;

    dropped.push({
      block: cand.index,
      label: cand.label,
      original_bytes: before,
      kept_bytes: after,
      dropped_bytes: before - after,
    });
  }

  // --- JSONL record pass ----------------------------------------------------
  // If still over budget after the marker-block pass, truncate the largest
  // re-derivable JSONL records (the real production transcript shape: one JSON
  // record per line, no markers). Each candidate is a single line that parses as
  // a non-authority JSON object. Without this pass the slicer is a NO-OP on real
  // transcripts (R16/AE3 inert) even though it is over budget.
  if (currentBytes > budget) {
    currentBytes = sliceJsonlRecords(blocks, budget, currentBytes, dropped);
  }

  // Manifest entries follow truncation order (largest-first). Sort by block
  // index ascending for a stable, readable audit record that matches transcript
  // order regardless of which blocks were chosen.
  dropped.sort((a, b) => a.block - b.block);

  const outText = joinBlocks(blocks);
  const finalBytes = byteLen(outText);

  return {
    text: outText,
    manifest: {
      sliced: dropped.length > 0,
      // The honest fit signal: even after truncating everything safe to drop, the
      // result may still exceed budget (an all-incompressible transcript). The
      // caller must gate on this — load only when budget_met is true.
      budget_met: finalBytes <= budget,
      budget_bytes: budget,
      original_bytes: originalBytes,
      final_bytes: finalBytes,
      dropped,
    },
  };
}

// Truncate the largest re-derivable JSONL record lines (largest-first, stable)
// across all blocks until under budget or no candidates remain. Mutates block
// bodies in place and appends manifest entries to `dropped`. Returns the updated
// running byte total. Determinism: candidate order is (bytes DESC, block index
// ASC, line index ASC) — a total order; the replacement marker is a fixed
// template; only candidate lines change.
function sliceJsonlRecords(blocks, budget, startingBytes, dropped) {
  // Gather every truncatable JSONL record line with a stable address.
  const candidates = [];
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const lines = blocks[bi].body.split('\n');
    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li];
      if (classifyJsonlLine(line) !== 'trunc:jsonl-record') continue;
      const bytes = byteLen(line);
      if (bytes <= TOOL_BLOCK_MIN_TRUNCATE_BYTES) continue;
      candidates.push({ block: bi, line: li, bytes, label: jsonlRecordLabel(line) });
    }
  }
  candidates.sort(
    (a, b) => (b.bytes - a.bytes) || (a.block - b.block) || (a.line - b.line),
  );

  let currentBytes = startingBytes;
  // Group selected truncations by block so each block body is rebuilt once.
  const perBlockReplacements = new Map(); // block index -> Map(lineIndex -> replacement line)

  for (const cand of candidates) {
    if (currentBytes <= budget) break;
    const blockLines = blocks[cand.block].body.split('\n');
    const original = blockLines[cand.line];
    const head = headBytes(original, TOOL_BLOCK_HEAD_BYTES);
    const marker =
      `[[banyan:truncated record=${cand.block}:${cand.line} label="${cand.label}" ` +
      `original_bytes=${cand.bytes} re-derivable]]`;
    // Keep the truncated record on a SINGLE line (head + marker) so the JSONL
    // line count and record boundaries are preserved for the next reader.
    const replacement = head.length > 0 ? `${head} ${marker}` : marker;
    const before = cand.bytes;
    const after = byteLen(replacement);

    if (!perBlockReplacements.has(cand.block)) perBlockReplacements.set(cand.block, new Map());
    perBlockReplacements.get(cand.block).set(cand.line, replacement);

    currentBytes -= before - after;
    dropped.push({
      block: cand.block,
      label: cand.label,
      original_bytes: before,
      kept_bytes: after,
      dropped_bytes: before - after,
    });
  }

  // Rebuild each touched block body once, preserving line order and the newline
  // separators between records.
  for (const [bi, lineMap] of perBlockReplacements) {
    const blockLines = blocks[bi].body.split('\n');
    for (const [li, replacement] of lineMap) {
      blockLines[li] = replacement;
    }
    blocks[bi].body = blockLines.join('\n');
  }

  return currentBytes;
}

// ---------------------------------------------------------------------------
// CLI: `transcript-slicer <file> [--budget-fraction <f>] [--window-tokens <n>]`
// prints the sliced text to stdout and the manifest to stderr as JSON. Exit 0 on
// a clean run; exit 2 on a usage / read error. A no-op (under budget) is a clean
// run, not an error.
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = { file: null, budgetFraction: undefined, windowTokens: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--budget-fraction') {
      opts.budgetFraction = Number(argv[(i += 1)]);
    } else if (arg === '--window-tokens') {
      opts.windowTokens = Number(argv[(i += 1)]);
    } else if (!arg.startsWith('--') && opts.file === null) {
      opts.file = arg;
    } else {
      process.stderr.write(`transcript-slicer: unknown or misplaced argument: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

async function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (!opts.file) {
    process.stderr.write(
      'transcript-slicer <file> [--budget-fraction <f>] [--window-tokens <n>]\n',
    );
    process.exit(2);
  }
  const { readFileSync } = await import('node:fs');
  let raw;
  try {
    raw = readFileSync(opts.file, 'utf8');
  } catch (err) {
    process.stderr.write(`transcript-slicer: cannot read transcript: ${err.message}\n`);
    process.exit(2);
  }
  const { text, manifest } = slice(raw, {
    budgetFraction: opts.budgetFraction,
    windowTokens: opts.windowTokens,
  });
  process.stdout.write(text);
  process.stderr.write(`${JSON.stringify(manifest, null, 2)}\n`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
