#!/usr/bin/env node
// check-counts.mjs -- guard the component counts stated in prose against the
// agents and skills on disk. The counts are derived dynamically from
// plugin/agents/bn-*.md and plugin/skills/*/SKILL.md; the shipped README prose
// (README.md, plugin/README.md) must match. The authoring AGENTS.md count bullet
// is also checked and any line that disagrees with disk is reported.
//
// Usage:
//   node check-counts.mjs [--root <repo-root>]
//
// Exit 0 when prose == disk, exit 1 on any mismatch. Zero dependencies: node:* only.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..', '..', '..', '..');

// Prose files whose agent/skill counts must equal the disk counts.
const REQUIRED_MATCH = ['README.md', 'plugin/README.md'];
// Prose files whose mismatching count lines are reported but do not fail the
// check: authoring-only surfaces fixed elsewhere.
const FLAG_ONLY = ['AGENTS.md'];

const AGENT_COUNT_RE = /(\d+)\s+agents/gi;
const SKILL_COUNT_RE = /(\d+)\s+skills/gi;

export function diskCounts(root) {
  const agentsDir = path.join(root, 'plugin', 'agents');
  const skillsDir = path.join(root, 'plugin', 'skills');
  const agents = fs
    .readdirSync(agentsDir)
    .filter((f) => f.startsWith('bn-') && f.endsWith('.md')).length;
  const skills = fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .filter((e) => fs.existsSync(path.join(skillsDir, e.name, 'SKILL.md'))).length;
  return { agents, skills };
}

// Every "<n> agents" / "<n> skills" occurrence whose number disagrees with the
// disk count, as { file, line, text, kind, found, expected } records.
function proseMismatches(root, relFile, counts) {
  const abs = path.join(root, relFile);
  if (!fs.existsSync(abs)) return [];
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const mismatches = [];
  lines.forEach((text, idx) => {
    for (const [re, kind, expected] of [
      [AGENT_COUNT_RE, 'agents', counts.agents],
      [SKILL_COUNT_RE, 'skills', counts.skills],
    ]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) !== null) {
        const found = Number(m[1]);
        if (found !== expected) {
          mismatches.push({
            file: relFile,
            line: idx + 1,
            text: text.trim(),
            kind,
            found,
            expected,
          });
        }
      }
    }
  });
  return mismatches;
}

export function check(root) {
  const counts = diskCounts(root);
  const failures = [];
  const flags = [];
  for (const rel of REQUIRED_MATCH) {
    failures.push(...proseMismatches(root, rel, counts));
  }
  for (const rel of FLAG_ONLY) {
    flags.push(...proseMismatches(root, rel, counts));
  }
  return { counts, failures, flags };
}

function format(report) {
  const lines = [
    `disk: ${report.counts.agents} agents, ${report.counts.skills} skills`,
  ];
  if (report.flags.length > 0) {
    lines.push('out-of-sync count lines (flagged, fix at source):');
    for (const f of report.flags) {
      lines.push(
        `  ${f.file}:${f.line} reads ${f.found} ${f.kind}, disk has ${f.expected}`,
      );
    }
  }
  if (report.failures.length > 0) {
    lines.push('prose count does not match disk:');
    for (const f of report.failures) {
      lines.push(
        `  ${f.file}:${f.line} reads ${f.found} ${f.kind}, disk has ${f.expected}`,
      );
    }
  } else {
    lines.push('README prose matches disk counts.');
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const opts = { root: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') opts.root = path.resolve(argv[++i]);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const report = check(opts.root);
  const out = format(report);
  if (report.failures.length > 0) {
    process.stderr.write(`${out}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${out}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
