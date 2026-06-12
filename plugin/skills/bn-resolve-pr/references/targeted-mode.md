# Targeted Mode

Read this reference when Mode Detection (in SKILL.md) routes to **Targeted Mode** — a
specific comment or thread URL was provided. Targeted mode addresses only that thread.

`<scripts>` means `${CLAUDE_PLUGIN_ROOT}/skills/bn-resolve-pr/scripts`.

## 1. Extract Thread Context

Parse the URL to extract OWNER, REPO, PR number, and comment REST ID:
```
https://github.com/OWNER/REPO/pull/NUMBER#discussion_rCOMMENT_ID
```

**Step 1** -- Get comment details and GraphQL node ID via REST (cheap, single comment):
```bash
gh api repos/OWNER/REPO/pulls/comments/COMMENT_ID \
  --jq '{node_id, path, line, body}'
```

**Step 2** -- Map comment to its thread ID:
```bash
bash <scripts>/get-thread-for-comment PR_NUMBER COMMENT_NODE_ID [OWNER/REPO]
```

This fetches thread IDs and their first comment IDs (minimal fields, no bodies) and
returns the matching thread with full comment details.

## 2. Fix, Reply, Resolve

A resolver agent is a spawn, so open the run ledger first using Full Mode step 0. Then spawn
a single `bn-pr-comment-resolver` for the thread, using the full-mode step 4 envelope with
this one item — including
`isOutdated` and the location fields (`line`, `originalLine`, `startLine`,
`originalStartLine`) — targeted threads can be outdated too and need the same relocation
handling. Read its outcome artifact, then follow the same validate → commit → push →
reply → resolve flow as Full Mode steps 5-7, and close out with the harvest + summary of
step 9 (scaled to the single item).
