# 17 — Bug Handling

**Scope.** How bugs are reproduced, analyzed, fixed, and learned from. Distinct from feature work because the bug is the spec — reproduction comes before specification, root cause comes before patches, and regression tests come before fixes.

**When to read.** A bug is reported, discovered during development, or fired off a production alert; deciding whether a fix needs a postmortem; choosing severity for an incoming issue; reviewing a bug-fix PR.

**Rules in this file.** §91, §92, §93, §94, §95, §96

> See `../AGENTS.md` for the full rule index. Related: `08-testability.md` (§29 testing through public boundaries), `14-brownfield.md` (§71 characterization tests for legacy code without coverage), `15-observability.md` (§77-§78 logs as evidence), `13-ralph-and-afk.md` (§64 sensitive domains require human review).

---

## Severity matrix (P0 / P1 / P2)

Before any other rule applies, classify the bug. Severity determines workflow, SLA, and whether a postmortem is mandatory (§95).

| Severity | Definition | Response time | Workflow | Postmortem (§95) |
|---|---|---|---|---|
| **P0** | Production incident: data loss, security breach, system-wide outage, payments broken | Immediate; pages on-call | Hotfix flow: reproduce → minimal fix → ship → regression test added retroactively → mandatory postmortem | **Required** within 5 business days |
| **P1** | Bug affecting users in production, not catastrophic; reported by support, QA, or monitoring | Within 1-2 business days | Full `/debug` workflow (6 steps) | **Required** if user-facing or affects >1% of traffic |
| **P2** | Bug found internally during development; bug in non-critical path; cosmetic issue | When the team picks it up | Full `/debug` workflow, no fast track | Not required; optional learning notes |

The severity is set on the issue at triage time and lives as a GitHub label: `severity:p0`, `severity:p1`, `severity:p2`.

### Promotion rules

- A P2 that turns out to affect production is **re-classified as P1 or P0 immediately** when discovered. The original severity is preserved in the issue history.
- A P0 cannot be "downgraded" after resolution — the postmortem requirement stands.

---

## §91. Reproduce before diagnose

No fix is permitted until the bug has been reproduced in a deterministic, minimal form. "Reproduction" means a command, test, or interaction sequence that fails on `main` and would fail again on a clean checkout.

This rule is adopted from `debugging-and-error-recovery` (addyosmani/agent-skills, Step 1) and `systematic-debugging` Phase 1 (obra/superpowers).

### Why

- A bug that cannot be reproduced cannot be verified as fixed.
- "I think it's because of X" without reproduction is hypothesis, not diagnosis.
- The reproduction itself becomes the first artifact of the fix and seeds the regression test (§92).

### Required output of reproduction

```markdown
## Reproduction — Issue #142

**Command / steps:**
```
git checkout main
pnpm install
pnpm test:integration --test "accept expired quote returns success"
```

**Expected behavior:** Acceptance returns `{ ok: false, code: "QUOTE_EXPIRED" }`
**Actual behavior:** Acceptance returns `{ ok: true, sowId: "..." }`

**Environment where reproduced:** macOS 14.5, Node 22.6, `main` branch at commit a3b9f12
**Reproduction is deterministic:** ✅ Yes (10/10 runs fail identically)
```

### Allowed exceptions

For P0 incidents where reproduction is taking time and customers are affected, a **mitigation** (feature flag off, rollback, traffic shed) is acceptable while reproduction continues in parallel. The fix itself still requires reproduction before merging.

### Bad

```markdown
## Issue #142
Bug: quotes are not expiring correctly. Try to fix this.
```

No reproduction. Triggers `ralph-blocked` (see §63 + §66) and gets routed back to triage.

---

## §92. Regression test fails-first; the test is written before the fix

The test that captures the bug **must fail on `main` before the fix is applied**. After the fix is applied, it must pass. To verify the test actually captures the bug, revert the fix; the test must fail again.

