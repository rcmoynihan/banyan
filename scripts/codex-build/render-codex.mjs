#!/usr/bin/env node
// render-codex.mjs -- derive the Codex render of Banyan from the plugin/ source.
//
// The plugin/ tree is the single source for both hosts. This generator reads it
// and writes dist/codex/: one subagent TOML per agent, one Codex skill directory
// per skill, and a Codex AGENTS.md derived from plugin/AGENTS.md. It never writes
// under plugin/.
//
// Usage:
//   node render-codex.mjs [--root <repo-root>] [--check]
//
// --root  repo root to read plugin/ from and write dist/codex/ into
//         (defaults to two levels above this script: scripts/codex-build/..).
// --check render to in-memory artifacts and return them without touching disk;
//         used by the test suite to assert shape and the golden fixture.
//
// The org-chart is realized by instruction-injection into agent_type:"default"
// spawns: a generated agent's developer_instructions ARE the payload a parent
// injects. No custom agent_type role name is emitted, because named-role dispatch
// is unavailable. Panel-fanning leads carry the spawn-reap-respawn loop.
//
// Zero dependencies: node:* only.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..');

// The Codex skills install root that replaces ${CLAUDE_PLUGIN_ROOT} (U4 rewrite
// map): a deterministic install location, not a runtime-injected variable.
const CODEX_INSTALL_ROOT = '~/.codex/skills/banyan';
const PLUGIN_ROOT_TOKEN = '${CLAUDE_PLUGIN_ROOT}';

const SKILLS_LIST_CHAR_CAP = 8000;

// The reasoning tier each Claude model alias encodes. Codex subagent TOML carries
// the tier as model_reasoning_effort; the concrete model name is left unspecified
// so it inherits from the parent session (no Codex model identifier is invented).
const REASONING_EFFORT_BY_MODEL = {
  opus: 'high',
  sonnet: 'medium',
};

function parseArgs(argv) {
  const opts = { root: DEFAULT_ROOT, check: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') {
      opts.root = path.resolve(argv[++i]);
    } else if (argv[i] === '--check') {
      opts.check = true;
    }
  }
  return opts;
}

// Rewrite every ${CLAUDE_PLUGIN_ROOT}/... reference to the Codex install-root
// anchor. Class-aware per U4: agent bodies and cross-skill references take the
// absolute ~/.codex/skills/banyan/... form (the only form that resolves when the
// reader is an agent body, not a skill loader).
function rewritePaths(text) {
  return text.split(PLUGIN_ROOT_TOKEN).join(CODEX_INSTALL_ROOT);
}

// Split a markdown file into its YAML-ish frontmatter block and the body that
// follows. Frontmatter is the run of `key: value` lines between the first two
// `---` fences. Values are taken verbatim (after the first `: `).
function parseFrontmatter(raw) {
  const lines = raw.split('\n');
  if (lines[0] !== '---') {
    throw new Error('missing opening frontmatter fence');
  }
  const fm = {};
  let i = 1;
  for (; i < lines.length; i++) {
    if (lines[i] === '---') {
      i++;
      break;
    }
    const m = lines[i].match(/^([A-Za-z0-9_-]+):\s?(.*)$/);
    if (m) fm[m[1]] = m[2];
  }
  if (lines[i] === '') i++;
  const body = lines.slice(i).join('\n');
  return { frontmatter: fm, body };
}

