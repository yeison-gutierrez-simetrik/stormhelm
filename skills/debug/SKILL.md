---
name: debug
description: |
  Disciplined bug investigation and fix workflow for Stormhelm. Takes a bug report or
  failing test and walks through six mandatory steps: Reproduce, Localize, Reduce,
  Fix Root Cause, Guard (regression test), and Verify. Combines the best of the
  three most mature debugging skills from the open-source ecosystem (addyosmani,
  obra/superpowers, mattpocock) into a single coherent flow.
  Use when: a bug is reported, a test fails unexpectedly, production behavior diverges
  from spec, or a previously working feature breaks. Do NOT use for feature work
  (use /grill-me, /to-scenarios, /tdd for that).
---

# /debug — Disciplined Bug Investigation and Fix

## Purpose

`/debug` enforces the rules of `core/17-bug-handling.md` as an executable workflow. It guarantees that:

- Reproduction precedes diagnosis (§91).
- The regression test is written and verified to fail before the fix (§92).
- The fix addresses root cause, not symptom (§93).
- The PR contains only the bug fix (§94).
- Bisection is used when the introducing commit is unclear (§96).

## When to invoke

- An issue is labeled `severity:p0`, `severity:p1`, or `severity:p2`.
- A test fails on a branch you didn't expect to break.
- Production monitoring reports unexpected behavior.
- A user reports a defect via support.

## When NOT to invoke

- Feature work (use `/grill-me` → `/to-scenarios` → `/tdd`).
- Refactoring without bug (use `/improve-codebase-architecture`).
- Code review (use `/code-review`).
- Performance optimization that is not a regression (use a dedicated perf skill).

## Inputs

- An issue number (`#142`) or a description of the failure.
- For P0: the alert payload and timestamp.
- Optionally: a stack trace, log excerpt, or failing test name.

## Outputs

- A draft PR (always `--draft` per §67) on branch `agent/fix-issue-<NNN>` or `agent/legacy/issue-<NNN>` (per §75 if brownfield).
- A regression test (§92).
- A PR description containing: Reproduction, Root cause, Introduction (with bisect if used), Fix scope.
- For P0/user-facing P1: a postmortem stub in `docs/postmortems/` referencing `TEMPLATE.md`.

## Workflow — six mandatory steps

The agent **cannot skip steps**. Each step has an exit condition that must be met before advancing.

### Steps 1-3 — Delegate to `/diagnose`

For the investigation phase (reproduce → minimise → hypothesise → instrument → identify cause), `/debug` **invokes `/diagnose`** rather than reimplementing the loop. This avoids duplicating ~150 lines of investigation logic and keeps the discipline in one place.

```
Invoke /diagnose with:
  - symptom: the bug description
  - failing test or stack trace (if available)
  - branch context (the current working branch)

/diagnose returns:
  - .planning/diagnoses/<symptom-slug>-<YYYYMMDD>.md
  - the minimal reproduction (test, command, or script)
  - the verified root cause
  - a regression test ready to be applied
```

The output of `/diagnose` is the input to Step 4 (Fix). If `/diagnose` cannot identify the cause within its own escape hatch (2 hours, no progress), `/debug` marks the issue `cannot-reproduce` and stops — does not fabricate a fix.

### Step 1 — Reproduce *(§91)* — (handled by /diagnose Step 1)

> Adapted from `debugging-and-error-recovery` (addyosmani) and `systematic-debugging` Phase 1 (obra/superpowers).

Establish a deterministic, minimal reproduction of the bug on the current `main` branch.

**Sub-tree of investigation** (pick the relevant branch):

```
What does the bug look like?
├─ Wrong output / wrong state
│   └─ Reproduce with: unit test, integration test, or curl + DB snapshot
├─ Timing-dependent (intermittent)
│   └─ Reproduce with: artificial slowdown (sleep), clock skew, or stress test
├─ Environment-specific (works on dev, fails on prod)
│   └─ Reproduce with: Docker image matching prod env, or staging deploy
├─ State-dependent (fails after N operations)
│   └─ Reproduce with: scripted state buildup + final trigger
└─ Randomness-dependent
    └─ Reproduce with: seeded random or fixed input replay
```

**Exit condition for Step 1:**

- [ ] A command, test, or script reliably produces the bug (10/10 runs).
- [ ] The reproduction runs on a clean checkout of `main` with documented setup.
- [ ] Expected vs. actual behavior is documented.

If reproduction takes longer than 30 minutes and severity is P0, **stabilize first** (feature flag off, rollback) and continue reproduction in parallel. Document this decision.

If reproduction is impossible after 2 hours of investigation, **mark the issue `cannot-reproduce`** with a structured report and stop. Do not fabricate a fix.

