# 16 — Security & Supply Chain

**Scope.** Defensive practices that protect the codebase, its dependencies, and its deployed state. Secret hygiene, vulnerability scanning, static analysis, threat modeling, secret rotation, software bill of materials, and pen-test cadence.

**When to read.** Adding a dependency, writing code that handles secrets, designing an authentication or authorization change, integrating an external service, preparing a release, planning a security review.

**Rules in this file.** §84, §85, §86, §87, §88, §89, §90

> See `AGENTS.md` for the full rule index. Related: `04-input-boundaries.md` (§4, §34 — parsing at the perimeter), `06-commands-and-security.md` (§27 security gates before domain), `09-stack-conventions.md` (§41 authN vs authZ).

---

## §84. Secret scanning runs in pre-commit and CI; commits with leaks are blocked

Secrets in Git history are forever. Prevention is at commit time, never at review time.

### Tooling

- **Pre-commit hook**: `gitleaks protect --staged` runs on every `git commit`.
- **Pre-push hook**: `gitleaks protect --staged` runs again as a safety net.
- **CI**: `gitleaks detect --source . --log-opts="--all"` scans full history on PRs.

### Configuration

```toml
# .gitleaks.toml
[allowlist]
description = "Allowlist false positives"
paths = [
  '''docs/examples/.*''',
  '''.*\.md\.example''',
]

[[rules]]
description = "Stripe live secret keys"
regex = '''sk_live_[0-9a-zA-Z]{24}'''
tags = ["stripe", "critical"]

[[rules]]
description = "AWS access key"
regex = '''AKIA[0-9A-Z]{16}'''
tags = ["aws", "critical"]
```

### Good: secret loaded from env (already validated per §34)

```ts
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
```

### Bad

```ts
const stripe = new Stripe("sk_live_EXAMPLE_DO_NOT_USE");   // ❌ inline secret (placeholder)
```

### Handling a real leak

If a secret reaches a commit (even unpushed):

1. **Do not** rewrite history with `git filter-branch` — the secret may already be cached locally or in CI.
2. **Rotate the secret immediately** in the source system (Stripe, AWS, etc.).
3. Document the rotation in the security log.
4. Then optionally clean Git history with `git filter-repo` and force-push (humans only, never Ralph — see §68).

### Why

- Public repos: secrets in history are scanned by attackers within minutes of push.
- Private repos: insider threat and accidental sharing still apply.
- The rotation is the actual fix; history rewriting is hygiene.

---

## §85. `npm audit` / `pip-audit` runs in CI; critical CVEs block merge unless documented exception

Dependencies with known critical vulnerabilities cannot reach production silently.

### CI step (TypeScript)

```yaml
# .github/workflows/security.yml (excerpt)
- name: Audit dependencies
  run: |
    npm audit --audit-level=high --production
    npm audit --audit-level=critical --production --omit=dev
```

### CI step (Python)

```yaml
- name: Audit dependencies
  run: |
    pip install pip-audit
    pip-audit --requirement requirements.txt --strict
```

### Severity policy

| Severity | Action |
|---|---|
| `critical` | Hard block. Cannot merge without documented exception. |
| `high` | Block by default. Can be deferred 7 days with `security-deferred` label and tracking issue. |
| `moderate` | Warning. Track in monthly review. |
| `low` | Informational. |

### Documented exception process

If a critical CVE cannot be fixed immediately (no patch available, upstream maintainer unresponsive), create an exception in `security/exceptions.md`:

```markdown
## CVE-2026-12345 (lodash@4.17.21 — Prototype Pollution)

- **Affected dependency**: lodash@4.17.21
- **CVSS score**: 9.8 (critical)
- **Exception expires**: 2026-06-15 (30 days from now)
- **Mitigation**: Lodash usage is limited to `_.get()` on schema-validated input from §4 perimeter parsing. Prototype pollution attack vector is not reachable.
- **Tracking issue**: #401
- **Approved by**: @security-lead on 2026-05-15
```

### Rules

- Exceptions expire. After expiration, the CVE blocks merge again until a real fix lands.
- Maximum exception window: 30 days for critical, 90 days for high.
- Exceptions live in a versioned file — Git history is the audit trail.

### Bad

```yaml
- run: npm audit --audit-level=critical || true   # ❌ swallowed exit code
```

Why bad: defeats the gate. Critical CVEs slip in silently.

### Disposition: upgrade vs exception vs replace (PR-Up amendment)

When `npm audit` / `pip-audit` reports a critical or high CVE, the team chooses one of four dispositions. Each has different downstream consequences:

