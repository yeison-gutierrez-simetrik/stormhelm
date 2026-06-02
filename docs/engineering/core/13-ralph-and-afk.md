# 13 — Ralph & AFK Operations

**Scope.** How the autonomous Night Shift (Ralph) consumes work, what guardrails it respects, and what it never does without human review. These rules govern any agent running unattended against the codebase.

**When to read.** Configuring the local `ralph-local.sh` script, labeling issues for AFK execution, reviewing PRs produced overnight, debugging a stuck Ralph session, deciding which work is safe to automate.

**Rules in this file.** §63, §64, §65, §66, §67, §68, §69, §70, §107

> See `AGENTS.md` for the full rule index. Related: `12-bdd-and-acceptance.md` (scenarios as the AFK gate), `01-philosophy.md` (§30 vertical slices — what Ralph consumes), `15-observability.md` (session logging).

---

## §63. Issues with `ralph-ready` must have at least one `scn-NNN` associated

Without a Gherkin gate, AFK is not allowed. Ralph **never** processes an issue that does not declare which scenarios it must satisfy.

### Why

- The `.feature` file is the objective definition of done (§60).
- Without it, Ralph has no way to know when to stop.
- The economic cost of an unbounded AFK loop (Anthropic AFK pricing post-June-2026) makes this non-negotiable.

### Good

```yaml
# Issue body
Scenarios covered: scn-001, scn-002, scn-003

# Issue labels (GitHub)
ralph-ready
shift:afk
scenarios:scn-001,scn-002,scn-003
budget:50k
```

### Bad

```yaml
# Issue body
"Implement quote acceptance feature"
# no scenarios field, no labels referencing scn-*
```

### Enforcement

The `ralph-local.sh` script aborts on entry if the selected issue has no `scenarios:scn-*` label:

```bash
SCENARIOS=$(gh issue view "$ISSUE_NUMBER" --json labels --jq '.labels[].name' | grep '^scenarios:' || true)
if [ -z "$SCENARIOS" ]; then
  gh issue edit "$ISSUE_NUMBER" --remove-label "ralph-ready" --add-label "ralph-blocked"
  gh issue comment "$ISSUE_NUMBER" --body "Aborted: no scenarios:scn-* label. See §63."
  continue
fi
```

### `introduces-capability:<name>` label (companion to ralph-ready)

When a slice introduces a **new stack capability** that did not exist in the project before — a new adapter, a new library that becomes a runtime dependency, a new MCP server, a new external service integration — the issue must carry an `introduces-capability:<name>` label.

**Triggers (auto-detected by `/to-issues`):**

- A new file under `src/infrastructure/adapters/output/<new-tier>/` (e.g., first time `storage/` or `email/` or `payments/` appears).
- A new top-level dependency added to `package.json` / `pyproject.toml` that is not a dev-tool and not a patch/minor upgrade of an existing one.
- A new MCP server declared in `.claude/settings.json`.
- A new outbound integration that hits a previously unused external service.

**Why it matters:**

- Ralph is **never `ralph-ready`** for first-time capability slices. The first iteration always goes through `shift:hitl` because the agent has not yet seen the patterns the capability will use (e.g., how the project wires `ObjectStoragePort`, what mock the tests use).
- `reviewer` agent uses this label to load capability-specific rules even if the file `capabilities/<name>/*.md` is not yet present (the slice is the precedent that creates it).
- `/setup` consumes a list of `introduces-capability:*` labels at quarterly review to decide whether the introduced capability deserves a full `capabilities/<stack>/*.md` documentation pass.

**Examples of values:**

```yaml
introduces-capability:object-storage     # first S3/GCS/MinIO adapter
introduces-capability:email              # first SES/Sendgrid/Postmark adapter
introduces-capability:payments-stripe    # first Stripe integration (stack-specific)
introduces-capability:mcp-atlassian      # first Atlassian MCP server
introduces-capability:llm-anthropic      # first Anthropic LLM port
```

**Good:**

```yaml
# Issue touching new src/infrastructure/adapters/output/storage/s3/*
shift:hitl                          # always hitl for first-time
scenarios:scn-100,scn-101,...
budget:120k
require-human-review                # treat as sensitive (new attack surface)
introduces-capability:object-storage
# NO ralph-ready                    # forbidden for first iteration
```

**Bad:**

```yaml
# Issue touching new src/infrastructure/adapters/output/storage/s3/*
ralph-ready                         # ❌ violates §63 capability addendum
shift:afk                           # ❌ should be hitl
```