// Strip one layer of surrounding double quotes from a frontmatter value.
function unquote(value) {
  if (value === undefined) return value;
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

// The Agent(...) roster declared in the tools: frontmatter line, or [] if none.
function parseRoster(toolsLine) {
  if (!toolsLine) return [];
  const m = toolsLine.match(/Agent\(([^)]*)\)/);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// A panel-fanning lead is the structural fact of a roster of two or more spawnable
// types: such a lead can fan siblings wider than agents.max_threads and therefore
// must carry the spawn-reap-respawn loop. Single recursive-self spawners (roster of
// one) are not panels. Detection keys on the roster, not on prose wording, so a
// reworded lead body cannot silently drop out of the panel set and a worker that
// merely mentions parallelism in prose cannot be mistaken for a lead.
function isPanelFanningLead(roster) {
  return roster.length >= 2;
}

const REAP_RESPAWN_MARKER = 'Codex spawn model — spawn-reap-respawn panel loop';

function reapRespawnBlock(roster) {
  const rosterList = roster.join(', ');
  return [
    `## ${REAP_RESPAWN_MARKER}`,
    '',
    'On Codex you realize this subtree by instruction-injection into',
    '`agent_type:"default"` spawns: there is no callable custom role name, so each',
    'panel member is a `default` spawn whose `developer_instructions` you inject as',
    'its full role payload (the generated payload for that role plus its envelope).',
    `Your declared spawn roster is: ${rosterList}. Inject only these roles' payloads;`,
    'the roster and the envelope prompt-level cap discipline are the bound, since',
    'Codex enforces no spawn-type allowlist.',
    '',
    'When you fan out a panel WIDER than `agents.max_threads`, run the',
    'spawn-reap-respawn loop — the bound REJECTS the surplus spawn with an empty',
    'receiver; it is NOT a transparent queue:',
    '',
    '1. Issue the panel `spawn_agent` calls up front. Sibling starts are STAGGERED',
    '   (sequential tool round-trips), not a synchronized barrier launch.',
    '2. If a `spawn_agent` returns an EMPTY receiver, the slot is saturated by',
    '   `max_threads`. Do NOT assume it was queued.',
    '3. `wait` on an in-flight sibling, then `close_agent` that finished sibling to',
    '   free a slot.',
    '4. Re-spawn the rejected sibling into the freed slot.',
    '5. Repeat until every panel member has run and been reaped.',
    '',
    'Read the panel members\' returned artifacts (the files, not their prose), never',
    'their transcripts.',
  ].join('\n');
}

// Render a scalar as a TOML basic string. name/description/model_reasoning_effort
// carry no control characters, so JSON quoting is a faithful TOML basic string.
function tomlBasicString(value) {
  return JSON.stringify(value);
}

// developer_instructions is a TOML LITERAL multiline string ('''...'''): literal
// strings perform no escape processing, so a markdown body's backslashes (shell
// line-continuations in command examples) and other characters pass through
// verbatim. A basic ("""...""") string would mangle a trailing backslash. No agent
// body contains the ''' delimiter, asserted by the generator's frontmatter parse.
function tomlLiteralBlock(value) {
  if (value.includes("'''")) {
    throw new Error("developer_instructions body contains a ''' literal-string delimiter");
  }
  return `'''\n${value}\n'''`;
}

function renderAgentToml(agent) {
  const lines = [];
  lines.push(`name = ${tomlBasicString(agent.name)}`);
  lines.push(`description = ${tomlBasicString(agent.description)}`);
  if (agent.modelReasoningEffort) {
    lines.push(`model_reasoning_effort = ${tomlBasicString(agent.modelReasoningEffort)}`);
  }
  lines.push(`developer_instructions = ${tomlLiteralBlock(agent.developerInstructions)}`);
  return lines.join('\n') + '\n';
}

function buildAgent(raw, fileName) {
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = unquote(frontmatter.name);
  const stem = fileName.replace(/\.md$/, '');
  if (name !== stem) {
    throw new Error(`agent name "${name}" does not match file stem "${stem}"`);
  }
  const description = unquote(frontmatter.description);
  if (description === undefined || description === '') {
    throw new Error(`agent "${name}" is missing a description in frontmatter`);
  }
  const model = unquote(frontmatter.model);
  const modelReasoningEffort = REASONING_EFFORT_BY_MODEL[model];
  if (!modelReasoningEffort) {
    throw new Error(`agent "${name}" has unmapped model "${model}"`);
  }
  const roster = parseRoster(frontmatter.tools);

  const isPanelLead = isPanelFanningLead(roster);

  let developerInstructions = rewritePaths(body).trimEnd();
  if (isPanelLead) {
    developerInstructions = `${developerInstructions}\n\n${reapRespawnBlock(roster)}`;
  }

  return {
    name,
    description,
    model,
    modelReasoningEffort,
    roster,
    isPanelLead,
    developerInstructions,
    toml: null,
  };
}

// The skill subdirectories carried into the Codex render alongside SKILL.md. A
// rendered SKILL.md or agent body invokes scripts/*.mjs and cites references/*.md
// at the ~/.codex/skills/banyan/skills/<name>/... install root, so those trees must
// ship or the invocations ENOENT.
const SKILL_ASSET_DIRS = ['scripts', 'references'];

// Recursively collect a skill's scripts/ and references/ files as POSIX-relative
// paths under the skill directory, content path-rewritten to the install root, with
// the source file mode preserved so executable scripts stay executable. The relative
// tree is preserved exactly so the conventions scripts' same-directory relative
// imports keep resolving at the install root.
function collectSkillAssets(skillDir) {
  const assets = [];
  for (const sub of SKILL_ASSET_DIRS) {
    const subAbs = path.join(skillDir, sub);
    if (!fs.existsSync(subAbs)) continue;
    walkAssetDir(subAbs, sub, assets);
  }
  assets.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return assets;
}

function walkAssetDir(dirAbs, relPrefix, out) {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const abs = path.join(dirAbs, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      walkAssetDir(abs, rel, out);
    } else if (entry.isFile()) {
      const content = rewritePaths(fs.readFileSync(abs, 'utf8'));
      const mode = fs.statSync(abs).mode;
      out.push({ relPath: rel, content, mode });
    }
  }
}

