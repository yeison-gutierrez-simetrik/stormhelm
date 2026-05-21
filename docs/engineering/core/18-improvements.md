# 18 — Improvements

**Scope.** Work that is neither a new feature nor a bug fix: refactoring without behavior change, performance optimization, technical debt reduction, proactive security hardening, and dependency upgrades. Each kind has different cadence, validation, and gate requirements.

**When to read.** Planning a refactor; profiling a slow endpoint; deciding what tech debt to take on this sprint; hardening a component before audit; bumping a dependency; reviewing a PR labeled `improvement`.

**Rules in this file.** §97, §98, §99, §100, §101, §102

> See `../AGENTS.md` for the full rule index. Related: `14-brownfield.md` (modifying legacy code), `15-observability.md` (§81 SLOs as performance targets, §83 SLO gate), `16-security-supply-chain.md` (§87 threat modeling), `17-bug-handling.md` (§94 one bug, one PR — extended here as §98).

---

## The five kinds of improvement

Before applying rules, classify the improvement. Different kinds use different workflows and gates.

| Kind | Trigger | Workflow | Skill |
|---|---|---|---|
| **A. Refactor** | Code is correct but hard to read/extend; deepening opportunity found | `/improve-codebase-architecture` (AI Hero, referenced) → §102 | none new |
| **B. Performance** | SLO at risk, slow endpoint reported, cost optimization | `/optimize` skill (5 steps with baseline) → §97 | **`/optimize`** |
| **C. Tech debt** | Pattern violation (e.g. §25 in 4 places), test gaps, complexity hotspots | Tech-debt item as feature with `tech-debt` label and ICE rubric → §99 | none new |
| **D. Security hardening** | Threat model identifies gap; pre-audit prep | STRIDE threat model (§87) → §101 | none new |
| **E. Dependency upgrade** | Renovate/Dependabot PR; major version available; CVE notice | Runbook embedded below → §100 | none new |

Issues are labeled accordingly: `improvement:refactor`, `improvement:perf`, `improvement:tech-debt`, `improvement:hardening`, `improvement:dep-upgrade`.

---

## §97. Baseline before optimizing; no performance work without measurement

Performance optimization is forbidden without a measured baseline captured **before** any code change. The baseline lives in the PR description and (for changes affecting tracked endpoints) in `docs/perf-baselines/`.

This rule is adopted from `performance-optimization` (addyosmani/agent-skills).

### Required artifact

```markdown
## Baseline (§97)

**Endpoint / function:** POST /v1/quotes/:id/accept
**Measurement environment:** staging, 50 req/s synthetic load, 5 min warmup + 5 min measurement
**Tool:** k6 0.49
**Date:** 2026-05-20

**Before:**
- p50 latency: 320 ms
- p95 latency: 870 ms
- p99 latency: 2100 ms
- Throughput: 47.2 req/s
- CPU (worker): 78%
- Memory (worker): 412 MB

**Target:**
- p95 ≤ 600 ms (declared SLO in docs/slos.md)
- p99 ≤ 1500 ms
```

The same measurement is repeated after the change and posted as `## After` in the PR description. If the delta is not measurable (e.g., noise > improvement), the PR is rejected.

### Why

- Without baseline, "faster" is subjective.
- The post-change measurement is the only proof the optimization worked.
- The baseline becomes the entry in `docs/perf-baselines/` for future comparison and §83 (SLO gate).

### Bad

```markdown
## Optimization

Made the query faster by adding an index. Should improve latency.
```

No baseline, no after-measurement, no proof. Triggers `improvement-blocked` in review.

### Exceptions

- **Algorithmic asymptotic improvements** (e.g., O(n²) → O(n log n)) where the complexity proof is the evidence. Still requires before/after timing in the PR, but the proof carries the burden.
- **CVE-driven changes** where the fix is mandatory regardless of perf impact — measurement is informational.

---

## §98. One improvement, one PR

A PR labeled `improvement:*` contains exactly one improvement. It does not bundle:

- Refactor + perf optimization (separate PRs).
- Tech debt cleanup + bug fix (separate PRs — §94).
- Dependency upgrade + the code changes that the upgrade enables (the upgrade comes first; the use of new APIs follows).

This is an extension of §76 (refactor vs behavior change) and §94 (one bug, one PR).

### Why

Improvements are easier to review and easier to revert when scoped. A 200-line PR that mixes "cleaned up a use case + added an index + bumped lodash" makes future bisect impossible.

### Exception

When the improvement is intrinsically multi-faceted (e.g., adopting a new logging framework requires touching every adapter), the PR is acceptable **if** the diff is mechanically reviewable (find/replace + minor edits) and the PR description enumerates each change.

---

## §99. Tech debt items are features with explicit rubric

Tech debt is not a separate workflow — it is feature work labeled `improvement:tech-debt` and prioritized via an explicit rubric. The same gates apply (§56-§62 BDD, §60 release scenarios, §83 SLO).

