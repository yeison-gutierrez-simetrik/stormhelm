# feat(merge): add merge safety asserts (PR-Sec / FW-5)

## TL;DR

Two cheap shell-level asserts that prevent silent commit loss during `gh pr merge`. Pre-merge: refuses if `mergeable != MERGEABLE` or `mergeStateStatus != CLEAN`. Post-merge: verifies the merge commit's 2nd parent equals the head GitHub recorded for the PR.

## Motivating incident

belong-marketplace slice 01: PR #9 was merged while `mergeStateStatus = UNKNOWN` (GitHub was still recomputing). The merge silently used the prior HEAD as the merge source, dropping a commit that had just been pushed. Recovery required a cherry-pick PR (#10) which itself was almost lost in the next merge for the same reason.

## What changes

**New:** `scripts/check-merge-safety.mjs` (~150 LOC, zero-deps, uses only `gh` and `git`).

```bash
node scripts/check-merge-safety.mjs <pr_number> pre     # before gh pr merge
node scripts/check-merge-safety.mjs <pr_number> post    # first action of /feature Step 13
```

**Modified:**

- `skills/feature/SKILL.md` Step 12 — pre-merge assert is mandatory before HUMAN CHECKPOINT 2.
- `skills/feature/SKILL.md` Step 13 — post-merge verify is action 0 of close-out.
- `docs/engineering/core/13-ralph-and-afk.md` §67 — new "Merge safety asserts (mandatory)" section citing the belong-marketplace incident.

## Why not a new §N rule

The merge safety asserts extend the existing §67 (draft PRs + human merge) rather than introducing a new rule. §67 was already about "merging is human and intentional"; this PR makes "intentional" mechanically verifiable.

## Acceptance

- [x] `scripts/check-merge-safety.mjs` rejects all 7 `mergeStateStatus` values that are not `CLEAN`, with actionable error hints.
- [x] Post-mode correctly compares `mergeCommit.parents[1]` against `headRefOid`.
- [x] Framework linter (`scripts/check-framework-metadata.mjs`) green after merge.
- [x] §67 amendment integrates cleanly (no `Rules in this file` header drift).

## Notes for the reviewer

The pre-mode hint table maps each `mergeStateStatus` to a specific recovery suggestion (DIRTY → resolve conflicts; BEHIND → rebase; UNKNOWN → wait and re-run; BLOCKED → wait for CI; etc.). The UNKNOWN case is treated as the most dangerous and explicitly cites the belong incident.

The post-mode is non-trivial only because squashed/rebased PRs don't produce a 2-parent merge commit; the script detects this and reports "N/A for non-merge strategies" rather than failing.
