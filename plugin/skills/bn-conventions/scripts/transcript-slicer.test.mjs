import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHARS_PER_TOKEN,
  DEFAULT_BUDGET_FRACTION,
  TOOL_BLOCK_HEAD_BYTES,
  budgetBytes,
  classifyBlock,
  slice,
} from './transcript-slicer.mjs';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function byteLen(s) {
  return Buffer.byteLength(s, 'utf8');
}

// A block of `n` bytes of filler that does NOT accidentally match any keep
// predicate (no ask/reasoning/decision markers).
function filler(n) {
  return 'x'.repeat(n);
}

// Assemble a transcript from blocks separated by a blank line (the slicer splits
// on runs of >=2 newlines).
function transcript(...blocks) {
  return blocks.join('\n\n');
}

const REASONING_BLOCK = '[[banyan:reasoning]]\nI considered the options and chose A.';
const ASK_BLOCK =
  '[[banyan:ask]]\nQuestion: should the wishlist dedupe by SKU or by title?\n' +
  'Recommendation: dedupe by SKU.';

// A large tool-result block whose body far exceeds the truncate threshold.
function bigToolBlock(label, fillerBytes) {
  return `[[banyan:tool-result name=${label}]]\n${filler(fillerBytes)}`;
}

// ---------------------------------------------------------------------------
// budgetBytes()
// ---------------------------------------------------------------------------

test('budgetBytes applies defaults and the byte conversion', () => {
  // 200000 tokens * 0.5 * 4 chars/token
  assert.equal(budgetBytes(), 200_000 * DEFAULT_BUDGET_FRACTION * CHARS_PER_TOKEN);
  assert.equal(budgetBytes({ windowTokens: 1000, budgetFraction: 0.25 }), 1000 * 0.25 * 4);
});

test('budgetBytes falls back on out-of-range params', () => {
  assert.equal(budgetBytes({ budgetFraction: 0 }), budgetBytes());
  assert.equal(budgetBytes({ budgetFraction: 5 }), budgetBytes());
  assert.equal(budgetBytes({ windowTokens: -1 }), budgetBytes());
});

// ---------------------------------------------------------------------------
// classifyBlock() — the keep/drop rule set
// ---------------------------------------------------------------------------

test('classifyBlock recognizes each class', () => {
  assert.equal(classifyBlock('[[banyan:ask]]\nQ?'), 'keep:ask-decision');
  assert.equal(classifyBlock('[[banyan:decision]]\nchose A'), 'keep:ask-decision');
  assert.equal(classifyBlock('ANSWER: do X'), 'keep:ask-decision');
  assert.equal(classifyBlock('[[banyan:reasoning]]\n...'), 'keep:reasoning');
  assert.equal(classifyBlock('REASONING: weighing tradeoffs'), 'keep:reasoning');
  assert.equal(classifyBlock('[[banyan:tool-result name=read]]\nbytes'), 'trunc:tool-result');
  assert.equal(classifyBlock('TOOL-RESULT: read_file\noutput'), 'trunc:tool-result');
  assert.equal(classifyBlock('just some prose nobody marked'), 'keep:other');
});

test('ask wins over a tool marker in the same block (never truncate authority)', () => {
  const mixed = '[[banyan:ask]]\nshould we?\n[[banyan:tool-result name=read]]\n' + filler(2000);
  assert.equal(classifyBlock(mixed), 'keep:ask-decision');
});

// ---------------------------------------------------------------------------
// slice() — the AE3 acceptance scenario
// ---------------------------------------------------------------------------

test('over-budget transcript truncates the file-dump while reasoning + ask survive and output lands under budget', () => {
  const window = 1000;
  const fraction = 0.5;
  const budget = budgetBytes({ windowTokens: window, budgetFraction: fraction });
  // budget = 1000 * 0.5 * 4 = 2000 bytes.

  const dump = bigToolBlock('read_file', 6000); // way over budget on its own
  const text = transcript(REASONING_BLOCK, ASK_BLOCK, dump);
  assert.ok(byteLen(text) > budget, 'fixture must be over budget');

  const { text: out, manifest } = slice(text, {
    windowTokens: window,
    budgetFraction: fraction,
  });

  // Output lands under budget.
  assert.ok(byteLen(out) <= budget, `sliced output ${byteLen(out)} must be <= budget ${budget}`);

  // Reasoning turn and ask event survive IN FULL, byte-for-byte.
  assert.ok(out.includes(REASONING_BLOCK), 'reasoning block must survive intact');
  assert.ok(out.includes(ASK_BLOCK), 'ask block must survive intact');

  // The big dump body is gone; a re-derivable marker names the dropped block.
  assert.ok(!out.includes(filler(6000)), 'the raw dump must not survive');
  assert.match(out, /\[\[banyan:truncated block=\d+ label="read_file" original_bytes=\d+ re-derivable\]\]/);

  // Manifest names the dropped block.
  assert.equal(manifest.sliced, true);
  assert.equal(manifest.dropped.length, 1);
  assert.equal(manifest.dropped[0].label, 'read_file');
  assert.ok(manifest.dropped[0].dropped_bytes > 0);
  assert.equal(
    manifest.dropped[0].original_bytes - manifest.dropped[0].kept_bytes,
    manifest.dropped[0].dropped_bytes,
  );
  assert.equal(manifest.budget_bytes, budget);
  assert.equal(manifest.final_bytes, byteLen(out));
});