This rule is adopted from `verification-before-completion` (obra/superpowers).

### Required sequence

```bash
# 1. Write the regression test
git checkout -b agent/fix-issue-142
$EDITOR src/.../quote-acceptance.test.ts

# 2. Run the test — it MUST FAIL on main behavior
pnpm test src/.../quote-acceptance.test.ts
# Expected: FAIL with the bug symptom

# 3. Apply the fix
$EDITOR src/.../accept-quote.use-case.ts

# 4. Run the test — it MUST PASS now
pnpm test src/.../quote-acceptance.test.ts
# Expected: PASS

# 5. Revert the fix to verify the test actually catches the bug
git stash push -- src/.../accept-quote.use-case.ts
pnpm test src/.../quote-acceptance.test.ts
# Expected: FAIL again

# 6. Restore the fix
git stash pop
pnpm test src/.../quote-acceptance.test.ts
# Expected: PASS
```

### Tagging in `.feature` files

If the bug has user-visible behavior, the regression scenario goes in the corresponding `.feature` file tagged `@regression @scn-NNN`:

```gherkin
@regression @scn-142
Scenario: Expired quote cannot be accepted (regression for #142)
  Given a Quote that expired 10 minutes ago
  When the Customer attempts to accept it
  Then the operation fails with code "QUOTE_EXPIRED"
```

Regression scenarios are added to the gate (`@release`) only after the fix lands and a brief soak.

### Why

- A test that doesn't fail without the fix is a test that doesn't catch the bug.
- The full Write-Pass-Revert-Fail-Restore-Pass cycle is the only proof that the test actually guards the regression.
- Future PRs that re-introduce the bug will be blocked by this test — that is the entire point.

### Bad

```ts
// Fix applied first, test added after to "document" it
test("expired quote returns error", () => {
  // This test was added after the fix; it passes from the start.
  // Nothing proves it would have caught the original bug.
  expect(result.code).toBe("QUOTE_EXPIRED");
});
```

---

## §93. Root cause over symptom; symptom fixes are failure

A fix that addresses what the user sees without addressing why it happens is not a fix. The bug will return, in a different form, in a different module, eventually.

This rule is adopted from `systematic-debugging` (obra/superpowers), preserving its strict wording.

### What counts as root cause

- The cause is **mechanically explained**: a clear chain of events from input to symptom.
- The cause is **verifiable**: changing it changes the behavior; not changing it keeps the bug.
- The cause is **at the right layer**: if the bug is in domain logic, fixing it in the UI is a symptom patch.

### Common symptom patches (forbidden as the sole fix)

| Symptom patch | Root cause that was avoided |
|---|---|
| Adding `try/catch` to swallow a runtime error | The error was actually a contract violation |
| Adding `if (x === undefined) return early` | A required value is missing because of an earlier bug |
| Adding a `setTimeout` to "wait for it to load" | A race condition that needs proper synchronization |
| Adding a dedupe in the UI list | A duplicate is being created by the backend |
| Adding `.toString()` to coerce | A type system violation that should be modeled (§5, §20) |
| Reducing test sensitivity to make it pass | The behavior is broken; the test is correct |

### When a symptom patch is acceptable

For **P0 incidents only**, a symptom mitigation may ship to stop the bleeding (feature flag off, rollback, request throttle). The root cause fix is then tracked as a follow-up issue with severity bumped to P1, and the postmortem documents both.

### Required artifact

The PR description includes a `## Root cause` section:

```markdown
## Root cause

The `isExpired` check in `accept-quote.use-case.ts:34` calls `new Date()` instead
of the injected `clock.now()` port.

**Chain of events:**
1. PR #88 (March 10) removed the clock injection as "unnecessary indirection."
2. Tests passed because they also used `new Date()` directly (not a fake clock).
3. In production, the server timezone (UTC) drifted by 0-5 minutes from the
   client-sent `expiresAt` timestamps due to NTP behavior under load.
4. Quotes within that drift window passed the expiry check incorrectly.

**Verification:**
- Reverting the clock injection in `accept-quote.use-case.ts` resolves the bug
  (verified locally and in staging).
- The drift was reproduced by manually skewing the system clock by 3 minutes.
```

