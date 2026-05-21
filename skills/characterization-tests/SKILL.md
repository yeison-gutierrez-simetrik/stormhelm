---
name: characterization-tests
description: |
  Generates tests that document CURRENT behavior of legacy code — including
  bugs and quirks — without judging or fixing. The safety net required by §71
  before modifying any legacy code with <50% coverage. Adopted from Michael
  Feathers' "Working Effectively with Legacy Code" pattern.
  Use when: B2 step of brownfield sub-flow, or any time you're about to modify
  legacy code without enough test coverage to detect regressions.
---

# /characterization-tests — Document Current Behavior

## Purpose

Legacy code's value is its **behavior in production**, not its design. Before changing it, you need a safety net that captures exactly what it does today — bugs included — so any change you make has a comparison point. Without characterization tests, every refactor is a leap of faith.

§71 says: if affected files have <50% coverage, characterization tests **must** land in a separate, prior commit before any behavior change. This skill produces those tests.

## When to invoke

- B2 step of brownfield sub-flow (`/feature` detects brownfield).
- Any time `/debug` Step 4 wants to fix a bug in low-coverage legacy.
- Proactively, as part of tech debt work, to build coverage on a known risky module.

## When NOT to invoke

- For greenfield code (write TDD tests, not characterization).
- For modules already at >50% coverage (existing tests are the safety net).
- To "improve" tests on already-tested code (that's refactor §102).

## Inputs

- The legacy file(s) to characterize.
- Coverage report (to confirm <50%).
- Optionally: production logs or behavior reports that hint at edge cases.

## Outputs

- Test files in the standard location: `src/legacy/<module>/__tests__/characterize.*.test.ts` (or equivalent for Python/Go).
- Tests named `char-NNN: <observation>` (unique IDs).
- A characterization report at `.planning/characterizations/<module>-<YYYYMMDD>.md` summarizing what was captured.

## Workflow

### Step 1 — Confirm coverage <50%

```bash
# TypeScript
$TEST_CMD --coverage --reporter=json --include "<path>" > /tmp/cov.json

# Python
pytest --cov="<path>" --cov-report=json > /tmp/cov.json
```

If coverage ≥ 50% → stop. Tell the user existing tests are sufficient (or insufficient differently — they need to identify gaps, not blanket characterize).

### Step 2 — Read the legacy code

Without changing anything:

- Identify all public entry points (exported functions, methods, endpoints).
- For each entry point, identify all input types it accepts.
- Identify all branches that change behavior.
- Identify all observable outputs (return values, side effects, exceptions).

### Step 3 — Write tests that exercise current behavior

**Rule of §72:** capture what the code does, even if it looks like a bug. Do not fix.

For each entry point:

```ts
describe("invoiceCalculator (characterization)", () => {
  test("char-001: returns 0 cents when invoice has no line items", () => {
    expect(invoiceCalculator({ lineItems: [] })).toBe(0);
  });

  test("char-002: rounds half to even (banker's rounding) for fractional cents", () => {
    expect(invoiceCalculator({ lineItems: [{ amountCents: 0.5 }] })).toBe(0);
  });

  test("char-003: returns NaN when amountCents is negative (legacy quirk — see issue #142 for planned fix)", () => {
    // Production has relied on this NaN as an invalid-invoice filter.
    // Do NOT fix here. Fix is tracked in #142.
    expect(invoiceCalculator({ lineItems: [{ amountCents: -100 }] })).toBeNaN();
  });
});
```

**Naming convention:** `char-NNN: <one-line observation>`. NNN is unique per file (restart at 001 per file is fine; the file path disambiguates).

**Comment on quirks:** when a test captures something that looks wrong, comment it explicitly with the linked issue tracking the planned fix.

### Step 4 — Cover the input space pragmatically

Don't aim for exhaustive coverage. Aim for **each observable branch** of the entry point exercised at least once. Heuristics:

- Each `if` branch: at least 1 test.
- Each enum/state: at least 1 test.
- Each error path: at least 1 test.
- Boundary values (0, negative, max, empty, null) for numeric and collection inputs.

### Step 5 — Run and confirm green

All characterization tests must pass on `main`. They document **current** behavior; if they fail on current behavior, they're wrong (you mis-characterized).

### Step 6 — Commit in isolation

```bash
git add src/legacy/<module>/__tests__/characterize.*.test.ts
git commit -m "test: characterization for <module> (coverage was <N>%, now <M>%)"
```

**Critical:** this commit contains **only** characterization tests. No fixes, no refactors, no implementation changes. §71 requires it in a prior commit before any behavior change.

### Step 7 — Write the characterization report

```markdown
# Characterization — <module>

**Date:** YYYY-MM-DD
**File(s):** src/legacy/<module>/*.ts
**Coverage:** was 23%, now 78% (after this PR)
**Tests added:** 14 (char-001 through char-014)

## Branches characterized
- All happy paths for `invoiceCalculator`
- All edge cases (0, negative, fractional, empty)
- All error paths

## Quirks captured (legacy behaviors that look like bugs)
- char-003: NaN return for negative amountCents (tracked in #142 for planned fix)
- char-009: silent truncation when lineItems.length > 1000 (tracked in #156)

## Next
The module is now safe to modify. Subsequent PRs can fix the quirks (each in a separate PR per §94) or refactor (per §102 — existing tests must pass unmodified).
```

## Integration with the framework

- **Invoked by B2 step of brownfield sub-flow** (`/feature` detects brownfield via paths analysis).
- **Pre-requisite for `/tdd`** when the issue is brownfield with <50% coverage on touched files.
- **Output consumed by**: subsequent `/tdd` cycles use these tests as the regression net.
- **Read by `reviewer` agent**: confirms §71 was honored when reviewing brownfield PRs.

## Attribution

The characterization pattern is from Michael Feathers' *Working Effectively with Legacy Code* (2004). The strict "no fixes during characterization" rule (§72) preserves the safety net's integrity.

## What this skill never does

- Fix bugs while characterizing (§72 — separate PR after).
- Refactor production code (§102 — refactor PR must keep characterization tests green unchanged).
- Skip the prior commit requirement (§71).
- Aim for >80% coverage exhaustively (pragmatic ≥50% suffices for the safety net).
