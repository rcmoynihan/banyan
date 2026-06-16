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
    return { state: apply(initialState(), { type: 'durable-only', roster }), resolution, runDir, paths: null };
  }
  const projectSlug = projectSlugFromCwd(cwd);
  const paths = resolveSessionPaths({ projectSlug, sessionId: resolution.sessionId, env, homeDir });
  const state = buildTranscriptState(paths);
  return { state, resolution, runDir, paths };
}

/** Derive the session id from a push-down session PATH (a <sessionId>.jsonl transcript or a session
 *  dir). Strips a trailing .jsonl; otherwise uses the basename. */
export function sessionIdFromPath(sessionPath) {
  const base = path.basename(String(sessionPath));
  return base.endsWith('.jsonl') ? base.slice(0, -'.jsonl'.length) : base;
}

/**
 * Build the model state for an explicit push-down SESSION path (F6), BYPASSING the cold bridge —
 * a push-down has no activity.log to score, and R11 mandates it "beats everything". Resolves the
 * two transcript locations for the session and builds the full nested tree directly.
 * @returns {{ state: object, resolution: object, sessionPath: string, paths: object }}
 */
export function buildStateForSessionPath(sessionPath, { cwd = process.cwd(), env = process.env, homeDir = os.homedir() } = {}) {
  const projectSlug = projectSlugFromCwd(cwd);
  const sessionId = sessionIdFromPath(sessionPath);
  const paths = resolveSessionPaths({ projectSlug, sessionId, env, homeDir });
  const resolution = { resolved: true, sessionId, source: 'push-down' };
  const state = buildTranscriptState(paths);
  return { state, resolution, sessionPath, paths };
}

/** Load + parse the transcript tier for a resolved set of session paths into a build-tree state. */
function buildTranscriptState(paths) {
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
  return apply(initialState(), { type: 'build-tree', transcripts, metas, rootTranscript });
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

  // Resolve which run/session to visualize. Explicit --run is a run dir; otherwise active-run
  // discovery may surface a push-down SESSION path (F6) which bypasses the cold bridge entirely.
  let launchArg;
  const explicit = resolveRunDir(opts.run);
  if (explicit) {
    launchArg = { runDir: explicit };
  } else {
    const runsDir = path.join(process.cwd(), '.banyan', 'runs');
    const disc = discoverActiveRun({ runsDir });
    if (disc.sessionPath) {
      // F6: a push-down session path — feed it straight into the transcript loader, not the bridge.
      launchArg = { sessionPath: disc.sessionPath };
    } else if (disc.runDir) {
      launchArg = { runDir: disc.runDir };
    } else {
      process.stderr.write('banyan-run-visualizer: no run specified and no active run discovered.\n');
      return 1;
    }
  }

  // A real launch renders Ink. F1: do NOT process.exit() this path — main() returns synchronously
  // after kicking off launch(); Ink's waitUntilExit keeps the process alive, and launch failure
  // sets process.exitCode (never a synchronous exit that would kill the pending render).
  launch(launchArg).catch((err) => {
    process.stderr.write(`banyan-run-visualizer: ${err?.message ?? err}\n`);
    process.exitCode = 1;
  });
  return 0;
}

/**
 * launch: render the LIVE Ink app for a resolved run dir or push-down session path. The Ink/React
 * imports are DYNAMIC so importing this module (and main(["--help"])) never pulls in the renderer.
 *
 * F2 — this wires the live lane: it builds the watcher paths from the resolved session paths,
 * constructs createWatcher, and mounts a root component over useRunModel whose bootstrap starts the
 * watcher (forwarding growth → FSM → liveness dispatch) and returns watcher.stop as cleanup, and
 * passes onEvent={dispatch} to App so keyboard navigate/expand actually mutate state in production.
 *
 * @param {{ runDir?: string, sessionPath?: string }} arg
 * @returns {Promise<void>}
 */
export async function launch(arg, { cwd = process.cwd(), env = process.env, homeDir = os.homedir() } = {}) {
  const built = arg.sessionPath
    ? buildStateForSessionPath(arg.sessionPath, { cwd, env, homeDir })
    : buildStateForRun(arg.runDir, { cwd, env, homeDir });
  const { state, resolution, paths } = built;

  const React = (await import('react')).default;
  const { render } = await import('ink');
  const { App } = await import('./ui/App.mjs');
  const { DetailPane } = await import('./ui/DetailPane.mjs');
  const { useRunModel } = await import('./ui/useRunModel.mjs');
  const { createWatcher } = await import('./adapters/transcript-watcher.mjs');

  const firstId = Object.keys(state.nodes)[0] ?? null;
  const initial = firstId ? apply(state, { type: 'select', id: firstId }) : state;

  // Live watch targets: the subagents/ subtree + the sibling root transcript (when resolved). In
  // durable-only mode (no paths) there is no transcript tier to tail — render the static roster.
  const watchPaths = paths
    ? [paths.subagentsDir, paths.rootTranscript].filter(Boolean)
    : [];

  // The live root: subscribe the renderer to the model and (when there is a tier to watch) bootstrap
  // the watcher. onEvent={dispatch} makes navigation/expand live; the FSM + quiescence producer live
  // inside useRunModel (F3). Returns watcher.stop as the effect cleanup so the watch is torn down.
  function Root() {
    const [liveState, dispatch] = useRunModel({
      initial,
      bootstrap: watchPaths.length
        ? (_dispatch, onGrowth) => {
          const watcher = createWatcher({ paths: watchPaths, onGrowth });
          watcher.start();
          return () => { watcher.stop(); };
        }
        : undefined,
    });
    return React.createElement(App, { state: liveState, onEvent: dispatch, DetailComponent: DetailPane });
  }

  const { waitUntilExit } = render(React.createElement(Root));
  process.stderr.write(
    `banyan-run-visualizer: ${resolution.resolved ? `resolved session ${resolution.sessionId}` : `durable-only (${resolution.reason})`}\n`,
  );
  await waitUntilExit();
}

// Only run main when invoked directly (not when imported by a test).
// F1: do NOT process.exit(main(...)). main() kicks off the async launch() WITHOUT awaiting and
// returns synchronously; process.exit() fires in the SAME tick and terminates before launch()'s
// dynamic imports/render ever run (process.exit does not drain pending promises), so the TUI never
// appears. Instead, set process.exitCode for the synchronous non-render paths (--help → 0, no-run
// → 1) and let Ink's waitUntilExit keep the process alive on the render path; launch() failure sets
// process.exitCode in its own .catch.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main(process.argv.slice(2));
}
