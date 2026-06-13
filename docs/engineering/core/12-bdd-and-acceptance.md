# 12 — BDD & Acceptance Criteria

**Scope.** How acceptance criteria are written, where they live, who owns them, and how they gate the AFK execution. Gherkin `.feature` files are the contract with the product domain — not internal tests.

**When to read.** Writing a new feature, generating scenarios from a spec, adding step definitions, deciding what gates a merge or a pre-push, designing the AFK loop entry point.

**Rules in this file.** §56, §57, §58, §59, §60, §61, §62, §103, §104, §105, §106, §124

> See `AGENTS.md` for the full rule index. Related: `05-domain-modeling.md` (§22 PRD vocabulary, §36 closed domain values), `13-ralph-and-afk.md` (how Ralph consumes scenarios as gate), `08-testability.md` (§29 testing through public boundaries).

---

## §56. `.feature` files live in `features/` by bounded context, not in `tests/`

Feature files are **product documentation** that happens to be executable. They are not unit tests, and they do not belong in the test directory.

### Folder structure

```txt
features/
├── listings/                             # bounded context
│   ├── listing-publication.feature
│   ├── listing-search.feature
│   └── steps/                            # step definitions for this context
│       └── listing.steps.ts
├── quotes/
│   ├── quote-request.feature
│   ├── quote-acceptance.feature
│   └── steps/
│       └── quote.steps.ts
└── shared/
    └── steps/
        └── auth.steps.ts                 # reusable across contexts
```

### Why

- Feature files are read by product/PO/QA, not only by engineers.
- Tests can change implementation; feature files describe **observable behavior**.
- Co-locating with bounded contexts makes ownership explicit.

### Bad

```txt
tests/
├── unit/
├── integration/
└── e2e/
    └── listing.feature                   ❌ buried among engineer-only artifacts
```

---

## §57. Scenarios are written in the ubiquitous language of `CONTEXT.md`, not technical jargon

A scenario must be readable by a non-engineer who knows the domain. No URL paths, no SQL, no HTTP verbs, no internal class names.

The vocabulary comes from `docs/CONTEXT.md` and `05-domain-modeling.md` (§22).

### Good

```gherkin
Feature: Listing publication

  Scenario: Provider publishes a verified listing
    Given a Provider with a verified Company
    And the Provider has a draft Listing titled "Logo design"
    When the Provider publishes the Listing
    Then the Listing state is "published"
    And the Listing appears in Catalog search results
```

### Bad

```gherkin
Feature: POST /v1/listings/publish

  Scenario: 200 on publish
    Given a row in companies table with verified=true
    And a row in listings table with state='draft'
    When the user calls POST /v1/listings/:id/publish with valid JWT
    Then the response status is 200
    And listings.state column is 'published'
```

Why bad:

- Mentions HTTP verbs, table names, JWT, status codes — implementation details.
- Cannot be read by a Product Owner.
- Breaks if the endpoint moves, even when business behavior is unchanged.

---

## §58. Humans approve `.feature` files before commit; the agent reads them once approved, never modifies them autonomously

Feature files are the **contract** between product and engineering. The agent treats them as read-only once merged.

### Workflow

1. The agent generates draft scenarios via `/to-scenarios`.
2. The output lands in `features/<context>/<feature>.feature` **as a draft PR with label `feature-review`**.
3. A human (PO, QA lead, or the developer with business context) reviews and approves.
4. Only after merge does Ralph/AFK consider those scenarios authoritative.
5. **No autonomous edits** to merged `.feature` files. Subsequent changes go through the same human review.

### Why

- Self-modifying contracts are not contracts.
- The audit trail (§62) depends on stable scenarios.
- Trust in AFK execution depends on humans owning the gate.

### Approval status (observable)

"Approved" must be **machine-observable**, otherwise §58 is honor-system: nothing
can tell a draft from an approved contract, and downstream skills cannot gate on
it. Each `.feature` carries its state in a Gherkin **comment header** (Gherkin
has **no** YAML frontmatter — a `---` block breaks the parser, so the state lives
in `#` comments alongside `# language:` and `# Spec source:`):

```gherkin
# language: es
# status: approved
# approved_at: 2026-05-28
# approved_by: approver@example.com
# approved_in_commit: a1b2c3d   # the HUMAN CHECKPOINT 1 commit (auditable)
# Spec source: docs/specs/<feature>.md FR-…
```