After the first successful iteration of a capability lands and the team is satisfied with the patterns, **a separate PR adds `docs/engineering/capabilities/<name>/*.md`** documenting the conventions for future use. Future slices using that capability can then be `ralph-ready`.

---

## §64. `require-human-review` is mandatory for issues touching sensitive domains

Some changes never auto-merge regardless of how cleanly Ralph closes the gate. Sensitive domains are explicitly listed and enforced.

### Sensitive domains (initial list — extend as needed)

- Authentication / authorization (`domain/auth/`, `application/use-cases/*-auth-*`)
- Payments (`domain/payments/`, any code touching Stripe/PSP)
- Personal data (PII, GDPR-covered fields)
- Cryptography (signing, encryption, JWT issuance)
- Database migrations (`migrations/`, `schema/`)
- Public API contracts (any change to `/v1/*` shape)
- Infrastructure-as-code (`terraform/`, `pulumi/`, `k8s/`)

### Rules

- Issues whose paths intersect sensitive domains **must** carry label `require-human-review`.
- Ralph still implements them, but the PR opens as `draft` and never auto-merges.
- The PR description includes a `Sensitive domain checklist` that the human reviewer must complete.

### Good

```yaml
# Issue labels
ralph-ready
shift:afk
scenarios:scn-040
budget:80k
require-human-review              # paths/auth/* → sensitive domain
```

### Bad

```yaml
# Issue touching /src/auth/jwt.ts
ralph-ready
shift:afk
scenarios:scn-040
budget:80k
# no require-human-review label    ❌
```

### Enforcement

Pre-Ralph hook (in `/to-issues` skill) cross-checks file paths declared in the issue against the sensitive paths list. If any intersection exists, applying `ralph-ready` without `require-human-review` is blocked.

---

## §65. `max-iterations` default is 30; reduce to 10-15 for brownfield

The default budget is enough for a typical vertical slice. Brownfield work is more constrained because the agent must respect existing code rather than create freely.

### Defaults by issue type

| Issue type | `max-iterations` | Rationale |
|---|---|---|
| Greenfield feature, isolated module | 30 | Default for `/to-issues` output |
| Brownfield modification, has tests | 15 | Tighter budget; if exceeded, signals confusion |
| Brownfield modification, no tests (characterization first) | 10 | Even tighter; the agent has less context to work with |
| Pure refactor (no behavior change) | 20 | Generous because mechanical changes can be verbose |
| Bug fix with regression test | 15 | Tight: bug fixes are surgical |

### Configuration

The value lives in the issue body, parsed by the script:

```markdown
max-iterations: 15
```

### Good

```bash
# ralph-local.sh excerpt
MAX_ITER=$(extract_value_from_issue_body "max-iterations" "$ISSUE_BODY" || echo "30")
claude -p --max-iterations "$MAX_ITER" ...
```

### Bad

```bash
# Hardcoded high default
claude -p --max-iterations 100 ...   # ❌ wastes tokens, doesn't surface confusion
```

### Why

- A high iteration count masks the symptom that the agent is lost.
- Tokens spent past iteration 15 on a small issue almost never produce a clean PR.
- Better to fail fast, mark `ralph-blocked`, and let a human triage.

---

## §66. Exceeding `max-iterations` applies `ralph-blocked` with explanation; never force-push, never delete history

When Ralph hits the iteration ceiling, it stops cleanly. Failure is not a crisis — it is a signal.

### Reviewer agent invocation before PR

After `/tdd` Green + `/run-acceptance` pass on an issue, but **before** `gh pr create --draft`, Ralph invokes the `reviewer` agent (§114) over the diff. The reviewer produces a structured findings report. Ralph behavior:

- **🛑 Blocking findings present** → loop back to `/tdd` to address them, up to one extra iteration (counts against `max-iterations`). If still blocking after the iteration, apply `ralph-blocked` label with the reviewer's report attached.
- **⚠️ Should fix findings present** → open the draft PR with the reviewer's report in the PR description; the human reviewer decides.
- **No blocking findings, only 💡 suggestions or clean** → proceed to PR creation.

The reviewer's report is always attached to the PR description regardless of outcome, so the human Day-Shift review starts with the same information.

