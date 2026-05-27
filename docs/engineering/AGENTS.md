# AGENTS.md — Stormhelm Engineering Rules

These rules govern how code is written, organized, tested, shipped, and operated in any project using the Stormhelm harness. They apply to both human-written and agent-generated code.

The goal: ship thin, demoable, correct vertical slices without leaving behind clever, unsafe, or over-generalized code — at a pace humans alone could not match, with the safety nets humans alone would not need.

---

## How to use this document

This is an **index**. Each rule is a one-line summary; full rationale and code examples live in the topical file linked below. Each topical file is self-contained.

**Load only the files relevant to the current task.** There is no need to read everything to do any one thing. Use the *"When to read"* line on each section to decide.

The numbering (`§N`) is **stable** across the codebase — quote it in PR reviews and commit bodies (e.g., "violates §27 + §42"). Language- or framework-specific twins are tagged with a suffix (`§N-py` for Python, `§N-go` for Go, etc.) and live in the matching `capabilities/<stack>/` folder.

The codebase follows **layer-first hexagonal architecture**: `domain/ → application/ → infrastructure/ → entrypoints/`, with all dependencies pointing inward. Full rules in `core/02-architecture.md`.

---

## How the rules are organized

Rules live in two locations:

- **`core/`** — language- and framework-agnostic patterns. Apply to every project regardless of stack.
- **`capabilities/<stack>/`** — rules that activate only for projects using a specific stack. `/setup` selects the capabilities and generates the active rule set.

This document is a **template index**. When you run `/setup`, a personalized `AGENTS.md` is generated for your project that includes only the capability sections that apply.

---

## Rule index

### Core — language-agnostic patterns

#### `core/01-philosophy.md` — Delivery philosophy & external knowledge

*When to read: planning a task, scoping a PR, deciding what to omit; writing code against any third-party library, framework, SDK, or CLI.*

- §1 Build only validated business needs
- §2 Prefer the simplest correct solution
- §30 Vertical slices over horizontal completeness
- §31 Omit before mocking
- §35 Pull requests should be boring to review
- §122 Verify external library APIs against current docs (Context7) before writing code against them

#### `core/02-architecture.md` — Hexagonal architecture & layering

*When to read: creating a new module, adding an adapter, designing a read model, shaping an external response, deciding between class and function.*

- §3 Layer-first hexagonal architecture
- §37 OOP-lite frontier: class for identity/deps/behavior, functions for everything else
- §24 Keep adapters boring
- §14 Keep read models deliberate
- §23 Keep external responses compact

#### `core/04-input-boundaries.md` — Input validation at the perimeter

*When to read: adding an HTTP route, RPC handler, webhook handler, CLI command, or reading env vars.*

- §4 Parse and validate at the perimeter
- §34 Environment variables are input too

#### `core/05-domain-modeling.md` — Domain modeling

*When to read: designing types, naming things, choosing between booleans/unions/enums, handling expected failures, working with money or other units.*

- §22 Keep domain names aligned with the PRD
- §32 Keep naming precise
- §36 Closed domain values come from the domain, not magic strings
- §11 Store units as integers
- §20 Avoid Boolean blindness
- §21 Make illegal states hard to represent
- §19 Use explicit Result types with `code` for expected failures

#### `core/06-commands-and-security.md` — Commands, reads, and authorization

*When to read: writing a use case that changes state, an authorization check, or a mutation endpoint.*

- §27 Security gates belong before domain actions
- §12 Prefer local reasoning over global reasoning
- §28 Use defensive checks even when flow suggests safety
- §13 Mutation APIs should usually return IDs or status, not full entities

#### `core/07-infrastructure.md` — Persistence & external integrations

*When to read: writing repository code, opening a transaction, calling external services, designing webhook handlers.*

- §15 Use bulk-async (Promise.all / asyncio.gather) intentionally
- §16 Keep transactions short and boring
- §17 Model external side effects explicitly
- §18 Make idempotency part of integration design

