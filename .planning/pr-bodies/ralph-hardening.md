## Summary

Promotes the Night Shift (Ralph) from "documented spec + 40-line MVP" to **production-ready**. Closes the operational gaps in `core/13-ralph-and-afk.md` §66, §68, §69, §70 and adds budget enforcement for §63. Includes a 4-phase canary runbook for the first real overnight session.

After this PR merges:

- `templates/ralph-local.sh` is 280+ lines of structured Bash with explicit failure paths instead of a 40-line happy-path script.
- A `PreToolUse(Bash)` hook (`hooks/git-guardrails.js`) blocks destructive Git operations at the tool layer for any Claude Code session in the project.
- Every Ralph session produces a single NDJSON log file consumable by `/postmortem` and queryable with `jq`.
- Every draft PR Ralph opens includes the reviewer agent's findings, iteration count, scenarios satisfied, and a pointer to the session log.
- Issues that exhaust their iteration / budget / rate-limit budget are auto-labeled `ralph-blocked` (with `ralph-ready` removed) and receive a structured comment containing the last 5 actions, scenario pass/fail/not-attempted status, and the reason — so the morning triage is one `gh issue list --label ralph-blocked` away.
- HTTP 429 from the Anthropic API triggers exponential backoff (`1s, 2s, 4s, 8s, 16s, 32s, 60s`) instead of crashing the session.
- The `budget:NNk` label is enforced: cumulative tokens are extracted from the `claude` CLI output and the session is blocked cleanly if the ceiling is exceeded.

## Slices (each commit is reviewable independently)

| Commit | Slice | Rule shipped | Scenario gate |
|---|---|---|---|
| `36c3781` | spec + scenarios maestros | — | — |
| `f4bde57` | Slice 1 — git-guardrails PreToolUse hook | §68 | scn-r04 |
| `b1daa8d` | Slice 2 — NDJSON session logging via ralph-lib.sh | §69 | scn-r05 |
| `eaa02bd` | Slice 3 — reviewer agent invocation pre-PR | §66 | scn-r02 |
| `1ee8174` | Slice 4 — ralph-blocked automation + structured comment | §66 | scn-r03 |
| `fc0cd3c` | Slice 5 — exponential backoff on HTTP 429 | §70 | scn-r06 |
| `93b5ee3` | Slice 6 — synthetic end-to-end dry-run + README status | — | — |
| `a3c9d0b` | Slice 7 — token counting + budget enforcement | §63 budget | (validated in canary) |
| `c3933b5` | Runbook — first-overnight canary procedure | — | (operational gate) |

## Surface

| File | Lines | Purpose |
|---|---|---|
| `hooks/git-guardrails.js` | 201 | Node script blocking destructive git ops |
| `templates/ralph-local.sh.tmpl` | 280+ | Main Ralph orchestrator |
| `templates/ralph-lib.sh` | 700+ | 24 public helpers (logging, label parsing, reviewer, blocking, backoff, token counting, budget) |
| `templates/ralph-blocked-comment.md.tmpl` | 29 | Structured ralph-blocked issue comment |
| `docs/specs/ralph-hardening.md` | — | Full spec (FR-1..FR-8 + 4 NFRs) |
| `features/ralph/hardening.feature` | — | 7 scenarios (6 @release + 1 @nice-to-have) |
| `docs/runbooks/ralph-first-overnight-canary.md` | 322 | 4-phase canary runbook |
| `.planning/dry-runs/ralph-hardening-end-to-end.md` | 135 | Synthetic dry-run evidence |
| `docs/engineering/core/13-ralph-and-afk.md` | — | §66, §68, §69, §70 marked shipped |

Total: ~1,900 net lines across 10 files.

## Status of §N rules

| Rule | Before this PR | After this PR |
|---|---|---|
| §63 label gate + `budget:NNk` | Validated labels, **budget not enforced** | Validated labels + budget enforced via token counting |
| §65 max-iterations | Configurable arg, default 5 | Configurable arg, default 30 (per spec) |
| §66 reviewer pre-PR + ralph-blocked | Specified, not implemented | **Shipped**: reviewer invoked, severity classified, retry-once-on-blocking, auto-block with structured comment |
| §67 draft PR | Already implemented | Same |
| §68 git-guardrails hook | Referenced external tool | **Shipped**: own zero-dep Node hook, 11ms latency, 7 regex patterns |
| §69 NDJSON session log | Specified, not implemented | **Shipped**: 12+ canonical event types via ralph-lib.sh helpers |
| §70 429 backoff | Specified, not implemented | **Shipped**: `[1,2,4,8,16,32,60]s` schedule, exit-code-124 protocol |

## Validation evidence

### Synthetic (this PR)

