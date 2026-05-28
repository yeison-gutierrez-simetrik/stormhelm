---
name: sad
description: |
  Assembles a Solution Architecture Document snapshot for a feature or the whole
  system by reading existing Stormhelm artifacts — spec, constitution, CONTEXT.md,
  ADRs, threat models, prototype LEARNING.md, plan files, perf baselines. The SAD
  is **derived, never hand-written**: every section quotes or references its
  source so the document cannot drift independently. Output lives in
  `docs/architecture/<scope>-<YYYYMMDD>.md` and is regenerated on demand.
  Use when: a feature crosses ≥3 modules or a new bounded context, before
  significant architecture work, when an external reviewer / auditor / new hire
  needs a single entry point, or quarterly as part of governance. Step 7.5 of
  /feature (optional, between /clarify and /to-scenarios). Do NOT use to invent
  architecture from nothing — the source artifacts must exist first.
---

# /sad — Derived Solution Architecture Document

## Purpose

The information that belongs in a SAD already lives in Stormhelm: NFRs in the spec carry Quality Attributes, ADRs carry decisions, threat models carry security posture, `/plan` files carry the port/adapter layout, `/prototype` LEARNING.md carries evidence. The problem is **assembly**: nobody reads 10+ files to understand a feature's architecture, and a hand-written SAD rots within a quarter.

`/sad` is an **assembler**, not an author. It produces a snapshot that points back at the canonical sources. When the sources change, you regenerate; the SAD never drifts independently.

## When to invoke

- A feature crosses ≥3 modules or introduces a new bounded context.
- Before significant architecture work (major migration, new external integration, new persistence layer).
- An auditor, external reviewer, or new hire needs a single entry point.
- Quarterly governance review.
- Step 7.5 of `/feature` (optional, between `/clarify` and `/to-scenarios`).

## Auto-invocation triggers in `/feature`

`/sad` runs automatically as Step 7.5 of `/feature` (between `/clarify` and `/to-scenarios`) when **any** of:

- **Multi-module:** spec spans 3+ modules or 2+ bounded contexts (same trigger as Agent Teams §107 — keeps the architectural envelope explicit before parallel work begins).
- **Sensitive paths:** spec touches `auth/`, `payments/`, `crypto/`, or other §64 paths — the threat model already exists and `/sad` just assembles it; cheap insurance against architectural drift in regulated areas.
- **External integration:** spec introduces a new external service (matches the `introduces-capability:*` label trigger from `/to-issues`).

For mono-module, non-sensitive features `/sad` is **optional** and only invoked manually if the team wants a snapshot for stakeholders or onboarding. This keeps the cost of `/sad` proportional to architectural risk and avoids forcing assembly when there is little to assemble.

## When NOT to invoke

- For trivial features (single endpoint, one module) — the spec is enough.
- Before `/specify` and `/clarify` — there is nothing to assemble yet.
- To invent architecture from nothing — the source artifacts must exist first; if they don't, run `/grill-me`, `/specify`, `/clarify`, `/prototype` until they do.
- To produce a marketing-grade narrative — `/sad` is an audit document, not a pitch.

## Inputs

- `docs/specs/<feature-slug>.md` (FRs, NFRs, out-of-scope).
- `docs/constitution.md` (project tenets, compliance frameworks).
- `docs/CONTEXT.md` (ubiquitous language, bounded contexts).
- `docs/adr/*.md` (every ADR matching the scope; identify by slug or by ADR date range).
- `docs/threat-models/*.md` (security posture, if `/security-hardening` ran).
- `.planning/prototypes/<slug>/LEARNING.md` and `.planning/prototypes/<slug>/` reports (evidence).
- `docs/perf-baselines/*.md` (SLO-related evidence from `/optimize`).
- `issues/<slug>/*.md` and `.planning/plans/*.md` (per-issue plans from `/plan`).
- Open questions from `.planning/grilling/<slug>-open-questions.md`.

## Outputs

- `docs/architecture/<scope>-<YYYYMMDD>.md` — the SAD snapshot. `<scope>` is either the feature slug or `system` for a whole-project snapshot.
- The file is **versioned in git** so historic snapshots remain reviewable, but every regeneration writes a new dated file rather than overwriting.

## Pre-flight checks

Before Step 1 (§58, ADR-0001):

- The spec for the scope exists and is `Status: Clarified` or `Released` (not Draft).
- The scope genuinely triggers `/sad` (≥3 modules / ≥2 bounded contexts, or a sensitive path) — otherwise the spec is enough.

## Workflow

### Step 1 — Resolve scope

Ask the human one multiple-choice question if the scope is not obvious from invocation:

