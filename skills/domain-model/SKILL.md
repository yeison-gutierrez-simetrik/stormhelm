---
name: domain-model
description: |
  Refines `docs/CONTEXT.md` with the ubiquitous language of the domain and produces
  or updates ADRs in `docs/adr/` when the new vocabulary implies architectural
  decisions. Detects vocabulary drift between PRD, code, and conversation. Adopted
  from Matt Pocock's `/domain-model` skill (AI Hero).
  Use when: after /grill-me has resolved the design tree, before /specify writes
  intent. Also use when an ADR-worthy decision emerges mid-feature, or when a
  brownfield analysis (B3) reveals the code's real vocabulary differs from the
  aspirational docs.
---

# /domain-model — Ubiquitous Language & ADRs

## Purpose

A feature is not specified until the vocabulary is settled. If the spec uses "user" and the code uses "actor" and the PRD uses "principal," the agent will produce three different mental models and the team will too. `/domain-model` resolves this **before** the spec is written by updating `CONTEXT.md` with the canonical terms and emitting an ADR when the terminology choice has architectural consequences.

For brownfield work (B3 in the brownfield sub-flow), this skill detects what the code **actually** says vs. what we wish it said — and forces the reconciliation explicitly.

## When to invoke

- After `/grill-me` (Step 4 of `/feature`).
- Before `/specify`, always.
- When `/grill-with-docs` finds vocabulary drift between code and docs.
- When a design discussion introduces a new entity, value object, or state machine.

## When NOT to invoke

- For renaming exercises with no domain semantics (those are refactors §102, not domain modeling).
- For UI-only labels (those live in i18n/strings, not in `CONTEXT.md`).

## Inputs

- Output of `/grill-me` (`docs/decisions/grilling/<slug>-*.md`).
- Current `docs/CONTEXT.md`.
- Existing `docs/adr/` (to avoid duplicating prior decisions).
- For brownfield: the actual code paths being modified.

## Outputs

- Updated `docs/CONTEXT.md` (atomic, single commit `docs: update ubiquitous language for <slug>`).
- 0..N new ADRs in `docs/adr/NNNN-<slug>.md` when a vocabulary choice is also an architectural one.
- A vocabulary delta summary returned to the workflow (added / renamed / deprecated terms).

## Rule files to load (progressive disclosure)

Domain modeling is the most architecturally-loaded skill in the workflow — vocabulary choices propagate into types, file paths, and database schemas. Load before refining:

- **Always:**
  - `docs/engineering/core/02-architecture.md` — §3 (hexagonal layering). Domain vocabulary lives in `src/domain/` and cannot import from infrastructure; the vocabulary delta must respect this. §37 (OOP-lite frontier) constrains whether a term becomes a class with behavior or a `type` of pure data.
  - `docs/engineering/core/05-domain-modeling.md` — **full read**. Every rule applies: §11 (integers for units), §19 (Result types with `code`), §20 (no boolean blindness), §21 (illegal states hard to represent), §22 (PRD vocabulary), §32 (precise naming), §36 (closed domain values).

- **If a new term is a closed set of values (state, kind, role):**
  - `docs/engineering/core/05-domain-modeling.md` §36 — the value belongs as a string literal union or `as const` map in the domain module that owns it, never as a magic string in adapters.

- **If a new term carries identity or behavior:**
  - `docs/engineering/core/02-architecture.md` §37 — decide class vs type. Anemic class = data wearing a class = use `type` instead.

- **If TypeScript capability is active and naming will become type names:**
  - `docs/engineering/capabilities/typescript/03-style.md` — §5-§10, §33 (no `any`, no `as`, readonly where practical). Types named here will live in production.

- **If the change is brownfield (B3 step):**
  - `docs/engineering/core/14-brownfield.md` §72 — vocabulary in the code wins for now; ADR documents the planned migration. Never rename the code in the same PR that introduces a new term.

The ADRs this skill emits must cite the §N that justified them, so the future reviewer agent can verify the architectural decisions remained consistent.

## Workflow

### Step 1 — Read and inventory

Read the grilling output. Extract every domain noun (entity, value object, state, role, event). Extract every domain verb (action, transition).

Read current `CONTEXT.md`. Build a delta:

- **New terms** (in grilling, not in CONTEXT).
- **Drift terms** (different word for same concept in grilling vs CONTEXT).
- **Vague terms** (used in grilling but not yet defined).
- **Unused terms** (in CONTEXT but feature does not need them — informational only, not deleted).

### Step 2 — Resolve drift

For each drift term, decide which name wins:

- Prefer the term used in the **PRD** (§22).
- Prefer the term that matches `docs/constitution.md` if the constitution speaks to it.
- Prefer the **more specific** term when both are valid (`Provider` over `User` when the actor is always a Provider).
- When the grilling answer contradicts the code (brownfield), the **code wins for now** and an ADR is opened to migrate the vocabulary intentionally.

### Step 3 — Update `CONTEXT.md`

