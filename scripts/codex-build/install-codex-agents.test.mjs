import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readdirSync,
  rmSync,
  copyFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseArgs,
  resolveCodexHome,
  agentStoreDir,
  storePathFor,
  agentTomlFiles,
  defaultSourceDir,
} from "./install-codex-agents.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "install-codex-agents.mjs");

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function seedSource(dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "bn-alpha.toml"), 'name = "bn-alpha"\n');
  writeFileSync(join(dir, "bn-beta.toml"), 'name = "bn-beta"\n');
  writeFileSync(join(dir, "README.md"), "not an agent\n");
}

function run(args, env = {}) {
  return execFileSync("node", [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("parseArgs reads --codex-home, --source, and --dry-run", () => {
  const opts = parseArgs(["--codex-home", "/tmp/ch", "--source", "/tmp/src", "--dry-run"]);
  assert.equal(opts.codexHome, "/tmp/ch");
  assert.equal(opts.source, "/tmp/src");
  assert.equal(opts.dryRun, true);
});

test("parseArgs defaults are null/false when flags absent", () => {
  const opts = parseArgs([]);
  assert.equal(opts.codexHome, null);
  assert.equal(opts.source, null);
  assert.equal(opts.dryRun, false);
});

test("parseArgs rejects an unknown flag", () => {
  assert.throws(() => parseArgs(["--nope"]), /unknown argument: --nope/);
});

test("resolveCodexHome precedence: flag > env > ~/.codex", () => {
  assert.equal(
    resolveCodexHome({ flag: "/explicit", env: "/env", home: "/home/u" }),
    "/explicit",
  );
  assert.equal(
    resolveCodexHome({ flag: null, env: "/env", home: "/home/u" }),
    "/env",
  );
  assert.equal(
    resolveCodexHome({ flag: "   ", env: "   ", home: "/home/u" }),
    join("/home/u", ".codex"),
  );
});

test("defaultSourceDir resolves into the render-owned dist/codex/agents tree", () => {
  // From scripts/codex-build/, the generated agents live two levels up under dist/codex/agents.
  assert.equal(
    defaultSourceDir("/repo/scripts/codex-build"),
    join("/repo", "dist", "codex", "agents"),
  );
});

test("agentStoreDir is <codex-home>/agents", () => {
  assert.equal(agentStoreDir("/home/u/.codex"), join("/home/u/.codex", "agents"));
});

test("storePathFor preserves the TOML basename under the store dir", () => {
  const store = "/home/u/.codex/agents";
  assert.equal(
    storePathFor("bn-correctness-reviewer.toml", store),
    join(store, "bn-correctness-reviewer.toml"),
  );
  // A path-bearing source name still installs by basename only.
  assert.equal(
    storePathFor("/abs/dist/codex/agents/bn-unit-lead.toml", store),
    join(store, "bn-unit-lead.toml"),
  );
});

test("agentTomlFiles selects only *.toml, sorted, ignoring non-TOML", () => {
  const fakeReaddir = () => [
    "bn-zeta.toml",
    "README.md",
    "bn-alpha.toml",
    ".codex-plugin.json",
    "notes.txt",
  ];
  const files = agentTomlFiles("/ignored", fakeReaddir);
  assert.deepEqual(files, ["bn-alpha.toml", "bn-zeta.toml"]);
});

test("main copies only the *.toml agents into <codex-home>/agents", () => {
  const source = tempDir("u8-src-");
  const home = tempDir("u8-home-");
  try {
    seedSource(source);
    const out = run(["--source", source, "--codex-home", home]);
    assert.match(out, /installed 2 Banyan agents/);
    const installed = readdirSync(join(home, "agents")).sort();
    assert.deepEqual(installed, ["bn-alpha.toml", "bn-beta.toml"]);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("--dry-run reports the plan and writes nothing", () => {
  const source = tempDir("u8-src-");
  const home = tempDir("u8-home-");
  try {
    seedSource(source);
    const out = run(["--source", source, "--codex-home", home, "--dry-run"]);
    assert.match(out, /\[dry-run\] would install 2 agents/);
    // The from -> to plan lines name each agent's source and store destination.
    assert.match(out, /bn-alpha\.toml -> .*agents.*bn-alpha\.toml/);
    assert.throws(() => readdirSync(join(home, "agents")), /ENOENT/);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("default source (no --source) resolves into the repo's dist/codex/agents tree", () => {
  // Locks the path math the relocation depends on: from scripts/codex-build/ the installer must
  // reach <repo-root>/dist/codex/agents/ two levels up. Invoke from an unrelated cwd so a stray
  // cwd-relative resolution would surface, and assert the dry-run plan names that tree.
  const home = tempDir("u8-home-");
  try {
    const out = execFileSync("node", [SCRIPT, "--codex-home", home, "--dry-run"], {
      encoding: "utf8",
      cwd: tmpdir(),
      env: { ...process.env },
    });
    assert.match(out, /-> /);
    assert.match(out, new RegExp(`${join("dist", "codex", "agents")}.*\\.toml -> `));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("$CODEX_HOME plumbs through when --codex-home is absent", () => {
  const source = tempDir("u8-src-");
  const home = tempDir("u8-home-");
  try {
    seedSource(source);
    run(["--source", source], { CODEX_HOME: home });
    const installed = readdirSync(join(home, "agents")).sort();
    assert.deepEqual(installed, ["bn-alpha.toml", "bn-beta.toml"]);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("the entry-point guard fires when the script path contains a space", () => {
  // F3: the guard must run main() even from a directory whose name contains a space, where the
  // percent-encoded import.meta.url would not string-equal an un-encoded `file://${argv[1]}`.
  // realpathSync collapses platform temp symlinks (e.g. macOS /tmp -> /private/tmp) so the spaced
  // path is the only difference under test, not an unrelated symlink mismatch.
  const base = realpathSync(tempDir("u8 spaced-"));
  const scriptDir = join(base, "sub");
  const source = join(base, "src");
  const home = join(base, "home");
  try {
    mkdirSync(scriptDir, { recursive: true });
    copyFileSync(SCRIPT, join(scriptDir, "install-codex-agents.mjs"));
    seedSource(source);
    const out = execFileSync(
      "node",
      [join(scriptDir, "install-codex-agents.mjs"), "--source", source, "--codex-home", home, "--dry-run"],
      { encoding: "utf8", env: { ...process.env } },
    );
    assert.match(out, /\[dry-run\] would install 2 agents/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a mid-batch copy failure exits non-zero with a partial-store signal", () => {
  // F6: when a destination cannot be written mid-loop, the installer must report how many of N
  // landed and warn that the store is partial, rather than silently leaving a half-populated store.
  const source = tempDir("u8-src-");
  const home = tempDir("u8-home-");
  try {
    seedSource(source);
    // Block the second copy: occupy its destination with a directory so copyFileSync throws.
    const blocked = join(home, "agents", "bn-beta.toml");
    mkdirSync(blocked, { recursive: true });
    let captured;
    try {
      run(["--source", source, "--codex-home", home]);
      assert.fail("expected the install to exit non-zero");
    } catch (err) {
      captured = `${err.stderr ?? ""}${err.message ?? ""}`;
    }
    assert.match(captured, /installed 1 of 2 before failing/);
    assert.match(captured, /the agent store is now partial — re-run after resolving/);
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("a missing source directory exits non-zero", () => {
  const home = tempDir("u8-home-");
  try {
    assert.throws(
      () => run(["--source", join(home, "does-not-exist"), "--codex-home", home]),
      /Command failed/,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a source directory with no agent TOML exits non-zero", () => {
  const source = tempDir("u8-src-");
  const home = tempDir("u8-home-");
  try {
    writeFileSync(join(source, "README.md"), "no agents here\n");
    assert.throws(
      () => run(["--source", source, "--codex-home", home]),
      /Command failed/,
    );
  } finally {
    rmSync(source, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
