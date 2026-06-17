// Unit tests for the pure discoverability/closure logic of the Codex verification smoke (plan U9).
// These run under the standing node --test discipline and need no codex CLI: they exercise the
// parsers and the R25 delegation-closure check against synthetic fixture packages plus a sanity
// pass over the real committed dist/codex/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseArgs,
  agentNameFromToml,
  skillNameFromMarkdown,
  spawnRosterFromToml,
  leadsReferencedBySkill,
  readPackage,
  delegationClosureGaps,
  discoverabilityResult,
  consultLoopWiring,
  LIVE_GO_CONDITIONS,
  RESIDUAL_PROBES,
} from "./run-codex-smoke.mjs";

const REPO_ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

function buildPackage(spec) {
  // spec: { agents: { name: rosterLineOrNull }, skills: { name: bodyText } }
  // Mirrors the real two-tree layout: the render output (agents/, skills/, AGENTS.md) lives in
  // distDir; the packaging manifest (codex-plugin.json) and the agent-install step live in a
  // separate buildDir (scripts/codex-build/ in the repo). Returns both so callers pass them to
  // discoverabilityResult(distDir, buildDir).
  const root = mkdtempSync(join(tmpdir(), "codex-smoke-"));
  const distDir = join(root, "dist");
  const buildDir = join(root, "build");
  const agentsDir = join(distDir, "agents");
  const skillsDir = join(distDir, "skills");
  mkdirSync(agentsDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });
  for (const [name, rosterLine] of Object.entries(spec.agents ?? {})) {
    const body = rosterLine ? `\n${rosterLine}\n` : "\n";
    writeFileSync(join(agentsDir, `${name}.toml`), `name = "${name}"\ndescription = "x"\ndeveloper_instructions = '''${body}'''\n`);
  }
  for (const [name, body] of Object.entries(spec.skills ?? {})) {
    mkdirSync(join(skillsDir, name), { recursive: true });
    writeFileSync(join(skillsDir, name, "SKILL.md"), `---\nname: ${name}\ndescription: "x"\n---\n${body}\n`);
  }
  if (spec.manifest !== false) {
    const payload = "manifest" in spec ? spec.manifest : { host: "codex", codex_cli_pin: "0.139.0", agents: { install: "node ./install-codex-agents.mjs" } };
    writeFileSync(join(buildDir, "codex-plugin.json"), JSON.stringify(payload));
  }
  writeFileSync(join(distDir, "AGENTS.md"), "# doctrine\n");
  writeFileSync(join(buildDir, "install-codex-agents.mjs"), "// installer\n");
  return { root, distDir, buildDir };
}

test("parseArgs reads dist, build-dir, repo-root, drive-codex, json", () => {
  const o = parseArgs(["--dist", "/d", "--build-dir", "/b", "--repo-root", "/r", "--drive-codex", "--json"]);
  assert.equal(o.dist, "/d");
  assert.equal(o.buildDir, "/b");
  assert.equal(o.repoRoot, "/r");
  assert.equal(o.driveCodex, true);
  assert.equal(o.json, true);
});

test("parseArgs rejects unknown flags", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument/);
});

test("agentNameFromToml reads the name field, not the filename", () => {
  assert.equal(agentNameFromToml('name = "bn-plan-lead"\ndescription = "x"'), "bn-plan-lead");
  assert.equal(agentNameFromToml("description = \"x\""), null);
});

test("skillNameFromMarkdown reads frontmatter name", () => {
  assert.equal(skillNameFromMarkdown("---\nname: bn-review\ndescription: x\n---\n"), "bn-review");
  assert.equal(skillNameFromMarkdown("no frontmatter"), null);
});

test("spawnRosterFromToml extracts the declared roster and ignores prose", () => {
  const line = "Your declared spawn roster is: bn-plan-generator, bn-plan-judge, bn-lesson-harvester. Inject only these.";
  assert.deepEqual(spawnRosterFromToml(line), ["bn-plan-generator", "bn-plan-judge", "bn-lesson-harvester"]);
  assert.deepEqual(spawnRosterFromToml("a leaf body with no roster"), []);
});

