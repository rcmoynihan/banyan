// Unit tests for the pure discoverability/closure logic of the Codex verification smoke (plan U9).
// These run under the standing node --test discipline and need no codex CLI: they exercise the
// parsers and the R25 delegation-closure check against synthetic fixture packages plus a sanity
// pass over the real committed dist/codex/.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

import {
  parseArgs,
  agentNameFromToml,
  skillNameFromMarkdown,
  spawnRosterFromToml,
  componentsReferencedBySkill,
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
  // The render's static assets and the unified installer, unless the spec opts out (to exercise
  // the NO-GO path where the render dropped them).
  if (spec.staticAssets !== false) {
    mkdirSync(join(distDir, "schemas"), { recursive: true });
    writeFileSync(join(distDir, "schemas", "drive-recipe.schema.json"), "{}\n");
    mkdirSync(join(distDir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(distDir, ".claude-plugin", "plugin.json"), '{"name":"banyan","version":"0.0.0"}\n');
  }
  if (spec.unifiedInstaller !== false) {
    writeFileSync(join(buildDir, "install-codex.mjs"), "// unified installer\n");
  }
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

test("componentsReferencedBySkill finds and dedups component references, dropping the self-reference", () => {
  assert.deepEqual(
    componentsReferencedBySkill("spawn bn-plan-lead, then bn-plan-lead again, and bn-mock-builder", "bn-plan"),
    ["bn-plan-lead", "bn-mock-builder"],
  );
  assert.deepEqual(componentsReferencedBySkill("bn-hello with no delegates", "bn-hello"), []);
});

test("componentsReferencedBySkill references non-lead workers and reviewers directly (no -lead convention)", () => {
  // The closure must see direct skill -> worker / skill -> reviewer edges, not only skill -> lead.
  assert.deepEqual(
    componentsReferencedBySkill("Spawn ONE bn-mock-builder leaf.", "bn-mock"),
    ["bn-mock-builder"],
  );
  assert.deepEqual(
    componentsReferencedBySkill("Spawn bn-spec-scenario-reviewer and bn-spec-threat-reviewer.", "bn-spec-stress"),
    ["bn-spec-scenario-reviewer", "bn-spec-threat-reviewer"],
  );
});

test("componentsReferencedBySkill ignores bn- tokens inside fenced code blocks", () => {
  // A bn-... token that is a temp-file name or shell literal inside ``` fences (e.g. the bn-ship
  // mktemp bn-pr-body template) is not a delegation and must not be scraped.
  const body = [
    "Spawn `bn-pr-comment-resolver` per comment.",
    "```bash",
    'BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/bn-pr-body.XXXXXX")',
    "bn-not-an-agent --flag",
    "```",
    "Then route back.",
  ].join("\n");
  assert.deepEqual(componentsReferencedBySkill(body, "bn-resolve-pr"), ["bn-pr-comment-resolver"]);
});

test("componentsReferencedBySkill strips tilde fences as well as backtick fences", () => {
  // R2-3: a bn-* token inside a ~~~ fence is a code literal, not a delegation, and must be stripped
  // the same as a ``` fence. Leaving tilde fences unstripped reads the literal as a real delegation
  // (a false positive in the R25 closure).
  assert.deepEqual(
    componentsReferencedBySkill("~~~\nbn-fake-agent\n~~~", "bn-test"),
    [],
  );
  // A real prose delegation alongside a tilde-fenced literal keeps only the prose reference.
  assert.deepEqual(
    componentsReferencedBySkill("Spawn bn-mock-builder.\n~~~\nbn-not-an-agent --flag\n~~~", "bn-mock"),
    ["bn-mock-builder"],
  );
});

test("no installed-agent delegation is reachable only through a fenced block in a real SKILL.md (R2-3)", () => {
  // R2-3: fenced blocks are stripped before the closure scan, so a delegation that lives ONLY inside
  // a fence is invisible to the R25 gate (a future false GO when a load-bearing delegation is moved
  // into an example fence). Guard the real committed package: for every skill, an installed-agent
  // bn-* token that appears inside a fence must also be reachable through the skill's actual
  // delegation closure (its prose refs walked transitively through lead rosters). A roster-reachable
  // agent (e.g. bn-ask naming bn-research-lead only inside its envelope example, reached via
  // bn-ask-lead's roster) is fine; a fenced-only agent that the closure does NOT reach would silently
  // pass the gate and must fail here.
  const distDir = join(REPO_ROOT, "dist", "codex");
  const skillsDir = join(distDir, "skills");
  const pkg = readPackage(distDir);
  const { installedAgents, installedSkills, rosters } = pkg;

  const reachableAgentsFor = (refs) => {
    const reached = new Set();
    const seen = new Set();
    const stack = refs.map((ref) => ({ token: ref, rootRef: true }));
    while (stack.length) {
      const { token, rootRef } = stack.pop();
      if (seen.has(token)) continue;
      seen.add(token);
      if (installedAgents.has(token)) {
        reached.add(token);
        for (const member of rosters.get(token) ?? []) {
          if (!seen.has(member)) stack.push({ token: member, rootRef: false });
        }
        continue;
      }
      if (rootRef && installedSkills.has(token)) continue;
    }
    return reached;
  };

  const fencedRe = /(?:```|~~~)[\s\S]*?(?:```|~~~)/g;
  const tokenRe = /\bbn-[a-z0-9-]+\b/g;
  for (const skill of pkg.skills) {
    const text = readFileSync(join(skillsDir, skill.dir, "SKILL.md"), "utf8");
    const reachable = reachableAgentsFor(skill.refs);
    const fencedTokens = new Set();
    for (const block of text.match(fencedRe) ?? []) {
      for (const t of block.match(tokenRe) ?? []) {
        if (t !== skill.name) fencedTokens.add(t);
      }
    }
    for (const t of fencedTokens) {
      if (installedAgents.has(t) && !reachable.has(t)) {
        assert.fail(
          `${skill.dir}/SKILL.md reaches installed agent ${t} only through a fenced block; the ` +
            `closure strips fences, so this delegation is invisible to the R25 gate — name it in ` +
            `prose or reach it through a prose-named lead's roster`,
        );
      }
    }
  }
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

test("delegationClosureGaps: NO-GO when a skill delegates DIRECTLY to a non-lead agent absent from the store (F1)", () => {
  // The R25 failure mode the smoke exists to catch: a delegating skill whose delegate is a worker
  // or reviewer (no -lead suffix) missing from the agent store. The old lead-prose closure scored
  // this a false GO; the structural closure over the full installed surface must NO-GO.
  const { root, distDir } = buildPackage({
    agents: { "bn-correctness-reviewer": null }, // bn-mock-builder deliberately absent
    skills: { "bn-mock": "Spawn ONE bn-mock-builder leaf under the fidelity boundary." },
  });
  try {
    const gaps = delegationClosureGaps(readPackage(distDir));
    assert.equal(gaps.missing.length, 1);
    assert.equal(gaps.missing[0].missingAgent, "bn-mock-builder");
    assert.deepEqual(gaps.missing[0].chain, ["bn-mock", "bn-mock-builder"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("delegationClosureGaps: a cross-skill reference resolves without requiring an agent of that name", () => {
  // A skill that routes to another skill (e.g. bn-debug naming bn-plan) is valid cross-skill
  // routing, not a delegation to an agent; it must NOT be reported as a missing delegate.
  const { root, distDir } = buildPackage({
    agents: {
      "bn-debug-lead": "Your declared spawn roster is: bn-hypothesis-investigator.",
      "bn-hypothesis-investigator": null,
    },
    skills: {
      "bn-debug": "dispatch bn-debug-lead; on a confirmed fix, hand off to bn-plan",
      "bn-plan": "a planning skill, no agent named bn-plan exists",
    },
  });
  try {
    const gaps = delegationClosureGaps(readPackage(distDir));
    assert.deepEqual(gaps.missing, [], `unexpected gaps: ${JSON.stringify(gaps.missing)}`);
    assert.equal(gaps.delegatingSkillCount, 1, "only bn-debug delegates to an agent");
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

test("discoverabilityResult: NO-GO when the render dropped its static assets", () => {
  // A render that emits agents/skills/AGENTS.md but not schemas/ + .claude-plugin/plugin.json
  // installs a tree with dangling install-root references; the static-asset check must red it.
  const { root, distDir, buildDir } = buildPackage({
    agents: { "bn-plan-generator": null },
    skills: { "bn-plan": "dispatch bn-plan-lead" },
    staticAssets: false,
  });
  try {
    const r = discoverabilityResult(distDir, buildDir);
    const check = r.checks.find((c) => c.name.startsWith("render static assets present"));
    assert.ok(check, "expected the static-asset check to be recorded");
    assert.equal(check.pass, false);
    assert.equal(r.go, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("discoverabilityResult: NO-GO when the unified installer is absent", () => {
  const { root, distDir, buildDir } = buildPackage({
    agents: { "bn-plan-generator": null },
    skills: { "bn-plan": "dispatch bn-plan-lead" },
    unifiedInstaller: false,
  });
  try {
    const r = discoverabilityResult(distDir, buildDir);
    const check = r.checks.find((c) => c.name.startsWith("unified installer present"));
    assert.ok(check, "expected the unified-installer check to be recorded");
    assert.equal(check.pass, false);
    assert.equal(r.go, false);
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

test("discoverabilityResult: dirs-absent early-exit is NO-GO with null gaps (R2-4b)", () => {
  // R2-4b: when agents/ (or skills/) is missing, discoverabilityResult records the dirs check FAIL
  // and short-circuits, returning gaps === null without attempting to read the package. The default
  // fixtures always create both dirs, so delete agents/ to exercise the early-exit branch.
  const { root, distDir, buildDir } = buildPackage({
    agents: { "bn-plan-generator": null },
    skills: { "bn-plan": "dispatch bn-plan-lead" },
  });
  try {
    rmSync(join(distDir, "agents"), { recursive: true, force: true });
    const r = discoverabilityResult(distDir, buildDir);
    assert.equal(r.go, false);
    assert.equal(r.gaps, null);
    const dirsCheck = r.checks.find((c) => c.name === "agents/ and skills/ dirs present");
    assert.ok(dirsCheck, "expected the dirs-present check to be recorded");
    assert.equal(dirsCheck.pass, false);
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

test("real committed dist/codex/ is a GO package: 55 agents, 19 skills, R25 closure clean", () => {
  const dist = join(REPO_ROOT, "dist", "codex");
  const build = join(REPO_ROOT, "scripts", "codex-build");
  const r = discoverabilityResult(dist, build);
  assert.equal(r.pkg.agents, 55, "expected 55 installed agents");
  assert.equal(r.pkg.skills, 19, "expected 19 skills");
  assert.equal(r.gaps.missing.length, 0, `R25 gaps: ${r.gaps.missing.map((m) => m.chain.join(" -> ")).join("; ")}`);
  assert.ok(r.gaps.delegatingSkillCount > 0, "expected at least one delegating skill");
  assert.equal(r.go, true, `discoverability NO-GO: ${r.checks.filter((c) => !c.pass).map((c) => c.name).join("; ")}`);
});

test("the roster-line contract holds against the real rendered lead TOMLs (F11)", () => {
  // The "Your declared spawn roster is: a, b, c." line is a cross-file contract between the Codex
  // generator and this smoke's parser. Parse it out of the real committed lead TOMLs so a generator
  // change to the roster-line shape is caught here rather than silently zeroing every roster (which
  // would let a missing roster member slip through the R25 closure as a false GO).
  const agentsDir = join(REPO_ROOT, "dist", "codex", "agents");
  const withRosterLine = readdirSync(agentsDir)
    .filter((f) => f.endsWith(".toml"))
    .map((f) => ({ file: f, text: readFileSync(join(agentsDir, f), "utf8") }))
    .filter(({ text }) => /declared spawn roster is:/.test(text));

  assert.ok(withRosterLine.length > 0, "expected at least one rendered lead to carry a roster line");
  for (const { file, text } of withRosterLine) {
    const roster = spawnRosterFromToml(text);
    assert.ok(
      roster.length > 0,
      `${file} carries a roster line but spawnRosterFromToml parsed it to []; the generator's roster-line shape and the smoke's ROSTER_RE have drifted`,
    );
    for (const member of roster) {
      assert.match(member, /^bn-[a-z0-9-]+$/, `${file} roster member "${member}" is not a bn- agent name`);
    }
  }
});

test("the entry-point guard runs main() when invoked from a path containing a space (F4)", () => {
  // The guard must not silently no-op on a script path with a space (the percent-encoding bug class
  // of the file://${argv[1]} form). Copy the smoke into a spaced dir and confirm it still drives the
  // discoverability arm against the real package and emits a GO/NO-GO line with exit 0 (GO).
  const root = mkdtempSync(join(tmpdir(), "codex smoke space-"));
  const spacedDir = join(root, "eval with space", "codex");
  mkdirSync(spacedDir, { recursive: true });
  // The smoke imports the shared guard at ../../plugin/skills/bn-conventions/scripts/entry-point.mjs;
  // mirror that relative subtree under the spaced root so the copied script resolves it.
  const sharedDir = join(root, "plugin", "skills", "bn-conventions", "scripts");
  mkdirSync(sharedDir, { recursive: true });
  const srcDir = dirname(fileURLToPath(import.meta.url));
  cpSync(join(srcDir, "run-codex-smoke.mjs"), join(spacedDir, "run-codex-smoke.mjs"));
  cpSync(
    join(REPO_ROOT, "plugin", "skills", "bn-conventions", "scripts", "entry-point.mjs"),
    join(sharedDir, "entry-point.mjs"),
  );
  try {
    const out = execFileSync(
      process.execPath,
      [join(spacedDir, "run-codex-smoke.mjs"), "--repo-root", REPO_ROOT],
      { encoding: "utf8" },
    );
    assert.match(out, /SMOKE \(discoverability\): GO/, "expected the guarded main() to run and emit a GO line");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
