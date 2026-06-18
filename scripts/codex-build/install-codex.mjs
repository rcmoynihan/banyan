#!/usr/bin/env node
// Banyan one-command Codex install.
//
// Codex's native plugin install (`codex plugin marketplace add` + `/plugins`) reads the
// repo's Claude-format .claude-plugin/marketplace.json and would install the CLAUDE tree
// (plugin/), not the Codex render (dist/codex/). There is no Codex-native marketplace
// pointing at dist/codex/, so the install is a direct copy of the render into the two
// Codex stores this script writes:
//
//   1. Skills tree -> <CODEX_HOME>/skills/banyan/   (AGENTS.md, skills/, schemas/,
//      .claude-plugin/) -- the install root the render's rewritten
//      ~/.codex/skills/banyan/... paths resolve against.
//   2. Agents     -> <CODEX_HOME>/agents/           (the 55 generated *.toml), the store
//      Codex scans when a lead spawns a child. Native plugin install never registers
//      agents, so this half is required or delegating skills report a missing agent.
//
// The [agents] config contract (max_depth=3, max_threads=8, job_max_runtime_seconds) is
// NOT written here -- it is passed per-invocation via `-c` overrides so the user's global
// ~/.codex/config.toml and auth.json are never touched. See docs/codex-install.md.
//
// Zero dependencies: node: builtins only. This is authoring/packaging tooling under
// scripts/codex-build/; it reads the render-owned dist/codex/ tree and never writes into it.
//
// Usage:
//   node scripts/codex-build/install-codex.mjs [--codex-home <dir>] [--source <dir>]
//                                              [--skills-only | --agents-only] [--dry-run]
//
//   --codex-home <dir>  Install root. Defaults to $CODEX_HOME, then ~/.codex.
//   --source <dir>      The render root to install from. Defaults to dist/codex/.
//   --skills-only       Install only the skills tree (skip the agent store).
//   --agents-only       Install only the agent store (skip the skills tree).
//   --dry-run           Print the planned actions and exit without writing.

import { readdirSync, readFileSync, mkdirSync, copyFileSync, cpSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { isEntryPoint } from "../../plugin/skills/bn-conventions/scripts/entry-point.mjs";
import {
  resolveCodexHome,
  agentStoreDir,
  storePathFor,
  agentTomlFiles,
  defaultSourceDir as defaultAgentSourceDir,
} from "./install-codex-agents.mjs";

// The skills tree installs under <codex-home>/skills/banyan/. The render bakes this exact
// path into its rewritten references, so the install location is not configurable.
export function skillsInstallRoot(codexHome) {
  return join(codexHome, "skills", "banyan");
}

// The render root holding the tree to install: dist/codex/, one level above the agent
// source (dist/codex/agents/). Resolved from this script under scripts/codex-build/.
export function defaultRenderRoot() {
  return join(defaultAgentSourceDir(), "..");
}

// dist/codex/ entries that belong in the agent store or are authoring-only, so the skills
// tree copy excludes them: agents/ installs into <codex-home>/agents/ separately, and the
// build manifest is a drift-gate artifact with no runtime role.
const SKILLS_TREE_EXCLUDES = new Set(["agents", ".build-manifest.json"]);

export function parseArgs(argv) {
  const opts = { codexHome: null, source: null, skillsOnly: false, agentsOnly: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--codex-home") {
      opts.codexHome = argv[++i] ?? null;
    } else if (arg === "--source") {
      opts.source = argv[++i] ?? null;
    } else if (arg === "--skills-only") {
      opts.skillsOnly = true;
    } else if (arg === "--agents-only") {
      opts.agentsOnly = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  if (opts.skillsOnly && opts.agentsOnly) {
    throw new Error("--skills-only and --agents-only are mutually exclusive");
  }
  return opts;
}

// The top-level render entries to copy into the skills install root (everything except the
// agent store and the build manifest).
export function skillsTreeEntries(renderRoot, readdir = readdirSync) {
  return readdir(renderRoot)
    .filter((entry) => !SKILLS_TREE_EXCLUDES.has(entry))
    .sort();
}

function installSkillsTree(renderRoot, codexHome, dryRun) {
  const destRoot = skillsInstallRoot(codexHome);
  const entries = skillsTreeEntries(renderRoot);
  if (dryRun) {
    console.log(`[dry-run] would replace ${destRoot} with ${entries.length} top-level render entries:`);
    for (const entry of entries) console.log(`  ${join(renderRoot, entry)} -> ${join(destRoot, entry)}`);
    return;
  }
  // Replace the banyan skills root wholesale so a reinstall never leaves stale files; this
  // directory is Banyan-owned, unlike the shared agent store.
  rmSync(destRoot, { recursive: true, force: true });
  mkdirSync(destRoot, { recursive: true });
  for (const entry of entries) {
    cpSync(join(renderRoot, entry), join(destRoot, entry), { recursive: true });
  }
  const skillCount = countSkillMds(join(destRoot, "skills"));
  console.log(`installed Banyan skills tree (${skillCount} skills) into ${destRoot}`);
}

function countSkillMds(skillsDir) {
  if (!existsSync(skillsDir)) return 0;
  let count = 0;
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md"))) count++;
  }
  return count;
}

function installAgents(renderRoot, codexHome, dryRun) {
  const sourceDir = join(renderRoot, "agents");
  const storeDir = agentStoreDir(codexHome);
  if (!existsSync(sourceDir)) {
    console.error(`agent source directory not found: ${sourceDir}`);
    process.exit(1);
  }
  const files = agentTomlFiles(sourceDir);
  if (files.length === 0) {
    console.error(`no agent TOML found under: ${sourceDir}`);
    process.exit(1);
  }
  const plan = files.map((file) => ({ from: join(sourceDir, file), to: storePathFor(file, storeDir) }));
  if (dryRun) {
    console.log(`[dry-run] would install ${plan.length} agents into ${storeDir}`);
    for (const { from, to } of plan) console.log(`  ${from} -> ${to}`);
    return;
  }
  mkdirSync(storeDir, { recursive: true });
  let installed = 0;
  for (const { from, to } of plan) {
    try {
      readFileSync(from); // surfaces an unreadable source before any write
      copyFileSync(from, to);
    } catch (err) {
      console.error(
        `installed ${installed} of ${plan.length} agents before failing at ${to}: ${err.message}; ` +
          `the agent store is now partial -- re-run after resolving`,
      );
      process.exit(1);
    }
    installed++;
  }
  console.log(`installed ${plan.length} Banyan agents into ${storeDir}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const codexHome = resolveCodexHome({
    flag: opts.codexHome,
    env: process.env.CODEX_HOME,
    home: homedir(),
  });
  const renderRoot = opts.source ?? defaultRenderRoot();

  if (!existsSync(renderRoot)) {
    console.error(`render root not found: ${renderRoot} (run \`node scripts/codex-build/render-codex.mjs\` first)`);
    process.exit(1);
  }

  if (!opts.agentsOnly) installSkillsTree(renderRoot, codexHome, opts.dryRun);
  if (!opts.skillsOnly) installAgents(renderRoot, codexHome, opts.dryRun);

  if (!opts.dryRun) {
    console.log(
      `\nBanyan installed for Codex under ${codexHome}. ` +
        `Pass the [agents] contract per-invocation, e.g.:\n` +
        `  codex exec -c agents.max_depth=3 -c agents.max_threads=8 -c agents.job_max_runtime_seconds=1800 '$bn-hello'`,
    );
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  main();
}
