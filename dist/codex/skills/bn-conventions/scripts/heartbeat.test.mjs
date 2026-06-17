import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'heartbeat.mjs');

function run(args) {
  return execFileSync('node', [SCRIPT_PATH, ...args], { encoding: 'utf8' });
}

test('appends timestamped tab-delimited lines, creating the run dir if missing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-hb-'));
  const runDir = path.join(base, 'nested', 'run'); // does not exist yet
  run([runDir, 'bn-unit-lead', 'U1 mini-review started']);
  run([runDir, 'bn-correctness-reviewer', 'ran   tests, writing\tfindings']);

  const log = fs.readFileSync(path.join(runDir, 'activity.log'), 'utf8');
  const lines = log.trim().split('\n');
  assert.equal(lines.length, 2, 'each call appends exactly one line');

  const [ts, actor, msg] = lines[0].split('\t');
  assert.match(ts, /^\d{4}-\d{2}-\d{2}T.*Z$/, 'ISO-8601 timestamp');
  assert.equal(actor, 'bn-unit-lead');
  assert.equal(msg, 'U1 mini-review started');

  // whitespace (incl. tabs/newlines) in the message is collapsed so the line stays single-field-safe
  assert.equal(lines[1], lines[1].split('\n')[0]);
  assert.match(lines[1], /^[^\t]+\tbn-correctness-reviewer\tran tests, writing findings$/);
});

test('exits non-zero on missing args and never throws', () => {
  const res = spawnSync('node', [SCRIPT_PATH, '/tmp/whatever'], { encoding: 'utf8' });
  assert.equal(res.status, 2);
  assert.match(res.stderr, /usage:/);
});
