# 13 — Ralph & AFK Operations

**Scope.** How the autonomous Night Shift (Ralph) consumes work, what guardrails it respects, and what it never does without human review. These rules govern any agent running unattended against the codebase.

**When to read.** Configuring the local `ralph-local.sh` script, labeling issues for AFK execution, reviewing PRs produced overnight, debugging a stuck Ralph session, deciding which work is safe to automate.

**Rules in this file.** §63, §64, §65, §66, §67, §68, §69, §70, §107, §123

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
scenarios:scn-001+002+003
budget:150k
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

Shipped implementation (post-FOLLOW-UP 33): the §114 reviewer runs ONCE, **inside** `/run-acceptance` (its Step 8); the session writes the severity to the result file's `gates.reviewer` and the full report to `issue-<N>-reviewer.md`. The loop **reads** both — it never invokes `/code-review` itself (a result file without the field triggers a one-shot legacy fallback, event `ralph.reviewer.fallback_invocation`). `ralph_format_reviewer_section` produces a markdown section (with collapsible `<details>` wrapping for long reports) embedded in the PR body alongside iteration count, per-scenario outcomes and session log path. Log events: `ralph.reviewer.findings` (with `source: result-file | fallback-invocation`) and, on a green-with-blocking contract violation, `ralph.reviewer.retry`.

> **Gate-command bash convention (every skill, every unattended session):**
> never pipe a gate into formatting — `cmd | tail` swallows the exit code and
> a red gate reads as green (two live incidents in one day; inside an AFK
> session nobody is watching). Capture the rc explicitly
> (`out=$(cmd) || rc=$?`) or `set -o pipefail` first.

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
- **Expected-checks (FU-91):** the same `pre` run asserts the **green signal means present-and-passing, not absence-of-failure**. `mergeStateStatus=CLEAN` only reflects branch-protection *required* checks — a workflow that never registered for the branch (or is still pending) is invisible to it, so an auto-merge reading "no ❌" as green can merge a PR whose authoritative gate never ran. Declare the authoritative checks in `RALPH_EXPECTED_CHECKS` (env, comma-sep) or `.planning/expected-checks.json` (a JSON array, e.g. `["acceptance","SonarCloud"]`); the gate then fails on any **missing-expected** or **pending** check. Without a manifest it emits a loud advisory and (for back-compat) does not block — but the auto-merge path MUST declare one.
- **Post-merge:** `node scripts/check-merge-safety.mjs <pr> post` is the first action of `/feature` Step 13. It compares the merge commit's 2nd parent against the head GitHub recorded for the PR; if they differ, a commit was lost and recovery is needed.

The script is zero-deps, uses `gh` + `git` already required by the framework, and never touches state — pure read + assert. Skipping it is a §1 violation (proportionality: the cost is ~5 seconds; the consequence of skipping has been a half-day recovery in real use).

### Merge-train runbook for stacked slice-groups (FOLLOW-UP 53)

Merging a §123 chained slice-group has mechanics beyond merge ORDER, and two
of them destroyed a PR live:

1. **Assert state first** — `node scripts/check-merge-safety.mjs <pr> pre`
   (`MERGEABLE/CLEAN`, the existing lesson). Merge with a **merge commit**.
2. **RETARGET DEPENDENTS BEFORE DELETING THE BASE.** GitHub auto-retargets
   dependent PRs only when the head branch is deleted AS PART of its own
   PR's merge flow (the web button / merge-with-delete). A **manual**
   deletion (`git push origin --delete <branch>`) CLOSES every PR based on
   that branch. Recovery exists but is a strict 3-step dance (proven live —
   the order matters because `gh pr edit --base` refuses on a closed PR and
   `gh pr reopen` refuses while the base branch is missing):
   ```bash
   git push origin <merged-head-sha>:refs/heads/<base-branch>  # 1. restore
   gh pr reopen <N> && gh pr edit <N> --base main               # 2. per dependent
   git push origin --delete <base-branch>                       # 3. delete again
   ```
   Original review history and CI results survive. Prevention is still
   cheaper: per dependent, `gh pr list --base <branch>` →
   `gh pr edit <dep> --base <new-base>` → only THEN delete the branch.
