---
name: bn-hello
description: "Confirms Banyan is installed and prints its version. Use to verify the plugin loaded, skill dispatch works, and the manifest is readable."
argument-hint: "[name]"
---

# Banyan Hello

An install check. It confirms the Banyan plugin is installed, reads its version
from the plugin manifest, and prints a short greeting. It exercises no agents and
writes no files -- it only proves the skill-dispatch path is alive.

## Step 1: Read the plugin version

**Plugin root (pre-resolved):** !`echo "~/.codex/skills/banyan"`

If the line above resolved to an absolute path (it does not still contain the
literal text `~/.codex/skills/banyan`), read the manifest at that path:

```
<plugin-root>/.claude-plugin/plugin.json
```

Parse its JSON and take the `version` field (the `name` field should be `banyan`).

If the pre-resolved line is empty or still shows the literal `~/.codex/skills/banyan`
token (a non-Claude harness, or the env var is unavailable), fall back: locate a
`.claude-plugin/plugin.json` whose `name` is `banyan` using the native file-search
tool, read it, and take the `version` field. If no such manifest can be found,
report that the version is unknown rather than guessing -- do not invent a number.

## Step 2: Greet

Print one short confirmation line, ASCII only. Use the name from the skill argument
if one was given, otherwise greet generically. Examples:

```
Banyan v0.1.0 is installed. Hello, world.
```

```
Banyan v0.1.0 is installed. Hello, Riley.
```

If the version could not be determined:

```
Banyan is installed (version unknown). Hello, world.
```

Then stop. Do not spawn agents, do not write files, do not take further action.
This skill only confirms the plugin loaded.
