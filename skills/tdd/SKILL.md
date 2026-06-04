---
name: tdd
description: |
  Strict red-green-refactor cycle for implementing an issue. Tests fail first
  (Red), implementation makes them pass minimally (Green), code is improved
  without changing behavior (Refactor). Combines AI Hero TDD discipline with
  Superpowers' "tests must fail first" enforcement (§92). Use one /tdd
  invocation per issue (or per file change in §107 mode).
  Use when: an issue is ready with a plan from /plan. Step 10 of /feature.
  Also invoked by /debug Step 4 (fix root cause) and /optimize Step 3 (fix
  perf bottleneck).
---

# /tdd — Red-Green-Refactor

## Purpose

TDD is the only reliable way to produce code that matches the spec without drift. The discipline is mechanical:

1. **Red** — write a test that fails because the behavior does not exist yet. If the test passes immediately, the test is wrong or the behavior already exists.
2. **Green** — write the minimum code that makes the test pass. No extra features, no anticipation of next requirements.
3. **Refactor** — improve structure of code AND tests without changing observable behavior. Run tests after every refactor.

`/tdd` does this for one issue per invocation. The cycle repeats until every scenario in the issue's `scn-NNN` labels passes.

## When to invoke

- An issue is `ralph-ready` with a plan attached.
- Step 10 of `/feature`.
- After `/debug` Step 4 to apply the bug fix.
- After `/optimize` Step 3 to apply the perf fix.

## When NOT to invoke

- For exploratory prototyping → `/prototype` (uses throwaway code).
- For pure refactors → §102 (existing tests must already cover; no Red phase).
- When the plan is missing or the issue has no `scn-NNN` labels.

## Inputs

- The issue (from `/to-issues`) with its plan (from `/plan`). **Read the FULL
  issue — body AND comments:**

  ```bash
  gh issue view <N>                # title, labels, body
  gh issue view <N> --comments     # the comment thread — NOT included above
  ```

  `/plan` may post the plan — and any **mid-flight amendments** — as issue
  **comments**, and `gh issue view <N>` alone does **not** show them (nor does
  `--comments` show the body — the two calls are complementary, not
  alternatives). Skipping the comments means implementing against a stale or
  missing plan: on the first live AFK run a plan amendment posted as a comment
  was invisible to the agent for 5 straight iterations.
- The scenarios it covers (`features/<context>/*.feature`).
- The active capability stack.
- `docs/CONTEXT.md`.

## Outputs

- Source files created/modified per the plan.
- Tests in the locations declared by the plan.
- Step definitions in `application/steps/` for the scenarios (§61).
- Git commits at each phase boundary (Red → Green → Refactor).
- Tests pass when the workflow returns.

## Rule files to load (progressive disclosure)

`/tdd` is where the rules become code. Every line written by this skill must respect the rules of its layer. The plan (from `/plan`) already cites the §N to apply, but `/tdd` must **load the actual files** to see the Good/Bad examples and Why sections — citing a rule without reading it produces near-misses.

- **Always (every TDD cycle):**
  - `docs/engineering/core/02-architecture.md` — §3 (hexagonal direction inviolable). Every file written must respect the direction; the linter doesn't catch all violations.
  - `docs/engineering/core/05-domain-modeling.md` — §19 (Result types), §11 (integer units), §20 (no boolean blindness), §21 (illegal states), §22 (PRD vocabulary in code). Domain types written here propagate to adapters.
  - `docs/engineering/core/08-testability.md` — §25 (clock injection), §26 (ID injection), §29 (test through public boundaries). Tests use ports, not internals.

- **When writing tests (Red phase):**
  - `docs/engineering/core/12-bdd-and-acceptance.md` §61 — step definitions live in `application/steps/` OR `features/<context>/steps/`, callable both from acceptance runner and unit tests.
  - `docs/engineering/core/17-bug-handling.md` §92 — for regression tests on bugs: Write→Pass→Revert→Fail→Restore→Pass sequence is mandatory.