```markdown
**Q.** What is the scope of this SAD?

- **(a) Single feature** — ✅ recommended when a feature crosses ≥3 modules. Inputs: that feature's spec + related ADRs.
- **(b) Bounded context** — when one bounded context (e.g., billing) needs an aggregated view.
- **(c) Whole system** — quarterly governance or external-audit snapshot.
- **(d) Other / correction** — describe.
```

The scope decides which spec, which ADRs, which threat models are in scope.

### Step 2 — Force a Quality-Attribute priority

This is the section that does **not** derive from existing artifacts and is the reason `/sad` exists. NFRs in the spec list QAs but rarely prioritize them.

For each pair of QAs in tension, ask the human a MCQ:

```markdown
**Q.** When latency (NFR-2: p95 < 200ms) and availability (NFR-4: 99.9%) conflict,
which wins?

- **(a) Latency wins** — degrade availability with circuit breakers and shed load.
- **(b) Availability wins** — ✅ recommended if regulatory exposure is high; accept p99 spikes during partial outages.
- **(c) Other / correction** — describe.
```

Record the priorities as `QA.1, QA.2, ...` in order. These become the SAD's authoritative trade-off list and feed `reviewer`'s assessment of future PRs ("does this PR respect the QA priority?").

### Step 3 — Assemble each section by reference

Walk the template (`references/template.md`). For each section, **quote or link** the source artifact; do not paraphrase. If a section has no source, mark it `(no source — open question)` and stop to create an open question rather than inventing content.

Required sections (others are optional):

1. **Context & constraints** — quote the spec's "Why" + constitution C.N references.
2. **Quality Attributes (prioritized)** — from Step 2.
3. **Decisions** — list of relevant ADRs with one-line summary each, in chronological order.
4. **Vocabulary delta** — terms in `CONTEXT.md` introduced or refined by this scope.
5. **Component map** — assembled from `/plan` files; lists ports, adapters, external services, entrypoints touched.
6. **Threat model summary** — if `/security-hardening` ran, link + one-paragraph summary of top 3 findings.
7. **Evidence** — list `/prototype` LEARNING.md files with one-line outcome each; list `/optimize` baselines with current vs target.
8. **Operational concerns** — references to relevant §77-§83 (observability) and §15-§18 (infrastructure) rules.
9. **Open questions** — copied from grilling open-questions, with current status.
10. **Risks** — derived from threat model findings + prototype "neither variant won" outcomes + spec out-of-scope items that may need a follow-up.

### Step 4 — Validate every reference

Before writing the file, verify each cited artifact exists and is current:

- ADR cited → file present, status `accepted` or `superseded` (annotate which).
- Spec cited → status is `Clarified` or `Released`, not `Draft`.
- Threat model cited → not older than 90 days for sensitive features.
- Prototype LEARNING.md → exists; if missing, the prototype was not finalized, mark evidence as `(prototype incomplete)`.

Stale references kill the SAD's value. Better to write `(stale, regenerate /security-hardening)` than to cite a 200-day-old threat model as current.

### Step 5 — Write and link

Write `docs/architecture/<scope>-<YYYYMMDD>.md`. Append a one-line entry to `docs/architecture/INDEX.md`:

```markdown
- 2026-05-26 — billing — `billing-20260526.md` — feature-scope SAD (covers FR-1..FR-9, ADR-0014..ADR-0018)
```

### Step 6 — Return

Tell the human:
- Which sections derived cleanly.
- Which sections required Step 2 priorities (and the recorded answers).
- Which sections marked `(no source)` and the open questions that resulted.
- The next workflow step (`/to-scenarios` if invoked from `/feature`).

## Integration with the framework

- **Invoked optionally between `/clarify` and `/to-scenarios`** when scope is large.
- **Read by `reviewer` agent** when reviewing a feature whose SAD exists; the QA priorities (Step 2) become a §N-style citable contract for the agent's findings.
- **Read by `/traceability-matrix`** at release; SAD links are part of the audit trail.
- **Regenerated on demand**, never edited by hand. Comments in the file enforce this: a `<!-- DERIVED — DO NOT EDIT; rerun /sad to refresh -->` banner at the top.

## What this skill never does

- Invent architecture not present in source artifacts.
- Paraphrase decisions instead of quoting them (paraphrase invites drift).
- Overwrite a prior SAD snapshot — new dates, new files, historic ones stay.
- Replace `/specify` (which captures intent), `/domain-model` (vocabulary), or individual ADRs (decisions). It composes them.

## Attribution

The "architecture as derived snapshot, not hand-written doc" pattern is original to Stormhelm; the document-shape inspiration is adapted from `/alejo-sad` in `sandcastle-synth`.
