#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { resolveResumeMode, CHECKPOINT_MODE } from './resolve-resume-mode.mjs';

const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BANYAN_DIR_NAME = '.banyan';
const RUNS_DIR_NAME = 'runs';
const RUN_PATH_RE = /\.banyan[/\\]runs[/\\](\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*)/g;
const SUBDIRS = [
  'progress',
  'findings',
  'briefs',
  'lessons-staging',
  // Consult-loop artifact families (U6/R23): every run houses its asks, answers,
  // continuation chains, and abort records from scaffold time so no consult
  // artifact is ever un-housed (un-auditable). `consults/metrics` is added by the
  // deferred U13, not here.
  'consults/asks',
  'consults/answers',
  'consults/chains',
  'consults/aborts',
];
const DOCUMENTED_COMMANDS = [
  'poetry run pytest',
  'uv run pytest',
  'python -m pytest',
  'npm run test',
  'npm test',
  'pnpm run test',
  'pnpm test',
  'yarn test',
  'bun test',
  'node --test',
  'pytest',
  'cargo test',
  'go test ./...',
  'make test',
];

function fail(message) {
  process.stderr.write(`new-run: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = {
    actor: 'trunk',
    date: null,
    facts: [],
    force: false,
    inputs: [],
    locate: null,
    objective: null,
    planRef: null,
    root: process.cwd(),
    runId: null,
    slug: null,
    units: [],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--actor') {
      opts.actor = readValue(argv, (i += 1), '--actor');
    } else if (arg === '--date') {
      opts.date = readValue(argv, (i += 1), '--date');
    } else if (arg === '--fact') {
      opts.facts.push(readValue(argv, (i += 1), '--fact'));
    } else if (arg === '--force') {
      opts.force = true;
    } else if (arg === '--input') {
      opts.inputs.push(readValue(argv, (i += 1), '--input'));
    } else if (arg === '--json') {
      continue;
    } else if (arg === '--locate') {
      opts.locate = readValue(argv, (i += 1), '--locate');
    } else if (arg === '--objective') {
      opts.objective = readValue(argv, (i += 1), '--objective');
    } else if (arg === '--plan-ref') {
      opts.planRef = readValue(argv, (i += 1), '--plan-ref');
    } else if (arg === '--root') {
      opts.root = readValue(argv, (i += 1), '--root');
    } else if (arg === '--run-id') {
      opts.runId = readValue(argv, (i += 1), '--run-id');
    } else if (arg === '--unit') {
      opts.units.push(parseUnit(readValue(argv, (i += 1), '--unit')));
    } else if (arg.startsWith('--')) {
      fail(`unknown flag: ${arg}`);
    } else if (opts.slug === null) {
      opts.slug = arg;
    } else {
      fail(`unexpected positional argument: ${arg}`);
    }
  }

  return opts;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

function parseUnit(raw) {
  const parts = raw.split('|');
  if (parts.length !== 4) {
    fail(`--unit must be "unit|owner|status|artifact", got: ${raw}`);
  }
  const [unit, owner, status, artifact] = parts.map((part) => part.trim());
  if (!unit || !owner || !status || !artifact) {
    fail(`--unit fields must be non-empty, got: ${raw}`);
  }
  const allowed = ['pending', 'in-progress', 'blocked', 'done', 'abandoned'];
  if (!allowed.includes(status)) {
    fail(`--unit status must be one of ${allowed.join(' | ')}, got: ${status}`);
  }
  return { unit, owner, status, artifact };
}

function todayISO() {
  const date = new Date();
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function validateDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    fail(`--date must be YYYY-MM-DD, got: ${date}`);
  }
  return date;
}

function validateSlug(slug) {
  if (!slug) {
    fail('missing required <slug> argument for fresh run scaffolding');
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    fail(`slug must be kebab-case (lowercase, digits, single hyphens), got: ${slug}`);
  }
  return slug;
}

function validateRunId(runId) {
  if (!RUN_ID_RE.test(runId)) {
    fail(`invalid run id: ${runId}`);
  }
  return runId;
}

function resolveRepoRoot(root) {
  const candidate = path.resolve(root);
  try {
    return execFileSync('git', ['-C', candidate, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return candidate;
  }
}

function runDirFor(root, runId) {
  return path.join(root, BANYAN_DIR_NAME, RUNS_DIR_NAME, runId);
}

function runExists(root, runId) {
  return fs.existsSync(path.join(runDirFor(root, runId), 'ledger.md'));
}

function resolveRun(root, opts) {
  if (opts.runId !== null) {
    const runId = validateRunId(opts.runId);
    if (!runExists(root, runId)) {
      fail(`--run-id does not name a live run under ${path.join(root, BANYAN_DIR_NAME, RUNS_DIR_NAME)}: ${runId}`);
    }
    return { kind: 'adopted', reason: 'explicit-run-id', runId };
  }

  const inputRuns = uniqueRuns(
    opts.inputs
      .map((input) => runIdFromPath(root, input))
      .filter((runId) => runId !== null && runExists(root, runId)),
  );
  if (inputRuns.length === 1) {
    return { kind: 'adopted', reason: 'input-under-run', runId: inputRuns[0] };
  }
  if (inputRuns.length > 1) {
    return { kind: 'fresh', reason: 'ambiguous-input-run' };
  }

  const mentionedRuns = uniqueRuns(
    opts.inputs.flatMap((input) => mentionedLiveRuns(root, input)),
  );
  if (mentionedRuns.length === 1) {
    return { kind: 'adopted', reason: 'input-mentioned-run', runId: mentionedRuns[0] };
  }
  if (mentionedRuns.length > 1) {
    return { kind: 'fresh', reason: 'ambiguous-mentioned-run' };
  }

  return { kind: 'fresh', reason: 'no-live-run' };
}

function runIdFromPath(root, input) {
  const absolute = path.resolve(root, input);
  const relative = path.relative(root, absolute);
  const parts = relative.split(path.sep);
  if (parts.length >= 3 && parts[0] === BANYAN_DIR_NAME && parts[1] === RUNS_DIR_NAME) {
    return RUN_ID_RE.test(parts[2]) ? parts[2] : null;
  }
  return null;
}

function mentionedLiveRuns(root, input) {
  const absolute = path.resolve(root, input);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    return [];
  }
  const content = fs.readFileSync(absolute, 'utf8');
  const runs = [];
  let match;
  RUN_PATH_RE.lastIndex = 0;
  while ((match = RUN_PATH_RE.exec(content)) !== null) {
    const runId = match[1];
    if (runExists(root, runId)) {
      runs.push(runId);
    }
  }
  return runs;
}

function uniqueRuns(runs) {
  return [...new Set(runs)];
}

function scanRuns(runsDir, date, slug) {
  let max = 0;
  let existing = null;
  let existingSeq = -1;
  let entries = [];

  try {
    entries = fs.readdirSync(runsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { existing: null, nextSeq: '001' };
    }
    throw error;
  }

  const seqRe = new RegExp(`^${date}-(\\d{3})-`);
  const exactRe = new RegExp(`^${date}-(\\d{3})-${slug}$`);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const seqMatch = entry.name.match(seqRe);
    if (seqMatch) {
      max = Math.max(max, Number.parseInt(seqMatch[1], 10));
    }
    const exactMatch = entry.name.match(exactRe);
    if (exactMatch) {
      const seq = Number.parseInt(exactMatch[1], 10);
      if (seq > existingSeq) {
        existingSeq = seq;
        existing = entry.name;
      }
    }
  }

  return { existing, nextSeq: String(max + 1).padStart(3, '0') };
}

function detectRepoFacts(root) {
  const documented = detectDocumentedTestCommand(root);
  const manifest = documented ?? detectManifestTestCommand(root);
  return {
    repo_root: root,
    test_command: manifest?.command ?? 'none detected',
    test_source: manifest?.source ?? 'none detected',
  };
}

// Resolve the run's locked resume mode (R19/R20/R28) from U1's locate probe.
//
// `--locate` carries the JSON locate result ({located, path, complete, reason})
// from the U1 doctor probe. When the flag is absent (no probe was run), or its
// value is not valid JSON, the resolver falls back to checkpoint mode — the safe
// degrade. The returned { mode, sessionPath } is seeded into ledger.md's
// `## Facts / Context` so every continuation reads the lock from the ledger
// rather than re-probing (files-only reconstruction surviving a resumed trunk).
function resolveResumeFacts(locateRaw) {
  let locateResult = null;
  if (typeof locateRaw === 'string' && locateRaw.trim() !== '') {
    try {
      locateResult = JSON.parse(locateRaw);
    } catch {
      // Unparseable probe input is treated as "no usable probe" -> checkpoint.
      // We do not fail the scaffold on a malformed probe; degrade-not-break.
      locateResult = null;
    }
  }
  const resolved = resolveResumeMode(locateResult);
  return {
    resume_mode: resolved.mode ?? CHECKPOINT_MODE,
    session_path: resolved.sessionPath ?? 'none (checkpoint mode)',
    resume_reason: resolved.reason,
  };
}

function detectDocumentedTestCommand(root) {
  const files = ['AGENTS.md', 'CLAUDE.md', 'README.md', path.join('scripts', 'README.md')];
  for (const file of files) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) {
      continue;
    }
    const content = fs.readFileSync(absolute, 'utf8');
    for (const command of DOCUMENTED_COMMANDS) {
      if (containsCommand(content, command)) {
        return { command, source: file };
      }
    }
  }
  return null;
}

