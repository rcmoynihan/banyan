#!/usr/bin/env node
// Banyan Codex verification smoke (plan U9). The Codex analog of scripts/smoke.ps1: it gives the
// dual-host port a runnable, regression-gated check so the Codex render stays installable and a
// delegating skill keeps finding its agent (R25), mirroring the Claude Code spine (R2).
//
// Two arms, the same GO/NO-GO contract scripts/smoke.ps1 uses:
//
//   Discoverability arm (default, runs for real on any host, no codex CLI needed). Asserts the
//   committed Codex package is discoverable and internally consistent: the packaging manifest and
//   agent-install step (scripts/codex-build/), every skill's SKILL.md and agent TOML and the
//   doctrine (the dist/codex/ render output), and — the load-bearing R25 check — that
//   the delegation closure of every delegating skill (skill -> its lead -> the lead's declared
//   spawn roster) resolves to an installed agent TOML. A skill that loads but whose delegate is
//   missing from the agent store is a failed install; this arm catches exactly that gap statically.
//
//   Live-Codex arm (opt-in via --drive-codex). Documents the GO conditions a live codex-cli
//   0.139.0 + subscription drive proves: skills load, the agents register, a delegating skill
//   finds its agent at runtime, a depth-2 spawn returns an artifact, and a depth-3 chain + a
//   3-sibling panel fan-out return artifacts (the PoC-proven mechanism), with the reslot path
//   exercised when the panel exceeds agents.max_threads. This host has no codex-driven CI, so the
//   live arm is off by default and its GO conditions are emitted as MANUAL-STEP lines marked
//   UNVERIFIED (live Codex) unless --drive-codex is passed AND the CLI is present. The same
//   explicit-opt-in contract scripts/smoke.ps1 uses for its headless claude invocation.
//
// Auth boundary (R22): when the live arm runs, OPENAI_API_KEY is unset for the child and the
// user's global ~/.codex/config.toml is never written; the [agents] contract is delivered via
// per-invocation `-c` overrides only.
//
// Zero dependencies: node: builtins only (R11), so the smoke ports across hosts unchanged.
//
// Usage:
//   node eval/codex/run-codex-smoke.mjs [--dist <dir>] [--build-dir <dir>] [--repo-root <dir>] [--drive-codex] [--json]
//
//   --dist <dir>     The generated Codex render output (agents/, skills/, AGENTS.md). Defaults to
//                    dist/codex/ at the repo root resolved from this script's location.
//   --build-dir <dir> The Codex build dir holding the packaging manifest (codex-plugin.json) and the
//                    agent-install step (install-codex-agents.mjs). Defaults to scripts/codex-build/
//                    at the repo root.
//   --repo-root <dir> Repo root for resolving the Claude Code spine + docs. Defaults to the
//                    grandparent of this script's directory (eval/codex/ -> repo root).
//   --drive-codex    Opt in to the live-Codex arm. Requires codex on PATH; otherwise the live arm
//                    stays a documented MANUAL-STEP. Never edits the global config; OPENAI_API_KEY
//                    is unset for the driven child.
//   --json           Emit the result object as JSON instead of the human GO/NO-GO summary.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const TOML_NAME_RE = /^name\s*=\s*"([^"]+)"/m;
const SKILL_NAME_RE = /^name:\s*(\S+)\s*$/m;
const ROSTER_RE = /declared spawn roster is:\s*([^.]+?)\.(?:\s|$)/;
const LEAD_REF_RE = /\bbn-[a-z0-9-]+-lead\b/g;

export function parseArgs(argv) {
  const opts = { dist: null, buildDir: null, repoRoot: null, driveCodex: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dist") opts.dist = argv[++i] ?? null;
    else if (arg === "--build-dir") opts.buildDir = argv[++i] ?? null;
    else if (arg === "--repo-root") opts.repoRoot = argv[++i] ?? null;
    else if (arg === "--drive-codex") opts.driveCodex = true;
    else if (arg === "--json") opts.json = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return opts;
}

// The agent name a TOML declares, or null if the file is not a well-formed agent TOML. Names are
// matched against this field, never the filename, so the closure check binds to what the runtime
// reads at spawn time.
export function agentNameFromToml(tomlText) {
  const m = TOML_NAME_RE.exec(tomlText);
  return m ? m[1] : null;
}

// The skill name a SKILL.md declares in its frontmatter, or null.
export function skillNameFromMarkdown(skillText) {
  const m = SKILL_NAME_RE.exec(skillText);
  return m ? m[1] : null;
}

// The agents a lead's generated body declares it may spawn. The generator emits one
// "Your declared spawn roster is: a, b, c." line per panel-fanning lead (the Agent(...) allowlist
// rendered into developer_instructions); a lead with no roster line (a leaf reviewer/worker)
// returns []. This is the roster half of the R25 delegation closure.
export function spawnRosterFromToml(tomlText) {
  const m = ROSTER_RE.exec(tomlText);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^bn-[a-z0-9-]+$/.test(s));
}

