#!/usr/bin/env node

// transcript-probe.mjs — READ-ONLY probe for a Codex per-agent transcript
// substrate analogous to Claude Code's <sessionRoot>/subagents/agent-<id>.jsonl
// (the path locate-transcript.mjs reads, with transcript-pointer / transcript-slicer
// / resolve-resume-mode as dependents).
//
// The question this probe answers: does Codex write a per-spawned-agent session
// artifact, on disk, that carries (a) a stable thread id resolvable from a
// filename, (b) parent lineage so a consult chain can walk predecessor→successor,
// and (c) a terminal record so a locate-AND-complete check can tell a finished
// transcript from a growing one? If yes, the consult/lateral-rehydration loop
// has a faithful Codex port (the locator is portable). If no, it degrades to
// checkpoint-mode resume.
//
// Codex writes per-thread session rollouts under
//   <CODEX_HOME>/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<threadId>.jsonl
// where CODEX_HOME defaults to ~/.codex. Each rollout's first JSONL line is a
// `session_meta` record whose payload carries `id` (the thread id, also embedded
// in the filename), `parent_thread_id`, `thread_source` ("subagent" for a spawned
// child), and `source.subagent.thread_spawn` (parent_thread_id + depth). The last
// JSONL line of a finished thread is a parseable record (e.g. event_msg /
// task_complete), giving the same completeness heuristic locate-transcript uses.
//
// This probe is STRICTLY READ-ONLY: it stat()s and reads existing rollout files
// and never writes, moves, or deletes anything under CODEX_HOME (R22 boundary).
// It does NOT drive the codex CLI; a filesystem probe of existing sessions needs
// no CLI run, and no OPENAI_API_KEY / auth is touched.
//
// Zero dependencies — node:* only.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const SESSIONS_DIR = 'sessions';
const ROLLOUT_PREFIX = 'rollout-';
const ROLLOUT_SUFFIX = '.jsonl';

// Resolve the Codex sessions root read-only. CODEX_HOME wins (the install docs
// thread a single CODEX_HOME through every step, R22/F2); otherwise ~/.codex.
export function resolveSessionsRoot({ env = process.env, homeDir } = {}) {
  const codexHome = env.CODEX_HOME
    ? path.resolve(env.CODEX_HOME)
    : path.join(homeDir ?? env.HOME ?? env.USERPROFILE ?? os.homedir(), '.codex');
  return path.join(codexHome, SESSIONS_DIR);
}

// Extract the thread id embedded in a rollout filename:
//   rollout-<timestamp>-<uuid>.jsonl  ->  <uuid>
// The id is the trailing UUID (8-4-4-4-12 hex groups). Returns null on no match
// so a stray non-rollout file in the tree is skipped, not mis-parsed.
const UUID_RE = /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
export function threadIdFromFilename(fileName) {
  if (typeof fileName !== 'string') {
    return null;
  }
  if (!fileName.startsWith(ROLLOUT_PREFIX) || !fileName.endsWith(ROLLOUT_SUFFIX)) {
    return null;
  }
  const match = UUID_RE.exec(fileName);
  return match ? match[1] : null;
}

// Read the first non-empty JSONL line of a rollout and pull the lineage fields
// out of its session_meta payload. Returns a structured descriptor or a reason
// when the file cannot be read / parsed / is not a session_meta head.
//
// Schema-agnostic in spirit (we never treat a deep field as load-bearing for the
// run): this probe reads the lineage fields ONLY to answer the substrate
// question, exactly the read a ported locator would do to resolve a thread.
export function readSessionMeta(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const firstLine = firstNonEmptyLine(content);
  if (firstLine === null) {
    return { ok: false, reason: 'empty-file' };
  }
  let head;
  try {
    head = JSON.parse(firstLine);
  } catch {
    return { ok: false, reason: 'first-line-not-json' };
  }
  if (!head || head.type !== 'session_meta' || !head.payload) {
    return { ok: false, reason: 'no-session-meta-head' };
  }
  const p = head.payload;
  const spawn =
    p.source && p.source.subagent && p.source.subagent.thread_spawn
      ? p.source.subagent.thread_spawn
      : null;
  // A spawned child carries its parent in the top-level parent_thread_id OR,
  // when that is null, in source.subagent.thread_spawn.parent_thread_id. The
  // spawn-level field is the more complete carrier (some subagent rollouts have
  // a null top-level parent but a populated spawn parent), so it is the
  // fallback the lineage metric and the FAITHFUL gate key on.
  const topLevelParent = typeof p.parent_thread_id === 'string' ? p.parent_thread_id : null;
  const spawnParent =
    spawn && typeof spawn.parent_thread_id === 'string' ? spawn.parent_thread_id : null;
  return {
    ok: true,
    id: typeof p.id === 'string' ? p.id : null,
    parentThreadId: topLevelParent ?? spawnParent,
    threadSource: typeof p.thread_source === 'string' ? p.thread_source : null,
    isSubagent: p.thread_source === 'subagent',
    spawnDepth: spawn && typeof spawn.depth === 'number' ? spawn.depth : null,
    cliVersion: typeof p.cli_version === 'string' ? p.cli_version : null,
  };
}

