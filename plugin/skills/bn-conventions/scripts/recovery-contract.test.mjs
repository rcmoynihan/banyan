import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(SCRIPT_DIR, '../../..');
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..');

function readPlugin(relativePath) {
  return fs.readFileSync(path.join(PLUGIN_ROOT, relativePath), 'utf8');
}

function readRepo(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function listMarkdownFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listMarkdownFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
  });
}

test('delegation envelopes carry resolved doctrine paths', () => {
  const envelope = readPlugin('skills/bn-conventions/references/envelope.md');

  assert.match(envelope, /\| `doctrine` \| Resolved paths to the Banyan doctrine/);
  assert.match(envelope, /doctrine:\s+\$\{CLAUDE_PLUGIN_ROOT\}\/AGENTS\.md,/);
  assert.match(envelope, /\*\*Read resolved doctrine paths\.\*\*/);
  assert.doesNotMatch(envelope, /bare `AGENTS\.md`[, ]+which belongs to Banyan/);
});

test('fenced envelope examples include doctrine', () => {
  const envelopePattern = /=== BANYAN ENVELOPE ===([\s\S]*?)=== END ENVELOPE ===/g;
  const markdownFiles = listMarkdownFiles(PLUGIN_ROOT);

  for (const markdownFile of markdownFiles) {
    const contents = fs.readFileSync(markdownFile, 'utf8');
    let match;
    while ((match = envelopePattern.exec(contents)) !== null) {
      const block = match[0];
      const relativePath = path.relative(PLUGIN_ROOT, markdownFile);
      const line = contents.slice(0, match.index).split('\n').length;
      assert.match(block, /\n\s*doctrine:\s+/, `${relativePath}:${line} lacks doctrine`);
      if (/artifact_path:\s+\.banyan\/runs\/<run-id>\/lessons-staging\//.test(block)) {
        assert.match(
          block,
          /skills\/bn-conventions\/references\/ledger\.md/,
          `${relativePath}:${line} harvester envelope lacks ledger doctrine`,
        );
        assert.match(
          block,
          /skills\/bn-conventions\/references\/knowledge-store\.md/,
          `${relativePath}:${line} harvester envelope lacks knowledge-store doctrine`,
        );
      }
    }
  }
});

test('grow disposition metadata uses canonical tokens', () => {
  const brainstormHandoff = readPlugin('skills/bn-brainstorm/references/handoff.md');
  const specStress = readPlugin('skills/bn-spec-stress/SKILL.md');
  const tokens =
    /revise-requirements[\s\S]*promote-to-plan-input[\s\S]*record-accepted-risk[\s\S]*ask-user/;

  assert.match(brainstormHandoff, tokens);
  assert.match(specStress, tokens);
  assert.doesNotMatch(brainstormHandoff, /revise requirements|promote to Plan Inputs/);
  assert.doesNotMatch(brainstormHandoff, /record accepted risk|ask user/);
});

