// Tests for the Codex render generator. Asserts the six U6 verification points:
// surface counts, required TOML fields, the panel-lead spawn-reap-respawn loop,
// no custom agent_type, the byte-exact golden-fixture round-trip, and the DI1
// regression gate (the generator never mutates plugin/).
//
// Zero dependencies: node:* only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  render,
  parseFrontmatter,
  parseRoster,
  isPanelFanningLead,
  rewritePaths,
  listAgentFiles,
  listSkillDirs,
  CODEX_INSTALL_ROOT,
  PLUGIN_ROOT_TOKEN,
  REAP_RESPAWN_MARKER,
} from './render-codex.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const FIXTURE_DIR = path.join(SCRIPT_DIR, 'fixtures');

const result = render(REPO_ROOT);

// (1) one TOML per shipped agent, one Codex skill dir per skill; the skill count
// is computed dynamically from SKILL.md on disk, not hardcoded.
test('one TOML per shipped agent (count == 54)', () => {
  const agentFilesOnDisk = listAgentFiles(REPO_ROOT);
  assert.equal(agentFilesOnDisk.length, 54, 'expected 54 shipped agents on disk');
  assert.equal(result.agents.length, 54, 'expected 54 rendered agent TOMLs');
  assert.equal(
    new Set(result.agents.map((a) => a.name)).size,
    54,
    'agent names must be unique',
  );
});

test('one Codex skill dir per skill (count == dynamic SKILL.md count == 19)', () => {
  const skillDirsOnDisk = listSkillDirs(REPO_ROOT);
  const dynamicCount = skillDirsOnDisk.length;
  assert.equal(dynamicCount, 19, 'expected 19 SKILL.md skills on disk (README states 54/19)');
  assert.equal(result.skills.length, dynamicCount, 'rendered skill count must match disk');
});