#### `core/08-testability.md` — Testability & tests

*When to read: writing time- or ID-dependent code, designing dependency injection, writing tests.*

- §25 Do not hide time
- §26 Do not hide randomness or IDs
- §29 Write tests through public boundaries

#### `core/10-cross-cutting.md` — Cross-cutting product rules

*When to read: anything tenant-scoped, designing a critical command, list endpoints, public APIs, schema migrations.*

- §45 `tenantId` is part of `RequestContext` and every repository filter
- §46 Idempotency for critical commands
- §47 Pagination from day one with cursor and max limit
- §48 API and event versioning
- §49 Expand-then-contract migrations

#### `core/12-bdd-and-acceptance.md` — BDD outside-in & acceptance criteria

*When to read: writing a new feature, generating scenarios from a spec, adding step definitions, deciding what gates a merge or pre-push, designing the AFK loop entry point, defining module contracts for parallel work, configuring the visual or API contract gate.*

- §56 `.feature` files live in `features/` by bounded context, not in `tests/`
- §57 Scenarios are written in the ubiquitous language of `CONTEXT.md`, not technical jargon
- §58 Humans approve `.feature` files before commit; the agent reads them but never modifies them autonomously
- §59 Each scenario has a stable ID `scn-NNN` referenced from issues
- §60 Tags `@release` gate merge; `@smoke` gate pre-push; `@manual` requires human
- §61 Step definitions live in `application/steps/`, callable from acceptance runner and unit tests
- §62 Feature files are versioned auditable evidence (living documentation)
- §103 Module contracts (api-contracts + openapi + mocks + architecture) complement `.feature` files for parallel work
- §104 Visual acceptance gate (responsive + dark mode + accessibility + console clean) for features with UI
- §105 API contract fuzz testing (Schemathesis) for public endpoints
- §106 No stub UI past the acceptance gate — mechanical detection in CI

#### `core/13-ralph-and-afk.md` — Ralph & AFK operations

*When to read: configuring `ralph-local.sh`, labeling issues for AFK execution, reviewing PRs produced overnight, debugging a stuck Ralph session, deciding which work is safe to automate.*

- §63 Issues with `ralph-ready` must have at least one `scn-NNN` associated
- §64 `require-human-review` is mandatory for issues touching sensitive domains
- §65 `max-iterations` default is 30; reduce to 10-15 for brownfield
- §66 Exceeding `max-iterations` applies `ralph-blocked`; never force-push, never delete history
- §67 AFK PRs always open as `draft`; merge is always human
- §68 Ralph respects `git-guardrails`: destructive Git operations are blocked at the tool level
- §69 Each Ralph session writes a structured JSON log
- §70 On API 429, retry with exponential backoff; do not parallelize harder
- §107 Agent Teams for intra-feature parallelization (multi-module features with dependency graph)

#### `core/14-brownfield.md` — Working with legacy code

*When to read: touching any module that already has consumers in production, modifying code without tests, planning a migration, fixing a bug in legacy code, refactoring without changing behavior.*

- §71 Characterization tests mandatory before modifying legacy code with coverage < 50%
- §72 Characterization tests document current behavior, even if it looks like a bug
- §73 `/impact-analysis` mandatory when changing > 3 files or crossing bounded contexts
- §74 Strangler pattern for replacements: build new alongside old, route incrementally, kill old
- §75 Brownfield branches use prefix `agent/legacy/<issue-NNN>`
- §76 Never combine a refactor and a behavior change in the same PR

#### `core/15-observability.md` — Logging, metrics, SLOs

*When to read: adding a log line, naming an event, emitting a metric, declaring a new endpoint's SLO, designing the observability port, deciding whether a performance regression should block Ralph.*