// Top-level plugin/ assets that live OUTSIDE skills/ and agents/ but are referenced
// at the install root and so must ship in the render or the reference ENOENTs:
//   - schemas/      — rendered SKILL.md cite ${CLAUDE_PLUGIN_ROOT}/schemas/<file>
//                     (rewritten to ~/.codex/skills/banyan/schemas/<file>); e.g.
//                     bn-runbook's drive-recipe.schema.json.
//   - .claude-plugin/plugin.json — bn-hello and bn-doctor read
//                     <plugin-root>/.claude-plugin/plugin.json for the Banyan version.
// Each is copied verbatim (path-rewritten, mode preserved) into dist/codex/ at the
// same relative path it occupies under plugin/.
const STATIC_ASSET_SOURCES = ['schemas', '.claude-plugin/plugin.json'];

function collectStaticAssets(root) {
  const pluginDir = path.join(root, 'plugin');
  const assets = [];
  for (const rel of STATIC_ASSET_SOURCES) {
    const abs = path.join(pluginDir, rel);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) {
      walkStaticDir(abs, rel, assets);
    } else {
      addStaticAsset(abs, rel, assets);
    }
  }
  assets.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return assets;
}

function walkStaticDir(dirAbs, relPrefix, out) {
  for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const abs = path.join(dirAbs, entry.name);
    const rel = `${relPrefix}/${entry.name}`;
    if (entry.isDirectory()) {
      walkStaticDir(abs, rel, out);
    } else if (entry.isFile()) {
      addStaticAsset(abs, rel, out);
    }
  }
}

function addStaticAsset(abs, rel, out) {
  out.push({
    relPath: rel,
    content: rewritePaths(fs.readFileSync(abs, 'utf8')),
    mode: fs.statSync(abs).mode,
    source: `plugin/${rel}`,
  });
}

// The set of top-level dist/codex/ entries the static assets occupy, so writeDist can
// clear them before a fresh write and a source deletion does not leave a stale copy.
function staticAssetTopLevels(staticAssets) {
  return [...new Set(staticAssets.map((a) => a.relPath.split('/')[0]))];
}

function buildSkill(raw, dirName, skillDir) {
  const { frontmatter, body } = parseFrontmatter(raw);
  const name = unquote(frontmatter.name);
  if (name !== dirName) {
    throw new Error(`skill name "${name}" does not match directory "${dirName}"`);
  }
  const description = unquote(frontmatter.description);

  const fmLines = ['---', `name: ${name}`, `description: "${description}"`];
  if (frontmatter['argument-hint'] !== undefined) {
    fmLines.push(`argument-hint: ${frontmatter['argument-hint']}`);
  }
  fmLines.push('---');
  const skillMd = `${fmLines.join('\n')}\n\n${rewritePaths(body).trimStart()}`;

  const assets = skillDir ? collectSkillAssets(skillDir) : [];

  return { name, description, skillMd, assets };
}

// The consent-reminder doctrine that the absent Codex hook surface can no longer
// deliver (U4 §2.3 / U5 Row 6): on Codex it lives in AGENTS.md as prompt-level
// doctrine, with auto-load as the additive trunk backstop.
function consentReminderDoctrine() {
  return [
    '## Invoked-procedure consent (Codex render)',
    '',
    'On Claude Code a `UserPromptSubmit` hook fires a best-effort, trunk-only',
    'consent reminder before an invoked procedure runs. Codex exposes no confirmed',
    'equivalent hook surface, so the reminder ships here as doctrine instead: at the',
    'trunk, before invoking a procedure that the user did not directly request,',
    'surface what is about to run and let the user decline. This is prompt-level',
    'discipline, the same posture the spawn roster already relies on.',
  ].join('\n');
}