### Why

- Symptoms are observable; causes are explanatory. Only the latter prevents recurrence.
- Codifies a cultural norm: investigation is the work, not the obstacle to the work.
- Aligns with §72 (characterization documents current behavior; root cause explains it).

---

## §94. One bug, one PR

A bug fix PR contains:

- The regression test (§92).
- The root cause fix.
- Documentation/changelog if the bug was user-visible.

It does **not** contain:

- Refactors (those go in a separate PR per §76).
- Tangentially related fixes ("while I'm here, this other thing looks weird").
- Cleanups of code style.
- Updates to dependencies unless the dep update *is* the fix.

### Why

This is an extension of §76 (refactor vs behavior change). When a bug is fixed, the diff should be **the smallest possible change that captures the bug + fixes the cause**. A 5-line fix and a 200-line refactor in the same PR makes the bisect of any future regression a nightmare.

### Exception

If the root cause is the structure of the code (e.g., a missing injection seam makes the bug literally impossible to fix without restructuring), the restructuring PR comes **first**, ships separately, then the fix PR follows. This keeps the bisect clean and the review focused.

---

## §95. Postmortem is mandatory for bugs that reached production with user impact

The trigger is the `incident:production` label (set by `/triage`), NOT severity alone. A P0 caught in staging before deploy does NOT require a postmortem — the framework rewards catching things early rather than penalizing the catch with paperwork. The combination required:

| Severity | `incident:production` label | Postmortem |
|---|---|---|
| P0 | yes | **Mandatory** within 5 business days |
| P1 | yes (user-facing in production) | **Mandatory** within 10 business days |
| P0/P1 | no (caught in staging or internal-only) | Not required; optional learning notes |
| P2 | yes or no | Not required |
| Near-miss | yes | Optional but encouraged for repeated patterns |

The original §95 wording "P0 and user-facing P1 bugs" is preserved below for backward reference, but the operational gate is the `incident:production` label.

A postmortem is a structured document that captures:

- What happened, when, and to whom.
- Why it happened (root cause, contributing factors).
- How it was detected and how long that took.
- What the response looked like, blow by blow.
- What we learned.
- What action items follow (with owners and due dates).

### Location and retention

```
docs/postmortems/
├── TEMPLATE.md                                # blank template
├── 2026-05-15-quote-expiry-bypass.md          # one file per incident
└── 2026-06-02-payment-double-charge.md
```

- Naming: `<YYYY-MM-DD>-<short-slug>.md`. Date is the **detection** date.
- Retention: minimum 7 years for production incidents (compliance requirement).
- Linked from the corresponding GitHub issue and from `docs/audit/incidents.md` (auto-generated index).

### Blameless principle

Postmortems describe **systems**, not **people**. Use:

- *"The deployment process did not require a smoke test against staging"*
- *"The validation skipped expired-quote cases"*

Not:

- *"Yei pushed without testing"*
- *"The reviewer missed it"*

The goal is to find and fix the gaps in the system that allowed any reasonable engineer to make that mistake.

### When is a postmortem mandatory

