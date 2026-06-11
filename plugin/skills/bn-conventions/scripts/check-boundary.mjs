#!/usr/bin/env node
// check-boundary.mjs -- report files changed outside an allowed boundary.
//
// Usage:
//   node check-boundary.mjs --base <ref> [--head <ref>] --allow <spec> [--cwd <dir>]
//
// --allow accepts comma-separated repo-relative paths/globs, or @<file> with
// one entry per line. Blank lines and # comments are skipped.
//
// Matching is deliberately minimal: exact repo-relative path, or dir/** for a
// prefix match. No other glob syntax is supported.
//
// Exit codes:
//   0 = all changed files are in-boundary
//   1 = one or more changed files are out-of-boundary
//   2 = usage or git error
//
// Zero dependencies: node:fs, node:path, node:process, node:child_process only.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

function fail(msg) {
  process.stderr.write(`check-boundary: ${msg}\n`);
  process.exit(2);
}

function readRequiredValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined) fail(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  const opts = { base: null, head: 'HEAD', allow: null, cwd: process.cwd() };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--base') {
      opts.base = readRequiredValue(argv, i, arg);
      i++;
    } else if (arg === '--head') {
      opts.head = readRequiredValue(argv, i, arg);
      i++;
    } else if (arg === '--allow') {
      opts.allow = readRequiredValue(argv, i, arg);
      i++;
    } else if (arg === '--cwd') {
      opts.cwd = readRequiredValue(argv, i, arg);
      i++;
    } else if (arg.startsWith('--')) {
      fail(`unknown flag: ${arg}`);
    } else {
      fail(`unexpected positional argument: ${arg}`);
    }
  }

  if (!opts.base) fail('missing required --base <ref>');
  if (!opts.allow) fail('missing required --allow <spec>');
  opts.cwd = path.resolve(opts.cwd);
  return opts;
}

function normalizeRepoPath(value) {
  let normalized = value.trim().replace(/\\/g, '/');
  while (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }
  while (normalized.endsWith('/') && normalized !== '/') {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function parseAllowEntry(raw) {
  const entry = normalizeRepoPath(raw);
  if (!entry || entry.startsWith('#')) return null;
  if (entry.startsWith('/')) fail(`allow entry must be repo-relative: ${entry}`);
  if (entry.includes('*') && !entry.endsWith('/**')) {
    fail(`unsupported allow glob: ${entry}`);
  }
  if (entry === '/**' || entry === '**') {
    fail(`unsupported allow glob: ${entry}`);
  }
  return entry;
}

function loadAllowEntries(spec, cwd) {
  let rawEntries;
  if (spec.startsWith('@')) {
    const listPath = spec.slice(1);
    if (!listPath) fail('--allow @file requires a file path');
    const resolvedPath = path.resolve(cwd, listPath);
    try {
      rawEntries = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/);
    } catch (err) {
      fail(`could not read allow file ${resolvedPath}: ${err.message}`);
    }
  } else {
    rawEntries = spec.split(',');
  }

  const entries = rawEntries.map(parseAllowEntry).filter((entry) => entry !== null);
  if (entries.length === 0) fail('--allow must contain at least one path or dir/** entry');
  return entries;
}

function runGit(args, cwd, failureContext) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).trim() : '';
    fail(`${failureContext} failed${stderr ? `: ${stderr}` : ''}`);
  }
}

function parsePathList(output) {
  return output
    .split(/\r?\n/)
    .map(normalizeRepoPath)
    .filter((file) => file.length > 0);
}

function uniquePaths(files) {
  return [...new Set(files)];
}

function revParseCommit(ref, cwd) {
  return runGit(['rev-parse', '--verify', `${ref}^{commit}`], cwd, 'git rev-parse').trim();
}

function headIsCurrentHead(head, cwd) {
  return revParseCommit(head, cwd) === revParseCommit('HEAD', cwd);
}

function getCommittedChangedFiles(base, head, cwd) {
  return parsePathList(runGit(['diff', '--name-only', `${base}...${head}`], cwd, 'git diff'));
}

function getUncommittedChangedFiles(cwd) {
  return [
    ...parsePathList(runGit(['diff', '--name-only', 'HEAD'], cwd, 'git diff')),
    ...parsePathList(runGit(['ls-files', '--others', '--exclude-standard'], cwd, 'git ls-files')),
  ];
}

function getChangedFiles(base, head, cwd) {
  const changedFiles = getCommittedChangedFiles(base, head, cwd);
  if (headIsCurrentHead(head, cwd)) {
    changedFiles.push(...getUncommittedChangedFiles(cwd));
  }
  return uniquePaths(changedFiles);
}

function isAllowed(file, allowEntries) {
  return allowEntries.some((entry) => {
    if (!entry.endsWith('/**')) return file === entry;
    const prefix = entry.slice(0, -3);
    return file.startsWith(`${prefix}/`);
  });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const allowEntries = loadAllowEntries(opts.allow, opts.cwd);
  const changedFiles = getChangedFiles(opts.base, opts.head, opts.cwd);

  let inCount = 0;
  let outCount = 0;

  for (const file of changedFiles) {
    if (isAllowed(file, allowEntries)) {
      inCount++;
      process.stdout.write(`IN   ${file}\n`);
    } else {
      outCount++;
      process.stdout.write(`OUT  ${file}\n`);
    }
  }

  process.stdout.write(`boundary: ${inCount} in, ${outCount} out\n`);
  process.exit(outCount === 0 ? 0 : 1);
}

main();
