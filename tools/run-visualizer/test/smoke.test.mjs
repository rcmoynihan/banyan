// U0 smoke test — asserts the `node --test` harness runs and the entry imports cleanly.
// This is the rail every later unit lands its own checks onto.

import { test } from "node:test";
import assert from "node:assert/strict";

test("harness runs", () => {
  assert.equal(1 + 1, 2);
});

test("entry module imports and exposes parseArgs/main", async () => {
  const mod = await import("../src/index.mjs");
  assert.equal(typeof mod.parseArgs, "function");
  assert.equal(typeof mod.main, "function");
});

test("parseArgs handles --run and --help", async () => {
  const { parseArgs } = await import("../src/index.mjs");
  assert.deepEqual(parseArgs(["--help"]), { help: true, run: undefined, rest: [] });
  assert.deepEqual(parseArgs(["--run", "my-run"]), {
    help: false,
    run: "my-run",
    rest: [],
  });
  assert.deepEqual(parseArgs(["--run=other"]), {
    help: false,
    run: "other",
    rest: [],
  });
});

test("main(--help) returns 0", async () => {
  const { main } = await import("../src/index.mjs");
  assert.equal(main(["--help"]), 0);
});
