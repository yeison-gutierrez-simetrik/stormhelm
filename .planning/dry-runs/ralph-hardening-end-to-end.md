# Ralph Hardening — End-to-End Dry-Run

**Date:** 2026-05-27
**Branch:** `feat/ralph-hardening`
**Commits:** `36c3781` (spec) → `f4bde57` (slice 1) → `b1daa8d` (slice 2) → `eaa02bd` (slice 3) → `1ee8174` (slice 4) → `fc0cd3c` (slice 5)
**Spec:** `docs/specs/ralph-hardening.md`
**Scenarios:** `features/ralph/hardening.feature`

## Scope of this dry-run

Validate that the 5 slices integrate cleanly, the script compiles and parses, every public helper smoke-tests in isolation, and each `@release` scenario from `features/ralph/hardening.feature` is exercisable by the shipped code.

This is a **synthetic** end-to-end (using stubs for the `claude` CLI and the `gh` CLI), not a live overnight Ralph run. A live run requires real GitHub credentials, real Anthropic API access, and a real issue queue — those tests are appropriate after the merge.

## Final code surface

| File | Lines | Purpose |
|---|---|---|
| `hooks/git-guardrails.js` | 201 | PreToolUse hook blocking destructive git ops (§68) |
| `templates/ralph-local.sh.tmpl` | 270 | Main Ralph script — orchestrates the loop |
| `templates/ralph-lib.sh` | 594 | 20 public helpers (logging, label parsing, reviewer, blocking, backoff) |
| `templates/ralph-blocked-comment.md.tmpl` | 29 | Comment posted when an issue is blocked |
| `docs/specs/ralph-hardening.md` | — | Spec (FR-1..FR-8 + 4 NFRs) |
| `features/ralph/hardening.feature` | — | 7 scenarios (6 @release + 1 @nice-to-have) |
| `docs/engineering/core/13-ralph-and-afk.md` | — | §66, §68, §69, §70 marked as shipped |

Total new/changed lines: ~1,100 across 7 files. Spec line budget was "~280 lines for the script"; actual is 270 — within the §35 PRs-boring-to-review envelope across 5 PRs.

## Scenario walkthrough

### scn-r01 — Label-contract enforcement

**What the script does:**

```bash
LABELS=$(gh issue view "$ISSUE_NUM" --json labels --jq '.labels[].name' 2>/dev/null || true)

if ! ralph_has_label "$LABELS" "ralph-ready"; then
  echo "❌ Issue #$ISSUE_NUM no tiene label 'ralph-ready' (§63)" >&2; exit 1
fi
if ! echo "$LABELS" | grep -qE "^scenarios:"; then exit 1; fi
if ! echo "$LABELS" | grep -qE "^budget:"; then exit 1; fi
```

**Validation:** the three checks happen **before** `ralph_init_session`, so refused issues do not leave an empty log file. No branch is created, no commit is written. Exit code 1. ✓

### scn-r02 — Successful iteration produces a draft PR with reviewer report

**What the script does:** after `/run-acceptance` returns `exit code: 0`, the script runs `ralph_call_claude_with_retry "/code-review …"`, classifies the output via `ralph_reviewer_severity`, formats it with `ralph_format_reviewer_section`, and embeds the section into the PR body alongside iteration count and session log path.

**Smoke test (from earlier slice 3 validation):**

```
Detected severity: suggestion

## Reviewer report

**Severity:** suggestion

```
✓ Diff respects §27 authorization gating
✓ Tenant isolation present per §45
💡 Consider extracting the helper into a separate file
```
```

The PR body skeleton:

```
Automated by Ralph. Closes #N
**Iterations consumed:** N / MAX
**Scenarios satisfied:** scn-001,scn-002
**Session log:** `.planning/ralph-sessions/N-YYYYMMDD-HHMMSS.log`
---
[Reviewer report section]
---
> ⚠️ This PR is in draft state per §67. Merge requires human approval.
```

✓ scn-r02 covered.

### scn-r03 — Exceeded max-iterations applies ralph-blocked

**What the script does:** at end of loop without green, calls `ralph_block_issue` which:
1. `gh issue edit --add-label ralph-blocked --remove-label ralph-ready`
2. Renders `templates/ralph-blocked-comment.md.tmpl` with `iterations`, `branch`, `session_log`, `scenario_results` (✅/🛑/⚪ bullets from log events), `last_actions` (last 5 log lines), `reviewer_section` (from the last attempt if any).
3. `gh issue comment` posts the rendered markdown.
4. Emits `ralph.issue.blocked` event.
5. Branch is preserved.

