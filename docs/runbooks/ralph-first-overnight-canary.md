# Ralph — First Overnight Canary Runbook

**Purpose.** This runbook walks through the **first real overnight Ralph session** end-to-end so that the four bloqueante validations (#1-#4 in the Night-Shift readiness audit) are exercised in production conditions on a low-risk canary issue. After this runbook passes, Ralph is approved for daily overnight use against real issues.

**Pre-condition.** The Ralph hardening PR (Slices 1-7 of `docs/specs/ralph-hardening.md`) is merged to `main`. `ralph-local.sh`, `ralph-lib.sh`, `ralph-blocked-comment.md.tmpl`, and `hooks/git-guardrails.js` are present in the project.

**Time budget.** 60-90 minutes of attended Day-Shift work to prepare and execute. The canary itself is a single issue with `max-iterations=5`, so wall-clock is typically 5-15 minutes once started.

**Outcome.** A single closed/blocked canary issue, a complete session log, and either a "go for production" sign-off or a list of follow-up issues for the framework.

---

## Phase 0 — Pre-flight checklist (15 min)

Run from your project root (a freshly `/setup`-ed project for the first test, then your real project once that passes).

### Environment

- [ ] **Bash ≥ 4.** Check: `bash --version`. macOS default is 3.2 — install with `brew install bash` and run scripts with `#!/usr/bin/env bash`. If you cannot upgrade, the canary will surface this in Phase 2.
- [ ] **`jq` installed.** Check: `jq --version`. Required for NDJSON validation and label parsing.
- [ ] **`gh` CLI installed and authenticated.** Check: `gh auth status`. The token needs `repo` scope on the project repository.
- [ ] **`claude` CLI installed.** Check: `claude --version`. The script invokes `claude -p "<prompt>"` for every iteration step.
- [ ] **Git identity configured.** Check: `git config user.email && git config user.name`. Ralph commits use this identity.
- [ ] **Working directory is clean.** `git status` shows no uncommitted changes; you do not want a half-edited file landing in the agent branch.

### Stormhelm scaffolding

- [ ] **`.claude/settings.json` registers `git-guardrails`.** Open the file and confirm a `PreToolUse` entry with `matcher: "Bash"` pointing at `$CLAUDE_PROJECT_DIR/.claude/hooks/git-guardrails.js`. If missing, re-run `/setup` — it writes that `PreToolUse` entry (see `skills/setup`, §113 hook wiring).
- [ ] **Hook is executable.** `ls -l .claude/hooks/git-guardrails.js` shows execute bits.
- [ ] **`ralph-local.sh` is executable.** `ls -l ralph-local.sh` (project root; `/setup` delivers it there beside `ralph-lib.sh`).
- [ ] **`ralph-lib.sh` is in the same directory** as `ralph-local.sh`.
- [ ] **`ralph-blocked-comment.md.tmpl` is in the same directory.**
- [ ] **`.planning/ralph-sessions/` directory exists** (or `.planning/` is writable so the script can create it).

### Project state

- [ ] **`docs/constitution.md` is ratified** (or at least the SLO and sensitive-paths sections are filled in — Ralph reads these via the reviewer agent).
- [ ] **`docs/CONTEXT.md` has the canary feature's vocabulary** (even one entry is fine for the canary).
- [ ] **A test runner exists.** `npm test` (or your stack's equivalent) succeeds on a clean checkout. Ralph will invoke `/run-acceptance` which delegates to this; if it does not exist the canary cannot pass.

### Sanity smoke

```bash
# Hook responds correctly
echo '{"tool_name":"Bash","tool_input":{"command":"git push --force"}}' \
  | node .claude/hooks/git-guardrails.js
echo "exit: $?"   # expect 2
```

```bash
# Lib sources cleanly
bash -c 'source ralph-lib.sh && type ralph_init_session'
# expect: "ralph_init_session is a function"
```

If any item fails → fix before continuing. Do not proceed with a half-installed Ralph.

---

## Phase 1 — Prepare the canary issue (15 min)

The canary must be **trivial and reversible**. The goal is to exercise the script end-to-end, not to ship business value.

### Choose the change

A good canary is:

- **One file**, ideally one function.
- **No external integrations** — no DB migration, no API change, no infra.
- **Reversible** — even if Ralph merges a bad PR, the impact is contained.

Example canaries (in order of preference):

1. Rename an internal helper function from `foo` to `fooHelper` across its callers (≤3 callers).
2. Add a missing JSDoc/docstring to a single exported function.
3. Convert a `function` declaration to an arrow function.
4. Replace a `let` with `const` where the value is never reassigned.

### Author the spec, scenarios, issue

This step uses the normal Day-Shift flow. Abbreviate where possible — this is the canary, not a real feature.

```bash
# In Claude Code, inside the project root:
claude

> /grill-me "rename helper function `formatDate` to `formatDateIso` in src/utils/date.ts and update its 2 callers"
# Answer the grilling questions briefly. 5-10 minutes max.

> /specify
# Output: docs/specs/canary-rename-format-date.md
> /to-scenarios
# Approve the .feature file in features/utils/canary-rename.feature
# Should contain a single scenario like:
#   Scenario: scn-canary-01 formatDate is renamed and callers updated
#     Given the file src/utils/date.ts exports formatDate
#     When I run the build
#     Then src/utils/date.ts exports formatDateIso instead
#     And no caller references formatDate
#     And all existing tests pass

> /to-issues
# Output: a single issue (#NNN) labeled:
#   ralph-ready
#   scenarios:scn-canary-01
#   budget:30k          ← KEY: explicitly low for canary
#   shift:afk
```

### Verify the issue contract

```bash
gh issue view NNN --json labels --jq '.labels[].name'
# Must contain all four: ralph-ready, scenarios:scn-canary-01, budget:30k, shift:afk
```

If `require-human-review` is present, the canary slot is wrong — pick a different change that does not touch sensitive paths.

---

## Phase 2 — Execute the canary (10-15 min, ATTENDED)

This phase is **attended** — you watch every step. Open three terminals.

### Terminal 1: run the script

```bash
cd <project-root>
git checkout main
git pull origin main

# Confirm clean slate
git status                # nothing to commit
git branch                # no leftover agent/* branches

# Run Ralph against the canary
./ralph-local.sh NNN 5
```

### Terminal 2: tail the session log

In a second terminal, the moment Ralph starts:

```bash
tail -f .planning/ralph-sessions/NNN-*.log | jq -c .
```

Each line should be one JSON object. Watch for:

- `ralph.session.started` — confirms init worked
- `ralph.contract.validated` — confirms label parsing worked
- `ralph.iteration.started` (with `iteration: 1`)
- `ralph.iteration.completed` (with `outcome: "green"`)
- `ralph.scenario.passed` (with `scenario: "scn-canary-01"`)
- `ralph.reviewer.invoked` then `ralph.reviewer.findings`
- `ralph.pr.opened`
- `ralph.session.ended` (with `status: "completed"`)

If you see `ralph.error.tool`, `ralph.api.rate_limited`, or `ralph.reviewer.retry`, those are not failures — they are diagnostic. Note them.

### Terminal 3: watch git + gh state

```bash
# In a third terminal, refresh every 30s
while true; do
  echo "── $(date +%T) ──"
  git -C <project-root> branch | grep agent/
  gh issue view NNN --json labels,comments --jq '.labels[].name + " | " + (.comments | length | tostring)' 2>/dev/null
  sleep 30
done
```

You should observe:

1. New branch `agent/feature-<slug>-NNN` appears within seconds.
2. Labels remain `ralph-ready, scenarios:..., budget:30k, shift:afk` throughout the loop.
3. On success: a draft PR appears in GitHub UI; comments count goes from 0 to 1+ if Ralph posts a comment (typically only on block).
4. On block: labels change to `ralph-blocked` (no `ralph-ready`); comments count increments by 1.

---

## Phase 3 — Validate the outcome (10 min)

### Path A — Success (Ralph opened a draft PR)

In the GitHub UI, open the draft PR. Verify:

- [ ] **PR is in draft state** (not ready-for-review).
- [ ] **PR body contains `**Iterations consumed:** X / 5`** (small number expected — 1-3 for canary).
- [ ] **PR body contains `**Scenarios satisfied:** scn-canary-01`**.
- [ ] **PR body contains `**Session log:**` path** to `.planning/ralph-sessions/...`.
- [ ] **PR body contains a `## Reviewer report` section** with severity (typically `suggestion` or `clean` for a canary).
- [ ] **The diff is exactly what you expected** — one file (or two if a test was updated), the rename or trivial change you specified.

Back in Terminal 1:

```bash
# Validate the NDJSON log
LOG=$(ls .planning/ralph-sessions/NNN-*.log)
jq -c '.event' "$LOG"      # every line should be a quoted string event name
jq -e 'select(.event == "ralph.session.ended" and .details.status == "completed")' "$LOG"
# If exit code 0, the success event is present.

# Token accounting (Slice 7)
jq -r 'select(.event == "ralph.budget.checkpoint") | .details.cumulative' "$LOG" | tail -1
# Should be > 0 if the claude CLI exposes token counts. If still 0, see
# RALPH_TOKEN_EXTRACTOR_CMD configuration in core/13-ralph-and-afk.md §70.
```

If all of the above are ✓ → **Path A complete. Do not merge the canary PR; close it.** (The branch and PR are evidence; merging would clutter `main` with a no-op change.)

### Path B — Ralph applied `ralph-blocked`

In GitHub UI, open the issue. Verify:

- [ ] **Labels are `ralph-blocked` (no `ralph-ready`)**.
- [ ] **A comment was posted** starting with `🛑 **Ralph blocked after N iterations**`.
- [ ] **The comment contains the reason** (one of: `max-iterations-exhausted`, `reviewer-blocking-after-retry-budget-exhausted`, `rate-limit-exhausted-during-<call>`, `budget-exceeded-during-<call>`).
- [ ] **The comment contains the scenario results** with the right markers (`✅ passed`, `🛑 failed`, `⚪ not attempted`).
- [ ] **The comment contains the last 5 actions from the log**, each with a timestamp.
- [ ] **The branch `agent/feature-<slug>-NNN` still exists locally** (`git branch | grep agent/`).

Then triage the reason:

| Reason | Likely cause | What it tells you |
|---|---|---|
| `max-iterations-exhausted` | Canary was harder than expected, or `/tdd` is bugged for this stack | Try the same canary manually first |
| `reviewer-blocking-...` | The reviewer agent rejected the diff | Read the reviewer report in the comment; if the finding is wrong, file a `reviewer` bug |
| `rate-limit-exhausted-...` | Your API key is over its rate limit | Wait, retry; if persistent, reduce parallel work |
| `budget-exceeded-...` | The canary consumed more than 30k tokens | Either the canary was wrong size, or token counting overshoots (file an issue) |

**Path B is not a failure of the canary — it is a failure of the canary as a Ralph-suitable task.** The canary's job is to surface the cause, not to ship the change. If the cause is clear and matches one of the four entries above, that is acceptable. Mark the canary "canary-passed-via-block" in your notes.

### Path C — The script crashed or exited unexpectedly

Read Terminal 1's stdout carefully and the session log. Common causes:

| Symptom | Action |
|---|---|
| "❌ Issue #N no existe o gh CLI no está autenticado" | Re-run `gh auth login` |
| "❌ ralph-lib.sh no encontrado" | Confirm `ralph-lib.sh` is present beside `ralph-local.sh` (both at project root; re-run `/setup` if missing) |
| "claude: command not found" inside iteration | Install/relink `claude` CLI |
| Bash syntax error / unexpected token | Bash version too old; install Bash ≥ 4 |
| Hook returned 2 on a non-destructive command (false positive) | Edit `hooks/git-guardrails.js` regex; file an issue |

After fixing the cause, re-run the canary from Phase 2.

---

## Phase 4 — Sign-off (5 min)

Open `.planning/dry-runs/ralph-first-overnight-canary-<YYYYMMDD>.md` and record:

```markdown
# Ralph First Overnight Canary — <YYYY-MM-DD>

**Operator:** <your name>
**Canary issue:** #NNN — <title>
**Outcome:** Path A | Path B (reason: …) | Path C (cause: …, fixed by: …)

## Pre-flight
All checklist items: ✓ / ✗ (which, why)

## Execution
- Iterations consumed: N
- Tokens consumed: M (or "unknown — token extractor not set")
- Wall-clock from start to ended event: HH:MM:SS

## Validations exercised (live)
- [ ] #1 claude CLI real interaction — observed: …
- [ ] #2 git-guardrails inside Claude Code session — observed: …
- [ ] #3 gh issue edit / comment / pr create with real token — observed: …
- [ ] #4 macOS / BSD date / Bash 3.2 compatibility — observed: …

## Issues to file (if any)
- …

## Sign-off decision
- [ ] GO for production (next: queue a real issue overnight)
- [ ] HOLD — list of fixes needed before next attempt
```

When Phase 4 records a GO decision → Ralph is approved for daily overnight use. Schedule the next sessions with confidence; revisit this runbook quarterly or after any change to the script or the underlying CLI tooling.

---

## Appendix — Kill switch

If anything goes wrong mid-session and you want to stop Ralph immediately:

```bash
# Find the PID
pgrep -f ralph-local.sh

# Kill it
pkill -f ralph-local.sh

# The branch will remain. To clean it up (human bypass for §68):
GIT_GUARDRAILS_DISABLE=1 git branch -D agent/feature-<slug>-NNN
```

Then manually update the issue:

```bash
gh issue edit NNN --remove-label ralph-ready --add-label ralph-blocked
gh issue comment NNN --body "Ralph session aborted by operator at $(date -u +%FT%TZ). Branch removed manually. See session log: .planning/ralph-sessions/NNN-*.log"
```

The session log is preserved automatically (the script does not delete it on signal).

---

## Appendix — When to re-run this runbook

Trigger a fresh canary whenever:

- The `claude` CLI version changes (new flags, new output format).
- The `gh` CLI version changes.
- `ralph-local.sh` or `ralph-lib.sh` change.
- The git-guardrails regex list changes.
- A new stack capability is activated (the patterns the reviewer expects shift).
- More than 30 days have passed since the last successful canary on this project.