State machine:

```
draft → clarifying → approved → implemented → retired
            ↑___________|   (may reopen to clarifying if /clarify re-runs)
```

| Transition | Owner | Action |
|---|---|---|
| (new) → `draft` | `/to-scenarios` | Writes the draft with `# status: draft`. |
| `draft → clarifying` | `/clarify` | Flips status; the agent may still edit while clarifying. |
| `clarifying → approved` | `/feature` Step 7 — HUMAN CHECKPOINT 1 | **Only after** the human confirms in chat. The skill writes `approved_at/by/in_commit`. From here the file is read-only to the agent. |
| `approved → implemented` | `/feature` Step 13 (post-merge close-out) | When all `@release` scenarios are green on the default branch. |
| `implemented → retired` | `/check-consistency` Step 7 | When a scenario is intentionally retired. |

`approved_in_commit` is the HUMAN CHECKPOINT 1 commit SHA — stronger than a
timestamp (which can be edited). The status is **never hand-edited**; the owning
skill flips it. `scripts/preflight.mjs feature-approved <slug>` reads it, so
`/run-acceptance`, `/tdd`, `/to-issues`, and Ralph fail fast on a non-approved
feature instead of deep inside the pipeline.

### Enforcement

- CI rule: PRs from `agent/*` branches that modify `features/**/*.feature` are blocked unless they also include label `human-approved`.
- The `git-guardrails` hook blocks `git commit` on `*.feature` files from non-human commits.
- Pre-flight: skills that consume approved scenarios call `scripts/preflight.mjs feature-approved <slug>` and refuse to run on `draft`/`clarifying` features.

### Label-driven section taxonomy (ADR-0002 — amendment to §58, no new §N)

Spec **and** `.feature` ceremony scale with the feature's *detected* classification, not a project setting. ADR-0002 (Accepted) makes this concrete; this is the §58-adjacent reference (it deliberately adds **no new numbered rule** — INV-6 enforces it, see below):

- **Sections are required by label, not by length.** "Lightweight" means *fewer sections required*, never *fewer lines per section*. `/specify` includes exactly the sections the classification requires (core taxonomy + any sections an active capability declares — OQ2), plus a `<!-- pending-promotion -->` block naming the conditional sections that would be added on escalation.

  The table below is the **canonical core section taxonomy** — `/specify` Step 2b consumes it by reference rather than restating it, so there is one source to keep in sync (the ADR-0002 copy is the historical decision record):

  | Section | Required when |
  |---|---|
  | What changes / Why / Functional requirements / Acceptance / Out-of-scope | always |
  | Threat-model NFR | `require-human-review` |
  | Multi-actor breakdown | `feature:multi-module` or `feature:cross-context` |
  | Capacity envelope | `feature:multi-module` |
  | SLO commitments | `nfr:slo-declared` |
  | Background / Alternatives considered / Glossary | always optional |

