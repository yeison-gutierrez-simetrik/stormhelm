# 19 — Hooks & Runtime Guards

**Scope.** Claude Code hooks that run during the agent's lifecycle to enforce policies, reduce cost, observe state, and defend against runtime risks. Distinct from Git hooks (covered in §84 secret scanning, §85 dependency audit) — these run inside Claude Code, around the agent's tool calls.

**When to read.** Configuring `.claude/settings.json` for a new project, adding a new hook to the repo, debugging why an agent action was blocked, deciding which observability or guard signals to wire in.

**Rules in this file.** §108, §109, §110, §111, §112, §113

> See `../AGENTS.md` for the full rule index. Related: `13-ralph-and-afk.md` (§68 `git-guardrails` is also a hook, registered separately), `15-observability.md` (§77 structured logging — hooks contribute to this), `16-security-supply-chain.md` (§84-§90 — Git/CI hooks for supply chain).

---

## Claude Code hooks: a brief

Hooks are short executable scripts (any language with `chmod +x`) that Claude Code invokes at specific lifecycle events. They receive a JSON envelope on stdin, return via exit code + stderr:

| Event | When it fires | Common use |
|---|---|---|
| `SessionStart` | At session opening | Inject context, warm caches |
| `UserPromptSubmit` | After user types a prompt | Sanitize input, redact PII |
| `PreToolUse` | Before agent executes a tool | Validate, cache, block dangerous calls |
| `PostToolUse` | After tool returns | Log, scan output, update state |
| `PreCompact` | Before context compaction | Checkpoint critical state |
| `Stop` | When agent tries to end turn | Force loop, validate completion |
| `SubagentStop` | When sub-agent returns | Aggregate state |

Exit codes:
- `0`: proceed.
- `2`: block (PreToolUse) or signal completion with payload (the stderr content becomes the tool result the agent sees).
- Other non-zero: error logged, behavior depends on event.

Hooks are registered in `.claude/settings.json` under a `hooks` key per event with optional `matcher` filtering by tool name.

---

## §108. WebFetch caching with HTTP revalidation (no blind TTL)

Skills that quote external documentation (Hono, FastAPI, MDN, RFCs, framework changelogs) refetch the same URLs across sessions. Caching reduces token spend and latency, but **a blind TTL cache becomes a staleness liability**. The cache must revalidate against the origin using HTTP conditional requests (`If-None-Match` / `If-Modified-Since`) and only serve when the origin returns `304 Not Modified`.

This rule is implemented as two hooks in this repo:

- `hooks/webfetch-cache-pre.cjs` — `PreToolUse` matcher `WebFetch`. On cache hit with validators, sends a `HEAD` request with conditional headers; on `304` serves the cached body via exit 2 + stderr.
- `hooks/webfetch-cache-post.cjs` — `PostToolUse` matcher `WebFetch`. After a real fetch, retrieves validators via `HEAD` and stores the cache entry only when at least one validator is present.

### Cache layout

```
${CLAUDE_PROJECT_DIR}/.claude/webfetch-cache/
├── <sha256-of-url>.json
└── ...
```

Each cache file:

```json
{
  "url": "https://hono.dev/docs/api/context",
  "etag": "\"W/abc123\"",
  "last_modified": "Wed, 14 May 2026 09:12:31 GMT",
  "fetched_at": "2026-05-20T19:32:00.000Z",
  "body": "..."
}
```

### Why no TTL

Origins decide when their content changes. A TTL of "1 day" silently serves stale framework docs the day after a major release. HTTP validators are the only correct signal.

### Rules

- The cache directory is **gitignored**.
- Cache miss → always proceed to real fetch (exit 0, no interference).
- HEAD request has a 5s timeout; any error → proceed to real fetch.
- Cache entry stored only when the response includes at least one of `ETag` or `Last-Modified`.
- Bypass for sensitive URLs (auth endpoints, tenant-scoped APIs): configured in `.claude/hooks.config.json` under `webfetch_cache.bypass_url_patterns`.

