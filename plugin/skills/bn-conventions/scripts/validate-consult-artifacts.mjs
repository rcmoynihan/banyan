#!/usr/bin/env node

// validate-consult-artifacts.mjs — a pure, zero-dependency validator for the
// three consult artifact families (ask, answer, chain) against their JSON
// schemas under plugin/schemas/ (R14/R24/R23). Defining the ask/answer shapes as
// checkable schemas here — not inside an agent prompt — is what lets "reject a
// weak ask" and "an answer must carry basis/scope" be enforceable, visible
// facts rather than prose (AE2, R24).
//
// Why a hand-rolled validator instead of a JSON-schema runtime: this repo's
// scripts are deliberately dependency-free (node:* only), mirroring
// transcript-pointer.mjs / new-run.mjs. We implement exactly the draft-07
// subset the consult schemas use — type, required, additionalProperties, enum,
// minLength, minItems, minimum, format:date-time, pattern, integer, and local
// $ref resolution (transcript-pointer.schema.json) — and nothing more. An
// unsupported keyword in a schema would be silently ignored, so the schemas and
// this validator are co-owned by this unit and must move together.
//
// One deliberate divergence from strict draft-07: a present-but-null value for a
// `required` property is treated as MISSING (a consult artifact must never carry
// a null required field — null basis / null ask_id is as broken as an absent
// one). None of the consult schemas declares a nullable field, so this is
// stricter, never looser, than the shapes it guards; a future nullable field
// would need this rule revisited alongside the schema.
//
// Public API (pure given its inputs; the only I/O is read-only schema loading):
//
//   validateAsk(obj)    -> { ok, errors }
//   validateAnswer(obj) -> { ok, errors }
//   validateChain(obj)  -> { ok, errors }
//   validateAgainst(obj, schemaName) -> { ok, errors }
//
// `errors` is an array of { path, reason } records — one per failed constraint —
// so each failure class (a missing classification_proof, an answer with no
// basis) is independently assertable.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// scripts/ -> bn-conventions/ -> skills/ -> plugin/ ; schemas live at plugin/schemas/.
const SCHEMA_DIR = path.resolve(SCRIPT_DIR, '..', '..', '..', 'schemas');

const SCHEMA_FILES = {
  ask: 'consult-ask.schema.json',
  answer: 'consult-answer.schema.json',
  chain: 'consult-chain.schema.json',
};

const HEX64 = /^[a-f0-9]{64}$/;
// A pragmatic ISO-8601 date-time check (draft-07 format:date-time). Requires a
// date, a 'T', a time, and a zone (Z or +/-hh:mm). Not a full RFC-3339 parser —
// it rejects the obvious non-timestamps the consult artifacts must never carry.
const DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

// Lazy schema cache so repeated validations in one process read each schema once.
const schemaCache = new Map();

function loadSchema(fileName) {
  if (schemaCache.has(fileName)) {
    return schemaCache.get(fileName);
  }
  const absolute = path.join(SCHEMA_DIR, fileName);
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  schemaCache.set(fileName, parsed);
  return parsed;
}

// Resolve a local $ref (a sibling schema file name) into its parsed schema.
// The consult schemas only ever $ref a bare filename in the same dir.
function resolveRef(ref) {
  if (typeof ref !== 'string' || ref.includes('#') || ref.includes('/')) {
    throw new Error(`unsupported $ref (only sibling-file refs are supported): ${ref}`);
  }
  return loadSchema(ref);
}

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value; // 'object' | 'string' | 'number' | 'boolean'
}

function matchesType(value, expected) {
  const actual = typeOf(value);
  if (expected === 'number') {
    return actual === 'number' || actual === 'integer';
  }
  if (expected === 'integer') {
    return actual === 'integer';
  }
  if (expected === 'object') {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  return actual === expected;
}

// Recursively validate `value` against `schema`, pushing { path, reason } records
// into `errors`. `where` is the JSON-pointer-ish path to `value` for diagnostics.
function validateNode(value, schema, where, errors) {
  if (schema.$ref !== undefined) {
    validateNode(value, resolveRef(schema.$ref), where, errors);
    return;
  }

  if (schema.type !== undefined && !matchesType(value, schema.type)) {
    errors.push({ path: where, reason: `expected type ${schema.type}, got ${typeOf(value)}` });
    // A type mismatch makes deeper checks meaningless for this node.
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

  if (typeOf(value) === 'integer' || typeOf(value) === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path: where, reason: `number below minimum ${schema.minimum}` });
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

  if (matchesType(value, 'object') && value !== null && typeof value === 'object' && !Array.isArray(value)) {
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
        // Only validate properties that are present; `required` handles absence.
        if (key in value && value[key] !== null && value[key] !== undefined) {
          validateNode(value[key], subSchema, `${where}.${key}`, errors);
        }
      }
    }
  }
}

export function validateAgainst(obj, schemaName) {
  const fileName = SCHEMA_FILES[schemaName];
  if (!fileName) {
    throw new Error(`unknown consult schema: ${schemaName} (expected one of ${Object.keys(SCHEMA_FILES).join(', ')})`);
  }
  const schema = loadSchema(fileName);
  const errors = [];
  validateNode(obj, schema, '$', errors);
  return { ok: errors.length === 0, errors };
}

export function validateAsk(obj) {
  return validateAgainst(obj, 'ask');
}

export function validateAnswer(obj) {
  return validateAgainst(obj, 'answer');
}

export function validateChain(obj) {
  return validateAgainst(obj, 'chain');
}

// ---------------------------------------------------------------------------
// CLI: `validate-consult-artifacts --ask <file>` (or --answer / --chain) prints
// the validation result as JSON. Exit 0 on a clean run regardless of validity (an
// invalid artifact is a legitimate signal, not a CLI error); exit 1 when the
// artifact is invalid (so a shell gate can branch on it); exit 2 on usage error.
// ---------------------------------------------------------------------------

function parseCliArgs(argv) {
  const opts = { kind: null, file: null };
  const kinds = { '--ask': 'ask', '--answer': 'answer', '--chain': 'chain' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg in kinds) {
      opts.kind = kinds[arg];
      opts.file = argv[(i += 1)];
    } else {
      process.stderr.write(`validate-consult-artifacts: unknown flag: ${arg}\n`);
      process.exit(2);
    }
  }
  return opts;
}

function main() {
  const opts = parseCliArgs(process.argv.slice(2));
  if (!opts.kind || !opts.file) {
    process.stderr.write('validate-consult-artifacts (--ask|--answer|--chain) <file.json>\n');
    process.exit(2);
  }
  let obj;
  try {
    obj = JSON.parse(fs.readFileSync(opts.file, 'utf8'));
  } catch (err) {
    process.stderr.write(`validate-consult-artifacts: cannot read artifact: ${err.message}\n`);
    process.exit(2);
  }
  const result = validateAgainst(obj, opts.kind);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Exported for the chain-checker (which reuses pointer-shape validation) and tests.
export { HEX64, DATE_TIME };