### Issue template

Every tech debt issue includes these fields in its body:

```markdown
## Tech debt item

**Category:** [pattern violation / test gap / complexity hotspot / deprecated API in use / coupling reduction]

**Affected files:** [list paths]

**Origin:** [discovered during /debug Step 2b on issue #142 / proactive audit / new-developer surprise]

## ICE Rubric

**Impact** (1-10): _Severity if untouched. Frequency of contact. Blast radius if it fails._
**Confidence** (1-10): _How confident are we the proposed cleanup will work?_
**Ease** (1-10): _Inverse of effort. 10 = trivial, 1 = multi-sprint._

**ICE Score:** _Impact × Confidence × Ease_

## Proposed cleanup

[concrete description, files to change, expected diff size]

## Acceptance scenarios

scn-NNN, scn-NNN — existing scenarios that must continue passing.
No new scenarios unless the cleanup is itself observable behavior.
```

### Prioritization rule

Tech debt items are picked by **highest ICE score available** that fits the current sprint capacity. They are **not** prioritized by who complained loudest or what feels itchy.

Reserve a ratio of sprint capacity for tech debt (typical: 10-20%). Items below ICE 100 wait unless they block other work.

### Why

- Without a rubric, tech debt is whoever-shouts-loudest, which underprioritizes systemic issues.
- ICE is simple enough to apply in 2 minutes per item.
- Linking each item to its origin (e.g., `/debug` discovered it) creates the audit trail of organizational learning.

### Where to track

GitHub Project board with columns by ICE bucket (≥200, 100-199, <100). Items move between projects only when re-evaluated, not when "felt important."

---

## §100. Dependency upgrades: minor/patch automated, major requires impact analysis + runbook

Dependency upgrades are work like any other but with a strong asymmetry between minor/patch (low risk) and major (high risk). The workflow is **automated for safe upgrades, manual with full rigor for risky ones**.

### Workflow A — Minor and patch (automated)

For semver minor and patch bumps where the changelog promises no breaking changes:

- **Tooling**: Renovate or Dependabot configured in the repo. Default schedule: daily.
- **Auto-merge**: enabled if:
  - CI passes (lint, type-check, unit, integration, `/run-acceptance` for `@smoke` scenarios).
  - No high or critical CVEs introduced (§85).
  - Lockfile change is the only change.
- **Notification**: weekly digest to the team of what was merged.

Sample Renovate config:

```json
{
  "extends": ["config:base"],
  "packageRules": [
    {
      "matchUpdateTypes": ["minor", "patch"],
      "automerge": true,
      "automergeStrategy": "squash",
      "requiredStatusChecks": ["ci/build", "ci/test", "ci/acceptance-smoke"]
    },
    {
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["improvement:dep-upgrade", "needs-runbook"]
    }
  ]
}
```

### Workflow B — Major version upgrade (manual, full rigor)

Every major version bump triggers a full mini-project:

1. **Impact analysis** (§73): which files import the dependency? What APIs are used?
2. **Read the upgrade guide**: maintainers' documented breaking changes.
3. **ADR**: `docs/adr/NNN-upgrade-<package>-vX.md` documenting the decision, expected work, rollback plan.
4. **Branch**: `agent/upgrade/<package>-vX` (note: not `agent/legacy/` — this is a forward move, not legacy code).
5. **Codemods first**: run any official codemods (e.g., `npx react-codemod`) before manual edits.
6. **Manual edits**: file-by-file, small commits, each one CI-green.
7. **`/run-acceptance` full suite**: not just `@smoke`. Every `@release` scenario must pass.
8. **Benchmark §97**: capture baseline before and after — major upgrades often shift perf.
9. **Soak in staging**: minimum 24h before production rollout.
10. **Rollback plan documented**: how to revert if production reveals issues.

### Allowed exception

For major upgrades that are **strictly equivalent** (the maintainer renamed a function but everything else is identical), Workflow A applies with a manual verification — but this is rare and must be documented in the PR.

### Why

- Minor/patch upgrades that linger become CVE liabilities; automate them.
- Major upgrades have surprised every team that treated them like minor; never automate them.
- The asymmetry is real and the rules reflect it.

---

## §101. Security hardening proactivo requires STRIDE threat model before code

Hardening — adding rate limiting, rotating to vault, tightening CSP, etc. — is **proactive** when there is no specific vulnerability driving it. The workflow is:

1. **Threat model first** (§87): STRIDE analysis of the surface to harden.
2. **Identify the specific gap** the threat model exposes.
3. **Propose the smallest mitigation** that closes the gap (avoid over-engineering — §2).
4. **Implement with full §86 SAST** review since the path is sensitive.
5. **Verify the mitigation is reachable**: the corresponding STRIDE row in the threat model now has a documented mitigation.

