# 15 — Observability: Logging, Metrics, SLOs

**Scope.** How the system reports what it is doing in production: structured logging, event vocabulary, PII redaction, metrics emission, declared SLOs, and how observability gates AFK execution.

**When to read.** Adding a log line, naming an event, emitting a metric, declaring a new endpoint's SLO, designing a vendor-agnostic observability port, deciding whether a performance regression should block Ralph.

**Rules in this file.** §77, §78, §79, §80, §81, §82, §83

> See `AGENTS.md` for the full rule index. Related: `09-stack-conventions.md` (§40 middleware ordering — where requestId originates), `13-ralph-and-afk.md` (§69 session log schema), `05-domain-modeling.md` (§19 Result types — what gets logged).

---

## §77. Logs are structured JSON with canonical fields

Every log line is a single JSON object with a fixed top-level schema. Free-text logging is forbidden in production code paths.

### Canonical schema

```json
{
  "timestamp": "2026-05-20T19:45:12.034Z",
  "level": "info",
  "service": "marketplace-backend",
  "version": "1.42.0",
  "environment": "production",
  "requestId": "req_01HXYZ...",
  "tenantId": "tnt_abc",
  "userId": "usr_def",
  "event": "quote.accepted",
  "details": {
    "quoteId": "qte_ghi",
    "sowId": "sow_jkl",
    "priceCents": 50000,
    "currency": "USD"
  }
}
```

### Required fields (every log line)

| Field | Type | Source |
|---|---|---|
| `timestamp` | ISO-8601 UTC | Logger |
| `level` | `"debug" \| "info" \| "warn" \| "error"` | Caller |
| `service` | string | Container config |
| `version` | semver string | Container config |
| `environment` | `"local" \| "staging" \| "production"` | Container config |
| `requestId` | string | `RequestContext` (§40) |
| `event` | dot.notation string (§78) | Caller |
| `details` | object | Caller |

### Conditionally required

- `tenantId`, `userId`: present when the operation is request-scoped and identity is established.
- `traceId`, `spanId`: present when OpenTelemetry tracing is enabled (§82).

### Good

```ts
container.logger.info({
  event: "quote.accepted",
  details: {
    quoteId: quote.id.value,
    sowId: sow.id.value,
    priceCents: quote.priceCents,
  },
});
// requestId, tenantId, userId injected by logger.child() from RequestContext
```

### Bad

```ts
console.log(`Quote ${quoteId} accepted by user ${userId} for tenant ${tenantId}`);
```

Why bad:

- Free-text strings are ungreppable and unjoinable to other logs.
- Inconsistent across log lines — some have userId in the message, others as a field.
- PII risk because no schema controls what gets serialized.

### Enforcement

- `eslint-plugin-no-console` in `error` mode; only the configured logger is permitted.
- The logger adapter rejects calls that don't include an `event` field.

---

## §78. Event names use `dot.notation`, past tense for completed events, never free text

Event names are the **vocabulary** of observability. Like the ubiquitous language in `CONTEXT.md`, they are stable identifiers — not descriptions.

### Naming convention

```
<domain>.<entity>.<verb>
```

- `domain`: top-level bounded context (`quote`, `payment`, `auth`, `listing`).
- `entity`: optional sub-entity if needed (`quote.acceptance`, `payment.refund`).
- `verb`: past tense for completed actions, present-imperative for attempts.

### Good

```
quote.requested
quote.accepted
quote.expired
payment.charge.succeeded
payment.charge.failed
payment.refund.initiated
auth.login.succeeded
auth.login.failed
listing.published
listing.publication.rejected
```

### Bad

```
"User accepted quote successfully"             ❌ free text
"acceptQuote"                                  ❌ camelCase function name
"QUOTE_ACCEPTED"                               ❌ uppercase belongs to Result codes (§19)
"accepting_quote"                              ❌ present participle ambiguous
"quote-accepted"                               ❌ kebab-case reserved for slugs
```

### Verb tense rules

| Tense | When to use |
|---|---|
| Past (`accepted`, `succeeded`, `failed`) | Action completed (success or failure both qualify) |
| Present-imperative (`accept`, `process`) | Action attempted but outcome unknown |
| Present-continuous (`accepting`) | **Never** — ambiguous with both above |

### Why

- Logs are queried, aggregated, and alerted on. Stable names make this possible.
- Event names appear in dashboards, runbooks, and incident reports — they outlive the code.
- The set of events is a public API of the service for observability consumers.

### Registry

All event names live in `docs/events.md` with description, payload schema, and emission location. Adding a new event without registering it is a CI failure.

---

## §79. Never log PII in `details`; reference by ID

