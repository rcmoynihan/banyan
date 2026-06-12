import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'check-boundary.mjs');

function git(repo, args) {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function writeFile(repo, relativePath, content) {
  const target = path.join(repo, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function createRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-boundary-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Boundary Test']);

  writeFile(root, 'src/a.js', 'export const a = 1;\n');
  writeFile(root, 'docs/keep.md', '# Keep\n');
  writeFile(root, 'src-other/x.js', 'export const x = 1;\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'base']);
  const base = git(root, ['rev-parse', 'HEAD']);

  git(root, ['checkout', '-qb', 'feature']);
  writeFile(root, 'src/a.js', 'export const a = 2;\n');
  writeFile(root, 'src/wishlist.js', 'export const wishlist = [];\n');
  writeFile(root, '.banyan/runs/r1/progress/u1.md', 'progress\n');
  writeFile(root, 'src/outside.js', 'export const outside = true;\n');
  writeFile(root, 'src-other/x.js', 'export const x = 2;\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'feature']);
  const head = git(root, ['rev-parse', 'HEAD']);

  return { root, base, head };
}

function useRepo(t) {
  const fixture = createRepo();
  t.after(() => {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });
  return fixture;
}

function createDependentUnitRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-boundary-dependent-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Boundary Test']);

  writeFile(root, 'README.md', '# Fixture\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'base']);

  git(root, ['checkout', '-qb', 'dependency']);
  writeFile(root, 'dependency/change.js', 'export const dependency = true;\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'dependency']);
  const dependencyHead = git(root, ['rev-parse', 'HEAD']);

  git(root, ['checkout', '-qb', 'unit']);
  writeFile(root, 'unit/change.js', 'export const unit = true;\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'unit']);
  const unitHead = git(root, ['rev-parse', 'HEAD']);

  return { root, dependencyHead, unitHead };
}

function useDependentUnitRepo(t) {
  const fixture = createDependentUnitRepo();
  t.after(() => {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });
  return fixture;
}

function runBoundary(args, cwd = process.cwd()) {
  return spawnSync(process.execPath, [SCRIPT_PATH, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

test('returns zero when all changed files are in boundary', (t) => {
  const fixture = useRepo(t);
  const result = runBoundary(
    [
      '--base',
      fixture.base,
      '--head',
      fixture.head,
      '--allow',
      'src/**,.banyan/runs/**,src-other/x.js',
    ],
    fixture.root,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^IN   src\/a\.js$/m);
  assert.match(result.stdout, /^IN   \.banyan\/runs\/r1\/progress\/u1\.md$/m);
  assert.match(result.stdout, /^boundary: 5 in, 0 out$/m);
});

test('returns one and reports out-of-boundary files', (t) => {
  const fixture = useRepo(t);
  const result = runBoundary(
    [
      '--base',
      fixture.base,
      '--allow',
      'src/a.js,src/wishlist.js,.banyan/runs/**,src-other/x.js',
    ],
    fixture.root,
  );

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /^OUT  src\/outside\.js$/m);
  assert.match(result.stdout, /^boundary: 4 in, 1 out$/m);
});

test('matches dir globs without matching sibling prefixes', (t) => {
  const fixture = useRepo(t);
  const result = runBoundary(
    ['--base', fixture.base, '--allow', 'src/**,.banyan/runs/**'],
    fixture.root,
  );

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /^OUT  src-other\/x\.js$/m);
  assert.doesNotMatch(result.stdout, /^IN   src-other\/x\.js$/m);
  assert.match(result.stdout, /^boundary: 4 in, 1 out$/m);
});

test('includes working tree, index, and untracked files when head is current HEAD', (t) => {
  const fixture = useRepo(t);
  writeFile(fixture.root, 'docs/keep.md', '# Keep updated\n');
  writeFile(fixture.root, 'docs/queue/staged.md', 'staged\n');
  git(fixture.root, ['add', 'docs/queue/staged.md']);
  writeFile(fixture.root, 'tmp/outside.txt', 'untracked\n');
  const result = runBoundary(
    [
      '--base',
      fixture.base,
      '--head',
      'HEAD',
      '--allow',
      'src/**,.banyan/runs/**,src-other/x.js',
    ],
    fixture.root,
  );

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /^IN   src\/a\.js$/m);
  assert.match(result.stdout, /^OUT  docs\/keep\.md$/m);
  assert.match(result.stdout, /^OUT  docs\/queue\/staged\.md$/m);
  assert.match(result.stdout, /^OUT  tmp\/outside\.txt$/m);
  assert.match(result.stdout, /^boundary: 5 in, 3 out$/m);
});

test('uses the supplied base ref for dependent unit branches', (t) => {
  const fixture = useDependentUnitRepo(t);
  const result = runBoundary(
    ['--base', fixture.dependencyHead, '--head', fixture.unitHead, '--allow', 'unit/**'],
    fixture.root,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^IN   unit\/change\.js$/m);
  assert.doesNotMatch(result.stdout, /dependency\/change\.js/);
  assert.match(result.stdout, /^boundary: 1 in, 0 out$/m);
});

test('loads allow entries from a file with comments and blank lines', (t) => {
  const fixture = useRepo(t);
  const allowDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-boundary-allow-'));
  t.after(() => {
    fs.rmSync(allowDir, { recursive: true, force: true });
  });
  writeFile(
    allowDir,
    'allow.txt',
    [
      '# unit boundary',
      '',
      'src/a.js',
      'src/wishlist.js',
      '.banyan/runs/**',
      'src/outside.js',
      'src-other/x.js',
      '',
    ].join('\n'),
  );
  const result = runBoundary(
    ['--base', fixture.base, '--allow', `@${path.join(allowDir, 'allow.txt')}`],
    fixture.root,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^boundary: 5 in, 0 out$/m);
});

test('returns two for usage errors', () => {
  const result = runBoundary(['--allow', 'src/**']);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /missing required --base/);
});

test('returns two for git errors', (t) => {
  const fixture = useRepo(t);
  const result = runBoundary(['--base', 'no-such-ref', '--allow', 'src/**'], fixture.root);

  assert.equal(result.status, 2);
  assert.match(result.stderr, /git diff failed/);
});

test('runs git from --cwd when invoked elsewhere', (t) => {
  const fixture = useRepo(t);
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-boundary-cwd-'));
  t.after(() => {
    fs.rmSync(elsewhere, { recursive: true, force: true });
  });
  const result = runBoundary(
    [
      '--base',
      fixture.base,
      '--cwd',
      fixture.root,
      '--allow',
      'src/**,.banyan/runs/**,src-other/x.js',
    ],
    elsewhere,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^boundary: 5 in, 0 out$/m);
});
