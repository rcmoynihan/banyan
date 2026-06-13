import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'new-run.mjs');

function createRepo(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-new-run-')));
  const git = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function writeFile(root, relativePath, content) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function runNewRun(args, root) {
  const result = spawnSync(process.execPath, [SCRIPT_PATH, ...args, '--root', root], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('scaffolds a fresh run with seeded facts and unit rows', (t) => {
  const root = createRepo(t);
  writeFile(root, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));

  const result = runNewRun(
    [
      'plan-add-widget',
      '--date',
      '2026-06-12',
      '--objective',
      'Plan the widget feature.',
      '--plan-ref',
      '.banyan/plans/2026-06-12-001-feat-widget-plan.md',
      '--fact',
      'Input: docs/brief.md',
      '--unit',
      'plan|bn-plan-lead|in-progress|.banyan/plans/2026-06-12-001-feat-widget-plan.md',
    ],
    root,
  );

  assert.equal(result.created, true);
  assert.equal(result.reason, 'no-live-run');
  assert.equal(result.run_id, '2026-06-12-001-plan-add-widget');
  assert.equal(result.facts.test_command, 'npm test');
  assert.equal(result.facts.test_source, 'package.json scripts.test');

  const ledger = fs.readFileSync(result.ledger_path, 'utf8');
  assert.match(ledger, /Plan the widget feature\./);
  assert.match(ledger, /Plan ref: \.banyan\/plans\/2026-06-12-001-feat-widget-plan\.md/);
  assert.match(ledger, /- Test command: npm test \(source: package\.json scripts\.test\)/);
  assert.match(ledger, /\| plan\s+\| bn-plan-lead\s+\| in-progress\s+\| \.banyan\/plans\/2026-06-12-001-feat-widget-plan\.md \|/);
  assert.equal(path.relative(root, result.run_dir), '.banyan/runs/2026-06-12-001-plan-add-widget');
  assert.match(fs.readFileSync(path.join(root, '.git/info/exclude'), 'utf8'), /^\/\.banyan\/$/m);
});

test('creates the consult artifact subdirs at scaffold time (U6/R23)', (t) => {
  const root = createRepo(t);

  const result = runNewRun(['plan-add-widget', '--date', '2026-06-12'], root);

  for (const sub of [
    'consults/asks',
    'consults/answers',
    'consults/chains',
    'consults/aborts',
    // consults/metrics is added by U13 (R29 metric roll-up).
    'consults/metrics',
  ]) {
    const dir = path.join(result.run_dir, sub);
    assert.ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), `missing consult subdir: ${sub}`);
  }

  // The pre-existing subdirs are still created alongside the new ones.
  for (const sub of ['progress', 'findings', 'briefs', 'lessons-staging']) {
    assert.ok(fs.existsSync(path.join(result.run_dir, sub)), `missing pre-existing subdir: ${sub}`);
  }
});

test('rejects a --unit with an invalid status', (t) => {
  const root = createRepo(t);
  const result = spawnSync(
    process.execPath,
    [
      SCRIPT_PATH,
      'plan-add-widget',
      '--date',
      '2026-06-12',
      '--unit',
      'plan|bn-plan-lead|inprogress|.banyan/plans/x.md',
      '--root',
      root,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--unit status must be one of/);
});

test('prefers documented test commands over package scripts', (t) => {
  const root = createRepo(t);
  writeFile(root, 'README.md', 'Run `pnpm test` before shipping.\n');
  writeFile(root, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));

  const result = runNewRun(['review-widget', '--date', '2026-06-12'], root);

  assert.equal(result.facts.test_command, 'pnpm test');
  assert.equal(result.facts.test_source, 'README.md');
});

test('ignores non-test mypy examples and detects node tests without package json', (t) => {
  const root = createRepo(t);
  writeFile(
    root,
    'AGENTS.md',
    [
      '# Instructions',
      '',
      'Example only:',
      '',
      '```bash',
      'cd /other/repo && poetry run pre-commit run mypy --hook-stage pre-push --files',
      '```',
      '',
    ].join('\n'),
  );
  writeFile(root, 'plugin/skills/example.test.mjs', "import test from 'node:test';\n");

  const result = runNewRun(['review-widget', '--date', '2026-06-12'], root);

  assert.equal(result.facts.test_command, 'node --test');
  assert.equal(result.facts.test_source, 'test files');
});

