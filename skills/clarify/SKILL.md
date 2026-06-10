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

## Status transition (§58)

If this run targets an existing `.feature`, flip its header `# status: draft → clarifying` at Step 1 (it may also reopen `approved → clarifying` when re-litigating). The agent may edit the file while it is `draft`/`clarifying`; it becomes read-only again only after re-approval at HUMAN CHECKPOINT 1.

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

> **Autonomous (auto-pilot) mode — opt-in (FOLLOW-UP 80).** A consumer may run
> this round self-answered (the agent picks each interpretation) instead of
> interactively. This does NOT relax §58 — human approval stays the default;
> auto-pilot is a documented per-consumer deviation whose only safety is the
> compensating **decision log** (`docs/decisions/auto-clarify/<slice>-decisions.md`:
> question · options · chosen + rationale · industry reference · confidence ·
> reversibility · audit checkbox). See `core/13` Appendix "Autonomous planning".

**Orientation preamble — MANDATORY before question 1 (FOLLOW-UP 59).** The
asymmetry is structural: you just read the whole spec; the human may be
returning after days, or another session wrote the spec entirely. The answers
collected here become audit-grade contracts (the Clarifications log is
reviewer-citable) — a disoriented answer is a wrong contract, and the round
spends zero tokens protecting against it unless you do this. Before the first
question, output ONE compact block (≤12 lines):

```markdown
## Orienting: <slice name> — clarification round

**What this slice does:** <2-3 lines, plain language — the user-visible
behavior, not the architecture.>

**Key vocabulary for this round:** <3-6 terms that will appear in the
questions, one line each, sourced from CONTEXT.md / the spec's closed sets.
Only terms the questions actually use.>

**This round:** ~<N> questions about <the 2-3 ambiguity areas>. Your answers
become the spec's Clarifications log (contract-grade).
```

Hard rules (FOLLOW-UP 59): the preamble is **informational** — never a
question, never skippable by the agent. It is **NEVER persisted into the
Clarifications log**: the log is a reviewer-citable audit artifact,
decision-only by design — the preamble orients, it is not a decision (see
`references/clarifications-log-format.md`).

Direct operator feedback after 4 live slices: *"no siempre estamos al tanto
de lo que hace el slice"* — both live Q1s (closed-set mechanics, outbox
ordering) presumed full spec recall and worked only because the same sitting
had produced the spec.

Different from `/grill-me`:

- Each question quotes the **exact sentence** that is ambiguous.
- Each question proposes **2-3 specific interpretations as multiple-choice options**, with the recommended interpretation marked and a one-line rationale per option.
- Each option cites the §N, constitution clause, or `CONTEXT.md` term that justifies (or troubles) it.
- The last option is always **`Other / correction`** for cases where the listed interpretations miss the real ambiguity.
- One question per turn — wait for the answer before asking the next.

#### Question format

```markdown
**Clarification on FR-<N>.** <Spec sentence quoted verbatim.>

Two interpretations are consistent with the wording:

- **(a) <interpretation A>** — ✅ recommended. <one-line rationale citing §N, constitution, or precedent>.
- **(b) <interpretation B>** — <one-line rationale; what trade-off this interpretation makes>.
- **(c) Other / correction** — neither captures the real contract; describe what does.

Which is the contract?
```

#### Example

```markdown
**Clarification on FR-3.** "Listings MUST be visible to Customers only when state = 'published'."

Two interpretations are consistent with the wording:

- **(a) Non-published Listings 404 on direct URL access AND are excluded from search** — ✅ recommended. Strongest consistency: §45 tenant isolation + §57 BDD prefers a single observable rule; one acceptance scenario covers both surfaces.
- **(b) Only excluded from search results; direct URL still returns the Listing** — viable if Product wants providers to share preview links with selected Customers before publication; requires an additional §48 versioning note about the `state` field becoming part of the public contract.
- **(c) Other / correction** — neither captures the real contract; describe what does.

Which is the contract?
```

#### Why this format

- Forces the agent to do the design work *before* asking, so the human is choosing between named, costed alternatives instead of editing prose.
- The rejected interpretation is preserved in the spec's `Clarifications log` (Step 4), turning a clarification into an audit-grade record of *what the spec does not mean*.
- The `Other / correction` option prevents the agent from forcing a false dichotomy when the spec is ambiguous in a way the agent missed.

### Step 3 — Inline the clarifications

Each answer becomes a sub-bullet under the FR it clarifies:

```markdown
- **FR-3.** Listings MUST be visible to Customers only when state = "published".
  - **Clarification (2026-05-20):** Non-published Listings return 404 on direct URL
    access (interpretation b). Search results include only published Listings.
```

### Step 4 — Add clarifications log

> Format spec: `skills/clarify/references/clarifications-log-format.md`.

At the end of the spec, append. The log records the chosen interpretation **and** the rejected one(s), so a future reviewer can audit what the spec deliberately excludes:

```markdown
## Clarifications log

- **2026-05-20 — FR-3.** Non-published Listings return 404 on direct URL access AND are excluded from search (option a).
  Rejected: visible at direct URL but hidden from search (option b) — would have required §48 versioning of the `state` field.
- **2026-05-20 — NFR-1.** p95 measured at the `/v1/listings` endpoint, not at the page render (option a).
  Rejected: end-to-end p95 including client render (option b) — outside the service boundary.
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
