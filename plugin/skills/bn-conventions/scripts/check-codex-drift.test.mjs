// Tests for the Codex drift gate. Asserts the gate is green on a clean tree, the
// committed dist/codex/ matches the current render, the manifest is in sync, and
// the gate goes red when a dist/codex/ output is hand-edited, a plugin/ source
// change is not regenerated, or the manifest goes stale.
//
// Zero dependencies: node:* only.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  detectDrift,
  buildManifest,
  formatDrift,
  REMEDIATION,
  MANIFEST_NAME,
} from './check-codex-drift.mjs';
import { render } from '../../../../scripts/codex-build/render-codex.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(SCRIPT_DIR, 'check-codex-drift.mjs');
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'codex-build', 'render-codex.mjs');

// A throwaway repo root that mirrors the real plugin/ source plus a freshly
// rendered dist/codex/ and manifest. Each red-path test mutates its own copy so
// the real tree is never touched.
function freshRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-drift-'));
  fs.cpSync(path.join(REPO_ROOT, 'plugin'), path.join(root, 'plugin'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, 'scripts', 'codex-build'), { recursive: true });
  fs.cpSync(
    path.join(REPO_ROOT, 'scripts', 'codex-build'),
    path.join(root, 'scripts', 'codex-build'),
    { recursive: true },
  );
  execFileSync('node', [GENERATOR, '--root', root], { stdio: 'ignore' });
  execFileSync('node', [SCRIPT_PATH, '--root', root, '--write-manifest'], {
    stdio: 'ignore',
  });
  return root;
}

test('the committed dist/codex/ is in sync with plugin/ (no drift)', () => {
  const drift = detectDrift(REPO_ROOT);
  assert.deepEqual(
    drift,
    [],
    `expected no drift against the committed tree, got:\n${formatDrift(drift)}`,
  );
});

test('the committed manifest matches the current render', () => {
  const fresh = `${JSON.stringify(buildManifest(render(REPO_ROOT)), null, 2)}\n`;
  const onDisk = fs.readFileSync(
    path.join(REPO_ROOT, 'dist', 'codex', MANIFEST_NAME),
    'utf8',
  );
  assert.equal(onDisk, fresh, 'committed .build-manifest.json is stale');
});

test('the CLI exits 0 and reports in-sync on a clean tree', () => {
  const root = freshRoot();
  try {
    const out = execFileSync('node', [SCRIPT_PATH, '--root', root], {
      encoding: 'utf8',
    });
    assert.match(out, /in sync/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a hand-edit of a dist/codex/ output is reported as drift', () => {
  const root = freshRoot();
  try {
    const target = path.join(root, 'dist', 'codex', 'AGENTS.md');
    fs.appendFileSync(target, '\nhand-edited line that no source produces\n');
    const drift = detectDrift(root);
    assert.ok(
      drift.some((d) => d.kind === 'modified' && d.path === 'AGENTS.md'),
      `expected a modified AGENTS.md drift entry, got:\n${formatDrift(drift)}`,
    );
    assert.match(formatDrift(drift), new RegExp(REMEDIATION.replace(/[.`]/g, '\\$&')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('an extra dist/codex/ file with no plugin/ source is reported as drift', () => {
  const root = freshRoot();
  try {
    fs.writeFileSync(
      path.join(root, 'dist', 'codex', 'agents', 'bn-ghost.toml'),
      'name = "bn-ghost"\n',
    );
    const drift = detectDrift(root);
    assert.ok(
      drift.some((d) => d.kind === 'extra' && d.path === 'agents/bn-ghost.toml'),
      `expected an extra-file drift entry, got:\n${formatDrift(drift)}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a plugin/ source change that was not regenerated is reported as drift', () => {
  const root = freshRoot();
  try {
    const agentFile = path.join(root, 'plugin', 'agents', 'bn-correctness-reviewer.md');
    const body = fs.readFileSync(agentFile, 'utf8');
    fs.writeFileSync(agentFile, `${body}\n\nAn unregenerated source addition.\n`);
    const drift = detectDrift(root);
    assert.ok(
      drift.some(
        (d) => d.kind === 'modified' && d.path === 'agents/bn-correctness-reviewer.toml',
      ),
      `expected the unregenerated source to surface as toml drift, got:\n${formatDrift(drift)}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a stale skill directory with no plugin/ source is reported as drift', () => {
  const root = freshRoot();
  try {
    const ghostSkill = path.join(root, 'dist', 'codex', 'skills', 'bn-ghost-skill');
    fs.mkdirSync(ghostSkill, { recursive: true });
    fs.writeFileSync(path.join(ghostSkill, 'SKILL.md'), '---\nname: bn-ghost-skill\n---\n');
    const drift = detectDrift(root);
    assert.ok(
      drift.some(
        (d) => d.kind === 'extra' && d.path === 'skills/bn-ghost-skill/SKILL.md',
      ),
      `expected a stale-skill-directory drift entry, got:\n${formatDrift(drift)}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a missing dist/codex/ output is reported as drift', () => {
  const root = freshRoot();
  try {
    fs.rmSync(path.join(root, 'dist', 'codex', 'agents', 'bn-correctness-reviewer.toml'));
    const drift = detectDrift(root);
    assert.ok(
      drift.some(
        (d) => d.kind === 'missing' && d.path === 'agents/bn-correctness-reviewer.toml',
      ),
      `expected a missing-output drift entry, got:\n${formatDrift(drift)}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a stale .build-manifest.json is reported as drift', () => {
  const root = freshRoot();
  try {
    const manifestPath = path.join(root, 'dist', 'codex', MANIFEST_NAME);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files['AGENTS.md'].sha256 = '0'.repeat(64);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const drift = detectDrift(root);
    assert.ok(
      drift.some((d) => d.kind === 'modified' && d.path === MANIFEST_NAME),
      `expected a stale-manifest drift entry, got:\n${formatDrift(drift)}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('the remediation names both the render and the --write-manifest step', () => {
  // detectDrift checks .build-manifest.json, which render-codex.mjs does not
  // emit; a remediation that names only the render leaves the manifest stale and
  // the gate red. The contract: following the line produces a green tree.
  assert.match(REMEDIATION, /render-codex\.mjs/);
  assert.match(REMEDIATION, /check-codex-drift\.mjs --write-manifest/);
});

test('the CLI exits 1 and prints the remediation line on drift', () => {
  const root = freshRoot();
  try {
    fs.appendFileSync(path.join(root, 'dist', 'codex', 'AGENTS.md'), '\ndrift\n');
    let exitCode = 0;
    let stderr = '';
    try {
      execFileSync('node', [SCRIPT_PATH, '--root', root], { encoding: 'utf8' });
    } catch (err) {
      exitCode = err.status;
      stderr = String(err.stderr);
    }
    assert.equal(exitCode, 1);
    assert.match(stderr, /render-codex\.mjs/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
