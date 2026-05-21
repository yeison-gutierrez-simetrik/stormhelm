# 14 — Brownfield: Working with Legacy Code

**Scope.** How to modify code that already exists without breaking it. Characterization, impact analysis, strangler migrations, branch hygiene, and the discipline of separating refactor from functional change.

**When to read.** Touching any module that already has consumers in production, modifying code without tests, planning a migration from one technology to another, fixing a bug in legacy code, refactoring without changing behavior.

**Rules in this file.** §71, §72, §73, §74, §75, §76

> See `AGENTS.md` for the full rule index. Related: `08-testability.md` (§29 testing through public boundaries), `01-philosophy.md` (§35 PRs boring to review), `02-architecture.md` (§3 hexagonal direction also applies to legacy code).

---

## Brownfield sub-flow (B1-B5) — operative reference

When `/feature` detects that the affected paths already exist with production traffic, it switches into the brownfield sub-flow before `/specify`. The five steps are explicit:

| Step | Skill | Output |
|---|---|---|
| **B1** | `/grill-with-docs` | Interrogation focused on the existing code (not just the human). Captures the implicit behavior contract. |
| **B2** | `/characterization-tests` | Test suite that documents current behavior verbatim (§71, §72). No bug fixes during this step. |
| **B3** | `/domain-model` | Refines `CONTEXT.md` with the **real** vocabulary in the code, not the aspirational one. Detects naming drift. |
| **B4** | `/impact-analysis` | Maps modules affected, tests at risk, external consumers, cross-context references (§73 mandatory when >3 files or crossing contexts). |
| **B5** | **Decision: strangler vs in-place** | Human decision based on B4 output. If strangler, invoke `/strangler-plan`. If in-place, continue with normal `/specify` → `/tdd` flow with full §71-§76 discipline. |

After B5, the workflow rejoins the standard flow at `/specify` with the context of B1-B4 baked in.

---

## §71. Characterization tests are mandatory before modifying legacy code with low coverage

If the module to be changed has **less than 50% coverage** in the affected files, characterization tests **must** land in a separate, prior commit before any behavior change.

### Coverage check

Run before opening an issue as `ralph-ready`:

```bash
# TypeScript
npx vitest run --coverage --reporter=json --include 'src/legacy/billing/**'

# Python
pytest --cov=src/legacy/billing --cov-report=json
```

If the affected file coverage is below 50%, the issue must include the subtask:

```markdown
- [ ] /characterization-tests for src/legacy/billing/*
- [ ] Original change after characterization PR merges
```

### Characterization test naming

```ts
// src/legacy/billing/__tests__/characterize.invoice-calculator.test.ts
describe("invoiceCalculator (characterization)", () => {
  test("char-001: returns 0 cents when invoice has no line items", () => {
    expect(invoiceCalculator({ lineItems: [] })).toBe(0);
  });

  test("char-002: rounds half to even (banker's rounding) for fractional cents", () => {
    // Documents current behavior even if it might be wrong (§72)
    expect(invoiceCalculator({ lineItems: [{ amountCents: 0.5 }] })).toBe(0);
  });
});
```

### Why

- Without tests, refactoring is gambling.
- Ralph and humans both need a regression net.
- Characterization is **cheap** compared to the cost of a production regression.

### Enforcement

`/run-acceptance` reports the coverage delta. If a PR modifies a file whose pre-change coverage is below 50% and the PR doesn't add characterization tests, the gate fails.

---

## §72. Characterization tests document current behavior, even if it looks like a bug — never fix in the same commit

The point of characterization is to **freeze** the present so the future can change it safely. Fixing a bug while characterizing destroys the safety net.

### Good

```ts
test("char-003: returns NaN when amountCents is negative (legacy quirk)", () => {
  // Production has relied on this NaN for filtering invalid invoices.
  // Do NOT fix here. See issue #142 for the planned correction.
  expect(invoiceCalculator({ lineItems: [{ amountCents: -100 }] })).toBeNaN();
});
```

### Bad: fixing during characterization

```ts
test("calculates total for negative amounts", () => {
  // ❌ This is no longer characterization — it's a behavior change.
  expect(invoiceCalculator({ lineItems: [{ amountCents: -100 }] })).toBe(-100);
});
```