| Disposition | When to use | Downstream effect |
|---|---|---|
| **`patch`** | A targeted patch release fixes the CVE without API changes | Drop-in. CI re-runs. No further process. |
| **`upgrade-minor`** | Minor version bump fixes the CVE (e.g. `1.4.2 → 1.5.0`) | Drop-in usually; CI re-runs. If the bump touches peer deps or breaks soft-deprecated APIs, treat as `upgrade-major`. |
| **`upgrade-major`** | Major version bump required (semver major delta OR cascades to peer/sibling deps) | **Not a label-only fix.** Re-enters the full test gate (typecheck + lint + unit + acceptance) and routes through `improvement:dep-upgrade` per §100. See heuristic below. |
| **`exception`** | No patch available; document and defer | Per the "Documented exception process" above, with the 30/90 day windows. |
| **`replace`** | The dependency is itself the problem (abandoned, alternative exists) | Architectural change. Open ADR before code. |

**Heuristic for "is this `upgrade-major`?"** — A CVE upgrade is `upgrade-major` if **any** of:

1. The version bump is a semver major delta (`X.y.z → (X+1).0.0`).
2. The upgrade requires adding or removing a peer dependency.
3. The upgrade requires editing `package.json` `scripts`, `engines`, or `overrides` to install cleanly.
4. The upgrade changes a test runner's default behavior in a way that affects existing tests (e.g. a major test-runner bump that changes concurrency defaults and breaks container-based fixtures).

If any of these apply, **do not dispose as `upgrade` and move on**. The CVE issue must spawn an `improvement:dep-upgrade` issue per §100 with its own acceptance criteria — typecheck/lint/unit/acceptance all re-greened on the upgraded toolchain. The original CVE issue is closed by the merge of that improvement, not by a label disposition.

**Why this rule exists:** a representative cascade — choosing "upgrade" to clear a transitive CVE (e.g. in `lodash`) pulls in a major test-runner/bundler bump, which breaks peer resolution (`ERR_PACKAGE_PATH_NOT_EXPORTED`, forcing an explicit devDep) and requires test-config changes (e.g. disabling file parallelism for container fixtures). None of this is visible from the CVE label; treating it as a single-PR fix mid-`/security-hardening` turns a one-line bump into a day of debugging that belonged in its own slice.

---

## §86. SAST with `semgrep` (OWASP rulesets) runs on PRs touching auth, crypto, or external I/O

Static Application Security Testing is selective: full repo scans on every PR are too noisy. Targeted scans on sensitive code paths catch real issues.

### Path triggers

Semgrep runs automatically when a PR modifies any file under:

- `src/**/auth/**`
- `src/**/crypto/**`, `src/**/signing/**`
- `src/**/payments/**`
- `src/**/middlewares/*-auth*`
- `src/**/middlewares/rate-limit*`
- Any file matching `*-client.ts` or `*-client.py` (external integrations)
- `src/**/webhook*` (callback handlers)

### Configuration

```yaml
# .semgrep.yml
rules:
  - p/owasp-top-ten
  - p/typescript
  - p/jwt
  - p/secrets
  - p/sql-injection
  - p/command-injection
  - p/insecure-transport

exclude:
  - "**/__tests__/**"
  - "**/fixtures/**"
  - "**/examples/**"
```

### CI step

```yaml
- name: Semgrep SAST
  uses: returntocorp/semgrep-action@v1
  with:
    config: .semgrep.yml
    publishToken: ${{ secrets.SEMGREP_APP_TOKEN }}
    auditOn: push
```

### Reporting

- Findings are posted as PR comments inline on the offending line.
- `error` severity blocks merge.
- `warning` severity requires acknowledgment from `/code-review` reviewer (label `semgrep-acknowledged`).

### Why

- Generic vulnerability rules catch issues that domain-specific tests don't (timing attacks, weak randomness, JWT validation flaws).
- Targeted scans on sensitive paths produce signal, not noise.
- The OWASP rulesets are maintained externally — free updates as new attack patterns emerge.

---

## §87. Threat modeling is mandatory for features that cross a trust boundary

A trust boundary is any place where data or control flow moves between zones with different trust levels. Features that introduce or cross these require threat modeling **before** implementation.

### What constitutes a trust boundary crossing

- New public HTTP endpoint (Internet → Backend).
- New integration with a third-party service (Backend → External API).
- New webhook receiver (External → Backend).
- New MCP tool accessible by customer-facing AI agents (Agent → Backend).
- New event subscriber consuming external events.
- Any change to authentication or authorization logic.
- New cryptographic operation (signing, encryption, hashing for security purposes).

