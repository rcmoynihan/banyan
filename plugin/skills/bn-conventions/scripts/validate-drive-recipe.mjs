#!/usr/bin/env node

// validate-drive-recipe.mjs — a pure, zero-dependency parser + validator for the
// drive-recipe block (plugin/schemas/drive-recipe.schema.json), the single shared
// parse path for /bn-runbook (the producer) and both consumers (bn-dogfood-verifier
// Step 0 and bn-review-lead's drivable-surface gate). Defining the recipe shape and
// its fail-closed outcomes as a checkable script here — not inside an agent prompt —
// is what makes the contract a tested fact rather than prose (R7/R17/R18/R20/R21).
//
// Why a hand-rolled validator instead of a JSON-schema runtime: this repo's scripts
// are deliberately dependency-free (node:* only), mirroring
// validate-consult-artifacts.mjs. We implement exactly the draft-07 subset the
// drive-recipe schema uses — type, required, additionalProperties, enum, minLength,
// minItems, format:date-time, pattern — and nothing more.
//
// The schema's two conditional rules cannot be expressed in this draft-07 subset
// (it has no if/then/allOf/oneOf), so they are enforced in validateRecipe's CODE
// after the structural schema pass: `do_not_attempt` is required on any leg whose
// `tier` is `expensive-or-slow` or `no-dev-equivalent`; `observe` (inside `drive`)
// is required on any leg whose `mode` is `trigger-and-monitor`.
//
// One deliberate divergence from strict draft-07: a present-but-null value for a
// `required` property is treated as MISSING. The schema declares no nullable field,
// so this is stricter, never looser, than the shape it guards.
//
// Public API (pure given its inputs; the only I/O is read-only schema/file loading):
//
//   extractRecipeBlock(text)  -> { found, version, raw, blockCount }
//   validateRecipe(obj)       -> { ok, errors }
//   loadAndValidate(filePath) -> { status, recipe?, reason }
//   reconcile(recipe, touchedSurfaces) -> { perSurface: { <surface>: 'drive'|'skip' } }

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> bn-conventions/ -> skills/ -> plugin/ ; schemas live at plugin/schemas/.
const SCHEMA_DIR = path.resolve(SCRIPT_DIR, '..', '..', '..', 'schemas');
const SCHEMA_FILE = 'drive-recipe.schema.json';

// The single recipe-block version this validator recognizes. It is both the marker
// in the opening HTML-comment sentinel (`<!-- bn-drive-recipe v1 -->`) and the value
// the `recipe_schema_version` field carries. An unrecognized version degrades to a
// typed `unknown-version` signal, never a throw (R20).
const RECOGNIZED_VERSION = 'v1';

// A pragmatic ISO-8601 date-time check (draft-07 format:date-time). Requires a date,
// a 'T', a time, and a zone (Z or +/-hh:mm). Mirrors validate-consult-artifacts.mjs.
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

let cachedSchema = null;

function loadSchema() {
  if (cachedSchema === null) {
    cachedSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, SCHEMA_FILE), 'utf8'));
  }
  return cachedSchema;
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value; // 'object' | 'string' | 'number' | 'boolean'
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  if (expected === 'integer') return actual === 'integer';
  if (expected === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return actual === expected;
}

// Recursively validate `value` against `schema`, pushing { path, reason } records
// into `errors`. `where` is the JSON-pointer-ish path to `value` for diagnostics.
function validateNode(value, schema, where, errors) {
  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path: where, reason: `expected type ${schema.type}, got ${typeOf(value)}` });
    return;
  }

  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push({ path: where, reason: `value not in enum [${schema.enum.join(', ')}]` });
  }

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path: where, reason: `string shorter than minLength ${schema.minLength}` });
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
      errors.push({ path: where, reason: `string does not match pattern ${schema.pattern}` });
    }
    if (schema.format === 'date-time' && !DATE_TIME.test(value)) {
      errors.push({ path: where, reason: 'string is not an ISO-8601 date-time' });
    }
  }

  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path: where, reason: `array shorter than minItems ${schema.minItems}` });
    }
    if (schema.items !== undefined) {
      value.forEach((item, i) => validateNode(item, schema.items, `${where}[${i}]`, errors));
    }
  }

  if (matchesType(value, 'object')) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value) || value[key] === null || value[key] === undefined) {
          errors.push({ path: `${where}.${key}`, reason: 'missing required property' });
        }
      }
    }
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) {
          errors.push({ path: `${where}.${key}`, reason: 'additional property not allowed' });
        }
      }
    }
    if (schema.properties) {
      for (const [key, subSchema] of Object.entries(schema.properties)) {
        if (key in value && value[key] !== null && value[key] !== undefined) {
          validateNode(value[key], subSchema, `${where}.${key}`, errors);
        }
      }
    }
  }
}

// The two contract rules the draft-07 subset cannot express, enforced in code over
// each path entry after the structural pass (see header). Only applied when the path
// is shaped well enough to read `tier`/`mode` — a path that already failed the
// structural pass on those fields produces its own error there.
const CLIFF_TIERS = new Set(['expensive-or-slow', 'no-dev-equivalent']);

