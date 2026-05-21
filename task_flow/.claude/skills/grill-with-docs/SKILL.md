---
name: grill-with-docs
description: |
  Interrogates the EXISTING codebase + docs to extract the implicit behavior
  contract before modifying legacy code. The brownfield counterpart to /grill-me
  (which interrogates a human about a new feature). Output captures what the
  code already does so changes can be planned without assumptions. Adopted from
  Matt Pocock's /grill-with-docs pattern.
  Use when: starting brownfield work (B1 step of brownfield sub-flow), or any
  time you need to modify legacy code whose original intent is no longer obvious
  from reading it.
---

# /grill-with-docs — Interrogate the Existing Code

## Purpose

`/grill-me` asks the human what they want to build. `/grill-with-docs` asks the **code and docs** what is already built — its actual contract, its observable behavior, its hidden invariants. For brownfield work, this is the equivalent investigation: before you can decide what to change, you have to know what is there.

Without this step, agents working on legacy code routinely:
- Assume the old code did something it didn't (and break consumers).
- Miss invariants that aren't documented but are relied on (and create regressions).
- Re-implement behaviors that already exist elsewhere (and cause drift).

## When to invoke

- **B1 step of brownfield sub-flow** (`/feature` detects brownfield via path analysis).
- Before any non-trivial modification to legacy code.
- When `/grill-me` reveals the feature touches existing code with unclear behavior.
- When `/impact-analysis` (B4) needs more context about a module's purpose before mapping impact.

## When NOT to invoke

- For greenfield → `/grill-me` instead (interrogate the human, not the code).
- For trivial changes (single function rename, single test addition).

## Inputs

- The legacy file(s) or module to interrogate.
- Existing `docs/` related to the module (READMEs, ADRs, specs, comments).
- Git history (`git log -p`, `git blame`).
- Production logs if available (via MCP or manually attached).

## Outputs

- `.planning/grilling-docs/<module>-<YYYYMMDD>.md` capturing:
  - Public surface (functions, classes, endpoints exported).
  - Implicit invariants found in the code.
  - Observed runtime behavior from logs (if available).
  - Vocabulary mismatch vs. `docs/CONTEXT.md` (drift signals).
  - Open questions about intent that the code alone cannot answer.
- A summary returned to the workflow.

## Workflow

### Step 1 — Map the public surface

For the module under review, identify everything exported / publicly callable:

```bash
# TypeScript
grep -E "^export (const|function|class|type|interface)" src/legacy/billing/*.ts

# Python
grep -E "^(def|class) [a-zA-Z_]+\(" src/legacy/billing/*.py | grep -v "^_"
```

For HTTP routes, list endpoints (path + method).
For events, list publication points (event names + payload schemas if visible).

### Step 2 — Read git history for intent signals

```bash
git log --oneline -50 -- src/legacy/billing/
git log -p --since="6 months ago" -- src/legacy/billing/calculator.ts
```

Look for:
- Commit messages that mention "fix" / "bug" → potential implicit invariant being protected.
- Reverts → behavior the team explicitly rolled back from.
- Recent renames → vocabulary drift starting.
- Major refactors → architectural choices made (or undone).

### Step 3 — Find invariants the code protects

For each function under review, identify:

- **Input pre-conditions**: what does the function assume about inputs? (Null checks, type guards, length validations.)
- **Output post-conditions**: what does it guarantee about outputs? (Non-null, sorted, deduped, normalized.)
- **State invariants**: what state must hold before and after? (Lock acquired, transaction open, cache warmed.)
- **Error semantics**: what does it throw? What does it return for missing data?

Capture each as a bullet with the file:line reference.

### Step 4 — Compare against `docs/CONTEXT.md`

For every domain term found in the code:

- Is it in `CONTEXT.md`? If yes — names match → ✅.
- If yes but name differs → vocabulary drift (record).
- If no — undocumented term (record as candidate for `CONTEXT.md` update via `/domain-model`).

### Step 5 — Check production logs (if available)

If logs are accessible:

```bash
# Search for events emitted by this module
rg "module.event.*" logs/*.json | head -100
```

What event names is the module actually emitting? What error codes does it return in practice? This often reveals behavior that the code suggests but only production confirms.

### Step 6 — Surface open questions

Some questions the code alone cannot answer:

- "Why does this function return NaN for negative inputs? Is that intentional or legacy bug?" → ask the human.
- "Why is this transaction at REPEATABLE_READ isolation? What invariant does it protect?" → look for ADR; if absent, ask.
- "This endpoint returns 200 with an empty body in case X. Is that the contract or an oversight?" → ask.

These become open questions in the output. Distinguish:
- **Critical**: blocks proceeding with the modification.
- **Important**: should be answered before merge.
- **Curiosity**: nice to know but doesn't block.

### Step 7 — Write the grilling report

```markdown
# Grilling-with-docs report — <module>

**Date:** YYYY-MM-DD
**Module:** src/legacy/billing/

## Public surface
- `calculateInvoiceTotal(items: LineItem[]): number` — exported, used by 4 callers (see /impact-analysis).
- `applyDiscount(total: number, code: string): number` — exported, used by 2 callers.

## Implicit invariants found
- `calculateInvoiceTotal` returns `NaN` for negative `amountCents` (file: calculator.ts:34).
  - Used as filter signal by `validateInvoice` (file: validator.ts:18). The NaN is **intentional** in current production behavior.
- `applyDiscount` mutates the input `total` if `code === "STAFF"` (file: discount.ts:42).
  - Likely a legacy bug; production tests assume non-mutation.

## Git history signals
- Last 6 months: 12 commits, 4 of them fixes for the NaN behavior (always reverted to NaN).
- 2026-02-15: refactor that introduced the mutation in `applyDiscount` — no test added.

## Vocabulary drift vs CONTEXT.md
- Code: `invoiceTotal` / Spec: `priceCents` — **drift** (see ADR pending).
- Code: `discount.code` / Spec: `promotion.code` — **drift**.

## Production behavior (from logs)
- Module emits `invoice.calculated` event with `total` field (not `priceCents`).
- 0.3% of `calculateInvoiceTotal` calls return NaN in production logs (validates the "intentional" reading).

## Open questions
- **Critical:** Is the NaN behavior part of the contract? If yes, document; if no, plan to fix in a separate PR.
- **Important:** Should we rename `invoiceTotal` → `priceCents` to align with CONTEXT.md, or amend CONTEXT.md to accept both?

## Next
After /domain-model (B3) consolidates vocabulary based on this report, /impact-analysis (B4) can proceed.
```

## Integration with the framework

- **Invoked by B1 step of brownfield sub-flow** in `core/14-brownfield.md`.
- **Output feeds `/domain-model` (B3)** which uses the vocabulary drift findings.
- **Output feeds `/impact-analysis` (B4)** which uses the public surface inventory.
- **Output feeds `/characterization-tests` (B2)** which captures the invariants discovered here as tests.
- **Read by `reviewer` agent** when auditing brownfield PRs to verify the agent respected the discovered invariants.

## Attribution

The pattern of "interrogate the code, not just the human" is adapted from `/grill-with-docs` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). MIT licensed.

## What this skill never does

- Modify code (read-only investigation).
- Write tests (that's `/characterization-tests`).
- Decide whether to fix discovered bugs (humans decide; the report flags candidates).
- Update `CONTEXT.md` (that's `/domain-model`).
- Resolve open questions on behalf of the human or stakeholders.