- §77 Logs are structured JSON with canonical fields
- §78 Event names use `dot.notation`, past tense for completed events, never free text
- §79 Never log PII in `details`; reference by ID
- §80 Every use case emits at least one structured event on close
- §81 SLOs declared in `docs/slos.md` per public endpoint and per critical command
- §82 Metrics emission goes through `MetricsPort`; OpenTelemetry default, vendor isolated
- §83 Ralph aborts a PR if metrics degrade declared SLOs (gate beyond BDD)

#### `core/16-security-supply-chain.md` — Security & supply chain

*When to read: adding a dependency, writing code that handles secrets, designing auth/authz changes, integrating an external service, preparing a release, planning a security review.*

- §84 Secret scanning runs in pre-commit and CI; commits with leaks are blocked
- §85 Dependency audit in CI; critical CVEs block merge unless documented exception
- §86 SAST on PRs touching auth, crypto, or external I/O
- §87 Threat modeling is mandatory for features that cross a trust boundary
- §88 Secret rotation is automated via a vault; no long-lived secrets in production
- §89 Every release ships with a Software Bill of Materials (SBOM)
- §90 Penetration testing happens quarterly for components on the trust boundary

#### `core/17-bug-handling.md` — Bug handling

*When to read: a bug is reported, discovered during development, or fires off a production alert; deciding whether a fix needs a postmortem; choosing severity for an incoming issue; reviewing a bug-fix PR.*

- §91 Reproduce before diagnose
- §92 Regression test fails-first; the test is written before the fix
- §93 Root cause over symptom; symptom fixes are failure
- §94 One bug, one PR
- §95 Postmortem mandatory for P0 and user-facing P1 bugs
- §96 When the introduction is unclear, bisect; do not guess

The skill `/debug` operationalizes §91-§96 in a six-step flow. Postmortem template lives at `docs/postmortems/TEMPLATE.md`.

#### `core/18-improvements.md` — Improvements (refactor, perf, tech debt, hardening, deps)

*When to read: planning a refactor, profiling a slow endpoint, deciding what tech debt to take on this sprint, hardening a component before audit, bumping a dependency, reviewing a PR labeled `improvement`.*

- §97 Baseline before optimizing; no performance work without measurement
- §98 One improvement, one PR
- §99 Tech debt items are features with explicit ICE rubric
- §100 Dependency upgrades: minor/patch automated, major requires impact analysis + runbook
- §101 Security hardening proactivo requires STRIDE threat model before code
- §102 Refactor without behavior change: existing tests must pass unmodified

The skill `/optimize` operationalizes §97 (performance) in a five-step flow. Refactor (§102), tech debt (§99), security hardening (§101) and dep upgrades (§100) are governed by rules + embedded runbooks; no skill is needed because they reuse existing flows (`/improve-codebase-architecture`, regular feature flow with labels, etc.).

#### `core/19-hooks-and-runtime-guards.md` — Claude Code hooks (PreToolUse, PostToolUse, SessionStart)

*When to read: configuring `.claude/settings.json` for a new project, adding a new hook to the repo, debugging why an agent action was blocked, deciding which observability or guard signals to wire in.*

- §108 WebFetch caching with HTTP revalidation (no blind TTL)
- §109 SessionStart meta-skill injection — adopt only when skill count grows beyond ~15
- §110 Prompt injection guard on write operations (specified, not implemented in this iteration)
- §111 Read injection scanner (specified, not implemented in this iteration)
- §112 Agent-aware context monitor — notify the agent, not just the user
- §113 Hooks are opt-in per project, declared in `.claude/settings.json`

Two hooks are shipped: `hooks/webfetch-cache-pre.js` + `hooks/webfetch-cache-post.js` (implement §108) and `hooks/context-monitor.js` (implements §112). All hooks are Node.js with zero external dependencies.

#### `core/20-agents.md` — Formal Claude Code sub-agents

*When to read: considering whether to formalize a new role as an agent vs. a skill; reviewing why an agent has a specific tool set; integrating an agent into a workflow step.*

- §114 Independent code review is mandatory before any draft PR opens; the reviewer agent runs read-only and cites `§N` violations explicitly
- §115 Postmortem-writer agent for production incidents (specified, deferred)
- §116 Security-auditor agent for compliance-driven hardening (specified, deferred)