`.planning/dry-runs/ralph-hardening-end-to-end.md` documents every `@release` scenario as exercisable by the shipped code. A 6-test stub harness was run end-to-end and confirmed:

| Test | Scenario | Result |
|---|---|---|
| A — label-contract enforcement | scn-r01 | ✓ |
| B — happy path + NDJSON | scn-r02 + scn-r05 | ✓ |
| C — reviewer blocking → retry → block | scn-r03 | ✓ |
| D — max-iter exhausted → block | scn-r03 | ✓ |
| E — 429 backoff with 3 retries | scn-r06 | ✓ |
| F — git-guardrails (9 cases) | scn-r04 | ✓ |

### Live (deferred to post-merge)

The synthetic suite cannot exercise: real `claude` CLI output format, real `gh` token edge cases, macOS BSD-date / Bash 3.2 quirks, real concurrent Ralph instances, or the actual reviewer agent on a real diff. These are the 4 bloqueante validations in `docs/runbooks/ralph-first-overnight-canary.md`. **The runbook is the gate**: a successful canary run signs off Night Shift for daily overnight use.

## What this PR does NOT change

- **The label contract Ralph reads is unchanged.** Existing issues prepared under the MVP script (`ralph-ready`, `scenarios:scn-*`, `budget:NNk`) continue to work.
- **No new numbered §N rule.** All work lands under existing §63, §66, §68, §69, §70.
- **§107 multi-module Agent Teams remains out of scope.** Deferred to a separate spec.
- **No sandbox Docker.** Script runs directly on the operator's machine; sandboxing is a separate hardening track.
- **No multi-issue queue.** One issue per script invocation; the wrapper `for i in 1 2 3; do ./templates/ralph-local.sh $i; done` remains the recommended pattern.

## Migration for existing scaffolds

Projects that already adopted Ralph under the MVP script need:

1. `cp <stormhelm>/templates/ralph-local.sh.tmpl <project>/templates/ralph-local.sh`
2. `cp <stormhelm>/templates/ralph-lib.sh <project>/templates/`
3. `cp <stormhelm>/templates/ralph-blocked-comment.md.tmpl <project>/templates/`
4. `cp <stormhelm>/hooks/git-guardrails.js <project>/.claude/hooks/`
5. Register the hook in `.claude/settings.json` under `hooks.PreToolUse` with `matcher: "Bash"`.
6. (Optional) Export `RALPH_TOKEN_EXTRACTOR_CMD` if your `claude` CLI version does not match one of the default extractors (JSON `usage`, `Total tokens: N`, `N input tokens, M output tokens`).

A future `/setup` re-run will do steps 1-5 automatically; for now they are manual.

## Known limitations (filed as follow-up issues if observed)

- **`tokensConsumedCumulative` may stay at 0** if neither the JSON nor plain-text extractors match this team's `claude` CLI version. Mitigation: set `RALPH_TOKEN_EXTRACTOR_CMD` per §70.
- **No SIGINT trap.** `Ctrl+C` during the loop leaves the branch in place without `ralph-blocked`. Operator must clean up manually (`pkill -f ralph-local.sh && gh issue edit ...`). Documented in the runbook's Kill Switch appendix.
- **No retry on `gh` CLI failures.** A `gh issue edit` failure aborts the block step; the operator sees the error and re-runs.
- **No multi-worker locking.** Two Ralph instances against the same issue at the same time race. The intended pattern is one Ralph per terminal; multiplexing requires a different layer.
- **`git branch -D` blocked even for stale `agent/*` branches.** Cleanup requires `GIT_GUARDRAILS_DISABLE=1` (documented). A periodic cleanup script for the Day Shift is a candidate follow-up.

## Reviewer checklist

- [ ] Read `docs/specs/ralph-hardening.md` — confirms the scope and acceptance criteria.
- [ ] Read `features/ralph/hardening.feature` — confirms the 6 `@release` scenarios that gate this work.
- [ ] Skim each slice commit independently (`git show <hash>`); the order matters because slices share `templates/ralph-lib.sh` additively.
- [ ] `bash -n templates/ralph-local.sh.tmpl && bash -n templates/ralph-lib.sh` — sanity syntax check.
- [ ] (Optional) Reproduce the test harness from `.planning/dry-runs/ralph-hardening-end-to-end.md` and walk through Tests A-F.
- [ ] After merge: run `docs/runbooks/ralph-first-overnight-canary.md` end-to-end on a trivial canary issue.

## Out-of-band

This PR is itself a Day-Shift artifact, not produced by Ralph. The synthetic dry-run uses Ralph against stubs; the live canary deferred post-merge uses Ralph against a real issue. The recursion (Ralph hardening Ralph) is intentional: §35 boring-to-review applies to the framework's own work.