test('run ledger defines grow-owned residual state', () => {
  const ledger = readPlugin('skills/bn-conventions/references/ledger.md');

  assert.match(ledger, /residuals\.md\s+# grow trunk-owned unresolved state/);
  assert.match(ledger, /\*\*`residuals\.md` -- grow trunk only\.\*\*/);
  assert.match(ledger, /## residuals\.md template/);
  assert.match(ledger, /\*\*Resume from:\*\*/);
  assert.match(
    ledger,
    /permission-cliff \| no-safe-default \| missing-external-authority \|[\s\S]*unsafe-working-tree \| recovery-exhausted/,
  );
});

test('bn-grow recovers gates before surfacing residuals', () => {
  const grow = readPlugin('skills/bn-grow/SKILL.md');

  assert.match(grow, /## Gates recover before surfacing/);
  assert.match(grow, /failed gate is a recovery signal/);
  assert.match(grow, /\.banyan\/runs\/<run-id>\/residuals\.md/);
  assert.match(grow, /same run dir/);
  assert.doesNotMatch(grow, /STOP and surface/);
});

test('reused delivery runs preserve phase ledgers', () => {
  const work = readPlugin('skills/bn-work/SKILL.md');
  const grow = readPlugin('skills/bn-grow/SKILL.md');
  const deliveryLead = readPlugin('agents/bn-delivery-lead.md');
  const ledger = readPlugin('skills/bn-conventions/references/ledger.md');

  assert.match(work, /Adoption is intentionally\s+non-mutating/);
  assert.match(work, /delivery started via \/bn-work/);
  assert.match(work, /plan-only run resumed into `\/bn-grow`/);
  assert.match(work, /Do not add per-implementation-unit rows to a reused\s+phase ledger/);
  assert.match(work, /do NOT replace the table with per-unit rows/);

  assert.match(grow, /resuming from an existing plan-created run/);
  assert.match(grow, /deliver\|bn-delivery-lead\|pending\|\.banyan\/runs\/<run-id>\/delivery-report\.md/);
  assert.match(grow, /trunk: entering deliver via \/bn-work/);
  assert.match(grow, /internal\/missing tool result/);
  assert.match(grow, /previous delivery dispatch returned missing\/internal tool result before report/);

  assert.match(deliveryLead, /Standalone `\/bn-work` unit ledger/);
  assert.match(deliveryLead, /Reused `\/bn-grow` or plan-created phase ledger/);
  assert.match(deliveryLead, /Do \*\*not\*\* replace the phase table with[\s\S]*per-implementation-unit rows/);
  assert.match(deliveryLead, /Missing owned row/);

  assert.match(ledger, /## Phase ledgers and unit ledgers/);
  assert.match(ledger, /Phase ledger[\s\S]*`deliver`/);
  assert.match(ledger, /Unit ledger[\s\S]*`U1`, `U2`/);
  assert.match(ledger, /Adopting an existing run is non-mutating/);
  assert.match(ledger, /scaffolder's `--run-id` path/);
});

test('planning is owned by bn-plan-lead', () => {
  const planSkill = readPlugin('skills/bn-plan/SKILL.md');
  const planLead = readPlugin('agents/bn-plan-lead.md');
  const grow = readPlugin('skills/bn-grow/SKILL.md');

  assert.match(planSkill, /Spawn one foreground `bn-plan-lead`/);
  assert.match(planSkill, /Do not scaffold a\s+run, write the ledger/);
  assert.match(planLead, /name: bn-plan-lead/);
  assert.match(planLead, /Agent\(bn-plan-generator, bn-plan-judge, bn-plan-checker, bn-lesson-harvester\)/);
  assert.match(planLead, /Write the Durable Plan/);
  assert.match(grow, /Phase 4 -- Plan \(subtree: bn-plan-lead/);
});

test('artifact-backed re-entry is the user touchpoint contract', () => {
  const pluginAgents = readPlugin('AGENTS.md');
  const envelope = readPlugin('skills/bn-conventions/references/envelope.md');
  const ledger = readPlugin('skills/bn-conventions/references/ledger.md');
  const conventions = readPlugin('skills/bn-conventions/SKILL.md');

  assert.match(pluginAgents, /AskUserQuestion` is trunk-only/);
  assert.match(pluginAgents, /artifact-backed re-entry/);
  assert.match(envelope, /User touchpoints: artifact-backed re-entry/);
  assert.match(ledger, /## Artifact-backed re-entry/);
  assert.match(conventions, /## Trunk-vs-lead boundary/);
});

test('adjacent skills expose grow recovery metadata', () => {
  const skillPaths = [
    'skills/bn-brainstorm/references/handoff.md',
    'skills/bn-spec-stress/SKILL.md',
    'skills/bn-plan/SKILL.md',
    'skills/bn-work/SKILL.md',
    'skills/bn-review/SKILL.md',
    'agents/bn-research-lead.md',
  ];

  for (const skillPath of skillPaths) {
    const contents = readPlugin(skillPath);
    assert.match(contents, /blocker_class/, `${skillPath} lacks blocker_class`);
    assert.match(contents, /next_safe_action/, `${skillPath} lacks next_safe_action`);
    assert.match(contents, /resume_from_phase/, `${skillPath} lacks resume_from_phase`);
  }
});

test('public docs describe recovery-first grow behavior', () => {
  const rootReadme = readRepo('README.md');
  const pluginReadme = readPlugin('README.md');

  assert.match(rootReadme, /Failed gates trigger bounded recovery/);
  assert.match(rootReadme, /residuals\.md/);
  assert.doesNotMatch(rootReadme, /failed stage stops/);
  assert.doesNotMatch(rootReadme, /Resolve Before Planning` items stop/);
  assert.match(pluginReadme, /bounded self-recovery at phase gates/);
});