- **Classification is detected, recorded as labels, overridden loudly.** `scripts/detect-ceremony.mjs` emits the `feature:*-module`/`cross-context` labels at `/to-issues`; the sensitive-path scan emits `require-human-review`. A human may override only via an audited label flip (GitHub timeline) — never a silent spec frontmatter field.
- **A normal vertical slice in ONE bounded context is single-module (FOLLOW-UP 70).** §3 defines a module AS a bounded context, not a hexagonal layer — so a slice touching `domain/`, `application/`, and `infrastructure/` of the SAME context is one module. `detect-ceremony` counts the §107 modules by bounded context, so the common slice shape no longer trips multi-module and needs **no** override. It is **layout-robust**: a context-sub-organized layer (`src/domain/audit`) and a layer-first-**functional** layer (`src/application/ports`, `src/infrastructure/config`) both collapse correctly — functional buckets (`ports`, `types`, `use-cases`, `adapters`, `config`, …, standard hexagonal vocabulary) are not read as bounded contexts, and non-application roots (`features/`, `schema/`, `docs/`) do not inflate the count. A bounded context literally named like a functional bucket would UNDER-classify; that is bounded by the `reviewer`'s live re-detect on the diff (`requires-escalation`), the same one-way backstop the over-direction relies on. (Distinct from the schema-only case above, which spans ≥2 *distinct* contexts' tables and still classifies multi-module by `context_count` — the FU-66 override remains the path for that.)
- **Escalation is one-way and gated.** A feature auto-promotes light → full when a detector fires on the diff; it is **never** auto-degraded. `INV-6` (`scripts/check-invariants.mjs`) blocks merge if a `feature:single-module` issue's plan grows to multi-module without the backfill (SAD + the sections above) or an audited `skip-invariant: INV-6` flip. The `reviewer` re-detects on the live diff (incl. sensitive paths) and emits a `requires-escalation` finding.
- **Schema-only substrate is a canonical, pre-blessed `skip-invariant: INV-6` case (FOLLOW-UP 66).** `detect-ceremony` counts a substrate slice as multi-module because its migration lands tables OWNED by ≥2 modules — but table-ownership is **persistence span, not runtime coupling**. A slice that ships **no API surface, no use case, no §103 module contract** is deliberately single-module for §107 purposes even when its tables span contexts. The classification is left conservative on purpose (over-classification is safe; the override is a *deliberate human affirmation* that this multi-module-table migration is intentionally single-ceremony — exactly the call worth signing off, not auto-suppressing). The canonical reason string to copy:

  ```
  skip-invariant: INV-6 — schema-only substrate. detect-ceremony counts ≥2 bounded
  contexts because the migration lands tables OWNED by N modules, but the span is
  PERSISTENCE-ONLY: one migration, no API surface, no use case, no runtime
  cross-module coupling, no §103 module contracts. Deliberately single-module.
  ```

---

## §59. Each scenario has a stable ID `scn-NNN` referenced from issues

Every scenario carries a unique ID via Gherkin tag. The ID is the link between business intent, issue tracking, code, and the traceability matrix.

### Good

```gherkin
Feature: Quote acceptance

  @scn-001
  Scenario: Customer accepts an unexpired quote
    Given a ready Quote for Customer "acme"
    And the Quote has not expired
    When the Customer accepts the Quote
    Then a SOW is created in state "draft"

  @scn-002
  Scenario: Customer cannot accept an expired quote
    Given a ready Quote for Customer "acme"
    And the Quote expired 10 minutes ago
    When the Customer accepts the Quote
    Then the operation fails with code "QUOTE_EXPIRED"
```

### Issue references the scenarios it satisfies

```markdown
# Issue 042 — Implement quote acceptance flow

Scenarios covered: scn-001, scn-002 (see `features/quotes/quote-acceptance.feature`)
```

### GitHub label format

```
scenarios:scn-042+043        # canonical compact form (the `+` joins tokens)
```

**Overflow fallback for many-scenario (foundation / tier-N) slices
(FOLLOW-UP 71).** GitHub's label limit is **50 chars**, and even the compact
`+` form overflows a large foundation slice (e.g. 19 contiguous scenarios →
`scenarios:scn-137+138+…+155` ≈ 90 chars; `gh label create` rejects it). When
the compact label would exceed 50 chars:

- **Omit the GitHub `scenarios:` label entirely.** Keep the slice's `tier:N`
  label.
- **The issue FILE's `**Labels:**` line carries the full spelled scenario
  list** — and that is what `INV-5` reads (`check-invariants.mjs` is offline:
  it parses `scn-NNN` from the issue file, NOT from GitHub labels). So the
  omission is **safe** — the traceability gate still maps every `@release`
  scenario to its issue. The GitHub label is a convenience for humans/`gh`
  filters, not the source of truth.
- **Ralph's launch path reads the body too (FOLLOW-UP 72).** `ralph-local`'s
  §63 existence gate and its scenario extraction accept the body's
  `scenarios:scn-*` token when the GitHub label is absent — so an
  overflow-omitted slice is still launchable by the Night Shift, not just
  green to the offline checker. (The earlier FU-71 fix touched only INV-5;
  the launch gate is the other consumer of the label.)

A `range` form (`scenarios:scn-137..155`) is **not** used — the canonical
`scn-NNN` set form (`SCN_VALUE` in `check-invariants`) rejects `..`, and a
range hides which scenarios are actually present. Omit-and-rely-on-file is the
sanctioned pattern.

### Rules

