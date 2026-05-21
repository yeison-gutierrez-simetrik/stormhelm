---
name: strangler-plan
description: |
  Generates a phased migration plan to replace a legacy module incrementally
  using the strangler fig pattern (§74): build new alongside old, route
  incrementally with feature flag, kill old last. The output is an ADR + a
  sequence of issues that can be executed independently. Used when /impact-
  analysis decides "in-place modification is too risky."
  Use when: B5 decision in brownfield sub-flow chooses strangler, or major
  dependency upgrade (§100B) requires gradual cutover. Do NOT use for changes
  that can be done in-place.
---

# /strangler-plan — Phased Migration Plan

## Purpose

When a module must be replaced rather than modified — too coupled, too risky, too entangled — the strangler fig pattern (§74) lets the replacement happen safely: build the new alongside the old, route incrementally, kill the old last. `/strangler-plan` produces the phased plan and the issue sequence to execute it.

This is the heaviest brownfield path. Reserve for cases where in-place is genuinely unsafe.

## When to invoke

- B5 step of brownfield sub-flow chooses "strangler" over "in-place."
- Major dependency upgrade (§100B) when the dep change is too breaking for a single PR.
- Replacing an entire bounded context (e.g., migrating from Express to Hono).

## When NOT to invoke

- For changes that can ship in-place safely (impact analysis confirms low blast radius).
- For prototypes (overkill).
- For internal-only modules with no external consumers (just rewrite).

## Inputs

- The legacy module to replace.
- `/impact-analysis` output (consumers, blast radius).
- The replacement design (high-level — what the new looks like).
- `docs/constitution.md` (compliance constraints on rollback / data preservation).

## Outputs

- An ADR in `docs/adr/NNNN-strangler-<module>.md` documenting the migration decision.
- A sequence of GitHub issues, one per phase (typically 4-6 issues).
- Feature flag configuration (in code or external service like LaunchDarkly / GrowthBook).

## Workflow

### Step 1 — Read impact analysis

The replacement must be informed by who consumes the legacy module. Without `/impact-analysis` output, this skill cannot proceed (consumers must be known to design routing).

### Step 2 — Design the three phases

The canonical phases (§74):

**Phase 1 — Build new alongside old**
- New implementation lives in parallel directory: `src/quotes-v2/` or `src/payments/new/`.
- Old continues to handle 100% of traffic.
- New is **dark-launched**: it runs but does not affect responses.
- Differential testing compares old vs new output for the same input.

**Phase 2 — Route incrementally with feature flag**
- Add a feature flag gating which implementation handles requests.
- Rollout: 1% → 10% → 50% → 100% over days/weeks.
- Per-tenant or per-user gating allowed via `flagsPort.isEnabled({tenantId, userId})`.
- Metrics compare error rate, latency, and business outcomes between old and new.
- Rollback is a flag change, not a deploy.

**Phase 3 — Kill the old**
- 100% on new for the agreed soak period (typically 2 weeks).
- Old code **deleted**, not commented out.
- Feature flag removed.
- `-v2` suffix dropped — what was new becomes canonical.

### Step 3 — Write the ADR

```markdown
# ADR 0023 — Strangler migration of <module>

**Date:** YYYY-MM-DD
**Status:** Proposed
**Context:** <legacy module> has <reason it's hard to modify in-place>.
**Decision:** Replace via strangler over 3 phases.

## Phase 1 — Dark launch (target: 2 weeks)
- New implementation in src/<module>-v2/.
- Differential testing on every request.
- Exit criteria: ≥99% output match over 10k requests.

## Phase 2 — Incremental rollout (target: 3-4 weeks)
- Feature flag `<module>.v2.enabled` per tenant.
- Rollout schedule: week 1 = 1% canary tenants, week 2 = 10%, week 3 = 50%, week 4 = 100%.
- Rollback: flag flip; no deploy needed.
- Exit criteria: error rate parity, latency parity (±10%), business metrics parity.

## Phase 3 — Decommission (target: 1 week)
- Delete src/<module>/ (the old).
- Remove feature flag.
- Rename src/<module>-v2/ → src/<module>/.
- Update all import paths.

## Rollback plan
At any point before Phase 3: flip flag to 0%.
After Phase 3: revert the deletion commit (cherry-pick from history).

## Compliance considerations
- Data preservation: any DB writes by the new must be consumable by the old until Phase 3.
- Audit trail: differential test results retained per C.8 (7 years).
```

### Step 4 — Generate issue sequence

Create one issue per phase + sub-tasks. Example:

```
#180 — [Strangler Phase 1] Build <module>-v2 with dark launch
  Labels: improvement:dep-upgrade, shift:hitl, severity:p2

#181 — [Strangler Phase 1] Add differential testing harness for <module>
  Labels: improvement:dep-upgrade, shift:afk, severity:p2

#182 — [Strangler Phase 2] Add feature flag <module>.v2.enabled
  Labels: improvement:dep-upgrade, shift:afk, severity:p2

#183 — [Strangler Phase 2] Canary rollout to 1% tenants + monitoring dashboard
  Labels: improvement:dep-upgrade, shift:hitl, require-human-review, severity:p1

#184 — [Strangler Phase 2] Rollout to 10%, 50%, 100% (3 sub-PRs, gated by metrics)
  Labels: improvement:dep-upgrade, shift:hitl, require-human-review, severity:p1

#185 — [Strangler Phase 3] Decommission <module> (old code, flag, rename)
  Labels: improvement:dep-upgrade, shift:hitl, require-human-review, severity:p1
```

### Step 5 — Return summary

```markdown
## /strangler-plan output

**Module:** <module>
**ADR:** docs/adr/0023-strangler-<module>.md
**Phases:** 3 (Build, Route, Kill)
**Issues created:** 6 (#180-#185)
**Estimated timeline:** 7-8 weeks
**Feature flag:** <module>.v2.enabled

Next: invoke /tdd on #180 to start Phase 1.
```

## Integration with the framework

- **Invoked by B5 step of brownfield sub-flow** when the decision is strangler.
- **Invoked by §100B** (major dep upgrade) when impact analysis warrants gradual rollout.
- **Output (issues) consumed by `/tdd`, Ralph, and human reviewers**.
- **ADR consumed by `reviewer` agent**: any PR in this migration must respect the phase plan.

## What this skill never does

- Decide between in-place and strangler (that's the B5 human decision).
- Skip the ADR (auditability requires it).
- Bundle phases into one PR (each phase is independent for rollback safety).
- Delete the old code before the soak period (§74 — incremental kill, not big bang).
