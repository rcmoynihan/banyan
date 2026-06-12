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
