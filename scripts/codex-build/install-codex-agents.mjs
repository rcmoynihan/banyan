#!/usr/bin/env node
// Banyan agent-install step for Codex (R25).
//
// Codex's native plugin install (marketplace + /plugins TUI) registers skills only; it does
// not register custom agents. Banyan ships 54 agents its skills delegate to, so a delegating
// skill reports a missing agent at runtime unless the agent definitions are installed into the
// Codex agent store. This step copies the generated per-agent TOML from dist/codex/agents/ into
// <CODEX_HOME>/agents/, the same agent store Codex reads at spawn time.
//
// Zero dependencies: node: builtins only (R11). Auth and config are out of scope here — this
// step only places agent definitions; it never writes the user's global config.toml, never
// touches auth.json, and never invokes codex.
//
// This installer is authoring/packaging tooling under scripts/codex-build/. It reads the
// render-owned agent TOML from the generated dist/codex/agents/ tree and copies them into the
// Codex agent store; it never writes into dist/codex/.
//
// Usage:
//   node scripts/codex-build/install-codex-agents.mjs [--codex-home <dir>] [--source <dir>] [--dry-run]
//
//   --codex-home <dir>  Install root. Defaults to $CODEX_HOME, then ~/.codex. The agent store
//                       is always <codex-home>/agents/. Pass the same value the skills install
//                       used so both halves land under one root.
//   --source <dir>      Directory holding the agent TOML to install. Defaults to the generated
//                       dist/codex/agents/ tree at the repo root (resolved relative to this
//                       script under scripts/codex-build/).
//   --dry-run           Print the planned source -> destination pairs and exit without writing.

import { readdirSync, readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const AGENT_TOML_PATTERN = /\.toml$/;

export function parseArgs(argv) {
  const opts = { codexHome: null, source: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--codex-home") {
      opts.codexHome = argv[++i] ?? null;
    } else if (arg === "--source") {
      opts.source = argv[++i] ?? null;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return opts;
}

// Resolve the install root with the documented precedence: explicit flag, then CODEX_HOME, then
// ~/.codex. This is the single root both install halves must share (F2).
export function resolveCodexHome({ flag, env, home }) {
  if (flag && flag.trim()) return flag;
  if (env && env.trim()) return env;
  return join(home, ".codex");
}

// The Codex agent store: <codex-home>/agents/. Every agent TOML installs here by basename so a
// spawn resolving an injected role definition reads it from the store Codex scans (R25).
export function agentStoreDir(codexHome) {
  return join(codexHome, "agents");
}

// A TOML file installs to <store>/<same-basename>. The name is preserved verbatim so the store
// entry matches the agent's declared `name` field that the generator emitted.
export function storePathFor(tomlFileName, storeDir) {
  return join(storeDir, basename(tomlFileName));
}

// The set of agent definitions to install: every *.toml directly under the source directory.
export function agentTomlFiles(sourceDir, readdir = readdirSync) {
  return readdir(sourceDir)
    .filter((entry) => AGENT_TOML_PATTERN.test(entry))
    .sort();
}

function selfDir() {
  return dirname(fileURLToPath(import.meta.url));
}

// The generated agent TOML live at <repo-root>/dist/codex/agents/. This script sits at
// <repo-root>/scripts/codex-build/, so the default source resolves two levels up into the
// render-owned dist/codex/ tree.
export function defaultSourceDir(scriptDir = selfDir()) {
  return join(scriptDir, "..", "..", "dist", "codex", "agents");
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const codexHome = resolveCodexHome({
    flag: opts.codexHome,
    env: process.env.CODEX_HOME,
    home: homedir(),
  });
  const sourceDir = opts.source ?? defaultSourceDir();
  const storeDir = agentStoreDir(codexHome);

  if (!existsSync(sourceDir)) {
    console.error(`source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const files = agentTomlFiles(sourceDir);
  if (files.length === 0) {
    console.error(`no agent TOML found under: ${sourceDir}`);
    process.exit(1);
  }

  const plan = files.map((file) => ({
    from: join(sourceDir, file),
    to: storePathFor(file, storeDir),
  }));

  if (opts.dryRun) {
    console.log(`[dry-run] would install ${plan.length} agents into ${storeDir}`);
    for (const { from, to } of plan) console.log(`  ${from} -> ${to}`);
    return;
  }

  mkdirSync(storeDir, { recursive: true });
  for (const { from, to } of plan) {
    readFileSync(from); // surfaces an unreadable source before any write
    copyFileSync(from, to);
  }
  console.log(`installed ${plan.length} Banyan agents into ${storeDir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