Shipped implementation: `templates/ralph-local.sh` invokes the reviewer (`claude -p "/code-review …"`) immediately after `/run-acceptance` returns green. The lib's `ralph_reviewer_severity` classifies stdout into `blocking | should-fix | suggestion | clean`; `ralph_format_reviewer_section` produces a markdown section (with collapsible `<details>` wrapping for long reports) that is embedded in the PR body alongside iteration count and session log path. Log events `ralph.reviewer.invoked`, `ralph.reviewer.findings`, and (on retry) `ralph.reviewer.retry` are emitted.

### Required behavior on `max-iterations` exceeded

1. Stop the loop for this issue (continue to the next in the queue).
2. Apply label `ralph-blocked` to the issue.
3. Remove label `ralph-ready` (no other Ralph instance picks it up).
4. Post a structured comment on the issue with: iterations completed, last 5 actions taken, the failing scenario(s), the session log path.
5. If a branch was created, leave it intact (do **not** delete) — the human reviews and decides.
6. **Never** `git reset --hard`, `git push --force`, `git branch -D`, or `git clean -fdx` on the branch.

Shipped implementation: `templates/ralph-lib.sh` exposes `ralph_block_issue` which (1) calls `gh issue edit --add-label ralph-blocked --remove-label ralph-ready`, (2) renders `templates/ralph-blocked-comment.md.tmpl` with the reason, branch, session log, scenario pass/fail summary (`ralph_summarize_scenarios`), last 5 events from the log (`ralph_extract_last_actions`), and reviewer report if any, and (3) posts the rendered comment via `gh issue comment`. The function is idempotent and emits `ralph.issue.blocked` to the session log. Branch preservation is enforced by the git-guardrails hook (§68): the script cannot delete a branch even if it tried.

### Good comment template

```markdown
🛑 **Ralph blocked after 15 iterations**

**Issue:** #042 — Implement quote acceptance flow
**Scenarios:** scn-001 (passing), scn-002 (failing), scn-003 (not attempted)
**Branch:** `agent/issue-042` (preserved — do not delete)
**Session log:** `.planning/ralph-sessions/issue-042-20260520-194512.log`

**Last 5 actions:**
1. Wrote test for QUOTE_EXPIRED case
2. Implementation failed: `Date` arithmetic timezone bug
3. Attempted fix using `date-fns`
4. New test broken: `expiresAt` is `null` in fixture
5. Tried to update fixture — circular dependency in mock setup

**Recommended next steps:**
- Human review of scn-002 fixture setup
- Consider splitting issue into two: (1) date handling, (2) acceptance flow
```

### Why

- A force-push from an autonomous agent destroys evidence.
- The session log is the only artifact that explains what went wrong.
- The branch must remain reviewable.

### Enforcement

The `git-guardrails-claude-code` hook (see §68) hard-blocks the destructive operations. They are not "discouraged" — they are not callable from Ralph.

---

## §67. AFK PRs always open as `draft`; merge is always human

Ralph never marks a PR as ready-for-review and never merges. Both transitions are human actions in the Day Shift.

### Good

```bash
gh pr create \
  --draft \
  --base main \
  --head "agent/issue-$ISSUE_NUMBER" \
  --title "Closes #$ISSUE_NUMBER" \
  --body "$(cat .planning/ralph-sessions/issue-$ISSUE_NUMBER-summary.md)"
```

### Bad

```bash
gh pr create --base main --head "agent/issue-$ISSUE_NUMBER" --title "..."   # ❌ not draft
gh pr merge "$PR_NUMBER" --squash                                            # ❌ auto-merge
gh pr ready "$PR_NUMBER"                                                     # ❌ marking as ready
```

### Why

- The draft state is the explicit signal: "agent produced this, human must verify."
- Auto-merge bypasses the `require-human-review` rule (§64) silently.
- Compliance audits depend on a clear human approval point.

### Day Shift action (human)

```bash
# Morning routine: review draft PRs from overnight
gh pr list --draft --label agent-generated
# After review:
gh pr ready 142            # mark as ready

# Merge safety asserts (mandatory — see "Merge safety" below):
node scripts/check-merge-safety.mjs 142 pre
gh pr merge 142 --squash   # human merges only after pre-check is green
node scripts/check-merge-safety.mjs 142 post   # verify no commit was dropped
```

### Merge safety asserts (mandatory)

`gh pr merge` against a PR whose `mergeable=UNKNOWN` or `mergeStateStatus ≠ CLEAN` can drop a recently pushed commit silently — GitHub uses the prior head as the merge source while it is still recomputing. This has been observed in practice: a commit pushed seconds before the merge was excluded, and had to be recovered via a follow-up cherry-pick PR.

