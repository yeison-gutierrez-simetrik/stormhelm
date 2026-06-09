---
name: plan
description: |
  Generates the technical plan for each issue: file paths, port interfaces, adapter
  responsibilities, migration files, test layout, dependency graph. Bridges the
  gap between /to-issues (what + scope) and /tdd (red-green-refactor). The plan
  is intentionally specific so /tdd can be invoked AFK with no further design
  decisions left.
  Use when: /to-issues has produced the issue queue. Step 9 of /feature. One /plan
  invocation per issue (or per module in §107 mode).
---

# /plan — Technical Plan per Slice

## Purpose

A spec says "what." A scenario says "observable result." A plan says **exactly which files change, what interfaces appear, what tests run, in what order**. Without a plan, `/tdd` has to make design decisions on the fly — exactly when the agent is most likely to drift.

`/plan` produces a plan that is detailed enough for Ralph to execute AFK without further input, but high-level enough to fit in the issue body. It is the last design-thinking step before code.

## When to invoke

- After `/to-issues` creates issues.
- Step 9 of `/feature`.
- For each issue separately (or per module in §107 Agent Teams).
- When `/tdd` reports "the issue is underspecified."

## When NOT to invoke

- For bugs → `/debug` Step 4 produces a plan implicit in the root cause.
- For improvements → rule-specific contracts (§97 baseline) replace this skill.

## Inputs

- The issue body (from `/to-issues`).
- The scenarios it covers (`features/<context>/*.feature`).
- The active capability stack (`AGENTS.md`).
- `docs/CONTEXT.md` (vocabulary).
- `docs/constitution.md`.
- For multi-module: module contracts (§103). **Doubles cite their contract
  (FOLLOW-UP 62):** when the plan includes an in-repo double of another
  service, EVERY route the double will register must name the ADR/contract
  line it mirrors (e.g. `POST /api/v1/discover/search ← ADR-0007 §endpoints`)
  — the reviewer greps the double against that list. A double built from the
  issue's prose instead of the pinned contract drifted on 4 routes live and
  stayed green for 30 scenarios. (A vendored contract-vs-double linter over
  the §103 `openapi-spec.yaml` is the recorded end-state — deferred until a
  second drift incident or the openapi artifact is standard across ≥2
  consumers; the citation rule is the interim that costs one plan line.)

## Outputs

- A plan section added to the issue — **initial plan in the issue BODY
  (`gh issue edit --body`); amendments as COMMENTS (`gh issue comment`).**
  This is a contract shared with `/tdd` and the Ralph loop: implementers read
  body + comments (`gh issue view <N>` **and** `gh issue view <N> --comments` —
  the former omits comments, the latter omits the body). Keeping the initial
  plan in the body makes the issue self-contained; comments are the auditable
  amendment trail. Never post the *only* copy of the plan somewhere
  implementers are not contracted to read.
- The plan template (see below).
- Returned to the workflow for `/tdd` consumption.

## Rule files to load (progressive disclosure)

`/plan` is where the architecture becomes concrete (specific file paths, port interfaces, layer assignments). It must load architectural rules **always**, and stack-specific rules **based on the active capabilities** declared in `AGENTS.md`.

- **Always (every plan):**
  - `docs/engineering/core/02-architecture.md` — §3 (hexagonal direction is inviolable), §24 (adapters boring), §37 (OOP-lite frontier). The plan's "layers affected" section maps directly to §3.
  - `docs/engineering/core/05-domain-modeling.md` — §19 (Result types with `code`), §20 (no boolean blindness), §21 (illegal states hard to represent). Every use case the plan declares uses Result types.
  - `docs/engineering/core/08-testability.md` — §25 (don't hide time), §26 (don't hide IDs), §29 (test through public boundaries). The plan's "Tests" section reflects these.

- **If the plan touches `src/application/` (use cases — almost always):**
  - `docs/engineering/core/06-commands-and-security.md` — §27 (security gates before domain actions), §12 (prefer local reasoning), §13 (mutation APIs return IDs/status), §28 (defensive checks). Every use case in the plan reflects these.

- **If the plan touches input boundaries (HTTP routes, webhooks, MCP tools, CLI args, env vars):**
  - `docs/engineering/core/04-input-boundaries.md` — §4 (parse and validate at the perimeter with Zod/Pydantic/etc.), §34 (environment variables are input too — parse once at startup). The plan declares the validation schema location and the boundary parser.