One agent is shipped: `agents/reviewer.md` (implements §114). Two are specified for future adoption (§115, §116) — implement only when their triggers arrive.

---

### Capabilities — stack-specific

> Each capability is opt-in. `/setup` activates the ones that apply to your project. The example below shows what the TypeScript + Hono stack looks like.

#### `capabilities/typescript/03-style.md` — TypeScript language style

*When to read: writing or reviewing any TypeScript code. Activates when capability `typescript` is selected.*

- §5 Do not use `any`
- §6 Do not use `as` casts
- §7 Do not use non-null assertions
- §8 Avoid unnecessary mutability
- §9 Use sound operators (`??` vs `||`)
- §10 Numbers are not booleans
- §33 Use readonly types where practical

#### `capabilities/typescript/11-async.md` — TypeScript async behavior & runtime

*When to read: anything with `await`, long-running work, external I/O, streaming, or runtime-specific entrypoints. Activates when capability `typescript` is selected.*

- §50 Do not block the event loop
- §51 No floating promises
- §52 External calls have timeout and AbortSignal
- §53 Bound concurrency over user-controlled arrays
- §54 Use streaming for large or long responses
- §55 Runtime differences live in entrypoints and adapters

#### `capabilities/typescript/12-package-management.md` — Package management & supply-chain hygiene

*When to read: adding, upgrading, or removing a dependency; reviewing a PR that touches `package.json` or the lockfile; configuring CI install or release. Activates when capability `typescript` is selected.*

- §117 Use `pnpm` as the package manager; commit `pnpm-lock.yaml`
- §118 Lifecycle scripts are blocked by default; opt-in via an explicit allowlist
- §119 CI installs with `--frozen-lockfile`; lockfile drift fails the build
- §120 Pin direct dependencies conservatively; auto-merge only patch upgrades
- §121 Verify provenance before release; audit signatures of every dep

#### `capabilities/typescript-hono/09-stack-conventions.md` — Hono / Drizzle / Zod conventions

*When to read: wiring composition root, adding Hono middleware, placing a Zod schema, mapping a `Result` to HTTP, defining an error response, writing a Drizzle repository. Activates when capability `typescript-hono` is selected.*

- §38 Composition root owns dependencies; Hono context is request-scoped only
- §39 Zod schemas live in the layer they belong to
- §40 Middleware ordering: security → identity → context → routes
- §41 Authentication is middleware; authorization is the use case
- §42 Map Result to HTTP at the adapter; `errorHandler` is for unexpected only
- §43 All HTTP errors share a single response shape
- §44 Drizzle schemas are not domain entities

#### `capabilities/python/03-style.md` — Python language style

*When to read: writing or reviewing any Python code. Activates when capability `python` is selected. Assumes a strict-mode type checker (`pyright --strict`, `mypy --strict`, or `pyrefly`).*

- §5-py Do not use `Any`
- §6-py Do not use `cast()` or `# type: ignore`
- §7-py Do not use unsafe optional access (no `assert ... is not None` as narrowing)
- §8-py Avoid unnecessary mutability (no mutable defaults; prefer frozen dataclasses)
- §9-py Use sound operators (no `or` for None-defaulting)
- §10-py Numbers and collections are not booleans
- §33-py Use immutable / frozen types where practical (`frozen=True`, `Sequence`, `Mapping`)

#### `capabilities/python/11-async.md` — Python async behavior & runtime

*When to read: anything with `async`/`await`, long-running work, external I/O, streaming, or runtime-specific entrypoints. Activates when capability `python` is selected.*

- §50-py Do not block the event loop (no sync I/O in async; use `asyncio.to_thread`)
- §51-py No untracked `create_task` (no floating coroutines); use `TaskGroup`
- §52-py External calls have timeout and cancellation (`asyncio.timeout(...)`)
- §53-py Bound concurrency over user-controlled arrays (`asyncio.Semaphore`)
- §54-py Use streaming for large or long responses (FastAPI `StreamingResponse`)
- §55-py Runtime differences live in entrypoints and adapters (uvicorn, Lambda, hypercorn)