Personal identifiable information (names, emails, phone numbers, addresses, government IDs, payment card data) **never** appears in log payloads. Only IDs and tokenized references.

### Forbidden in logs

- Email addresses (use `userId`).
- Phone numbers (use `userId`).
- Full names (use `userId`).
- Physical addresses (use `addressId`).
- Government identifiers (SSN, CURP, RFC, etc.).
- Full card numbers (use `last4` and `cardId`).
- Auth tokens, refresh tokens, JWTs (use a hash if absolutely needed).
- Webhook payload bodies from external systems before sanitization.

### Good

```ts
container.logger.info({
  event: "auth.login.succeeded",
  details: {
    userId: user.id.value,
    method: "password",
    deviceFingerprint: hash(deviceInfo),
  },
});
```

### Bad

```ts
container.logger.info({
  event: "auth.login.succeeded",
  details: {
    email: user.email,                    // ❌ PII
    name: user.fullName,                  // ❌ PII
    ipAddress: req.ip,                    // ❌ PII under GDPR
    token: session.accessToken,           // ❌ auth secret
  },
});
```

### Allowed under specific conditions

- IP addresses: logged at the edge (load balancer, WAF) with separate retention policy. Not in application logs.
- `last4` of card: required for fraud investigation; explicitly allowed.
- Email **hash** (SHA-256): allowed for anti-abuse correlation; not the raw email.

### Enforcement

- A redaction middleware in the logger adapter strips known PII fields by name before serialization.
- CI runs a grep-based check on log calls for patterns matching emails, card numbers, and known PII field names.
- Production logs are scanned weekly for PII leakage; findings open a P1 issue.

---

## §80. Every use case emits at least one structured event on close (success or failure)

Use cases are the unit of observable business action. Each one must announce what happened.

### Required behavior

```ts
async execute(input: AcceptQuoteInput, ctx: RequestContext): Promise<AcceptQuoteResult> {
  const result = await this.doWork(input, ctx);

  if (result.ok) {
    ctx.logger.info({
      event: "quote.accepted",
      details: { quoteId: input.quoteId.value, sowId: result.sowId.value },
    });
  } else {
    ctx.logger.warn({
      event: "quote.acceptance.failed",
      details: { quoteId: input.quoteId.value, code: result.code },
    });
  }

  return result;
}
```

### Why

- A use case that returns silently is invisible to operators.
- The event maps to the same code in the Result type (§19), giving end-to-end traceability.
- Aggregating these events produces business metrics for free (number of quote.accepted per day, etc.).

### Rules

- `info` level for success; `warn` for expected business failures (FORBIDDEN, NOT_FOUND, EXPIRED).
- `error` is reserved for unexpected throws caught by the global errorHandler (§42).
- The event name maps cleanly to the Result code:
  - `result.ok === true` → `<domain>.<entity>.<verb>` past tense
  - `result.ok === false` → `<domain>.<entity>.<verb>.failed`

### Bad: silent close

```ts
async execute(input, ctx) {
  // ... business logic ...
  return { ok: true, sowId };
  // ❌ no event emitted
}
```

---

## §81. SLOs are declared in `docs/slos.md` per public endpoint and per critical command

Service Level Objectives are **declared upfront**, not inferred from incidents. Every public HTTP endpoint and every critical command has a documented SLO.

### Structure of `docs/slos.md`

```markdown
# Service Level Objectives

## POST /v1/quotes/:id/accept

- **Latency p95**: ≤ 800 ms
- **Latency p99**: ≤ 2000 ms
- **Error rate (5xx)**: ≤ 0.1% per rolling 30 days
- **Availability**: ≥ 99.9% per rolling 30 days
- **Owner**: @quotes-team
- **Last reviewed**: 2026-04-15

## GET /v1/listings (paginated)

- **Latency p95**: ≤ 400 ms
- **Latency p99**: ≤ 1200 ms
- **Error rate (5xx)**: ≤ 0.05% per rolling 30 days
- **Availability**: ≥ 99.95% per rolling 30 days
- **Owner**: @search-team

## Critical command: payment.charge

- **Success rate (excluding card-decline)**: ≥ 99.5%
- **Latency p95**: ≤ 3000 ms (Stripe-dependent)
- **Idempotency conflict rate**: ≤ 0.01%
- **Owner**: @payments-team
```

### Rules

- Adding a new public endpoint without an SLO entry fails CI.
- SLOs are reviewed quarterly. Stale SLOs (>180 days since `Last reviewed`) trigger a reminder.
- Critical commands (anything that mutates money, contracts, or external state) require explicit SLOs even if internal.

### Why

- Without declared SLOs, "fast enough" and "reliable enough" are arguments, not measurements.
- SLOs are the contract for §83 (Ralph performance gate).
- Incident response is faster when the deviation is visible against a known target.

