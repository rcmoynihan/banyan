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
//   budget_bytes:  number,
//   original_bytes: number,
//   final_bytes:   number,
//   dropped: [ { block, label, original_bytes, kept_bytes, dropped_bytes } ],
// }
//
// Determinism guarantees:
//   - Truncation candidates are ordered (bytes DESC, then block index ASC) — a
//     total order, so the greedy choice is reproducible.
//   - Classification is pure regex; the truncation marker is a fixed template.
//   - Output preserves original block order; only candidate bodies change.
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
      budget_bytes: budget,
      original_bytes: originalBytes,
      final_bytes: finalBytes,
      dropped,
    },
  };
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
