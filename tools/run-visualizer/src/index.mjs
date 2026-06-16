#!/usr/bin/env node
// Banyan run-visualizer — launch entry (U8 REAL wiring).
//
// Single-command launch (R19): discover/push-down → cold bridge (U3) → load transcripts →
// build the pure model (U5) → render Ink (U6/U7) with a live watcher (U6). This milestone is
// layered ON TOP of the proven seams (it does not precede the cold bridge — that was the rejected
// mvp-first ordering). Replay against a named fixture renders the full nested tree + a selectable
// detail pane (tail-from-zero for replay, R18).
//
// Single owner across its lifetime: U0 (stub) → U8 (real). No other unit edits this file (DI5).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { resolveSession } from './bridge/cold-bridge.mjs';
import { resolveSessionPaths, projectSlugFromCwd } from './bridge/session-paths.mjs';
import { discoverActiveRun } from './bridge/active-run.mjs';
import { parseLines } from './parse/jsonl-line.mjs';
import { buildDurableRoster } from './sources/durable-reader.mjs';
import { initialState, apply } from './model/run-model.mjs';

const HELP = `banyan-run-visualizer — render the live nested subagent tree of a Banyan run

Usage:
  banyan-run-visualizer [--run <run-id-or-dir>] [--help]

Options:
  --run <id|dir>   Visualize a specific Banyan run (by run-id under .banyan/runs/ or a path).
                   When omitted, active-run discovery selects the newest in-flight run
                   (honoring BANYAN_SESSION_PATH / CLAUDE_SESSION_PATH push-down).
  --help, -h       Show this help and exit.`;

/**
 * Parse argv into a plain options object. Pure (no process exit, no IO) so it is unit-testable.
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{ help: boolean, run: string|undefined, rest: string[] }}
 */
export function parseArgs(argv) {
  const opts = { help: false, run: undefined, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      opts.help = true;
    } else if (a === '--run') {
      opts.run = argv[i + 1];
      i++;
    } else if (a.startsWith('--run=')) {
      opts.run = a.slice('--run='.length);
    } else {
      opts.rest.push(a);
    }
  }
  return opts;
}

/** Resolve a --run argument (run-id under .banyan/runs/, or a path) to an absolute run dir. */
export function resolveRunDir(runArg, { cwd = process.cwd() } = {}) {
  if (!runArg) return null;
  if (fs.existsSync(runArg) && fs.statSync(runArg).isDirectory()) return path.resolve(runArg);
  const underRuns = path.join(cwd, '.banyan', 'runs', runArg);
  if (fs.existsSync(underRuns)) return underRuns;
  return path.resolve(runArg);
}

/**
 * Build the initial model state for a run dir WITHOUT launching Ink (the testable core of launch).
 * Resolves the session via the cold bridge; on resolve, loads transcripts and builds the tree;
 * on no-resolve/ambiguous, falls to the durable-only roster (DI3). Pure-ish: reads fs, no render.
 *
 * @returns {{ state: object, resolution: object, runDir: string }}
 */
export function buildStateForRun(runDir, { cwd = process.cwd(), env = process.env, homeDir = os.homedir() } = {}) {
  const resolution = resolveSession({ runDir, cwd, env, homeDir });
  if (!resolution.resolved) {
    // Fall to the durable-only degraded view (DI3): never render a wrong-but-confident tree.
    const roster = buildDurableRoster(runDir);
    return { state: apply(initialState(), { type: 'durable-only', roster }), resolution, runDir };
  }
  const projectSlug = projectSlugFromCwd(cwd);
  const paths = resolveSessionPaths({ projectSlug, sessionId: resolution.sessionId, env, homeDir });
  const transcripts = [];
  const metas = [];
  for (const f of paths.subagentTranscripts) {
    const id = path.basename(f, '.jsonl');
    transcripts.push({ id, records: parseLines(fs.readFileSync(f, 'utf8')).records });
  }
  for (const m of paths.metas) {
    const id = path.basename(m, '.meta.json');
    try { metas.push({ id, ...JSON.parse(fs.readFileSync(m, 'utf8')) }); } catch { /* skip bad meta */ }
  }
  const rootTranscript = paths.rootTranscript
    ? parseLines(fs.readFileSync(paths.rootTranscript, 'utf8')).records
    : null;
  const state = apply(initialState(), { type: 'build-tree', transcripts, metas, rootTranscript });
  return { state, resolution, runDir };
}

/**
 * main: parse argv, print help, or delegate to the async renderer. Kept SYNCHRONOUS for the
 * non-rendering paths (--help / no-run error) so the U0 contract `main(["--help"]) === 0` holds;
 * the actual Ink launch is the separate async launch() (dynamic Ink import).
 * @returns {number} exit code for the non-rendering paths; for a real launch, returns 0 after
 *   kicking off launch() (the process stays alive on the Ink render).
 */
export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP + '\n');
    return 0;
  }

  // Resolve which run to visualize: explicit --run, else active-run discovery.
  let runDir = resolveRunDir(opts.run);
  if (!runDir) {
    const runsDir = path.join(process.cwd(), '.banyan', 'runs');
    const disc = discoverActiveRun({ runsDir });
    runDir = disc.runDir;
    if (!runDir) {
      process.stderr.write('banyan-run-visualizer: no run specified and no active run discovered.\n');
      return 1;
    }
  }

  // A real launch renders Ink — do it out of band so main() stays synchronous + side-effect-light.
  launch(runDir).catch((err) => {
    process.stderr.write(`banyan-run-visualizer: ${err?.message ?? err}\n`);
    process.exitCode = 1;
  });
  return 0;
}

/**
 * launch: render the Ink app for a resolved run dir. The Ink/React imports are DYNAMIC so importing
 * this module (and main(["--help"])) never pulls in the renderer.
 * @returns {Promise<void>}
 */
export async function launch(runDir, { cwd = process.cwd(), env = process.env, homeDir = os.homedir() } = {}) {
  const { state, resolution } = buildStateForRun(runDir, { cwd, env, homeDir });

  const React = (await import('react')).default;
  const { render } = await import('ink');
  const { App } = await import('./ui/App.mjs');
  const { DetailPane } = await import('./ui/DetailPane.mjs');

  const firstId = Object.keys(state.nodes)[0] ?? null;
  const initial = firstId ? apply(state, { type: 'select', id: firstId }) : state;

  const { waitUntilExit } = render(
    React.createElement(App, { state: initial, DetailComponent: DetailPane }),
  );
  process.stderr.write(
    `banyan-run-visualizer: ${resolution.resolved ? `resolved session ${resolution.sessionId}` : `durable-only (${resolution.reason})`}\n`,
  );
  await waitUntilExit();
}

// Only run main when invoked directly (not when imported by a test).
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)));
}
