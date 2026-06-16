// U1 — parser + tailer risk-spike tests against U1b's committed fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseLine, parseLines } from './jsonl-line.mjs';
import {
  extractPrompt, extractModel, extractTokens, extractTiming, extractSpawnEdges,
  contentToText, UNAVAILABLE, isUnavail,
} from './transcript-fields.mjs';
import { createCursor, advance, reconcileSize } from './offset-cursor.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (...p) => join(here, '..', '..', 'test', 'fixtures', ...p);

test('parseLine never throws on a torn line; surfaces {ok:false}', () => {
  const torn = '{"type":"assistant","message":{"content":[{"text":"truncated caf';
  const r = parseLine(torn);
  assert.equal(r.ok, false);
  assert.equal(typeof r.raw, 'string');
});

test('torn/ fixture: 3 records parse, torn trailing line dropped, 0 throws', () => {
  const raw = readFileSync(fixture('torn', 'agent-torn.jsonl'), 'utf8');
  const { records, dropped } = parseLines(raw);
  assert.equal(records.length, 3, '3 well-formed records');
  assert.equal(dropped.length, 1, 'the torn line is surfaced as dropped');
  assert.ok(dropped[0].raw.includes('café men'), 'dropped line is the torn one');
});

test('offset cursor: a 3-byte split of a multi-byte UTF-8 line reassembles to one record', () => {
  // A line containing a multi-byte char, split mid-character across two reads.
  const fullLine = '{"type":"user","message":{"content":"café ☕ done"}}\n';
  const bytes = Buffer.from(fullLine, 'utf8');
  // Split 3 bytes in (lands inside the multi-byte 'é' sequence if we pick the right offset).
  const idx = Buffer.from('{"type":"user","message":{"content":"caf', 'utf8').length + 1;
  const head = bytes.subarray(0, idx);
  const tail = bytes.subarray(idx);

  let c = createCursor({ from: 'zero' });
  let out = advance(c, head);
  assert.equal(out.lines.length, 0, 'no complete line yet (split mid-line, mid-char)');
  out = advance(out.cursor, tail);
  assert.equal(out.lines.length, 1, 'one complete line after the rest arrives');
  const rec = parseLine(out.lines[0]);
  assert.equal(rec.ok, true);
  assert.equal(rec.record.message.content, 'café ☕ done', 'multi-byte char reassembled whole');
});

test('offset cursor: incomplete trailing line carried in partial, not emitted', () => {
  let c = createCursor();
  const out = advance(c, Buffer.from('{"a":1}\n{"b":2', 'utf8'));
  assert.equal(out.lines.length, 1);
  assert.equal(out.cursor.partial.toString('utf8'), '{"b":2', 'incomplete line carried');
  assert.equal(out.cursor.offset, Buffer.from('{"a":1}\n{"b":2').length);
});

test('offset cursor: size < offset triggers a truncation reset', () => {
  const c = createCursor({ offset: 500 });
  const { cursor, reset } = reconcileSize(c, 10);
  assert.equal(reset, true);
  assert.equal(cursor.offset, 0);
  assert.equal(cursor.from, 'zero');
});

test('drift/ fixture: tokens unavailable, array content handled, Task spawn recovered', () => {
  const raw = readFileSync(fixture('drift', 'agent-drift.jsonl'), 'utf8');
  const { records, dropped } = parseLines(raw);
  assert.equal(dropped.length, 0, 'no drift line throws');
  // renamed/missing usage → tokens UNAVAILABLE (never 0)
  const tokens = extractTokens(records);
  assert.ok(isUnavail(tokens), 'tokens must be unavailable, not 0');
  // array content handled
  assert.ok(records.some((r) => Array.isArray(r?.message?.content)));
  // the Task-named spawn recovered by STRUCTURED parse (the edge is U4's to assert)
  const edges = extractSpawnEdges(records);
  assert.equal(edges.length, 1, 'one spawn edge recovered from the Task tool_use');
  assert.equal(edges[0].id, 'toolu_DRIFTSPAWN0001');
  assert.equal(edges[0].subagentType, 'banyan:bn-correctness-reviewer');
});

test('field extractors scan (not position): model/usage never read from the opening user line', () => {
  const records = [
    { type: 'user', message: { content: 'envelope text' }, timestamp: '2026-06-14T17:00:00.000Z' },
    { type: 'assistant', message: { model: 'claude-opus-4-8', usage: { input_tokens: 10, output_tokens: 4 }, content: [{ type: 'text', text: 'hi' }] }, timestamp: '2026-06-14T17:00:30.000Z' },
    { type: 'assistant', message: { model: 'claude-opus-4-8', usage: { input_tokens: 5, output_tokens: 2 }, content: [{ type: 'text', text: 'bye' }] }, timestamp: '2026-06-14T17:01:00.000Z' },
  ];
  assert.equal(extractPrompt(records), 'envelope text');
  assert.equal(extractModel(records), 'claude-opus-4-8');
  const tokens = extractTokens(records);
  assert.equal(tokens.inputTokens, 15);
  assert.equal(tokens.outputTokens, 6);
  assert.equal(tokens.totalTokens, 21);
  const timing = extractTiming(records);
  assert.equal(timing.startTime, '2026-06-14T17:00:00.000Z');
  assert.equal(timing.endTime, '2026-06-14T17:01:00.000Z');
});

test('contentToText handles string, block-array, and unknown shapes', () => {
  assert.equal(contentToText('plain'), 'plain');
  assert.equal(contentToText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }]), 'a\nb');
  assert.equal(isUnavail(contentToText(undefined)), true);
  assert.equal(isUnavail(contentToText(42)), true);
});

test('parseLine rejects bare scalars and empty lines', () => {
  assert.equal(parseLine('42').ok, false);
  assert.equal(parseLine('"str"').ok, false);
  assert.equal(parseLine('   ').ok, false);
  assert.equal(parseLine('null').ok, false);
});
