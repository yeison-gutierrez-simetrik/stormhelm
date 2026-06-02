# ADR 0002 — Conditional ceremony by per-feature detection (not by project-level toggle)

**Date:** 2026-05-29
**Status:** Proposed
**Supersedes:** none
**Co-sign required:** original author of `stormhelm-improvements-20260529.md` (FW-5 reformulation) before status flips to `Accepted`.

## Context

Real use of Stormhelm on a SOC2+PCI marketplace project surfaced a friction: the framework produced 11 ADRs + spec + clarify-log + 20 scenarios + 5 issues **before a single line of code**, and the team observed the ratio of planning-to-code as very high. The original feedback (`stormhelm-improvements-20260529.md`, FW-5) proposed a project-level `track: lightweight | compliance` toggle as a relief valve.

The toggle proposal was retired after design discussion. Three problems with a project-level mode were identified:

1. **Stickiness in the worst direction.** A team that opts into `lightweight` on day 1 — when knowledge of what is sensitive is at its minimum — rarely graduates to `compliance`. The toggle decays toward permanent opt-out.
2. **Wrong granularity.** Sensitivity is a property of the **feature**, not the **project**. A "lightweight" project that later builds an auth feature must still produce a threat model; conversely, a "compliance" project's docs-only changes should not require multi-actor breakdown.
3. **Disposable code already has a valve.** `/prototype` exists for code that will not ship. The only legitimate use case for the toggle was already covered.

At the same time, the friction is real. Forcing the same ceremony envelope on a single-file CRUD endpoint and a payments orchestrator violates §1 (proportionality). The framework already encodes proportionality for some skills — `/sad` only fires for multi-module features, `/security-hardening` only for sensitive paths, `/threat-model` only when `require-human-review` is set — but `/specify`'s section list is not yet conditional, and there is no mechanism that escalates a feature's required ceremony when its real shape diverges from its initial classification.

This ADR formalizes a pattern that **extends the existing conditional triggers** rather than introducing a new axis of configuration.

## Decision

**Ceremony level is a derived property of each feature, not a configurable mode of the project.** It is computed from automatic detectors and recorded as GitHub labels; it is never declared by hand. The pattern has three safeguards that make it safe.

### Safeguard 1 — Detection is automatic; declaration is auditable

A feature's ceremony level is determined by which labels its detectors emit, **not** by a frontmatter field a human can edit silently:

| Label | Emitted by | Trigger |
|---|---|---|
| `feature:single-module` | `/to-issues` Step 3 | Touched modules ≤ 2 |
| `feature:multi-module` | `/to-issues` Step 3 | Touched modules ≥ 3 or bounded contexts ≥ 2 (§107) |
| `require-human-review` | `/to-issues` Step 3 | Any touched path matches `auth/`, `payments/`, `crypto/`, or constitution C.2 sensitive list |
| `nfr:slo-declared` | `/specify` Step 4 | Any NFR carries a quantitative SLO (e.g. `p95 < 200ms`) |
| `feature:cross-context` | `/domain-model` Step 3 | Vocabulary introduces terms from ≥ 2 bounded contexts |

A team can override the auto-classification, but only by **flipping a label via `gh issue edit`**, which produces an audit-grade event in the GitHub timeline. There is no `# lightweight: true` field anywhere because such a field would relocate the gaming target without removing it. The override is loud and traceable; the silent-default is the truth from the detectors.

### Safeguard 2 — Section taxonomy is structural, not metric

`/specify` produces a spec composed of sections. Each section is one of three types:

| Section | Type | Condition for "required" |
|---|---|---|
| Functional Requirements | Always mandatory | — |
| Acceptance criteria | Always mandatory | — |
| Out-of-scope | Always mandatory | — |
| Threat-model NFR | Conditional | label `require-human-review` |
| Multi-actor breakdown | Conditional | label `feature:multi-module` or `feature:cross-context` |
| SLO commitments | Conditional | label `nfr:slo-declared` |
| Capacity envelope | Conditional | label `feature:multi-module` |
| Background / Alternatives considered / Glossary | Always optional | — |

"Lightweight" therefore means: **fewer sections required**, not fewer lines per section. A line cap (e.g. "≤200 lines") was considered and rejected — it is a proxy that does not survive contact with a determined corner-cutter. A required-section list is the invariant the framework actually cares about and is straightforward to verify mechanically (`/traceability-matrix` already enumerates required sections; this ADR widens that to be label-aware).