- IDs are immutable. If a scenario is rewritten substantially, give it a new ID and deprecate the old one with `@deprecated`.
- IDs are assigned by `/to-scenarios` skill, not chosen manually.
- The ID lives in the tag, never in the scenario title (the title can change for readability).

---

## §60. Tags `@release` gate merge; `@smoke` gate pre-push; `@manual` requires human

Scenarios are not equal. Some block release, some block local commit, some only run on demand.

### Tag semantics

| Tag | Where it runs | When it blocks |
|---|---|---|
| `@smoke` | Pre-push hook + on every CI build | Local push, every PR |
| `@release` | CI before merge to `main` | Merge to `main` |
| `@manual` | Only when explicitly invoked | Never auto-blocks; documents flows that cannot be automated yet |
| `@deprecated` | Skipped by all runners | Documents removed behavior; safe to delete later |

### Good

```gherkin
Feature: Payment processing

  @scn-010 @smoke @release
  Scenario: Successful card charge
    # critical happy path — runs everywhere

  @scn-011 @release
  Scenario: Charge fails when card is declined
    # full e2e — runs in CI only, too slow for pre-push

  @scn-012 @manual
  Scenario: Charge succeeds during Stripe outage with retry
    # requires real Stripe sandbox + chaos injection
```

### Rules

- Every scenario must have at least one runtime tag (`@smoke`, `@release`, or `@manual`). Untagged scenarios cause CI to fail.
- A scenario can be both `@smoke` and `@release`; they are runtime filters, not exclusive states.
- The set of `@release` scenarios is the **definition of done** for Ralph's `/run-acceptance` gate.

### The CI regression surface is `# status: implemented` features only (FOLLOW-UP 50)