3. **`--delete-branch` from a detached HEAD fails the LOCAL half** ("could
   not determine current branch") *after* the server-side merge succeeded —
   exactly the state `ralph-isolated` worktree operation leaves the main
   checkout in. Check the PR state before retrying anything; the merge
   likely landed.
4. `node scripts/check-merge-safety.mjs <pr> post <head-sha>` after each
   merge (full SHA).
5. **Phantom `CONFLICTING` after retarget — the double-merge-base trap
   (FOLLOW-UP 81).** A chained branch that merged `origin/main` MID-RUN (it
   needed a sibling's already-merged dependency — blessed, see §123 below)
   has TWO common ancestors with main once the sibling merges (a criss-cross).
   `git merge-ort` resolves multi-base via recursive virtual ancestors;
   GitHub's PR **test-merge does not** — the PR shows `CONFLICTING/DIRTY`
   stable across recomputes and `PUT /pulls/N/update-branch` returns **422
   "merge conflict between base and head"**, even though a LOCAL merge is
   conflict-free both directions. Signature = `CONFLICTING/DIRTY` + the 422 +
   a clean local merge-sim. Recovery: **merge `main` INTO the head branch (a
   merge commit, never a rebase) and push** — the state flips to `MERGEABLE`
   immediately. Prevention: before retargeting a stacked PR whose branch ever
   merged main, merge main into the head first. (A future train-merge.mjs
   could detect `git merge-base --all <head> main | wc -l > 1` and pre-merge —
   deferred; the runbook line is the cheap fix.)

(External confirmation: GitHub's retarget-on-merge changelog and cli/cli
#1168 document exactly the §2/§3 behaviors.)

**Use the tool, not bare gh (FOLLOW-UP 60).** Inside a slice-group train,
bare `gh pr merge --delete-branch` is **FORBIDDEN**: merging the train's
FIRST PR with that flag deletes the head that is the BASE of the stacked
siblings and GitHub closes them (second live incident of the class — the
first was manual deletion; the runbook alone was demonstrably
insufficient, which was precisely the activation criterion the original
DEFER recorded). Merge trains with:

```bash
node scripts/sonar-sweep.mjs <pr>   # post-PR QG + open-issues read-out
                                    # (FOLLOW-UP 65; --files locates clones;
                                    # exit 1 on QG ERROR — pipeable here)
node scripts/train-merge.mjs <pr>   # asserts CLEAN → retargets every open
                                    # dependent → merge commit + safe delete
                                    # → post-merge verify
```

The runbook above remains the WHY; the script is the HOW (the ecosystem
pattern — Graphite/ghstack/spr all mechanize stack merges).

### Post-PR analysis findings are owned by HUMAN CHECKPOINT 2 (FOLLOW-UP 47)

Server-side analyzers (SonarCloud Automatic Analysis and kin) post their
findings on the PR **minutes after Ralph's session has ended** — no engine
step, gate or skill reads them, and a passing Quality Gate raises no flag.
Without an owner those findings are orphaned by design (live: 7 findings
across one slice-group's PRs, two of them duplicated across sibling
branches). The contract:

- **Reviewing and dispositioning post-PR analyzer findings is part of HUMAN
  CHECKPOINT 2** — the human merger addresses, defers-with-comment, or
  dismisses each finding before merging; an unreviewed analyzer comment is
  an unfinished checkpoint.
- **Left-shift what you can:** `/setup` adds `eslint-plugin-sonarjs` to the
  consumer's lint config so the recurrent S-rule classes fail locally inside
  `/tdd` — the loop that CAN iterate — instead of post-PR where nobody does.
- **Duplication findings (FOLLOW-UP 55)** are resolved by extracting the
  clone, never by threshold changes. eslint cannot see this class
  (cross-file, diff-relative); `npx -y jscpd --min-tokens 70 <changed
  files>` locates Sonar's clones locally, and the engine runs it advisorily
  pre-PR. Stacked PRs re-evaluate density on retarget — expect QG flips
  with zero new commits; the answer is still extraction (or an explicit
  human disposition), never the threshold.
- **Coverage-on-new-code under Automatic Analysis reads 0.0% on every PR**
  (no CI test run → no lcov) and the gate passes anyway: reviewers must
  ignore that tile, or the consumer must switch to CI-scanner mode with
  `sonar.javascript.lcov.reportPaths` for real coverage numbers.
- A bounded post-PR feedback loop (poll checks N minutes after `pr create`,
  re-add `ralph-ready` on new findings) is a recorded, deliberately
  DEFERRED design — it costs wall-clock at the end of every green run;
  build it when checkpoint-2 discipline proves insufficient, not before.

---

## §123. Cumulative vs stacked PRs (branch convention)

A slice often decomposes into several issues that **share a foundation** (issue B can't be a green PR on `main` without the schema/adapter/wiring issue A introduces). Two independent decisions govern how they ship — keep them separate:

- **Axis 1 — cohesion (do they form a group?).** Issues connected in the dependency graph form a **slice-group** and ship together. `scripts/group-slice-issues.mjs` computes this from the graph `scripts/parse-layers-affected.mjs` extracts from `/plan` (same parser PR-M's module-count detector uses). A connected component of ≥2 issues is a group; singletons are standalone. The group **root** is the foundation (depends on nothing within the group) and is normally the `introduces-capability:*` issue.
- **Axis 2 — packaging (one PR or several?).** Within the review-size budget → **one cumulative branch `agent/feature-<slug>`** delivering all the group's issues with a `Closes #N` line each. Over budget → **stacked PRs** in topological order, with a documented merge order.

**Cumulative is the default; stacked is discouraged.** Stacked PRs are the root of the "fix landed on the wrong branch, lower PR ships a known defect" failure (a blocking finding can be committed on the top branch while the foundation PR still merges without it). Use stacked only when a cohesive group genuinely exceeds the review budget — and then **finding-attribution (PR-Attr) is mandatory**: a blocking finding must be fixed on the branch that owns the offending code, and `main` must never sit in the intermediate state where one stacked PR is merged without the fix. The old `agent/feature-<slug>-<issue-NNN>` per-issue convention is retired precisely because it forced stacking whenever a slice had dependent issues.

### Night Shift slice-groups: the deliberate stacked exception (FOLLOW-UP 38a, maintainer ruling 2026-06-04)

A Night Shift slice-group is the one place stacking is **sanctioned**: each Ralph run is one issue, sessions run AFK while humans sleep, and waiting for a human merge between siblings would serialize the night on the reviewer's bed-time (live: belong #19 and #21 both branched from `main` and conflicted on the shared wiring files — the second PR needed manual resolution). The chain model trades §123's default for nocturnal throughput, **under four mandatory conditions**:

1. **Merge commits only.** Squash-merging a base PR rewrites its commits and breaks every stacked diff above it. The engine's PR body states this; the merge guidance for chained PRs is merge-commit, base-first.
2. **The engine carries the base.** `ralph-local.sh --base <prev-branch>` (also accepted by `ralph-isolated.sh`, which starts the worktree at that ref) branches the slice FROM the previous sibling's branch and opens the PR **against** it (`gh pr create --base`). Merge order = chain order; GitHub retargets child PRs automatically when the base merges and its branch is deleted. A chained branch **may merge `origin/main` mid-run** when it needs a dependency that merged after the fork (merge commits only) — this is blessed, but it creates the double-merge-base trap on retarget; see the merge-train runbook point 5 (FOLLOW-UP 81) for the signature and recovery.
3. **Finding-attribution (PR-Attr) is mandatory** — unchanged from the stacked rule above: a blocking finding is fixed on the branch that owns the offending code, never on a branch stacked above it.
4. **Cascade procedure.** If the foundation changes post-review, each child refreshes with `git merge <prev-branch>` (in chain order) and re-gates. (Candidate for automation later; manual and documented for now.)
5. **Merge as a UNIT, in order (FOLLOW-UP 100, maintainer ruling 2026-06-17).** `/to-issues` stamps every chained member with `merge-unit:<slug>` + `chain-order:N`, and `train-merge.mjs` **refuses to merge a member out of order** — so `main` never holds a window where an intermediate state reads a not-yet-swapped dependency (live: slice-24's accept/reject read the OLD `findByQuoteRequestId` until the chain tip swapped it; the chain MUST land all-or-none, in order).

#### Stacked-chain reconciliation when `main` moves (FOLLOW-UP 100)

When an unrelated PR lands on `main` under an in-flight chain, do **not** `git merge origin/main` per branch: each independent merge commit diverges, so every human merge of one member re-conflicts the rest — O(chain²) re-fix churn. Instead rebase the **whole chain onto `main` as one unit**:

```bash
git rebase --onto origin/main <old-chain-base> <chain-tip-branch>   # one reconciliation
# then re-push each member (the chain's internal bases are preserved)
```

One operation, no per-branch merge commits, and the `merge-unit` order guard still holds. Some drift is inherent when an unrelated PR lands mid-chain — the framework minimizes it, it cannot eliminate it.

The launch pattern for a chained group, in topological order from `group-slice-issues.mjs`:

```bash
./ralph-isolated.sh 14                                  # foundation: branches from main
./ralph-isolated.sh 15 --base agent/feature-<slug14>-14 # chained on the foundation
./ralph-isolated.sh 16 --base agent/feature-<slug15>-15
```

`--base` takes a value valid as a **git start point** AND as a **`gh pr create
--base`** target. A remote-tracking ref like `origin/main` is fine for the
checkout but `gh` needs a branch NAME — the engine normalizes the gh argument
(strips a leading `origin/`) and **pre-flights the resolved base against
`origin` BEFORE iteration 1** (FOLLOW-UP 73): an unresolvable base fails up
front with an actionable message, never after the full spend at PR creation.
For a standalone slice, `--base main` or omit `--base`.

**Worktree provisioning (FOLLOW-UP 69).** A `ralph-isolated` worktree shares
`.git` but gets a FRESH working dir — the untracked runtime surface does not
come with it. The script provisions BOTH pieces the loop needs before handing
off: `.env` (copied; secrets for the env pre-flight + acceptance stack) AND
`node_modules` (**symlinked** from the primary checkout — `/tdd` runs vitest,
`/run-acceptance` runs cucumber-js, §60's pre-push smoke runs `pnpm
test:smoke`, every binary resolved from `node_modules/.bin`). Without the link
the first command in the worktree fails 127 (`cucumber-js: command not
found`). The symlink is read-only during a run so sharing is safe; if the
primary checkout has no `node_modules`, the script falls back to an install in
the worktree.

### Accumulate-and-drain: the dependency-aware queue (FOLLOW-UP 43)

The supported multi-slice pattern: the Day Shift specifies slices ahead
(`/specify → … → /to-issues` per slice), `ralph-ready` issues **accumulate**,
and one nightly `./ralph-local.sh` (no issue number — or `ralph-isolated`
per worker) **drains the backlog in dependency order**. Eligibility comes
from each issue body's `## Depends on` section (`/to-issues` writes it
structured precisely so automation can read it):

- **Default (merged-deps):** an issue is runnable ⟺ every dependency issue
  is `CLOSED` (its PR merged). A dependent whose foundation has a draft PR
  awaiting review **waits** — that pause *is* the `require-human-review`
  gate. Runnable issues execute ASC by number (foundations are created
  first by construction).
- **`RALPH_QUEUE_CHAINED=1` (opt-in):** a dependency that is OPEN but
  labeled `ralph-done` (draft PR delivered) also satisfies — the dependent
  launches `--base <the dependency's PR branch>`, i.e. this section's
  chaining exception applied automatically. Off by default: stacking
  unreviewed work is a per-night operator choice, never a silent one.
- Eligibility **re-evaluates after every completed item** (a foundation
  delivering mid-night unlocks its dependents in chained mode); whatever
  never becomes runnable is skipped **loudly** — one stdout line plus a
  `ralph.queue.skipped {issue, blocked_on, mode}` event in the queue-level
  NDJSON log (`queue-<ts>.log`) — and a mutual dependency pair is called
  out as a cycle by name. A dependency referencing a nonexistent issue is
  treated as blocked, never run. The night ends with a
  `ralph.queue.completed {processed, skipped, rc, mode}` event — the
  terminal signal `ralph-watch.sh --queue` exits on.
- **Branch hygiene between items (FOLLOW-UP 46a):** the queue records the
  night's start ref once; every NON-chained item is preceded by a detach
  back to it — a child run leaves HEAD on its own branch (shared
  worktree), and without the reset the next independent item would branch
  from a sibling's tip and ship its commits in the wrong PR. Chained items
  keep their explicit `--base`. No mid-night re-fetch: one consistent
  snapshot per night.
- **Dep-grammar contract (FOLLOW-UP 56):** `## Depends on` lists **same-repo
  ISSUE refs only** (`- #N`, one per line). Never cite PR numbers inside the
  section (annotate them elsewhere in the body — the engine warns when a ref
  resolves to a PR). **Cross-repo dependencies make the issue `shift:hitl`**:
  the human is the cross-repo gate (generalizing §63's capability rule —
  live, that coincidence silently absorbed the first bi-repo slice).
  Cross-repo grammar (`owner/repo#N` + remote state resolution) is
  deliberately DEFERRED until a second multi-repo consumer exists: it costs
  remote API calls per eligibility pass and a §63 claim story.
- **One queue worker per repo (FOLLOW-UP 46c):** nothing claims an issue
  for a worker, so two concurrent queue workers would double-process the
  same `ralph-ready` set. Run ONE queue per repo; parallelism is explicit
  per-issue `ralph-isolated` launches. (If multi-worker queues are ever
  actually needed, the designed fix is a `ralph-claimed:<worker>` label
  applied before processing and cleared after — build it then, not
  speculatively.)
- **Sibling-divergence reconciliation (FOLLOW-UP 61):** a Day-Shift push to
  dep branch A after sibling B already chained from A's older tip makes the
  integration-base merge CONFLICT — the queue skips the issue (correctly:
  building on one side would hide a real divergence) and the
  `ralph.queue.skipped` event names the branches and files. The recipe:
  **merge the advanced dep tip INTO the diverged sibling** (newest into
  oldest, topological order), resolve keeping both sides' intent, push,
  relaunch the skipped issue (single-issue mode rebuilds the base clean).
  An auto-reconcile attempt (skip only on REAL conflict after a trial
  merge) is deliberately DEFERRED until a third incident shows the manual
  recipe is toil.
- **Watching the night:** `./ralph-watch.sh --queue [root]` follows the
  whole queue — it rebinds to the newest session log regardless of issue,
  surfaces `queue.skipped` reasons as notifications, treats a CHILD's
  `session.ended` as informational (not terminal), and exits on
  `queue.completed`.

---

## §68. Ralph respects `git-guardrails`: destructive Git operations are blocked at the tool level

Stormhelm ships its own `hooks/git-guardrails.cjs` (zero-dependency Node script) as a `PreToolUse(Bash)` hook that blocks dangerous Git commands. **Installation is mandatory** for any environment where Ralph runs. See `hooks/README.md` for the full behavior contract and installation snippet.

### Blocked operations

- `git push --force` / `git push -f` to **any** branch; `git push --force-with-lease` to a **protected** branch
- `git reset --hard <ref>`
- `git clean -fdx`, `git clean -fd`
- `git branch -D <name>`
- `git tag -d <name>` (for tags pointing to commits that exist on remote)
- `rm -rf .git`, `find -name .git -exec rm`, anything pattern-matching repo destruction

### Allowed operations

- `git add`, `git commit`, `git push` (without force), `git pull`
- **`git push --force-with-lease` to a NON-protected branch (ISSUE #140)** — the legitimate post-rebase update of an `agent/*`/feature branch when a sibling migration/PR lands. The target must be explicit (`origin HEAD:agent/issue-x`); bare `-f`/`--force` and any force to a protected branch stay blocked.
- `git checkout -b <new-branch>` (only forward, not destructive)
- `git stash`, `git stash pop`
- `git rebase` interactive on local-only branches (not yet pushed)

### Branch-aware force-push (ISSUE #140)

The original guard blocked **all** force-push and documented a
`GIT_GUARDRAILS_DISABLE=1 <cmd>` bypass — but that bypass is **mechanically
unreachable** from an agent's Bash tool call: the harness runs the hook as a
*sibling* of the command, so an inline env prefix sets the variable only for the
child `git`, never for the hook process. The result was that any legitimate
post-rebase push was un-completable by an agent without a destructive edit to
vendored `.claude/settings.json`. The fix is a **structured branch policy** in
place of the prose bypass: `--force-with-lease` (the lease-checked safe form) to
a non-protected branch is allowed; bare `-f`/`--force`, and any force to
`main`/`master`/`develop` (extend via `GIT_GUARDRAILS_PROTECTED_BRANCHES`), stay
blocked. The env bypass remains for **human** cleanup but must be set on the
**hook** command in `settings.json` (read in the hook's own process), never
inline.

### Matching scope (FOLLOW-UP 68)

The guard matches §68 patterns against the command at **command position**,
with **heredoc payloads stripped first**. Prose that merely NAMES a blocked
operation — quoted inside a `<<EOF … EOF` body — is **not** blocked: the
framework prescribes exactly such writing (filing FOLLOW-UPs, postmortems
§95, runbooks, ADRs quoting this very list), and `cat >> doc << EOF … EOF`
appends data, not git commands. A real destructive command is still caught
everywhere it can execute — on its own line, after `&&`/`||`/`|`/`;`, or
**before** a heredoc opener (`git reset --hard && cat <<EOF…`).

**Residual gap, stated honestly:** a heredoc body piped straight into an
interpreter (`bash <<EOF … git push --force … EOF`) is NOT inspected by this
hook — the body is data to *this* command. That inner execution is the
harness's to guard (the interpreter's own Bash invocation re-enters the hook
only if it runs through the tool layer). Smuggling a destructive op this way
is a deliberate, conspicuous construction — not the accidental false positive
this scoping fixes.

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

The `budget:NNk` label on each issue declares a token ceiling for the Ralph session. **Calibration is `budget ≈ expected_iterations × 80k` (floor 150k), with a HEAVY-SLICE MULTIPLIER (FOLLOW-UP 75): a new bounded context, a `require-human-review` slice (crypto/auth/payments), or >15 scenarios runs 120–220k per iteration → use `× 150k`, 400k–500k buckets.** Two live sessions died `budget_exceeded` with the work already green (307k/300k, 267k/250k), losing only the cheap recording + PR steps. The full table lives in `/to-issues` Step 4 (one source; keep both in sync). Enforcement lives in `ralph-lib.sh` via three helpers:

- `ralph_parse_budget_label` converts `50k` / `120k` / `2m` / `50000` to an integer token count.
- `ralph_extract_tokens_from_output` is a best-effort extractor that recognizes JSON `usage.input_tokens + usage.output_tokens` (modern `claude --output-format json`), text patterns like `Total tokens: N` and `N input tokens, M output tokens`, plus a user-supplied extractor via the `RALPH_TOKEN_EXTRACTOR_CMD` env var.
- `ralph_check_budget` returns non-zero when `RALPH_TOKENS_CUMULATIVE > budget`.

The loop invokes `claude -p … --output-format json` so the result envelope carries real usage data (plain-text output has none — accounting would read 0 forever and the budget gate would never engage). The session text handed to transcript consumers is the envelope's `.result`. Because each invocation runs inside a `$(…)` command substitution (a subshell), per-call usage is appended to a session-scoped `.tokens` ledger file and folded into the parent's cumulative by `ralph_sync_tokens` before every budget decision — a subshell cannot update the parent's counters directly.

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

---

## Appendix: Autonomous planning (auto-pilot) mode — opt-in, §58-preserving (FOLLOW-UP 80)

A consumer may run the Day-Shift planning pipeline (`/specify → /clarify →
/grill-me → /to-scenarios → /plan → /to-issues`) **autonomously** — the agent
self-answers the clarify/grilling rounds and writes scenarios — for slices
where interactive 20-question rounds are not worth the latency. This is a
**recognized, opt-in deviation**, not a relaxation of the framework's gates.

**§58 is NOT relaxed.** Human approval of `.feature` files remains the
framework **default** (§58, §87 threat-model ratification). Auto-pilot does
not make agent-approved features a first-class capability; it is a deliberate
per-consumer choice whose safety rests entirely on the **compensating
control** below. A consumer adopting it owns that trade-off.

**The compensating control: a per-slice decision log.** Auto-pilot is only
sound when every self-answered decision is auditable AFTER the fact. The
consumer writes `docs/decisions/auto-clarify/<slice>-decisions.md` with one
entry per self-answered question:

| Field | Content |
|---|---|
| Question | the clarify/grilling question the agent answered for itself |
| Options | the alternatives considered (as a human round would surface) |
| Chosen + rationale | the decision and why |
| **Industry reference** | the external standard the choice leans on (app-store guidelines / AWS-GCP docs / a leading spec) — the operator's rule: no self-answer without a citable precedent |
| Confidence | how sure the agent is (low/med/high) |
| Reversibility | how cheaply the decision can be undone if wrong |
| ☐ Audit | a checkbox the human ticks when reviewing post-hoc |

Doc supersessions and any deviation from the standard flow are flagged at the
top of the log first.

**Why this is safe enough to document (but not to default).** In the belong
pilot, two slices reached draft PRs with zero pre-PR human checkpoints, and
the **non-human gates held**: the §114 reviewer caught a constitution
violation (`zod` in the domain layer) that originated in the auto-pilot's own
generated plan. The autonomous planner DOES err — which is exactly why §58's
human checkpoint stays the default and the reviewer + invariants remain
mandatory. The decision log + the reviewer + the invariants are the layered
control that makes the post-hoc audit trustworthy; remove any one and
auto-pilot is not sound.

**Metric.** The operator tracks the **override rate** — how often the post-hoc
audit overturns a self-answered decision. A rising override rate is the signal
to drop back to interactive rounds for that slice class.

**Compliance posture.** Under a compliance regime (SOC2/ISO/EU-AI-Act, §62),
auto-pilot's post-hoc audit checkboxes are the record, but the human ratifies
sensitive (`require-human-review`) slices at the **implementation-PR** review
at the latest — never auto-merged. The mode never bypasses §64's draft-PR /
human-merge requirement for sensitive domains.