### Configuration

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-pre.cjs\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-post.cjs\"" }
        ]
      }
    ]
  }
}
```

---

## §109. SessionStart meta-skill injection — adopt only when skill count grows beyond ~15

A `SessionStart` hook that injects a meta-skill router (so the agent auto-loads relevant SKILL.md files based on the user's request) is a known pattern (addyosmani `session-start.sh`, superpowers `session-start`). It is **not implemented in Stormhelm yet**, but the skill count has now grown to 28 — past the ~15 threshold above — so adopting it is an open decision rather than a premature optimization.

This rule reserves the slot so the framework's evolution is predictable: when the skill catalog exceeds ~15 entries, implement `hooks/session-start.js` that injects a router meta-skill into the initial context.

### Trigger to implement

- Skill directory has ≥15 SKILL.md files, OR
- The agent demonstrably picks the wrong skill more than 1 in 10 times.

### Anti-pattern when count is low

Injecting routing logic when there are only 5 skills wastes tokens and produces a worse outcome than the agent reading the skill descriptions directly via `mcp__skills__list_skills`.

---

## §110. Prompt injection guard on write operations (advisory by default)

A `PreToolUse(Write|Edit|MultiEdit)` hook that scans the content being written for known prompt-injection patterns (`<system>`, `[INST]`, `ignore previous instructions`, `<|im_start|>`, etc.) and either warns the agent (advisory) or blocks the write (strict, for sensitive paths).

This rule is **documented but not implemented in this repo iteration** — only adopted in code when the team explicitly enables it. The shape is specified here so adoption is deterministic.

### Specification

- Default mode: **advisory** — emits warning to stderr, allows write.
- Strict mode automatically triggered when writing to paths in `strict_paths` (configured): `features/**/*.feature`, `docs/specs/**`, `docs/postmortems/**`, `docs/constitution.md`, `docs/CONTEXT.md`, `docs/engineering/**`.
- Patterns and strict paths are configured in `.claude/hooks.config.json` under `prompt_injection`.
- Both modes log the detection to a structured log file (§77).

### Why advisory by default

False positives are real: tests, documentation, and security-tooling code legitimately contain these patterns. Blocking blindly creates friction without proportional safety gain. Strict mode is reserved for paths where the cost of injection is catastrophic.

### Adopting later

When the team is ready (typical trigger: first incident where an agent absorbed instructions from an external source and wrote them to a project file), implement `hooks/prompt-injection-guard.js` and register it in `.claude/settings.json` under `PreToolUse` with matcher `Write|Edit|MultiEdit`.

---

## §111. Read injection scanner (defense against summarization-surviving payloads)

A `PostToolUse(Read)` hook that scans files the agent reads for patterns designed to survive context compaction ("retain this through summarization", "keep this verbatim", "always carry forward"). These payloads target context window persistence — they ride into the agent's compacted memory and reactivate later.

This rule is **documented but not implemented in this repo iteration**. Specification:

- Event: `PostToolUse` with matcher `Read`.
- Patterns include: "retain through summarization", "must persist across compaction", "always carry forward", "remember this verbatim", "do not summarize this".
- Mode: advisory (warn the agent that a payload was detected; do not strip — let the agent see and reason about it).
- Patterns configured in `.claude/hooks.config.json` under `read_injection`.

### Why advisory only

Stripping content from a file the agent reads breaks reproducibility (the agent operates on a different file than what's on disk). Better to warn loudly and let the agent decide.

### Adoption trigger

Implement when the team observes the first case of a payload surviving `/handoff` to a new session.

---

## §112. Agent-aware context monitor — notify the agent, not just the user

A `PostToolUse` hook (universal, no matcher) that watches context usage and, when remaining capacity drops below configured thresholds, **injects a message to the agent** (not just the user's statusline) suggesting it close the current work cleanly, run `/handoff`, or request a human checkpoint.

This rule is implemented in `hooks/context-monitor.cjs`. The infrastructure for measuring context usage is **opt-in**: if no telemetry bridge file is present, the hook stays silent rather than producing false signals.

### Why notify the AGENT

The standard pattern (status line, badge in editor) notifies the **user**. But the user is often AFK during long sessions (Ralph). The agent is the one who can take corrective action: close in-flight work, write a handoff document, mark the issue blocked. Notifying the agent moves the response from "user notices and intervenes" to "agent self-regulates."

### Thresholds

- **WARNING** at <35% remaining → agent receives suggestion to finish current task.
- **CRITICAL** at <25% remaining → agent receives instruction to handoff or block.

Configurable in `.claude/hooks.config.json` under `context_monitor`.

### Debounce

Maximum one notification per 5 tool uses, regardless of threshold. Prevents spam.

### Telemetry bridge

The hook reads `${CLAUDE_PROJECT_DIR}/.claude/context-bridge.json`:

```json
{
  "session_id": "...",
  "tokens_used": 145000,
  "tokens_max": 200000,
  "updated_at": "ISO-8601"
}
```

This file is written by an external mechanism (custom statusline, MCP server, Claude Agent SDK telemetry). If the file is absent or stale (>30s), the hook stays silent — no fabricated signals.

### Configuration

```json
// .claude/settings.json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/context-monitor.cjs\"" }
        ]
      }
    ]
  }
}
```

---

## §113. Hooks are opt-in per project, declared in `.claude/settings.json`

No hook is loaded automatically by Stormhelm. Each project explicitly enables hooks by adding entries to `.claude/settings.json`. This gives every team the choice of which guards apply to their context and prevents Stormhelm from silently injecting behavior the team didn't request.

### Why opt-in

- Different projects have different sensitivity (a regulated fintech needs strict injection guards; a prototype repo doesn't).
- Hooks add latency to every tool call; only run what you need.
- Debugging is simpler when hook behavior is declared in version control, not implicit.

### Recommended baseline for a regulated/enterprise project

```json
// .claude/settings.json (Stormhelm recommended baseline)
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [{ "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-pre.cjs\"" }]
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/git-guardrails.cjs\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "WebFetch",
        "hooks": [{ "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-post.cjs\"" }]
      },
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "\"${CLAUDE_PROJECT_DIR}/.claude/hooks/context-monitor.cjs\"" }]
      }
    ]
  }
}
```

The `git-guardrails.cjs` referenced is the rule §68 implementation (out of scope for this file; lives in the `git-guardrails-claude-code` skill referenced from AI Hero).

### Verifying hooks are active

After editing `.claude/settings.json`, restart Claude Code. The first session-start log line emits the active hook list. If a hook fails to load, the failure appears in stderr immediately — do not let silently-broken hooks accumulate.

---

## Summary of hooks shipped in this iteration

| Hook | Event | Status | Purpose |
|---|---|---|---|
| `webfetch-cache-pre.cjs` | PreToolUse(WebFetch) | ✅ Shipped | Serve cache on `304 Not Modified` |
| `webfetch-cache-post.cjs` | PostToolUse(WebFetch) | ✅ Shipped | Store validated cache entries |
| `context-monitor.cjs` | PostToolUse(*) | ✅ Shipped (opt-in telemetry) | Notify agent on low context |
| `git-guardrails.cjs` | PreToolUse(Bash) | ✅ Shipped (mandatory for Ralph, §68) | Block destructive Git commands |
| `closed-set-check.cjs` | PostToolUse(Write\|Edit\|MultiEdit) | ✅ Shipped (opt-in) | Warn on closed-set ↔ doc drift (§36) |
| `prompt-injection-guard.js` | PreToolUse(Write\|Edit\|MultiEdit) | 📋 Specified §110, not implemented | Defend writes |
| `read-injection-scanner.js` | PostToolUse(Read) | 📋 Specified §111, not implemented | Defend reads |
| `session-start.js` | SessionStart | 📋 Specified §109, deferred | Meta-skill routing |

## Attribution

The hooks shipped in this iteration are composed from prior art:

- `webfetch-cache-pre/post.js`: adapted from `sdd-cache-pre.sh` / `sdd-cache-post.sh` in [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). MIT. Translated from bash to Node.js for runtime consistency with the rest of the hooks layer.
- `context-monitor.cjs`: adapted from `gsd-context-monitor.cjs` in [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done). MIT. Simplified to remove GSD-specific config and made telemetry-bridge agnostic.

Stormhelm did not invent these hooks; it composed the most useful pieces of existing open-source work and applies the rules (§108, §112) consistently.
