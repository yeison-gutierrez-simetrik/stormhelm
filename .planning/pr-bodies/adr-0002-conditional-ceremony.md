# docs(adr): ADR-0002 — Conditional ceremony by per-feature detection (Proposed)

> ⚠️ **This PR is `Proposed`, not `Accepted`.** The status flips only after the original feedback author (belong-marketplace) co-signs the commit, per the framework's tenet that decisions touching framework philosophy are not unilateral. Three open questions must be resolved first (see below).

## TL;DR

A SOC2+PCI marketplace produced 11 ADRs + spec + clarify-log + 20 scenarios + 5 issues **before a single line of code** — the planning-to-code ratio was justifiable for the compliance context but uncomfortable as the framework default. The original proposal (FW-5) was a project-level `track: lightweight | compliance` toggle. It was **retired during design** because of three problems:

1. **Stickiness.** A "lightweight" project on day 1 rarely graduates to "compliance" — the toggle decays toward permanent opt-out.
2. **Wrong granularity.** Sensitivity is a property of the feature, not the project. A "lightweight" project that later builds auth still needs full ceremony for that feature.
3. **Redundant.** `/prototype` already covers code that will not ship. The only legitimate toggle use case was already served.

ADR-0002 replaces the toggle with a derived property: **ceremony level is computed from per-feature detectors**. Three safeguards make it safe.

## Decision (full text in `docs/adr/0002-conditional-ceremony-by-detection.md`)

### Safeguard 1 — Detection automatic, declaration auditable

Labels emitted by detectors, not declared by humans:

- `feature:single-module` / `feature:multi-module` — from `/to-issues` Step 3.
- `require-human-review` — from sensitive-path scan in `/to-issues` Step 3.
- `feature:cross-context` — from `/domain-model` Step 3.
- `nfr:slo-declared` — from `/specify` Step 4.

Override is loud: `gh issue edit --add-label` produces an audit-grade event in the GitHub timeline. No silent frontmatter declaration.

### Safeguard 2 — Section taxonomy structural, not metric

`/specify`'s section list becomes label-aware. FRs + acceptance + out-of-scope are always mandatory. Threat-model NFR, multi-actor breakdown, SLO commitments, capacity envelope are conditional on the corresponding label. Lightweight = fewer sections required, not shorter sections.

### Safeguard 3 — Escalation unidirectional, blocks merge

The `reviewer` agent re-runs detectors on the diff. If post-diff classification is heavier than pre-diff (e.g. the diff introduces a sensitive path the spec didn't mention), it emits a `requires-escalation` finding. New **INV-6 §123** (proposed) blocks merge until the backfill artifacts (ADR / threat model) exist. Auto-promote `light → full`; never auto-degrade.

## Open questions (must be resolved before flip to `Accepted`)

1. **Multi-module counter — from `/plan` or diff path prefixes?** Proposed: from `/plan` (which produces "Layers affected"), fallback to diff path prefixes when no plan exists. This depends on the `scripts/parse-layers-affected.mjs` shared parser (separate PR).

2. **Capabilities contribute conditional sections or only rules?** Proposed: capabilities contribute rules only; section taxonomy lives in core.

3. **What §N does INV-6 cite?** Proposed: §123 in `core/12-bdd-and-acceptance.md`, adjacent to §58 (feature approval state machine).

## What this PR does NOT contain

The implementation is **PR-M**, deferred to a separate PR. PR-M includes:

- Section taxonomy in `/specify` (label-aware).
- Label emission in `/to-issues` Step 3 + `/domain-model` Step 3.
- INV-6 in `scripts/check-invariants.mjs`.
- `reviewer` agent re-detection on diff.
- Minimal-bootstrap defaults in `/setup`.

PR-M does not start until this ADR is `Accepted` AND the three open questions are resolved.

## Co-sign request

This ADR represents a substantive change to framework philosophy (when does ceremony fire, and by what mechanism). Per the framework's own discipline, that requires explicit co-sign rather than unilateral merge.

The co-sign protocol: after the open questions are resolved (likely via comments on this PR), the merge commit should carry a `Co-Authored-By:` trailer for the belong-marketplace feedback author. The trailer is the audit-grade record that this was not unilateral.

## Refs

- `.planning/framework-feedback/stormhelm-improvements-20260529.md` (FW-5 origin).
- `.planning/framework-feedback/reply-to-response-slice01-part2.md` (the three safeguards came from this reply).
- ADR-0001 (`docs/adr/0001-stormhelm-requires-git-and-github.md`) — same format, different decision, accepted.

## Acceptance (for the PR itself, not the ADR)

- [x] ADR file exists with format matching ADR-0001.
- [x] `Status: Proposed` is explicit; co-sign requirement stated.
- [x] References to upstream feedback documents accurate.
- [x] Framework linter green (the `metadata-ok` comment on the line citing §123 prevents the linter from blocking on a forward reference to a not-yet-defined rule).