test("leadsReferencedBySkill finds and dedups lead references", () => {
  assert.deepEqual(leadsReferencedBySkill("spawn bn-plan-lead, then bn-plan-lead again, and bn-research-lead"), ["bn-plan-lead", "bn-research-lead"]);
  assert.deepEqual(leadsReferencedBySkill("bn-hello with no leads"), []);
});

test("leadsReferencedBySkill does not match a 'lead'-prefixed longer token", () => {
  // 'bn-team-leadership' must not be read as a reference to a 'bn-team-lead' agent.
  assert.deepEqual(leadsReferencedBySkill("under bn-team-leadership the work proceeds"), []);
  assert.deepEqual(leadsReferencedBySkill("the bn-plan-lead, not bn-plan-leadership"), ["bn-plan-lead"]);
});

test("spawnRosterFromToml matches a roster line that terminates at end of string", () => {
  assert.deepEqual(spawnRosterFromToml("Your declared spawn roster is: bn-a, bn-b."), ["bn-a", "bn-b"]);
});

test("delegationClosureGaps: GO when every closure agent is installed", () => {
  const { root, distDir } = buildPackage({
    agents: {
      "bn-plan-lead": "Your declared spawn roster is: bn-plan-generator, bn-plan-judge.",
      "bn-plan-generator": null,
      "bn-plan-judge": null,
    },
    skills: { "bn-plan": "dispatch bn-plan-lead" },
  });
  try {
    const pkg = readPackage(distDir);
    const gaps = delegationClosureGaps(pkg);
    assert.equal(gaps.delegatingSkillCount, 1);
    assert.deepEqual(gaps.missing, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delegationClosureGaps: NO-GO catches a missing lead (the R25 failure mode)", () => {
  const { root, distDir } = buildPackage({
    agents: { "bn-plan-generator": null }, // lead deliberately absent
    skills: { "bn-plan": "dispatch bn-plan-lead" },
  });
  try {
    const gaps = delegationClosureGaps(readPackage(distDir));
    assert.equal(gaps.missing.length, 1);
    assert.equal(gaps.missing[0].missingAgent, "bn-plan-lead");
    assert.deepEqual(gaps.missing[0].chain, ["bn-plan", "bn-plan-lead"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delegationClosureGaps: NO-GO catches a missing transitive roster member", () => {
  const { root, distDir } = buildPackage({
    agents: {
      "bn-plan-lead": "Your declared spawn roster is: bn-plan-generator, bn-plan-judge.",
      "bn-plan-generator": null,
      // bn-plan-judge missing from the store
    },
    skills: { "bn-plan": "dispatch bn-plan-lead" },
  });
  try {
    const gaps = delegationClosureGaps(readPackage(distDir));
    assert.equal(gaps.missing.length, 1);
    assert.equal(gaps.missing[0].missingAgent, "bn-plan-judge");
    assert.deepEqual(gaps.missing[0].chain, ["bn-plan", "bn-plan-lead", "bn-plan-judge"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delegationClosureGaps: a non-delegating skill contributes no closure", () => {
  const { root, distDir } = buildPackage({
    agents: { "bn-correctness-reviewer": null },
    skills: { "bn-hello": "a greeting, no leads" },
  });
  try {
    const gaps = delegationClosureGaps(readPackage(distDir));
    assert.equal(gaps.delegatingSkillCount, 0);
    assert.deepEqual(gaps.missing, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delegationClosureGaps: terminates on a roster cycle", () => {
  const { root, distDir } = buildPackage({
    agents: {
      "bn-thread-chaser": "Your declared spawn roster is: bn-thread-chaser.", // self-spawning lead
    },
    skills: { "bn-research": "dispatch bn-thread-chaser" },
  });
  try {
    const gaps = delegationClosureGaps(readPackage(distDir));
    assert.deepEqual(gaps.missing, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverabilityResult: GO on a complete fixture package", () => {
  const { root, distDir, buildDir } = buildPackage({
    agents: {
      "bn-plan-lead": "Your declared spawn roster is: bn-plan-generator.",
      "bn-plan-generator": null,
    },
    skills: { "bn-plan": "dispatch bn-plan-lead" },
  });
  try {
    const r = discoverabilityResult(distDir, buildDir);
    // The synthetic package has 2 agents / 1 skill, so the 54/19 count checks fail by design;
    // assert the manifest/installer/doctrine and the R25 closure checks pass.
    const byName = Object.fromEntries(r.checks.map((c) => [c.name, c.pass]));
    assert.equal(byName["packaging manifest present (codex-plugin.json)"], true);
    assert.equal(byName["agent-install step present (scripts/codex-build/install-codex-agents.mjs)"], true);
    assert.equal(byName["R25: every delegating skill finds its agent (closure skill -> lead -> roster all installed)"], true);
    assert.equal(r.gaps.missing.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverabilityResult: NO-GO when the manifest is absent", () => {
  const { root, distDir, buildDir } = buildPackage({ agents: {}, skills: {}, manifest: false });
  try {
    const r = discoverabilityResult(distDir, buildDir);
    assert.equal(r.go, false);
    assert.equal(r.checks.find((c) => c.name.startsWith("packaging manifest present")).pass, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverabilityResult: NO-GO when the manifest is valid-but-falsy JSON (null)", () => {
  // null parses without throwing but is not a usable config object; it must FAIL, not silently skip.
  const { root, distDir, buildDir } = buildPackage({ agents: {}, skills: {}, manifest: null });
  try {
    const r = discoverabilityResult(distDir, buildDir);
    const parses = r.checks.find((c) => c.name === "packaging manifest parses as JSON");
    assert.ok(parses, "expected a 'parses as JSON' check to be recorded");
    assert.equal(parses.pass, false);
    assert.equal(r.go, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("LIVE_GO_CONDITIONS names the depth-3, fan-out, reslot, and R25 conditions", () => {
  const blob = LIVE_GO_CONDITIONS.join("\n");
  assert.match(blob, /depth-3/i);
  assert.match(blob, /fan-out|sibling/);
  assert.match(blob, /reslot|spawn-reap-respawn/);
  assert.match(blob, /R25|finds its agent/);
});

test("RESIDUAL_PROBES carries R24 breadth + the 0.140.0 re-verify, not as GO conditions", () => {
  const blob = RESIDUAL_PROBES.join("\n");
  assert.match(blob, /width > 3/);
  assert.match(blob, /nested/i);
  assert.match(blob, /0\.140\.0/);
});

test("consultLoopWiring: the four host-neutral transcript/resume scripts are present (R9/R16)", () => {
  const w = consultLoopWiring(REPO_ROOT);
  assert.equal(w.wired, true, `missing: ${w.required.filter((r) => !w.present.includes(r)).join(", ")}`);
  assert.match(w.classification, /FAITHFUL/);
});

test("real committed dist/codex/ is a GO package: 54 agents, 19 skills, R25 closure clean", () => {
  const dist = join(REPO_ROOT, "dist", "codex");
  const build = join(REPO_ROOT, "scripts", "codex-build");
  const r = discoverabilityResult(dist, build);
  assert.equal(r.pkg.agents, 54, "expected 54 installed agents");
  assert.equal(r.pkg.skills, 19, "expected 19 skills");
  assert.equal(r.gaps.missing.length, 0, `R25 gaps: ${r.gaps.missing.map((m) => m.chain.join(" -> ")).join("; ")}`);
  assert.ok(r.gaps.delegatingSkillCount > 0, "expected at least one delegating skill");
  assert.equal(r.go, true, `discoverability NO-GO: ${r.checks.filter((c) => !c.pass).map((c) => c.name).join("; ")}`);
});
