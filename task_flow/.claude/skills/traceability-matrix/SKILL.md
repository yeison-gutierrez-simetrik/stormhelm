---
name: traceability-matrix
description: |
  Generates the audit-grade traceability matrix linking acceptance scenarios →
  implementing issues → commits/PRs → tests → SLOs. Required for compliance
  (SOC2, ISO 27001, EU AI Act, GDPR) and useful for post-incident reconstruction.
  Updates `docs/audit/traceability-<version>.md` per §62.
  Use when: at release time, on demand for a compliance audit, or after a major
  feature merges. Step 12 of /feature (last sub-step).
---

# /traceability-matrix — Audit Trail Generation

## Purpose

§62 says feature files are versioned auditable evidence. `/traceability-matrix` is the skill that turns those versioned files into a queryable matrix linking every acceptance scenario to its implementing artifacts. The matrix answers, for any release version:

> Which acceptance scenarios passed, in which commit, satisfying which issue, implementing which constitution principle, with which SLO measured?

For regulators (SOC2, EU AI Act), this is non-negotiable evidence. For the team, it is the audit trail of "what shipped and why."

## When to invoke

- At release time (every tagged version).
- Step 12 of `/feature` (final sub-step before declaring feature done).
- On demand when a compliance audit requires evidence.
- Quarterly as part of governance.

## When NOT to invoke

- For internal milestones that are not releases (no audit value).
- For features still in draft (scenarios may change).

## Inputs

- All `features/**/*.feature` files (source of truth for scn-NNN IDs).
- Git history (commits, PRs, tags).
- `.planning/acceptance/*.md` (records of which scenarios passed when).
- `.planning/reviews/*.md` (reviewer findings).
- `.planning/security-audits/*.md` (security-hardening reports for compliance evidence).
- `.planning/diagnoses/*.md` (diagnose reports — link bugs to their root cause analyses).
- `docs/postmortems/*.md` (incident records).
- `docs/perf-baselines/*.md` (SLO compliance evidence).
- `docs/constitution.md` (for `C.N` references).
- `docs/slos.md` (for SLO references).

## Outputs

- `docs/audit/traceability-<version>.md` — the matrix for this release.
- `docs/audit/incidents.md` updated with any incidents covered by this release.
- A diff vs. previous version's matrix (to show what changed).

## Workflow

### Step 1 — Determine target version

If invoked at release time: use the Git tag being applied (e.g., `v1.42.0`).
If invoked on demand: ask for the version label.

### Step 2 — Inventory all scenarios

```bash
grep -rh "@scn-" features/**/*.feature | grep -oP '@scn-\d+' | sort -u > /tmp/all-scenarios.txt
```

For each scn-NNN, find:
- The `.feature` file it lives in.
- The most recent commit that ran it green (from `.planning/acceptance/`).
- The issue(s) that implemented it (via `gh issue list --label scenarios:scn-NNN`).
- The PR(s) that merged the implementation (via `gh pr list --search "closes #<issue>"`).

### Step 3 — Map to constitution principles

For each scenario, identify which `C.N` principles it implements. This requires reading the spec(s) the scenario derived from and matching to constitution clauses.

### Step 4 — Map to SLOs

For each public endpoint covered by a scenario, look up the SLO in `docs/slos.md` and the most recent measurement from `docs/perf-baselines/` or `.planning/acceptance/`.

### Step 5 — Write the matrix

```markdown
# Traceability matrix — v1.42.0

**Generated:** YYYY-MM-DD
**Release tag:** v1.42.0
**Scenarios:** N total (X new in this release, Y unchanged, Z deprecated)

## Matrix

| Scenario ID | Feature file | Last passed | Last passing commit | Issue(s) | PR(s) | Constitution | SLO |
|---|---|---|---|---|---|---|---|
| scn-001 | features/quotes/quote-acceptance.feature | 2026-05-19 14:32 | a3b9f12 | #042, #043 | #144 | C.5 | p95 ≤ 600 ms (measured 482 ms) |
| scn-042 | features/listings/listing-publication.feature | 2026-05-20 09:18 | c1d2e3f | #145 | #150 | C.3 | N/A |
| ... |

## New scenarios in v1.42.0
- scn-042, scn-043, scn-044 (Listing publication)

## Deprecated scenarios
- scn-018 (legacy quote format) — replaced by scn-040

## Compliance coverage

### SOC2
- CC6.1 (logical access) → covered by scn-001, scn-002, scn-010
- CC7.2 (change management) → covered by §94 + §107 enforcement (see ralph-sessions logs)

### EU AI Act
- Article 13 (transparency) → covered by docs/specs/ retained per C.8
- Article 17 (record-keeping) → this matrix (retention 7 years per C.8)

## Incident coverage

| Incident | Postmortem | Scenarios that now prevent recurrence |
|---|---|---|
| 2026-05-15-quote-expiry-bypass | docs/postmortems/2026-05-15-quote-expiry-bypass.md | scn-002 (added in v1.41.2) |

## Diff vs previous matrix (v1.41.5)
- Added: scn-042, scn-043, scn-044
- Updated: scn-001 (now passes via new use case in #144)
- Deprecated: scn-018
```

### Step 6 — Save and commit

```bash
mkdir -p docs/audit
mv /tmp/matrix.md docs/audit/traceability-v1.42.0.md
git add docs/audit/traceability-v1.42.0.md
git commit -m "docs/audit: traceability matrix for v1.42.0"
```

### Step 7 — Update the index

Append to `docs/audit/incidents.md` (auto-generated list of all traceability snapshots):

```markdown
| Release | Date | Matrix |
|---|---|---|
| v1.42.0 | 2026-05-20 | [docs/audit/traceability-v1.42.0.md](traceability-v1.42.0.md) |
```

### Step 8 — Return

```markdown
## /traceability-matrix output

**Version:** v1.42.0
**Scenarios in scope:** 47 (3 new, 1 deprecated)
**Compliance coverage verified:** SOC2 CC6.1, CC7.2; EU AI Act Art 13, Art 17
**Path:** docs/audit/traceability-v1.42.0.md
**Retention:** 7 years per C.8 (constitution)
```

## Integration with the framework

- **Invoked by `/feature` Step 12** as the final sub-step.
- **Invoked manually** for compliance audits.
- **Reads `.planning/acceptance/`** (output of `/run-acceptance`).
- **Reads `.planning/reviews/`** (output of `reviewer` agent).
- **Reads `docs/postmortems/`** (output of `/postmortem`).
- **Output is part of `docs/audit/`** — versioned in Git, retention per constitution.

## What this skill never does

- Invent links that don't exist (every cell in the matrix is verifiable).
- Modify `.feature` files (§58).
- Approve a release (separate human action).
- Skip the diff vs previous version (auditors need to see what changed).
