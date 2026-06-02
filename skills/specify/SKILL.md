---
name: specify
description: |
  Captures the intent of a feature (what + why) in `docs/specs/<feature>.md` using
  the resolved vocabulary from /domain-model. The spec is the source of truth for
  /to-scenarios, /to-issues, and /plan downstream. Intentionally avoids technical
  detail (no stack, no endpoints, no schemas) — those decisions belong to /plan.
  The spec is reviewable by Product, QA, and Legal without needing engineering
  translation.
  Use when: /grill-me and /domain-model have completed and the design tree is
  settled. Always run before /clarify and /to-scenarios. Do NOT use for bugs
  (the bug IS the spec) or improvements (those have rule-specific contracts).
---

# /specify — Intent Capture

## Purpose

The spec answers two questions in business language: **what** must change in the world after this feature ships, and **why**. It is intentionally silent on **how** — no endpoints, no schemas, no library choices. That separation is what makes the spec readable by non-engineers and stable across implementation changes.

`/specify` writes `docs/specs/<feature>.md` once. `/clarify` may refine it; `/to-scenarios` derives the acceptance gates from it; `/to-issues` derives the work breakdown from it; `/plan` derives the technical plan from it. If `/specify` is wrong, everything downstream is wrong.

## When to invoke

- After `/grill-me` and `/domain-model` complete.
- Always before `/to-scenarios` and `/to-issues`.
- Step 5 of `/feature`.

## When NOT to invoke

- For bugs → `/debug` (the bug is the spec).
- For improvements → `core/18-improvements.md` has rule-specific contracts (§97 baseline, etc.).
- For revisions to an approved spec → use `/clarify` instead (which refines without rewriting).

## Inputs

- `docs/decisions/grilling/<slug>-*.md` (output of `/grill-me`).
- `docs/CONTEXT.md` (updated by `/domain-model`).
- `docs/constitution.md`.
- `docs/adr/` (any ADRs that constrain this feature).

## Outputs

- `docs/specs/<feature-slug>.md` with the canonical structure documented at `skills/specify/references/spec-format.md`.
- Functional requirements numbered `FR-1`, `FR-2`, ...
- Non-functional requirements numbered `NFR-1`, `NFR-2`, ...
- A canonical user story for each actor.
- Explicit out-of-scope list.

## Rule files to load (progressive disclosure)

The spec must be technology-free (the "what + why," not the "how"), but it must still respect the framework's philosophy and surface the right NFRs. Load:

- **Always:**
  - `docs/engineering/core/01-philosophy.md` — §1 (build only validated business needs — every FR must trace back to grilling answers, not invented), §2 (simplest correct), §35 (PRs boring to review — the spec drives PR size).
  - `docs/engineering/core/05-domain-modeling.md` — §22 (PRD vocabulary) so the spec uses the same words as `CONTEXT.md`.

- **If the feature is multi-tenant:**
  - `docs/engineering/core/10-cross-cutting.md` §45 — the spec must surface tenant isolation as an explicit NFR, not bury it in the architecture.

- **If the feature affects list endpoints:**
  - `docs/engineering/core/10-cross-cutting.md` §47 — pagination from day one is an NFR; the spec declares it.

- **If the feature affects public API or external events:**
  - `docs/engineering/core/10-cross-cutting.md` §48 — versioning. Spec declares whether this is v1 or v2.

- **If the feature has SLO targets:**
  - `docs/engineering/core/15-observability.md` §81 — declared SLOs become NFRs in the spec, not afterthoughts.

- **If the feature touches sensitive paths (auth, payments, PII):**
  - `docs/engineering/core/16-security-supply-chain.md` §87 — threat-model-driven requirements become NFRs in the spec.

The spec is the source of truth for `/to-scenarios`. Every gap in the spec becomes a gap in the scenarios, which becomes a gap in the implementation. Load the right rules to surface the right NFRs.

## Workflow

### Step 1 — Validate prerequisites

If `docs/decisions/grilling/<slug>-*.md` is absent → stop, instruct to run `/grill-me` first.
If `docs/CONTEXT.md` was not updated for this feature's terms → stop, instruct to run `/domain-model`.

### Step 2 — Draft the spec

Write `docs/specs/<feature-slug>.md` using **only** the vocabulary from `CONTEXT.md`. If a needed term is missing → stop, return to `/domain-model`.

Canonical structure:

