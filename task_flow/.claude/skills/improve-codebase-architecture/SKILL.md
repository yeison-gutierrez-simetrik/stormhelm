---
name: improve-codebase-architecture
description: |
  Analyzes the existing codebase for "deepening opportunities" — places where
  the structure could become clearer, more cohesive, or better aligned with
  hexagonal principles (§3). Outputs a ranked list of refactor candidates with
  rationale and risk estimate. Does NOT modify code — surfaces opportunities
  for a separate /tdd or refactor PR (§102).
  Use when: tech debt reduction sprint, after a /debug Step 2b reveals
  systemic issues, or proactively during codebase review. Adopted from Matt
  Pocock's /improve-codebase-architecture pattern.
---

# /improve-codebase-architecture — Surface Refactor Opportunities

## Purpose

Codebases drift. What was clean six months ago has become tangled. `/improve-codebase-architecture` reads the current state and identifies **specific** places where the structure could improve — not vague "needs refactor" suggestions, but concrete proposals with file paths, rationale, and risk.

The output is a ranked list. The team or `/feature` decides which to act on. This skill never modifies code.

## When to invoke

- Tech debt reduction sprint (§99 — items become issues).
- After `/debug` Step 2b reveals an anti-pattern appears in N places (systemic issue).
- Proactively, quarterly, as part of governance.
- Before a major rewrite to inform the strangler plan.

## When NOT to invoke

- During an active feature (would distract).
- For a single file change (just refactor as part of that PR per §76).
- As a CI gate (it's analysis, not enforcement).

## Inputs

- The codebase.
- Active capability rules (e.g., `core/02-architecture.md`, `capabilities/<stack>/*.md`).
- `docs/constitution.md`.

## Outputs

- An analysis report at `.planning/architecture-reviews/<YYYYMMDD>.md`.
- Optionally: GitHub issues created for top-ranked opportunities (labeled `improvement:tech-debt`).

## Workflow

### Step 1 — Layer audit (§3 violations)

Scan for hexagonal direction violations:

```bash
# Domain importing infrastructure
rg "from .*infrastructure" src/domain/ --type ts --files-with-matches

# Application importing from infrastructure-only libs
rg "from 'drizzle-orm'|from '@hono" src/application/ --type ts --files-with-matches
```

Each violation is a candidate finding.

### Step 2 — Boundary cohesion audit

For each port (`src/**/ports/*.ts`), count:

- How many use cases depend on it?
- How many adapters implement it?
- How many methods does it expose?

Red flags:
- Port with 1 method and 1 implementation → maybe unnecessary indirection.
- Port with >10 methods → likely a god interface; split.
- Port implemented by 5+ adapters → check if the interface is really shared or accidentally too generic.

### Step 3 — "Deepening opportunity" scan

A *shallow* module exposes a complex API that mirrors its implementation. A *deep* module exposes a simple API that hides complex work. The goal is deeper modules (per Ousterhout's *A Philosophy of Software Design*).

For each module:

- Count public exports vs. internal helpers.
- High ratio of exports per LOC → shallow.
- Low ratio → deep.

Surface shallow modules as candidates for "deepen by hiding helpers behind a smaller API."

### Step 4 — Naming drift audit

Compare module / file / class names against `CONTEXT.md`:

- Names that match → fine.
- Names that drift (`Service` vs `Listing`) → §22 finding.
- Names that are vague (`Manager`, `Helper`, `Util`) → candidate for renaming.

### Step 5 — Test coverage / coupling audit

For each module:

- Coverage % (from latest report).
- Test-to-source ratio.
- Test isolation: do unit tests use real DB, real HTTP, real time?

Modules with low coverage and high coupling → high-risk; flag for `/characterization-tests` before any change.

### Step 6 — Rank candidates

Rank using the ICE rubric (§99):

- **Impact** (1-10): how much pain does the current state cause? How often is this code touched?
- **Confidence** (1-10): how confident are we the proposed refactor will work?
- **Ease** (1-10): inverse of effort.
- **Score** = I × C × E.

Top candidates have score ≥ 200.

### Step 7 — Write the report

```markdown
# Architecture review — YYYY-MM-DD

**Scope:** src/
**Active capabilities:** typescript, typescript-hono

## Layer violations (§3)
1. src/domain/quotes/quote.ts imports `Stripe` from `@stripe/stripe-js`.
   - **Impact:** High (test isolation broken; domain logic depends on third-party).
   - **Confidence:** High (clear violation).
   - **Ease:** 7 (move to outbound adapter).
   - **ICE:** 9 × 9 × 7 = 567.
   - **Proposed:** Extract `PaymentPort` in domain; move Stripe interaction to `infrastructure/adapters/output/payments/stripe-payment.adapter.ts`.

## Shallow modules (deepening opportunity)
2. src/application/use-cases/quotes/*.ts (8 files, ~40 exports total).
   - **Impact:** Medium (large surface area for callers).
   - **Confidence:** Medium (some exports may be legitimately needed externally).
   - **Ease:** 4 (touches many call sites).
   - **ICE:** 5 × 5 × 4 = 100.
   - **Proposed:** Consolidate into 3-4 use cases; hide internal helpers.

## Naming drift (§22)
3. src/domain/users/serviceProvider.ts uses `serviceProvider` but `CONTEXT.md` says `Provider`.
   - **Impact:** Medium (vocabulary drift across docs/code).
   - **Confidence:** High (mechanical rename).
   - **Ease:** 8 (codemod).
   - **ICE:** 6 × 9 × 8 = 432.
   - **Proposed:** Rename `serviceProvider` → `provider` everywhere (single PR per §102).

## Coverage / coupling concerns
4. src/legacy/billing/*.ts at 23% coverage, high cyclomatic complexity.
   - **Proposed:** `/characterization-tests` before any modification.

## Top 3 candidates by ICE
1. #001 (567) — Move Stripe out of domain.
2. #003 (432) — Rename serviceProvider → Provider.
3. #002 (100) — Consolidate quotes use cases.

## Recommendation
Create issues for #001 and #003 (high ICE, low risk). Defer #002 until next review (medium ICE, higher risk).
```

### Step 8 — Optionally create issues

If `--create-issues` flag is passed, create GitHub issues for candidates with ICE ≥ 200, labeled `improvement:tech-debt`.

## Integration with the framework

- **Standalone invocation** (manual or scheduled).
- **Output feeds `/to-issues`** if the team decides to act.
- **Used in tech debt sprints** (§99 — items get ICE rubric automatically).
- **Read by `reviewer` agent**: a PR claiming "refactor" should address top candidates, not invent new ones.

## Attribution

The "deepening opportunity" framing is from John Ousterhout's *A Philosophy of Software Design* (2018). The skill structure is adapted from `/improve-codebase-architecture` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). MIT licensed.

## What this skill never does

- Modify code (read-only analysis).
- Decide which refactor to do (returns ranked candidates; humans choose).
- Generate refactor PRs (that's `/tdd` per §102).
- Bundle multiple refactors (each candidate becomes its own issue per §94).