- **When writing domain code:**
  - `docs/engineering/core/05-domain-modeling.md` §19, §36 — Result types with `code` fields from a closed `as const` set; never raw strings.
  - `docs/engineering/capabilities/typescript/03-style.md` §5 (no `any`), §6 (no `as` casts), §7 (no non-null assertions), §33 (readonly where practical).

- **When writing use cases (application layer):**
  - `docs/engineering/core/06-commands-and-security.md` §27 (authorization in use case, returns `{ ok: false, code: "FORBIDDEN" }`), §12 (local reasoning), §13 (return IDs not entities), §28 (defensive checks).

- **When writing infrastructure / adapters:**
  - `docs/engineering/core/07-infrastructure.md` §15 (bulk-async intentional), §16 (transactions short), §17 (external side effects via outbox), §18 (idempotency).
  - `docs/engineering/core/10-cross-cutting.md` §45 (tenantId in every repository call), §46 (idempotency middleware for critical commands).
  - **TypeScript + Hono stack only:** `docs/engineering/capabilities/typescript-hono/09-stack-conventions.md` §38-§44 (composition root, Zod placement, middleware ordering, Result→HTTP mapping, error shape, Drizzle as SQL contract).

- **When writing inbound adapters (HTTP routes, webhooks, MCP tools, CLI handlers, env-var consumers):**
  - `docs/engineering/core/04-input-boundaries.md` — §4 (parse and validate at the perimeter — every external input becomes typed before reaching domain), §34 (env vars parsed once at startup via Zod or equivalent; never `process.env.X` scattered through business code). Violating §4 is one of the most common causes of runtime surprises in adapter code.

