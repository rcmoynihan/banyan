import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'invoked-procedure-consent.mjs',
);

// Run the hook with `stdin` as its UserPromptSubmit payload. Returns { status, stdout }.
function run(stdin) {
  const r = spawnSync(process.execPath, [SCRIPT_PATH], {
    input: stdin,
    encoding: 'utf8',
    timeout: 10_000,
  });
  return r;
}

// True iff the hook emitted a §2.4 reminder for this turn.
function injected(r) {
  if (!r.stdout || !r.stdout.trim()) return false;
  const parsed = JSON.parse(r.stdout); // must be valid JSON when it emits anything
  return (
    parsed?.hookSpecificOutput?.hookEventName === 'UserPromptSubmit' &&
    typeof parsed.hookSpecificOutput.additionalContext === 'string' &&
    parsed.hookSpecificOutput.additionalContext.length > 0
  );
}

const INJECT_CASES = [
  ['bare /bn-grow', '{"prompt":"/bn-grow remove the bn-commit skill"}'],
  ['namespaced /banyan:bn-grow', '{"prompt":"/banyan:bn-grow do the thing"}'],
  ['arbitrary marketplace namespace', '{"prompt":"/my.market_place:bn-grow x"}'],
  ['/bn-plan', '{"prompt":"/bn-plan a feature"}'],
  ['/bn-review', '{"prompt":"/bn-review"}'],
  ['/bn-work', '{"prompt":"/bn-work the plan"}'],
  ['/bn-debug', '{"prompt":"/bn-debug the failing test"}'],
  ['/bn-onboard', '{"prompt":"/bn-onboard"}'],
  ['hyphenated /bn-spec-stress', '{"prompt":"/bn-spec-stress the doc"}'],
  ['leading whitespace', '{"prompt":"   /bn-plan x"}'],
  ['uppercase command', '{"prompt":"/BN-GROW x"}'],
];

const SILENT_CASES = [
  ['conversational mention', '{"prompt":"what does /bn-grow actually do?"}'],
  ['non-heavy /bn-hello', '{"prompt":"/bn-hello"}'],
  ['non-heavy /bn-ask', '{"prompt":"/bn-ask how does X work"}'],
  ['prefix over-match /bn-workspaces', '{"prompt":"/bn-workspaces"}'],
  ['prefix over-match /bn-reviewer', '{"prompt":"/bn-reviewer"}'],
  ['plain prompt', '{"prompt":"please refactor utils.js"}'],
  ['subagent agent_id', '{"prompt":"/bn-grow x","agent_id":"abc"}'],
  ['subagent agent_type', '{"prompt":"/bn-review","agent_type":"Explore"}'],
  ['subagent subagent_type', '{"prompt":"/bn-grow x","subagent_type":"bn-plan-lead"}'],
  ['subagent agent_name', '{"prompt":"/bn-plan x","agent_name":"foo"}'],
  ['subagent isSubagent', '{"prompt":"/bn-work x","isSubagent":true}'],
  ['malformed JSON', 'this is not json'],
  ['empty stdin', ''],
  ['missing prompt field', '{"hook_event_name":"UserPromptSubmit"}'],
  ['prompt not a string', '{"prompt":12345}'],
];

// The single most important property: the hook can NEVER block or perturb a prompt.
// UserPromptSubmit only blocks on exit code 2, so the hook must exit 0 on every input.
test('exits 0 on every input (never blocks the prompt)', () => {
  for (const [label, stdin] of [...INJECT_CASES, ...SILENT_CASES]) {
    const r = run(stdin);
    assert.equal(r.status, 0, `${label}: expected exit 0, got ${r.status}`);
  }
});

test('injects the §2.4 reminder for explicit heavy-skill invocations', () => {
  for (const [label, stdin] of INJECT_CASES) {
    assert.equal(injected(run(stdin)), true, `${label}: expected injection`);
  }
});

test('stays silent for mentions, non-heavy skills, subagents, and bad input', () => {
  for (const [label, stdin] of SILENT_CASES) {
    assert.equal(injected(run(stdin)), false, `${label}: expected silence`);
  }
});

test('emitted output is always valid JSON with the documented shape', () => {
  for (const [, stdin] of INJECT_CASES) {
    const r = run(stdin);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.ok(parsed.hookSpecificOutput.additionalContext.includes('§2.4'));
  }
});
