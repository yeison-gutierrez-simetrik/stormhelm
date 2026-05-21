---
name: diagnose
description: |
  Disciplined debugging loop: reproduce → minimise → hypothesise → instrument
  → fix → regression-test. The mechanical alternative to "I think the bug is
  here, let me try this." Used internally by /debug Step 2-4 but also
  invokable standalone for ad-hoc investigations. Adopted from Matt Pocock's
  /diagnose pattern.
  Use when: a bug is reported, a test fails unexpectedly, or behavior diverges
  from spec. For full bug-fix workflow with PR, use /debug. For pure
  investigation, use this skill.
---

# /diagnose — Root Cause Investigation Loop

## Purpose

Investigation is a discipline, not a feeling. `/diagnose` enforces the mechanical loop that distinguishes "I traced this back to its origin" from "I think it's somewhere in here."

The full loop:

1. **Reproduce** — make it fail deterministically.
2. **Minimise** — shrink the reproduction to the smallest failing case.
3. **Hypothesise** — generate a small set of plausible causes, ranked.
4. **Instrument** — add logging/breakpoints to verify or refute each hypothesis.
5. **Fix** — apply the minimum change that addresses the verified cause.
6. **Regression-test** — encode the bug as a test that fails without the fix and passes with it (§92).

`/debug` (the full bug workflow) uses this skill in its Steps 2-4. Use this skill standalone when you want investigation without the PR ceremony.

## When to invoke

- Inside `/debug` Steps 2-4 (automatic).
- Standalone for an ad-hoc investigation you don't yet want to formalize as a bug.
- When `/optimize` Step 2 needs to identify a perf bottleneck mechanically.

## When NOT to invoke

- For known bugs with obvious cause → straight to `/tdd` with regression test.
- For "I'm curious about this code" — that's reading, not diagnosis.

## Inputs

- Symptom description (what fails, how, when).
- Optionally: a failing test or stack trace.
- Optionally: a known-good commit or release.

## Outputs

- A diagnosis report saved to `.planning/diagnoses/<symptom-slug>-<YYYYMMDD>.md`.
- The minimal reproduction (test, command, or script).
- The root cause identified mechanically (not guessed).
- Optionally: a regression test ready to be applied.

## Workflow

### Step 1 — Reproduce

Try to make the symptom appear deterministically. Sub-tree by failure type:

- Wrong output → reproduce with a focused unit/integration test.
- Timing-dependent → add sleep, clock skew, stress.
- Environment-specific → reproduce in Docker matching prod.
- State-dependent → script the state buildup + trigger.
- Random/intermittent → seed the randomness or replay logs.

**Exit condition:** 10/10 runs reproduce the same failure.

If reproduction takes >2 hours with no progress → escalate, document what was tried, do NOT fabricate a fix.

### Step 2 — Minimise

Shrink the reproduction to the smallest case. Strip:

- Unrelated setup.
- Inputs not necessary to trigger.
- External dependencies replaceable by ports.

The minimal reproduction becomes the seed of the regression test (Step 6).

### Step 3 — Hypothesise

List 2-5 plausible causes, ranked by likelihood. For each, write:

- The mechanism: how would this cause produce the symptom?
- The test: what observation would confirm or refute it?

Example:

```markdown
## Hypotheses

### H1 (likely): clock injection removed in PR #88
**Mechanism:** isExpired uses new Date() instead of clock.now(); UTC drift bypasses check.
**Test:** revert clock injection locally; bug should disappear.

### H2 (possible): missing timezone normalization
**Mechanism:** quote.expiresAt stored as local; comparison fails across timezones.
**Test:** check if all expiresAt values are UTC in DB.

### H3 (unlikely): race condition between accept and expire jobs
**Mechanism:** acceptance and expiration both fire in same window; ordering matters.
**Test:** look for concurrent transactions in logs around the failure time.
```

### Step 4 — Instrument

Verify each hypothesis with the cheapest possible observation:

- Add temporary `console.log` / `logger.debug` at boundary points.
- Run the minimal reproduction.
- Read the output.
- Confirm or refute.

If H1 is confirmed → stop and proceed to Step 5. If H1 is refuted → try H2. If all hypotheses refuted → return to Step 3 with new evidence.

**Critical:** instrumentation is for **observation**, not for fix. Remove the instrumentation before committing.

### Step 5 — Fix

Apply the minimum change addressing the verified cause. Adheres to §93 (root cause over symptom):

- Reject "wrap in try/catch" type fixes.
- Reject "add a null check" that defers the problem.
- Reject "add setTimeout" that masks a race.
- The fix removes the cause; nothing more.

### Step 6 — Regression test

Encode the bug as a test:

1. The test fails on `main` (without the fix).
2. The test passes with the fix.
3. The §92 sequence verifies (Write→Pass→Revert→Fail→Restore→Pass).

The test is added to the appropriate suite (unit / integration / scn-NNN if user-visible).

## Output

```markdown
# Diagnosis — <symptom-slug>

**Date:** YYYY-MM-DD
**Symptom:** <one line>

## Reproduction
[exact command / test that triggers the symptom 10/10 times]

## Minimal repro
[shortest possible version]

## Hypotheses
[H1, H2, H3 with mechanism + test]

## Verified cause
[which H, confirmed by what observation]

## Fix
[the minimum change that addresses the cause]

## Regression test
[test that catches the bug if the fix is reverted]

## §92 verification
[Write→Pass→Revert→Fail→Restore→Pass log]
```

## Integration with the framework

- **Used internally by `/debug` Steps 2-4** (the full bug workflow wraps this).
- **Used internally by `/optimize` Step 2** for perf bottleneck identification.
- **Standalone invocation** is fine for investigations without the PR ceremony.

## Attribution

The reproduce→minimise→hypothesise→instrument→fix→regression-test loop is adapted from `/diagnose` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero), itself influenced by Brian Kernighan's debugging principles. MIT licensed.

## What this skill never does

- Apply a fix without verified hypothesis (§93 violation).
- Leave instrumentation in committed code.
- Treat correlation as causation.
- Skip Step 6 (regression test is the protection against recurrence).
