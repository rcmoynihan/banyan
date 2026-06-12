#!/usr/bin/env node
// new-run.mjs -- scaffold a Banyan run ledger under <root>/docs/runs/.
//
// Usage:
//   node new-run.mjs <slug> [--root <repo-root>] [--date YYYY-MM-DD] [--force]
//
// Creates docs/runs/<date>-<NNN>-<slug>/ with a seeded ledger.md and the
// progress/, findings/, briefs/, lessons-staging/ subdirs.
// NNN is the next zero-padded per-day sequence (scans existing dirs; starts 001).
// Refuses to overwrite an existing run dir unless --force is given.
//
// Zero dependencies: node:fs, node:path, node:process only.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(msg) {
  process.stderr.write(`new-run: ${msg}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { slug: null, root: process.cwd(), date: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--force') {
      opts.force = true;
    } else if (a === '--root') {
      opts.root = argv[++i];
      if (opts.root === undefined) fail('--root requires a value');
    } else if (a === '--date') {
      opts.date = argv[++i];
      if (opts.date === undefined) fail('--date requires a value');
    } else if (a.startsWith('--')) {
      fail(`unknown flag: ${a}`);
    } else if (opts.slug === null) {
      opts.slug = a;
    } else {
      fail(`unexpected positional argument: ${a}`);
    }
  }
  return opts;
}

function todayISO() {
  // A default-only use of new Date(); tests pass an explicit --date.
  const d = new Date();
  const yyyy = String(d.getFullYear()).padStart(4, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail(`--date must be YYYY-MM-DD, got: ${date}`);
  }
  return date;
}

function validateSlug(slug) {
  if (!slug) fail('missing required <slug> argument');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(`slug must be kebab-case (lowercase, digits, single hyphens), got: ${slug}`);
  }
  return slug;
}

// Scan <runsDir> for `${date}-NNN-...` and report:
//   nextSeq  -- next zero-padded sequence for `date` (max matching NNN + 1).
//   existing -- the most recent existing run id for this exact date+slug, or null.
// `existing` lets --force re-use/overwrite a same-slug run instead of accumulating
// a fresh sequence on every invocation.
function scanRuns(runsDir, date, slug) {
  let max = 0;
  let existing = null;
  let existingSeq = -1;
  let entries = [];
  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { nextSeq: '001', existing: null };
    throw err;
  }
  const seqRe = new RegExp(`^${date}-(\\d{3})-`);
  const exactRe = new RegExp(`^${date}-(\\d{3})-${slug}$`);
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const m = ent.name.match(seqRe);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
    const e = ent.name.match(exactRe);
    if (e) {
      const n = parseInt(e[1], 10);
      if (n > existingSeq) {
        existingSeq = n;
        existing = ent.name;
      }
    }
  }
  return { nextSeq: String(max + 1).padStart(3, '0'), existing };
}

function ledgerTemplate(runId, date) {
  return `# Run ${runId}

## Objective

<one paragraph: what this run is trying to achieve and the done condition>

## Plan

Plan ref: <docs/plans/...-plan.md, "none -- direct work spec docs/runs/<run-id>/briefs/direct-work-plan.md", or "none -- ad hoc run">

## Facts / Context

- <durable fact discovered or supplied: a path, a constraint, a decision>

## Units

| unit | owner (lead) | status  | artifact |
|------|--------------|---------|----------|
| U1   | trunk        | pending | <path>   |

Statuses: pending | in-progress | blocked | done | abandoned

## Log

- ${date}T00:00:00Z trunk: run scaffolded

## Open questions

- <unresolved question that blocks or risks the run; remove when answered>
`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const slug = validateSlug(opts.slug);
  const date = validateDate(opts.date ?? todayISO());

  const root = path.resolve(opts.root);
  const runsDir = path.join(root, 'docs', 'runs');
  const { nextSeq, existing } = scanRuns(runsDir, date, slug);

  // Default: mint a fresh run id (next sequence). Re-running with the same args
  // bumps -001- -> -002-, so each invocation is a distinct run.
  // --force: re-use/overwrite the most recent existing run for this date+slug
  // instead of accumulating a new sequence -- re-scaffold a run in place.
  let runId;
  if (opts.force && existing) {
    runId = existing;
  } else {
    runId = `${date}-${nextSeq}-${slug}`;
  }
  const runDir = path.join(runsDir, runId);

  if (fs.existsSync(runDir)) {
    if (!opts.force) {
      // Reachable only if a dir was created at the computed slot after the scan
      // (race / stray dir). Refuse rather than clobber.
      fail(`run dir already exists: ${runDir} (use --force to overwrite)`);
    }
    fs.rmSync(runDir, { recursive: true, force: true });
  }

  const subdirs = ['progress', 'findings', 'briefs', 'lessons-staging'];
  fs.mkdirSync(runDir, { recursive: true });
  for (const sub of subdirs) {
    const d = path.join(runDir, sub);
    fs.mkdirSync(d, { recursive: true });
  }
  fs.writeFileSync(path.join(runDir, 'ledger.md'), ledgerTemplate(runId, date));

  process.stdout.write(`${runId}\n${runDir}\n`);
}

main();