Two cheap checks close the gap and are **mandatory** at HUMAN CHECKPOINT 2:

- **Pre-merge:** `node scripts/check-merge-safety.mjs <pr> pre` refuses if `mergeable ≠ MERGEABLE` or `mergeStateStatus ≠ CLEAN`. If `UNKNOWN`, wait and re-run; do not bypass.
- **Post-merge:** `node scripts/check-merge-safety.mjs <pr> post` is the first action of `/feature` Step 13. It compares the merge commit's 2nd parent against the head GitHub recorded for the PR; if they differ, a commit was lost and recovery is needed.

The script is zero-deps, uses `gh` + `git` already required by the framework, and never touches state — pure read + assert. Skipping it is a §1 violation (proportionality: the cost is ~5 seconds; the consequence of skipping has been a half-day recovery in real use).

---

## §68. Ralph respects `git-guardrails`: destructive Git operations are blocked at the tool level

Stormhelm ships its own `hooks/git-guardrails.js` (zero-dependency Node script) as a `PreToolUse(Bash)` hook that blocks dangerous Git commands. **Installation is mandatory** for any environment where Ralph runs. See `hooks/README.md` for the full behavior contract and installation snippet.

### Blocked operations

- `git push --force`, `git push -f`, `git push --force-with-lease`
- `git reset --hard <ref>`
- `git clean -fdx`, `git clean -fd`
- `git branch -D <name>`
- `git tag -d <name>` (for tags pointing to commits that exist on remote)
- `rm -rf .git`, `find -name .git -exec rm`, anything pattern-matching repo destruction

### Allowed operations

- `git add`, `git commit`, `git push` (without force), `git pull`
- `git checkout -b <new-branch>` (only forward, not destructive)
- `git stash`, `git stash pop`
- `git rebase` interactive on local-only branches (not yet pushed)

### Why

- AFK without guardrails is one bad iteration away from data loss.
- A force-push erases the audit trail of what Ralph did wrong.
- These are not capabilities Ralph needs — if it thinks it does, the issue should be `ralph-blocked` for human review.

### Bypass for humans

Humans in the Day Shift can disable the hook for explicit cleanup tasks:

```bash
# Temporarily disable for a known cleanup
GIT_GUARDRAILS_DISABLE=1 git push --force-with-lease origin agent/issue-042
```

The disable flag is **never** set by the Ralph script.

---

## §69. Each Ralph session writes a structured JSON log

Every AFK session produces a single, line-delimited JSON log file. This is the source of truth for postmortems, billing reconciliation, and the audit trail.

Shipped implementation: `templates/ralph-lib.sh` exposes `ralph_init_session`, `ralph_log_event`, `ralph_iteration_start`, `ralph_scenario_passed`, `ralph_git_action`, `ralph_budget_checkpoint`, `ralph_error_tool`, and `ralph_end_session`. The main `ralph-local.sh` invokes these at every significant operation. All events are NDJSON (one JSON object per line), validated by `jq -c '.'`.

### Log location

```
.planning/ralph-sessions/issue-<NNN>-<YYYYMMDD>-<HHMMSS>.log
```

### Required log line schema

```json
{
  "timestamp": "2026-05-20T19:45:12.034Z",
  "level": "info",
  "event": "ralph.iteration.started",
  "sessionId": "ralph-2026-05-20-194512-w1",
  "workerId": "w1",
  "issueNumber": 42,
  "iteration": 7,
  "tokensConsumedDelta": 4180,
  "tokensConsumedCumulative": 28734,
  "details": {
    "action": "tdd.red",
    "file": "src/application/use-cases/accept-quote.use-case.test.ts",
    "scenario": "scn-002"
  }
}
```

### Required event types (minimum)

- `ralph.session.started` — opening of the loop for an issue
- `ralph.iteration.started` — start of each iteration
- `ralph.iteration.completed` — end of each iteration, with outcome
- `ralph.scenario.passed` / `ralph.scenario.failed`
- `ralph.budget.checkpoint` — every 5 iterations, current burn rate
- `ralph.session.ended` — close, with final status (`completed | blocked | budget_exceeded`)
- `ralph.error.tool` — any tool invocation that returned an error
- `ralph.git.action` — every Git operation, including the blocked ones (so we see attempts)

### Why structured

- Greppable and queryable. `jq` over a month of logs yields cost dashboards.
- Feeds the traceability matrix (§62).
- Postmortem skill (`/postmortem`) parses these directly.

