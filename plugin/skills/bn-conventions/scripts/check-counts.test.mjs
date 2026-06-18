// Tests for the standing count assertion. Asserts the disk counts are derived
// dynamically, the shipped README prose matches disk (54/19), the authoring
// AGENTS.md count bullet is flagged (not failed) when stale, and a README that
// disagrees with disk fails the check.
//
// Zero dependencies: node:* only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { check, diskCounts } from './check-counts.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'check-counts.mjs');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

// A synthetic root with a controllable agent/skill count and prose files.
function syntheticRoot({ agents, skills, readme, pluginReadme, agentsMd }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-counts-'));
  const agentsDir = path.join(root, 'plugin', 'agents');
  const skillsDir = path.join(root, 'plugin', 'skills');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });
  for (let i = 0; i < agents; i++) {
    fs.writeFileSync(path.join(agentsDir, `bn-a${i}.md`), '---\nname: bn-a\n---\n');
  }
  for (let i = 0; i < skills; i++) {
    const dir = path.join(skillsDir, `bn-s${i}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: bn-s\n---\n');
  }
  if (readme !== undefined) fs.writeFileSync(path.join(root, 'README.md'), readme);
  if (pluginReadme !== undefined) {
    fs.writeFileSync(path.join(root, 'plugin', 'README.md'), pluginReadme);
  }
  if (agentsMd !== undefined) fs.writeFileSync(path.join(root, 'AGENTS.md'), agentsMd);
  return root;
}

test('the real repo reports 55 agents and 19 skills with no count failures', () => {
  const counts = diskCounts(REPO_ROOT);
  assert.equal(counts.agents, 55);
  assert.equal(counts.skills, 19);
  const report = check(REPO_ROOT);
  assert.deepEqual(
    report.failures,
    [],
    `expected README prose to match disk, got:\n${JSON.stringify(report.failures, null, 2)}`,
  );
});

test('the real repo AGENTS.md count bullet matches disk and is not flagged', () => {
  const report = check(REPO_ROOT);
  assert.ok(
    !report.flags.some((f) => f.file === 'AGENTS.md' && f.kind === 'agents' && f.found !== 55),
    'expected no stale AGENTS.md agent-count bullet',
  );
  assert.ok(
    !report.flags.some((f) => f.file === 'AGENTS.md' && f.kind === 'skills' && f.found !== 19),
    'expected no stale AGENTS.md skill-count bullet',
  );
});

test('a stale authoring AGENTS.md count bullet is flagged', () => {
  const root = syntheticRoot({
    agents: 54,
    skills: 19,
    readme: 'ships 54 agents, 19 skills.\n',
    pluginReadme: '54 agents and 19 skills.\n',
    agentsMd: 'counts (currently 46 agents, 16 skills); adding\n',
  });
  try {
    const report = check(root);
    assert.ok(
      report.flags.some((f) => f.file === 'AGENTS.md' && f.found === 46 && f.kind === 'agents'),
      'expected the synthetic "46 agents" bullet to be flagged',
    );
    assert.ok(
      report.flags.some((f) => f.file === 'AGENTS.md' && f.found === 16 && f.kind === 'skills'),
      'expected the synthetic "16 skills" bullet to be flagged',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('matching prose passes with no failures', () => {
  const root = syntheticRoot({
    agents: 3,
    skills: 2,
    readme: 'ships 3 agents, 2 skills.\n',
    pluginReadme: '3 agents and 2 skills.\n',
  });
  try {
    const report = check(root);
    assert.deepEqual(report.counts, { agents: 3, skills: 2 });
    assert.deepEqual(report.failures, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a README that disagrees with disk fails the check', () => {
  const root = syntheticRoot({
    agents: 3,
    skills: 2,
    readme: 'ships 99 agents, 2 skills.\n',
    pluginReadme: '3 agents, 2 skills.\n',
  });
  try {
    const report = check(root);
    assert.ok(
      report.failures.some((f) => f.file === 'README.md' && f.found === 99),
      'expected the mismatched README.md count to fail',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a README skills count that disagrees with disk fails the check', () => {
  const root = syntheticRoot({
    agents: 3,
    skills: 2,
    readme: '3 agents, 2 skills.\n',
    pluginReadme: '3 agents, 99 skills.\n',
  });
  try {
    const report = check(root);
    assert.ok(
      report.failures.some(
        (f) => f.file === 'plugin/README.md' && f.kind === 'skills' && f.found === 99,
      ),
      'expected the mismatched plugin/README.md skills count to fail',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the matching AGENTS.md count line is not flagged on the real repo', () => {
  const report = check(REPO_ROOT);
  assert.ok(
    !report.flags.some((f) => f.found === report.counts.agents && f.kind === 'agents'),
    'a count line that already matches disk must not be flagged',
  );
  assert.ok(
    !report.flags.some((f) => f.found === report.counts.skills && f.kind === 'skills'),
    'a count line that already matches disk must not be flagged',
  );
});

test('an AGENTS.md mismatch is flagged but does not fail', () => {
  const root = syntheticRoot({
    agents: 3,
    skills: 2,
    readme: '3 agents, 2 skills.\n',
    pluginReadme: '3 agents, 2 skills.\n',
    agentsMd: 'currently 46 agents, 16 skills.\n',
  });
  try {
    const report = check(root);
    assert.deepEqual(report.failures, []);
    assert.ok(report.flags.some((f) => f.file === 'AGENTS.md' && f.found === 46));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a decoy "<n> agents" instruction phrase is not flagged; the real count claim is', () => {
  // disk = 3 agents. The README pairs a decoy install-instruction line whose
  // "register the 99 agents into the Codex agent store" must NOT be read as a
  // count claim with a genuine "ships 3 agents" claim that must pass, plus a
  // real mismatching skill claim that must fail.
  const root = syntheticRoot({
    agents: 3,
    skills: 2,
    readme:
      'The plugin ships 3 agents, 2 skills.\n' +
      'register the 99 agents into the Codex agent store\n' +
      'coordinate 99 agents across the panel\n',
    pluginReadme: '3 agents, 99 skills.\n',
  });
  try {
    const report = check(root);
    assert.ok(
      !report.failures.some((f) => f.found === 99 && f.kind === 'agents'),
      `decoy "99 agents into/across ..." prose must not be flagged, got:\n${JSON.stringify(report.failures, null, 2)}`,
    );
    assert.ok(
      report.failures.some(
        (f) => f.file === 'plugin/README.md' && f.kind === 'skills' && f.found === 99,
      ),
      'the genuine "99 skills" count claim must still fail',
    );
    assert.ok(
      !report.failures.some((f) => f.file === 'README.md' && f.kind === 'agents'),
      'the matching "ships 3 agents" claim must pass',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the CLI exits 0 on the real repo (prose == disk)', () => {
  const out = execFileSync('node', [SCRIPT_PATH, '--root', REPO_ROOT], {
    encoding: 'utf8',
  });
  assert.match(out, /55 agents, 19 skills/);
  assert.match(out, /matches disk/);
});

test('the CLI exits 1 when a README disagrees with disk', () => {
  const root = syntheticRoot({
    agents: 3,
    skills: 2,
    readme: '99 agents, 2 skills.\n',
    pluginReadme: '3 agents, 2 skills.\n',
  });
  try {
    let exitCode = 0;
    try {
      execFileSync('node', [SCRIPT_PATH, '--root', root], { encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
    }
    assert.equal(exitCode, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