### Required artifact

`docs/threat-models/<feature-name>.md` using the STRIDE framework:

```markdown
# Threat model — Provider Agent webhook receiver

## Context
Provider Agents call our marketplace via HTTPS to report quote status changes.
This is the first inbound integration where external agents drive state changes.

## Architecture diagram
[component diagram showing trust boundaries]

## STRIDE analysis

### Spoofing
- **Threat**: An attacker impersonates a legitimate Provider Agent.
- **Mitigation**: Mutual TLS + signed webhook payload with shared secret per Provider.
- **Residual risk**: Compromise of a Provider's signing key. Mitigated by rotation (§88).

### Tampering
- **Threat**: Modified payload in transit or at rest.
- **Mitigation**: HTTPS + HMAC signature verification before payload parsing (§4).
- **Residual risk**: None known.

### Repudiation
- **Threat**: Provider claims they did not send a state change.
- **Mitigation**: Persist raw signed payload + timestamp; log event with payload hash.
- **Residual risk**: Log integrity. Mitigated by append-only audit log.

### Information Disclosure
- **Threat**: Webhook response leaks information about our domain.
- **Mitigation**: Generic 200/4xx responses; no entity data in response body (§13).
- **Residual risk**: Timing oracle on signature validation. Mitigated by constant-time comparison.

### Denial of Service
- **Threat**: Provider Agent floods webhook endpoint.
- **Mitigation**: Per-Provider rate limit middleware; idempotency keys (§46).
- **Residual risk**: Coordinated attack from many compromised Providers. Mitigated by global rate limit at edge.

### Elevation of Privilege
- **Threat**: Webhook payload contains command that bypasses authorization.
- **Mitigation**: Webhook payload is data, not commands. Use case maps payload → domain action with full §27 security gates.
- **Residual risk**: None known.
```

### Workflow

1. Threat model PR opens **before** the implementation PR.
2. Security reviewer (rotated assignment) approves the threat model.
3. Implementation PR references the threat model file.
4. Implementation PR cannot merge if threat model is missing or stale.

### Auto-drafting vs. authoritative status (human-in-the-loop)

When `/security-hardening` detects that a slice crosses a trust boundary and no existing threat model covers it, the skill **drafts** a STRIDE document automatically — but the draft is **NOT authoritative** until a human approves it.

- Draft path: `docs/threat-models/<component>.draft.md` (note the `.draft.md` suffix).
- The skill **stops** at a checkpoint and surfaces three options to the operator: `approve` / `edit:<notes>` / `block`.
- On `approve`, the file is renamed to `.md` and timestamp + approver are recorded in the file header.
- §87 enforcement is gated on the existence of `<component>.md` (without the `.draft` infix), not on `.draft.md`.

Auto-generated `.draft.md` files do not satisfy §87 compliance. They are working drafts, never contracts.