### Step 2 — Localize *(layered search)*

> Adapted from `debugging-and-error-recovery` (addyosmani).

Identify the smallest set of files that contain the bug. Search by layer in order:

| Order | Layer | Tools / signals |
|---|---|---|
| 1 | UI / entrypoint | Stack trace, browser console, route handler |
| 2 | Application / use case | Logs (§77), use case Result codes (§19), `/diagnose` instrumentation |
| 3 | Domain | Pure-function tests, invariant violations |
| 4 | Infrastructure adapter | Repository queries, external client calls (§52 timeout, §53 concurrency) |
| 5 | Configuration / env | `process.env`, container/runtime differences (§55) |
| 6 | Dependency | `package.json` recent updates, deprecation warnings |

**Step 2b — Scan for similar patterns** *(extension; same scan, applied broadly)*:

After localizing the bug, search the codebase for the same anti-pattern in other places. Tools: `semgrep`, `ast-grep`, or `grep` with the pattern.

**Example output:**

```markdown
## Localization
Bug confirmed at: `src/application/use-cases/accept-quote.use-case.ts:34`
Layer: application
Root location: `isExpired` check uses `new Date()` instead of `clock.now()` (§25 violation).

## Similar patterns scan (Step 2b)
Found 4 other use cases that bypass `clock.now()`:
- src/application/use-cases/expire-listing.use-case.ts:34
- src/application/use-cases/cancel-sow.use-case.ts:21
- src/application/use-cases/refund-payment.use-case.ts:67
- src/application/use-cases/notify-overdue.use-case.ts:18

Tracked as separate follow-up issue (per §94 — one bug, one PR).
```

**Exit condition for Step 2:**

- [ ] The file(s) and approximate line(s) of the bug are identified.
- [ ] Similar patterns scan completed; follow-up issue opened if matches exist.

### Step 3 — Reduce

> Adapted from `debugging-and-error-recovery` (addyosmani).

Shrink the reproduction to the **smallest possible test** that still demonstrates the bug. This becomes the seed of the regression test.

- Strip unrelated setup, fixtures, mocks.
- Use the smallest input that triggers the failure.
- Remove dependencies on external services if possible (use the relevant port).

**Example:**

Before (full integration test):
```ts
// 80 lines of setup: user creation, company creation, listing creation, ...
test("provider can publish a listing", async () => {
  // ... 60 lines of HTTP setup
  // The actual bug is in 3 lines deep inside this test
});
```

After (reduced unit test):
```ts
test("isExpired returns true when quote.expiresAt < clock.now()", () => {
  const fakeClock = { now: () => new Date("2026-05-20T12:00:00Z") };
  const quote = { expiresAt: new Date("2026-05-20T11:59:59Z") };
  expect(isExpired(quote, fakeClock)).toBe(true);
});
```

**Exit condition for Step 3:**

- [ ] The reduced reproduction runs in <1 second.
- [ ] The reduced reproduction has no unrelated setup.
- [ ] Removing any further line stops triggering the bug.

### Step 4 — Fix Root Cause *(§93)*

> Adapted from `systematic-debugging` (obra/superpowers) — preserving the strict wording.

**ALWAYS find the root cause before attempting a fix. Symptom fixes are failure.**

Before writing the fix:

- [ ] Can you mechanically explain the chain of events from input to symptom?
- [ ] If you remove the proposed fix, does the bug return?
- [ ] If you apply the proposed fix elsewhere (without removing it here), does the bug stay fixed?
- [ ] Is the fix at the correct layer (per §3 hexagonal direction)?

If any answer is "I think so" or "probably," **return to Step 2 or 3**. You have not understood the bug.

Common symptom patches to refuse (see §93 for the full list):

- Adding `try/catch` to swallow the error.
- Adding null checks that defer the problem one layer.
- Adding `setTimeout` to "wait for it."
- Lowering test sensitivity.

The fix **never** includes:

- A refactor (§94, §76).
- A tangential improvement.
- A dependency upgrade unless the upgrade *is* the fix.

**Exit condition for Step 4:**

- [ ] The root cause is documented in the PR description (the `## Root cause` section).
- [ ] The fix changes only the cause, no other code.
- [ ] The fix passes the reduced test from Step 3 (Green).

### Step 5 — Guard *(§92 — regression test fails-first)*

> Adapted from `verification-before-completion` (obra/superpowers).

Prove that the test you wrote actually catches the bug. The full sequence:

