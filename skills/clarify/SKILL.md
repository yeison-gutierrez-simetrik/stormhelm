---
name: clarify
description: |
  Detects under-specified areas in a draft spec by running a focused round of
  questions targeting only the gaps. Less exhaustive than /grill-me — assumes the
  big design tree is settled and looks specifically for ambiguity at the level
  of acceptance criteria. Output: spec marked `Status: Clarified` ready for
  /to-scenarios.
  Use when: a draft spec exists (from /specify) and a careful re-read reveals
  ambiguous wording, missing edge cases, or undefined boundaries. Step 6 of
  /feature. Do NOT use to re-litigate design — those questions belong in
  /grill-me.
---

# /clarify — Resolve Ambiguity in the Spec

## Purpose

`/specify` produces a draft. The draft is often ambiguous in places the author didn't notice. `/clarify` runs a focused interrogation specifically against that ambiguity — different from `/grill-me` in that it does not revisit the design tree. The output is a spec that `/to-scenarios` can turn into deterministic Gherkin without inventing.

## When to invoke

- Immediately after `/specify` finishes.
- Step 6 of `/feature`.
- When a downstream skill (`/to-scenarios`, `/to-issues`, `/plan`) signals "the spec is unclear about X."

## When NOT to invoke

- To re-open settled design decisions → run `/grill-me` again instead.
- To add new features → that's a new `/specify`, not a clarification.

## Inputs

- `docs/specs/<feature-slug>.md` (Status: Draft).
- `docs/CONTEXT.md`.
- `docs/constitution.md`.

## Outputs

- Same `docs/specs/<feature-slug>.md`, updated, with Status: Clarified.
- Inline additions to FRs/NFRs marking each clarification.
- A clarifications log appended to the spec.

## Workflow

### Step 1 — Read with adversarial eye

Read the draft spec assuming you have never seen it before. For each FR and NFR, ask:

- Could a competent engineer implement two different correct things from this sentence?
- Are there error cases not mentioned (4xx, 5xx, partial failure)?
- Are there state transitions implicit but not stated?
- Are there units missing? (PriceCents? Days? Seconds?)
- Are there tenant boundaries (§45) unstated?
- Is the acceptance condition observable from outside the system?

Each "yes" or "maybe" is a clarification question.

### Step 1b — Systematic ambiguity checklist

The adversarial read above is necessary but agents often miss categories of ambiguity that aren't obvious from prose. Walk this checklist **explicitly** — every spec gets every category checked, and either confirms "covered" or generates a question:

#### Units & precision
- [ ] Monetary amounts have currency + minor unit? (cents, not "dollars" — §11)
- [ ] Percentages stored as basis points or as decimal? (§11)
- [ ] Durations have explicit unit suffix? (`ttlSeconds`, `noticeDays`)
- [ ] Timestamps have timezone declared? (UTC default; otherwise specify)
- [ ] File sizes in bytes vs KB vs MB?

#### Boundaries (inclusive vs exclusive)
- [ ] "Before X" — strictly less than, or less-than-or-equal?
- [ ] "Until X" — through X inclusive, or up to X exclusive?
- [ ] "After Y" — Y itself counted or not?
- [ ] Pagination ranges — 1-indexed or 0-indexed?
- [ ] List sizes — does the limit include the partial last page?

#### State machine
- [ ] Every state has explicitly declared allowed transitions?
- [ ] What happens on terminal states (deleted, completed)?
- [ ] Are there implicit "loading" or "pending" states not in the spec?
- [ ] What's the initial state for a freshly-created entity?

#### Defaults vs required
- [ ] For each input field: required, optional with default, or optional with null?
- [ ] When optional with default — is the default in the API contract or only in the UI?
- [ ] If absent, does the field's absence change behavior? (vs. just being missing data)

#### Error semantics
- [ ] Each failure mode has a specific `code` (§19) — not just "fail"?
- [ ] HTTP status code per error type declared explicitly?
- [ ] Retry semantics (idempotent? safe? §46)?
- [ ] Partial-success cases for batch operations?

#### Concurrency
- [ ] What happens if two requests modify the same entity simultaneously?
- [ ] Optimistic locking (version field)? Pessimistic (transaction)? First-write-wins?
- [ ] Is the operation idempotent (§46)?
- [ ] Race conditions in async work (outbox, webhooks)?

#### Tenancy (§45)
- [ ] Every entity declares its tenant scope?
- [ ] Cross-tenant access explicitly forbidden in error semantics?
- [ ] Shared resources (if any) explicitly marked as such?

#### Compliance & retention
- [ ] PII fields identified and tagged?
- [ ] Retention period declared per entity?
- [ ] Audit trail requirements explicit?

Each unchecked box produces a targeted question for Step 2 unless the spec already covers it. A single skipped box can become a class of production incidents — the checklist is the floor, the adversarial read is the ceiling.

### Step 2 — Ask targeted questions

Different from `/grill-me`:

- Each question quotes the **exact sentence** that is ambiguous.
- Each question proposes 2-3 specific interpretations.
- Each question links to the §N or `CONTEXT.md` term in play.

Example:

> **FR-3 currently reads:** "Listings MUST be visible to Customers only when state = 'published'."
>
> Two possible interpretations:
> - (a) Only `published` Listings appear in search results.
> - (b) Only `published` Listings can be viewed at all (404 on direct URL access to non-published).
>
> Which is the contract?

### Step 3 — Inline the clarifications

Each answer becomes a sub-bullet under the FR it clarifies:

```markdown
- **FR-3.** Listings MUST be visible to Customers only when state = "published".
  - **Clarification (2026-05-20):** Non-published Listings return 404 on direct URL
    access (interpretation b). Search results include only published Listings.
```

### Step 4 — Add clarifications log

> Format spec: `skills/clarify/references/clarifications-log-format.md`.

At the end of the spec, append:

```markdown
## Clarifications log

- **2026-05-20:** FR-3 clarified — non-published Listings return 404.
- **2026-05-20:** NFR-1 clarified — p95 measured at the /v1/listings endpoint, not at the page render.
```

### Step 5 — Update status, save, return

Change `Status: Draft` → `Status: Clarified`. Commit. Return to workflow.

## Integration with the framework

- **Invoked by `/feature` Step 6**.
- **Output consumed by `/to-scenarios`**: the Gherkin generator now has unambiguous source material.
- **Read by `reviewer` agent**: if implementation contradicts a clarification, it is a §57/§22 finding.
- **Off-ramp to `/prototype`**: if a clarification question's resolution depends on technical feasibility ("can we even hit this NFR?", "does this external API support this call?"), invoke `/prototype` to produce evidence, then return here with the answer.
- **Off-ramp to `/sad`**: if `/clarify` reveals that the feature crosses ≥3 modules or introduces a new bounded context, consider running `/sad` after `/clarify` and before `/to-scenarios` to assemble the architecture snapshot.

## What this skill never does

- Add new requirements (those need a new `/specify` round).
- Resolve open questions on behalf of stakeholders it can't reach (those stay in OQ).
- Mark the spec `Released` (that's the human after merge).