function validateConditionalRules(obj, errors) {
  if (!matchesType(obj, 'object') || !Array.isArray(obj.paths)) return;
  obj.paths.forEach((leg, i) => {
    if (!matchesType(leg, 'object')) return;
    if (CLIFF_TIERS.has(leg.tier)) {
      const dna = leg.do_not_attempt;
      if (dna === null || dna === undefined) {
        errors.push({
          path: `$.paths[${i}].do_not_attempt`,
          reason: `missing required property (tier ${leg.tier} must carry do_not_attempt)`,
        });
      }
    }
    if (leg.mode === 'trigger-and-monitor') {
      const observe = matchesType(leg.drive, 'object') ? leg.drive.observe : undefined;
      if (observe === null || observe === undefined) {
        errors.push({
          path: `$.paths[${i}].drive.observe`,
          reason: 'missing required property (mode trigger-and-monitor must carry drive.observe)',
        });
      }
    }
  });
}

export function validateRecipe(obj) {
  const schema = loadSchema();
  const errors = [];
  validateNode(obj, schema, '$', errors);
  validateConditionalRules(obj, errors);
  return { ok: errors.length === 0, errors };
}

// Locate the HTML-comment-sentinel recipe block(s) and the fenced JSON between them
// (R21). `version` is parsed from the opening sentinel of the FIRST block; `raw` is
// the fenced JSON text of the first block; `blockCount` is the total so callers can
// detect duplicates (R17). A block requires an opening sentinel, a fenced ```json
// payload, and a closing `<!-- /bn-drive-recipe -->` sentinel.
const BLOCK_RE =
  /<!--\s*bn-drive-recipe\s+(\S+)\s*-->\s*```json\s*\n([\s\S]*?)\n?```\s*<!--\s*\/bn-drive-recipe\s*-->/g;

export function extractRecipeBlock(instructionFileText) {
  const text = typeof instructionFileText === 'string' ? instructionFileText : '';
  const matches = [...text.matchAll(BLOCK_RE)];
  if (matches.length === 0) {
    return { found: false, version: null, raw: null, blockCount: 0 };
  }
  const first = matches[0];
  return {
    found: true,
    version: first[1],
    raw: first[2],
    blockCount: matches.length,
  };
}

// Compose extract + validate into the fail-closed outcome table (R17). Never throws
// on a parse or version failure — graceful degrade is the contract (R20).
export function loadAndValidate(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return { status: 'fail-closed', reason: 'no-recipe' };
  }

  const block = extractRecipeBlock(text);
  if (block.blockCount === 0) {
    return { status: 'fail-closed', reason: 'no-recipe' };
  }
  if (block.blockCount >= 2) {
    return { status: 'fail-closed', reason: 'duplicate' };
  }

  if (block.version !== RECOGNIZED_VERSION) {
    return { status: 'fail-closed', reason: 'unknown-version' };
  }

  let recipe;
  try {
    recipe = JSON.parse(block.raw);
  } catch {
    return { status: 'fail-closed', reason: 'invalid' };
  }

  if (recipe && typeof recipe === 'object' && !Array.isArray(recipe)
      && recipe.recipe_schema_version !== RECOGNIZED_VERSION) {
    return { status: 'fail-closed', reason: 'unknown-version' };
  }

  const { ok } = validateRecipe(recipe);
  if (!ok) {
    return { status: 'fail-closed', reason: 'invalid' };
  }
  return { status: 'usable', recipe };
}

// Per-surface drive|skip decision (R18). A touched surface is driven iff the recipe
// has a path for it that is `proven` AND on a browser/dev-server-drivable mode
// (local-dev-server) — otherwise it is skipped. A proven local-cli-process leg is
// recorded honestly in the recipe but reconcile returns 'skip' for it (checker F3 —
// the v1 verifier has no CLI drive surface). A surface absent from the recipe ⇒ skip.
const DRIVABLE_MODES = new Set(['local-dev-server']);

export function reconcile(recipe, touchedSurfaces) {
  const perSurface = {};
  const paths = recipe && Array.isArray(recipe.paths) ? recipe.paths : [];
  for (const surface of touchedSurfaces) {
    const drivable = paths.some(
      (leg) =>
        leg && leg.surface === surface && leg.status === 'proven' && DRIVABLE_MODES.has(leg.mode),
    );
    perSurface[surface] = drivable ? 'drive' : 'skip';
  }
  return { perSurface };
}

// ---------------------------------------------------------------------------
// CLI: `node validate-drive-recipe.mjs <file>` resolves the file through
// loadAndValidate and prints the typed outcome as JSON. Exit 0 when the recipe is
// `usable`; non-zero (1) on any fail-closed status (so a shell gate can branch on a
// recipe that must not be driven); exit 2 on a usage error (no file argument).
// ---------------------------------------------------------------------------

function main() {
  const file = process.argv[2];
  if (!file) {
    process.stderr.write('validate-drive-recipe <instruction-file>\n');
    process.exit(2);
  }
  const result = loadAndValidate(file);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === 'usable' ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { DATE_TIME, RECOGNIZED_VERSION };