This rule exists because **threat models are business decisions, not engineering analyses**. An agent can produce a competent first read of the STRIDE categories (and should, to save the human's time), but the act of accepting residual risks, choosing between mitigation/transfer/acceptance, and signing off the model is a human responsibility that the framework will not delegate.

### Why

- Security thinking before code is cheaper than security review of finished code.
- STRIDE produces explicit mitigations that become testable requirements (link to BDD scenarios).
- The artifact is reviewable, versionable, and auditable.
- Auto-draft + human approval combines the speed of agent analysis with the accountability of human signoff.

---

## §88. Secret rotation is automated via a vault; no long-lived secrets in production

Secrets that live forever are secrets that leak eventually. Rotation must be automatic and frequent.

### Vault options (any of these)

- **AWS Secrets Manager** (with automatic rotation Lambda).
- **HashiCorp Vault** (with dynamic secrets where possible).
- **Doppler** (with rotation schedules).
- **GCP Secret Manager**.

### Rotation cadence

| Secret type | Maximum lifetime |
|---|---|
| Database passwords | 90 days |
| API keys to external services (Stripe, DocuSign, etc.) | 180 days |
| Internal service-to-service tokens | 30 days |
| JWT signing keys | 90 days (with overlapping validity for rolling rotation) |
| OAuth client secrets | 365 days |
| Webhook signing secrets (per Provider) | 365 days, rotatable on demand |

### Required behavior in application code

- **Never** hardcode a secret's lifetime — read it at request time.
- **Never** cache secrets across the rotation window — re-fetch on `401`/`403` from the upstream and retry once.
- The secrets adapter exposes a `refresh()` method invokable on auth failure.

### Good

```ts
class StripeClient {
  constructor(private readonly secrets: SecretsPort) {}

  async charge(input: ChargeInput): Promise<ChargeResult> {
    let key = await this.secrets.get("stripe.secret_key");

    try {
      return await this.callStripe(key, input);
    } catch (err) {
      if (isAuthError(err)) {
        key = await this.secrets.refresh("stripe.secret_key");
        return await this.callStripe(key, input);
      }
      throw err;
    }
  }
}
```

### Bad

```ts
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;   // ❌ captured at startup, never refreshes
const stripe = new Stripe(STRIPE_KEY);
```

### Why

- A leaked secret with a 7-day rotation window is a 7-day incident, not a permanent breach.
- Automated rotation removes the "we forgot to rotate" failure mode.
- Catching auth errors and refreshing makes rotations zero-downtime.

---

## §89. Every release ships with a Software Bill of Materials (SBOM)

For every tagged release, an SBOM is generated and attached as a release artifact. It is the canonical list of what is inside the deployable.

### Tooling

- **Syft** (Anchore) — generates SBOMs in SPDX or CycloneDX format.
- **CycloneDX CLI** — for fine-grained customization.

### CI step

```yaml
# .github/workflows/release.yml (excerpt)
- name: Generate SBOM
  uses: anchore/sbom-action@v0
  with:
    format: cyclonedx-json
    output-file: sbom-${{ github.ref_name }}.cdx.json

- name: Attach SBOM to release
  uses: softprops/action-gh-release@v1
  with:
    files: sbom-${{ github.ref_name }}.cdx.json
```

### What it contains

- All direct dependencies with versions.
- All transitive dependencies with versions.
- License of each dependency.
- Hashes (SHA-256) of each artifact.
- Optionally: vulnerabilities known at release time (via Grype enrichment).

### Use cases

- **Vulnerability response**: when a new CVE drops, grep the SBOM to find affected releases instantly.
- **Compliance**: regulators increasingly require SBOMs (EU CRA, US executive orders).
- **License audit**: detect GPL contamination in commercial deployments.
- **Reproducibility**: confirms what was actually shipped vs. what was intended.

### Retention

- SBOMs are kept for the same duration as the release artifact itself.
- For compliance: minimum 7 years for releases that touched payment, PII, or regulated data.

---

## §90. Penetration testing happens quarterly for components on the trust boundary

Automated tooling catches known patterns. Pen-tests find the unknown ones.

### Cadence

- **Quarterly**: components on the trust boundary (public API, webhooks, MCP tools).
- **On major release**: full-scope pen-test including new endpoints and integrations.
- **On critical incident**: targeted pen-test of the affected surface.

### Scope per quarterly cycle

The Q1 → Q4 rotation covers each surface at least once per year:

| Quarter | Focus |
|---|---|
| Q1 | Public HTTP API (`/v1/*`) — authentication, authorization, input validation |
| Q2 | Webhook receivers (Stripe, DocuSign, Provider Agents) — signature validation, replay, idempotency |
| Q3 | MCP tools — agent input fuzzing, prompt injection, tool-call authorization |
| Q4 | Infrastructure — network segmentation, secrets management, deployment pipeline |

### Engagement structure

1. **Pre-engagement**: share threat models (§87) and architecture docs with the tester.
2. **Engagement window**: 1-2 weeks of testing, time-boxed.
3. **Report**: findings categorized by CVSS severity with reproduction steps.
4. **Remediation tracking**: each finding becomes a GitHub issue with `security-finding-Q3-NNN` label.
5. **Retest**: critical and high findings retested within 30 days.

### Findings retention

- Pen-test reports are stored in a restricted-access repo (separate from the codebase).
- Internal-facing summaries (findings counts by severity, remediation status) live in `docs/security/pen-test-summary.md` for engineering visibility without leaking exploit details.

### Why

- No automated tool finds business logic flaws like privilege escalation across tenants.
- External testers approach the system without internal assumptions.
- The cadence ensures coverage as the surface evolves.

### Out of scope for this document

- Selection of the pen-test vendor (handled by the security function).
- Internal red-team exercises (separate practice).
- Bug-bounty program management (if/when applicable).

---

## End of engineering rule set

The `AGENTS.md` index references all 17 files. Rule numbering is stable across the codebase: when this set evolves, new rules are added with the next available `§N`, and deprecated rules are kept with a `[deprecated]` marker but retain their number.

**Total rules in the set**: §1 – §122.