#### `capabilities/python/12-package-management.md` — Package management & supply-chain hygiene

*When to read: adding, upgrading, or removing a dependency; reviewing a PR that touches `pyproject.toml` or the lockfile; configuring CI install or release. Activates when capability `python` is selected.*

- §117-py Use `uv` as the package manager; commit `uv.lock`
- §118-py Build hooks are blocked by default; wheel-only installs with explicit allowlist
- §119-py CI installs with `--frozen`; lockfile drift fails the build
- §120-py Pin direct dependencies conservatively (`~=X.Y`); auto-merge only patch upgrades
- §121-py Verify provenance before release (`pip-audit`, Sigstore attestations)

#### `capabilities/python-fastapi/09-stack-conventions.md` — FastAPI / SQLAlchemy / Pydantic conventions

*When to read: wiring composition root, adding FastAPI middleware or dependency, placing a Pydantic schema, mapping a `Result` to HTTP, defining an error response, writing a SQLAlchemy repository. Activates when capability `python-fastapi` is selected.*

- §38-py Composition root owns dependencies; FastAPI `Depends` is for request-scoped only
- §39-py Pydantic schemas live in the layer they belong to
- §40-py Middleware ordering: security → identity → context → routes (register reverse-order)
- §41-py Authentication is middleware; authorization is the use case
- §42-py Map Result to HTTP at the adapter; exception handlers are for unexpected only
- §43-py All HTTP errors share a single response shape
- §44-py SQLAlchemy models are not domain entities

---

### Capabilities — planned (not yet shipped)

These will follow the same template as the shipped capabilities above. Track progress in the README roadmap.

- `capabilities/typescript-fastify/` — Fastify / TypeORM-or-Prisma / Zod-or-TypeBox
- `capabilities/go/` — Go language baseline
- `capabilities/go-echo/` — Go + Echo framework conventions

---

## A PR should answer one question

> What user-visible behavior changed?

If that answer is unclear, the PR is probably too broad or too horizontal — re-read §30 and §35.

A PR generated by Ralph (Night Shift) additionally must answer:

> Which `scn-NNN` does this satisfy, and does `/run-acceptance` pass?

If the answer is "no scenario" — the issue should not have been `ralph-ready` (see §63).

---

## Examples in topical files

The rule files include illustrative code examples. **These examples use a sample marketplace domain for clarity** (Companies, Listings, Quotes, SOWs, Providers). When adopting Stormhelm in your project, treat them as templates: the **patterns** transfer directly, the **vocabulary** comes from your own `CONTEXT.md` (see §22).

---

## Provenance

The core rule set (§1 – §55) is **inspired by and adapted from** the engineering guidelines published by the Belong A2A Marketplace team. Their public AGENTS.md is one of the strongest practical implementations of the hierarchical agent-rules pattern available. Stormhelm preserves the rule numbering as a sign of respect to the original work and extends it (§56 – §122) with patterns required for AI-agent operation: BDD outside-in (§56–§62), Ralph/AFK discipline (§63–§70), brownfield protocols (§71–§76), observability (§77–§83), supply-chain security (§84–§90), bug handling (§91–§96), improvements (§97–§102), module contracts + Agent Teams (§103–§107), hooks & runtime guards (§108–§113), formal sub-agents (§114–§116), package management & supply-chain hygiene (§117–§121), and external-API verification via Context7 (§122).

The structural pattern (hierarchical `AGENTS.md` + topical files loaded on demand) comes from **`mattpocock/skills`** (AI Hero).

---

## Total rule count

**§1 – §122** in the shipped capabilities (`core` + `typescript` + `typescript-hono`). New capabilities extend the numbering without renumbering existing rules.
