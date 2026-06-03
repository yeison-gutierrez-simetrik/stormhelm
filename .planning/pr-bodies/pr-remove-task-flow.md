# chore: remove stale task_flow/ sample; dogfooding is the living example

Resolves follow-up handoff **Item 3**. Decision (maintainer): **delete + README note** (over regenerate-and-CI or keep-as-disclaimed).

## Why

`task_flow/` was a git-tracked 732K / 81-file sample project duplicating the framework. It had **drifted** (28 skills / §1–§116 vs the live 32 / §1–§122), was still in **Spanish** (the live docs are English), and was **explicitly excluded from CI** (`check-framework-metadata.mjs` filtered it out) — so its drift was invisible and could only grow. A disclaimer (#31) reduced confusion but not the dead weight: a reader who explores it still gets a wrong picture.

A hand-frozen copy of the framework can't stay correct. The framework already **dogfoods itself** — its own `skills/`, `agents/`, `hooks/`, `docs/engineering/` are a living, CI-gated example of an adopted project that can't go stale. That's the better answer for "what does an adopted project look like".

## Changes

- **Deleted `task_flow/`** (81 tracked files).
- **`scripts/check-framework-metadata.mjs`**: removed the `'task_flow'` walk-exclusion — no longer needed, and the metadata gate now has no silent blind spot. Linter stays green (the stale rule files are gone).
- **`README.md`**: added a short note where the project structure ends — the repo is its own living example; explains the `task_flow/` removal so the history is clear.
- **`docs/runbooks/ralph-first-overnight-canary.md`**: the Phase 0 instruction no longer points at `task_flow/` as the canary target (now "a freshly `/setup`-ed project").

`.planning/*` historical artifacts (dry-runs, old pr-bodies) still mention `task_flow/` — left as-is; they're point-in-time records, not live docs.

## Verification

```
node scripts/check-framework-metadata.mjs   # ✅ (no task_flow exclusion; 32 skills / 122 rules)
node scripts/check-invariants.mjs           # ✅
node scripts/sync-closed-sets.mjs --check   # ✅
node --test scripts/__tests__/*.test.mjs    # ✅ 30/30
git grep task_flow -- ':!.planning'         # only the README note explaining the removal
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