test('adopts a live run from an input path under .banyan/runs', (t) => {
  const root = createRepo(t);
  const first = runNewRun(['grow-widget', '--date', '2026-06-12'], root);
  writeFile(root, `${path.relative(root, first.run_dir)}/briefs/research-brief.md`, '# Brief\n');

  const adopted = runNewRun(
    ['plan-widget', '--date', '2026-06-12', '--input', '.banyan/runs/2026-06-12-001-grow-widget/briefs/research-brief.md'],
    root,
  );

  assert.equal(adopted.created, false);
  assert.equal(adopted.reason, 'input-under-run');
  assert.equal(adopted.run_id, first.run_id);
});

test('does not adopt stale runs under docs/runs', (t) => {
  const root = createRepo(t);
  writeFile(root, 'docs/runs/2026-06-12-001-old-widget/ledger.md', '# Old run\n');

  const result = runNewRun(
    ['plan-widget', '--date', '2026-06-12', '--input', 'docs/runs/2026-06-12-001-old-widget/briefs/research-brief.md'],
    root,
  );

  assert.equal(result.created, true);
  assert.equal(result.reason, 'no-live-run');
  assert.equal(result.run_id, '2026-06-12-001-plan-widget');
});

test('adopts the single live run mentioned by a durable artifact', (t) => {
  const root = createRepo(t);
  const first = runNewRun(['plan-widget', '--date', '2026-06-12'], root);
  writeFile(
    root,
    '.banyan/plans/2026-06-12-001-feat-widget-plan.md',
    `# Plan\n\nSource: .banyan/runs/${first.run_id}/briefs/research-brief.md\n`,
  );

  const adopted = runNewRun(
    ['work-widget', '--date', '2026-06-12', '--input', '.banyan/plans/2026-06-12-001-feat-widget-plan.md'],
    root,
  );

  assert.equal(adopted.created, false);
  assert.equal(adopted.reason, 'input-mentioned-run');
  assert.equal(adopted.run_id, first.run_id);
});

test('scaffolds a fresh run when a durable artifact mentions multiple live runs', (t) => {
  const root = createRepo(t);
  const first = runNewRun(['first-widget', '--date', '2026-06-12'], root);
  const second = runNewRun(['second-widget', '--date', '2026-06-12'], root);
  writeFile(
    root,
    '.banyan/plans/2026-06-12-001-feat-widget-plan.md',
    [
      '# Plan',
      `Source: .banyan/runs/${first.run_id}/briefs/research-brief.md`,
      `Source: .banyan/runs/${second.run_id}/briefs/spec-stress.md`,
      '',
    ].join('\n'),
  );

  const result = runNewRun(
    ['work-widget', '--date', '2026-06-12', '--input', '.banyan/plans/2026-06-12-001-feat-widget-plan.md'],
    root,
  );

  assert.equal(result.created, true);
  assert.equal(result.reason, 'ambiguous-mentioned-run');
  assert.equal(result.run_id, '2026-06-12-003-work-widget');
});

// --- resume-mode lock (U3: R19/R20/R28, AE5) ------------------------------

test('defaults to checkpoint mode with no probe input (safe degrade)', (t) => {
  const root = createRepo(t);

  const result = runNewRun(['plan-add-widget', '--date', '2026-06-12'], root);

  // The JSON output carries the resolved facts.
  assert.equal(result.facts.resume_mode, 'checkpoint');
  assert.equal(result.facts.session_path, 'none (checkpoint mode)');
  assert.equal(result.facts.resume_reason, 'no-probe-result');

  // And the ledger ## Facts / Context is seeded with both lines.
  const ledger = fs.readFileSync(result.ledger_path, 'utf8');
  assert.match(ledger, /- Resume mode: checkpoint \(reason: no-probe-result\)/);
  assert.match(ledger, /- Session path: none \(checkpoint mode\)/);
});

test('locks to transcript mode when --locate reports located+complete', (t) => {
  const root = createRepo(t);
  const locate = JSON.stringify({
    located: true,
    complete: true,
    path: '/home/u/.claude/projects/p/s/subagents/agent-abc.jsonl',
    reason: 'located-and-complete',
  });

  const result = runNewRun(['plan-add-widget', '--date', '2026-06-12', '--locate', locate], root);

  assert.equal(result.facts.resume_mode, 'transcript');
  assert.equal(result.facts.session_path, '/home/u/.claude/projects/p/s/subagents/agent-abc.jsonl');

  const ledger = fs.readFileSync(result.ledger_path, 'utf8');
  assert.match(ledger, /- Resume mode: transcript \(reason: located-and-complete\)/);
  assert.match(
    ledger,
    /- Session path: \/home\/u\/\.claude\/projects\/p\/s\/subagents\/agent-abc\.jsonl/,
  );
});

