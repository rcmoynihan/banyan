// U3 — REIMPLEMENTED project-slug + session path resolution (DI4: never imports plugin/ code).
// Credits the originals: mirrors the path-walk of
//   plugin/skills/bn-conventions/scripts/locate-transcript.mjs:57-137
// but is a fresh implementation here. F1 FIX: this module resolves TWO distinct locations per
// session — the subagents/ dir AND the SIBLING root transcript <projectSlug>/<sessionId>.jsonl —
// whereas locate-transcript.mjs only ever resolved the subagents/ path. The sibling-root
// resolution is NEW CODE the reimplementation adds, not inherited (plan F1 / R-C).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const SUBAGENTS_DIR = 'subagents';

/** Derive the Claude Code project slug from an absolute cwd: '/' → '-'. */
export function projectSlugFromCwd(cwd) {
  // Claude Code encodes the project path by replacing path separators with '-'.
  // e.g. /Users/riley/repos/banyan → -Users-riley-repos-banyan
  return String(cwd).replace(/[/\\]/g, '-');
}

/** The discovery root: ~/.claude/projects (env-overridable for tests). */
export function projectsRoot(env = process.env, homeDir) {
  if (env.CLAUDE_PROJECTS_DIR) return path.resolve(env.CLAUDE_PROJECTS_DIR);
  const home = homeDir ?? env.HOME ?? env.USERPROFILE ?? os.homedir();
  return path.join(home, '.claude', 'projects');
}

function safeIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function safeIsFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }
function safeReadDirNames(dir) { try { return fs.readdirSync(dir); } catch { return []; } }

/**
 * Resolve the two transcript locations for a session.
 * @returns {{
 *   sessionId: string, projectDir: string, sessionDir: string|null,
 *   subagentsDir: string|null, rootTranscript: string|null,
 *   subagentTranscripts: string[], metas: string[]
 * }}
 */
export function resolveSessionPaths({ projectSlug, sessionId, env = process.env, homeDir }) {
  const root = projectsRoot(env, homeDir);
  const projectDir = path.join(root, projectSlug);
  const sessionDir = path.join(projectDir, sessionId);
  const subagentsDir = path.join(sessionDir, SUBAGENTS_DIR);
  // F1: the root transcript is a SIBLING of the session dir, not inside it.
  const rootTranscript = path.join(projectDir, `${sessionId}.jsonl`);

  const result = {
    sessionId,
    projectDir,
    sessionDir: safeIsDir(sessionDir) ? sessionDir : null,
    subagentsDir: safeIsDir(subagentsDir) ? subagentsDir : null,
    rootTranscript: safeIsFile(rootTranscript) ? rootTranscript : null,
    subagentTranscripts: [],
    metas: [],
  };

  if (result.subagentsDir) {
    for (const name of safeReadDirNames(result.subagentsDir)) {
      const full = path.join(result.subagentsDir, name);
      if (name.endsWith('.meta.json')) result.metas.push(full);
      else if (name.endsWith('.jsonl')) result.subagentTranscripts.push(full);
    }
    result.subagentTranscripts.sort();
    result.metas.sort();
  }
  return result;
}

/** List candidate sessions in a project slug: dirs with subagents/ AND/OR a sibling root .jsonl. */
export function listSessions({ projectSlug, env = process.env, homeDir }) {
  const root = projectsRoot(env, homeDir);
  const projectDir = path.join(root, projectSlug);
  if (!safeIsDir(projectDir)) return [];
  const ids = new Set();
  for (const name of safeReadDirNames(projectDir)) {
    const full = path.join(projectDir, name);
    if (safeIsDir(full)) ids.add(name); // a session dir
    else if (name.endsWith('.jsonl')) ids.add(name.slice(0, -'.jsonl'.length)); // a sibling root
  }
  return [...ids].sort();
}

/** The push-down: an explicit session path/env beats discovery (R11). */
export function pushedSessionPath(env = process.env) {
  return env.CLAUDE_SESSION_PATH || env.BANYAN_SESSION_PATH || null;
}