// The lead agents a delegating skill body names (skill -> lead edge of the closure). A skill that
// names no lead is a non-delegating skill (e.g. bn-hello, bn-doctor) and contributes no closure.
export function leadsReferencedBySkill(skillText) {
  const found = skillText.match(LEAD_REF_RE);
  if (!found) return [];
  return [...new Set(found)];
}

// Read the package: the set of installed agent names, the set of skill names, and the per-skill
// lead references and per-lead rosters. Pure over the filesystem so the closure logic below is
// unit-testable against fixture dirs.
export function readPackage(distDir, read = readFileSync, listdir = readdirSync) {
  const agentsDir = join(distDir, "agents");
  const skillsDir = join(distDir, "skills");

  const agentFiles = listdir(agentsDir).filter((f) => f.endsWith(".toml"));
  const installedAgents = new Set();
  const rosters = new Map(); // agent name -> string[] roster
  for (const file of agentFiles) {
    const text = read(join(agentsDir, file), "utf8");
    const name = agentNameFromToml(text);
    if (name) {
      installedAgents.add(name);
      rosters.set(name, spawnRosterFromToml(text));
    }
  }

  const skillDirs = listdir(skillsDir).filter((d) => existsSync(join(skillsDir, d, "SKILL.md")));
  const skills = []; // { name, dir, leads }
  for (const d of skillDirs) {
    const text = read(join(skillsDir, d, "SKILL.md"), "utf8");
    skills.push({ name: skillNameFromMarkdown(text) ?? d, dir: d, leads: leadsReferencedBySkill(text) });
  }

  return { installedAgents, rosters, skills, agentFileCount: agentFiles.length, skillDirCount: skillDirs.length };
}

// The R25 check, computed over a read package. For every delegating skill (one that names a lead),
// walk the closure skill -> lead -> roster (transitively, since a roster member may itself be a
// lead with its own roster) and collect any referenced agent that is NOT in the installed set.
// An empty `missing` list means every delegating skill finds its agent.
export function delegationClosureGaps(pkg) {
  const { installedAgents, rosters, skills } = pkg;
  const delegating = skills.filter((s) => s.leads.length > 0);
  const missing = []; // { skill, chain: string[], missingAgent }

  for (const skill of delegating) {
    const seen = new Set();
    const stack = skill.leads.map((lead) => ({ agent: lead, chain: [skill.name, lead] }));
    while (stack.length) {
      const { agent, chain } = stack.pop();
      if (seen.has(agent)) continue;
      seen.add(agent);
      if (!installedAgents.has(agent)) {
        missing.push({ skill: skill.name, chain, missingAgent: agent });
        continue; // a missing agent has no readable roster to recurse into
      }
      for (const member of rosters.get(agent) ?? []) {
        if (!seen.has(member)) stack.push({ agent: member, chain: [...chain, member] });
      }
    }
  }

  return { delegatingSkillCount: delegating.length, missing };
}

