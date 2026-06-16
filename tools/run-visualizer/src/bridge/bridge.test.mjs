// U3 — cold-bridge + path-resolution + active-run risk-spike (P4 / F1 / F2 / R11).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { projectSlugFromCwd, resolveSessionPaths, listSessions } from './session-paths.mjs';
import { resolveSession, readActivityWindow } from './cold-bridge.mjs';
import { discoverActiveRun } from './active-run.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const fixture = (...p) => join(here, '..', '..', 'test', 'fixtures', ...p);

const REAL_RUN_DIR = join(repoRoot, '.banyan', 'runs', '2026-06-14-001-plan-bn-mock-skill');
const REAL_CWD = '/Users/riley/repos/banyan';
const EXPECTED = JSON.parse(fs.readFileSync(fixture('cold-bridge', 'expected.json'), 'utf8'));
const realDataPresent = fs.existsSync(REAL_RUN_DIR)
  && fs.existsSync(join(os.homedir(), '.claude', 'projects', '-Users-riley-repos-banyan', `${EXPECTED.expectedSessionId}.jsonl`));

test('projectSlugFromCwd encodes the cwd path (/ → -)', () => {
  assert.equal(projectSlugFromCwd('/Users/riley/repos/banyan'), '-Users-riley-repos-banyan');
});

test('resolveSessionPaths resolves BOTH the subagents dir AND the sibling root transcript (F1)', { skip: !realDataPresent }, () => {
  const paths = resolveSessionPaths({ projectSlug: '-Users-riley-repos-banyan', sessionId: EXPECTED.expectedSessionId });
  assert.ok(paths.subagentsDir, 'subagents/ resolved');
  assert.ok(paths.rootTranscript, 'sibling root transcript resolved (F1 — new code, not inherited)');
  assert.ok(paths.subagentTranscripts.length >= 90, `expected ~93 subagent transcripts, got ${paths.subagentTranscripts.length}`);
  assert.ok(paths.metas.length >= 90, `expected ~93 metas, got ${paths.metas.length}`);
});

test('ACCEPTANCE: run-id resolves to b5bf91de and to no other (P4)', { skip: !realDataPresent }, () => {
  const r = resolveSession({ runDir: REAL_RUN_DIR, cwd: REAL_CWD });
  assert.equal(r.resolved, true, `expected resolved; got ${JSON.stringify(r)}`);
  assert.equal(r.sessionId, EXPECTED.expectedSessionId);
});

test('a dir-mtime resolver picks a DIFFERENT session than the line-timestamp bridge (F2)', { skip: !realDataPresent }, () => {
  // Proof that dir mtime is not a usable signal: the session dir mtime falls OUTSIDE the
  // run's activity window (the session is reused across days), so a naive "newest/closest
  // mtime" resolver does not correspond to the in-window-evidence answer. We assert the
  // real bridge resolves b5bf91de while its dir mtime is outside the window — i.e. the
  // resolution cannot have come from mtime.
  const window = readActivityWindow(join(REAL_RUN_DIR, 'activity.log'));
  const sessDir = join(os.homedir(), '.claude', 'projects', '-Users-riley-repos-banyan', EXPECTED.expectedSessionId);
  const mtime = fs.statSync(sessDir).mtimeMs;
  const mtimeOutsideWindow = mtime < window.startMs || mtime > window.endMs;
  assert.ok(mtimeOutsideWindow, 'session dir mtime is outside the run window — mtime cannot be the signal');
  // And the line-timestamp bridge still resolves it correctly.
  const r = resolveSession({ runDir: REAL_RUN_DIR, cwd: REAL_CWD });
  assert.equal(r.resolved, true);
  assert.equal(r.sessionId, EXPECTED.expectedSessionId);
});

test('ambiguity: two equally-scoring sessions refuse with a candidate list (DI3)', () => {
  // Build a synthetic projects root with two sessions carrying identical in-window evidence.
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rv-bridge-'));
  const slug = '-tmp-proj';
  const projDir = join(tmp, slug);
  const runDir = join(tmp, 'run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(join(runDir, 'activity.log'),
    '2026-06-14T17:00:00.000Z\tlead\tstart\n2026-06-14T17:10:00.000Z\tlead\tend\n');
  for (const sid of ['sess-A', 'sess-B']) {
    const sub = join(projDir, sid, 'subagents');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(join(sub, 'agent-x.jsonl'),
      '{"type":"user","timestamp":"2026-06-14T17:05:00.000Z","message":{"content":"hi"}}\n');
    fs.writeFileSync(join(sub, 'agent-x.meta.json'), '{"agentType":"banyan:bn-x","toolUseId":"t"}');
  }
  const env = { CLAUDE_PROJECTS_DIR: tmp };
  // cwd whose slug equals our synthetic project slug
  const r = resolveSession({ runDir, cwd: '/tmp/proj', env });
  assert.equal(r.resolved, false);
  assert.equal(r.reason, 'ambiguous');
  assert.deepEqual([...r.candidates].sort(), ['sess-A', 'sess-B']);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('active-run: push-down beats the heuristic (R11)', () => {
  const r = discoverActiveRun({ runsDir: '/nonexistent', env: { BANYAN_SESSION_PATH: '/explicit/path' } });
  assert.equal(r.source, 'push-down');
  assert.equal(r.runDir, '/explicit/path');
});

test('active-run: a stale run (activity.log > staleness window) is NOT locked onto', () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rv-active-'));
  const runDir = join(tmp, 'stale-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(join(runDir, 'activity.log'), '2020-01-01T00:00:00.000Z\tlead\told\n');
  // mtime far in the past via utimes
  const old = new Date('2020-01-01T00:00:00Z');
  fs.utimesSync(join(runDir, 'activity.log'), old, old);
  const r = discoverActiveRun({ runsDir: tmp, env: {}, now: Date.now() });
  assert.equal(r.source, 'none', 'stale run not selected');
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('active-run: a fresh run with no terminal report IS discovered', () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rv-active2-'));
  const runDir = join(tmp, 'fresh-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(join(runDir, 'activity.log'), `${new Date().toISOString()}\tlead\tactive\n`);
  const r = discoverActiveRun({ runsDir: tmp, env: {}, now: Date.now() });
  assert.equal(r.source, 'heuristic');
  assert.equal(r.runDir, runDir);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('active-run: a run WITH a terminal report is not treated as active', () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'rv-active3-'));
  const runDir = join(tmp, 'done-run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(join(runDir, 'activity.log'), `${new Date().toISOString()}\tlead\tdone\n`);
  fs.writeFileSync(join(runDir, 'delivery-report.md'), '# done\n');
  const r = discoverActiveRun({ runsDir: tmp, env: {}, now: Date.now() });
  assert.equal(r.source, 'none');
  fs.rmSync(tmp, { recursive: true, force: true });
});