The §58 lifecycle lands approved `.feature` files **before** their step
definitions exist (undefined-by-design until each issue's `/tdd`). The §60 CI
gate therefore must not run the full feature set, or every planning PR and
every in-flight slice PR is red until close-out. The contract:

- **CI (`test:acceptance` / `test:smoke`) runs `# status: implemented`
  features only** — the shipped `cucumber.mjs` template computes `paths` from
  the status headers behind `CUCUMBER_IMPLEMENTED_ONLY=1` (set by the
  scripts), and logs every skipped file: visible narrowing, never silent.
- **In-flight slices gate per-issue** via `/run-acceptance`'s `--tags`
  expression — that is where approved-but-unimplemented scenarios get their
  red/green verdict.
- **The close-out `# status:` flip (INV-8) is the act of joining the CI
  surface.** A feature left on `approved` after its slice merges silently
  stays OFF the regression surface — the flip is load-bearing, not
  bookkeeping (live: a pre-INV-8 slice's features had never been flipped and
  would have left the suite permanently).
- ⚠️ **Do not implement the narrowing as a wrapper passing a file list as CLI
  paths**: cucumber-js v12 MERGES config `paths` with CLI positionals (the
  override is deferred to a future major) — the wrapper runs the union, a
  silent no-op. The filter must live inside the cucumber config. The classic
  `@wip`-tag exclusion was considered and rejected: it duplicates `# status:`
  into a second per-scenario channel that must rotate at close-out (the
  FOLLOW-UP 49 fork class).

---

## §61. Step definitions live in `application/steps/` or `features/<context>/steps/`, callable both from Cucumber and unit tests

Step definitions are adapters that translate Gherkin into use case calls. They do **not** call HTTP, they do **not** call SQL — they invoke the same application layer the production code uses (§3 inward dependency).

### Good: step calls use case directly

```ts
// features/quotes/steps/quote.steps.ts
import { Given, When, Then } from "@cucumber/cucumber";
import { container } from "../../../src/infrastructure/config/container";
import type { World } from "../../shared/world";

When<World>("the Customer accepts the Quote", async function () {
  this.result = await container.acceptQuote.execute(
    { quoteId: this.currentQuote.id },
    this.ctx,
  );
});

Then<World>("the operation fails with code {string}", function (code: string) {
  if (this.result.ok) {
    throw new Error(`Expected failure with code ${code}, got ok`);
  }
  if (this.result.code !== code) {
    throw new Error(`Expected code ${code}, got ${this.result.code}`);
  }
});
```

### Good: same step definitions reused in unit-level tests

```ts
// src/application/use-cases/__tests__/accept-quote.test.ts
import { acceptQuoteSteps } from "../../../features/quotes/steps/quote.steps";

test("scn-002: expired quote fails", async () => {
  const world = await acceptQuoteSteps.givenReadyExpiredQuote();
  const result = await acceptQuoteSteps.whenCustomerAccepts(world);
  acceptQuoteSteps.thenFailsWithCode(result, "QUOTE_EXPIRED");
});
```

### Shared step expressions live in `features/support/` (FOLLOW-UP 40)

Generic, flow-agnostic expressions — `the response has status {int}`,
`the response is {int} with code {string}`, and similar cross-slice
assertions — are needed by **every** slice. If each slice's `/tdd` session
defines them in its own `features/<context>/steps/` file (each reading its
own flow's World state), every branch is green **in isolation** and the
collision only exists **after the siblings merge**: cucumber sees multiple
matching definitions and marks every affected scenario `ambiguous` (live:
9/38 scenarios ambiguous on the first post-merge full-suite run). Rewording
the `.feature` to disambiguate is forbidden — approved files are read-only
(§58).

The convention:

- **Generic/cross-slice expressions** → ONE canonical definition in
  `features/support/*.steps.ts`. When it must read flow-specific World
  state, it resolves the **union** of the flows' fields (exactly one source
  is populated per scenario — each scenario belongs to one flow).
- **Slice-specific steps** → the slice's own `features/<context>/steps/`
  file, as before.
- Before writing a new step definition, **grep `features/` for the
  expression** — if it exists anywhere, reuse or generalize it in
  `features/support/`, never duplicate it.

Detection is cheap and runs in `/run-acceptance`'s pre-flight: a
`--dry-run` pass greps the output for ambiguity (**never the exit code** —
dry-run also exits non-zero for sibling slices' undefined steps, which are
§61-by-design). Under slice-group chaining (§123 Night Shift exception)
the collision surfaces during the second sibling's own gate instead of
post-merge — one more reason that model was chosen.

### Bad: step definition driving HTTP

```ts
// features/quotes/steps/quote.steps.ts  ❌
When("the Customer accepts the Quote", async function () {
  const res = await fetch(`http://localhost:3000/v1/quotes/${this.quoteId}/accept`, {
    method: "POST",
  });
  this.lastStatus = res.status;
});
```

Why bad:

- Couples scenarios to HTTP transport — moving to MCP or RPC breaks them.
- Tests the network stack instead of the business behavior.
- Slow, flaky, requires a running server.

---

### "Observable" means observable over HTTP (FOLLOW-UP 63)

§61 steps invoke use cases directly — right for speed and isolation, but
blind to the HTTP serializer: a field the spec demands observable can be
dropped at the route layer while every scenario stays green (live: dropped
twice — view AND serializer — caught only by the E2E phase against the real
surface). The rule: **an FR whose verb is "observable from the console/API"
gets at least ONE assertion through the HTTP boundary** (a route test or an
`app.request`-level step), not only the use-case return. Pair with the
stack-side guarantee (`satisfies <ViewType>` on route literals,
typescript-hono §42 addendum) — the type kills the dropped-field class, the
boundary assertion proves the spec's observability verb end-to-end.

### Foundation / schema-only slices: `@structural` scenarios (FOLLOW-UP 66)

§61 assumes each scenario maps to a use case its step reuses. A **substrate
slice** — a migration that lands tables with zero business behavior (no use
case, no endpoint, no read path) — has no use case to reuse; its contract is
**structural** (a `UNIQUE`/`CHECK` rejects a row; a migration applies and
rolls back; a table exists with exactly these columns). The pattern, so no
consumer re-invents it:

- **A substrate scenario's `scn-NNN` may be satisfied by an
  integration/migration test instead of a use-case step**, and is tagged
  `@structural`. It stays pinned to the scenario for traceability (INV-3/INV-5
  still see it) — the change is only *which lane proves it*: the step probes
  the shared World DB / `information_schema` and asserts via caught DB errors,
  or a vitest integration test against real Postgres carries the assertion.
  The use-case-direct rule (§61 above) does not apply where there is no use
  case; cite this sub-pattern in `/plan` rather than improvising the
  exception.
- **A migration up/down (idempotency) scenario must NOT run against the
  shared acceptance World DB** — rolling its schema back corrupts every other
  scenario. Such a scenario spins its **own ephemeral Postgres** inside the
  `When` step (a container for that scenario only) and tears it down after.
  Expect it to be heavier than a normal scenario; it is the only correct
  place to assert reversibility.
- **Avoid duplicate ceremony.** The structural facts are usually also covered
  by fast integration tests (real constraints, real Postgres). A substrate
  slice's `@structural` scenarios should pin the traceability and assert the
  *contract-visible* facts (a constraint exists and bites) — not re-test every
  column the integration suite already covers. One scn-NNN per structural
  invariant, not per column.

## §62. Feature files are versioned auditable evidence (living documentation)

`.feature` files are part of the audit trail required by compliance (EU AI Act, SOC2, ISO 27001). They must be versioned in Git, tied to issues and commits, and queryable via the traceability matrix.

### Required artifacts

For every release, the system can produce a report that answers:

> Which acceptance scenarios passed, in which commit, satisfying which issue, implementing which constitutional principle?

### Implementation

The `/traceability-matrix` skill emits `docs/audit/traceability-<version>.md`:

```markdown
# Traceability matrix — v1.42.0