// The source §2.4 "How this rule reaches you" paragraph documents a Claude Code
// `UserPromptSubmit` plugin hook that does not exist on Codex. Carried verbatim it
// tells a Codex agent a live action-time backstop fires when none does — the exact
// consent-skip the rule guards against. The Codex render replaces the source claim
// with the no-hook reality, keyed on the paragraph's lead marker so a source
// reword fails loud (CONSENT_REACH_MARKER absent => throw) rather than silently
// shipping the contradiction again.
const CONSENT_REACH_MARKER = '**How this rule reaches you.**';

const CONSENT_REACH_CODEX = [
  '**How this rule reaches you.** This file auto-loads as Codex doctrine, but there',
  'is no action-time backstop: Codex exposes no `UserPromptSubmit` hook surface, so',
  'no hook injects a reminder at the moment a procedure is invoked. Adherence is',
  'entirely your responsibility. See "Invoked-procedure consent (Codex render)"',
  'below for the prompt-level discipline that stands in for the absent hook.',
].join('\n');

// The §3 plugin/hooks/ bullet describes a Claude Code hook directory and points at
// §2.4 for "the one shipped hook" — neither exists on Codex. Replace the bullet
// with the no-hook reality, keyed on its leading token so a source reword fails
// loud rather than re-shipping the dangling claim.
const HOOKS_BULLET_MARKER = '  - `plugin/hooks/` — `hooks.json`';

const HOOKS_BULLET_CODEX = [
  '  - `plugin/hooks/` — Claude Code only. Codex exposes no hook surface, so no hook',
  '    ships in the Codex render; the consent reminder §2.4 describes lives entirely',
  '    as doctrine here (see "Invoked-procedure consent (Codex render)" below).',
].join('\n');

// Replace the source §2.4 reach paragraph (a blank-line-delimited block whose first
// line carries CONSENT_REACH_MARKER) and the §3 hooks bullet with their no-hook
// Codex equivalents. Each transform asserts its marker is present so a future source
// reword surfaces as a loud build failure instead of a silently re-shipped
// live-hook claim (F5).
function reconcileConsentHook(text) {
  if (!text.includes(CONSENT_REACH_MARKER)) {
    throw new Error(
      `Codex AGENTS.md render: §2.4 reach marker "${CONSENT_REACH_MARKER}" not found; ` +
        'the consent-hook reconciliation transform is stale relative to plugin/AGENTS.md.',
    );
  }
  if (!text.includes(HOOKS_BULLET_MARKER)) {
    throw new Error(
      `Codex AGENTS.md render: §3 hooks bullet marker "${HOOKS_BULLET_MARKER}" not found; ` +
        'the consent-hook reconciliation transform is stale relative to plugin/AGENTS.md.',
    );
  }

  const blocks = text.split('\n\n');
  const reconciled = blocks.map((block) =>
    block.startsWith(CONSENT_REACH_MARKER) ? CONSENT_REACH_CODEX : block,
  );
  if (!reconciled.includes(CONSENT_REACH_CODEX)) {
    throw new Error(
      'Codex AGENTS.md render: §2.4 reach paragraph did not isolate to a single ' +
        'blank-line-delimited block; the reconciliation transform needs revisiting.',
    );
  }

  let withReach = reconciled.join('\n\n');

  const bulletLines = withReach.split('\n');
  const start = bulletLines.findIndex((line) => line.startsWith(HOOKS_BULLET_MARKER));
  let end = start + 1;
  while (end < bulletLines.length && /^\s{4,}\S/.test(bulletLines[end])) {
    end++;
  }
  bulletLines.splice(start, end - start, ...HOOKS_BULLET_CODEX.split('\n'));

  return bulletLines.join('\n');
}

function buildAgentsMd(raw) {
  const reconciled = reconcileConsentHook(raw);
  const rewritten = rewritePaths(reconciled).trimEnd();
  return `${rewritten}\n\n${consentReminderDoctrine()}\n`;
}

function listAgentFiles(root) {
  const dir = path.join(root, 'plugin', 'agents');
  return fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('bn-') && f.endsWith('.md'))
    .sort();
}

function listSkillDirs(root) {
  const dir = path.join(root, 'plugin', 'skills');
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(dir, name, 'SKILL.md')))
    .sort();
}