| Trigger | Postmortem required? |
|---|---|
| P0 incident (any) | ✅ Yes — within 5 business days |
| P1 user-facing bug | ✅ Yes — within 10 business days |
| P1 internal-facing bug (e.g., dashboard for ops) | Optional but encouraged |
| P2 found during development | Not required; learning notes optional |
| Near-miss (caught in staging, didn't reach production) | Optional but encouraged for repeated patterns |

### Why

- Without structured reflection, the same incident recurs.
- The action items become the audit trail of organizational learning.
- Compliance regulators (SOC2, ISO 27001, EU AI Act) require this artifact for systems handling regulated data.

The template lives at `docs/postmortems/TEMPLATE.md`. Copy it, fill it in, link from the issue.

---

## §96. When the introduction is unclear, bisect; do not guess

If `git blame` does not immediately identify the change that introduced the bug, or if the affected line has been modified many times and the actual broken commit is unclear, run `git bisect`. Do not guess.

This rule is adopted from `debugging-and-error-recovery` (addyosmani) and `diagnose` (mattpocock/skills).

### When to bisect

- The bug exists today but didn't exist last week (or last release).
- The affected file has 10+ recent commits and any could be responsible.
- The bug appears intermittently and "last known good" is fuzzy.
- A performance regression's introduction point is not obvious from logs.

### Automated form

`git bisect run` with a reproduction script is preferred over interactive bisection. The script returns 0 if the bug is **not present** at the current commit, non-zero if it is.

```bash
# bisect-helper.sh
#!/usr/bin/env bash
set -e
pnpm install --silent
pnpm test:integration --test "accept expired quote returns success" \
  > /tmp/bisect-output 2>&1
if grep -q "Expected.*QUOTE_EXPIRED.*Received.*ok: true" /tmp/bisect-output; then
  exit 1  # bug present
else
  exit 0  # bug absent
fi
```

```bash
git bisect start
git bisect bad HEAD
git bisect good v1.40.0           # last known good release
git bisect run ./bisect-helper.sh
# git bisect reports the first bad commit; reset when done
git bisect reset
```

### Required output in the PR

When bisect was used, the PR description includes:

```markdown
## Introduction
Bisected to commit `a3b9f12` (PR #88, March 10, 2026) by @user.
Bisect log:
- v1.40.0 (good)
- c1d2e3f (good)
- a3b9f12 (bad) ← first bad commit
```

### When NOT to bisect

- `git blame` cleanly points to the introducing commit on the first try.
- The bug was introduced today and the introducing PR is obvious from the recent log.
- The bug has existed since the file was created (greenfield bug, never worked).

### Why

- Manual hypothesizing about which commit broke things is slower and less reliable than `git bisect` for any non-trivial history.
- The bisect log itself becomes evidence in the postmortem (§95): how long the bug was in production, who reviewed the introducing PR, how it slipped through.

---

## Workflow summary

```
P0 (production incident, paging)
├─ Stabilize: feature flag, rollback, throttle    (mitigation, not fix)
├─ /debug (skills/debug/SKILL.md)                  (full 6 steps)
├─ §92 Regression test fails-first
├─ §93 Root cause documented
├─ §94 Fix only (no refactor)
├─ Merge fast-track (still human-approved)
└─ §95 Postmortem within 5 business days

P1 (user-facing or significant)
├─ /debug
├─ §91-§94 apply
├─ §96 bisect if introduction unclear
├─ Merge through normal review
└─ §95 Postmortem within 10 business days if user-facing

P2 (development-discovered or cosmetic)
├─ /debug (still required)
├─ §91-§94 apply
└─ §95 postmortem optional
```

## Attribution

The rules and the `/debug` skill that operationalizes them are composed from prior art rather than invented:

- §91, §96 and the 6-step structure of `/debug`: adapted from **`debugging-and-error-recovery`** in [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills).
- §92 Write-Pass-Revert-Fail-Restore-Pass cycle: adapted from **`verification-before-completion`** in [obra/superpowers](https://github.com/obra/superpowers).
- §93 root-cause discipline and wording: adapted from **`systematic-debugging`** in [obra/superpowers](https://github.com/obra/superpowers).
- §96 automated bisect harness: adapted from **`diagnose`** in [mattpocock/skills](https://github.com/mattpocock/skills).
- §94, §95 and the P0/P1/P2 severity matrix: composed from observed industry practice; no single source.