### Bad

```
[19:45:12] Starting iteration 7 for issue 42
[19:45:34] Wrote test
[19:45:51] Test failed: "expected ok, got false"
```

Why bad: unstructured, ungreppable, no cumulative token count, no link to scenario.

---

## §70. On Anthropic API 429, retry with exponential backoff; do not parallelize harder

Hitting rate limits is normal. The response is **slow down**, never **try more workers**.

Shipped implementation: `templates/ralph-lib.sh` exposes `ralph_call_claude_with_retry`, which wraps every `claude -p ...` invocation in the main script. The backoff schedule is `[1, 2, 4, 8, 16, 32, 60]` seconds (7 retries, ~123 s max wait). Detection covers `429`, `rate_limit_exceeded`, `rate limit`, and `Too Many Requests` in the CLI's stderr. Each retry emits `ralph.api.rate_limited`; exhaustion emits `ralph.api.rate_limit_exhausted`, returns exit code **124** to the caller, and the main script handles 124 by invoking `ralph_block_issue` with reason `rate-limit-exhausted-during-<call>` so the issue surfaces clearly in the morning review.

### Budget enforcement companion (§63 budget label)

The `budget:NNk` label on each issue declares a token ceiling for the Ralph session. Enforcement lives in `ralph-lib.sh` via three helpers:

- `ralph_parse_budget_label` converts `50k` / `120k` / `2m` / `50000` to an integer token count.
- `ralph_extract_tokens_from_output` is a best-effort extractor that recognizes JSON `usage.input_tokens + usage.output_tokens` (modern `claude --output-format json`), text patterns like `Total tokens: N` and `N input tokens, M output tokens`, plus a user-supplied extractor via the `RALPH_TOKEN_EXTRACTOR_CMD` env var.
- `ralph_check_budget` returns non-zero when `RALPH_TOKENS_CUMULATIVE > budget`.

After every successful `claude` invocation (`/tdd`, `/run-acceptance`, `/code-review`), the main script calls `check_budget_or_block "<call_name>"`. If exceeded, it invokes `ralph_block_issue` with reason `budget-exceeded-during-<call>` and exits cleanly so the morning review immediately sees the cost cap was the cause. A `ralph.budget.checkpoint` event is logged at the end of every iteration with the current cumulative vs declared budget.

If the `claude` CLI version in use does not expose token counts, the extractor returns 0 and the cumulative simply does not grow — enforcement degrades gracefully (no false positives), but the team should set `RALPH_TOKEN_EXTRACTOR_CMD` to a parser appropriate for its CLI version.

### Retry policy

```ts
const BACKOFF_MS = [1000, 2000, 4000, 8000, 16000, 32000, 60000];
let attempt = 0;

while (attempt < BACKOFF_MS.length) {
  try {
    return await callClaude(prompt);
  } catch (err) {
    if (!is429(err)) throw err;
    log.warn("ralph.api.rate_limited", { attempt, backoffMs: BACKOFF_MS[attempt] });
    await sleep(BACKOFF_MS[attempt]);
    attempt += 1;
  }
}

// Exhausted retries → mark session blocked, not just this iteration
throw new RalphRateLimitExhaustedError({ totalRetries: attempt });
```

### Bad: parallel workers as a fix for 429s

```bash
# ❌ Spawning more workers makes the rate limit worse
for w in 1 2 3 4 5; do
  ./ralph-local.sh --worker-id "$w" &
done
```

Why bad:

- Anthropic's Tier 2 limit is ~50 req/min total per API key, **not per worker**.
- Adding workers multiplies request rate without multiplying throughput.
- All workers hit 429 simultaneously, wasting wall-clock time and tokens on retry-loop overhead.

### Good: scale down on persistent 429

If the backoff hits the max twice in the same session, the script reduces concurrency for the rest of the night:

```bash
if [ "$RATE_LIMIT_STRIKES" -gt 2 ]; then
  echo "Reducing workers from $WORKER_COUNT to 1 due to persistent 429"
  kill_other_workers
  WORKER_COUNT=1
fi
```

### Why