---

## §82. Metrics emission goes through `MetricsPort`; OpenTelemetry is the default, vendor isolated

The application code never imports a metrics vendor SDK directly. All emission goes through a port defined in the application layer.

### Port

```ts
// application/ports/metrics.port.ts
export interface MetricsPort {
  counter(name: string, attributes?: Record<string, string | number>): void;
  histogram(name: string, value: number, attributes?: Record<string, string | number>): void;
  gauge(name: string, value: number, attributes?: Record<string, string | number>): void;
}
```

### Default adapter: OpenTelemetry

```ts
// infrastructure/adapters/output/metrics/otel-metrics.adapter.ts
import { metrics } from "@opentelemetry/api";

export class OtelMetricsAdapter implements MetricsPort {
  private readonly meter = metrics.getMeter("marketplace-backend");

  counter(name: string, attrs?: Record<string, string | number>): void {
    this.meter.createCounter(name).add(1, attrs);
  }

  histogram(name: string, value: number, attrs?: Record<string, string | number>): void {
    this.meter.createHistogram(name).record(value, attrs);
  }

  gauge(name: string, value: number, attrs?: Record<string, string | number>): void {
    this.meter.createObservableGauge(name).addCallback((res) => res.observe(value, attrs));
  }
}
```

### Good usage

```ts
ctx.metrics.counter("quote.accepted", { tenantId: ctx.tenantId });
ctx.metrics.histogram("quote.acceptance.duration_ms", elapsedMs, {
  outcome: result.ok ? "success" : result.code,
});
```

### Bad

```ts
import { StatsD } from "node-statsd";              // ❌ vendor in application code
const stats = new StatsD();
stats.increment("quote.accepted");                  // ❌ direct emission
```

### Metric naming

- Follow the same `dot.notation` as events (§78).
- Suffix the unit when not obvious: `duration_ms`, `size_bytes`, `count`.
- Use **attributes** (labels in Prometheus parlance) for dimensions; do **not** encode dimensions in the metric name.

### Bad: dimension in name

```ts
ctx.metrics.counter("quote.accepted.tenant_abc");   // ❌ explodes cardinality unbounded
```

### Good: dimension as attribute

```ts
ctx.metrics.counter("quote.accepted", { tenantId: ctx.tenantId });
```

---

## §83. Ralph aborts a PR if metrics degrade declared SLOs (gate beyond BDD)

Passing the BDD scenarios is necessary but not sufficient. A change that passes the gate but degrades performance below the SLO is rejected automatically.

### How the gate works

After `/run-acceptance` passes, the next step in the AFK loop is a benchmark comparison:

1. Checkout the PR branch in a clean Docker container.
2. Run the performance suite: `npm run perf:slos` (TypeScript) or `pytest tests/perf/` (Python).
3. The suite hits the endpoints covered by `docs/slos.md` with synthetic load.
4. Compare measured p95 latency, p99 latency, and error rate against the declared SLO.
5. If any metric exceeds the SLO by more than the configured `slo-margin` (default 10%), mark the PR as `ralph-blocked` and post a comment.

### Configuration

```yaml
# .planning/slo-gate.yaml
slo-margin: 10                          # percent over declared SLO triggers block
warmup-seconds: 30
duration-seconds: 120
endpoints:
  - method: POST
    path: /v1/quotes/:id/accept
    rps: 50
  - method: GET
    path: /v1/listings
    rps: 200
```

### Block comment template

```markdown
🛑 **Ralph blocked: SLO degradation**

**PR:** #142
**Endpoint:** POST /v1/quotes/:id/accept
**Declared SLO (docs/slos.md):** p95 ≤ 800 ms
**Measured p95:** 1180 ms (47.5% over SLO)
**Allowed margin:** 10%

**Action required:** Investigate the latency regression before merging. Run `npm run perf:profile -- /v1/quotes/:id/accept` locally to capture a flamegraph.
```

### Why

- Functional correctness (BDD) and operational quality (SLO) are independent dimensions.
- A green test suite + p95 doubled is a production incident waiting to happen.
- Ralph optimizing for "scenarios pass" without an SLO gate produces correct-but-slow code.

### When to relax

If the change is **expected** to affect performance (e.g., adding a required validation that costs DB lookups), the PR description must include an SLO impact statement:

```markdown
## SLO impact statement
This PR adds tenant-isolation validation on POST /v1/quotes/:id/accept.
Expected p95 increase: +50ms (measured locally).
Updated docs/slos.md: p95 target raised from 800ms to 900ms.
```

The `/code-review` human reviewer approves the SLO change as part of the PR review.
