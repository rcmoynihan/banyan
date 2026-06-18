// Tests for the one-command Codex installer. Asserts it installs the skills tree under
// <codex-home>/skills/banyan/ (excluding the agent store and the build manifest), installs
// the 55-style agent store under <codex-home>/agents/, honors --skills-only/--agents-only/
// --dry-run, reinstalls cleanly, and never writes on a dry run.
//
// Zero dependencies: node:* only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseArgs,
  skillsInstallRoot,
  defaultRenderRoot,
  skillsTreeEntries,
} from "./install-codex.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "install-codex.mjs");

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// A fake render root mirroring dist/codex/: a skill, a schema, the plugin manifest, the
// AGENTS.md doctrine, two agent TOMLs, and the authoring-only build manifest.
function seedRender(dir) {
  mkdirSync(join(dir, "skills", "bn-demo"), { recursive: true });
  writeFileSync(join(dir, "skills", "bn-demo", "SKILL.md"), "---\nname: bn-demo\n---\nBody.\n");
  mkdirSync(join(dir, "schemas"), { recursive: true });
  writeFileSync(join(dir, "schemas", "demo.schema.json"), "{}\n");
  mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
  writeFileSync(join(dir, ".claude-plugin", "plugin.json"), '{"name":"banyan","version":"9.9.9"}\n');
  writeFileSync(join(dir, "AGENTS.md"), "# Doctrine\n");
  mkdirSync(join(dir, "agents"), { recursive: true });
  writeFileSync(join(dir, "agents", "bn-alpha.toml"), 'name = "bn-alpha"\n');
  writeFileSync(join(dir, "agents", "bn-beta.toml"), 'name = "bn-beta"\n');
  writeFileSync(join(dir, ".build-manifest.json"), "{}\n");
}

function run(args, env = {}) {
  return execFileSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("parseArgs reads every flag", () => {
  const opts = parseArgs(["--codex-home", "/ch", "--source", "/src", "--skills-only", "--dry-run"]);
  assert.equal(opts.codexHome, "/ch");
  assert.equal(opts.source, "/src");
  assert.equal(opts.skillsOnly, true);
  assert.equal(opts.dryRun, true);
});

test("parseArgs rejects --skills-only with --agents-only", () => {
  assert.throws(() => parseArgs(["--skills-only", "--agents-only"]), /mutually exclusive/);
});

test("parseArgs rejects an unknown flag", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument: --nope/);
});

test("skillsInstallRoot is <codex-home>/skills/banyan", () => {
  assert.equal(skillsInstallRoot("/home/u/.codex"), join("/home/u/.codex", "skills", "banyan"));
});

test("defaultRenderRoot resolves into dist/codex (one above the agent source)", () => {
  assert.ok(defaultRenderRoot().endsWith(join("dist", "codex", "agents", "..")));
});

test("skillsTreeEntries excludes the agent store and the build manifest", () => {
  const fakeReaddir = () => ["AGENTS.md", "skills", "schemas", ".claude-plugin", "agents", ".build-manifest.json"];
  assert.deepEqual(skillsTreeEntries("/ignored", fakeReaddir), [
    ".claude-plugin",
    "AGENTS.md",
    "schemas",
    "skills",
  ]);
});

test("full install lands the skills tree and the agent store, excluding agents/ + manifest", () => {
  const source = tempDir("ic-src-");
  const home = tempDir("ic-home-");
  try {
    seedRender(source);
    const out = run(["--source", source, "--codex-home", home]);
    assert.match(out, /installed Banyan skills tree \(1 skills\)/);
    assert.match(out, /installed 2 Banyan agents/);

    const banyan = join(home, "skills", "banyan");
    assert.deepEqual(readdirSync(banyan).sort(), [".claude-plugin", "AGENTS.md", "schemas", "skills"]);
    assert.ok(existsSync(join(banyan, "skills", "bn-demo", "SKILL.md")));
    assert.ok(existsSync(join(banyan, "schemas", "demo.schema.json")));
    assert.equal(JSON.parse(readFileSync(join(banyan, ".claude-plugin", "plugin.json"), "utf8")).name, "banyan");
    // The agent store and build manifest must NOT be copied into the skills root.
    assert.ok(!existsSync(join(banyan, "agents")), "agents/ leaked into skills root");
    assert.ok(!existsSync(join(banyan, ".build-manifest.json")), "build manifest leaked into skills root");

    assert.deepEqual(readdirSync(join(home, "agents")).sort(), ["bn-alpha.toml", "bn-beta.toml"]);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("--skills-only installs the tree and skips the agent store", () => {
  const source = tempDir("ic-src-");
  const home = tempDir("ic-home-");
  try {
    seedRender(source);
    run(["--source", source, "--codex-home", home, "--skills-only"]);
    assert.ok(existsSync(join(home, "skills", "banyan", "AGENTS.md")));
    assert.ok(!existsSync(join(home, "agents")), "agent store written under --skills-only");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("--agents-only installs the store and skips the skills tree", () => {
  const source = tempDir("ic-src-");
  const home = tempDir("ic-home-");
  try {
    seedRender(source);
    run(["--source", source, "--codex-home", home, "--agents-only"]);
    assert.deepEqual(readdirSync(join(home, "agents")).sort(), ["bn-alpha.toml", "bn-beta.toml"]);
    assert.ok(!existsSync(join(home, "skills", "banyan")), "skills tree written under --agents-only");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("reinstall replaces the skills root wholesale, dropping a stale file", () => {
  const source = tempDir("ic-src-");
  const home = tempDir("ic-home-");
  try {
    seedRender(source);
    run(["--source", source, "--codex-home", home, "--skills-only"]);
    // Plant a stale file inside the banyan root, then reinstall.
    const stale = join(home, "skills", "banyan", "stale-leftover.txt");
    writeFileSync(stale, "stale\n");
    run(["--source", source, "--codex-home", home, "--skills-only"]);
    assert.ok(!existsSync(stale), "reinstall left a stale file behind");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("--dry-run reports the plan and writes nothing", () => {
  const source = tempDir("ic-src-");
  const home = tempDir("ic-home-");
  try {
    seedRender(source);
    const out = run(["--source", source, "--codex-home", home, "--dry-run"]);
    assert.match(out, /\[dry-run\] would replace/);
    assert.match(out, /\[dry-run\] would install 2 agents/);
    assert.ok(!existsSync(join(home, "skills")), "dry run wrote the skills tree");
    assert.ok(!existsSync(join(home, "agents")), "dry run wrote the agent store");
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("$CODEX_HOME plumbs through when --codex-home is absent", () => {
  const source = tempDir("ic-src-");
  const home = tempDir("ic-home-");
  try {
    seedRender(source);
    run(["--source", source], { CODEX_HOME: home });
    assert.ok(existsSync(join(home, "skills", "banyan", "AGENTS.md")));
    assert.deepEqual(readdirSync(join(home, "agents")).sort(), ["bn-alpha.toml", "bn-beta.toml"]);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("a missing render root exits non-zero", () => {
  const home = tempDir("ic-home-");
  try {
    assert.throws(() => run(["--source", join(home, "nope"), "--codex-home", home]), /Command failed/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