Every term entry uses a **Term / definition / `_Avoid_:` triple** so the rejected wordings are explicit, not implicit. Drift later happens because deprecated terms creep back in; an explicit `_Avoid_:` line gives the reviewer agent something to grep for.

**§122 invocation (PR-Cap).** Before writing any term that names a third-party library, framework, SDK, or external API into `CONTEXT.md`, **run a Context7 lookup against the specific symbols the term implies**. Common cases:

- A new ORM (e.g. `drizzle`) being introduced → verify the schema-builder API matches what the spec assumes.
- A new auth library (e.g. `better-auth`) being introduced → verify endpoints and method signatures the ADR depends on.
- A new payment provider, queue, observability stack, etc. → verify the SDK methods the application port will call.

If Context7 returns no match or contradicts what the ADR/spec assumes (e.g. stable Better Auth does not ship RFC 7662 introspection endpoints — real incident in belong-marketplace), **stop and surface the discrepancy** before writing the term into the canonical vocabulary. Catching the mismatch at `/domain-model` time is exponentially cheaper than catching it mid-`/tdd` (see §122 "When to verify"). The Context7 lookup is logged in the session transcript so the reviewer agent can verify the rule was honored.

```markdown
# Ubiquitous Language

## Entities

**Provider** — A Company that publishes Listings and accepts Quotes.
_Avoid_: "supplier", "vendor", "service_request" — these were earlier names rejected during `/grill-me`.

**Listing** — A Provider's offer to perform a Service. Has states: sandbox, pending_verification, verified, published.
_Avoid_: "service_offer", "draft listing" (use state `sandbox` instead).

## Value objects

**TenantId** — opaque identifier for the tenant scope (§45).
_Avoid_: "companyId" when scoping data; reserve `companyId` for the `Company` entity reference.

**PriceCents** — non-negative integer; never use floats (§11).
_Avoid_: "price", "amount", "priceDollars".

## States

**ListingState** — string literal union: `"sandbox" | "pending_verification" | "verified" | "published"` (§36, defined in `src/domain/listings/listing-state.ts`).
_Avoid_: numeric codes, boolean flags, `is_draft` / `is_active` mirror fields.

## Events

**listing.published.v1** — emitted when a Listing transitions to published. Schema in `events.md`.
_Avoid_: "listing_created", "listing.activated".

## Anti-vocabulary (deprecated terms, do not use)
- ~~service_request~~ — use **Quote**.
- ~~order~~ — use **SOW**.
```

The two locations interact:
- **`_Avoid_:`** under a term records wordings rejected **for that specific term**. It is the local "considered options" record, equivalent to the ADR's Considered Options section.
- **`## Anti-vocabulary`** at the bottom records terms that were once canonical and are now deprecated. Use it sparingly — preferring `_Avoid_:` on the replacement term keeps the rejection close to the live term.

Updates are **atomic**: one commit, message `docs: update ubiquitous language for <slug>`. Never delete previously-defined terms in the same commit as adding new ones (that's a separate "deprecate" commit).

### Step 4 — Emit ADRs when vocabulary implies architecture

If a vocabulary choice locks an architectural decision, emit an ADR:

```markdown
# ADR 0007 — Adopt `Listing` as the canonical term over `ServiceListing`

**Date:** YYYY-MM-DD
**Status:** Accepted
**Context:** PRD uses "Listing"; code currently has `ServiceListing` (~30 imports).
**Decision:** Migrate to `Listing` over 2 releases (expand-then-contract §49).
**Consequences:** Drizzle table renames in migration 0023; type renames in src/domain/listings/.
**Alternatives considered:** Keep both as aliases. Rejected — duplication of vocabulary §22.
```

ADRs are numbered sequentially. Check `ls docs/adr/` for the next number.

### Step 5 — Return the delta to the workflow

The skill outputs a brief summary that downstream skills consume:

```markdown
## Vocabulary delta — <slug>

**Added (5):** Provider, Listing, Quote, SOW, ProviderVerification
**Renamed (1):** service_request → Quote (ADR 0007)
**Deprecated (0):**

**Open ADRs from this run:** 0007

Next: invoke /specify with this vocabulary loaded.
```

## Integration with the framework

- **Invoked by `/feature` Step 4**.
- **Output consumed by `/specify` and `/to-scenarios`**: they MUST use the ubiquitous language settled here.
- **Read by `reviewer` agent**: vocabulary drift between code and `CONTEXT.md` becomes a §22 finding.
- **Read by brownfield sub-flow B3**: surface drift before any code change.

## Attribution

Adapted from `/domain-model` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). The "ubiquitous language as agent context" pattern derives from Domain-Driven Design (Evans 2003) applied to AI workflows.

## What this skill never does

- Rename terms in source code (that's `/tdd` or a separate refactor §102 PR).
- Add terms not surfaced by `/grill-me` or `/grill-with-docs`.
- Delete defined terms without an explicit deprecation step.
- Edit `docs/constitution.md` (that's `/constitution`).