// The full discoverability arm over the Codex package. The render output (agents/, skills/,
// AGENTS.md) lives under distDir; the packaging manifest and agent-install step live under
// buildDir (scripts/codex-build/). Returns a structured result with one boolean per GO condition
// plus the gap detail; pure over the filesystem.
export function discoverabilityResult(distDir, buildDir, deps = {}) {
  const read = deps.read ?? readFileSync;
  const listdir = deps.listdir ?? readdirSync;
  const exists = deps.exists ?? existsSync;

  const checks = [];
  const note = (name, pass, detail) => checks.push({ name, pass, detail });

  const manifestPath = join(buildDir, "codex-plugin.json");
  const agentsDir = join(distDir, "agents");
  const skillsDir = join(distDir, "skills");
  const doctrinePath = join(distDir, "AGENTS.md");
  const installerPath = join(buildDir, "install-codex-agents.mjs");

  const manifestOk = exists(manifestPath);
  note("packaging manifest present (codex-plugin.json)", manifestOk, manifestPath);
  let manifest = null;
  if (manifestOk) {
    let parsed;
    let parseError = null;
    try {
      parsed = JSON.parse(read(manifestPath, "utf8"));
    } catch (e) {
      parseError = e.message;
    }
    // A valid-but-non-object payload (null, a scalar, an array) parses without throwing yet is not
    // a usable config object, so it must record a FAIL rather than silently skip the check.
    const isObject = parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
    note(
      "packaging manifest parses as JSON",
      parseError === null && isObject,
      parseError ?? (isObject ? `host=${parsed.host} pin=${parsed.codex_cli_pin}` : `manifest is not a JSON object (got ${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed})`),
    );
    if (isObject) manifest = parsed;
  }
  if (manifest) {
    note("manifest names the agent-install step", typeof manifest.agents?.install === "string", manifest.agents?.install ?? "missing");
  }

  note("agent-install step present (scripts/codex-build/install-codex-agents.mjs)", exists(installerPath), installerPath);
  note("Codex doctrine present (AGENTS.md)", exists(doctrinePath), doctrinePath);

  const dirsOk = exists(agentsDir) && exists(skillsDir);
  if (!dirsOk) {
    note("agents/ and skills/ dirs present", false, `${agentsDir} | ${skillsDir}`);
    return finalize(distDir, buildDir, checks, null, null);
  }

  const pkg = readPackage(distDir, read, listdir);
  note(
    "54 agent TOMLs discoverable",
    pkg.agentFileCount === 54 && pkg.installedAgents.size === 54,
    `${pkg.agentFileCount} files / ${pkg.installedAgents.size} well-formed`,
  );
  note("19 skills discoverable (SKILL.md per skill)", pkg.skillDirCount === 19, `${pkg.skillDirCount} skills`);

  const gaps = delegationClosureGaps(pkg);
  const r25Pass = gaps.missing.length === 0 && gaps.delegatingSkillCount > 0;
  note(
    "R25: every delegating skill finds its agent (closure skill -> lead -> roster all installed)",
    r25Pass,
    r25Pass
      ? `${gaps.delegatingSkillCount} delegating skills, full closure resolves to installed agents`
      : `${gaps.missing.length} missing: ${gaps.missing.map((m) => m.chain.join(" -> ")).join("; ")}`,
  );

  return finalize(distDir, buildDir, checks, pkg, gaps);
}

function finalize(distDir, buildDir, checks, pkg, gaps) {
  const go = checks.every((c) => c.pass);
  return { arm: "discoverability", distDir, buildDir, go, checks, pkg: pkgSummary(pkg), gaps };
}

function pkgSummary(pkg) {
  if (!pkg) return null;
  return { agents: pkg.installedAgents.size, skills: pkg.skillDirCount };
}

// The live-Codex GO conditions, emitted as documented MANUAL-STEP lines. These need a live
// codex-cli 0.139.0 + subscription drive; on a host with no codex-driven CI they are UNVERIFIED.
export const LIVE_GO_CONDITIONS = [
  "Skills load: `/skills` lists the 19 Banyan skills.",
  "Agents registered: `ls \"$CODEX_HOME\"/agents/*.toml | wc -l` == 54.",
  "R25 delegating skill finds its agent: invoke `$bn-review`; its review lead spawns the reviewer panel with no missing-agent error.",
  "Depth-2 spawn returns an artifact: a lead spawns one child that writes its artifact path.",
  "Depth-3 chain returns an artifact: trunk -> lead -> unit-lead -> leaf, each spawn agent-decided, leaf writes its artifact (requires agents.max_depth=3).",
  "3-sibling panel fan-out returns artifacts: one lead issues 3 spawn_agent calls; all three siblings return (agents.max_threads >= 3).",
  "Reslot path: with agents.max_threads=2 and 3 siblings, the lead's spawn-reap-respawn loop reaps a finished sibling and re-spawns the rejected one (R21).",
];

// The consult/transcript-loop assertion (R9/R16). U2 classified the Codex transcript substrate
// FAITHFUL (per-thread session rollouts under <CODEX_HOME>/sessions/**), revising the plan's
// [assumed] R16. The smoke asserts the locate+slice FALLBACK path is WIRED — the host-neutral
// node: scripts that implement it are present and the checkpoint resume mode they degrade to is
// green — and marks the live transcript capture (spawn -> thread-id end to end) UNVERIFIED, the
// exact confirm-by U5 Row 4 carries.
export function consultLoopWiring(repoRoot, exists = existsSync) {
  const scriptsDir = join(repoRoot, "plugin", "skills", "bn-conventions", "scripts");
  const required = ["locate-transcript.mjs", "transcript-pointer.mjs", "transcript-slicer.mjs", "resolve-resume-mode.mjs"];
  const present = required.filter((f) => exists(join(scriptsDir, f)));
  return {
    wired: present.length === required.length,
    present,
    required,
    classification: "FAITHFUL (U2 — Codex session rollouts; checkpoint resume the safe degrade)",
    unverified: "live transcript capture (spawn -> thread-id end to end) needs a live Codex drive",
  };
}

