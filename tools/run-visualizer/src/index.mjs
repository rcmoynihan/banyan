#!/usr/bin/env node
// Banyan run-visualizer — launch entry (U0 STUB).
//
// This is the thin launch stub stood up in U0 so R19's single-command shape is fixed from
// unit one. U8 replaces the body with the real launch wiring:
//   discover/push-down -> cold bridge (U3) -> adapters -> model (U5) -> Ink render (U6/U7).
// Until U8 lands, this only parses argv and exits cleanly so the harness and `--help` work.
//
// Single owner across its lifetime: U0 (stub) -> U8 (real). No other unit edits this file (DI5).

const HELP = `banyan-run-visualizer — render the live nested subagent tree of a Banyan run

Usage:
  banyan-run-visualizer [--run <run-id-or-dir>] [--help]

Options:
  --run <id|dir>   Visualize a specific Banyan run (by run-id under .banyan/runs/ or a path).
                   When omitted, active-run discovery selects the newest in-flight run
                   (honoring BANYAN_SESSION_PATH / CLAUDE_SESSION_PATH push-down). [wired in U8]
  --help, -h       Show this help and exit.

Status: launch stub (U0). Full launch wiring lands in U8.`;

/**
 * Parse argv into a plain options object. Pure (no process exit, no IO) so it is unit-testable.
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ help: boolean, run: string|undefined, rest: string[] }}
 */
export function parseArgs(argv) {
  const opts = { help: false, run: undefined, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      opts.help = true;
    } else if (a === "--run") {
      opts.run = argv[i + 1];
      i++;
    } else if (a.startsWith("--run=")) {
      opts.run = a.slice("--run=".length);
    } else {
      opts.rest.push(a);
    }
  }
  return opts;
}

/**
 * Stub main: parse argv, print help on --help, otherwise print a not-yet-wired notice and exit 0.
 * Replaced wholesale in U8. Kept side-effecting-but-trivial so the smoke test can import this
 * module without launching anything.
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {number} exit code
 */
export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP + "\n");
    return 0;
  }
  process.stdout.write(
    "banyan-run-visualizer: launch wiring lands in U8; nothing to render yet.\n",
  );
  return 0;
}

// Only run main when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