Why bad:

- The test now asserts the **future** behavior, not the **current** one.
- Other code that depends on the NaN-as-filter breaks silently when the implementation changes.
- The audit trail loses the "this is what it did before" snapshot.

### Workflow for a real bug discovered during characterization

1. Write characterization test that documents the buggy behavior (e.g., `expect(...).toBeNaN()`).
2. Open a separate issue: "Fix NaN return for negative amounts in invoiceCalculator."
3. Merge the characterization PR first.
4. In the bug-fix PR, **delete** the characterization test for that case and add a new test asserting the correct behavior, with a clear comment in the PR explaining the intent.

---

## §73. `/impact-analysis` is mandatory when the change touches >3 files or crosses bounded contexts

Some changes look small in one place and explode elsewhere. The agent runs `/impact-analysis` before planning the implementation.

### Trigger conditions (any one)

- The diff is expected to touch more than 3 files.
- The change crosses bounded contexts (e.g., `quotes/` ↔ `payments/`).
- The change modifies a public API or event contract.
- The change touches code that is imported by more than 5 other modules.

### Required output

```markdown
# Impact analysis — Issue #042

## Modules affected (direct edits)
- src/application/use-cases/accept-quote.use-case.ts
- src/infrastructure/adapters/output/persistence/drizzle/repositories/drizzle-quote.repository.ts

## Modules affected (transitive consumers)
- src/application/use-cases/list-active-quotes.use-case.ts (imports QuoteRepository)
- src/infrastructure/adapters/input/http/routes/v1/quote.routes.ts (calls acceptQuote)
- src/infrastructure/adapters/input/mcp/tools/accept-quote.tool.ts (calls acceptQuote)

## Existing tests at risk
- src/application/use-cases/__tests__/accept-quote.test.ts (likely needs new mocks)
- features/quotes/quote-acceptance.feature (scn-001, scn-002, scn-003 — must all still pass)

## External consumers
- Provider Dashboard frontend calls POST /v1/quotes/:id/accept
- Mobile app calls POST /v1/quotes/:id/accept
- Webhook subscribers for quote.accepted.v1 event

## Cross-context references
- `payments/` reads Quote.priceCents via QuoteReadPort — no change to interface needed
- `sows/` creates SOW from QuoteAcceptance event — verify payload compatibility

## Suggested approach
Strangler not required — single use-case change with backward-compatible event payload.
```

### Tooling

- TypeScript: `dependency-cruiser` or `madge` for the import graph.
- Python: `import-linter` and `pydeps`.
- Both: `git log -p -- <path>` to identify recent contributors (potential reviewers).

### Why

- The agent makes better plans with full visibility of consequences.
- Reviewers can verify nothing was missed.
- The analysis itself is reusable in the PR description.

---

## §74. Strangler pattern for replacements: build new alongside old, route incrementally, kill old last

When an entire module or service is being replaced, **never** big-bang it. The strangler pattern guarantees rollback and incremental validation.

### Three-phase rollout

**Phase 1 — Build new alongside old**

- New implementation lives in a separate module: `src/quotes-v2/` or `src/payments/new/`.
- Old implementation continues to handle 100% of traffic.
- New implementation is dark-launched: it runs but does not affect responses.
- Differential testing compares old vs new output for the same input.

**Phase 2 — Route incrementally with feature flag**

```ts
// src/application/use-cases/accept-quote.use-case.ts
export class AcceptQuoteUseCase {
  constructor(
    private readonly v1: AcceptQuoteV1,
    private readonly v2: AcceptQuoteV2,
    private readonly flags: FeatureFlagPort,
  ) {}

  async execute(input: AcceptQuoteInput, ctx: RequestContext) {
    const useV2 = await this.flags.isEnabled("quotes.accept.v2", {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });

    return useV2 ? this.v2.execute(input, ctx) : this.v1.execute(input, ctx);
  }
}
```

- Rollout: 1% → 10% → 50% → 100% over days/weeks.
- Metrics compare error rates, latency, and business outcomes between v1 and v2 (§83).
- Rollback is a flag change, not a deploy.

**Phase 3 — Kill the old**