// Completeness heuristic mirroring locate-transcript.mjs: the last non-empty line
// must parse as a complete JSON record (a still-flushing tail line would not).
// We do NOT inspect any internal field for the verdict — parseability alone.
export function lastLineComplete(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return false;
  }
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].trim() !== '') {
      try {
        JSON.parse(lines[i]);
        return true;
      } catch {
        return false;
      }
    }
  }
  return false;
}

function firstNonEmptyLine(content) {
  for (const line of content.split('\n')) {
    if (line.trim() !== '') {
      return line;
    }
  }
  return null;
}

// Recursively collect rollout-*.jsonl files under the date-partitioned sessions
// tree (sessions/<YYYY>/<MM>/<DD>/). Bounded depth, read-only readdir/stat; any
// unreadable directory is skipped rather than throwing. `limit` caps how many
// files are returned so the probe stays cheap on a large history.
export function collectRollouts(sessionsRoot, { limit = Infinity } = {}) {
  const out = [];
  walk(sessionsRoot, 0);
  return out;

  function walk(dir, depth) {
    if (out.length >= limit || depth > 4) {
      return;
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) {
        return;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile() && threadIdFromFilename(entry.name)) {
        out.push(full);
      }
    }
  }
}

// Probe the substrate and return a classification descriptor. Pure aside from the
// read-only filesystem reads. `sampleSize` bounds how many rollouts are inspected
// for lineage shape.
export function probeTranscriptSubstrate({ env, homeDir, sampleSize = 200 } = {}) {
  const sessionsRoot = resolveSessionsRoot({ env, homeDir });
  let rootExists = false;
  try {
    rootExists = fs.statSync(sessionsRoot).isDirectory();
  } catch {
    rootExists = false;
  }
  if (!rootExists) {
    return {
      classification: 'ABSENT',
      sessionsRoot,
      rootExists: false,
      rolloutCount: 0,
      sampled: 0,
      withSessionMeta: 0,
      withThreadId: 0,
      filenameIdMatches: 0,
      subagentThreads: 0,
      withParentLineage: 0,
      complete: 0,
      reason: 'no-sessions-root',
    };
  }

  const all = collectRollouts(sessionsRoot);
  // The sessions tree is date-partitioned (sessions/<YYYY>/<MM>/<DD>/) and rollout
  // filenames lead with an ISO timestamp, so a lexical sort orders them
  // chronologically; slicing the tail then samples the most-recent rollouts
  // rather than whichever readdir order the filesystem returned.
  const sample = [...all].sort().slice(-sampleSize);
  let withSessionMeta = 0;
  let withThreadId = 0;
  let filenameIdMatches = 0;
  let subagentThreads = 0;
  let withParentLineage = 0;
  let complete = 0;

  for (const filePath of sample) {
    const meta = readSessionMeta(filePath);
    if (!meta.ok) {
      continue;
    }
    withSessionMeta += 1;
    if (meta.id) {
      withThreadId += 1;
      if (threadIdFromFilename(path.basename(filePath)) === meta.id) {
        filenameIdMatches += 1;
      }
    }
    if (meta.isSubagent) {
      subagentThreads += 1;
    }
    if (meta.parentThreadId) {
      withParentLineage += 1;
    }
    if (lastLineComplete(filePath)) {
      complete += 1;
    }
  }

  // FAITHFUL requires the three locator preconditions to be present in the
  // sampled rollouts: a thread id resolvable from the filename (locate), parent
  // lineage to walk the consult chain (pointer), and a terminal record for the
  // locate-AND-complete check (slicer/completeness). Subagent threads (the
  // spawned-child case the loop rehydrates) must appear at least once.
  const hasLocate = filenameIdMatches > 0;
  const hasLineage = withParentLineage > 0;
  const hasComplete = complete > 0;
  const hasSubagent = subagentThreads > 0;

  let classification;
  let reason;
  if (withSessionMeta === 0) {
    classification = 'ABSENT';
    reason = 'rollouts-present-but-no-session-meta-lineage';
  } else if (hasLocate && hasLineage && hasComplete && hasSubagent) {
    classification = 'FAITHFUL';
    reason = 'per-thread-rollouts-with-filename-id-parent-lineage-and-terminal-record';
  } else if (hasLocate && hasComplete) {
    // Locatable + complete but no observed subagent lineage in the sample: the
    // locator can resolve a thread, but a consult chain that needs parent linkage
    // is not demonstrated here. Treat as DEGRADED (checkpoint fallback holds).
    classification = 'DEGRADED';
    reason = 'locatable-complete-rollouts-but-no-subagent-parent-lineage-in-sample';
  } else {
    classification = 'DEGRADED';
    reason = 'rollouts-present-but-missing-a-locator-precondition';
  }

  return {
    classification,
    sessionsRoot,
    rootExists: true,
    rolloutCount: all.length,
    sampled: sample.length,
    withSessionMeta,
    withThreadId,
    filenameIdMatches,
    subagentThreads,
    withParentLineage,
    complete,
    reason,
  };
}

function main() {
  const env = process.env;
  const result = probeTranscriptSubstrate({ env });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  // Always exit 0: a classification (including ABSENT) is a legitimate signal,
  // not a CLI error — the consult loop degrades to checkpoint mode on anything
  // short of FAITHFUL (resolve-resume-mode.mjs is the lock).
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