- **When writing async code:**
  - `docs/engineering/capabilities/typescript/11-async.md` §50 (don't block event loop), §51 (no floating promises), §52 (timeouts + AbortSignal), §53 (bounded concurrency).

- **When writing logs or emitting events:**
  - `docs/engineering/core/15-observability.md` §77 (structured JSON), §78 (dot.notation event names), §79 (no PII), §80 (use case emits at close).

- **When fixing a bug (invoked from `/debug` Step 4):**
  - `docs/engineering/core/17-bug-handling.md` §93 (root cause over symptom — refuse symptom patches), §94 (one bug one PR — no refactor).

- **When the issue carries `improvement:refactor`:**
  - `docs/engineering/core/18-improvements.md` §102 — existing tests must pass unmodified. No new behavior.

- **When brownfield (`agent/legacy/*` branch):**
  - `docs/engineering/core/14-brownfield.md` §71 (characterization tests first if cov<50%), §72 (no fixes during characterization), §76 (refactor and behavior change are never the same PR).

This skill is the §Memento Pattern in practice: load the rules into context so the agent codes against them, not against an approximation of them. The reviewer agent will check after — but the cost of catching violations in `/tdd` is one iteration, while catching them at `reviewer` is a full retry.

## Pre-flight checks

Run before Step 1; each fails fast with an actionable message instead of failing deep in the workflow (§58, ADR-0001):

```bash
node scripts/preflight.mjs git-repo
node scripts/preflight.mjs feature-approved <feature-slug>   # §58: implement only approved scenarios
```

If any check exits non-zero, stop and report it — do not start the workflow.

## Workflow

### Step 1 — Read the issue + plan + scenarios

Load everything. If the plan is missing or unclear → stop, return to `/plan`.

### Step 2 — Red phase: write tests that fail

For each behavior in the plan's "Tests" section:

1. Write the test file at the declared path.
2. Run the test. **It MUST fail.** If it passes, either:
   - The test is wrong (asserting something already true).
   - The behavior already exists (and the issue may be misscoped).

3. Commit the failing test: `git commit -m "test: red — <slice description> (issue #NNN)"`.

For step definitions of `.feature` scenarios (§61), follow the same pattern: write the step definitions calling the use cases that don't exist yet → confirm they fail compilation or fail at runtime → commit.

**Shared steps (FOLLOW-UP 40, §61 addendum):** before defining ANY step,
grep `features/` for its expression. Generic/flow-agnostic expressions
(`the response has status {int}`, error-code assertions, …) belong in
`features/support/` as ONE canonical definition — duplicating them in your
slice's steps file is green on your branch and `ambiguous` after the
siblings merge (cucumber refuses to guess between multiple matches; live:
9/38 scenarios). If the shared step needs flow-specific World state,
resolve the union of the flows' fields — exactly one is populated per
scenario. Slice-specific steps stay in your `features/<context>/steps/`.

**Anti-pattern (forbidden):** Writing tests that "happen to pass" because they don't actually exercise the new behavior. Per §92, the Write→Pass→Revert→Fail→Restore→Pass sequence verifies this.

### Step 3 — Green phase: implement minimally

Follow the plan's dependency graph in order. For each step:

1. Write the minimum code to make the next failing test pass.
2. Run the test. **It MUST pass now.** Other tests must still pass.
3. If it passes by accident (you wrote too much), revert and try smaller.
4. Commit incrementally: `git commit -m "feat: green — <one specific behavior> (issue #NNN)"`.

Stop adding code the moment all tests pass. Anticipating the next requirement is a §31 violation ("omit before mocking").

### Step 4 — Refactor phase: improve without changing behavior

After all tests are green:

1. Look for duplication, unclear names, leaky abstractions.
2. Apply changes that improve structure.
3. **Run all tests after each change.** They must stay green. If they don't, the change altered behavior — revert and treat as a separate slice.
4. Commit refactors: `git commit -m "refactor: <what improved> (issue #NNN)"`.

Refactors here are intra-slice only. Cross-cutting refactors are their own issue per §102.

### Step 5 — Verify the §92 fails-first contract

For one representative regression test added in this issue, run the §92 sequence to prove the test actually catches absence of the implementation:

```bash
# 1. All tests pass (current state)
$TEST_CMD path/to/specific-test
# 2. Revert ONE source file that the test depends on
git stash push -- path/to/source/file.ts
$TEST_CMD path/to/specific-test  # MUST FAIL now
# 3. Restore
git stash pop
$TEST_CMD path/to/specific-test  # PASSES again
```

If the test still passes when the source is reverted, the test is not actually covering the new behavior. Fix it before continuing.

### Step 6 — Run the full suite

Before declaring the issue done:

```bash
$TEST_CMD              # all tests in the project
$LINT_CMD              # linter clean
$TYPECHECK_CMD         # type check clean
```

If any fail → fix or document a clear reason (failing tests unrelated to this slice are §94 violations — separate issue).

### Step 7 — Return to workflow

Output the summary:

```markdown
## /tdd output — issue #NNN

**Scenarios covered:** scn-042, scn-043
**Phases:**
- Red: 6 tests added (all failing as expected) → commit a3b9f12
- Green: implementation complete → commits c1d2e3f, e4f5g6h, i7j8k9l
- Refactor: 2 improvements (extracted helper, renamed for clarity) → commit m9n8b7a

**§92 fails-first verified:** ✓ accept-quote.use-case.test.ts:42 (revert/restore cycle confirmed)

**Tests:** N passing, 0 failing
**Coverage on touched files:** 87%
**Lint:** clean
**Typecheck:** clean

Next: /run-acceptance to verify the scenarios pass end-to-end.
```

## Integration with the framework

- **Invoked by `/feature` Step 10**, by `/debug` Step 4, and by `/optimize` Step 3.
- **Output consumed by `/run-acceptance`** which verifies all scn-NNN scenarios pass.
- **Read by `reviewer` agent**: any drift from the plan is a finding.
- **For §107 Agent Teams**: each teammate runs its own `/tdd` cycle per module.

## Attribution

The Red-Green-Refactor discipline is classical (Kent Beck). The strict "tests must fail first" enforcement and §92 verification cycle is adapted from `verification-before-completion` in [obra/superpowers](https://github.com/obra/superpowers). The vertical-slice TDD pattern is adapted from `/tdd` in [mattpocock/skills](https://github.com/mattpocock/skills).

## What this skill never does

- Skip Red phase.
- Write code without a failing test (always Test → Code, never Code → Test).
- Add behavior not in the scenario or plan.
- Bundle a refactor with new behavior (§76 violation).
- Mark the issue done when tests fail.
