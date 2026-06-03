# fix(setup): install + wire the framework hooks into the consumer

Resolves follow-up handoff **Item 1** — the same "broken on adoption" class as the `scripts/` gap (#39/#41), reopened for hooks.

## Problem

The framework ships 5 Node hooks in `hooks/` (`git-guardrails.js`, `closed-set-check.js`, `context-monitor.js`, `webfetch-cache-pre.js`, `webfetch-cache-post.js`). `/setup`'s description says it "installs hooks", but the workflow **never copied or wired them**. A freshly-adopted consumer has no `git-guardrails.js` (the destructive-git guard, §68) and no other hook on disk — silently absent.

## Correction to the handoff's suggested fix

The handoff guessed "copy to `.claude/hooks/` and inspect the framework's `.claude/settings.json` for the wiring format". Both are wrong, per the **canonical sources** (`hooks/README.md` + `core/19-hooks-and-runtime-guards.md` §113):

- Hooks live at **`${CLAUDE_PROJECT_DIR}/hooks/`** (repo root, like `scripts/`) — **not** `.claude/hooks/`. That's the path the settings.json wiring references.
- The framework has **no `.claude/settings.json`** to copy from; **§113 is the canonical wiring reference**.
- Hooks are **opt-in per project (§113)**. `git-guardrails.js` is **mandatory** whenever Ralph runs (§68); the other four are opt-in.

This PR follows the canonical convention, not the handoff's guess.

## Changes (`skills/setup/SKILL.md`)

1. **Copy step** (mirrors the scripts loop): `mkdir -p hooks; cp $STORMHELM_PATH/hooks/*.js hooks/; chmod +x hooks/*.js`, plus `hooks/README.md` (install + per-hook config reference). All 5 are consumer-runtime (verified against the README table — none is framework-self-maintenance).
2. **Wiring**: the `.claude/settings.json` block (previously a `"hooks": { /* ... */ }` stub) is now concrete, matching §113 — `git-guardrails.js` wired **always** (PreToolUse `Bash`); the four opt-in hooks wired as sensible removable defaults. Commands use `${CLAUDE_PROJECT_DIR}/hooks/<hook>.js`. A note points at §113 as the source to keep in sync.
3. **Validation step**: new check that the 5 hooks resolve on disk **and** `.claude/settings.json` registers at least `git-guardrails.js` (matcher `Bash`) — otherwise the destructive-git guard is silently absent.
4. **"Versioned in Git" list** + **summary output** updated to include the hooks; reused the #41 durability reminder ("add new skill/hook-invoked artifacts to the install + validation").

## Verification

```
node scripts/check-framework-metadata.mjs   # ✅ (hook count in the framework unchanged)
node scripts/check-invariants.mjs           # ✅
node scripts/sync-closed-sets.mjs --check   # ✅
node --test scripts/__tests__/*.test.mjs    # ✅ 30/30
```

**Acceptance:** a freshly `/setup`-ed consumer has `hooks/git-guardrails.js` (+ the other 4) on disk and `git-guardrails` wired in `.claude/settings.json`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