- Once 100% on v2 for the agreed soak period (typically 2 weeks), the old code is **deleted**, not commented out.
- The feature flag is removed.
- The `v2` suffix is dropped from filenames; what was new becomes canonical.

### Bad: big-bang replacement

```ts
// ❌ Single PR that removes old and adds new
- delete src/quotes/
+ add src/quotes-new/
- update all callers in same diff
```

Why bad:

- Rollback requires a revert PR through the same pipeline that just deployed — minutes to hours.
- No way to validate the new implementation under real traffic before commit.
- A single bug affects 100% of users immediately.

---

## §75. Brownfield branches use prefix `agent/legacy/<issue-NNN>` to distinguish in review

Reviewers approach brownfield PRs differently. The branch name signals what to expect.

### Branch naming convention

| Branch prefix | Meaning |
|---|---|
| `agent/<issue-NNN>` | Greenfield feature, generated by Ralph |
| `agent/legacy/<issue-NNN>` | Brownfield modification, generated by Ralph |
| `agent/legacy/characterize-<module>` | Characterization PR only |
| `agent/legacy/strangler/<module>-<phase>` | Strangler migration, with phase number |
| `human/<short-description>` | Human-driven branch (any context) |

### Why

- Reviewers can filter by prefix in PR lists.
- CI applies extra checks to `agent/legacy/*` branches (e.g., requires characterization coverage report).
- Auditors recognize the work pattern from the branch alone.

### Enforcement

The `ralph-local.sh` script chooses the prefix based on the issue's `shift:hybrid` or path analysis:

```bash
if issue_touches_legacy_paths "$ISSUE_NUMBER"; then
  BRANCH="agent/legacy/issue-$ISSUE_NUMBER"
else
  BRANCH="agent/issue-$ISSUE_NUMBER"
fi
```

---

## §76. Never combine a refactor and a behavior change in the same PR

A refactor is a change in structure with **zero observable behavior change**. A behavior change is the opposite. Mixing them makes both impossible to review safely.

### Refactor PR (good)

```diff
- function calculateInvoiceTotal(items) {
-   let total = 0;
-   for (const item of items) {
-     total += item.amountCents;
-   }
-   return total;
- }
+ const calculateInvoiceTotal = (items: readonly LineItem[]): number =>
+   items.reduce((sum, item) => sum + item.amountCents, 0);
```

- All existing tests pass without modification.
- No new tests required (behavior is identical).
- PR description: "Refactor: convert calculateInvoiceTotal to functional style. No behavior change."

### Behavior change PR (good, separate)

```diff
- const calculateInvoiceTotal = (items: readonly LineItem[]): number =>
+ const calculateInvoiceTotal = (items: readonly LineItem[]): number => {
+   const negativeItems = items.filter((item) => item.amountCents < 0);
+   if (negativeItems.length > 0) {
+     throw new InvalidLineItemError({ negativeItems });
+   }
+   return ...
+ }
```

- New test: `scn-099 — invoice with negative line item throws InvalidLineItemError`.
- Characterization test for old NaN behavior is **deleted** in this PR with explanation.
- PR description: "Behavior change: reject negative line items instead of silently returning NaN. Replaces previous NaN-based filter (see issue #142)."

### Bad: mixed PR

```diff
- function calculateInvoiceTotal(items) {
-   let total = 0;
-   for (const item of items) {
-     total += item.amountCents;
-   }
-   return total;
- }
+ const calculateInvoiceTotal = (items: readonly LineItem[]): number => {
+   const negativeItems = items.filter((item) => item.amountCents < 0);
+   if (negativeItems.length > 0) {
+     throw new InvalidLineItemError({ negativeItems });
+   }
+   return items.reduce((sum, item) => sum + item.amountCents, 0);
+ }
```

Why bad:

- Reviewers cannot tell if the new `throw` is intended or a refactor side-effect.
- If a regression appears, the bisect points to a 40-line diff doing two things.
- The audit trail conflates style and policy decisions.

### Enforcement

PR template includes a checkbox:

```markdown
- [ ] This PR is **either** a refactor (no behavior change) **or** a behavior change, not both.
```

`/code-review` skill flags mixed PRs and recommends splitting before approval.
