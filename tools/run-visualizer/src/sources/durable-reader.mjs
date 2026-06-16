// U5 — durable-signal reader. Reads a Banyan run dir's durable signals (activity.log, ledger
// Units, progress/<agent>.md roster, review/round-N/ dirs) for the coarse + fallback lane (R9).
// Supports BOTH run-dir layouts — flat (pre-2026-06-14) and nested review/round-N/ (P12/R10).
// activity.log format `<ISO>\t<actor>\t<message>` is REIMPLEMENTED per heartbeat.mjs:27 (DI4).
// Ledger `## Log` timestamps are zeroed (00:00:00Z) → ORDINAL-ONLY, never used as real time.

import fs from 'node:fs';
import path from 'node:path';

function safeRead(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } }
function safeIsDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function safeReadDirNames(dir) { try { return fs.readdirSync(dir); } catch { return []; } }

/** Parse activity.log lines into {ts, actor, message} (real timestamps — these ARE real time). */
export function readActivityLog(runDir) {
  const raw = safeRead(path.join(runDir, 'activity.log'));
  if (raw === null) return [];
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [ts, actor, ...rest] = line.split('\t');
    out.push({ ts, actor, message: rest.join('\t') });
  }
  return out;
}

/** Parse the ledger `## Units` table into [{unit, owner, status, artifact}]. */
export function readLedgerUnits(runDir) {
  const raw = safeRead(path.join(runDir, 'ledger.md'));
  if (raw === null) return [];
  const lines = raw.split('\n');
  const units = [];
  let inUnits = false;
  for (const line of lines) {
    if (/^##\s+Units/i.test(line)) { inUnits = true; continue; }
    if (inUnits && /^##\s+/.test(line)) break; // next section
    if (!inUnits) continue;
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1);
    if (cells.length < 4) continue;
    if (/^-+$/.test(cells[0]) || cells[0].toLowerCase() === 'unit') continue; // header/separator
    units.push({ unit: cells[0], owner: cells[1], status: cells[2], artifact: cells[3] });
  }
  return units;
}

/** Ledger `## Log` lines as ORDINAL-ONLY events (timestamps are zeroed; never real time). */
export function readLedgerLog(runDir) {
  const raw = safeRead(path.join(runDir, 'ledger.md'));
  if (raw === null) return [];
  const out = [];
  let inLog = false;
  let ordinal = 0;
  for (const line of raw.split('\n')) {
    if (/^##\s+Log/i.test(line)) { inLog = true; continue; }
    if (inLog && /^##\s+/.test(line)) break;
    if (!inLog) continue;
    const m = line.match(/^-\s+\S+\s+(.*)$/);
    if (m) out.push({ ordinal: ordinal++, text: m[1] });
  }
  return out;
}

/** The progress/<agent>.md roster (filenames → agent labels). */
export function readProgressRoster(runDir) {
  const dir = path.join(runDir, 'progress');
  if (!safeIsDir(dir)) return [];
  return safeReadDirNames(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => n.slice(0, -'.md'.length))
    .sort();
}

/** Detect layout: 'nested' if a review/round-N/ subtree exists, else 'flat' (P12). */
export function detectLayout(runDir) {
  const reviewDir = path.join(runDir, 'review');
  if (!safeIsDir(reviewDir)) return 'flat';
  const rounds = safeReadDirNames(reviewDir).filter((n) => /^round-\d+$/.test(n));
  return rounds.length > 0 ? 'nested' : 'flat';
}

/** Review round dirs present (nested layout), e.g. ['round-1','round-2']. */
export function readReviewRounds(runDir) {
  const reviewDir = path.join(runDir, 'review');
  if (!safeIsDir(reviewDir)) return [];
  return safeReadDirNames(reviewDir).filter((n) => /^round-\d+$/.test(n)).sort();
}

/**
 * Build the durable-only ROSTER (R9 fallback): a flat, unit-grouped roster from the progress
 * filenames + ledger Units + review rounds, with concurrent same-role instances COLLAPSED to one
 * labeled node + count (e.g. `bn-finding-owner ×3`), an explicitly-recorded fidelity loss (P5/P8).
 * @returns {{
 *   layout, degraded: true, roster: Array<{role, count, instances: string[]}>,
 *   units, reviewRounds, fidelityLoss: boolean
 * }}
 */
export function buildDurableRoster(runDir) {
  const layout = detectLayout(runDir);
  const progress = readProgressRoster(runDir);
  const units = readLedgerUnits(runDir);
  const reviewRounds = readReviewRounds(runDir);

  // Collapse `bn-foo-1`, `bn-foo-2`, ... and `bn-foo` to one role node with a count.
  const groups = new Map();
  for (const name of progress) {
    // Strip a trailing instance discriminator: -<digits> or -u<digits> etc.
    const role = name.replace(/-(?:u?\d+)$/i, '');
    let g = groups.get(role);
    if (!g) { g = { role, count: 0, instances: [] }; groups.set(role, g); }
    g.count++;
    g.instances.push(name);
  }
  const roster = [...groups.values()].sort((a, b) => a.role.localeCompare(b.role));
  const fidelityLoss = roster.some((r) => r.count > 1);
  return { layout, degraded: true, roster, units, reviewRounds, fidelityLoss };
}