test('under-budget transcript is returned unchanged, byte-for-byte', () => {
  const text = transcript(REASONING_BLOCK, ASK_BLOCK, '[[banyan:tool-result name=ls]]\nshort');
  const big = budgetBytes({ windowTokens: 100_000, budgetFraction: 1 });
  assert.ok(byteLen(text) < big);

  const { text: out, manifest } = slice(text, { windowTokens: 100_000, budgetFraction: 1 });
  assert.equal(out, text);
  assert.equal(manifest.sliced, false);
  assert.deepEqual(manifest.dropped, []);
  assert.equal(manifest.original_bytes, byteLen(text));
  assert.equal(manifest.final_bytes, byteLen(text));
});

// ---------------------------------------------------------------------------
// Determinism — the whole point (R16 non-LLM)
// ---------------------------------------------------------------------------

test('same input + budget yields byte-for-byte identical slice and manifest', () => {
  const text = transcript(
    REASONING_BLOCK,
    bigToolBlock('a', 5000),
    ASK_BLOCK,
    bigToolBlock('b', 4000),
  );
  const opts = { windowTokens: 1000, budgetFraction: 0.5 };
  const first = slice(text, opts);
  const second = slice(text, opts);
  assert.equal(first.text, second.text);
  assert.deepEqual(first.manifest, second.manifest);
});

test('truncation order is largest-block-first and deterministic; only enough blocks are cut', () => {
  // Two big tool blocks; budget large enough that truncating only the LARGER
  // one suffices. The larger must be the one truncated.
  const small = bigToolBlock('small', 2000);
  const large = bigToolBlock('large', 9000);
  const text = transcript(REASONING_BLOCK, small, large);
  const total = byteLen(text);
  // Pick a budget below total but above (total - large_savings) so cutting the
  // large block alone brings us under. Large saves ~8800 bytes, so a budget of
  // total - 5000 is reachable by cutting only the large block. We choose a
  // window/fraction (fraction <= 1, so no default fallback) that yields exactly
  // that byte budget: budget = window * fraction * CHARS_PER_TOKEN.
  const targetBudget = total - 5000;
  const window = 100_000;
  const fraction = targetBudget / (window * CHARS_PER_TOKEN);
  assert.ok(fraction > 0 && fraction <= 1, 'test fraction must be in (0,1]');
  const { text: out, manifest } = slice(text, { windowTokens: window, budgetFraction: fraction });

  assert.equal(manifest.budget_bytes, targetBudget);
  assert.ok(byteLen(out) <= manifest.budget_bytes);
  // Only the large block was truncated.
  assert.equal(manifest.dropped.length, 1);
  assert.equal(manifest.dropped[0].label, 'large');
  // The small block's raw body survives untouched.
  assert.ok(out.includes(filler(2000)));
});

// ---------------------------------------------------------------------------
// Conservative keep behavior — never silently drop non-tool content
// ---------------------------------------------------------------------------

test('unclassified bulk content is kept even when over budget (truncate only tool-results)', () => {
  // A huge "other" block with no tool marker: it must NOT be truncated even
  // though the transcript is over budget — only re-derivable tool output is
  // truncatable. The result may stay over budget; that is correct (honest:
  // there is nothing safe to drop).
  const bulk = filler(8000); // no marker => keep:other
  const text = transcript(REASONING_BLOCK, bulk);
  const { text: out, manifest } = slice(text, { windowTokens: 1000, budgetFraction: 0.5 });
  assert.ok(out.includes(bulk), 'unclassified bulk must survive');
  assert.equal(manifest.sliced, false);
  assert.deepEqual(manifest.dropped, []);
});