| Scenario ID | Feature file | Last passed (commit) | Implementing issue(s) | Constitution principle |
|---|---|---|---|---|
| scn-001 | features/quotes/quote-acceptance.feature | a3b9f12 | #042 | C.5 (quote lifecycle) |
| scn-002 | features/quotes/quote-acceptance.feature | a3b9f12 | #042 | C.5 |
| scn-010 | features/payments/charge.feature | a3b9f12 | #051 | C.8 (payment integrity) |
```

### Rules

- Feature files are **never** deleted. Use `@deprecated` tag instead — the audit trail must persist.
- Every release tag in Git is paired with the matrix snapshot in `docs/audit/`.
- Compliance officer can read `features/**/*.feature` directly without needing an engineer to translate.
- Renaming a scenario is fine; changing the ID after merge is **not** — IDs are stable identifiers in the audit trail.

### Retention

- Feature files: indefinite (part of the codebase).
- Traceability matrix snapshots: minimum 7 years (configurable per regulatory requirement).
- Ralph session logs that produced a feature implementation: same retention as the matrix.

---

## §103. Module contracts complement `.feature` files

For features with multiple modules implemented in parallel, declarative contracts live alongside the `.feature` files and act as the single source of truth between architecture, backend and frontend. They are not a replacement for scenarios — they are a complement that enables the **frontend to start with mocks while the backend implements**.

### Folder layout

```
features/<bounded-context>/
├── <feature-name>.feature          # behavior contract (§56-§62)
└── contracts/<module>/             # API/shape contract for parallel work
    ├── api-contracts.ts            # request/response/error TypeScript types
    ├── openapi-spec.yaml           # OpenAPI 3.0 spec for the endpoints
    ├── mocks.ts                    # mock implementations with realistic data
    └── architecture.md             # exact file paths for backend + frontend