export function render(root = DEFAULT_ROOT) {
  const agentFiles = listAgentFiles(root);
  const agents = agentFiles.map((file) => {
    const raw = fs.readFileSync(path.join(root, 'plugin', 'agents', file), 'utf8');
    const agent = buildAgent(raw, file);
    agent.toml = renderAgentToml(agent);
    return agent;
  });

  const skillDirs = listSkillDirs(root);
  const skills = skillDirs.map((dir) => {
    const skillDir = path.join(root, 'plugin', 'skills', dir);
    const raw = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
    return buildSkill(raw, dir, skillDir);
  });

  // The Codex skills list is capped ~8000 chars (R14). Compute the catalog line
  // length and fail loudly rather than silently truncate.
  const skillsCatalog = skills
    .map((s) => `${s.name}: ${s.description}`)
    .join('\n');
  if (skillsCatalog.length > SKILLS_LIST_CHAR_CAP) {
    throw new Error(
      `Codex skills list is ${skillsCatalog.length} chars, over the ${SKILLS_LIST_CHAR_CAP}-char cap. ` +
        'Trim skill descriptions in plugin/skills/*/SKILL.md; the build will not silently truncate.',
    );
  }

  const agentsMdRaw = fs.readFileSync(path.join(root, 'plugin', 'AGENTS.md'), 'utf8');
  const agentsMd = buildAgentsMd(agentsMdRaw);

  const staticAssets = collectStaticAssets(root);

  return { agents, skills, agentsMd, staticAssets, skillsCatalogLength: skillsCatalog.length };
}

function writeDist(root, result) {
  const distRoot = path.join(root, 'dist', 'codex');
  const agentsDir = path.join(distRoot, 'agents');
  const skillsDir = path.join(distRoot, 'skills');

  fs.rmSync(agentsDir, { recursive: true, force: true });
  fs.rmSync(skillsDir, { recursive: true, force: true });
  for (const top of staticAssetTopLevels(result.staticAssets)) {
    fs.rmSync(path.join(distRoot, top), { recursive: true, force: true });
  }
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  for (const agent of result.agents) {
    fs.writeFileSync(path.join(agentsDir, `${agent.name}.toml`), agent.toml);
  }
  for (const skill of result.skills) {
    const dir = path.join(skillsDir, skill.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skill.skillMd);
    for (const asset of skill.assets) {
      const assetPath = path.join(dir, ...asset.relPath.split('/'));
      fs.mkdirSync(path.dirname(assetPath), { recursive: true });
      fs.writeFileSync(assetPath, asset.content);
      fs.chmodSync(assetPath, asset.mode);
    }
  }
  fs.writeFileSync(path.join(distRoot, 'AGENTS.md'), result.agentsMd);
  for (const asset of result.staticAssets) {
    const assetPath = path.join(distRoot, ...asset.relPath.split('/'));
    fs.mkdirSync(path.dirname(assetPath), { recursive: true });
    fs.writeFileSync(assetPath, asset.content);
    fs.chmodSync(assetPath, asset.mode);
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const result = render(opts.root);
  if (opts.check) {
    process.stdout.write(
      `render: ${result.agents.length} agents, ${result.skills.length} skills, ` +
        `skills-catalog ${result.skillsCatalogLength}/${SKILLS_LIST_CHAR_CAP} chars\n`,
    );
    return;
  }
  writeDist(opts.root, result);
  process.stdout.write(
    `rendered ${result.agents.length} agents + ${result.skills.length} skills + AGENTS.md + ` +
      `${result.staticAssets.length} static assets to dist/codex/\n`,
  );
}

export {
  parseFrontmatter,
  unquote,
  parseRoster,
  isPanelFanningLead,
  rewritePaths,
  tomlLiteralBlock,
  renderAgentToml,
  buildAgent,
  buildSkill,
  buildAgentsMd,
  collectStaticAssets,
  listAgentFiles,
  listSkillDirs,
  CODEX_INSTALL_ROOT,
  PLUGIN_ROOT_TOKEN,
  REAP_RESPAWN_MARKER,
  SKILLS_LIST_CHAR_CAP,
};

// True when this module is the process entry point. Canonicalizes both sides with
// realpathSync so the guard fires through a symlinked invocation (e.g. macOS /tmp ->
// /private/tmp, where argv[1] keeps the symlink while import.meta.url is the realpath),
// falling back to path.resolve when a path does not exist on disk.
function isEntryPoint(argv1, importMetaUrl) {
  if (!argv1) return false;
  const canon = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return path.resolve(p);
    }
  };
  return canon(argv1) === canon(fileURLToPath(importMetaUrl));
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  main();
}
