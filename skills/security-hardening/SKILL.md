---
name: security-hardening
description: |
  Executes the security audit and hardening checklist for code touching sensitive
  paths (auth, payments, PII, crypto). Combines §87 STRIDE threat modeling, §27
  authorization audit, §84-§90 supply-chain checks, and §101 proactive hardening
  discipline. The output is a structured findings report that blocks merge if any
  critical issue is found.
  Use when: a slice's issue has `require-human-review` label (§64), touches paths
  matching the sensitive list, OR before any release. Step 12 of /feature for
  sensitive slices.
---

# /security-hardening — Security Audit and Proactive Hardening

## Purpose

`/security-hardening` is the gate that ensures code touching sensitive surfaces (auth, payments, PII, crypto, external integrations) meets the security rules `§84-§90` plus the §27 authorization discipline and §101 proactive hardening. It runs as a structured checklist with concrete tooling per check, producing a report that maps each finding to a §N or OWASP Top 10 reference.

It is not a substitute for the `reviewer` agent (§114), which also catches §27 issues. The two complement each other: reviewer is general-purpose, this skill is security-specific with deeper tool invocations (semgrep, secret scanning, SBOM).

## When to invoke

- Slice touches paths matching the sensitive list (auto-detected).
- Issue has `require-human-review` label (§64).
- Before any release (full repo audit).
- After a CVE notification affecting a dependency.
- Step 12 of `/feature` (only for sensitive slices — non-sensitive slices skip).

## When NOT to invoke

- For non-sensitive slices (UI labels, internal admin tools without PII).
- Inside `/feature` Step 12 for non-sensitive paths (the reviewer agent suffices).

## Inputs

- The slice's diff or PR.
- Active capability stack (which tooling to run).
- `docs/threat-models/` (existing STRIDE models to check against).
- `docs/constitution.md` (project-specific security tenets).

## Outputs

- A structured audit report saved to `.planning/security-audits/<slug>-<YYYYMMDD>.md`.
- Exit code: 0 if no critical issues, non-zero otherwise.
- For features crossing a trust boundary (§87): a STRIDE threat model in `docs/threat-models/<feature>.md` (or update if exists).

## Pre-flight checks

Run before Step 1; each fails fast with an actionable message instead of failing deep in the workflow (§58, ADR-0001):

```bash
node scripts/preflight.mjs git-repo
# This skill targets sensitive paths (§64); ensure the threat-model template exists before producing findings.
```

If any check exits non-zero, stop and report it — do not start the workflow.

## Workflow

### Step 1 — Auto-detect sensitive scope

Sensitive paths (per §64):

```
src/**/auth/**
src/**/crypto/**, src/**/signing/**
src/**/payments/**
src/**/middlewares/*-auth*
src/**/middlewares/rate-limit*
src/**/webhook*
src/**/*-client.{ts,py}
# Plus anything labeled "PII", "credit card", "JWT", "OAuth", "secret" in spec
```

If the diff touches none of these and the issue doesn't have `require-human-review`, skip this skill (return immediately).

### Step 2 — §87 threat model check

For each sensitive path touched, classify the slice into one of three cases:

#### Case A: Threat model exists and covers this slice

- Read `docs/threat-models/<feature-or-component>.md`.
- Verify the model addresses the surface the slice touches.
- ✅ Continue to Step 3.

#### Case B: Threat model exists but does NOT cover this slice

- Generate a **diff/update** to the existing threat model in `docs/threat-models/<feature-or-component>.md` adding the new threats.
- The update goes through the same approval gate as Case C below.

#### Case C: Threat model does NOT exist for this slice

This is the harder case — the slice introduces a new trust boundary or a new surface that requires a threat model to be authored.

**Process (with explicit human approval checkpoint):**

1. **Generate a STRIDE draft** automatically using the spec, the diff, and the §87 categories:

   ```markdown
   ## STRIDE for <component> (DRAFT — requires human approval)

   - **Spoofing:** <threat from auto-analysis> / <suggested mitigation> / <residual risk>
   - **Tampering:** ...
   - **Repudiation:** ...
   - **Information Disclosure:** ...
   - **Denial of Service:** ...
   - **Elevation of Privilege:** ...
   ```

   Save as `docs/threat-models/<component>.draft.md` (note the `.draft.md` suffix).

2. **⛔ HUMAN CHECKPOINT — Threat model approval**:

   The skill **stops** and emits to the operator:

   > "A new threat model has been drafted at `docs/threat-models/<component>.draft.md`. This is the first time the framework analyzes this surface, and §87 requires explicit human approval before the security audit can proceed.
   >
   > Please review the STRIDE draft and:
   > - **`approve`**: rename `.draft.md` → `.md`, treat as authoritative.
   > - **`edit:<notes>`**: revise specific rows, then re-run /security-hardening.
   > - **`block`**: the slice cannot proceed; reject the spec or reduce scope to avoid the trust boundary.
   >
   > The threat model is the contract between security and engineering; it cannot be authored autonomously."

3. **The skill does not continue** until the human has done one of the three actions. Auto-generated drafts that have not been approved by a human do **not** count as a valid threat model for §87 compliance.