```

### Why both

`.feature` files describe **what the user observes** (behavior contract). Module contracts describe **what the API shape looks like** (interface contract). The two are independent — you can change the API shape without changing behavior (and vice versa), and BDD verifies the former while contract tests (§105) verify the latter.

### Required of `api-contracts.ts`

- All request, response, and error types in TypeScript.
- Every error response has a typed schema, not just `{ detail: string }`.
- The file is **imported directly** by the frontend — paths must be exact.

### Required of `openapi-spec.yaml`

- OpenAPI 3.0+ with every endpoint, schema, and status code documented.
- Used by Schemathesis (§105) for contract fuzz testing.
- Used by Swagger UI for human review of the API surface.

### Required of `mocks.ts`

- Realistic data, never empty arrays or `null` values when the type allows more.
- 300-500ms artificial delay to simulate network latency.
- The frontend imports these when `VITE_USE_MOCKS=true` (or equivalent env flag).
- The integration phase swaps mocks for real API calls.

### Required of `architecture.md`

- Exact file paths for every backend task (domain entities, ports, use cases, adapters).
- Exact file paths for every frontend task (pages, components, hooks).
- Migration files if any DB schema changes are required.

### Why

- Frontend doesn't wait for backend; both build against the contract simultaneously.
- The contract is reviewable as a unit; a PR changing it is a clear signal.
- Schemathesis (§105) can verify the running API actually matches the spec.
- Mocks are realistic enough to demo the UI before any real backend exists.

### Bad: changing the contract without updating the spec

```diff
- // api-contracts.ts (after PR)
- export type CreateQuoteResponse = { quoteId: string; expiresAt: string };
+ // server now returns { id: string, expires: string }
```

The OpenAPI spec, mocks, and frontend code all break silently. The PR should update the contract artifacts together with the implementation.

---

## §104. Visual acceptance gate for features with UI

A feature that ships a UI must pass a visual acceptance gate — automated browser checks for layout, responsive behavior, dark mode, and accessibility — **in addition to** the scenario-based gate (§60).

### What the gate verifies

For every page or interactive surface the feature delivers:

1. **Console errors clean**: zero unhandled JS exceptions, zero 404s, zero CORS errors after the page loads.
2. **Responsive at 3 breakpoints**: 375×812 (mobile), 768×1024 (tablet), 1440×900 (desktop). No overlapping elements, no horizontal scroll, no unreachable buttons.
3. **Dark mode renders correctly**: text readable, all components visible, no hardcoded colors that break the theme.
4. **Accessibility tree complete**: all interactive elements present in the accessibility tree with meaningful labels; form inputs have associated labels; no orphaned focusable elements.
5. **API calls succeed**: every `fetch`/`xhr` to backend endpoints returns 2xx (not 401, not 500, not network error) under the test scenario.
6. **No placeholder/stub UI** (see §106): the page renders real content, not "Failed to load" or stuck skeletons.

### How the gate runs

Two complementary approaches:

**Automated via Playwright** (preferred for CI):

```ts
// e2e/visual/quote-acceptance.visual.spec.ts
test("Quote acceptance page visual gate", async ({ page }) => {
  await page.goto("/quotes/123");
  await page.waitForLoadState("networkidle");

  // No console errors
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(errors).toEqual([]);

  // Responsive
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await expect(page).toHaveScreenshot(`quote-${w}.png`, { maxDiffPixelRatio: 0.02 });
  }

  // Dark mode
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await expect(page).toHaveScreenshot("quote-dark.png", { maxDiffPixelRatio: 0.02 });

  // Accessibility tree
  const interactives = await page.locator('[role], button, input, a').count();
  expect(interactives).toBeGreaterThan(0);
});
```

**Manual via MCP browser tools** (preferred for one-shot QA in `/run-acceptance`):

Use the available browser MCP (Chrome MCP, Playwright MCP) to navigate, screenshot, resize, toggle dark mode, and read the accessibility tree. The agent records evidence in `docs/features/<slug>/visual-qa.md`.

### When the gate is mandatory

- Any feature labeled `feature:ui` or whose `.feature` files include UI scenarios (e.g., "the user sees the listing in the table").
- Any change that modifies templates, styles, or components.

### When the gate is NOT applied

- Backend-only features.
- Internal APIs without a UI consumer.
- Feature flags that gate UI but don't change the rendered output yet.

### Why

- Headless tests catch logic; they miss layout regressions, contrast issues, and broken responsive design.
- A UI that "passes the scenarios" but is unreadable on mobile is not done.
- Accessibility tree checks catch entire classes of bugs invisible to scenario tests.

---

## §105. API contract fuzz testing for public endpoints

Every public-facing endpoint runs through **Schemathesis** (or equivalent OpenAPI-driven fuzzer) against its OpenAPI spec (§103). The fuzzer generates synthetic requests covering input space the human-written tests never reach, and verifies the responses conform to the spec.

### Required configuration

```bash
# After Docker stack is up and healthy
schemathesis run \
  http://localhost:8000/openapi.json \
  --checks all \
  --hypothesis-max-examples=50 \
  --validate-schema=true \
  --exitfirst