- The rate limit is a property of the API key, not the machine.
- Burn rate must stay within the budget (§63's `budget:NNk` label exists for this).
- Sleep is cheap; failed API calls during 429 are not free.

---

## §107. Agent Teams for intra-feature parallelization

For features that touch multiple modules and would benefit from a dependency-graph orchestration (architecture → backend ↔ frontend ↔ devops → reviewer → integrator → final QA), use the **Agent Teams** pattern as an expansion of Eje 3 (sub-agentes intra-issue).

This is **distinct from Ralph workers** (§63-§70). Ralph workers parallelize *between* features (horizontal). Agent Teams parallelize *inside* one feature (vertical), where each teammate has a single responsibility and depends on specific upstream outputs.

### When to use

- Feature spans 2+ bounded contexts or 3+ modules.
- Frontend can be implemented from contracts (§103) while backend implements behavior.
- Multiple infrastructure changes (Docker, env vars, migrations) need to happen in parallel.
- The feature is estimated at >2 days of sequential work but the modules are independent.

### When NOT to use

- Single-module features → run sequentially, simpler.
- Features whose modules share state that cannot be cleanly decomposed → sequential is safer.
- Spike or prototype work → too much ceremony.

### Required setup

1. **Lead in delegate mode**: the orchestrator enters `Shift+Tab` and **does not implement**. It only assigns, monitors, and unblocks.
2. **Module contracts approved (§103)**: every teammate must have an unambiguous contract to work against.
3. **Task list with explicit dependencies**: each task names its blockers; teammates only start when dependencies are marked complete.
4. **`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`** (or the current production flag once stabilized) in `.claude/settings.json`.

### Canonical task graph

```
Task 1: arch-{modA}  Architecture (contracts) ────┬─ Task 3: arch-{modA}  Backend ──┐
                                                  └─ Task 4: fe-{modA}    Frontend ──┤
                                                                                     ├─ Task 8: reviewer  QA-A
Task 2: arch-{modB}  Architecture (contracts) ────┬─ Task 5: arch-{modB}  Backend ──┤
                                                  └─ Task 6: fe-{modB}    Frontend ──┤
                                                                                     ├─ Task 9: reviewer  QA-B
Task 7: devops       Infrastructure ──────────────────────────────────────────────────┘
                                                                                     │
                                                                          Task 10: integrator
                                                                                     │
                                                                          Task 11: qa-final
```

### Teammate role contract

Every teammate operates under these rules:

- **Read-only scope outside the module**: a teammate working on Module A cannot touch files of Module B except through declared shared infrastructure (DI container, router, docker-compose) and only with the integrator.
- **Mark tasks explicitly as completed**: dependent tasks stay blocked until upstream is marked done.
- **Message peers directly on issues** (not the lead): if the architect's contract is wrong, the frontend teammate messages the architect, not the lead.
- **Continuous reviewer in parallel**: at least one teammate (`reviewer`) runs in parallel reading code as it lands and providing early feedback before formal QA.

### Lead responsibilities during delegate mode

- Watch the task list every ~10 minutes.
- Unblock teammates with additional context (read from the spec, not invented).
- Never implement; if a teammate is stuck, assign or escalate.
- Track time per task; if any task exceeds 2× its estimate, intervene.

### Integration with Ralph

Agent Teams **can be invoked from inside a Ralph session** when an issue has the label `feature:multi-module`. The Ralph script detects this and switches from single-agent to delegate mode:

```bash
# inside ralph-local.sh
if gh issue view "$ISSUE_NUMBER" --json labels --jq '.labels[].name' | grep -q "^feature:multi-module$"; then
  RALPH_MODE="agent-teams"
else
  RALPH_MODE="single-agent"
fi
```

Budget (§63) applies per-team: the issue's `budget:NNk` is the cap for the entire team's work, not per teammate.

### Why

- Wall-clock time on multi-module features drops 40-60% versus sequential.
- Each teammate's context window stays focused on its own module — fewer hallucinations than a single agent juggling everything.
- The dependency graph makes the contract between teammates explicit and reviewable.
- Composes naturally with the rest of the framework: BDD scenarios (§56-§62) are the team's shared goal; module contracts (§103) are the shared interface; SLO gate (§83) is the shared finish line.

### Bad: Agent Teams without contracts

If §103 module contracts are not in place, Agent Teams degenerate into chaos because teammates renegotiate interfaces in flight. **Contracts are a precondition, not a nice-to-have.**

### Bad: lead implements during Agent Teams

If the lead writes code during delegate mode, two failure modes appear:
- The lead's edits conflict with teammates' edits.
- Teammates lose trust in the dependency graph and start guessing what the lead is doing.

The lead's job is coordination only. If the lead has spare capacity, it goes to providing extra context to stuck teammates — never to writing code.