### Safeguard 3 — Escalation is unidirectional and blocks merge

The dangerous failure mode is a feature that **starts** classified as light but **becomes** sensitive during implementation (e.g. the diff adds an `Authorization:` header parser the spec never mentioned). To prevent silent under-ceremony:

- **Re-detection is continuous.** The `reviewer` agent (§114) receives the feature's labels as context. When it audits a diff, it re-runs the detectors against the diff itself. If the post-diff classification is heavier than the pre-diff classification — e.g. the diff introduces a sensitive path — the agent emits a 🛑 finding of category `requires-escalation` naming the artifacts now required (e.g. `ADR for auth approach`, `docs/threat-models/<scope>-*.md`).
- **The invariant gate blocks merge.** `scripts/check-invariants.mjs` gains `INV-6 §X: classification stable across diff` — fails if the diff implies a heavier classification than the labels reflect, and demands the backfill artifacts before passing. `/traceability-matrix` runs this and refuses to certify release until satisfied. The PR cannot merge.
- **Escalation is one-way.** A feature can be promoted `light → full` automatically by the detectors. A feature is **never** auto-degraded from `full → light`. Degrading is an explicit human override via label flip and is treated as a `[skip-invariant: INV-6 — reason: ...]` event in the auditable override pattern from PR-D.

The asymmetry — auto-promote, never auto-degrade — closes the worst failure case of a project-level toggle: a feature whose risk profile changed under implementation and quietly stayed in the relaxed regime.

### Bootstrap defaults (separate, smaller change)

The original feedback noted a residual pain that conditional ceremony does not solve: the bootstrap cost of seeding constitution + CONTEXT. This is addressed not by a mode flag but by **smaller defaults in `/setup`**:

- `docs/constitution.md` ships as a 30-line stub with placeholders for C.1 (SLO: `best-effort, fill before first release`), C.2 (sensitive paths: `none identified yet — re-evaluate per feature`), C.3 (stack: detected from project), C.4 (values: empty with TODO marker).
- `docs/CONTEXT.md` ships with bounded-contexts list empty and a TODO marker for the first feature's vocabulary.
- No ADRs are seeded beyond what the framework itself ships (ADR-0001, this ADR-0002). Subsequent ADRs appear when a detector triggers their need.

A solo developer pays the minimum on day 1. Cost grows precisely when a feature's classification grows.

## Considered alternatives

- **Project-level toggle (FW-5 original).** Rejected for the three reasons in the Context section: stickiness, wrong granularity, redundant with `/prototype`.
- **Line caps per section.** Rejected as gameable proxy; a 200-line spec can omit the critical FR. Structural section requirements are the proper invariant.
- **Author-declared sensitivity.** Rejected: relocates the opt-out target from a global toggle to a per-feature checkbox without removing the gaming surface. Detection-driven classification + auditable label override is the safe pattern.
- **Self-declared ceremony level in spec frontmatter.** Same defect as author-declared sensitivity; not adopted.

## Decision

Adopt the conditional ceremony pattern with all three safeguards. Update `/specify`, `/to-issues`, `reviewer`, and `/traceability-matrix` to honor the section taxonomy and the escalation invariant. Update `/setup` defaults to the minimal-bootstrap shape. Do **not** introduce any project-level mode flag.

## Consequences

### Skills and scripts affected

| Component | Change | Estimated effort |
|---|---|---|
| `/specify` | Section list becomes label-aware. Generated spec contains exactly the required sections for the feature's current classification, plus an explicit `<!-- pending-promotion -->` block for the conditional sections that would be added if a detector escalates. | 1 day |
| `/to-issues` Step 3 | Already does sensitivity scanning; extends to emit the three new labels (`feature:single-module`, `feature:multi-module`, `feature:cross-context`) explicitly rather than implicitly via §107. Auto-creates the labels in the repo if missing (`gh label create --force`). | 0.5 day |
| `/domain-model` Step 3 | Emits `feature:cross-context` when vocabulary crosses bounded contexts. Cheap derivation from the diff to CONTEXT.md. | 0.5 day |
| `reviewer` agent | Receives the feature's labels as context; re-runs detectors on the diff; emits `requires-escalation` finding when post-diff classification is heavier than pre-diff. | 1 day |
| `scripts/check-invariants.mjs` | Adds **INV-6 §N — classification stable across diff**. Reads labels + diff, compares against detectors, blocks if escalation pending without backfill. | 1 day |
| `scripts/check-framework-metadata.mjs` | Verifies that each `/specify`-required section, when conditional, has its trigger label documented in the spec. Prevents drift between this ADR and the skills. | 0.5 day |
| `/setup` | Ships the minimal constitution + CONTEXT stubs and no project-level mode prompts. | 0.5 day |
| `docs/engineering/core/12-bdd-and-acceptance.md` (§58 area) | Documents the label-driven required-section taxonomy as a §N amendment. | 0.5 day |
| `docs/WORKFLOWS-GUIDE.md` | Section 1 (philosophy) gains a paragraph on conditional ceremony being derived, not configured. | 0.5 day |