```

### What the gate catches

- **5xx errors** on inputs the developer didn't think of (the most common Schemathesis finding).
- **Schema mismatches**: the endpoint returns shape X but the spec promises shape Y.
- **Status code violations**: endpoint returns 200 with empty body when spec says 204.
- **Validation gaps**: endpoint accepts inputs that violate stated constraints (negative numbers where spec says minimum 0).

### Workflow when Schemathesis finds an issue

1. Capture the failing input as a regression test (§92).
2. Treat the finding as a bug (§91-§96 apply).
3. Fix and re-run Schemathesis until clean.

### When the gate is mandatory

- Any endpoint under `/v1/*` (public API).
- Any endpoint consumed by external systems (webhooks, partner APIs).

### When NOT mandatory

- Internal-only endpoints not exposed beyond the cluster.
- Endpoints behind a feature flag that is off in production.

### Why

- Property-based testing finds bugs that example-based testing structurally cannot.
- The OpenAPI spec doubles as test specification — no extra investment.
- 500 errors caught in CI are dramatically cheaper than 500 errors caught in production.

---

## §106. No stub UI past the acceptance gate

A frontend file is a **stub** if it contains any of:

- `return <div />` or `return null` as the entire body of a component.
- `// TODO: implement` or `// TODO: ...` markers as the only content.
- `throw new Error("Not implemented")`.
- A page route that renders neither text content > 50 chars nor any interactive element (`button`, `input`, `a`, `[role]`).

The acceptance gate (`/run-acceptance`) **blocks merge** if any stub is found in the files the feature touched.

### Detection

Mechanical, runs in CI as part of `/run-acceptance`:

```bash
STUBS=$(grep -rl "return <div />\|return null\|TODO: implement\|throw new Error('Not implemented')" \
  app/ components/ src/components/ src/app/ 2>/dev/null || true)

if [ -n "$STUBS" ]; then
  echo "::error::Stub components found — must implement before acceptance:"
  echo "$STUBS"
  exit 1
fi

# Verify the project builds
pnpm run build || { echo "::error::Build failed — TypeScript errors must be fixed"; exit 1; }
```

### Why this is its own rule

- Agents are tempted to scaffold the structure and leave UI implementation for "later." Later never comes.
- A passing CI on a stub UI is a false positive that costs the team trust in the gate.
- This rule is enforced **mechanically** because no human reviewer catches every stub in a large PR.

### Allowed exceptions

- A file marked `// @stub` with a linked issue documenting the intentional scaffold and the deadline by which it must be implemented. The CI grep excludes files containing that marker. This is for legitimate "vertical slice without UI yet" cases — and is rare.

## §124. Pin a growing surface in a registry fixture, never in an exact-set scenario assertion

When an approved scenario needs to pin a **surface that grows by design** — an
MCP tool set, a CLI command group, an exported API, an event catalog — an
"is exactly {…}" assertion conflates two different events:

- an **unexpected** entry appearing → a real regression the pin exists to catch;
- a **planned** entry being added → normal growth.

Under §58 the second still requires editing an approved scenario — a human
checkpoint on **every** additive slice. (Live evidence, FOLLOW-UP 86: four
consecutive consumer slices each blocked the autonomous loop on extending one
pinned tool-set list, each needing a manual draft PR + an amendment note.)

### The split

The scenario asserts **containment of the founding baseline** plus **agreement
with the registry fixture** — approved once, never edited by growth:

```gherkin
Then the tool set contains "get_listing", "get_provider_agent", "search_listings"
And the advertised tool set matches features/fixtures/tool-registry.json exactly
```

A **checked-in registry fixture** owns the authoritative full set; the unit
gate diffs the live surface against it:

```json
["get_listing", "get_provider_agent", "search_listings", "create_service_scoping"]
```

- Adding an entry = updating the data fixture — mechanical, reviewed in the
  slice's normal PR, **not** a §58 edit.
- An unexpected entry still fails the unit diff — drift detection is
  structural, not scenario-borne.
- Name the contract identically in the scenario and the fixture path (the
  same-string-both-places rule) so they cannot drift apart.

### Why not the alternatives

- **A sanctioned "additive amendment" lane** (reviewer waves through provably
  additive edits to approved scenarios) relaxes §58 for a defined case — and
  every relaxation of the approval contract is a precedent the next exception
  cites. Rejected by maintainer decision (FOLLOW-UP 86).
- **Treating each extension as a normal §58 re-approval** prices every
  planned addition like a contract change. The pin's value is catching the
  *unplanned*; the fixture preserves exactly that.

### Precedent

api-extractor's committed `.api.md` report: the API surface lives in a tracked
report file, CI fails when the built surface differs, and intentional changes
update the report in the same PR under normal review. The registry fixture is
the same pattern at scenario altitude.
