import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { hashProjectRoot, sanitize, validate } from './transcript-pointer.mjs';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

// Build a temp "session root" holding subagents/agent-<id>.jsonl, and return a
// well-formed pointer for it plus the root used as the project root. validate()
// resolves the transcript via locate-transcript's resolveTranscriptPath, which
// honors an explicit sessionPath (envelope push-down) — we pass the temp
// session root as both project root and sessionPath so the test is fully
// hermetic (no dependence on ~/.claude).
function createFixture(t, transcriptText) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-tp-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const agentId = 'fixture-agent-123';
  const subagentsDir = path.join(root, 'subagents');
  fs.mkdirSync(subagentsDir, { recursive: true });
  const transcriptPath = path.join(subagentsDir, `agent-${agentId}.jsonl`);
  const buf = Buffer.from(transcriptText, 'utf8');
  fs.writeFileSync(transcriptPath, buf);

  const pointer = {
    agent_id: agentId,
    session_id: 'session-abc',
    project_root_hash: hashProjectRoot(root),
    spawn_timestamp: '2026-06-13T12:00:00.000Z',
    file_hash: crypto.createHash('sha256').update(buf).digest('hex'),
    byte_size: buf.length,
  };

  return { root, agentId, transcriptPath, pointer };
}

function validateFixture(fixture, pointerOverride) {
  const pointer = pointerOverride ?? fixture.pointer;
  // sessionPath = root keeps resolution hermetic (push-down precedence).
  return validate(pointer, fixture.root, { sessionPath: fixture.root });
}

function reasonsFor(result, field) {
  return result.mismatches.filter((m) => m.field === field).map((m) => m.reason);
}

const SAMPLE_TRANSCRIPT = ['{"line":1}', '{"line":2}', '{"line":3}'].join('\n') + '\n';

// ---------------------------------------------------------------------------
// validate(): the happy path
// ---------------------------------------------------------------------------

test('a well-formed pointer validates against its transcript', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const result = validateFixture(fx);
  assert.equal(result.ok, true, JSON.stringify(result.mismatches));
  assert.equal(result.located, true);
  assert.deepEqual(result.mismatches, []);
});

// ---------------------------------------------------------------------------
// validate(): each corruption class fails with the right reason
// ---------------------------------------------------------------------------

test('a tampered transcript (bad hash) fails with hash-mismatch but is located', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  // Mutate the file content WITHOUT changing its byte length, so only the hash
  // catches it (proves the hash check is independent of the size check).
  const tampered = SAMPLE_TRANSCRIPT.replace('{"line":2}', '{"line":9}');
  assert.equal(Buffer.byteLength(tampered), Buffer.byteLength(SAMPLE_TRANSCRIPT));
  fs.writeFileSync(fx.transcriptPath, tampered);

  const result = validateFixture(fx);
  assert.equal(result.ok, false);
  assert.equal(result.located, true, 'a present-but-tampered file is still located');
  assert.deepEqual(reasonsFor(result, 'file_hash'), ['hash-mismatch']);
});

test('a wrong project root fails with project-root-mismatch before any read', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const otherRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-tp-other-')));
  t.after(() => fs.rmSync(otherRoot, { recursive: true, force: true }));

  const result = validate(fx.pointer, otherRoot, { sessionPath: fx.root });
  assert.equal(result.ok, false);
  assert.equal(result.located, false, 'a root mismatch refuses before touching the filesystem');
  assert.deepEqual(reasonsFor(result, 'project_root_hash'), ['project-root-mismatch']);
});

test('a missing required field fails with missing-field', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const broken = { ...fx.pointer };
  delete broken.file_hash;

  const result = validateFixture(fx, broken);
  assert.equal(result.ok, false);
  assert.deepEqual(reasonsFor(result, 'file_hash'), ['missing-field']);
});

test('a stale size fails with size-mismatch', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  // Pointer claims a different byte_size than the file actually has.
  const staleSize = { ...fx.pointer, byte_size: fx.pointer.byte_size + 100 };

  const result = validateFixture(fx, staleSize);
  assert.equal(result.ok, false);
  assert.equal(result.located, true);
  assert.ok(reasonsFor(result, 'byte_size').includes('size-mismatch'));
});

test('a missing transcript file fails with file-not-found and located:false', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  fs.rmSync(fx.transcriptPath);

  const result = validateFixture(fx);
  assert.equal(result.ok, false);
  assert.equal(result.located, false);
  assert.deepEqual(reasonsFor(result, 'file_hash'), ['file-not-found']);
});

test('a non-object pointer is rejected as a shape failure', () => {
  const result = validate(null, '/tmp', { sessionPath: '/tmp' });
  assert.equal(result.ok, false);
  assert.equal(result.located, false);
  assert.equal(result.mismatches[0].reason, 'not-an-object');
});

test('a malformed field type is reported (project_root_hash not sha256-hex)', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const broken = { ...fx.pointer, project_root_hash: 'not-a-hash' };

  const result = validateFixture(fx, broken);
  assert.equal(result.ok, false);
  assert.deepEqual(reasonsFor(result, 'project_root_hash'), ['not-a-sha256-hex']);
});

