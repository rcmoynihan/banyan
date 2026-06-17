import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  extractRecipeBlock,
  validateRecipe,
  loadAndValidate,
  reconcile,
} from './validate-drive-recipe.mjs';

const SCRIPT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'validate-drive-recipe.mjs');

function provenBrowserLeg(overrides = {}) {
  return {
    surface: 'GET /',
    tier: 'drivable-as-is',
    mode: 'local-dev-server',
    status: 'proven',
    drive: { start: 'npm run dev' },
    ...overrides,
  };
}

function declaredCliffLeg(overrides = {}) {
  return {
    surface: 'nightly-batch',
    tier: 'expensive-or-slow',
    mode: 'trigger-and-monitor',
    status: 'declared',
    drive: { start: 'trigger the batch job', observe: 'poll the run dashboard' },
    do_not_attempt: { cost_basis: 'non-zero money per run', reason: 'remote batch costs real money' },
    ...overrides,
  };
}

function validRecipe(overrides = {}) {
  return {
    recipe_schema_version: 'v1',
    last_validated: {
      run_id: '2026-06-17-002-plan-agentic-drive-runbook',
      commit: 'deadbeef',
      validated_at: '2026-06-17T10:00:00Z',
    },
    paths: [provenBrowserLeg(), declaredCliffLeg()],
    ...overrides,
  };
}

// Wrap a recipe object in the HTML-comment-sentinel + fenced-JSON form (R21).
function block(recipeObj, version = 'v1') {
  return `<!-- bn-drive-recipe ${version} -->\n\`\`\`json\n${JSON.stringify(recipeObj, null, 2)}\n\`\`\`\n<!-- /bn-drive-recipe -->`;
}

// --- validateRecipe: structural + the two code-enforced conditional rules ----

test('a known-good recipe validates', () => {
  const result = validateRecipe(validRecipe());
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('a declared cliff leg missing do_not_attempt is invalid (conditional rule 1)', () => {
  const leg = declaredCliffLeg();
  delete leg.do_not_attempt;
  const result = validateRecipe(validRecipe({ paths: [provenBrowserLeg(), leg] }));
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.paths[1].do_not_attempt' && /missing required/.test(e.reason)),
    JSON.stringify(result.errors),
  );
});

test('a trigger-and-monitor leg missing observe is invalid (conditional rule 2)', () => {
  const leg = declaredCliffLeg();
  delete leg.drive.observe;
  const result = validateRecipe(validRecipe({ paths: [provenBrowserLeg(), leg] }));
  assert.equal(result.ok, false);
  assert.ok(
    result.errors.some((e) => e.path === '$.paths[1].drive.observe' && /missing required/.test(e.reason)),
    JSON.stringify(result.errors),
  );
});

test('a recipe missing last_validated is invalid', () => {
  const recipe = validRecipe();
  delete recipe.last_validated;
  const result = validateRecipe(recipe);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.last_validated' && /missing required/.test(e.reason)));
});

test('a recipe with a last_validated missing commit is invalid', () => {
  const recipe = validRecipe();
  delete recipe.last_validated.commit;
  const result = validateRecipe(recipe);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.last_validated.commit' && /missing required/.test(e.reason)));
});

test('a recipe with a bad tier enum is invalid', () => {
  const result = validateRecipe(validRecipe({ paths: [provenBrowserLeg({ tier: 'free-lunch' })] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.paths[0].tier' && /enum/.test(e.reason)));
});

test('a recipe with a bad mode enum is invalid', () => {
  const result = validateRecipe(validRecipe({ paths: [provenBrowserLeg({ mode: 'serverless' })] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.paths[0].mode' && /enum/.test(e.reason)));
});

test('a recipe with an empty paths array fails minItems', () => {
  const result = validateRecipe(validRecipe({ paths: [] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.paths' && /minItems/.test(e.reason)));
});

test('a recipe with an additional path property is invalid', () => {
  const result = validateRecipe(validRecipe({ paths: [provenBrowserLeg({ extra: 'nope' })] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.paths[0].extra' && /additional property/.test(e.reason)));
});

test('a recipe with a non-ISO validated_at fails date-time', () => {
  const recipe = validRecipe();
  recipe.last_validated.validated_at = 'yesterday';
  const result = validateRecipe(recipe);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.last_validated.validated_at' && /date-time/.test(e.reason)));
});

test('a present-but-null required field is treated as missing', () => {
  const recipe = validRecipe({ recipe_schema_version: null });
  const result = validateRecipe(recipe);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.recipe_schema_version' && /missing required/.test(e.reason)));
});

test('a non-object top-level recipe is invalid', () => {
  const result = validateRecipe('not an object');
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$' && /expected type object/.test(e.reason)));
});

test('a no-dev-equivalent leg also requires do_not_attempt', () => {
  const leg = provenBrowserLeg({ tier: 'no-dev-equivalent', status: 'declared' });
  const result = validateRecipe(validRecipe({ paths: [leg] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.path === '$.paths[0].do_not_attempt' && /missing required/.test(e.reason)));
});

// --- extractRecipeBlock: sentinel + fenced-JSON parsing, blockCount ----------

test('extractRecipeBlock finds a single block and parses its version', () => {
  const text = `# AGENTS\n\n${block(validRecipe())}\n\nmore text`;
  const got = extractRecipeBlock(text);
  assert.equal(got.found, true);
  assert.equal(got.version, 'v1');
  assert.equal(got.blockCount, 1);
  assert.deepEqual(JSON.parse(got.raw), validRecipe());
});

test('extractRecipeBlock reports blockCount 2 on a duplicate block', () => {
  const text = `${block(validRecipe())}\n\n${block(validRecipe())}`;
  const got = extractRecipeBlock(text);
  assert.equal(got.found, true);
  assert.equal(got.blockCount, 2);
});

test('extractRecipeBlock reports not-found when no block is present', () => {
  const got = extractRecipeBlock('# AGENTS\n\njust prose, no recipe');
  assert.equal(got.found, false);
  assert.equal(got.blockCount, 0);
  assert.equal(got.version, null);
});

// --- loadAndValidate: the fail-closed outcome table (R17/R20) ----------------

function withTempFile(t, contents) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-drive-recipe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'AGENTS.md');
  fs.writeFileSync(file, contents);
  return file;
}

test('loadAndValidate: exactly one well-formed block ⇒ usable', (t) => {
  const file = withTempFile(t, `# AGENTS\n\n${block(validRecipe())}\n`);
  const result = loadAndValidate(file);
  assert.equal(result.status, 'usable', JSON.stringify(result));
  assert.equal(result.recipe.recipe_schema_version, 'v1');
});

test('loadAndValidate: zero blocks ⇒ fail-closed no-recipe', (t) => {
  const file = withTempFile(t, '# AGENTS\n\nno recipe here');
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'no-recipe' });
});

test('loadAndValidate: two blocks ⇒ fail-closed duplicate', (t) => {
  const file = withTempFile(t, `${block(validRecipe())}\n${block(validRecipe())}`);
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'duplicate' });
});

test('loadAndValidate: unknown sentinel version ⇒ fail-closed unknown-version', (t) => {
  const file = withTempFile(t, block(validRecipe({ recipe_schema_version: 'v2' }), 'v2'));
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'unknown-version' });
});

test('loadAndValidate: unknown recipe_schema_version field ⇒ fail-closed unknown-version', (t) => {
  // Sentinel says v1 but the payload field disagrees — degrade, never wrong-parse.
  const file = withTempFile(t, block(validRecipe({ recipe_schema_version: 'v9' }), 'v1'));
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'unknown-version' });
});

test('loadAndValidate: a block failing the schema ⇒ fail-closed invalid', (t) => {
  const recipe = validRecipe();
  delete recipe.last_validated;
  const file = withTempFile(t, block(recipe));
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'invalid' });
});

test('loadAndValidate: a declared cliff leg missing do_not_attempt ⇒ fail-closed invalid', (t) => {
  const leg = declaredCliffLeg();
  delete leg.do_not_attempt;
  const file = withTempFile(t, block(validRecipe({ paths: [provenBrowserLeg(), leg] })));
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'invalid' });
});

