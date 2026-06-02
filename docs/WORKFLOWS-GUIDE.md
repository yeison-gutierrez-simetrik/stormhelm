# Stormhelm — Development Workflows Guide

> **Audience:** developers adopting Stormhelm on a project who need to know how each flow runs, what each step produces, and where the human must step in.
>
> **Reading prerequisites:** root `README.md` (what Stormhelm is), `docs/engineering/AGENTS.md` (rule index). You don't need to have read all 122 rules — this guide invokes them when they apply.
>
> **This guide uses a running example:** *"A Customer leaves a review (1-5 stars + optional comment) about a Provider after completing a Quote."* It is referenced as **`provider-review`** throughout the document.

---

## Table of contents

1. [Workflow philosophy](#1-workflow-philosophy)
2. [Anatomy of a HITL (Human-In-The-Loop)](#2-anatomy-of-a-hitl-human-in-the-loop)
3. [Initial project setup](#3-initial-project-setup)
4. [Main flow: greenfield feature (`/feature` or manual)](#4-main-flow-greenfield-feature-feature-or-manual)
5. [Bug fix flow (`/debug`)](#5-bug-fix-flow-debug)
6. [Improvement flow (`/optimize` and others)](#6-improvement-flow-optimize-and-others)
7. [Brownfield flow (sub-flow B1-B5)](#7-brownfield-flow-sub-flow-b1-b5)
8. [Inventory of HITLs and responsibilities](#8-inventory-of-hitls-and-responsibilities)
9. [Quick reference — skills, inputs, outputs](#9-quick-reference--skills-inputs-outputs)

---

## 1. Workflow philosophy

Stormhelm does not automate development. **It disciplines it.** The framework is designed around three operational principles:

1. **The human directs, the agents execute.** Business, architecture, and acceptance decisions live with the human. Mechanical execution (writing tests, implementing, validating gates) is delegable.
2. **Every workflow artifact is reviewable, versionable, and auditable.** There is no "magic" — every decision produces a file, every gate produces a report, every PR produces evidence.
3. **Ceremony is derived, not configured (ADR-0002).** How much process a piece of work carries is a property of *that feature*, computed from detectors (`scripts/detect-ceremony.mjs` → `feature:single-module`/`multi-module`/`cross-context`; sensitive-path scan → `require-human-review`), **not** a project-wide "lightweight vs compliance" setting you pick once at `/setup`. A trivial CRUD slice carries little ceremony; the moment a slice touches `auth/` or spans three modules, the detectors escalate it and `/specify` requires the matching sections. Classification is recorded as auditable GitHub labels, overridable only by a loud label flip — never a silent frontmatter field. Escalation is one-way (auto-promote, never auto-degrade; `INV-6` blocks merge if a slice grows heavier than its labels). This is why there is no ceremony mode prompt in `/setup`.

### The 4 main flows

| Flow | Trigger | Main skill | Typical duration |
|---|---|---|---|
| **Greenfield feature** | New business capability | `/feature` (orchestrator) or manual skill invocation | 1-3 days |
| **Bug fix** | Reported defect | `/debug` | 2-8 hours |
| **Improvement** | Optimization, refactor, tech debt, dep upgrade, proactive hardening | `/optimize`, `/improve-codebase-architecture`, etc. | Variable |
| **Brownfield** | Modifying legacy code without coverage | Sub-flow B1-B5 (precedes `/feature`) | +30-50% over greenfield |

### Manual vs orchestrated mode

Each flow can be run two ways:

- **Orchestrated** (`/feature`, `/debug`): a single command runs all steps.
- **Manual** (invoking individual skills): the developer goes through each step with granular control.

**Initial recommendation:** run the first 2-3 features manually to get a feel for each skill, then switch to orchestrated. Manual mode is fully legitimate — the value is iterating one gate at a time.

**One caveat for manual mode — the pre-merge gates have ordering/dedup that's easy to lose à-la-carte.** The `reviewer` agent (§114) is invoked **once**, by `/run-acceptance`; running `/code-review` *and* `/run-acceptance` double-invokes it. The traceability matrix is a `-draft` pre-merge and `-final` post-merge. `/check-consistency` runs *before* the matrix. So when gating manually, run **`/gates`** — the thin orchestrator that applies exactly these rules — rather than invoking the four gate skills by hand. (`/code-review` stays available for an *ad-hoc* review outside a gating run.)

---

## 2. Anatomy of a HITL (Human-In-The-Loop)

A HITL is a point where **the flow stops and explicitly waits for the human** before continuing. Stormhelm has deliberately sparse HITLs — one for each decision that **only a human can make** without loss of value.

> **Nomenclature (single source of truth).** *HITL* (Human-In-The-Loop) and *HUMAN CHECKPOINT* are **synonyms**. The per-feature flow has **3 HITLs**: `#1` scenarios (Step 7), `#2` threat-model (conditional — sensitive only), `#3` merge (Step 12 final). `/feature` presents them as its **2 mandatory HUMAN CHECKPOINTS**: **CHECKPOINT 1 = HITL #1** (scenarios), **CHECKPOINT 2 = HITL #3** (merge); HITL #2 is the conditional gate. `#0a`/`#0b` are **bootstrap** gates (once per project), not per-feature. Full inventory (**9** HITLs, all flows) in section 8.

### Types of HITL

| Type | Behavior | Blocks workflow |
|---|---|---|
| **Hard checkpoint** | The skill emits a prompt and waits for an explicit response (`yes`, `approve`, `edit:<notes>`, `block`). The workflow does not continue until it receives the response. | **Yes** |
| **Soft checkpoint** | The skill emits a notification or suggestion; the human may act but the workflow continues if there is no objection within a margin. | No |
| **Retroactive approval** | The skill runs automatically, but the output requires a human signature before becoming authoritative (example: threat model draft). | Partial |

Stormhelm uses **mainly hard checkpoints** because soft ones tend to be ignored. The philosophy: if a decision requires a human, **stop and ask**.

### Human responsibility at each HITL

Each HITL has a **single clear human responsibility**. The human is not "supervising everything" — they are making **this specific decision**:

| Responsibility | Required human skill | Typical time |
|---|---|---|
| Approve the spec/scenarios as a contract | Product/domain knowledge | 5-15 min |
| Approve the threat model as a security contract | Security + business risk knowledge | 10-30 min |
| Approve/reject draft PR | Technical knowledge + judgment | 15-45 min |
| Sign off the postmortem as blameless | Senior engineer / tech lead | 30-90 min |
| Decide descope vs implement | Product owner / tech lead | 5-15 min |

**Anti-pattern:** the human "skims everything" before continuing. That is noise, not value. The HITL exists to force a decision, not to stage supervision theater.

---

## 3. Initial project setup

Before any flow, the project needs:

### Step A: `/setup` (interactive wizard, once)

```
/setup
```

**HITL involved:** yes, the wizard has 6-8 questions. The human answers:
1. Project type (greenfield / brownfield)
2. Primary language and framework
3. Persistence layer
4. Validation library
5. Deployment target
6. Compliance requirements (SOC2, GDPR, etc.)
7. Vocabulary seed (5-15 domain terms)

**Output:**

```
project-root/
├── docs/
│   ├── engineering/
│   │   ├── AGENTS.md                  # personalized to the chosen stack
│   │   ├── core/                       # 17 neutral rule files
│   │   └── capabilities/<stack>/        # stack-specific rules
│   ├── constitution.md                  # empty TEMPLATE
│   ├── CONTEXT.md                       # with seed vocabulary
│   ├── slos.md                          # empty
│   ├── events.md                        # template for registry
│   ├── adr/.keep
│   ├── audit/incidents.md               # template
│   ├── postmortems/TEMPLATE.md          # postmortem template
│   ├── threat-models/.keep
│   └── perf-baselines/.keep
├── features/.keep                       # .feature files will go here
├── issues/.keep
├── .planning/                            # gitignored
│   ├── budget.txt
│   └── (subdirs for grilling/, acceptance/, reviews/, etc.)
├── .claude/
│   ├── settings.json                    # hooks + MCP + permissions
│   ├── agents/reviewer.md               # symlink to the reviewer agent
│   ├── hooks.config.json
│   └── webfetch-cache/                  # gitignored
├── hooks/                                # executable scripts
├── ralph-local.sh                       # template tailored to the stack
└── .gitleaks.toml, .pre-commit-config.yaml
```

**Human responsibility:** answer honestly. If you're torn between options, choose the most restrictive — you can always relax it later with an ADR.

### Step B: `/constitution` (6-question interview, once)

```
/constitution
```

**HITL involved:** yes, a 6-question interview with discussion.

**Output:** `docs/constitution.md` with principles `C.1`, `C.2`, ... Each with a title, rationale, relation to §N, and example. Takes 30-60 min the first time.

**Human responsibility:** declare the project's non-negotiable tenets. At least 2 humans co-sign. (See the `/constitution` detail in `skills/constitution/SKILL.md`.)

### Step C: `/onboard` (when a new developer joins)

```
/onboard
```

**HITL involved:** no — it's informational.

**Output:** orientation for the developer on where each thing lives and how each skill is invoked.

---

## 4. Main flow: greenfield feature (`/feature` or manual)

### Running example

> **`provider-review`** — A Customer who has completed a Quote with a Provider can leave a review: mandatory rating (1-5 stars) + optional comment (max 1000 chars). On publication, the Provider receives an email notification. Reviews are publicly visible on the Provider's profile.

### Characteristics of the example feature

- **Greenfield** — the Reviews module does not exist yet.
- **Single bounded context** — everything lives in `src/domain/reviews/`.
- **UI involved** — rating form + public display.
- **Public API** — endpoints `/v1/reviews` and `/v1/providers/:id/reviews`.
- **Sensitive (PII)** — the comment may contain names, emails (user PII, not the Provider's).
- **Multi-actor** — Customer creates, Provider reads, public reads.
- **Introduces capability** — the project's first email adapter.

This feature exercises the 3 main HITLs of the flow + the capability-promotion HITL.

---

### Step 1 — Pre-flight check

**Skill invoked:** none (internal verification by the orchestrator or by the developer manually).

**Input:** the project structure.

**Processing:**

```bash
# Verifications:
ls docs/engineering/AGENTS.md docs/constitution.md docs/CONTEXT.md
git status                          # working tree clean
ls .planning/budget.txt             # exists, > 0
```

**Output:** OK or stop with a clear diagnosis.

**HITL:** no.

**Rule validation:** §setup pre-conditions.

---

### Step 2 — Read constitution

**Skill invoked:** none (orchestrator-internal, reading).

**Input:**
- `docs/engineering/AGENTS.md` (active capabilities).
- `docs/constitution.md` (tenets).
- The feature description.

**Processing:**

The orchestrator (or the developer mentally) detects:

```
Active capabilities: typescript, typescript-hono, drizzle, zod
Feature touches sensitive paths? → YES (PII in comments) → §64 require-human-review
Multi-module? → NO (single context: reviews)
UI involved? → YES → §104 visual gate
Public API endpoints? → YES → §105 Schemathesis
Introduces new capability? → YES (first email adapter) → §63 introduces-capability:email
SLO declared for this endpoint? → Will be checked at /specify with §3b SLO source rule
```

**Output:** a mental or explicit "mode sheet" in `.planning/feature-sessions/provider-review.modes.md`:

```markdown
# Feature mode detection — provider-review
- Multi-module: NO
- Sensitive: YES (PII in comments)
- UI: YES
- Public API: YES → Schemathesis
- New capability: email (first time)
- Therefore:
  - HITL approval for threat model (§87 + checkpoint) — required
  - HITL approval for capability promotion (post-PR)
  - shift:hitl on the slice (no ralph-ready)
```

**HITL:** no.

**Rule validation:** §107 mode detection, §64 sensitive detection, §63 capability detection.

---

### Step 3 — `/grill-me`

**Skill invoked:** `/grill-me`.

**Input:**
- Feature description.
- `docs/CONTEXT.md` (vocabulary).
- `docs/constitution.md`.

**Progressive rule loading:**
- `core/01-philosophy.md` (§1, §2, §30, §31, §35).
- `core/05-domain-modeling.md` (§22 vocabulary).
- `core/02-architecture.md` (§3 — feature touches domain + adapter + repo + email).
- `core/16-security-supply-chain.md` (§87 — sensitive).

**Processing:**

The skill detects complexity: multi-actor + 4 potential failure cases + 1 new capability → bucket **"Multiple actors OR cross-context flow"** → target **20-40 questions**.

It runs 28 representative questions:

```
Q1: Is the rating mandatory? → YES
Q2: Is the comment mandatory? → NO, optional
Q3: Rating range → integers 1-5 (no 0, no decimals)
Q4: Max comment length → 1000 chars
Q5: Can a Customer review the same Provider multiple times? → NO, one review per (Customer, Quote completed)
Q6: Editable after publication? → YES, within 7 days; then frozen
Q7: Deletable by the Customer? → soft delete within 30 days; then frozen
Q8: Visible to everyone before the email to the Provider? → NO, email first, then public
Q9: Notification to the Provider — synchronous? → asynchronous via outbox (§17)
Q10: Can the Provider reply? → out of scope for v1 (§31)
Q11: Comment moderation (profanity/abuse)? → out of scope for v1; flag system is a future feature
Q12: Public review filtering? → sort by date desc; no filters in v1
Q13: "Helpful" vote system? → out of scope
Q14: Once frozen, can it be edited as admin? → YES, via admin panel (separate from this feature)
Q15: Multi-tenant? → YES, reviews scoped per tenant
Q16: Does a GDPR delete request from the Customer remove the review? → YES, hard delete of the comment, keep the anonymized rating
Q17: Minimum Customer age to review? → not applicable for v1
Q18-Q28: variants on email format, errors, retry, etc.
```

**Output:**

`docs/decisions/grilling/provider-review-20260601.md`:

```markdown
# Grilling session — provider-review

**Date:** 2026-06-01
**Feature:** Customer leaves Review for Provider after Quote completion

## Resolved design tree

### Actor: Customer
- Q1-Q7: mandatory rating (1-5), optional comment (max 1000), editable 7d, soft-delete 30d
- Q15-Q16: tenant scope, GDPR delete

### Actor: Provider (asynchronous reader)
- Q9: receives email notification after review publishes
- Q10: cannot reply in v1 (§31)

### Actor: Public (read-only)
- Q8: reviews visible publicly after publication
- Q12: sorted by date desc, no filters v1

## Confirmed assumptions
- A1: One review per (Customer, Quote_id), enforced by unique constraint
- A2: Review state machine: published → editable (7d) → frozen → soft-deleted (30d) → hard-deleted
- A3: Email notification is fire-and-forget via outbox; failures don't roll back the review

## Open questions
- OQ-1 (non-blocking): Is spam protection necessary? → default: rate limit middleware (§46) is enough for v1

## Shared mental model
[3-paragraph summary]
```

**HITL:** no formal one (it's a developer-agent dialogue).

**Human responsibility:** answer honestly and confirm the shared mental model at the end.

**Rule validation:** §1 build only validated needs (Q10, Q11, Q13 marked out-of-scope), §22 vocabulary (Customer, Quote, Provider, Review).

---

### Step 4 — `/domain-model`

**Skill invoked:** `/domain-model`.

**Input:**
- `docs/decisions/grilling/provider-review-20260601.md`.
- `docs/CONTEXT.md`.
- `docs/adr/`.

**Progressive rule loading:**
- `core/02-architecture.md` (§3, §37 — class vs type).
- `core/05-domain-modeling.md` (full read).
- `capabilities/typescript/03-style.md` (§5-§10, §33).

**Processing:**

Decisions taken:

1. **New term:** `Review` added to CONTEXT.md (entity, not value object — it has identity and behavior `edit()`, `softDelete()`, `freeze()`).
2. **Rating:** value object `Rating` with factory `Rating.from(n: number): Result<Rating, "INVALID_RATING">` (§19).
3. **ReviewState:** closed set `"published" | "editable_window" | "frozen" | "soft_deleted"` (§36) in `src/domain/reviews/review-state.ts`.
4. **ReviewComment:** optional value object, `readonly value: string | null`.
5. **ADR emitted:** `0003-review-as-entity-with-lifecycle.md` justifying that Review is an entity (not a value object) because it has its own lifecycle.

**Output:**

`docs/CONTEXT.md` updated:

```markdown
## Entities (added)
- **Review** — entity within Reviews context. State machine: published → editable_window → frozen → soft_deleted. Owned by Customer; references Provider + Quote.

## Value objects (added)
- **Rating** — integer 1-5, factory-validated (§19).
- **ReviewComment** — optional string, max 1000 chars after trim.

## States (added)
- **ReviewState** — `"published" | "editable_window" | "frozen" | "soft_deleted"` (§36, in `src/domain/reviews/review-state.ts`).

## Events (will be added by /specify, registered after /tdd)
- **review.published.v1**
- **review.edited.v1**
- **review.soft_deleted.v1**
```

`docs/adr/0003-review-as-entity-with-lifecycle.md`:

```markdown
# ADR 0003 — Review as entity with lifecycle, not value object

**Date:** 2026-06-01
**Status:** Accepted
**Context:** Review has identity (one per (Customer, Quote)), state machine, and behavior
  (`edit`, `softDelete`, `freeze`). Per §37, this qualifies as a class entity.
**Decision:** `class Review` with constructor + methods, owned by Reviews aggregate.
**Consequences:**
  - New table `reviews` in DB (migration in /plan step).
  - Domain code: `src/domain/reviews/review.ts`.
  - Outbox event publication on each transition.
**Alternatives:** Embedded in Quote as `quote.review` value object — rejected
  (Review has lifecycle independent of Quote post-completion).
```

**HITL:** no formal one.

**Human responsibility:** review the CONTEXT.md delta and the ADR. If you disagree, request a revision.

**Validation:** §22, §36 (closed set), §37 (entity vs value object).

---

### Step 5 — `/specify`

**Skill invoked:** `/specify`.

**Input:**
- `docs/decisions/grilling/provider-review-20260601.md`.
- `docs/CONTEXT.md` (updated by Step 4).
- `docs/constitution.md`.
- `docs/adr/0003-review-as-entity-with-lifecycle.md`.

**Progressive rule loading:**
- `core/01-philosophy.md` (§1, §35).
- `core/05-domain-modeling.md` (§22).
- `core/10-cross-cutting.md` (§45 tenant — reviews scoped).
- `core/16-security-supply-chain.md` (§87 — sensitive).

**Applying improvement #3 (mandatory SLO source):**

When drafting the latency NFR, the skill stops:

> *"NFR-N mentions p95 latency target. No baseline exists (greenfield). Grilling doesn't mention latency. Constitution C.7 declares default 'public API p95 ≤ 500 ms'. Apply this default? (y/n)"*

The developer answers: **y**.

**Output:**

`docs/specs/provider-review.md`:

```markdown
# Provider review — Spec

**Slug:** provider-review
**Status:** Draft
**Date:** 2026-06-01

## What changes after this ships

After completing a Quote, Customers can leave a Review (1-5 stars + optional comment)
about the Provider they worked with. The Provider receives an email notification
when the Review publishes. Reviews are publicly visible on the Provider's profile.

## Why

PRD §5.3 (trust signals). Public reviews are the primary signal Customers use to
choose Providers; we cannot validate the Customer-Provider matching loop without
this primitive.

## Actors and their goals

### Customer
- **Goal:** share my experience with a Provider after our engagement.

### Provider (asynchronous reader)
- **Goal:** be notified when I receive a Review so I can adjust my offering.

### Público (read-only)
- **Goal:** browse Reviews on a Provider's profile to evaluate trustworthiness.

## Functional requirements

- **FR-1.** A Customer who has completed a Quote with a Provider can submit a Review
  with a Rating (1-5) and optional ReviewComment (max 1000 chars after trim).
- **FR-2.** Reviews are uniquely keyed by (CustomerId, QuoteId). A second submission
  for the same pair MUST be rejected with code `REVIEW_ALREADY_EXISTS`.
- **FR-3.** Reviews are in state `published` immediately upon creation. After
  7 days they transition to `frozen` (read-only for the Customer).
- **FR-4.** The Customer can `edit` a Review while in `editable_window` (within 7 days).
- **FR-5.** The Customer can `softDelete` a Review within 30 days. After 30 days,
  the comment is hard-deleted (GDPR Article 17); the anonymized rating remains.
- **FR-6.** Upon Review publication, an email notification MUST be enqueued to the
  Provider (async via outbox, §17). Email failure does NOT roll back the Review.
- **FR-7.** Reviews are visible publicly via `GET /v1/providers/:id/reviews`,
  ordered by creation date descending.
- **FR-8.** Only the owning Customer (within their tenant) can edit or delete their Review (§27, §45).

## Non-functional requirements

- **NFR-1.** POST /v1/reviews p95 latency ≤ 500 ms. **Source: constitution C.7** (public API default).
- **NFR-2.** GET /v1/providers/:id/reviews p95 latency ≤ 300 ms. **Source: constitution C.7** (read-heavy default).
- **NFR-3.** Tenant isolation enforced at data layer (§45).
- **NFR-4.** Idempotency support via Idempotency-Key header on POST (§46).
- **NFR-5.** Public read endpoint must paginate with cursor (§47), max 50 per page.

## Out of scope (v1)

- Provider reply to reviews.
- Moderation / profanity filtering.
- "Helpful" voting on reviews.
- Filtering public reviews by rating or recency beyond date desc.
- Admin edit panel (separate feature).

## Constraints

- Constitution: C.1 hexagonal, C.6 tenant isolation, C.8 PII retention (comment is PII).
- Compliance: GDPR — comment is PII; hard-delete within 30 days of customer request.
- Introduces capability: `email` (first email adapter — see §63).
```

**HITL:** no formal one (Status: Draft).

**Human responsibility:** none in this step; it comes in Step 7.

**Validation:** §1 validated business needs, §22 vocabulary, §3b SLO source, §31 explicit out-of-scope.

---

### Step 6 — `/clarify`

**Skill invoked:** `/clarify`.

**Input:** `docs/specs/provider-review.md` (Status: Draft).

**Applying improvement #2 (systematic 7-category checklist):**

The skill explicitly runs each category. It finds 8 ambiguities:

```
[x] Units & precision
  - "max 1000 chars after trim" — does it count whitespace in the middle? → YES.
  - "7 days editable" — from creation? → from createdAt UTC.
  - "30 days soft-delete" — from creation or from the delete request? → from the delete request.

[x] Boundaries (inclusive/exclusive)
  - "max 1000 chars" — inclusive of 1000 or up to 999? → inclusive of 1000.

[x] State machine
  - Can published jump straight to soft_deleted before 7 days? → YES (editable_window includes the delete option).

[x] Defaults vs required
  - ReviewComment absent vs empty string → absent and empty string are equivalent; both persist as NULL.

[x] Error semantics
  - Explicit codes: REVIEW_ALREADY_EXISTS, QUOTE_NOT_COMPLETED, COMMENT_TOO_LONG, FORBIDDEN, UNAUTHORIZED, REVIEW_FROZEN, REVIEW_NOT_FOUND.

[x] Concurrency
  - Two simultaneous requests from the same Customer for the same Quote? → first-write-wins via DB unique constraint + 409 CONFLICT.

[x] Tenancy (§45)
  - Cross-tenant attempts? → 404 (no leak FORBIDDEN vs NOT_FOUND signal).

[x] Compliance & retention
  - "Anonymized rating remains after hard-delete" — what does it mean? → the rating is preserved with customerId=null, comment=null, only the rating numeric value persisted.
```

**Output:** `docs/specs/provider-review.md` updated to Status: Clarified with a clarifications log.

**HITL:** no formal one.

**Validation:** §57 (vocabulary), systematic checklist improvement #2.

---

### Step 7 — `/to-scenarios` (⛔ HITL #1)

**Skill invoked:** `/to-scenarios`.

**Input:** `docs/specs/provider-review.md` (Status: Clarified).

**Processing:** generates a `.feature` draft with scenarios covering each FR + failure variants.

**Output (draft):**

`features/reviews/provider-review.feature`:

```gherkin
Feature: Provider review by Customer after Quote completion

  Background:
    Given an authenticated Customer "acme"
    And Provider "p_acme" exists
    And Quote "q_001" between "acme" and "p_acme" is in state "completed"

  @scn-200 @release @smoke
  Scenario: Customer submits a 5-star review with comment
    When the Customer submits a Review for Quote "q_001" with rating 5 and comment "Excellent service"
    Then a Review is created in state "published"
    And the email notification is enqueued for "p_acme"
    And the Provider review count increments by 1

  @scn-201 @release
  Scenario: Customer submits a 3-star rating without comment
    When the Customer submits a Review for Quote "q_001" with rating 3
    Then a Review is created in state "published"
    And the comment field is null

  @scn-202 @release
  Scenario: Duplicate review for same Quote rejected
    Given the Customer has already submitted a Review for Quote "q_001"
    When the Customer submits another Review for Quote "q_001" with rating 4
    Then the response is 409 with code "REVIEW_ALREADY_EXISTS"

  @scn-203 @release
  Scenario: Cannot review a Quote in non-completed state
    Given Quote "q_002" is in state "draft"
    When the Customer submits a Review for Quote "q_002" with rating 5
    Then the response is 422 with code "QUOTE_NOT_COMPLETED"

  @scn-204 @release
  Scenario: Comment exceeds 1000 chars rejected
    When the Customer submits a Review with a 1001-char comment
    Then the response is 422 with code "COMMENT_TOO_LONG"

  @scn-205 @release
  Scenario: Customer edits Review within editable window
    Given Customer published Review 6 days ago (within editable window)
    When the Customer edits the Review with rating 4 and comment "Updated impression"
    Then the Review is updated
    And a review.edited.v1 event is emitted

  @scn-206 @release
  Scenario: Customer cannot edit Review after frozen
    Given Customer published Review 8 days ago (frozen)
    When the Customer attempts to edit the Review
    Then the response is 409 with code "REVIEW_FROZEN"

  @scn-207 @release
  Scenario: Customer soft-deletes Review within 30 days
    Given Customer published Review 20 days ago
    When the Customer soft-deletes the Review
    Then the Review state becomes "soft_deleted"
    And it does not appear in public listings
    And it is still recoverable by admin

  @scn-208 @release
  Scenario: Hard delete after 30 days from soft-delete
    Given Customer soft-deleted Review 31 days ago
    When the daily cleanup job runs
    Then the comment is hard-deleted (set to NULL)
    And the rating value persists with customerId=NULL
    And event review.hard_deleted.v1 emitted

  @scn-209 @release
  Scenario: Unauthorized read on public endpoint
    When an unauthenticated request GETs /v1/providers/p_acme/reviews
    Then the response is 200 with the public reviews list

  @scn-210 @release @smoke
  Scenario: Cross-tenant attempt rejected
    Given another tenant "bigco" with Provider "p_bigco"
    When Customer "acme" attempts to submit a Review for "p_bigco" Quote
    Then the response is 404 with code "QUOTE_NOT_FOUND" (no signal of existence)

  @scn-211 @release
  Scenario: Email failure does not roll back Review
    Given the email adapter is unavailable
    When the Customer submits a Review with rating 5
    Then the Review is created in state "published"
    And the email is queued in outbox for retry (§17)
    And the Customer receives 201 with reviewId
```

**Total: 12 scenarios.**

### ⛔ HITL #1 — Scenario approval

> *"I've drafted 12 scenarios covering: happy paths (scn-200, scn-201), uniqueness (scn-202), validation failures (scn-203, scn-204), lifecycle (scn-205, scn-206, scn-207, scn-208), public access (scn-209), tenant isolation (scn-210), partial failure (scn-211).*
>
> *Please review `features/reviews/provider-review.feature`. Per §58, the agent will NOT modify this file once approved.*
>
> *Type:*
> - `yes` *to confirm and continue.*
> - `edit:<feedback>` *to revise specific scenarios.*
> - `block` *if the scenarios miss something critical."*

**Human responsibility at this HITL:**

| What the human MUST do | What the human must NOT do |
|---|---|
| Read each scenario and verify it captures the business behavior | Approve without reading ("looks good") |
| Confirm the language uses CONTEXT.md vocabulary | Discuss technical implementation (that's the spec, not the scenarios) |
| Verify that important edge cases are covered | Request scenarios for out-of-scope cases (§31) |
| Validate that the described behavior IS what the business wants | Request scenarios outside the slice's scope |
| Approve the Provider/Customer contract | Rewrite the scenario language |
| Request new scenarios if gaps are detected | Approve and then ask for changes later |

**Typical time:** 10-20 min.

**Simulated approval:** `yes`.

**Rule validation after approval:** §58 (.feature read-only for the agent from this moment on), §59 (scn-NNN IDs stable), §60 (tags @release/@smoke applied).

---

### Step 8 — `/to-issues`

**Skill invoked:** `/to-issues`.

**Input:** Clarified spec + approved `.feature`.

**Applying improvement #1 (applied friction): new capability detection**

The skill detects:
- New adapter: `src/infrastructure/adapters/output/email/` did not exist previously → **introduces-capability:email**.
- Sensitive (PII in the comment) → **require-human-review**.
- NO `ralph-ready` because it's the first email capability.

**Output:**

`issues/003-provider-review.md`:

```markdown
# Issue 003 — Provider review slice

## Scenarios covered
scn-200 to scn-211 (12 scenarios, see features/reviews/provider-review.feature)

## Vertical slice
Customer submits Review → validation → uniqueness check → persist → outbox email → 201.
Lifecycle endpoints (edit, soft-delete) + public list endpoint included.
Email adapter introduced (first time).

## Estimated budget
~150000 tokens (greenfield + new capability + lifecycle + email integration).

## Constraints
- C.1 hexagonal, C.6 tenant, C.8 PII retention.
- §27 authz, §45 tenancy, §46 idempotency, §47 pagination, §17 outbox.
- §4 input boundary parsing (comment trim, rating validation).
- §52 timeout on email adapter.
- New EmailPort interface; first time email is used.
- New cron-like job for hard-delete cleanup at day 30.
```

### Labels (via `gh issue create`):

```
severity:p2
shift:hitl                         # sensitive + new capability
scenarios:scn-200,scn-201,...,scn-211
budget:150k
require-human-review              # §64 sensitive (PII)
introduces-capability:email        # §63 first email adapter
```

**No `ralph-ready`** (forbidden by `introduces-capability:*` on the first iteration).

**HITL:** no formal one (the human may review the issue before proceeding, but the workflow does not stop).

**Human responsibility:** review that the 150k budget is reasonable; if not, request a descope.

**Validation:** §63 introduces-capability, §64 require-human-review, §107 multi-module mode (NOT in this case).

---

### Step 9 — `/plan`

**Skill invoked:** `/plan`.

**Input:** issue + scenarios + AGENTS.md + CONTEXT.md + constitution.

**Progressive rule loading (9 files):**
- `core/02-architecture.md`, `core/05-domain-modeling.md`, `core/08-testability.md` (always)
- `core/06-commands-and-security.md` (use cases + auth)
- `core/07-infrastructure.md` + `core/10-cross-cutting.md` (DB + tenancy + outbox + pagination)
- `core/04-input-boundaries.md` (POST endpoints)
- `capabilities/typescript/03-style.md`, `capabilities/typescript/11-async.md`, `capabilities/typescript-hono/09-stack-conventions.md`.

**Output (abridged):**

```
Layers affected:
- Domain:
  - src/domain/reviews/review.ts (entity class with edit, softDelete, freeze methods)
  - src/domain/reviews/review-state.ts (closed set)
  - src/domain/reviews/rating.ts (value object with factory)
  - src/domain/reviews/review-comment.ts (value object, optional)
  - src/domain/reviews/errors/review-codes.ts (closed set of Result codes)
  - src/domain/reviews/ports/review.repository.ts
  - src/domain/reviews/ports/quote-reader.port.ts (read-only port to verify Quote state)
- Application:
  - src/application/use-cases/reviews/submit-review.use-case.ts
  - src/application/use-cases/reviews/edit-review.use-case.ts
  - src/application/use-cases/reviews/soft-delete-review.use-case.ts
  - src/application/use-cases/reviews/list-public-reviews.use-case.ts (with §47 pagination)
  - src/application/use-cases/reviews/hard-delete-expired-reviews.use-case.ts (job)
  - src/application/dtos/submit-review.dto.ts
  - src/application/ports/email.port.ts (new — first email adapter)
- Infrastructure:
  - src/infrastructure/adapters/output/email/sendgrid-email.adapter.ts
  - src/infrastructure/adapters/output/persistence/drizzle/schema/reviews.ts
  - src/infrastructure/adapters/output/persistence/drizzle/repositories/drizzle-review.repository.ts
  - src/infrastructure/adapters/input/http/routes/v1/review.routes.ts
  - src/infrastructure/adapters/input/http/routes/v1/provider-reviews.routes.ts (public read)
  - src/infrastructure/jobs/hard-delete-reviews.job.ts (daily cron)
  - migration 0010_create_reviews.ts
- Tests:
  - tests/reviews/review.domain.test.ts (state machine, value objects, ~10 tests)
  - tests/reviews/submit-review.use-case.test.ts (12 tests, one per scn-NNN)
  - tests/reviews/edit-review.use-case.test.ts
  - tests/reviews/soft-delete-review.use-case.test.ts
  - tests/reviews/list-public-reviews.use-case.test.ts (with pagination)
  - tests/reviews/hard-delete-expired.use-case.test.ts (cron logic with FakeClock)
  - tests/reviews/sendgrid-email.adapter.integration.test.ts (with email sandbox)
  - features/reviews/steps/review.steps.ts (step definitions invoking use cases)

Rules applied per layer:
- §3, §4, §11 (rating as integer 1-5), §17 (outbox), §19 (Result types), §22, §27, §36
- §44 (Drizzle separate from domain), §45, §46, §47, §52
- §61 step defs invoke use cases, §92 fails-first

Dependency graph: ~16 ordered tasks.
Estimated tokens: ~140k (within 150k budget).
```

**HITL:** no formal one.

**Human responsibility:** verify that the plan respects the budget and that the dependency graph is reasonable.

**Validation:** §3 explicit hexagonal direction, §47 pagination, §17 outbox for email, §52 timeout.

---

### Step 10 — `/tdd` (Red-Green-Refactor)

**Skill invoked:** `/tdd`.

**Progressive rule loading (12 files):** those of the plan + `core/15-observability.md` (§77 structured, §78 dot.notation, §80 event on close).

**Processing:**

#### Red phase (all tests failing):

12 tests for the use case + 10 for the domain + 8 for adapters + step definitions = ~30 tests written first.

```ts
// tests/reviews/submit-review.use-case.test.ts (representative)
test("scn-200: Customer submits 5-star review with comment", async () => {
  const result = await useCase.execute(
    {
      quoteId: "q_001",
      rating: 5,
      comment: "Excellent service",
    },
    { customerId: "acme", requestId: "req-1" }
  );

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unexpected");

  // §19 Result type
  expect(result.reviewId).toBeDefined();

  // §17 outbox event enqueued
  expect(outbox.lastEvent()).toMatchObject({
    type: "review.published.v1",
    payload: { reviewId: result.reviewId, providerId: "p_acme" },
  });

  // §80 use case emits log event
  expect(logger.lastEvent()).toMatchObject({
    event: "review.published",
    details: { reviewId: result.reviewId },
  });
});
```

Run all tests → **30 failing.** Commit:

```
test: red — provider-review slice (30 tests for scn-200..scn-211 + lifecycle) issue #003
```

#### Green phase (minimal implementation):

Follows the dependency graph from the plan. Implements each file in order. After each incremental commit, runs the corresponding test.

```ts
// src/application/use-cases/reviews/submit-review.use-case.ts (fragment)
export class SubmitReviewUseCase {
  constructor(
    private readonly reviews: ReviewRepositoryPort,
    private readonly quotes: QuoteReaderPort,
    private readonly outbox: OutboxPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(
    input: SubmitReviewInput,
    ctx: RequestContext,
  ): Promise<SubmitReviewResult> {
    // §27 auth
    if (ctx.customerId === null) {
      return { ok: false, code: "UNAUTHORIZED" };
    }

    // §4 input validation (Zod already validated; defense in depth per §28)
    const ratingResult = Rating.from(input.rating);
    if (!ratingResult.ok) return ratingResult;
    const commentResult = ReviewComment.from(input.comment ?? null);
    if (!commentResult.ok) return commentResult;

    // §27 + §45: verify Quote belongs to this Customer in this tenant
    const quote = await this.quotes.findById(input.quoteId, ctx.tenantId);
    if (quote === null || quote.customerId !== ctx.customerId) {
      return { ok: false, code: "QUOTE_NOT_FOUND" }; // §27 leak avoidance
    }
    if (quote.state !== "completed") {
      return { ok: false, code: "QUOTE_NOT_COMPLETED" };
    }

    // FR-2: uniqueness
    const existing = await this.reviews.findByQuoteAndCustomer(input.quoteId, ctx.customerId);
    if (existing !== null) {
      return { ok: false, code: "REVIEW_ALREADY_EXISTS" };
    }

    // Create review
    const review = Review.create({
      id: this.ids.reviewId(),
      customerId: ctx.customerId,
      providerId: quote.providerId,
      quoteId: input.quoteId,
      rating: ratingResult.value,
      comment: commentResult.value,
      createdAt: this.clock.now(),                    // §25
    });

    // Persist + outbox event in single transaction (§16)
    await this.reviews.saveWithEvent(review, ctx.tenantId, {
      type: "review.published.v1",
      payload: { reviewId: review.id, providerId: review.providerId, rating: review.rating.value },
    });

    // §80 emit close event
    ctx.logger.info({
      event: "review.published",
      details: { reviewId: review.id, providerId: review.providerId }, // §79 no PII
    });

    return { ok: true, reviewId: review.id.value };
  }
}
```

Run all 30 tests → **30 passing.** Commit:

```
feat: green — submit-review use case implementation (scn-200, 201, 202, 203, 204, 210, 211) issue #003
```

(And other commits for edit, soft-delete, hard-delete, public list.)

#### Refactor phase:

- Extract helper `validateQuoteOwnership(quote, ctx): Result` reused in 3 use cases.
- Named constant `EDITABLE_WINDOW_DAYS = 7`, `SOFT_DELETE_RETENTION_DAYS = 30` to avoid magic numbers (§10).
- Rename `findByQuoteAndCustomer` → `findByCompositeKey` (better naming §22).

Tests still pass.

#### §92 verification (fails-first cycle):

For 2 representative tests, the Write→Pass→Revert→Fail→Restore→Pass cycle is run. ✓

**Output:**

```
Tests:           30 passed
Coverage:        domain 94%, application 88%, infrastructure 72% (matches C.2)
Lint:            clean
Typecheck:       clean
Commits:         8 (1 red + 6 incremental green + 1 refactor)
```

**HITL:** no formal one.

**Validation:** §3 hexagonal, §19 Result types, §27 authz, §45 tenant, §17 outbox, §25/§26 inject clock/ids, §92 fails-first verified.

---

### Step 11 — `/run-acceptance` (gate)

**Skill invoked:** `/run-acceptance`.

**Processing:**

```
Step 1 Pre-flight: ✓ branch + .feature unchanged from approved
Step 2 @smoke: scn-200 ✓, scn-210 ✓
Step 3 @release for slice: 12/12 ✓
Step 4 Visual gate (§104):
  - Review form (rating selector + comment textarea + submit button):
    ✓ Mobile/tablet/desktop responsive
    ✓ Dark mode
    ✓ Accessibility (rating stars labeled, textarea labeled)
    ✓ Empty/loading/error states visible
    ✓ Console clean
  - Public review list (paginated):
    ✓ All checks pass
Step 5 Schemathesis (§105):
  - POST /v1/reviews: 81 fuzzed inputs, 0 unexpected 5xx ✓
  - GET /v1/providers/:id/reviews: 47 fuzzed inputs, 0 unexpected 5xx ✓
Step 6 Stub detection (§106): ✓ no stubs
Step 7 SLO benchmark (§83):
  - POST /v1/reviews p95: 287 ms ≤ 500 ms target ✓
  - GET /v1/providers/:id/reviews p95: 142 ms ≤ 300 ms target ✓
Step 8 Reviewer agent (§114): (see below)
```

#### Reviewer agent invocation

```markdown
# Code review — provider-review slice

**Diff:** 27 files, 1.142 lines added
**Rules loaded (progressive disclosure):**
  always: §1, §3, §19, §22, §35
  domain: §5-§10, §11, §33, §36, §37
  application: §12, §13, §27, §28, §15-§18
  infrastructure: §38-§44, §45, §46, §47, §52
  inputs: §4, §34
  bdd: §56-§62, §103-§106
  async: §51, §52
  observability: §77-§80

## 🛑 Blocking findings (0)

## ⚠️ Should fix (1)

### 1. §19 — Inconsistent Result type usage
**File:** src/application/use-cases/reviews/edit-review.use-case.ts:54
**Issue:** Returns `{ ok: true, review }` (full entity) but §13 says mutation APIs
return IDs/status, not full entities.
**Fix:** Return `{ ok: true, reviewId, updatedAt }` instead.

## 💡 Suggestions (3)

### 2. §22 — Naming
**File:** src/domain/reviews/review.ts:32
**Issue:** `freeze()` method could be `transitionToFrozen()` for consistency with PRD vocabulary.

### 3. §47 — Pagination edge case
**File:** src/application/use-cases/reviews/list-public-reviews.use-case.ts
**Issue:** Empty page returns `{items: [], nextCursor: null}`. Could explicitly document this behavior in the contract.

### 4. §17 — Outbox retry
**Suggestion:** Document the email retry policy (linear vs exponential backoff) in `docs/specs/provider-review.md` as ADR follow-up.

## What the author got right
- §3 Domain has zero infrastructure imports.
- §19 Result types with `code` everywhere except the noted exception.
- §27 Auth check before any state mutation.
- §45 tenantId in every repository method.
- §17 outbox pattern correctly used for email side-effect.
- §46 IdempotencyMiddleware on POST /v1/reviews.
- §92 fails-first verified for submit use case.
- Coverage exceeds C.2 thresholds.

## Summary
| | Count |
|---|---|
| 🛑 | 0 |
| ⚠️ | 1 |
| 💡 | 3 |

**Recommendation:** merge after author addresses the 1 Should-fix.
```

**Applying improvement #4 (explicit retry policy):**

| Outcome | Action |
|---|---|
| 0 🛑 blocking + 1 ⚠️ should-fix | Continue to Step 12; reviewer report goes in PR body |

The developer fixes the should-fix (5 min, 1 commit) and re-runs `/run-acceptance` to verify. **Pass.**

**HITL:** no formal one at the gate, but the should-fix leads the developer into a mini-iteration.

**Validation:** all the §N listed in the reviewer report.

---

### Step 12 — `/security-hardening` + `/traceability-matrix` + ⛔ HITL #3

#### `/security-hardening` (with the new HITL #2 — threat model approval)

```
Step 1 Sensitive scope: ✓ touches PII (comments)
Step 2 §87 threat model:
  - docs/threat-models/provider-review.md does NOT exist
  - Generating STRIDE draft...
  - Draft saved to docs/threat-models/provider-review.draft.md
```

### ⛔ HITL #2 — Threat model approval

> *"A new threat model has been drafted at `docs/threat-models/provider-review.draft.md`. §87 requires explicit human approval before the security audit can proceed.*
>
> *Please review the STRIDE draft and:*
> - *`approve`: rename `.draft.md` → `.md`, treat as authoritative.*
> - *`edit:<notes>`: revise specific rows, then re-run /security-hardening.*
> - *`block`: the slice cannot proceed; reject the spec or reduce scope to avoid the trust boundary."*

**Draft content** (which the human must review):

```markdown
# Threat model — Provider review (DRAFT)

## STRIDE

### Spoofing
- **Threat:** Customer impersonates another Customer to publish a Review.
- **Mitigation:** §27 authz check + §45 tenant scope.
- **Residual risk:** Compromise of Customer account (out of scope; covered by auth feature).

### Tampering
- **Threat:** Review payload modified in transit.
- **Mitigation:** HTTPS + Zod validation at perimeter (§4).
- **Residual risk:** None known.

### Repudiation
- **Threat:** Customer claims they didn't post a Review.
- **Mitigation:** review.published.v1 event in outbox with customerId + timestamp; immutable audit trail.
- **Residual risk:** Account compromise; not in scope.

### Information Disclosure
- **Threat:** Review comment leaks PII publicly.
- **Mitigation:** Customer warned in UI before submit; comment is public by design (informed consent).
- **Residual risk:** Customer mistakenly puts PII in comment. Mitigation: future UI warning + admin tools.

### Denial of Service
- **Threat:** Review spam by single Customer.
- **Mitigation:** Unique constraint (1 per Quote); rate limit middleware.
- **Residual risk:** Distributed spam (out of scope for v1).

### Elevation of Privilege
- **Threat:** Customer modifies another Customer's Review.
- **Mitigation:** Authorization check in edit/delete use cases.
- **Residual risk:** None known.
```

**Human responsibility at HITL #2:**

| What the human MUST do | What the human must NOT do |
|---|---|
| Read each STRIDE row | Approve without reading |
| Evaluate whether the residual risks are acceptable for the business | Invent unrealistic hypothetical threats |
| Decide between mitigate / accept / transfer for each threat | Demand impossible mitigations |
| Confirm it covers the real surface of the slice | Approve and ask for changes later |
| If in doubt → `edit:<notes>` with concrete changes | Approve mechanically |

**Typical time:** 15-30 min for a sensitive slice.

**Simulated approval:** `approve`.

→ `docs/threat-models/provider-review.draft.md` renamed to `.md`. Auditable from this moment on.

#### Continuation of `/security-hardening`:

```
Step 3 gitleaks: ✓ no secrets in diff
Step 4 npm audit:
  - sendgrid@7.7.0 (new dep) — no CVEs
Step 5 semgrep (PII paths): ✓ no findings
Step 6 §27 authz audit: ✓ verified
Step 7 §45 tenant audit: ✓ verified
Step 8 §52 timeouts: ✓ 5s on email + outbox
Step 9 §88 secrets: ✓ SENDGRID_API_KEY via env (parsed at startup §34)

Decision: ✓ CLEAR
```

#### `/traceability-matrix`

```
docs/audit/traceability-v0.3.0-reviews.md generated.

| scn-NNN | Feature file | Issue | PR | Constitution | SLO |
|---|---|---|---|---|---|
| scn-200..211 | features/reviews/provider-review.feature | #003 | #PR-200 | C.1, C.6, C.7, C.8 | p95 287ms ≤ 500ms ✓ |

Events registered (added to docs/events.md):
- review.published.v1
- review.edited.v1
- review.soft_deleted.v1
- review.hard_deleted.v1
```

### ⛔ HITL #3 — Draft PR approval (merge gate)

`gh pr create --draft` executed. Notification to the developer:

> *"Feature complete. Draft PR #PR-200 ready for review:*
> - `agent/feature-provider-review-003` — 12 scenarios passed*
>
> *Reviewer: 0 blocking (after iteration), 3 suggestions.*
> *Security: CLEAR.*
> *Traceability: docs/audit/traceability-v0.3.0-reviews.md*
> *Threat model: docs/threat-models/provider-review.md (approved 2026-06-01 by @reviewer)*
> *SLO: p95 287ms ≤ 500ms ✓*
>
> *No PRs auto-merge. Review, mark ready when satisfied, merge."*

**Human responsibility at HITL #3:**

| What the human MUST do | What the human must NOT do |
|---|---|
| Read the full diff (line by line for sensitive paths) | Approve based on a superficial glance |
| Verify the reviewer report did not hide critical findings | Trust the reviewer 100% without verifying |
| Manually test the endpoint (at least the happy path) | Only run CI |
| Verify that the UI looks as expected | Ignore the visual gate |
| Comment doubts / request concrete changes | Approve and report problems after the merge |
| Mark ready → merge when satisfied | Merge without marking ready (breaks §67) |

**Typical time:** 30-60 min for a greenfield slice + new capability.

**Simulated approval:** the human reviews, adds 1 comment about the rating UI label, the developer fixes it in 1 commit, the human marks ready → merge.

---

### Step 13 — Post-merge close-out

Triggered automatically by the merge (via GitHub webhook or manual invocation).

**Actions (all idempotent):**

```
✓ Step 13 — Post-merge close-out for #003

1. Re-running /traceability-matrix on merged commit a3b9f12
   → docs/audit/traceability-v0.3.0-reviews.md updated with final commit hash
2. Issue #003 updated:
   - PR link: #PR-200
   - Merged at: 2026-06-01T16:42:00Z
   - Label ralph-done → released
   - Closed
3. Spec docs/specs/provider-review.md: Status Clarified → Released
4. docs/events.md updated:
   - + review.published.v1
   - + review.edited.v1
   - + review.soft_deleted.v1
   - + review.hard_deleted.v1
5. docs/audit/incidents.md: no incident this slice
6. No deploy trigger (manual gate)
7. Session log: feature.released.v1 emitted

Lifecycle closed.
```

### Sub-HITL post-Step 13 — Promotion of the `email` capability

After the successful merge of the first feature with `introduces-capability:email`, the framework suggests (does not require):

> *"Capability `email` was introduced for the first time in this slice. The patterns used (SendGrid adapter, outbox event, retry policy) may become the standard for future email features. Consider:*
>
> *Option A: Create `docs/engineering/capabilities/email/SKILL.md` documenting the conventions. Future slices using email can then be `ralph-ready`.*
> *Option B: Wait until 2-3 features use email to extract patterns from real usage.*
> *Option C: Defer indefinitely."*

**Human responsibility at this sub-HITL:**

| Decision | When |
|---|---|
| Option A — promote now | The team is confident in the pattern; wants to unblock future email features |
| Option B — wait | The pattern is still settling; promoting prematurely would cause rework |
| Option C — don't document | Email is a one-off use; it won't recur |

**Typical time:** a quick decision (5 min) if the team already discussed it during the PR review.

---

## 5. Bug fix flow (`/debug`)

### Trigger

A bug is reported in the issue tracker. The human (or automation) runs `/triage` to classify it:

```
/triage --issue 042
```

`/triage` applies:
- `severity:p0/p1/p2`
- `incident:production` if the bug reached production with real impact
- `type:bug`
- `shift:hitl` (P0/P1 production are always hitl)

### Step-by-step manual flow

**Step 1 — `/debug` starts:** reads the issue + any stack trace, logs, screenshots.

**Step 2-3 — `/debug` invokes `/diagnose` internally:** reproduce → minimise → hypothesise → instrument → identify root cause.

**`/diagnose` output:**

`.planning/diagnoses/quote-expiry-bypass-20260601.md`:

```markdown
# Diagnosis — quote-expiry-bypass

## Reproduction
$TEST_CMD tests/integration/quote-expiry.test.ts (deterministic 10/10 runs)

## Verified cause
isExpired() in src/application/use-cases/quotes/accept-quote.use-case.ts:34
uses `new Date()` instead of `this.clock.now()`. Drift between server UTC and
client tz can bypass the expiry check.

## Fix direction
Inject ClockPort (§25); replace new Date() with clock.now().

## Regression test ready
tests/quotes/accept-quote.use-case.test.ts — new test exercises the timezone case.
```

**HITL:** no formal one in `/diagnose` (purely analytical).

**Step 4 — `/tdd` for the fix:**

- Red: regression test that captures the bug (failing).
- Green: apply the minimal fix (1 line: change `new Date()` to `this.clock.now()`).
- §92 fails-first verified.

**Step 5 — `/run-acceptance`:** verifies that the fix does not break other scenarios + the regression test passes.

**Step 6 — `/code-review` (reviewer agent) + optional `/security-hardening` if the bug was a security one.**

### ⛔ HITL — Fix PR approval (HITL #3 reused)

Same HITL as in the feature flow. Human responsibility:

- Verify the fix is the root cause, not a symptom patch (§93).
- Verify the regression test actually captures the bug.
- Decide whether it requires a postmortem (§95 + new rule: only if `incident:production` label).

### Post-merge — `/postmortem` (if applicable)

**Only if the issue has the `incident:production` label.**

`/postmortem --issue 042` generates a draft → the human refines it → publishes it at `docs/postmortems/2026-06-01-quote-expiry-bypass.md`.

### Sub-HITL — Postmortem approval

| What the human MUST do | What the human must NOT do |
|---|---|
| Verify the postmortem is **blameless** (systems, not people) | Assign blame to individuals |
| Confirm the timeline against real logs | Trust the draft without verifying |
| Refine "Lessons learned" with human perspective | Accept the agent's generic lessons |
| Assign concrete action items to owners | Leave action items without an owner |
| Sign off as a reviewer external to the response team | Self-approve while being part of the response team |

**Typical time:** 1-2 hours for a P0 production.

---

## 6. Improvement flow (`/optimize` and others)

Improvements have category-specific sub-skills:

| Category | Skill |
|---|---|
| Performance optimization | `/optimize` |
| Refactor without behavior change | use `/tdd` with a refactor plan (§102) |
| Tech debt reduction | `/improve-codebase-architecture` → generates issues → normal `/feature` flow |
| Proactive security hardening | `/security-hardening` invoked manually |
| Dependency upgrade | Runbook embedded in §100 (Renovate/Dependabot) |

### Example: `/optimize`

**Trigger:** an endpoint exceeds the SLO declared in `docs/slos.md`.

**Flow:**

1. `/optimize --endpoint POST /v1/reviews` — the skill reads the SLO target.
2. **Step 1: MEASURE** — baseline with k6/wrk, saved in `docs/perf-baselines/reviews-post.md`.
3. **Step 2: IDENTIFY** — profile (flamegraph, query plan), identify the bottleneck mechanically.
4. **Step 3: FIX** — `/tdd` for the change.
5. **Step 4: VERIFY** — re-measure, must beat the target.
6. **Step 5: GUARD** — perf budget in CI or benchmark test.

**HITL:** sub-HITL if the fix requires a descope or SLO change.

**Human responsibility:**

| What the human MUST do | What the human must NOT do |
|---|---|
| Approve the baseline before optimizing | Optimize without a baseline (§97 violation) |
| Decide whether the target SLO needs adjustment (raise/lower) | Lower the SLO because "it can't be reached" without justification |
| Verify the guard (perf budget) catches future regressions | Merge without a guard |

---

## 7. Brownfield flow (sub-flow B1-B5)

**Trigger:** the feature touches legacy code with <50% coverage OR crosses bounded contexts OR modifies public APIs with external consumers.

Steps B1-B5 **precede** `/specify` in the main flow:

### Step B1 — `/grill-with-docs`

Interrogates the existing code, not the human. Captures the **reality of the current code** before proposing changes.

**Output:** `.planning/grilling-docs/<module>-<date>.md` with public surface, implicit invariants, git history signals, drift vs CONTEXT.md.

### Step B2 — `/characterization-tests`

If coverage is <50%, it is **mandatory** to write tests that document the current behavior (including bugs).

**Output:** test suite `char-001`, `char-002`, ... committed in its own PR before any modification.

**HITL:** sub-HITL — review that the characterization tests capture the real behavior, not the ideal one.

### Step B3 — `/domain-model` (re-applies)

With the information from B1, refines CONTEXT.md so it reflects the reality of the code (not the aspirational one).

### Step B4 — `/impact-analysis`

Maps the blast radius of the proposed change.

**Output:** `.planning/impact/<change>-<date>.md` with direct and transitive consumers, tests at risk, external consumers.

**Human responsibility:** evaluate whether the blast radius is manageable. If not, go to B5.

### Step B5 — Decision: in-place vs strangler

**Critical HITL** — the human decides:

| Option | When |
|---|---|
| **In-place** — direct modification with a safety net | Bounded change, manageable blast radius |
| **Strangler** — invoke `/strangler-plan` | Large change, high blast radius, risk of complex rollback |

**Human responsibility at B5:**

| What the human MUST do | What the human must NOT do |
|---|---|
| Read the full impact analysis | Decide without reading the analysis |
| Evaluate risk tolerance for the change | Pick the easiest option without evaluating |
| Consider timing (mid-sprint vs new release) | Force strangler unnecessarily (overkill) |
| Commit the team to the decision | Choose and then change mid-flow |

After B5 (in-place), the flow continues to the regular `/specify` of the main flow with the brownfield context baked-in.

---

## 8. Inventory of HITLs and responsibilities

> *HITL ≡ HUMAN CHECKPOINT* (synonyms). In `/feature`: **HUMAN CHECKPOINT 1 = HITL #1** (scenarios), **HUMAN CHECKPOINT 2 = HITL #3** (merge); **HITL #2** (threat model) is conditional. Total: **9 HITLs** across all flows (table below).

### Visual map of the main flow's HITLs

```
/feature flow:
├─ Step 1-6: skills with no formal HITL (developer may review outputs)
├─ Step 7 ⛔ HITL #1: APPROVE SCENARIOS (Gherkin)
│   └─ Responsibility: confirm the behavior contract
├─ Step 8-10: skills with no formal HITL
├─ Step 11 (Schemathesis 🛑 blocking → automatic retry policy, no HITL)
├─ Step 12.1 ⛔ HITL #2: APPROVE THREAT MODEL (if sensitive)
│   └─ Responsibility: accept/mitigate/transfer residual risks
├─ Step 12.2-3: skills with no HITL
├─ ⛔ HITL #3: APPROVE DRAFT PR (merge gate)
│   └─ Responsibility: verify diff + UI + mergeable
└─ Step 13 (post-merge): sub-HITL CAPABILITY PROMOTION if new capability
    └─ Responsibility: decide whether to document as a capability
```

### Complete table of HITLs

| HITL | When | Who | Decision | Time |
|---|---|---|---|---|
| **HITL #0a** Setup answers | Once per project | Tech lead | Stack + compliance + vocabulary | 15-30 min |
| **HITL #0b** Constitution | Once (re-review annually) | Tech lead + 1+ senior | Non-negotiable tenets | 30-60 min |
| **HITL #1** Scenarios approval | Step 7 of every feature | Product owner / QA lead | Approve the behavior contract | 10-20 min |
| **HITL #2** Threat model approval | Step 12 if sensitive | Security lead / senior engineer | Accept residual risks | 15-30 min |
| **HITL #3** PR draft approval | Step 12 final of every feature | Reviewer engineer (not the author) | Verify diff + ready to merge | 30-60 min |
| **HITL B5** In-place vs strangler | Brownfield sub-flow | Tech lead + product | Architectural risk decision | 15-30 min |
| **HITL postmortem** | After a bug with `incident:production` | Tech lead + senior outside the response team | Sign off blameless | 1-2 hours |
| **HITL capability promote** | Post-merge if new capability | Tech lead | Document as capability or wait | 5-15 min |
| **HITL improvement scope** | Before improvement work | Tech lead | Prioritize via ICE rubric | 10 min |

### HITL anti-patterns (common mistakes)

| Anti-pattern | Problem | Solution |
|---|---|---|
| Approve without reading | The HITL loses its value; bad bugs/contracts slip through | Time-box: each HITL has an expected minimum review time |
| "I'll review later" — approve and review afterward | Compromises the flow; post-merge problems land in production | Policy: if you don't have time now, return the HITL to the next day |
| Turn everything into a hard checkpoint | The workflow becomes bureaucratic | Only the 9 critical decisions in the inventory (section 8) are HITLs; the rest flows |
| Make the reviewer agent the "final owner" | The agent does not make policy decisions; it's always a human | The reviewer agent informs; the human decides |
| Share HITLs across roles | Confusion about who approved what | Each HITL has a clear owner (table above) |

---

## 9. Quick reference — skills, inputs, outputs

### Workflow skills (typical order of the main flow)

| Skill | Main input | Main output | HITL |
|---|---|---|---|
| `/constitution` | Template + 6Q interview | `docs/constitution.md` | HITL #0b |
| `/setup` | 6-8Q wizard | `AGENTS.md`, scaffold, hooks | HITL #0a |
| `/onboard` | (nothing) | Developer orientation | — |
| `/grill-me` | Feature desc + CONTEXT | `docs/decisions/grilling/<slug>-*.md` | — |
| `/domain-model` | Grilling + CONTEXT | Updated CONTEXT.md + ADRs | — |
| `/specify` | Grilling + CONTEXT + constitution | `docs/specs/<slug>.md` Draft | — |
| `/clarify` | Spec Draft | Spec Clarified (with 7-cat checklist) | — |
| `/to-scenarios` | Spec Clarified | `.feature` DRAFT | ⛔ **HITL #1** |
| `/to-issues` | Spec + approved .feature | GitHub issues + contracts if multi-mod | — |
| `/plan` | Issue + scenarios + AGENTS.md | Plan in issue body with file paths + dep graph | — |
| `/tdd` | Issue + plan + .feature | Source + tests + step defs | — |
| `/run-acceptance` | Branch + scn labels + slos | `.planning/acceptance/*` + reviewer report | — |
| `/code-review` | PR/branch | Reviewer report (invokes reviewer agent) | — |
| `/security-hardening` | Diff + sensitive paths | Security audit + threat model | ⛔ **HITL #2** if new threat model |
| `/traceability-matrix` | Features + acceptance + reviews | `docs/audit/traceability-<v>.md` | — |
| (merge by human) | — | — | ⛔ **HITL #3** |
| `/feature --close` | Merged PR | Spec → Released, events sync, issue closed | — |

### Operational & utility skills

| Skill | When | Output |
|---|---|---|
| `/debug` | Bug fix workflow | Draft PR + regression test + diagnosis |
| `/diagnose` | Standalone investigation | `.planning/diagnoses/*` |
| `/postmortem` | Post-incident if `incident:production` | `docs/postmortems/<date>-<slug>.md` draft |
| `/optimize` | Endpoint exceeds SLO | Perf optimization PR + baseline + guard |
| `/handoff` | Context near saturation | `mktemp` handoff file |
| `/triage` | Issue without labels | Labels applied + routing decision |
| `/prototype` | Open design question | `.planning/prototypes/*/LEARNING.md` |

### Brownfield skills (sub-flow B1-B5)

| Step | Skill | Output |
|---|---|---|
| B1 | `/grill-with-docs` | Public surface inventory + drift |
| B2 | `/characterization-tests` | Tests documenting current behavior |
| B3 | `/domain-model` (re-apply) | Updated CONTEXT.md with reality |
| B4 | `/impact-analysis` | Blast radius report |
| B5 | (HITL decision) | In-place OR `/strangler-plan` |

---

## Appendix: useful day-to-day commands

```bash
# Project start
/setup
/constitution
/onboard

# Per feature (manual flow)
/grill-me "<feature description>"
/domain-model
/specify
/clarify
/to-scenarios                              # ⛔ HITL #1 here
/to-issues
/plan
/tdd                                       # red-green-refactor
/run-acceptance                            # gates + reviewer agent
/security-hardening                        # ⛔ HITL #2 if sensitive
/traceability-matrix
gh pr create --draft                       # ⛔ HITL #3 before merge
# (human marks ready and merges)
/feature --close <issue>                   # Step 13 post-merge

# Or all in one (orchestrated flow)
/feature "<feature description>"

# Bug fix
/triage --issue <NNN>                      # classify
/debug --issue <NNN>                       # invokes /diagnose + /tdd + /run-acceptance
# If incident:production:
/postmortem --incident <NNN>               # draft

# Improvement
/optimize --endpoint <path>                # with mandatory baseline
/improve-codebase-architecture             # surface refactor candidates

# When context saturates
/handoff --issue <NNN>                     # compact session

# For a new developer on the team
/onboard
```

---

## Closing

This document is the operational guide. The detailed rules live in `docs/engineering/core/`. The framework is designed to be **scannable**: you read only what you need at any given moment.

**If your first instinct is to skip a HITL — read it twice.** The 9 HITLs (inventory in section 8) are the points where the framework reinforces that **the human directs**. Skipping them turns Stormhelm into blind automation, which is exactly what the framework exists to prevent.

**If your first instinct is to duplicate a HITL — read it once.** The framework does not want theatrical supervision; it wants human decisions at the exact points where they provide unique value.

For feedback on this guide or improvement suggestions based on real usage, comment on the repository or pin a message to the tech lead.

---

*Last updated: 2026-06-01*
*Framework version: Stormhelm v1.0 (122 rules, 32 skills, 1 agent, 5 hooks, 13 steps in the main flow)*