- **If the plan touches `src/infrastructure/` (adapters, repositories — almost always):**
  - `docs/engineering/core/07-infrastructure.md` — §15-§18 (transactions short, external side effects explicit, idempotency).
  - `docs/engineering/core/10-cross-cutting.md` — §45 (`tenantId` in every repo filter), §46 (idempotency for critical commands), §47 (pagination from day one), §49 (expand-then-contract migrations).

- **If TypeScript capability is active:**
  - `docs/engineering/capabilities/typescript/03-style.md` — §5-§10, §33. The plan respects type-system rules from the start (no `any` in declared interfaces).
  - `docs/engineering/capabilities/typescript/11-async.md` — §50-§55. The plan declares timeouts and concurrency bounds explicitly when async work is involved.

- **If TypeScript + Hono capability is active and the plan touches HTTP:**
  - `docs/engineering/capabilities/typescript-hono/09-stack-conventions.md` — §38-§44. The plan's "Infrastructure: Route" lines respect middleware ordering, Result-to-HTTP mapping, and DI conventions.

- **If multi-module (§107 detected):**
  - The plan references the `features/<context>/contracts/<module>/` artifacts created by `/to-issues`. Re-read those contracts before writing the plan section for each module.

- **If brownfield (B-flow active):**
  - `docs/engineering/core/14-brownfield.md` — §71-§76. The plan must declare whether characterization tests are needed before changes, and whether impact-analysis flagged cross-context references.

- **If the issue is `improvement:*`:**
  - `docs/engineering/core/18-improvements.md` — the kind-specific section (§97 for perf, §99 for tech-debt, §100 for dep-upgrade, §101 for hardening, §102 for refactor).

The plan is the "design memory" that `/tdd` consumes. Loading the right rules here means `/tdd` can be invoked AFK with no further design questions — every architectural choice was made in the plan, citing the §N that justifies it.

## Workflow

### Step 1 — Read scenarios and identify behaviors

For each scenario, identify the domain behavior it asserts. Group behaviors that share a use case.

### Step 2 — Map to hexagonal layers

For the active stack (e.g., typescript-hono), determine:

- **Domain layer** changes: new entities, value objects, ports, errors, states (§3, §5-§10, §19-§22).
- **Application layer** changes: new use cases, DTOs (§3, §6).
- **Infrastructure layer** changes: adapters, repositories, migrations, routes (§24, §38-§44).
- **Entrypoints** changes: rarely — usually only when adding a new server/worker.

For each layer, list the exact file paths the slice will create or modify.

### Step 3 — Identify cross-cutting concerns

For this slice, which §N rules apply non-trivially?

- §45 tenant filter? (almost always yes).
- §46 idempotency? (only for critical commands).
- §47 pagination? (only for list endpoints).
- §52 timeout/abort signal? (only for external calls).
- §83 SLO target? (only for endpoints with declared SLO).

Each applicable rule becomes a checklist item in the plan.

### Step 4 — Determine test layout

For the active testing stack:

- Domain unit tests location and count.
- Use case unit tests with mocked ports.
- Adapter integration tests (DB, HTTP client).
- Step definitions for the `.feature` scenarios (§61 — reuse the use case directly, not HTTP). **Schema-only / foundation slice (FOLLOW-UP 66):** there is NO use case to reuse — `@structural` scenarios are satisfied by integration/migration tests (probing the World DB / `information_schema`, or a vitest constraint test), and a migration up/down scenario spins its own ephemeral Postgres (never the shared World DB). Cite the §61 "Foundation / schema-only slices" sub-pattern here instead of inventing the exception.
- E2E if necessary (rare; most coverage via integration).

### Step 5 — Identify migrations

**Schema-only substrate slice (FOLLOW-UP 66):** if the slice is a pure
migration foundation (tables only, no use case, no API), its tables may span
several modules' contexts — `detect-ceremony` will read that as multi-module
and INV-6 will block. This is the canonical, pre-blessed
`skip-invariant: INV-6` case: copy the reason string from core/12 §57
("Schema-only substrate is a canonical … case"). The classification stays
conservative on purpose; the override is the deliberate single-module
affirmation, not a mask.

If schema changes:

- New Alembic / Flyway / Drizzle migration file.
- Sequential numbering: `ls migrations/` to find next.
- Naming convention from `core/09-stack-conventions.md` (active capability).
- Expand-then-contract pattern (§49) if the change is destructive.

### Step 6 — Write the plan

Append to the issue **body** (amendments to an existing plan go as comments — see Outputs):

