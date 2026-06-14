#!/usr/bin/env node
// Banyan UserPromptSubmit hook — invoked-procedure consent reminder (AGENTS.md §2.4).
//
// WHY THIS EXISTS. When a user explicitly invokes a heavy Banyan skill (e.g. types
// `/bn-grow ...`), that is a directive to run that procedure. The failure this guards
// against is an agent silently deciding the procedure is "overkill" and freelancing
// straight to the result without telling the driver. §2.4 requires asking first. The
// rule's canonical text lives in plugin/AGENTS.md; this hook is its UNIVERSAL delivery
// mechanism — it injects a short reminder into context at the exact moment a heavy skill
// is invoked, in every host repo, with no per-skill pointer to maintain.
//
// CONTRACT. UserPromptSubmit hooks receive the raw submitted prompt on stdin (slash
// commands are NOT pre-expanded, so `/bn-grow ...` is visible as text) and may emit
// `hookSpecificOutput.additionalContext` to inject context for this turn.
//
// SAFETY. This is a best-effort doctrine reminder, never a gate. On ANY uncertainty —
// unreadable stdin, malformed JSON, a non-matching prompt, a subagent context, or an
// internal error — it emits nothing and exits 0. It must never block or perturb the
// user's prompt, and it never exits 2.

import process from "node:process";

// Never let an asynchronous stream error (e.g. EPIPE if the reader closed early) throw and
// produce a non-zero exit — that would be the one way a doctrine reminder could perturb the
// prompt. A swallowed stdout error simply means the reminder was not delivered this turn.
process.stdout.on("error", () => {});

// Heavy pipeline/subtree skills where "this is overkill, I'll just do it myself" is a
// realistic temptation. Lightweight/conversational skills (bn-hello, bn-ask, bn-conventions,
// bn-doctor, bn-curate, bn-tune) are intentionally excluded — over-invoking them is cheap.
// Adding a future heavy skill = one entry here, the single place this list lives.
const HEAVY_SKILLS = ["grow", "plan", "review", "work", "debug", "onboard", "spec-stress"];

// Anchored at the first non-space character so conversational mentions ("what does
// /bn-grow do?") do not trigger. Tolerates an optional marketplace namespace prefix
// (`/banyan:bn-grow`, `/bn-grow`). The trailing \b keeps `bn-work` from matching a
// hypothetical `bn-worktree` — this works because every HEAVY_SKILLS name ends in a word
// char, so a following word char defeats the match; keep that property if adding names.
const INVOCATION = new RegExp(
  String.raw`^\s*/(?:[a-z0-9_.-]+:)?bn-(?:${HEAVY_SKILLS.join("|")})\b`,
  "i",
);

const NOTICE =
  "[Banyan AGENTS.md §2.4 — invoked-procedure consent] The user explicitly invoked a " +
  "Banyan skill; that is a directive to run THAT procedure, not a hint. First take the " +
  "skill's own lightweight path (most heavy skills scale down — e.g. /bn-grow skips fuzzy " +
  "intake and spec-stress and runs a thin plan for a clear lightweight task). If, after " +
  "that, running the procedure is still genuinely disproportionate to the task, you may " +
  "NOT silently bypass the skill and freelance to the result — reaching the right answer " +
  "the wrong way is itself the violation. Instead ask the driver first via AskUserQuestion: " +
  "state what the skill would do, the leaner alternative you propose, and your recommendation; " +
  "proceed leaner only once they choose it. Two cases need no re-ask: the user's prompt already " +
  "authorized the shortcut (that is consent), or the skill's own written branch routes/downgrades " +
  "the task (following it is adherence, not deviation). See AGENTS.md §2.4.";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    try {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (c) => (data += c));
      process.stdin.on("end", () => resolve(data));
      process.stdin.on("error", () => resolve(""));
    } catch {
      resolve("");
    }
  });
}

(async () => {
  try {
    const raw = await readStdin();
    if (!raw || !raw.trim()) return; // exit 0, no output

    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return;
    }
    if (!input || typeof input !== "object") return;

    // Trunk-only. UserPromptSubmit is documented to fire in BOTH the main session AND
    // inside subagents, but Claude Code does NOT document which (if any) field marks a
    // subagent on THIS event — agent_id/agent_type are documented for the SubagentStart/
    // SubagentStop events, not for UserPromptSubmit. So we cannot rely on one field name.
    // Defense in depth: (1) suppress on ANY plausible subagent marker below (names are
    // INFERRED — reconfirm against the installed CC version), and (2) the anchored regex
    // is the structural backstop — a subagent's prompt is a delegation envelope (prose/
    // JSON), which does not begin with a bare `/bn-...` at column 0. The failure direction
    // is always over-inject, never block: a stray reminder inside a subagent is benign
    // noise (and AskUserQuestion is trunk-only anyway), never a broken prompt.
    if (
      input.agent_id ||
      input.agent_type ||
      input.agent_name ||
      input.subagent_type ||
      input.subagentType ||
      input.isSubagent
    ) {
      return;
    }

    const prompt = typeof input.prompt === "string" ? input.prompt : "";
    if (!INVOCATION.test(prompt)) return;

    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: NOTICE,
        },
      }),
    );
  } catch {
    // Never let a doctrine reminder interfere with the user's prompt.
  }
  // Implicit exit 0.
})();
