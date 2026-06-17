// Tests for the shared entry-point guard. The guard must canonicalize both sides so it fires under
// a symlinked invocation (the macOS /tmp -> /private/tmp class, where process.argv[1] keeps the
// symlink while import.meta.url is the realpath) and a spaced path, and must return false when the
// module was imported rather than run.
//
// Zero dependencies: node:* only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { isEntryPoint } from "./entry-point.mjs";

test("isEntryPoint: true when argv1 is the same real file as import.meta.url", () => {
  const root = mkdtempSync(join(tmpdir(), "entry-point-"));
  const script = join(root, "script.mjs");
  writeFileSync(script, "// x\n");
  try {
    assert.equal(isEntryPoint(script, pathToFileURL(script).href), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isEntryPoint: true through a symlinked invocation path (the silent-no-op regression)", () => {
  // argv1 is the symlink, import.meta.url the realpath of the target. A raw resolve()-only
  // comparison would not match and main() would never run; realpath canonicalization makes both
  // sides equal so the guard still fires.
  const root = mkdtempSync(join(tmpdir(), "entry-point-"));
  const realDir = join(root, "real");
  const linkDir = join(root, "link");
  mkdirSync(realDir, { recursive: true });
  const target = join(realDir, "script.mjs");
  writeFileSync(target, "// x\n");
  symlinkSync(realDir, linkDir);
  const symlinkedArgv1 = join(linkDir, "script.mjs");
  try {
    assert.notEqual(symlinkedArgv1, target, "fixture must invoke through the symlinked dir");
    assert.equal(isEntryPoint(symlinkedArgv1, pathToFileURL(target).href), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isEntryPoint: true through a path containing a space", () => {
  const root = mkdtempSync(join(tmpdir(), "entry point "));
  const dir = join(root, "a b", "c");
  mkdirSync(dir, { recursive: true });
  const script = join(dir, "script.mjs");
  writeFileSync(script, "// x\n");
  try {
    assert.equal(isEntryPoint(script, pathToFileURL(script).href), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isEntryPoint: false when the module was imported, not run as the entry point", () => {
  const root = mkdtempSync(join(tmpdir(), "entry-point-"));
  const module = join(root, "module.mjs");
  const importer = join(root, "importer.mjs");
  writeFileSync(module, "// x\n");
  writeFileSync(importer, "// x\n");
  try {
    assert.equal(isEntryPoint(importer, pathToFileURL(module).href), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("isEntryPoint: false when argv1 is missing (imported under a runner with no entry script)", () => {
  assert.equal(isEntryPoint(undefined, pathToFileURL(import.meta.url).href ?? import.meta.url), false);
});
