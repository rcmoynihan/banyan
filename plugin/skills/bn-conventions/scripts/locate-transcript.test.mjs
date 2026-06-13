import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { checkComplete, isGrowing, locateTranscript, resolveTranscriptPath } from './locate-transcript.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'locate-transcript.mjs');

function tempDir(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-locate-')));
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}

// Write a per-agent transcript at <sessionRoot>/subagents/agent-<id>.jsonl.
function writeTranscript(sessionRoot, agentId, lines) {
  const file = path.join(sessionRoot, 'subagents', `agent-${agentId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines);
  return file;
}

const COMPLETE_JSONL = ['{"type":"user","text":"hi"}', '{"type":"result","ok":true}', ''].join('\n');
const TRUNCATED_JSONL = ['{"type":"user","text":"hi"}', '{"type":"result","ok":tr'].join('\n');

test('resolveTranscriptPath: explicit session path wins (R28 push-down)', () => {
  const resolved = resolveTranscriptPath({ sessionPath: '/sessions/abc', agentId: 'xyz' });
  assert.equal(resolved.source, 'session-path');
  assert.equal(resolved.path, path.resolve('/sessions/abc', 'subagents', 'agent-xyz.jsonl'));
});

test('resolveTranscriptPath: missing agent id is reported, not thrown', () => {
  const resolved = resolveTranscriptPath({ sessionPath: '/sessions/abc' });
  assert.equal(resolved.path, null);
  assert.equal(resolved.reason, 'no-agent-id');
});

test('resolveTranscriptPath: rejects an agent id with path separators / traversal', () => {
  for (const bad of ['../../etc/passwd', 'a/b', 'a\\b', '..', '.']) {
    const resolved = resolveTranscriptPath({ sessionPath: '/sessions/abc', agentId: bad });
    assert.equal(resolved.path, null, `expected null path for agentId=${bad}`);
    assert.equal(resolved.reason, 'invalid-agent-id');
  }
});

test('locateTranscript: located + complete on a good fixture (push-down)', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'session-1');
  writeTranscript(sessionRoot, 'good', COMPLETE_JSONL);

  const result = locateTranscript({ sessionPath: sessionRoot, agentId: 'good' });
  assert.equal(result.located, true);
  assert.equal(result.complete, true);
  assert.equal(result.reason, 'located-and-complete');
  assert.equal(result.path, path.join(sessionRoot, 'subagents', 'agent-good.jsonl'));
});

test('locateTranscript: located:false on a missing file', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'session-2');
  fs.mkdirSync(sessionRoot, { recursive: true });

  const result = locateTranscript({ sessionPath: sessionRoot, agentId: 'absent' });
  assert.equal(result.located, false);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'file-not-found');
});

test('locateTranscript: complete:false on a truncated (last line not terminated) file', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'session-3');
  writeTranscript(sessionRoot, 'trunc', TRUNCATED_JSONL);

  const result = locateTranscript({ sessionPath: sessionRoot, agentId: 'trunc' });
  assert.equal(result.located, true);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'last-line-not-terminated');
});

test('locateTranscript: complete:false on an empty file', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'session-empty');
  writeTranscript(sessionRoot, 'empty', '');

  const result = locateTranscript({ sessionPath: sessionRoot, agentId: 'empty' });
  assert.equal(result.located, true);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'empty-file');
});

test('isGrowing: same snapshot is not growing; changed size or mtime is growing', () => {
  const a = { size: 100, mtimeMs: 1000 };
  assert.equal(isGrowing(a, { size: 100, mtimeMs: 1000 }), false);
  assert.equal(isGrowing(a, { size: 120, mtimeMs: 1000 }), true);
  assert.equal(isGrowing(a, { size: 100, mtimeMs: 2000 }), true);
  assert.equal(isGrowing(null, a), false);
});

test('checkComplete: reports actively-growing when the file changes mid-settle', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'growing.jsonl');
  fs.writeFileSync(file, COMPLETE_JSONL);

  // The onSettle hook fires synchronously between the two stats, simulating a
  // concurrent writer appending to the still-growing transcript. This pins the
  // actively-growing branch deterministically (no wall-clock race).
  const result = checkComplete(file, {
    onSettle: () => {
      fs.appendFileSync(file, '{"type":"more","mid":true}\n');
    },
  });
  assert.equal(result.located, true);
  assert.equal(result.complete, false);
  assert.equal(result.reason, 'actively-growing');
});

test('checkComplete: settled (stable) file with a complete tail is complete', (t) => {
  const dir = tempDir(t);
  const file = path.join(dir, 'stable.jsonl');
  fs.writeFileSync(file, COMPLETE_JSONL);

  const result = checkComplete(file, { onSettle: () => {} });
  assert.equal(result.located, true);
  assert.equal(result.complete, true);
  assert.equal(result.reason, 'located-and-complete');
});

test('locateTranscript: env-discovery fallback resolves with the session path unset', (t) => {
  const dir = tempDir(t);
  const projectsRoot = path.join(dir, 'projects');
  const sessionRoot = path.join(projectsRoot, 'proj-slug', 'session-id');
  writeTranscript(sessionRoot, 'discovered', COMPLETE_JSONL);

  const result = locateTranscript({
    agentId: 'discovered',
    env: { CLAUDE_PROJECTS_DIR: projectsRoot },
  });
  assert.equal(result.located, true);
  assert.equal(result.complete, true);
  assert.equal(result.path, path.join(sessionRoot, 'subagents', 'agent-discovered.jsonl'));
});

test('locateTranscript: env-discovery via explicit CLAUDE_SESSION_PATH', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'explicit-env-session');
  writeTranscript(sessionRoot, 'envsess', COMPLETE_JSONL);

  const result = locateTranscript({
    agentId: 'envsess',
    env: { CLAUDE_SESSION_PATH: sessionRoot },
  });
  assert.equal(result.located, true);
  assert.equal(result.complete, true);
});

test('locateTranscript: not-locatable when no session root can be derived', (t) => {
  const dir = tempDir(t);
  const result = locateTranscript({
    agentId: 'orphan',
    env: { CLAUDE_PROJECTS_DIR: path.join(dir, 'does-not-exist') },
  });
  assert.equal(result.located, false);
  assert.equal(result.path, null);
});

test('CLI: prints JSON and exits 0 on a located+complete fixture', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'cli-session');
  writeTranscript(sessionRoot, 'cli', COMPLETE_JSONL);

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--session-path', sessionRoot, '--agent-id', 'cli'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.located, true);
  assert.equal(parsed.complete, true);
});

test('CLI: exits 0 (not an error) on a not-locatable result', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'cli-empty-session');
  fs.mkdirSync(sessionRoot, { recursive: true });

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--session-path', sessionRoot, '--agent-id', 'missing'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.located, false);
});

test('CLI: default settle window still reports complete on a stable file', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'cli-settle-session');
  writeTranscript(sessionRoot, 'settle', COMPLETE_JSONL);

  // No --settle-ms: the CLI applies its non-zero default settle window so the
  // live growth guard actually runs. A stable file must still pass.
  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--session-path', sessionRoot, '--agent-id', 'settle'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.located, true);
  assert.equal(parsed.complete, true);
});

test('CLI: --settle-ms 0 opts out of the growth check', (t) => {
  const dir = tempDir(t);
  const sessionRoot = path.join(dir, 'cli-nosettle-session');
  writeTranscript(sessionRoot, 'nosettle', COMPLETE_JSONL);

  const result = spawnSync(
    process.execPath,
    [SCRIPT_PATH, '--session-path', sessionRoot, '--agent-id', 'nosettle', '--settle-ms', '0'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.located, true);
  assert.equal(parsed.complete, true);
});
