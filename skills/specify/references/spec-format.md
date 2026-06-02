# Spec Format

`/specify` produces `docs/specs/<feature-slug>.md`. The spec is the source of truth for `/to-scenarios`, `/to-issues`, `/plan`, and `/sad` downstream. It is intentionally silent on **how** (no endpoints, schemas, library choices) — those decisions belong to `/plan`.

## Template

```markdown
# <Feature Title>

- **Status:** Draft | Clarified | Released
- **Owner:** <human or team>
- **Spec ID:** <slug>
- **Created:** YYYY-MM-DD
- **Vocabulary source:** `docs/CONTEXT.md`

## Why

<2-3 paragraphs in business language. What changes in the world after this feature ships, and why now?>

## Actors

- **<Actor>** — <role, motivation>

## User stories

- As a <Actor>, I want to <do X> so that <outcome>.
- As a <Actor>, I want to <do Y> so that <outcome>.

## Functional requirements

- **FR-1.** <observable behavior the system must exhibit>.
- **FR-2.** <…>.

## Non-functional requirements

- **NFR-1.** <Quality Attribute + measurable threshold; e.g., p95 latency at /v1/x < 200ms>.
- **NFR-2.** <…>.

## Out of scope

- <Explicit non-goal>.
- <…>.

## Dependencies

- <External team, external system, or upstream feature this depends on>.

## Open questions

- See `docs/decisions/grilling/<slug>-open-questions.md`.

## Clarifications log

<Appended by /clarify; not present in Draft status.>
```

## Discipline

- **No technical detail.** No endpoints, schemas, libraries, frameworks. If a stack constraint is non-negotiable, capture it as an ADR; the spec references the ADR.
- **Vocabulary is canonical.** Every domain term in the spec must appear in `docs/CONTEXT.md` (§22). New terms emit ADRs via `/domain-model`.
- **NFRs are measurable.** "Fast" is not an NFR; "p95 < 200ms at /v1/listings" is.
- **Out-of-scope is explicit.** A spec without out-of-scope items is suspect — most features have non-goals that need stating.

## Downstream consumption

- `/to-scenarios` — derives `.feature` files, one per bounded context.
- `/to-issues` — derives vertical-slice issues with the Ralph label set.
- `/plan` — derives technical plan per issue (file paths, ports, adapters, tests).
- `/sad` — quotes `Why` + NFRs into the SAD's "Context & constraints" and "Quality Attributes" sections.
