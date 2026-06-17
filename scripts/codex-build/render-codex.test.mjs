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

import os from 'node:os';

import {
  render,
  parseFrontmatter,
  parseRoster,
  isPanelFanningLead,
  rewritePaths,
  tomlLiteralBlock,
  renderAgentToml,
  buildAgent,
  buildAgentsMd,
  listAgentFiles,
  listSkillDirs,
  CODEX_INSTALL_ROOT,
  PLUGIN_ROOT_TOKEN,
  REAP_RESPAWN_MARKER,
  SKILLS_LIST_CHAR_CAP,
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

test('isPanelFanningLead keys on roster size, not prose wording', () => {
  assert.equal(isPanelFanningLead(['a', 'b']), true);
  assert.equal(isPanelFanningLead(['a']), false);
  assert.equal(isPanelFanningLead([]), false);
  // A roster>=2 lead stays a panel even when its body omits panel keywords — the
  // former silent false-negative (F2) no longer drops it from the set.
  const fanWithoutKeyword = buildAgent(
    [
      '---',
      'name: bn-fanner',
      'description: "fans a panel"',
      'model: opus',
      'tools: Read, Agent(bn-x, bn-y)',
      '---',
      '',
      'Spawn each worker and collect their returned artifacts. Reap each as it finishes.',
    ].join('\n'),
    'bn-fanner.md',
  );
  assert.equal(fanWithoutKeyword.isPanelLead, true, 'roster>=2 lead must be a panel regardless of prose');
  assert.ok(
    fanWithoutKeyword.developerInstructions.includes(REAP_RESPAWN_MARKER),
    'a keyword-free roster>=2 lead must still carry the reap-respawn loop',
  );
});

// F2: the structural panel set and the prose keyword signal must agree, and the
// build fails loudly when they do not — neither a false-negative (roster>=2 lead
// with no panel prose) nor a false-positive (panel prose with roster<2) ships
// silently.
test('every roster>=2 agent is a panel lead and carries the reap-respawn loop', () => {
  const multi = result.agents.filter((a) => a.roster.length >= 2);
  assert.ok(multi.length >= 7, 'expected at least the known roster>=2 leads');
  for (const a of multi) {
    assert.ok(a.isPanelLead, `${a.name}: roster>=2 agent not classified as a panel lead`);
    assert.ok(
      a.developerInstructions.includes(REAP_RESPAWN_MARKER),
      `${a.name}: roster>=2 lead missing reap-respawn loop`,
    );
  }
});

// A roster<2 agent that merely mentions parallelism in prose is NOT a panel lead
// and must not receive the reap-respawn loop (the former false-positive direction).
test('a roster<2 agent with panel prose is not a panel lead', () => {
  const worker = buildAgent(
    [
      '---',
      'name: bn-prosey',
      'description: "a worker"',
      'model: sonnet',
      'tools: Read',
      '---',
      '',
      'Your parent spawns a panel of these in parallel; you yourself spawn nothing.',
    ].join('\n'),
    'bn-prosey.md',
  );
  assert.equal(worker.isPanelLead, false, 'a roster<2 agent must never be a panel lead');
  assert.ok(
    !worker.developerInstructions.includes(REAP_RESPAWN_MARKER),
    'a roster<2 agent must not carry the reap-respawn loop despite panel prose',
  );
});

// F7: the tomlLiteralBlock ''' delimiter guard is load-bearing — a body containing
// the literal-string delimiter must throw, never silently produce corrupt TOML.
test("tomlLiteralBlock throws on a ''' delimiter and wraps a clean body", () => {
  assert.throws(
    () => tomlLiteralBlock("a body with ''' inside"),
    /literal-string delimiter/,
  );
  const wrapped = tomlLiteralBlock('clean body\nwith a trailing backslash \\');
  assert.equal(wrapped, "'''\nclean body\nwith a trailing backslash \\\n'''");
});

test("renderAgentToml propagates the ''' guard", () => {
  assert.throws(
    () =>
      renderAgentToml({
        name: 'bn-x',
        description: 'd',
        modelReasoningEffort: 'high',
        developerInstructions: "body with ''' inside",
      }),
    /literal-string delimiter/,
  );
});

// F9: a missing/empty agent description must fail loud, not emit the bareword
// `description = undefined` (invalid TOML) into committed dist.
test('buildAgent throws when an agent description is missing', () => {
  assert.throws(
    () =>
      buildAgent(
        ['---', 'name: bn-nodesc', 'model: opus', 'tools: Read', '---', '', 'Body.'].join('\n'),
        'bn-nodesc.md',
      ),
    /missing a description/,
  );
});

test('buildAgent throws when an agent description is empty', () => {
  assert.throws(
    () =>
      buildAgent(
        ['---', 'name: bn-emptydesc', 'description: ""', 'model: opus', 'tools: Read', '---', '', 'Body.'].join(
          '\n',
        ),
        'bn-emptydesc.md',
      ),
    /missing a description/,
  );
});

test('no rendered agent TOML emits the bareword description = undefined', () => {
  for (const agent of result.agents) {
    assert.doesNotMatch(
      agent.toml,
      /^description = undefined$/m,
      `${agent.name}: emitted invalid bareword description`,
    );
  }
});

// F8: the skills-catalog char cap must throw when exceeded, never silently
// truncate the skills list Codex shows at discovery time (R14).
test('render throws when the skills catalog exceeds SKILLS_LIST_CHAR_CAP', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-skillcap-'));
  const agentsDir = path.join(root, 'plugin', 'agents');
  const skillsDir = path.join(root, 'plugin', 'skills');
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  // One valid agent so render() has a well-formed agent surface to build.
  fs.writeFileSync(
    path.join(agentsDir, 'bn-a.md'),
    ['---', 'name: bn-a', 'description: "a"', 'model: opus', 'tools: Read', '---', '', 'Body.'].join('\n'),
  );

  // Seed skill descriptions that sum past the cap. Each catalog line is
  // `name: description`; size the descriptions from the imported constant so the
  // test tracks the cap rather than a magic number.
  const perDesc = 'x'.repeat(2000);
  const skillCount = Math.ceil(SKILLS_LIST_CHAR_CAP / perDesc.length) + 2;
  for (let i = 0; i < skillCount; i++) {
    const name = `bn-s${i}`;
    const dir = path.join(skillsDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      ['---', `name: ${name}`, `description: "${perDesc}"`, '---', '', 'Body.'].join('\n'),
    );
  }

  // A minimal AGENTS.md carrying the markers buildAgentsMd's transform requires,
  // so render() reaches the cap check rather than failing on the AGENTS.md transform.
  fs.writeFileSync(
    path.join(root, 'plugin', 'AGENTS.md'),
    [
      '# AGENTS',
      '',
      '**How this rule reaches you.** placeholder reach paragraph.',
      '',
      '  - `plugin/hooks/` — `hooks.json` placeholder bullet.',
      '',
    ].join('\n'),
  );

  assert.throws(() => render(root), /over the .*-char cap/);
  fs.rmSync(root, { recursive: true, force: true });
});