```markdown
# <Feature title> — Spec

**Slug:** <feature-slug>
**Status:** Draft
**Date:** YYYY-MM-DD
**Source:** docs/decisions/grilling/<slug>-YYYYMMDD.md

## What changes after this ships

<2-3 paragraph description in the project's vocabulary. Imagine you are
writing the changelog entry for non-technical readers.>

## Why

<1-2 paragraphs of business rationale. Reference the PRD section, OKR, or
incident that motivates this work. If there is no "why" beyond "feels right,"
this feature has failed §1 — flag and stop.>

## Actors and their goals

### Provider
- **Goal:** publish a verified Listing so Customers can discover it.

### Customer
- **Goal:** find a Listing that matches a need and request a Quote.

## Functional requirements

- **FR-1.** The system MUST allow a Provider to submit a Listing draft.
- **FR-2.** The system MUST require Provider verification before publication.
- **FR-3.** Listings MUST be visible to Customers only when state = "published" (§36).
- **FR-4.** ...

## Non-functional requirements

- **NFR-1.** Listing search p95 latency ≤ 600 ms (will be tracked in docs/slos.md).
- **NFR-2.** Tenant isolation enforced at the data layer (§45).
- **NFR-3.** ...

## Out of scope

- Promoted placement (separate feature, future).
- Bulk publication via API (only one-at-a-time UI flow for v1).
- Multi-currency pricing (single currency per Provider for v1).

## Constraints

- Constitution: C.5 (money as integer cents).
- Compliance: GDPR — Listings may contain PII (Provider name); retention 7 years per C.8.

## Open questions

- (Carried over from grilling open-questions, if blocking.)
```

### Step 3 — Cross-check against the constitution

For every FR and NFR, verify no contradiction with `docs/constitution.md`. If a contradiction exists → flag and ask the human whether to revise the spec or amend the constitution (the latter is rare; it requires `/constitution` re-run).

### Step 3b — SLO/performance NFR source requirement

When an NFR mentions a numeric target for **latency**, **throughput**, **error rate**, or **availability**, the spec **cannot** invent the number. Every such NFR must declare its source from one of three:

| Source | When applicable | Format in spec |
|---|---|---|
| **Existing baseline** | Brownfield change to an endpoint already measured | `NFR-N. (latency target). Source: docs/perf-baselines/<endpoint>.md baseline 2026-04-15` |
| **Explicit stakeholder decision** | Greenfield endpoint; the human gave a target during grilling | `NFR-N. (latency target). Source: stakeholder decision in docs/decisions/grilling/<slug>-*.md Q14` |
| **Constitution default** | The constitution declares a default for endpoint class | `NFR-N. (latency target). Source: constitution C.7 (default p95 ≤ 500 ms for public API)` |

If none of the three sources applies, the NFR ships as **`TBD — requires source`** and `/specify` stops to ask the human:

> "FR-X mentions p95 latency target of 400ms, but no baseline exists, the grilling transcript has no record of this number, and the constitution doesn't declare a default for this endpoint class. Where does 400ms come from?
>
> - (a) I have a baseline → point to the file.
> - (b) This is a stakeholder decision I'm making now → I'll record it.
> - (c) I'll let it default to the constitution → I need to add the default first.
> - (d) Drop this NFR for v1 → defer until evidence exists."

This rule kills the "p95 ≤ X ms appeared from nowhere" pattern. Every numeric target in production traces back to a source.

### Step 4 — Cross-check against `CONTEXT.md`

Every domain noun in the spec must appear in `CONTEXT.md`. If any term is undefined → stop, run `/domain-model` again with that term.

### Step 5 — Mark as draft, save, return

The spec ships as `Status: Draft`. `/clarify` will mark it `Status: Clarified`. `/to-scenarios` will mark it `Status: In implementation`. The human marks it `Status: Released` after merge.

Save and return the path to the workflow.

## Integration with the framework

- **Invoked by `/feature` Step 5**.
- **Output consumed by `/clarify`, `/to-scenarios`, `/to-issues`, `/plan`**.
- **Read by `reviewer` agent**: spec drift between FRs and implementation is a finding.
- **Versioned in Git**: every spec change is a commit message `docs/specs: <feature-slug> — <change>`.

## What this skill never does

- Mention endpoints, HTTP methods, table names, libraries, or any other technical choice. That is for `/plan`.
- Skip a missing CONTEXT term — those are blocking.
- Mark Status as anything other than `Draft` — that's downstream.
- Write `.feature` files — that is `/to-scenarios`.