test('locks to checkpoint mode when --locate reports not-locatable (degrade)', (t) => {
  const root = createRepo(t);
  const locate = JSON.stringify({
    located: false,
    complete: false,
    path: null,
    reason: 'file-not-found',
  });

  const result = runNewRun(['plan-add-widget', '--date', '2026-06-12', '--locate', locate], root);

  assert.equal(result.facts.resume_mode, 'checkpoint');
  assert.equal(result.facts.session_path, 'none (checkpoint mode)');

  const ledger = fs.readFileSync(result.ledger_path, 'utf8');
  assert.match(ledger, /- Resume mode: checkpoint \(reason: file-not-found\)/);
});

test('locked-but-incomplete transcript degrades to checkpoint mode (R20)', (t) => {
  const root = createRepo(t);
  // A located-but-incomplete (growing/truncated) transcript must NOT unlock
  // transcript mode — locate-AND-complete is the gate (R20).
  const locate = JSON.stringify({
    located: true,
    complete: false,
    path: '/x/subagents/agent-abc.jsonl',
    reason: 'actively-growing',
  });

  const result = runNewRun(['plan-add-widget', '--date', '2026-06-12', '--locate', locate], root);

  assert.equal(result.facts.resume_mode, 'checkpoint');
  const ledger = fs.readFileSync(result.ledger_path, 'utf8');
  assert.match(ledger, /- Resume mode: checkpoint \(reason: actively-growing\)/);
});

test('malformed --locate JSON degrades to checkpoint rather than failing', (t) => {
  const root = createRepo(t);

  // A malformed probe payload must not break the scaffold — degrade-not-break.
  const result = runNewRun(['plan-add-widget', '--date', '2026-06-12', '--locate', '{not json'], root);

  assert.equal(result.created, true);
  assert.equal(result.facts.resume_mode, 'checkpoint');
  assert.equal(result.facts.resume_reason, 'no-probe-result');
});

test('adopting a live run leaves its locked resume facts untouched (R19 locked-once)', (t) => {
  const root = createRepo(t);

  // Open a fresh run with no probe -> ledger locks to checkpoint.
  const first = runNewRun(['grow-widget', '--date', '2026-06-12'], root);
  const ledgerBefore = fs.readFileSync(first.ledger_path, 'utf8');
  assert.match(ledgerBefore, /- Resume mode: checkpoint \(reason: no-probe-result\)/);

  // Re-invoke against the SAME run (adoption via an input under it) WITH a
  // transcript-mode probe. The lock was set once at open; adoption must not
  // re-decide it in the durable ledger.
  writeFile(root, `${path.relative(root, first.run_dir)}/briefs/research-brief.md`, '# Brief\n');
  const transcriptLocate = JSON.stringify({
    located: true,
    complete: true,
    path: '/x/a.jsonl',
    reason: 'located-and-complete',
  });
  const adopted = runNewRun(
    [
      'plan-widget',
      '--date',
      '2026-06-12',
      '--input',
      `${path.relative(root, first.run_dir)}/briefs/research-brief.md`,
      '--locate',
      transcriptLocate,
    ],
    root,
  );

  assert.equal(adopted.created, false);
  assert.equal(adopted.run_id, first.run_id);
  // The durable ledger lock is the source of truth and is unchanged.
  const ledgerAfter = fs.readFileSync(first.ledger_path, 'utf8');
  assert.match(ledgerAfter, /- Resume mode: checkpoint \(reason: no-probe-result\)/);
  assert.doesNotMatch(ledgerAfter, /- Resume mode: transcript/);
});

test('resume-mode facts coexist with user --fact lines and test-command fact', (t) => {
  const root = createRepo(t);
  writeFile(root, 'package.json', JSON.stringify({ scripts: { test: 'node --test' } }));

  const result = runNewRun(
    ['plan-add-widget', '--date', '2026-06-12', '--fact', 'Input: docs/brief.md'],
    root,
  );

  const ledger = fs.readFileSync(result.ledger_path, 'utf8');
  // All fact families survive together (no clobbering of the existing seam).
  assert.match(ledger, /- Test command: npm test \(source: package\.json scripts\.test\)/);
  assert.match(ledger, /- Resume mode: checkpoint/);
  assert.match(ledger, /- Session path: none \(checkpoint mode\)/);
  assert.match(ledger, /- Input: docs\/brief\.md/);
});