test('loadAndValidate: malformed JSON payload ⇒ fail-closed invalid', (t) => {
  const file = withTempFile(t, '<!-- bn-drive-recipe v1 -->\n```json\n{ not json,,, }\n```\n<!-- /bn-drive-recipe -->');
  assert.deepEqual(loadAndValidate(file), { status: 'fail-closed', reason: 'invalid' });
});

test('loadAndValidate: an absent file ⇒ fail-closed no-recipe', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banyan-drive-recipe-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(
    loadAndValidate(path.join(dir, 'nope.md')),
    { status: 'fail-closed', reason: 'no-recipe' },
  );
});

// --- reconcile: per-surface drive|skip (R18) ---------------------------------

test('reconcile drives a proven browser surface A and skips an unrecorded surface B', () => {
  const recipe = validRecipe({
    paths: [provenBrowserLeg({ surface: 'A' })],
  });
  const got = reconcile(recipe, ['A', 'B']);
  assert.deepEqual(got, { perSurface: { A: 'drive', B: 'skip' } });
});

test('reconcile skips a surface recorded only as declared', () => {
  const recipe = validRecipe({
    paths: [provenBrowserLeg({ surface: 'A', status: 'declared' })],
  });
  assert.deepEqual(reconcile(recipe, ['A']), { perSurface: { A: 'skip' } });
});

test('reconcile skips a proven local-cli-process surface (checker F3 — no v1 CLI drive)', () => {
  const recipe = validRecipe({
    paths: [provenBrowserLeg({ surface: 'cli', mode: 'local-cli-process' })],
  });
  assert.deepEqual(reconcile(recipe, ['cli']), { perSurface: { cli: 'skip' } });
});

test('reconcile skips a proven trigger-and-monitor surface (not browser-drivable)', () => {
  const recipe = validRecipe({
    paths: [declaredCliffLeg({ surface: 'wf', status: 'proven' })],
  });
  assert.deepEqual(reconcile(recipe, ['wf']), { perSurface: { wf: 'skip' } });
});

// --- CLI exit codes (0 usable / non-zero non-usable / 2 usage) ---------------

test('CLI exits 0 on a usable recipe', (t) => {
  const file = withTempFile(t, block(validRecipe()));
  const r = spawnSync(process.execPath, [SCRIPT_PATH, file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('CLI exits non-zero on a fail-closed recipe (no block)', (t) => {
  const file = withTempFile(t, 'no recipe');
  const r = spawnSync(process.execPath, [SCRIPT_PATH, file], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('CLI exits non-zero on a duplicate-block recipe', (t) => {
  const file = withTempFile(t, `${block(validRecipe())}\n${block(validRecipe())}`);
  const r = spawnSync(process.execPath, [SCRIPT_PATH, file], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('CLI exits 2 on a usage error (no file argument)', () => {
  const r = spawnSync(process.execPath, [SCRIPT_PATH], { encoding: 'utf8' });
  assert.equal(r.status, 2);
});