Total: **6 days** of focused work, in three PRs:

- **PR-M:** detector emission + section taxonomy in `/specify`, `/to-issues`, `/domain-model`.
- **PR-N:** escalation mechanism in `reviewer` + `check-invariants.mjs` (INV-6) + traceability gate.
- **PR-O:** `/setup` minimal defaults + docs amendments.

### Positive consequences

- Ceremony cost is proportional to the feature's real shape, not the project's day-1 declaration.
- A team that builds 10 trivial features pays trivial cost on each; the 11th feature that touches `auth/` automatically pays full cost.
- The override path exists but is loud (label flip in GitHub timeline), so under-ceremony is detectable in audit.
- No new configuration axis. The pattern extends what the framework already does (`/sad` multi-module, `/security-hardening` sensitive, `/threat-model` on label) to `/specify`'s section composition.

### Negative consequences

- **More detectors to maintain.** Each new detector is a piece of logic that can have bugs. The mitigation is that detectors are conservative (false positives over false negatives) and override is loud.
- **One-off transition cost on existing features.** Specs and issues written before this ADR will not have the new labels. A migration script (`scripts/migrate-classify-existing.mjs`) is part of PR-M; it scans existing features, computes the labels they would have received, and prints a report for human review before applying.
- **Reviewer audit cost grows.** The agent must re-run detectors on every diff. This is bounded (the detectors are O(diff size)) but adds latency. Acceptable for the safety gain.

### Compatibility with prior ADRs

- **ADR-0001 (GitHub-only).** Compatible. The detection mechanism leans entirely on GitHub labels and `gh` CLI — same surface as the rest of the framework.
- **No supersession.** ADR-0002 introduces a new mechanism; it does not retract or alter ADR-0001.

## Open questions (resolve before flip to Accepted)

1. **Detector for `feature:multi-module` — counted how?** Touched modules computed from the diff path prefixes or from the spec's "Component map" section? Both have failure modes; pick one and document. _(Proposed: from `/plan` output, falling back to diff path prefixes when no plan exists yet.)_
2. **Section taxonomy in capabilities, not just core.** Does `capabilities/python-fastapi` add its own conditional sections (e.g. async patterns)? Or do capabilities only contribute rules, not section requirements? _(Proposed: capabilities contribute rules only; section taxonomy lives in core.)_
3. **What §N number does INV-6 cite?** The "classification stability across diff" rule does not exist yet in `docs/engineering/core/`. Likely belongs in `core/12-bdd-and-acceptance.md` or a new `core/21-conditional-ceremony.md`. _(Proposed: §123 in `core/12`, since it sits next to §58 approval-state.)_ <!-- metadata-ok: §123 is the rule this ADR proposes to add; it intentionally exceeds the current max. -->

## References

- Original feedback document: `~/Library/Application Support/.../uploads/stormhelm-improvements-20260529.md`
- Design discussion: thread between Yei + the feedback author, 2026-05-29.
- Existing conditional-trigger precedents: §107 (multi-module `/sad`), §87 (sensitive `/threat-model`), §64 (sensitive paths).
- Override pattern: `skip-invariant: INV-N — reason:` from PR-D (executable invariants).

## Notes on this ADR

This ADR is `Proposed`, not `Accepted`. The status flips only after the original feedback author co-signs the commit, per the framework's tenet that decisions touching framework philosophy are not unilateral. Implementation PRs (PR-M, PR-N, PR-O) do not start until the ADR is `Accepted`.