```bash
# 1. Test is written, fix is applied — test should pass
pnpm test path/to/regression.test.ts
# Expected: PASS

# 2. Revert ONLY the fix, keep the test
git stash push -- src/application/use-cases/accept-quote.use-case.ts

# 3. Run the test — it MUST FAIL now
pnpm test path/to/regression.test.ts
# Expected: FAIL with the original bug symptom

# 4. Restore the fix
git stash pop

# 5. Run the test — it MUST PASS again
pnpm test path/to/regression.test.ts
# Expected: PASS
```

If step 3 doesn't FAIL — **the test does not actually catch the bug**. Return to Step 3 and tighten the test.

**Tag the test appropriately** in the `.feature` file (if user-facing):

```gherkin
@regression @scn-142
Scenario: Expired quote cannot be accepted (regression for #142)
  ...
```

**Exit condition for Step 5:**

- [ ] Write → Pass → Revert → Fail → Restore → Pass sequence completed.
- [ ] Test tagged `@regression` and given a `scn-NNN` ID if user-facing.
- [ ] Test runs in the `@smoke` set if the bug was P0/P1 (so it gates every push).

### Step 6 — Verify

Final integration check before opening the PR.

- [ ] All `@release` scenarios pass (`/run-acceptance`).
- [ ] `/code-review` audit complete; cited §N violations addressed.
- [ ] No floating promises (§51), no `any` introduced (§5), no `as` casts (§6).
- [ ] **No stub components introduced by the fix (§106)** — run the mechanical check from §106 over the touched frontend paths.
- [ ] If the bug touched sensitive domains (auth, payments, PII), `require-human-review` label applied (§64).
- [ ] If introduction was unclear, `git bisect run` log included in PR description (§96).
- [ ] If the issue carries label `incident:production` (set by `/triage`), a postmortem stub is created in `docs/postmortems/` and `/postmortem` is invoked to fill it (§95). **Severity alone (P0/P1/P2) does NOT trigger a postmortem** — only the production-incident label does. A P0 caught in staging requires no postmortem.

**Exit condition for Step 6:**

- [ ] `gh pr create --draft` opens the PR successfully.
- [ ] PR description follows the template below.

## PR description template

The PR opened at the end of Step 6 follows this structure:

```markdown
## Summary
Fixes #142 — Expired quotes were being accepted in production.

## Severity
P1 — user-facing, affected ~0.3% of quote acceptance attempts.

## Reproduction (§91)
[command, expected vs actual, environment, determinism check]

## Localization
- Primary file: src/application/use-cases/accept-quote.use-case.ts:34
- Layer: application
- Similar patterns scan: 4 other files (follow-up #143)

## Root cause (§93)
[mechanical explanation of cause → symptom chain]

## Introduction (§96)
Bisected to commit a3b9f12 (PR #88) — added the timezone drift.

## Fix scope (§94)
- src/application/use-cases/accept-quote.use-case.ts (3 lines)
- src/application/use-cases/__tests__/accept-quote.test.ts (regression test)
- features/quotes/quote-acceptance.feature (@regression @scn-142)

## Verification (§92)
Write-Pass-Revert-Fail-Restore-Pass sequence completed. Test confirmed to catch the bug.

## Postmortem
docs/postmortems/2026-05-20-quote-expiry-bypass.md (in progress, due 2026-05-30).
```

## Bisect helper

If Step 4 requires identifying the introducing commit and `git blame` is unclear:

```bash
# Create a reproduction script that exits 0 if bug ABSENT, non-zero if PRESENT
cat > /tmp/bisect-helper.sh <<'EOF'
#!/usr/bin/env bash
set -e
pnpm install --silent
pnpm test path/to/test.ts > /tmp/bisect-output 2>&1
if grep -q "Expected.*Received" /tmp/bisect-output; then exit 1; fi
exit 0
EOF
chmod +x /tmp/bisect-helper.sh

# Run automated bisect
git bisect start
git bisect bad HEAD
git bisect good v1.40.0
git bisect run /tmp/bisect-helper.sh
# git reports the first bad commit
git bisect reset
```

## Attribution

This skill is composed from prior art with light adaptations:

- **6-step flow + git bisect block** — adapted from `debugging-and-error-recovery` in [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). MIT licensed.
- **Step 5 Write-Pass-Revert-Fail-Restore-Pass** — adapted from `verification-before-completion` in [obra/superpowers](https://github.com/obra/superpowers). MIT licensed.
- **Step 4 root-cause discipline and wording** — adapted from `systematic-debugging` in [obra/superpowers](https://github.com/obra/superpowers). MIT licensed.
- **Bisect harness pattern** — adapted from `diagnose` in [mattpocock/skills](https://github.com/mattpocock/skills). MIT licensed.

Stormhelm did not invent this skill; it composed the best parts of existing open-source work and applies the rules (§91-§96) consistently.