// (2) every emitted TOML carries the three required fields; name == stem;
// developer_instructions non-empty.
test('every TOML carries name/description/developer_instructions, name == stem', () => {
  for (const agent of result.agents) {
    assert.match(agent.toml, /^name = "/m, `${agent.name}: missing name field`);
    assert.match(agent.toml, /^description = "/m, `${agent.name}: missing description field`);
    assert.match(
      agent.toml,
      /^developer_instructions = '''/m,
      `${agent.name}: missing developer_instructions field`,
    );
    assert.ok(agent.description.length > 0, `${agent.name}: empty description`);
    assert.ok(
      agent.developerInstructions.trim().length > 0,
      `${agent.name}: empty developer_instructions`,
    );
    const fileStem = `${agent.name}`;
    assert.equal(agent.name, fileStem, 'name must equal stem');
  }
});

test('name == file stem for every rendered agent', () => {
  const files = listAgentFiles(REPO_ROOT);
  const names = new Set(result.agents.map((a) => a.name));
  for (const file of files) {
    const stem = file.replace(/\.md$/, '');
    assert.ok(names.has(stem), `no rendered TOML named after file stem ${stem}`);
  }
});

// (3) every panel-fanning LEAD body carries the spawn-reap-respawn loop pattern.
test('every panel-fanning lead carries the spawn-reap-respawn loop', () => {
  const panelLeads = result.agents.filter((a) => a.isPanelLead);
  assert.ok(panelLeads.length >= 5, 'expected at least the known panel leads');
  for (const lead of panelLeads) {
    assert.ok(
      lead.developerInstructions.includes(REAP_RESPAWN_MARKER),
      `${lead.name}: panel lead missing reap-respawn loop`,
    );
    assert.match(
      lead.developerInstructions,
      /close_agent/,
      `${lead.name}: reap loop missing close_agent reslot step`,
    );
    assert.match(
      lead.developerInstructions,
      /EMPTY receiver/,
      `${lead.name}: reap loop missing empty-receiver rejection`,
    );
  }
  const leadNames = panelLeads.map((a) => a.name).sort();
  assert.deepEqual(leadNames, [
    'bn-ask-lead',
    'bn-debug-lead',
    'bn-delivery-lead',
    'bn-plan-lead',
    'bn-research-lead',
    'bn-review-lead',
    'bn-unit-lead',
  ]);
});

test('non-panel agents do NOT carry the reap-respawn loop', () => {
  const nonPanel = result.agents.filter((a) => !a.isPanelLead);
  for (const agent of nonPanel) {
    assert.ok(
      !agent.developerInstructions.includes(REAP_RESPAWN_MARKER),
      `${agent.name}: non-panel agent unexpectedly carries reap-respawn loop`,
    );
  }
  // The recursive single-self spawners are explicitly not panels.
  const probe = result.agents.find((a) => a.name === 'bn-probe');
  const chaser = result.agents.find((a) => a.name === 'bn-thread-chaser');
  assert.ok(probe && !probe.isPanelLead, 'bn-probe must not be a panel lead');
  assert.ok(chaser && !chaser.isPanelLead, 'bn-thread-chaser must not be a panel lead');
});

// (4) no emitted spawn directive names a custom agent_type other than the default.
// Codex enforces no custom role name; the generator must never emit one.
test('no emitted TOML declares a custom agent_type role name', () => {
  for (const agent of result.agents) {
    assert.doesNotMatch(
      agent.toml,
      /agent_type\s*[:=]\s*["']?(?!default\b)[A-Za-z]/,
      `${agent.name}: emitted a non-default agent_type`,
    );
  }
});

// The ${CLAUDE_PLUGIN_ROOT} token is fully rewritten; none leaks into the render.
test('no Codex artifact carries the Claude Code plugin-root token', () => {
  for (const agent of result.agents) {
    assert.ok(
      !agent.toml.includes(PLUGIN_ROOT_TOKEN),
      `${agent.name}: leaked ${PLUGIN_ROOT_TOKEN}`,
    );
  }
  for (const skill of result.skills) {
    assert.ok(
      !skill.skillMd.includes(PLUGIN_ROOT_TOKEN),
      `${skill.name}: leaked ${PLUGIN_ROOT_TOKEN}`,
    );
  }
  assert.ok(!result.agentsMd.includes(PLUGIN_ROOT_TOKEN), 'AGENTS.md leaked the plugin-root token');
});

test('path rewrite targets the Codex install root', () => {
  const sample = rewritePaths(`see ${PLUGIN_ROOT_TOKEN}/AGENTS.md`);
  assert.equal(sample, `see ${CODEX_INSTALL_ROOT}/AGENTS.md`);
});

// (5) byte-for-byte golden-fixture round-trip for the hand-ported bn-plan vertical.
test('golden fixture round-trip: bn-plan vertical renders byte-for-byte', () => {
  const verticalAgents = ['bn-plan-lead', 'bn-plan-generator', 'bn-plan-judge', 'bn-plan-checker'];
  for (const name of verticalAgents) {
    const rendered = result.agents.find((a) => a.name === name);
    assert.ok(rendered, `${name} not rendered`);
    const fixturePath = path.join(FIXTURE_DIR, 'agents', `${name}.toml`);
    const expected = fs.readFileSync(fixturePath, 'utf8');
    assert.equal(rendered.toml, expected, `${name}.toml diverged from golden fixture`);
  }
  const planSkill = result.skills.find((s) => s.name === 'bn-plan');
  assert.ok(planSkill, 'bn-plan skill not rendered');
  const skillFixture = fs.readFileSync(
    path.join(FIXTURE_DIR, 'skills', 'bn-plan', 'SKILL.md'),
    'utf8',
  );
  assert.equal(planSkill.skillMd, skillFixture, 'bn-plan SKILL.md diverged from golden fixture');
});

test('golden fixture pins the instruction-injection payload and reap loop shape', () => {
  const leadFixture = fs.readFileSync(
    path.join(FIXTURE_DIR, 'agents', 'bn-plan-lead.toml'),
    'utf8',
  );
  assert.match(leadFixture, /^developer_instructions = '''/m);
  assert.ok(leadFixture.includes(REAP_RESPAWN_MARKER), 'fixture lead missing reap loop');
  assert.ok(
    leadFixture.includes(`${CODEX_INSTALL_ROOT}/AGENTS.md`),
    'fixture lead missing rewritten doctrine path',
  );
});

// (6) DI1 regression gate: running the generator does not modify any plugin/ file.
test('DI1 gate: rendering does not modify any plugin/ file', () => {
  const scriptPath = path.join(SCRIPT_DIR, 'render-codex.mjs');
  execFileSync('node', [scriptPath, '--root', REPO_ROOT], { cwd: REPO_ROOT });
  const status = execFileSync('git', ['status', '--porcelain', 'plugin/'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(status.trim(), '', `plugin/ was modified by the render:\n${status}`);
});

// Frontmatter and roster parsing behave as the render depends on.
test('parseFrontmatter splits frontmatter from body', () => {
  const raw = '---\nname: x\ndescription: "d"\n---\n\n# Body\ntext\n';
  const { frontmatter, body } = parseFrontmatter(raw);
  assert.equal(frontmatter.name, 'x');
  assert.equal(frontmatter.description, '"d"');
  assert.equal(body, '# Body\ntext\n');
});

test('parseRoster extracts the Agent(...) spawn roster', () => {
  assert.deepEqual(parseRoster('Read, Write, Agent(a, b, c)'), ['a', 'b', 'c']);
  assert.deepEqual(parseRoster('Read, Write'), []);
  assert.deepEqual(parseRoster(undefined), []);
});

test('isPanelFanningLead requires roster >= 2 and panel language', () => {
  assert.equal(isPanelFanningLead(['a', 'b'], 'spawn them in parallel'), true);
  assert.equal(isPanelFanningLead(['a'], 'spawn it in parallel'), false);
  assert.equal(isPanelFanningLead(['a', 'b'], 'a single serial worker, nothing else'), false);
});