This rule extends §87 by clarifying that proactive hardening must be **threat-model-driven**, not vibes-driven ("more security is better").

### Adopted from

- `gsd:secure-phase` and `gsd-security-auditor` (gsd-build/get-shit-done) — for the STRIDE structure with `mitigate/accept/transfer` dispositions.
- `security-and-hardening` (addyosmani/agent-skills) — for the 3-boundary system (Always Do / Ask First / Never Do).

### Bad: vibes-driven hardening

```markdown
## PR: Add rate limiting to all endpoints

Added rate limiting (100 req/min) to every endpoint because "we should have rate limiting."
```

No threat model, no specific gap, blanket rule applied without thought. Triggers `improvement-blocked` with comment requesting threat model.

### Good

```markdown
## PR: Rate limit quote.accept to 5 req/min per user

## Threat model (§87)
STRIDE row D-04 (Denial of Service on quote acceptance):
- Threat: Attacker spams quote acceptance to exhaust DB connections.
- Disposition: **mitigate**.
- Mitigation: per-user token bucket, 5 req/min, fail-closed on backend full.
- Residual risk: coordinated attack from many users — accepted, tracked at edge.

## Implementation
[3-line middleware change]
```

---

## §102. Refactor without behavior change: existing tests must pass unmodified

A refactor PR (no behavior change, only structure) has a uniquely strong validation: **the existing test suite passes without any test modification**. If a test had to change to accommodate the refactor, the refactor changed behavior — which violates §76 (refactor vs behavior change are separate PRs).

### Required validation

```bash
# 1. Capture the test baseline on main
git checkout main
pnpm test 2>&1 | tee /tmp/tests-main.log
# Note the count: e.g., 847 passed, 0 failed

# 2. Switch to refactor branch
git checkout agent/refactor-issue-NNN

# 3. Run tests without touching them
pnpm test 2>&1 | tee /tmp/tests-refactor.log
# Required: same count of passed/failed. Zero changes in src/**/*.test.ts.

# 4. Diff
diff /tmp/tests-main.log /tmp/tests-refactor.log
# Required: zero meaningful difference (only timing-related lines may differ)
```

### Optional gate: mutation testing

For high-risk refactors (touching domain logic, security-sensitive code, hot paths), run mutation testing as an additional gate:

```bash
# TypeScript: Stryker
npx stryker run
# Required: mutation score >= 70%, or documented exception
```

### Allowed exception

A test was incorrect (testing an implementation detail rather than behavior — §29 violation) and the refactor exposes that. In this case, the test fix is a separate PR that lands first, then the refactor PR follows. **Do not bundle.**

### Why

- Without this rule, "refactor" becomes a euphemism for "rewrite that nobody noticed changed behavior."
- The test suite is the contract; if the contract requires changes, the work is not a refactor.
- Mutation testing for high-risk paths catches refactors that pass tests by accident.

### Adopted from

`code-simplification` (addyosmani/agent-skills) — the "all existing tests pass without modification" criterion is preserved exactly.

---

## Summary table of validation gates

| Improvement kind | Baseline required? | Tests modified? | Acceptance suite | Extra gate |
|---|---|---|---|---|
| Refactor (§102) | No | **No (forbidden)** | Full `@release` | Mutation testing for high-risk |
| Performance (§97) | **Yes — measured before** | No (unless adding bench tests) | Full `@release` + `@smoke` | After-measurement must beat target |
| Tech debt (§99) | No | Allowed only if existing tests were wrong | Full `@release` | Linked to origin issue |
| Security hardening (§101) | No | Allowed if adding security tests | Full `@release` + `@smoke` | STRIDE row updated |
| Dependency upgrade — minor/patch (§100A) | No | No | `@smoke` | CI green + no new CVE |
| Dependency upgrade — major (§100B) | **Yes (perf may shift)** | Allowed if API renamed | Full `@release` | ADR + 24h staging soak |

## Attribution

The rules and the `/optimize` skill that operationalizes §97 are composed from prior art:

- §97 baseline-first: adapted from `performance-optimization` (addyosmani/agent-skills). MIT.
- §99 tech debt as features with rubric: composed from `audit-milestone` flow in gsd-build/get-shit-done (state `tech_debt`) and ICE rubric (industry standard).
- §100A automated minor/patch: industry pattern (Renovate, Dependabot) — no single source.
- §100B major upgrade rigor: composed from `deprecation-and-migration` (addyosmani) and `gsd-audit-milestone`. No framework had the complete workflow; Stormhelm assembles it.
- §101 STRIDE-first hardening: composed from `gsd:secure-phase` (gsd-build) and `security-and-hardening` (addyosmani).
- §102 tests pass unmodified: adapted from `code-simplification` (addyosmani). MIT.

Stormhelm did not invent these rules; it composed the best parts of existing open-source work and applies them consistently with the rest of the framework.
