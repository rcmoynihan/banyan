import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  resolveResumeMode,
  TRANSCRIPT_MODE,
  CHECKPOINT_MODE,
} from './resolve-resume-mode.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'resolve-resume-mode.mjs');

function runCli(args, input) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    encoding: 'utf8',
    input: input === undefined ? '' : input,
  });
}

// --- pure function: the core locate -> mode contract ----------------------

test('locate=true & complete=true -> transcript mode, sessionPath carried', () => {
  const result = resolveResumeMode({
    located: true,
    complete: true,
    path: '/home/u/.claude/projects/p/s/subagents/agent-abc.jsonl',
    reason: 'located-and-complete',
  });
  assert.equal(result.mode, TRANSCRIPT_MODE);
  assert.equal(result.sessionPath, '/home/u/.claude/projects/p/s/subagents/agent-abc.jsonl');
  // probe's own reason is carried through, not overwritten.
  assert.equal(result.reason, 'located-and-complete');
});

test('locate=false -> checkpoint mode, probe reason carried', () => {
  const result = resolveResumeMode({
    located: false,
    complete: false,
    path: null,
    reason: 'file-not-found',
  });
  assert.equal(result.mode, CHECKPOINT_MODE);
  assert.equal(result.sessionPath, null);
  assert.equal(result.reason, 'file-not-found');
});

test('locate=false with no reason -> checkpoint, default not-locatable reason', () => {
  const result = resolveResumeMode({ located: false, complete: false, path: null });
  assert.equal(result.mode, CHECKPOINT_MODE);
  assert.equal(result.sessionPath, null);
  assert.equal(result.reason, 'not-locatable');
});

test('located but incomplete -> checkpoint (locate-AND-complete, R20)', () => {
  // A truncated / actively-growing transcript located but not complete must NOT
  // unlock transcript mode — that is the unsafe false-complete case R20 guards.
  const result = resolveResumeMode({
    located: true,
    complete: false,
    path: '/x/subagents/agent-abc.jsonl',
    reason: 'actively-growing',
  });
  assert.equal(result.mode, CHECKPOINT_MODE);
  // sessionPath is still reported honestly (the path exists, just incomplete);
  // checkpoint mode simply does not depend on it.
  assert.equal(result.sessionPath, '/x/subagents/agent-abc.jsonl');
  assert.equal(result.reason, 'actively-growing');
});

test('located but incomplete with no reason -> default located-but-incomplete', () => {
  const result = resolveResumeMode({ located: true, complete: false, path: '/x/a.jsonl' });
  assert.equal(result.mode, CHECKPOINT_MODE);
  assert.equal(result.reason, 'located-but-incomplete');
});

test('no probe result (null) -> checkpoint default (safe degrade)', () => {
  const result = resolveResumeMode(null);
  assert.equal(result.mode, CHECKPOINT_MODE);
  assert.equal(result.sessionPath, null);
  assert.equal(result.reason, 'no-probe-result');
});

test('no probe result (undefined / non-object) -> checkpoint default', () => {
  for (const bad of [undefined, 'nope', 42, true]) {
    const result = resolveResumeMode(bad);
    assert.equal(result.mode, CHECKPOINT_MODE, `for input ${String(bad)}`);
    assert.equal(result.reason, 'no-probe-result');
  }
});

test('located+complete but non-string path -> transcript with null sessionPath', () => {
  const result = resolveResumeMode({ located: true, complete: true, path: null, reason: 'x' });
  assert.equal(result.mode, TRANSCRIPT_MODE);
  assert.equal(result.sessionPath, null);
});

test('truthy-but-not-true located/complete are not treated as true', () => {
  // Only strict boolean true unlocks transcript mode; a stray 1 / "true" does not.
  const result = resolveResumeMode({ located: 1, complete: 'true', path: '/x', reason: 'r' });
  assert.equal(result.mode, CHECKPOINT_MODE);
});

test('array input degrades to checkpoint (typeof [] === object guard pin)', () => {
  // [] passes the object guard but has no located/complete -> safe degrade.
  const result = resolveResumeMode([]);
  assert.equal(result.mode, CHECKPOINT_MODE);
  assert.equal(result.sessionPath, null);
});

// --- CLI wrapper ----------------------------------------------------------

test('CLI --locate transcript case prints transcript mode JSON', () => {
  const locate = JSON.stringify({ located: true, complete: true, path: '/x/a.jsonl', reason: 'located-and-complete' });
  const r = runCli(['--locate', locate]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, TRANSCRIPT_MODE);
  assert.equal(out.sessionPath, '/x/a.jsonl');
});

test('CLI --locate checkpoint case prints checkpoint mode JSON', () => {
  const locate = JSON.stringify({ located: false, complete: false, path: null, reason: 'file-not-found' });
  const r = runCli(['--locate', locate]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, CHECKPOINT_MODE);
  assert.equal(out.reason, 'file-not-found');
});

test('CLI with no input -> checkpoint default', () => {
  const r = runCli([]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, CHECKPOINT_MODE);
  assert.equal(out.reason, 'no-probe-result');
});

test('CLI reads piped stdin JSON', () => {
  const locate = JSON.stringify({ located: true, complete: true, path: '/p/a.jsonl', reason: 'located-and-complete' });
  const r = runCli([], locate);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, TRANSCRIPT_MODE);
  assert.equal(out.sessionPath, '/p/a.jsonl');
});

test('CLI rejects invalid --locate JSON with exit 2', () => {
  const r = runCli(['--locate', '{not json']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not valid JSON/);
});

test('CLI rejects unknown flag with exit 2', () => {
  const r = runCli(['--bogus']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown flag/);
});

test('CLI rejects --locate with no following value (exit 2, not silent degrade)', () => {
  const r = runCli(['--locate']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--locate requires a value/);
});