test('a small tool-result under the truncate threshold is left alone', () => {
  // Over budget overall (via a big other block we cannot touch), but the tool
  // block is below TOOL_BLOCK_MIN_TRUNCATE_BYTES so it is not a candidate.
  const tinyTool = '[[banyan:tool-result name=ls]]\nshort output';
  const text = transcript(filler(9000), tinyTool);
  const { text: out, manifest } = slice(text, { windowTokens: 1000, budgetFraction: 0.5 });
  assert.ok(out.includes(tinyTool));
  assert.equal(manifest.sliced, false);
});

// ---------------------------------------------------------------------------
// Truncation marker integrity
// ---------------------------------------------------------------------------

test('truncated block preserves a head of context then the marker', () => {
  const head = 'HEADER-LINE describing the tool call output that follows';
  const body = `[[banyan:tool-result name=grep]]\n${head}${filler(6000)}`;
  const text = transcript(REASONING_BLOCK, body);
  const { text: out, manifest } = slice(text, { windowTokens: 1000, budgetFraction: 0.5 });

  assert.equal(manifest.dropped.length, 1);
  // Some head context survives (at most TOOL_BLOCK_HEAD_BYTES bytes of it).
  assert.ok(out.includes('[[banyan:tool-result name=grep]]'));
  assert.ok(out.includes('HEADER-LINE'));
  // kept_bytes is bounded by head budget + marker.
  assert.ok(manifest.dropped[0].kept_bytes <= TOOL_BLOCK_HEAD_BYTES + 200);
});

test('the truncation marker reports the block original_bytes consistent with the manifest', () => {
  const body = `[[banyan:tool-result name=a]]\n${filler(7000)}`;
  const text = transcript(REASONING_BLOCK, body);
  const { text: out, manifest } = slice(text, { windowTokens: 1, budgetFraction: 1 });

  assert.equal(manifest.dropped.length, 1);
  const entry = manifest.dropped[0];
  // The marker's original_bytes must equal the manifest's original_bytes for the
  // same block — one source of truth, no disagreement.
  const m = out.match(/\[\[banyan:truncated block=(\d+) label="a" original_bytes=(\d+) re-derivable\]\]/);
  assert.ok(m, 'marker present');
  assert.equal(Number(m[1]), entry.block);
  assert.equal(Number(m[2]), entry.original_bytes);
  // The marker carries NO dropped_bytes (the manifest is authoritative for the
  // exact drop). The manifest's invariant still holds.
  assert.ok(!/dropped_bytes/.test(out), 'marker must not print a dropped_bytes that could disagree');
  assert.equal(entry.dropped_bytes, entry.original_bytes - entry.kept_bytes);
});

// ---------------------------------------------------------------------------
// Multibyte / UTF-8 byte handling
// ---------------------------------------------------------------------------

test('budget and truncation are byte-correct for multibyte content; head never splits a codepoint', () => {
  // A tool block whose body is multibyte (each emoji is 4 UTF-8 bytes) and far
  // over the head budget. headBytes must cut on a character boundary (no broken
  // replacement char survives) and the manifest must account in BYTES.
  const emoji = '😀'; // 4 UTF-8 bytes, 2 UTF-16 code units
  const bodyChars = emoji.repeat(3000); // 12000 bytes
  const block = `[[banyan:tool-result name=emoji]]\n${bodyChars}`;
  const text = transcript(REASONING_BLOCK, block);
  const { text: out, manifest } = slice(text, { windowTokens: 1, budgetFraction: 1 });

  assert.equal(manifest.dropped.length, 1);
  // No broken/replacement character in the output (head cut respected codepoints).
  assert.ok(!out.includes('�'), 'no replacement char from a mid-codepoint cut');
  // Manifest byte accounting is internally consistent and matches actual bytes.
  const entry = manifest.dropped[0];
  assert.equal(entry.dropped_bytes, entry.original_bytes - entry.kept_bytes);
  assert.equal(manifest.final_bytes, byteLen(out));
});

// ---------------------------------------------------------------------------
// Separator round-trip exactness
// ---------------------------------------------------------------------------

test('a no-truncation under-budget transcript with varied separators round-trips byte-for-byte', () => {
  // Mixed separators: blank line, then a triple-newline gap, plus a trailing
  // newline — the no-op path must reproduce the input exactly.
  const text = `${REASONING_BLOCK}\n\n${ASK_BLOCK}\n\n\nsome closing note\n`;
  const { text: out, manifest } = slice(text, { windowTokens: 100_000, budgetFraction: 1 });
  assert.equal(out, text);
  assert.equal(manifest.sliced, false);
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

test('slice rejects non-string input', () => {
  assert.throws(() => slice(42), TypeError);
  assert.throws(() => slice(null), TypeError);
});

test('empty string is under budget and returned unchanged', () => {
  const { text, manifest } = slice('');
  assert.equal(text, '');
  assert.equal(manifest.sliced, false);
});
