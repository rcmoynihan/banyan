// U8 — launch wiring tests: argv contract preserved, run-dir resolution, the testable launch core
// (buildStateForRun) against the real fixture, and the durable-only fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parseArgs, main, resolveRunDir, buildStateForRun } from './index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const REAL_RUN_DIR = join(repoRoot, '.banyan', 'runs', '2026-06-14-001-plan-bn-mock-skill');
const SESSION_ID = 'b5bf91de-f038-4e03-b691-9cbbc703613a';
const ROOT = join(os.homedir(), '.claude', 'projects', '-Users-riley-repos-banyan', `${SESSION_ID}.jsonl`);
const realDataPresent = fs.existsSync(REAL_RUN_DIR) && fs.existsSync(ROOT);

test('U0 argv contract preserved (parseArgs/main/--help — main stays synchronous)', () => {
  assert.deepEqual(parseArgs(['--help']), { help: true, run: undefined, rest: [] });
  assert.deepEqual(parseArgs(['--run', 'r']), { help: false, run: 'r', rest: [] });
  assert.equal(main(['--help']), 0, 'main(--help) returns 0 synchronously (U0 contract)');
});

test('resolveRunDir resolves a run-id under .banyan/runs/ and an explicit dir', () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rv-run-'));
  fs.mkdirSync(join(tmp, '.banyan', 'runs', 'my-run'), { recursive: true });
  assert.equal(resolveRunDir('my-run', { cwd: tmp }), join(tmp, '.banyan', 'runs', 'my-run'));
  assert.equal(resolveRunDir(tmp, { cwd: '/elsewhere' }), tmp);
  assert.equal(resolveRunDir(undefined), null);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('buildStateForRun resolves the fixture session and builds the full nested tree (R19/F2 replay)', { skip: !realDataPresent }, () => {
  const { state, resolution } = buildStateForRun(REAL_RUN_DIR, { cwd: '/Users/riley/repos/banyan' });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.sessionId, SESSION_ID);
  assert.equal(state.mode, 'transcript');
  assert.equal(state.stats.total, 93, 'full nested tree built');
  assert.equal(state.stats.attachedToRoot, 0, '0 unmatched (sibling root read)');
  // a selectable node carries a verbatim prompt + the floor bits
  const withPrompt = Object.values(state.nodes).find((n) => typeof n.prompt === 'string');
  assert.ok(withPrompt, 'a node with a verbatim prompt exists');
});

test('buildStateForRun falls to durable-only when the bridge cannot resolve (DI3)', () => {
  // A run dir with an activity.log whose window matches NO session → durable-only.
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rv-durable-'));
  fs.writeFileSync(join(tmp, 'activity.log'), '1999-01-01T00:00:00.000Z\tlead\told\n');
  fs.mkdirSync(join(tmp, 'progress'), { recursive: true });
  fs.writeFileSync(join(tmp, 'progress', 'bn-delivery-lead.md'), 'x');
  const { state, resolution } = buildStateForRun(tmp, { cwd: '/no/such/project', env: { CLAUDE_PROJECTS_DIR: tmp } });
  assert.equal(resolution.resolved, false);
  assert.equal(state.mode, 'durable-only');
  assert.ok(state.durable, 'durable roster built');
  fs.rmSync(tmp, { recursive: true, force: true });
});
