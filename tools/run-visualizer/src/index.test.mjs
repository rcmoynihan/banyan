// U8 — launch wiring tests: argv contract preserved, run-dir resolution, the testable launch core
// (buildStateForRun) against the real fixture, and the durable-only fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';

import { parseArgs, main, resolveRunDir, buildStateForRun, buildStateForSessionPath, sessionIdFromPath } from './index.mjs';
import { discoverActiveRun } from './bridge/active-run.mjs';

/**
 * Build a synthetic CLAUDE_PROJECTS_DIR tree in a temp dir (no developer-home dependency, R2-F5):
 * a <slug>/<sessionId>.jsonl root transcript + a <slug>/<sessionId>/subagents/ dir with one
 * agent-*.jsonl child + its .meta.json. The single in-window line is what the cold bridge scores.
 * @returns {{ tmp, runDir, env, cwd, slug, sessionId }}
 */
function buildSyntheticTree({ withSubagent = true, withRoot = true } = {}) {
  const tmp = mkdtempSync(join(os.tmpdir(), 'rv-synth-'));
  const cwd = '/tmp/proj';
  const slug = '-tmp-proj';
  const sessionId = 'sess-live';
  const projDir = join(tmp, slug);
  const runDir = join(tmp, 'run');
  mkdirSync(runDir, { recursive: true });
  // activity.log window straddles the transcript line timestamp so the bridge resolves this session.
  writeFileSync(join(runDir, 'activity.log'),
    '2026-06-14T17:00:00.000Z\tlead\tstart\n2026-06-14T17:10:00.000Z\tlead\tend\n');
  const line = '{"type":"user","timestamp":"2026-06-14T17:05:00.000Z","message":{"content":"hi"}}\n';
  if (withRoot) {
    mkdirSync(projDir, { recursive: true });
    writeFileSync(join(projDir, `${sessionId}.jsonl`), line);
  }
  if (withSubagent) {
    const sub = join(projDir, sessionId, 'subagents');
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, 'agent-x.jsonl'), line);
    writeFileSync(join(sub, 'agent-x.meta.json'), '{"agentType":"banyan:bn-x","toolUseId":"t"}');
  }
  return { tmp, runDir, env: { CLAUDE_PROJECTS_DIR: tmp }, cwd, slug, sessionId };
}

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

test('sessionIdFromPath strips a .jsonl transcript path and tolerates a session dir', () => {
  assert.equal(sessionIdFromPath(`/x/-Users-y/${SESSION_ID}.jsonl`), SESSION_ID);
  assert.equal(sessionIdFromPath(`/x/-Users-y/${SESSION_ID}`), SESSION_ID);
});

test('discoverActiveRun surfaces a push-down under sessionPath (F6 bypasses the cold bridge)', () => {
  const r = discoverActiveRun({ runsDir: '/nonexistent', env: { BANYAN_SESSION_PATH: '/explicit/sess.jsonl' } });
  assert.equal(r.source, 'push-down');
  assert.equal(r.sessionPath, '/explicit/sess.jsonl', 'push-down is a session path, branched on by index.mjs');
});

test('buildStateForSessionPath builds the full nested tree from a push-down session path (F6)', { skip: !realDataPresent }, () => {
  // The push-down value is the ROOT transcript path; F6 must bypass the cold bridge (no activity.log)
  // and still build the resolved tree — not silently degrade to durable-only.
  const { state, resolution, paths } = buildStateForSessionPath(ROOT, { cwd: '/Users/riley/repos/banyan' });
  assert.equal(resolution.resolved, true, 'push-down resolves without the cold bridge');
  assert.equal(resolution.sessionId, SESSION_ID);
  assert.equal(state.mode, 'transcript', 'transcript tier built, NOT durable-only');
  assert.equal(state.stats.total, 93, 'full nested tree built from the push-down session');
  assert.ok(paths.rootTranscript, 'the sibling root transcript resolved for the watcher');
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

test('buildStateForRun builds the resolved transcript tree from a synthetic temp tree (UNGATED, R2-F5)', () => {
  const t = buildSyntheticTree();
  try {
    const { state, resolution } = buildStateForRun(t.runDir, { cwd: t.cwd, env: t.env });
    assert.equal(resolution.resolved, true, `bridge-resolve branch must resolve; got ${JSON.stringify(resolution)}`);
    assert.equal(resolution.sessionId, t.sessionId);
    assert.equal(state.mode, 'transcript');
    assert.equal(state.stats.total, 1, 'one subagent child built');
    assert.ok(state.nodes['agent-x'], 'the synthetic child node is present');
    assert.ok(state.nodes.__run_root__, 'the run-root node is materialized (R2-F1)');
  } finally {
    rmSync(t.tmp, { recursive: true, force: true });
  }
});

test('buildStateForSessionPath builds the resolved tree from a synthetic push-down path (UNGATED, R2-F5)', () => {
  const t = buildSyntheticTree();
  try {
    const sessionPath = join(t.tmp, t.slug, `${t.sessionId}.jsonl`);
    const { state, resolution, paths } = buildStateForSessionPath(sessionPath, { cwd: t.cwd, env: t.env });
    assert.equal(resolution.resolved, true, 'push-down resolves without the cold bridge');
    assert.equal(resolution.sessionId, t.sessionId);
    assert.equal(state.mode, 'transcript', 'transcript tier built, NOT durable-only');
    assert.equal(state.stats.total, 1, 'one subagent child built from the push-down session');
    assert.ok(paths.rootTranscript, 'the sibling root transcript resolved for the watcher');
    assert.equal(state.waiting, null, 'not waiting when transcripts resolved');
  } finally {
    rmSync(t.tmp, { recursive: true, force: true });
  }
});

test('buildStateForSessionPath flags an explicit waiting state when ZERO transcripts resolve (R2-F4)', () => {
  // A push-down launched at run START: no subagents/ and no root transcript yet. The bypass branch
  // must NOT render a silently-blank, non-recovering tree — it flags an explicit waiting state.
  const t = buildSyntheticTree({ withSubagent: false, withRoot: false });
  try {
    const sessionPath = join(t.tmp, t.slug, `${t.sessionId}.jsonl`);
    const { state, resolution } = buildStateForSessionPath(sessionPath, { cwd: t.cwd, env: t.env });
    assert.equal(resolution.resolved, true, 'the push-down still resolves (it beats everything, R11)');
    assert.equal(state.stats.total, 0, 'no transcripts resolved yet');
    assert.ok(state.waiting, 'an explicit waiting state is flagged rather than a blank tree');
    assert.match(state.waiting.message, /waiting/);
  } finally {
    rmSync(t.tmp, { recursive: true, force: true });
  }
});