```markdown
## Plan

### Layers affected
- **Domain:** src/domain/listings/listing.ts (add `publish()`), src/domain/listings/listing-state.ts (new state).
- **Application:** src/application/use-cases/publish-listing.use-case.ts (new), src/application/ports/listing.repository.ts (add `save`).
- **Infrastructure:**
  - Repository: src/infrastructure/persistence/drizzle/listing.repository.ts.
  - Route: src/infrastructure/http/routes/v1/listing.routes.ts (POST /v1/listings/:id/publish).
  - Migration: migrations/0023_listing_published_state.ts.
- **Tests:**
  - src/domain/listings/__tests__/listing.test.ts (3 new tests).
  - src/application/use-cases/__tests__/publish-listing.use-case.test.ts (4 new tests).
  - src/infrastructure/http/routes/v1/__tests__/listing.routes.test.ts (2 new tests).
  - features/listings/steps/listing-publication.steps.ts (step definitions).

### Rules to apply
- §3 hexagonal direction — no infrastructure imports in domain.
- §19 Result type with codes `LISTING_NOT_FOUND`, `PROVIDER_NOT_VERIFIED`, `LISTING_NOT_OWNED`.
- §27 authorization in use case (Provider must own the Listing).
- §45 tenant filter on the repository.
- §92 regression tests fail-first before implementation.

### Dependency graph (intra-slice)
1. Add `listing-state.ts` (no deps).
2. Add `publish()` to `listing.ts` (depends on 1).
3. Add port to `listing.repository.ts` (depends on 2).
4. Add use case (depends on 2 + 3).
5. Add adapter implementing port (depends on 3).
6. Add migration (depends on 5).
7. Add route (depends on 4).
8. Add step definitions (depends on 4).

### Estimated tokens
~150000 (matches issue's budget:150k label — see /to-issues Step 4's measured anatomy: ≈55-80k per full iteration).

### Open questions for /tdd
- None.
```

### Step 7 — Save and return

Save the plan to the issue: **initial plan → `gh issue edit --body`; amendment
to an already-planned issue → `gh issue comment`** (the channel contract in
Outputs). Return path to workflow.

**MANDATORY — amendment FORM is canonical (FOLLOW-UP 49, consumer review).**
A scope or dependency amendment is MACHINE-READ (the engine's pre-iteration
backstop, the queue's dep graph) — free-form prose created the live blind
spot (a blockquote amendment that no parser saw). The canonical forms, in the
issue **body** (`gh issue edit --body`; scope-changing amendments are too
load-bearing for the comments channel):

- **Scenario changes** → edit `## Scenarios covered` in place, or append a
  literal `## Scope amendment` section listing the added `scn-NNN`.
- **Dependency changes** → edit `## Depends on` in place (the queue reads
  exactly that section). Grammar (FOLLOW-UP 56): same-repo issue refs only
  (`- #N`); never PR numbers (the queue parses them as nonexistent issues);
  a cross-repo dependency makes the issue `shift:hitl` instead.
- Either way, a dated one-line note in `## Scope amendment` keeps the audit
  trail human-readable.

(The engine also tolerates the legacy inline form — a line starting with
`> **Scope amendment…**` / `> **Dependency amendment…**` — but new
amendments use the headings.)

**MANDATORY — label rotation travels with every scope amendment (FOLLOW-UP
49).** A body/comment amendment that changes the issue's scope is INCOMPLETE
until the affected labels rotate **in the same operation**:

```bash
gh issue edit <N> \
  --remove-label 'scenarios:<old>' --add-label 'scenarios:<new>' \
  --remove-label 'budget:<old>'    --add-label 'budget:<new>'
```

The implementing session reads the BODY (and implements the amendment); the
acceptance GATE reads the LABEL (and verifies only what it names). Rotating
one without the other silently forks the two contract channels — live, four
security-hardening scenarios were implemented from a body amendment and
shipped WITHOUT ever passing acceptance on a `require-human-review` slice,
because the budget label was rotated but the scenarios label was not. The
engine refuses to start when the body owns scenarios the label doesn't
(the FU-49 backstop), so an un-rotated amendment now blocks the night
instead of shipping ungated work.

## Integration with the framework

- **Invoked by `/feature` Step 9** for each issue from Step 8.
- **Output consumed by `/tdd`**: the plan tells `/tdd` exactly which file to create next.
- **For §107 Agent Teams**: each teammate (arch, fe, devops) reads only the section of the plan that applies to its module.
- **Read by `reviewer` agent**: the plan is the "should match" against which the diff is reviewed.

## What this skill never does

- Decide on the **what** (that's `/specify`).
- Choose an alternative architecture (uses the active capability's conventions strictly).
- Skip a §N that applies to the slice.
- Mention a library not allowed by the active capability.
- Decide budget (already decided by `/to-issues`).