function containsCommand(content, command) {
  const escaped = escapeRegExp(command);
  const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escaped}($|[^A-Za-z0-9_-])`);
  return pattern.test(content);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectManifestTestCommand(root) {
  const packageJson = path.join(root, 'package.json');
  if (fs.existsSync(packageJson)) {
    const command = detectPackageTestCommand(packageJson);
    if (command !== null) {
      return command;
    }
  }
  if (hasNodeTests(root)) {
    return { command: 'node --test', source: 'test files' };
  }
  if (hasPythonTests(root)) {
    return { command: 'pytest', source: 'pytest files' };
  }
  if (fs.existsSync(path.join(root, 'Cargo.toml'))) {
    return { command: 'cargo test', source: 'Cargo.toml' };
  }
  if (fs.existsSync(path.join(root, 'go.mod'))) {
    return { command: 'go test ./...', source: 'go.mod' };
  }
  return null;
}

function detectPackageTestCommand(packageJson) {
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    const testScript = parsed.scripts?.test;
    if (typeof testScript !== 'string' || isDefaultNpmTestScript(testScript)) {
      return null;
    }
    const packageManager = typeof parsed.packageManager === 'string' ? parsed.packageManager : '';
    if (packageManager.startsWith('pnpm@')) {
      return { command: 'pnpm test', source: 'package.json scripts.test' };
    }
    if (packageManager.startsWith('yarn@')) {
      return { command: 'yarn test', source: 'package.json scripts.test' };
    }
    if (packageManager.startsWith('bun@')) {
      return { command: 'bun test', source: 'package.json scripts.test' };
    }
    return { command: 'npm test', source: 'package.json scripts.test' };
  } catch {
    return null;
  }
}

function isDefaultNpmTestScript(script) {
  return /no test specified/i.test(script) && /exit 1/.test(script);
}

function hasNodeTests(root) {
  return hasMatchingFile(root, (file) => /\.(test|spec)\.(js|mjs|cjs)$/.test(file));
}

function hasPythonTests(root) {
  return (
    fs.existsSync(path.join(root, 'pytest.ini')) ||
    fs.existsSync(path.join(root, 'tox.ini')) ||
    fs.existsSync(path.join(root, 'pyproject.toml')) ||
    hasFileWithExtension(path.join(root, 'tests'), ['.py']) ||
    hasFileWithExtension(path.join(root, 'test'), ['.py'])
  );
}

function hasMatchingFile(dir, predicate) {
  if (!fs.existsSync(dir)) {
    return false;
  }
  const ignored = new Set(['.git', 'node_modules', 'tmp', 'vendor']);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some((entry) => {
    if (ignored.has(entry.name)) {
      return false;
    }
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return hasMatchingFile(absolute, predicate);
    }
    return entry.isFile() && predicate(entry.name);
  });
}

function hasFileWithExtension(dir, extensions) {
  if (!fs.existsSync(dir)) {
    return false;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.some((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return hasFileWithExtension(absolute, extensions);
    }
    return entry.isFile() && extensions.includes(path.extname(entry.name));
  });
}

function scaffoldRun(root, opts, date, facts, reason) {
  const slug = validateSlug(opts.slug);
  const runsDir = path.join(root, BANYAN_DIR_NAME, RUNS_DIR_NAME);
  const { existing, nextSeq } = scanRuns(runsDir, date, slug);
  const runId = opts.force && existing ? existing : `${date}-${nextSeq}-${slug}`;
  const runDir = runDirFor(root, runId);

  if (fs.existsSync(runDir)) {
    if (!opts.force) {
      fail(`run dir already exists: ${runDir} (use --force to overwrite)`);
    }
    fs.rmSync(runDir, { recursive: true, force: true });
  }

  ensureRunDirs(runDir);
  fs.writeFileSync(path.join(runDir, 'ledger.md'), ledgerTemplate(runId, date, opts, facts));
  return { created: true, reason, runDir, runId };
}

function adoptRun(root, runId, reason) {
  const runDir = runDirFor(root, runId);
  ensureRunDirs(runDir);
  return { created: false, reason, runDir, runId };
}

function ensureRunDirs(runDir) {
  fs.mkdirSync(runDir, { recursive: true });
  for (const subdir of SUBDIRS) {
    fs.mkdirSync(path.join(runDir, subdir), { recursive: true });
  }
}

function ledgerTemplate(runId, date, opts, facts) {
  const objective =
    renderRunId(
      opts.objective ?? '<one paragraph: what this run is trying to achieve and the done condition>',
      runId,
    );
  const planRef =
    renderRunId(
      opts.planRef ??
        '<.banyan/plans/...-plan.md, "none -- direct work spec .banyan/runs/<run-id>/briefs/direct-work-plan.md", or "none -- ad hoc run">',
      runId,
    );
  const factLines = [
    `- Repo root: ${facts.repo_root}`,
    `- Test command: ${facts.test_command} (source: ${facts.test_source})`,
    // Resume mode is locked once here, at run open (R19), from U1's locate probe.
    // It defaults to `checkpoint` (the safe degrade) when no probe was supplied.
    // Continuations read these two facts from the ledger instead of re-probing
    // (R20/R28, files-only reconstruction). See references/resume-protocol.md.
    `- Resume mode: ${facts.resume_mode} (reason: ${facts.resume_reason})`,
    `- Session path: ${facts.session_path}`,
    ...opts.facts.map((fact) => `- ${renderRunId(fact, runId)}`),
  ];
  const units = opts.units.length > 0 ? opts.units : [{ unit: 'U1', owner: opts.actor, status: 'pending', artifact: '<path>' }];
  const unitLines = units.map(
    (unit) =>
      `| ${pad(unit.unit, 4)} | ${pad(unit.owner, 12)} | ${pad(unit.status, 7)} | ${renderRunId(
        unit.artifact,
        runId,
      )} |`,
  );

  return `# Run ${runId}