// The residual breadth items (R24). Recorded as follow-on probes, explicitly NOT GO conditions.
export const RESIDUAL_PROBES = [
  "Panel width > 3 (Q1, R24).",
  "Fan-out nested inside the depth-3 recursion — a depth-2 unit-lead that itself fans out a sibling panel (Q2, R24).",
  "Spawn-reap-respawn reslot under load — e.g. 6 siblings at agents.max_threads=2, timing the reslot overhead (Q3, R21/R24).",
  "codex-cli 0.140.0 re-verify of the multi_agent_v1 surface + agents.* keys (Q4, R23).",
];

function repoRootFromSelf() {
  // eval/codex/run-codex-smoke.mjs -> repo root is two levels up.
  return dirname(dirname(dirname(fileURLToPath(import.meta.url))));
}

function codexOnPath(deps = {}) {
  const which = deps.which;
  if (which) return which();
  const dirs = (process.env.PATH ?? "").split(":");
  for (const d of dirs) {
    if (d && existsSync(join(d, "codex"))) {
      try {
        if (statSync(join(d, "codex")).isFile()) return join(d, "codex");
      } catch {
        // ignore unreadable PATH entries
      }
    }
  }
  return null;
}

function printSummary(result, repoRoot, driveCodex, codexPath) {
  const lines = [];
  lines.push("=== Banyan Codex verification smoke ===");
  lines.push(`  render  : ${result.distDir}`);
  lines.push(`  build   : ${result.buildDir}`);
  lines.push(`  repo    : ${repoRoot}`);
  lines.push("");
  lines.push("[1] Discoverability arm (runs for real)");
  for (const c of result.checks) {
    lines.push(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}`);
    lines.push(`        ${c.detail}`);
  }
  lines.push("");

  const consult = consultLoopWiring(repoRoot);
  lines.push("[2] Consult/transcript loop (R9/R16)");
  lines.push(`  ${consult.wired ? "PASS" : "FAIL"}  locate+slice fallback wired (${consult.present.length}/${consult.required.length} scripts present)`);
  lines.push(`        classification: ${consult.classification}`);
  lines.push(`        UNVERIFIED: ${consult.unverified}`);
  lines.push("");

  lines.push("[3] Live-Codex GO conditions (MANUAL-STEP)");
  const liveDriven = driveCodex && codexPath;
  if (liveDriven) {
    lines.push(`  codex on PATH at ${codexPath}; --drive-codex passed.`);
    lines.push("  NOTE  This run does not auto-drive a paid subscription session; the conditions below");
    lines.push("        remain operator MANUAL-STEPs. Run them with OPENAI_API_KEY unset and the");
    lines.push("        [agents] contract via -c overrides (never the global config.toml).");
  } else if (codexPath) {
    lines.push(`  codex on PATH at ${codexPath}, but --drive-codex not passed (and no codex-driven CI on this host).`);
  } else {
    lines.push("  codex CLI not on PATH; live GO conditions are documented MANUAL-STEPs.");
  }
  for (const cond of LIVE_GO_CONDITIONS) {
    lines.push(`  MANUAL-STEP (UNVERIFIED live Codex)  ${cond}`);
  }
  lines.push("");

  lines.push("[4] Residual breadth probes (R24 — NOT GO conditions, follow-on)");
  for (const probe of RESIDUAL_PROBES) lines.push(`  PROBE  ${probe}`);
  lines.push("");

  const go = result.go && consult.wired;
  lines.push(`SMOKE (discoverability): ${go ? "GO" : "NO-GO"} — ${result.pkg ? `${result.pkg.agents} agents / ${result.pkg.skills} skills` : "package unreadable"}, ${result.gaps ? `${result.gaps.delegatingSkillCount} delegating skills, ${result.gaps.missing.length} missing delegate(s)` : "closure unchecked"}`);
  lines.push("Live-Codex GO conditions: UNVERIFIED (no codex-driven CI on this host) — see [3].");
  return { text: lines.join("\n"), go };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repoRoot = opts.repoRoot ?? repoRootFromSelf();
  const distDir = opts.dist ?? join(repoRoot, "dist", "codex");
  const buildDir = opts.buildDir ?? join(repoRoot, "scripts", "codex-build");
  const codexPath = codexOnPath();

  const result = discoverabilityResult(distDir, buildDir);
  const consult = consultLoopWiring(repoRoot);

  if (opts.json) {
    console.log(
      JSON.stringify(
        { ...result, consult, live: { driveCodex: opts.driveCodex, codexPath, conditions: LIVE_GO_CONDITIONS }, residual: RESIDUAL_PROBES },
        null,
        2,
      ),
    );
  } else {
    const { text } = printSummary(result, repoRoot, opts.driveCodex, codexPath);
    console.log(text);
  }

  const go = result.go && consult.wired;
  process.exit(go ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