4. **On `approve`**, the file is renamed from `.draft.md` to `.md`, the timestamp + approver are recorded in the file metadata, and `/security-hardening` continues to Step 3.

5. **On `edit:<notes>`**, the skill applies the notes (re-generating affected rows) and re-emits the checkpoint. Maximum 3 iterations before escalating to "needs offline session with security."

6. **On `block`**, the slice is marked `security-blocked`, an issue is opened (or the existing one is labeled) for the team to decide whether to descope or escalate, and the workflow exits.

**Why this checkpoint exists:**

Threat models are **contracts**, not analyses. An agent can produce a competent first draft (and should), but the act of saying "we accept these residual risks, we mitigate these others, we transfer these via insurance" is a human business decision — not an engineering one. §87 enforcement is gated on the human's explicit `approve`, never on the existence of an auto-generated draft.

This is also a **practical safety guard**: agents can hallucinate threats or omit obvious ones. Forcing the first read by a human catches both errors before the audit moves on.

### Step 3 — §84 secret scan

```bash
gitleaks detect --source . --no-banner --redact
```

Any finding → BLOCK with location and rotation instructions.

### Step 4 — §85 dependency CVE audit

```bash
# TypeScript
npm audit --audit-level=high --production --json > /tmp/audit.json

# Python
pip-audit --requirement requirements.txt --strict --format=json > /tmp/audit.json
```

For each high or critical CVE:
- Check `security/exceptions.md` for documented, non-expired exception.
- If no exception → BLOCK.
- If exception exists but expired → BLOCK with renewal instructions.

### Step 5 — §86 SAST with semgrep

For sensitive paths:

```bash
semgrep --config p/owasp-top-ten \
        --config p/jwt \
        --config p/secrets \
        --config p/sql-injection \
        --config p/command-injection \
        --config p/insecure-transport \
        --error \
        --json \
        $SENSITIVE_PATHS > /tmp/semgrep.json
```

Each error severity → BLOCK. Each warning severity → record for human review.

### Step 6 — §27 + §41 authorization audit

For each new use case in the diff:

- Verify the `execute()` method checks `ctx.userId` (or equivalent) and returns `{ ok: false, code: "UNAUTHORIZED" }` for missing identity.
- Verify it checks the relevant role/membership and returns `{ ok: false, code: "FORBIDDEN" }` for insufficient permission.
- Verify the check happens **before** any state mutation.

This check uses grep + AST parsing of the use case file. Findings cite §27/§41.

### Step 7 — §45 tenant isolation audit

For each new repository method in the diff:

- Verify the signature accepts `tenantId: TenantId`.
- Verify the SQL/ORM query filters by `tenantId`.

Findings cite §45 and reference the specific file:line.

### Step 8 — §52 timeout/abort signal audit

For each new external call (HTTP client, AWS SDK, Stripe, etc.):

- Verify the call passes `signal: ctx.abortSignal` and `timeoutMs: <value>`.

Findings cite §52.

### Step 9 — §88 secret usage audit

For each `process.env.*` access in the diff:

- Verify the env var is parsed at startup (§34) and used through the validated `env` object.
- For external service keys (Stripe, AWS, etc.), verify the access pattern is through a `SecretsPort` adapter (§88), not direct env read.

Findings cite §34/§88.

### Step 10 — Generate report

```markdown
# Security audit — <slug>

**Date:** YYYY-MM-DD
**Scope:** <files>
**Sensitive paths detected:** <list>

## Threat model (§87)
✅ docs/threat-models/quote-acceptance.md covers this change.

## Findings

### 🛑 Critical (N)
1. **§85** — CVE-2026-12345 in lodash@4.17.21 (no documented exception).
   - **File:** package.json
   - **Severity:** critical
   - **Fix:** upgrade to lodash@4.17.22 OR document exception in security/exceptions.md

### ⚠️ High (N)
2. **§52** — External Stripe call without AbortSignal.
   - **File:** src/infrastructure/payments/stripe-client.ts:45
   - **Fix:** pass `signal: ctx.abortSignal` and `timeoutMs: 5000`.

### 💡 Informational (N)
3. **§88** — `process.env.STRIPE_KEY` accessed directly.
   - **File:** src/infrastructure/payments/stripe-client.ts:12
   - **Recommendation:** wrap in `SecretsPort` for future rotation support.

## Compliance impact
- SOC2: §85 finding requires evidence in next audit cycle.
- GDPR: no impact for this slice.

## Decision
🛑 BLOCKED — 1 critical finding must be resolved before merge.
```

## Integration with the framework

- **Invoked by `/feature` Step 12** for sensitive slices.
- **Invoked manually** for ad-hoc audits.
- **Complements `reviewer` agent**: reviewer catches general issues, this skill catches security-specific with deeper tooling.
- **Output saved to `.planning/security-audits/`** for compliance evidence.

## What this skill never does

- Modify code to "fix" findings (returns findings; humans or `/tdd` fix).
- Approve a release (separate human gate).
- Skip the threat model when missing (§87 blocking).
- Document exceptions on behalf of the team (humans must own exception entries).