## Objective

${objective}

## Plan

Plan ref: ${planRef}

## Facts / Context

${factLines.join('\n')}

## Units

| unit | owner (lead) | status  | artifact |
|------|--------------|---------|----------|
${unitLines.join('\n')}

Statuses: pending | in-progress | blocked | done | abandoned

## Log

- ${date}T00:00:00Z ${opts.actor}: run scaffolded

## Open questions

- <unresolved question that blocks or risks the run; remove when answered>
`;
}

function renderRunId(value, runId) {
  return value.replaceAll('<run-id>', runId);
}

function ensureBanyanExcluded(root) {
  let excludePath;
  try {
    excludePath = execFileSync('git', ['-C', root, 'rev-parse', '--git-path', 'info/exclude'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return;
  }
  const absoluteExclude = path.isAbsolute(excludePath) ? excludePath : path.join(root, excludePath);
  fs.mkdirSync(path.dirname(absoluteExclude), { recursive: true });
  const existing = fs.existsSync(absoluteExclude) ? fs.readFileSync(absoluteExclude, 'utf8') : '';
  if (/^\/?\.banyan\/$/m.test(existing)) {
    return;
  }
  const prefix = existing.endsWith('\n') || existing.length === 0 ? '' : '\n';
  fs.appendFileSync(absoluteExclude, `${prefix}# Banyan local state\n/.banyan/\n`);
}

function pad(value, width) {
  return value.padEnd(width, ' ');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = resolveRepoRoot(opts.root);
  ensureBanyanExcluded(root);
  const date = validateDate(opts.date ?? todayISO());
  const facts = { ...detectRepoFacts(root), ...resolveResumeFacts(opts.locate) };
  const resolution = resolveRun(root, opts);
  const run =
    resolution.kind === 'adopted'
      ? adoptRun(root, resolution.runId, resolution.reason)
      : scaffoldRun(root, opts, date, facts, resolution.reason);

  process.stdout.write(
    `${JSON.stringify(
      {
        created: run.created,
        facts,
        ledger_path: path.join(run.runDir, 'ledger.md'),
        reason: run.reason,
        run_dir: run.runDir,
        run_id: run.runId,
      },
      null,
      2,
    )}\n`,
  );
}

main();