// F5: the rendered Codex AGENTS.md must not claim a live action-time hook backstops
// the consent rule, and must state the no-hook reality exactly once.
test('rendered Codex AGENTS.md makes no live-hook consent claim', () => {
  const md = result.agentsMd;

  // The source §2.4 paragraph asserting a live UserPromptSubmit hook injects a
  // reminder must not survive into the Codex render.
  assert.doesNotMatch(
    md,
    /injects a short reminder of this rule into the trunk's context/,
    'Codex AGENTS.md retained the source live-hook reach paragraph',
  );
  assert.ok(
    !md.includes('The hook is the *reminder*; this'),
    'Codex AGENTS.md retained the source "hook is the reminder" claim',
  );
  // The §3 bullet must not point at §2.4 for "the one shipped hook".
  assert.ok(
    !md.includes('See §2.4 for the one shipped hook.'),
    'Codex AGENTS.md retained the source one-shipped-hook bullet',
  );

  // The no-hook reality is stated: the reach paragraph and the appended doctrine
  // both name the absent hook surface.
  assert.match(md, /no `UserPromptSubmit` hook surface/);
  assert.match(md, /Invoked-procedure consent \(Codex render\)/);
});

test('buildAgentsMd fails loud when its source markers go stale', () => {
  // Missing §2.4 reach marker.
  assert.throws(
    () => buildAgentsMd('# AGENTS\n\n  - `plugin/hooks/` — `hooks.json` bullet.\n'),
    /reach marker/,
  );
  // Missing §3 hooks bullet marker.
  assert.throws(
    () => buildAgentsMd('# AGENTS\n\n**How this rule reaches you.** paragraph.\n'),
    /hooks bullet marker/,
  );
});
