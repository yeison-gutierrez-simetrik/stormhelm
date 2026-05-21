# 01 — Delivery Philosophy

**Scope.** What to build, what to leave out, and what makes a PR shippable.

**When to read.** Planning a task, scoping a PR, choosing between two designs, deciding what to omit, reviewing a PR for breadth.

**Rules in this file.** §1, §2, §30, §31, §35

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index.

---

## §1. Build only validated business needs

Only implement behavior required by the PRD, the current task, or an explicitly validated follow-up.

Do not add speculative features just because they seem useful.

### Example

If the task is:

> Upload multiple documents and concatenate them into one file.

Do **not** add duplicate-file detection unless it is a business requirement.

Why:

- It adds code the user did not ask for.
- It can block valid user behavior.
- It creates maintenance burden.
- It makes later behavior harder to reason about.

Prefer the smallest correct behavior that satisfies the current business need.

---

## §2. Prefer the simplest correct solution

When two solutions solve the same business problem, choose the simpler one.

Avoid premature abstractions, generic frameworks, "just in case" options, and configurable systems that are not yet needed.

Good architecture is not the most abstract architecture. Good architecture is the one that makes the current business behavior easy to understand, test, and change.

---

## §30. Vertical slices over horizontal completeness

Each task should produce a small demoable behavior.

Prefer:

> Customer asks Claude to search Listings and gets real Catalog results.

Over:

> Build the whole search module.

Prefer:

> Provider submits one external URL deliverable and customer accepts it.

Over:

> Implement deliverables.

A thin end-to-end path is better than a broad incomplete subsystem.

### Slices are units of work, not units of folders

The codebase is organized layer-first (`domain/`, `application/`, `infrastructure/`, `entrypoints/` — see §3). A vertical slice naturally touches files in **all four layers** for the same feature. That is expected, and is the signal that the slice is end-to-end.

A slice for "search Listings" looks like:

- `domain/entities/listing.ts` (new types or fields)
- `application/use-cases/search-listings.use-case.ts`
- `application/ports/listing.repository.ts`
- `infrastructure/adapters/output/persistence/drizzle/repositories/drizzle-listing.repository.ts`
- `infrastructure/adapters/input/http/routes/v1/listing.routes.ts`
- tests for each

A slice that only adds one file in one layer is almost always too narrow to demo.

---

## §31. Omit before mocking

When something is not needed for the current demoable behavior, omit it.

Do not create fake versions of future systems just to make the architecture look complete.

Acceptable:

- Omit audit events from the first Provider Agent registration task.
- Omit DocuSign until contract signing exists.
- Omit dashboard UI if CLI or MCP is the real user path for that slice.

Acceptable local-real substitute:

- A local Provider Agent running real A2A code at `localhost`.
- Stripe test mode.
- DocuSign test mode.
- A test email inbox or webhook receiver.

Avoid:

- fake Stripe state that does not come from Stripe
- fake DocuSign signing state
- fake provider response hardcoded in Marketplace
- fake Catalog results when Catalog search exists

---

## §35. Pull requests should be boring to review

A good PR:

- implements one demoable task
- has a clear user/operator/agent demo path
- keeps business rules in domain code
- parses input at the perimeter
- avoids `any`, `as`, non-null assertions, and unnecessary mutation
- includes tests for observable behavior
- does not add speculative features
- does not return full entities from mutation APIs unless justified
- keeps transactions short
- uses integer units for money, percentages, and durations
- names things using PRD vocabulary

A PR should be easy to answer:

> What user-visible behavior changed?

If that answer is unclear, the PR is probably too broad or too horizontal.