test('a malformed file_hash (not sha256-hex) is reported', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const broken = { ...fx.pointer, file_hash: 'deadbeef' };

  const result = validateFixture(fx, broken);
  assert.equal(result.ok, false);
  assert.deepEqual(reasonsFor(result, 'file_hash'), ['not-a-sha256-hex']);
});

test('a non-integer byte_size is reported as not-a-non-negative-integer', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const broken = { ...fx.pointer, byte_size: -1 };

  const result = validateFixture(fx, broken);
  assert.equal(result.ok, false);
  assert.deepEqual(reasonsFor(result, 'byte_size'), ['not-a-non-negative-integer']);
});

test('a resolved path that is a directory fails with not-a-file', (t) => {
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  // Replace the transcript file with a directory at the same resolved path.
  fs.rmSync(fx.transcriptPath);
  fs.mkdirSync(fx.transcriptPath);

  const result = validateFixture(fx);
  assert.equal(result.ok, false);
  assert.equal(result.located, false);
  assert.deepEqual(reasonsFor(result, 'file_hash'), ['not-a-file']);
});

test('a size mismatch is terminal and does not also report a hash-mismatch', (t) => {
  // Two distinct corruption classes at once (wrong size AND wrong content):
  // size is the cheap gate, so the file is never hashed and only size-mismatch
  // is reported — proving the hash read is short-circuited on a size mismatch.
  const fx = createFixture(t, SAMPLE_TRANSCRIPT);
  const longer = SAMPLE_TRANSCRIPT + '{"line":4}\n';
  fs.writeFileSync(fx.transcriptPath, longer);

  // Pointer still carries the ORIGINAL size and hash; the file is now larger.
  const result = validateFixture(fx);
  assert.equal(result.ok, false);
  assert.equal(result.located, true);
  assert.deepEqual(reasonsFor(result, 'byte_size'), ['size-mismatch']);
  assert.deepEqual(reasonsFor(result, 'file_hash'), [], 'hash read is skipped once size mismatches');
});

// ---------------------------------------------------------------------------
// sanitize(): strips internal control material, preserves content byte-for-byte
// ---------------------------------------------------------------------------

test('an internal-control marker is stripped while a reasoning turn + ask event survive byte-for-byte', () => {
  const reasoningTurn = 'I considered three approaches and chose the locate-and-complete probe because it is the cheapest gate.';
  const askEvent = '{"event":"ask","ask_id":"a1","question":"Which schema owns the pointer?"}';
  const decisionEvent = '{"event":"decision","scope":"subtree-wide","answer":"U2 owns it"}';

  const raw = [
    reasoningTurn,
    '[[banyan:internal-control phase=spawn]]',
    askEvent,
    '[[banyan:heartbeat ts=2026-06-13T12:00:01Z]]',
    decisionEvent,
    '<system-reminder>',
    'this reminder body mentions [[banyan:internal-control]] inside prose and must survive',
    '</system-reminder>',
  ].join('\n') + '\n';

  const out = sanitize(raw);
  const outLines = out.split('\n');

  // The three control lines are gone.
  assert.ok(!outLines.includes('[[banyan:internal-control phase=spawn]]'));
  assert.ok(!outLines.includes('[[banyan:heartbeat ts=2026-06-13T12:00:01Z]]'));
  assert.ok(!outLines.includes('<system-reminder>'));
  assert.ok(!outLines.includes('</system-reminder>'));

  // The content survives byte-for-byte.
  assert.ok(outLines.includes(reasoningTurn));
  assert.ok(outLines.includes(askEvent));
  assert.ok(outLines.includes(decisionEvent));
  // A prose line that merely MENTIONS the marker token (not a control line)
  // must NOT be over-stripped.
  assert.ok(
    outLines.includes('this reminder body mentions [[banyan:internal-control]] inside prose and must survive'),
  );
});

test('sanitizing a clean transcript is an exact no-op', () => {
  const clean = [
    'Reasoning: weigh the trade-offs.',
    '{"event":"ask","ask_id":"a2"}',
    '{"event":"decision","answer":"proceed"}',
    'Final: proceed with the plan.',
  ].join('\n') + '\n';

  assert.equal(sanitize(clean), clean);
});

test('sanitize preserves the absence of a trailing newline (byte-exact round-trip)', () => {
  const noTrailing = 'line one\nline two';
  assert.equal(sanitize(noTrailing), noTrailing);
});

test('sanitize on empty input is empty', () => {
  assert.equal(sanitize(''), '');
});

test('sanitize does not collapse legitimate blank lines between content', () => {
  const raw = 'a\n\nb\n';
  assert.equal(sanitize(raw), raw);
});

test('sanitize on CRLF input strips control lines and preserves the \\r on content lines', () => {
  // Lines are split on \n; a content line keeps its trailing \r byte-for-byte,
  // and a control marker still strips even with a trailing \r after its token.
  const raw = 'keep one\r\n[[banyan:heartbeat ts=x]]\r\nkeep two\r\n';
  // The heartbeat line ([[banyan:heartbeat...]] with a trailing \r) is dropped;
  // the two content lines (each ending in \r) survive byte-for-byte.
  assert.equal(sanitize(raw), 'keep one\r\nkeep two\r\n');
});