**Smoke test (from slice 4 validation):** the rendered comment included all 3 scenarios marked correctly (`scn-001` ✅, `scn-002` 🛑, `scn-003` ⚪), the last 5 log actions with timestamps, and the recommended next steps. ✓

### scn-r04 — Destructive git ops blocked

**What the hook does:** matches against 7 regex patterns covering `git push --force*`, `git reset --hard`, `git clean -fdx`, `git branch -D`, `git push --delete`, `rm -rf .git`, `find ... .git ... -delete`. Returns exit 2 with structured stderr.

**Smoke test (from slice 1 validation):** 10/10 cases passed including the false-positive avoidance (`echo force-update` correctly allowed) and the human bypass (`GIT_GUARDRAILS_DISABLE=1`). Latency: 11ms (NFR-1 < 50ms ✓).

✓ scn-r04 covered.

### scn-r05 — Session log is NDJSON

**What the lib does:** `ralph_log_event` writes one JSON object per line, built via `jq -c -n` for robust escaping. Schema enforced: `timestamp, level, event, sessionId, workerId, issueNumber, iteration, tokensConsumedDelta, tokensConsumedCumulative, details`.

**Smoke test (from slice 2 validation):** 12-event session log validated line-by-line with `jq -c '.'`, all 10 canonical event types present, all required fields present in every line. ✓

### scn-r06 — 429 backoff survives without aborting

**What the lib does:** `ralph_call_claude_with_retry` wraps every `claude` invocation. On 429, sleeps according to `[1, 2, 4, 8, 16, 32, 60]`, emits `ralph.api.rate_limited`, retries. On exhaustion, emits `ralph.api.rate_limit_exhausted` and returns exit 124 so the caller (the main script) reacts by calling `ralph_block_issue` with reason `rate-limit-exhausted-during-<call>`.

**Smoke test (from slice 5 validation):** stubbed `claude` returns 429 for the first 3 invocations, then succeeds. The helper sleeps 1s + 2s + 4s, returns the 4th invocation's output cleanly, and the log contains exactly 3 `ralph.api.rate_limited` events. No `ralph-blocked` applied (correct happy path). ✓

## Gaps and known limitations

- **Live overnight run not yet validated.** All testing is synthetic. The first real overnight Ralph session against `task_flow/` (or a real Simetrik issue) is the production canary. Plan: tag this commit, run one issue, document the result as a second dry-run entry in this directory.
- **`scn-r07` (`/postmortem` consumes the log) is `@nice-to-have`** and not gated by slice 5. The format is consumable by `/postmortem` (which reads any NDJSON file under `.planning/ralph-sessions/`), but the explicit integration test belongs to a future enhancement of `/postmortem` itself.
- **No retry on `gh` failures.** If the GitHub API rate-limits us (unlikely with `gh`'s built-in handling but possible), the script bails. Not in scope per spec; the comment author can grep the log post-mortem.
- **Worker partitioning.** `RALPH_WORKER_ID` is honored in the log schema but multi-worker coordination (avoiding two Ralph instances picking up the same issue) is not implemented. The intended pattern is one Ralph per terminal/per developer — multiplexing requires a different layer.

## Promotion criteria

After this PR merges:

- `README.md` row "AFK Night Shift" flips from "MVP script + documented spec" to **"Production-ready"**.
- A short note in `core/13-ralph-and-afk.md` introduction confirms that §66, §68, §69, §70 are fully implemented (already done per slice updates).
- `task_flow/templates/ralph-local.sh.tmpl` and `task_flow/templates/ralph-lib.sh` are synced from `templates/` (the next `/setup` run will pick them up; existing scaffolds need a manual copy).

## Result

✅ **All 6 `@release` scenarios are satisfied by the shipped code.**
✅ **No new numbered rule was introduced (constraint respected).**
✅ **Total LOC across the 5 slices: ~1,100 — within the spec budget.**
✅ **Each slice is independently mergeable; they share `templates/ralph-lib.sh` but the changes append rather than mutate.**

Next: update the README and create the PR for review.
