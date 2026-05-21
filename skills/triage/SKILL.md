---
name: triage
description: |
  Classifies and labels incoming issues by type, severity, scope, and routing.
  Maps loose bug reports / feature requests / questions into the framework's
  labels (severity:p0/p1/p2, shift:afk/hitl, ralph-ready, require-human-review,
  improvement:*, scenarios:scn-*). Output: a fully-labeled issue ready for
  /to-issues, Ralph, or /debug. Adopted from Matt Pocock's /triage pattern.
  Use when: an issue lands without classification, a queue needs to be sorted
  before sprint planning, or a P0 alert needs to be routed in seconds.
---

# /triage — Issue Classification

## Purpose

Issues arrive in many shapes — bug reports, feature ideas, questions, complaints, half-thoughts. The framework expects them with specific labels (`severity:*`, `shift:*`, `ralph-ready`, `scenarios:scn-*`, etc.) so the right workflow can pick them up. `/triage` is the routing layer that turns chaos into the queue.

For P0 alerts, every second matters; this skill makes the routing deterministic.

## When to invoke

- A new issue lands in the inbox without labels.
- Sprint planning: classify the backlog into actionable buckets.
- P0/P1 alert fires and needs immediate routing.
- After a stakeholder dumps a "miscellaneous" list of asks.
- Before `/to-issues` runs on a feature backlog that includes non-features.

## When NOT to invoke

- For issues already correctly labeled.
- For internal todos that don't need a workflow assignment.

## Inputs

- Issue body / ticket / Slack message / inline text.
- Optionally: monitoring alert payload.
- `docs/constitution.md` (sensitive domain list).
- Active capabilities (to detect stack-specific paths).

## Outputs

- A classification verdict applied as **GitHub labels** via `gh issue edit`.
- A summary comment on the issue explaining the classification.
- Returned to the workflow: the issue ID and the assigned route (`/debug` / `/to-issues` / `/feature` / "needs human").

## Workflow

### Step 1 — Read the issue + context

Parse the issue body. Identify:
- Reported symptom or request.
- Affected paths mentioned (if any).
- Reporter (user-facing severity hint).
- Linked stack trace / logs / screenshots.

### Step 2 — Classify by type

Decision tree:

```
Is it a malfunction in existing code?
  ├─ YES → BUG
  │   └─ Apply severity (Step 3)
  └─ NO
      ├─ Is it a new capability not in the spec?
      │   ├─ YES → FEATURE
      │   │   └─ Apply scope (Step 4)
      │   └─ NO
      │       ├─ Is it about existing code quality?
      │       │   ├─ YES → IMPROVEMENT
      │       │   │   └─ Apply improvement kind (Step 5)
      │       │   └─ NO
      │       │       ├─ Is it a question?
      │       │       │   └─ Label `question`, route to human, exit.
      │       │       └─ Otherwise → label `triage-unclear`, ask reporter.
```

### Step 3 — Apply severity (BUG path)

For bugs:

| Condition | Severity | Labels |
|---|---|---|
| Production incident, data loss, security breach, system-wide outage, payments broken | **P0** | `severity:p0`, `incident:production` |
| Production bug affecting users, not catastrophic | **P1** | `severity:p1`, `incident:production` (if user-facing) |
| Internal-facing bug, cosmetic, or found in development | **P2** | `severity:p2` |

The `incident:production` label is critical for the `/postmortem` decision (only invoked when this label is present, regardless of severity).

### Step 4 — Apply scope (FEATURE path)

For features:

- Estimate via `/to-issues` heuristics (single context vs. multi-module).
- Label `feature` + optionally `feature:multi-module` if §107 triggers detected.

Route to `/feature` workflow.

### Step 5 — Apply improvement kind (IMPROVEMENT path)

For improvements (§18-improvements):

| Kind | Label |
|---|---|
| Refactor without behavior change | `improvement:refactor` |
| Performance optimization | `improvement:perf` |
| Tech debt reduction | `improvement:tech-debt` |
| Security hardening proactivo | `improvement:hardening` |
| Dependency upgrade | `improvement:dep-upgrade` |

Route to the corresponding skill (`/optimize`, `/improve-codebase-architecture`, etc.).

### Step 6 — Detect sensitive scope

If the issue mentions or touches sensitive paths (auth, payments, PII, crypto, secrets):

- Add label `require-human-review` (§64).
- Do NOT add `ralph-ready` automatically — humans must confirm.

### Step 7 — Apply shift label

| Condition | Shift label |
|---|---|
| Sensitive (Step 6) | `shift:hitl` (human-in-the-loop) |
| Brownfield (legacy paths) | `shift:hybrid` |
| Clean greenfield with clear scope | `shift:afk` (Ralph-eligible) |

### Step 8 — Comment on the issue

Post a structured comment explaining the classification:

```markdown
## /triage classification

**Type:** bug
**Severity:** P1
**Production impact:** yes (user-facing) → `incident:production` applied
**Sensitive scope:** no
**Shift:** hitl (production bug requires human-in-loop)

**Routing:** invoke `/debug` workflow.

**Labels applied:** severity:p1, incident:production, shift:hitl, type:bug

**Next:** assign to engineer or wait for next Day Shift.
```

### Step 9 — Apply labels via gh CLI

```bash
gh issue edit <NNN> \
  --add-label "severity:p1,incident:production,shift:hitl,type:bug"
```

### Step 10 — Return routing decision

```markdown
## /triage output

**Issue:** #142
**Verdict:** bug / P1 / production / hitl
**Next workflow:** /debug
```

## Severity vs production impact (critical distinction)

Severity (`severity:p0/p1/p2`) is the **operational urgency**. `incident:production` is the **factual marker** that the issue caused real user-visible harm in production.

- A P0 detected in staging before deploy: `severity:p0` ✅ but NO `incident:production`.
- A P1 user-facing in production: both labels apply.
- A P2 dev-discovered: `severity:p2`, no `incident:production`.

This distinction matters because `/postmortem` (§95) is invoked based on `incident:production`, NOT severity alone. A serious bug caught before reaching users does not need a postmortem.

## Integration with the framework

- **Invoked by humans** on incoming issues, or by an automated webhook on issue creation.
- **Output (labels) is read by**: `/to-issues` (greenfield path), `/debug` (bug path), `/optimize` (perf path), Ralph (when `ralph-ready`).
- **`incident:production` label is the trigger for `/postmortem`** — never severity alone.
- **Read by `reviewer` agent** to know whether to expect a postmortem and what audit trail applies.

## Attribution

The state-machine triage pattern is adapted from `/triage` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). MIT licensed.

## What this skill never does

- Implement the fix or feature (only routes).
- Apply `ralph-ready` to sensitive issues without human confirmation.
- Skip the `incident:production` evaluation — it gates the postmortem requirement.
- Auto-assign owners (humans decide ownership).
