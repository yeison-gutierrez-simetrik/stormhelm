# docs: track CLAUDE.md (genericized, de-dangled) + drop dangling ref

Resolves the follow-up handoff **Item 7** (CLAUDE.md untracked) and **Item 2** (dangling `.planning/` refs) together, taking the clean path the #39 review prescribed: genericize first, remove dangling refs, *then* track.

## Background

`CLAUDE.md` (the maintainer-context file auto-loaded for sessions working *on* the framework) was never tracked. The #39 commit that would have tracked it was dropped for two reasons — both about tracking it **as-is**, not about its content (the scripts-taxonomy / INV-6-7 / CI-status corrections were accurate):

1. It contained a `## Feedback loop with belong-marketplace` section, re-introducing the project coupling the #29/#30 agnosticism pass removed.
2. It referenced `consolidated-roadmap-2026-06.md` and `.planning/responses/`, which don't exist in the repo.

After the drop, a branch switch deleted the untracked file from the working tree entirely (it had been committed on the #39 branch, so checkout to `main` removed it). Net effect: new sessions on `main` loaded **no** maintainer context. This PR restores it (from `fbc3e49`) in a trackable shape.

## Changes

**`CLAUDE.md` (now tracked):**
- **Genericized** `## Feedback loop with belong-marketplace` → `## Feedback loop with consumer projects`. Keeps the useful pattern (consumer feedback → labeled `FW-N` PRs → co-signed ADR for philosophy decisions); drops the project name. No `belong`/`simetrik`/local-path coupling remains.
- **Removed dangling refs:** `consolidated-roadmap-2026-06.md` and `.planning/responses/` no longer appear. "Current planning state" now points at the latest handoff + `gh pr list` + `git log --merges` (all of which exist); the quick-orientation snippet reads the newest handoff instead of `cat`-ing the missing roadmap.
- Retains the accurate corrections from the dropped commit (scripts `[consumer-runtime]`/`[self-maint]` taxonomy + `group-slice-issues.mjs`, INV-6/INV-7 reservations matching `check-invariants.mjs`, CI status incl. `verify-scripts-tests.yml`).
- `.planning/` layout note simplified to reality (handoff/pr-bodies/dry-runs tracked; the rest ephemeral and untracked).

**`.planning/pr-bodies/HOW-TO-PUSH-ALL-7.md` (the only other tracked doc with a dangling ref):**
- Dropped the pointer to the non-existent `consolidated-roadmap-2026-06.md` (the 7 PRs it describes have all since merged; marked historical). Line 141's mention is left — it correctly characterizes those files as intentionally-local working artifacts, not a broken pointer.

## Verification

```
node scripts/check-framework-metadata.mjs   # ✅ (does not scan CLAUDE.md; unaffected)
node scripts/check-invariants.mjs           # ✅
node scripts/sync-closed-sets.mjs --check   # ✅
node --test scripts/__tests__/*.test.mjs    # ✅ 30/30
git grep "consolidated-roadmap-2026|.planning/responses/response"   # ∅ no dangling refs in tracked files
grep belong CLAUDE.md                        # ∅ no project coupling
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
