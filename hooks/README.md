# Hooks

Runtime guards and helpers that Claude Code invokes during the agent lifecycle. Each hook is a self-contained Node.js script (Node 18+) with **zero external dependencies** — it uses only `node:crypto`, `node:fs/promises`, `node:path`, and the global `fetch`.

Rules governing these hooks live in [`docs/engineering/core/19-hooks-and-runtime-guards.md`](../docs/engineering/core/19-hooks-and-runtime-guards.md).

---

## Shipped hooks

| File | Event | Matcher | Implements | Default state |
|---|---|---|---|---|
| `webfetch-cache-pre.cjs` | `PreToolUse` | `WebFetch` | §108 | Opt-in via `.claude/settings.json` |
| `webfetch-cache-post.cjs` | `PostToolUse` | `WebFetch` | §108 | Opt-in via `.claude/settings.json` |
| `context-monitor.cjs` | `PostToolUse` | `*` | §112 | Opt-in; silent without telemetry bridge file |
| `git-guardrails.cjs` | `PreToolUse` | `Bash` | §68 | **Mandatory** whenever Ralph runs in this project |
| `closed-set-check.cjs` | `PostToolUse` | `Write\|Edit\|MultiEdit` | §36 | Opt-in; warns when a doc's closed-set list drifts from code |

---

## Installation

Hooks are **opt-in per project** (§113). To enable, add entries to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-pre.cjs\""
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-post.cjs\""
          }
        ]
      },
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/context-monitor.cjs\""
          }
        ]
      }
    ]
  }
}
```

Then ensure each hook is executable:

```bash
chmod +x .claude/hooks/*.cjs
```

Restart Claude Code. The session-start log emits the active hook list; if a hook fails to load, the failure appears immediately in stderr.

---

## Configuration

Hooks read optional configuration from `.claude/hooks.config.json` (gitignored or not, your choice). All fields are optional; defaults are sensible.

```json
{
  "webfetch_cache": {
    "bypass_url_patterns": [
      "^https?://localhost",
      "^https?://127\\.0\\.0\\.1",
      "/api/private/",
      "^https?://[^/]+\\.internal\\."
    ]
  },
  "context_monitor": {
    "warn_remaining_pct": 35,
    "critical_remaining_pct": 25,
    "debounce_tools": 5
  }
}
```

### `webfetch_cache.bypass_url_patterns`

Array of regex strings (or plain substrings if regex parsing fails). URLs matching any pattern skip the cache entirely. Use for tenant-scoped APIs, auth endpoints, and any URL where stale content would be a security issue.

### `context_monitor.*`

- `warn_remaining_pct` (default `35`): % of context window remaining below which the agent receives a warning.
- `critical_remaining_pct` (default `25`): % below which the agent receives a critical alert.
- `debounce_tools` (default `5`): at most one notification per N tool uses, unless escalating from warning to critical.

---

## How each hook behaves

### `webfetch-cache-pre.cjs`

On every `WebFetch` tool call:

1. Reads the URL from stdin envelope.
2. If URL matches a bypass pattern → exit 0 (no caching).
3. Looks up `.claude/webfetch-cache/<sha256-of-url>.json`.
4. If cache exists with `ETag` or `Last-Modified`:
   - Sends `HEAD` with `If-None-Match` / `If-Modified-Since`.
   - 5-second timeout; any error → exit 0 (proceed to real fetch).
   - If origin responds `304 Not Modified` → emit cached body to stderr, exit 2 (Claude Code treats this as the WebFetch result; the real fetch never happens).
   - Any other status → exit 0 (cache stale, proceed to real fetch).
5. If cache miss or no validators → exit 0.

Cache directory is created on demand by the post-hook. Add `.claude/webfetch-cache/` to `.gitignore`.

### `webfetch-cache-post.cjs`

After a real `WebFetch` returns:

1. Reads the URL and response body from stdin envelope.
2. If URL matches a bypass pattern → exit 0 (no caching).
3. Sends `HEAD` to the URL to obtain `ETag` and/or `Last-Modified`.
4. If neither validator is present → exit 0 (refuse to cache, anti-staleness).
5. Atomically writes `.claude/webfetch-cache/<sha256-of-url>.json` with the body and validators.

Always exits 0 — this hook never blocks.

### `git-guardrails.cjs`

On every `Bash` tool call:

1. Reads the JSON envelope from stdin and extracts the `tool_input.command` string.
2. If `GIT_GUARDRAILS_DISABLE=1` is set → exit 0 (explicit human bypass).
3. Matches the command against the regex blocklist (see §68 for the canonical list): `git push --force*`, `git reset --hard*`, `git clean -fdx?`, `git branch -D`, `git push --delete`, `rm -rf .git`, `find … .git … -delete`.
4. On match → write a structured explanation to stderr and exit **2** (Claude Code surfaces stderr as the tool result and the command is **not** executed).
5. On no match or any internal error → exit 0 (fail-open; a hook bug must never block productive work).

Latency budget per invocation: **< 50 ms** (NFR-1 in `docs/specs/ralph-hardening.md`). Pure regex, no I/O beyond reading stdin.

**Mandatory for any project where Ralph runs.** The Day-Shift human bypass exists for explicit cleanup work (e.g., dropping a malformed local branch after a failed rebase). Ralph **never** sets `GIT_GUARDRAILS_DISABLE`.

### `context-monitor.cjs`

After every tool call:

1. Reads `.claude/context-bridge.json`. If absent or stale (>30s) → exit 0 silently.
2. Calculates remaining context %.
3. If below the warning threshold (default 35%) → considers notification.
4. Debounce: at most one notification per `debounce_tools` calls per session, **except** when escalating from warning to critical (always fires).
5. When firing, emits the notification to stderr and exits 2. Claude Code surfaces stderr from a PostToolUse hook as a tool result the agent sees in its next turn.

State is stored per session in `.claude/context-monitor-state-<session_id>.json`. Safe to delete.

---

## Telemetry bridge for `context-monitor.cjs`

`context-monitor.cjs` is silent without telemetry. To feed it usage data, write `.claude/context-bridge.json` from an external source:

```json
{
  "session_id": "some-stable-id",
  "tokens_used": 145000,
  "tokens_max": 200000,
  "updated_at": "2026-05-20T19:32:00.000Z"
}
```

Common sources:

- A custom statusline script that polls `claude-code` for session info and writes the file.
- An MCP server exposing telemetry.
- The Claude Agent SDK with usage events wired to a small writer.

The hook stays silent until that file appears. This is intentional: false context warnings are worse than no warnings.

---

## Removing a hook

Comment or remove the entry from `.claude/settings.json` and restart Claude Code. Hooks do not have global state beyond `.claude/webfetch-cache/` and `.claude/context-monitor-state-*.json` — both are safe to delete.

---

## Writing a new hook

Follow the same structure:

1. `#!/usr/bin/env node` shebang.
2. `'use strict';`.
3. Read JSON envelope from stdin.
4. Return via exit code (`0` = proceed, `2` = block/result) and stderr (= message to the agent).
5. Wrap `main()` in `.catch(() => process.exit(0))` so a hook bug cannot break the agent flow.
6. Zero external dependencies. Use Node built-ins.
7. Honor `.claude/hooks.config.json` for any configurable behavior.

When a new hook becomes part of Stormhelm, document it in `docs/engineering/core/19-hooks-and-runtime-guards.md` with a new `§N` rule and add an entry to the "Shipped hooks" table above.
