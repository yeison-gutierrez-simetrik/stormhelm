# 10 — Cross-Cutting Product Rules

**Scope.** Rules that apply across every feature regardless of the specific use case: tenant isolation, idempotency, pagination, public API and event versioning, and schema migrations.

**When to read.** Anything tenant-scoped, designing a critical command, list endpoints, public-facing APIs or events, schema changes.

**Rules in this file.** §45, §46, §47, §48, §49

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `04-input-boundaries.md` (parsing the headers these rules depend on), `09-stack-conventions.md` (where the response shapes and middleware live), `07-infrastructure.md` (idempotency at the integration layer).

---

## §45. `tenantId` is part of `RequestContext` and every repository filter

The system is multi-tenant. **Tenant isolation is enforced at the data layer, not assumed by convention.**

Rules:

- `RequestContext` always carries `tenantId` for tenant-scoped operations.
- Use cases require `tenantId` to be present; if it is missing, return `{ ok: false, code: "MISSING_TENANT" }`.
- **Every** repository method that returns tenant-owned data takes `tenantId` and filters on it. No exceptions.
- Never look up tenant-owned data by global `id` alone. Use `(tenantId, id)` or an equivalent policy enforced by the repository.
- Migrations must enforce `(tenantId, id)` as the practical lookup key — usually as a non-null column with an index.

### Good

```ts
// application/ports/project.repository.ts
export interface ProjectRepositoryPort {
  findById(id: ProjectId, tenantId: TenantId): Promise<Project | null>;
  listByZone(zoneId: ZoneId, tenantId: TenantId): Promise<readonly Project[]>;
  save(project: Project, tenantId: TenantId): Promise<void>;
}
```

```ts
// infrastructure/adapters/output/persistence/drizzle/repositories/drizzle-project.repository.ts
async findById(id: ProjectId, tenantId: TenantId): Promise<Project | null> {
  const [row] = await this.db
    .select()
    .from(projectsTable)
    .where(and(
      eq(projectsTable.id, id.value),
      eq(projectsTable.tenantId, tenantId.value),
    ))
    .limit(1);

  return row ? mapProjectRowToDomain(row) : null;
}
```

### Good: use case validates tenant presence

```ts
async execute(input: CreateProjectInput, ctx: RequestContext): Promise<CreateProjectResult> {
  if (ctx.tenantId === null) {
    return { ok: false, code: "MISSING_TENANT" };
  }
  // ...
}
```

### Bad: lookup by global id, tenant not in the filter

```ts
// ❌
const project = await this.db.select().from(projectsTable).where(eq(projectsTable.id, id)).limit(1);
```

### Bad: tenant assumed via "the user must belong to it anyway"

```ts
// ❌
const project = await projects.findById(id); // tenantId silently dropped
if (project.tenantId !== ctx.tenantId) throw new ForbiddenError();
```

This is the wrong defensive boundary. The repository must never return another tenant's data in the first place.

---

## §46. Idempotency for critical commands

Any command whose retry would create duplicates or have unsafe side effects (charging a card, creating an order, accepting a quote, signing a contract, sending an external webhook) **must** be idempotent on the `Idempotency-Key` header.

### Storage shape

```txt
idempotency_keys
- key                 # client-provided
- tenant_id
- user_id
- route               # e.g. "POST /v1/projects"
- request_hash        # hash of the canonicalized request body
- response_status
- response_body
- status              # pending | completed | failed
- locked_until        # for the in-flight lease
- expires_at
- created_at
- updated_at

PRIMARY KEY (tenant_id, key, route)
```

### Rules

- The key is read from the `Idempotency-Key` request header.
- The key is **scoped by `(tenantId, userId, route)`** — never global.
- On entry, the adapter claims the key: lookup; if absent, insert with `status = pending` and `locked_until = now + N seconds`.
- If a record already exists and `status = completed` **and** `request_hash` matches → return the cached response.
- If a record exists and `request_hash` does not match → return `409 IDEMPOTENCY_CONFLICT`.
- If a record exists with `status = pending` and `locked_until > now` → return `409 IDEMPOTENCY_IN_PROGRESS` (product may choose to wait instead).
- Keys must expire. Set `expires_at` according to the operation (commonly 24h–7d).
- After the use case finishes, store `response_status` and `response_body` atomically.

### Where the logic lives

- The header is part of `RequestContext.idempotencyKey` (§40).
- An `IdempotencyMiddleware` in `infrastructure/adapters/input/http/middlewares/` handles the claim/store flow.
- The use case itself does not know about idempotency — it is a transport concern.

### Sketch

```ts
// idempotency-middleware
const key = c.req.header("Idempotency-Key");
if (!key) return next(); // routes that don't require it just pass through

const claim = await container.idempotency.claim({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  route: routeKey(c),
  key,
  requestHash: hashCanonical(await c.req.text()),
});

if (claim.status === "completed") {
  return c.json(claim.responseBody, claim.responseStatus);
}
if (claim.status === "conflict") {
  return httpError(c, "IDEMPOTENCY_CONFLICT", 409, "Request body differs from prior submission");
}
if (claim.status === "in_progress") {
  return httpError(c, "IDEMPOTENCY_IN_PROGRESS", 409, "Request is already being processed");
}

await next();
await container.idempotency.store({ ... });
```

---

## §47. Pagination from day one with cursor and max limit

Every list endpoint paginates from the beginning. Adding pagination later is harder than starting with it.

### Shape

```ts
// application/types/pagination.ts
export type ListQuery<F> = {
  readonly limit: number;
  readonly cursor?: string;
  readonly filter?: F;
};

export type Page<T> = {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
};
```

### Rules

- Every list endpoint declares a **default** and a **maximum** `limit`. Reject `limit > max` at the perimeter (§4) with `400 VALIDATION_ERROR`.
- Prefer **cursor pagination** over offset for any dataset that can grow. Cursors are stable, opaque to the client, and tenant-scoped (§45).
- The cursor must encode a deterministic sort key (created_at + id, for example). The ordering of the underlying query must be stable for the same cursor to be valid.
- The cursor must not leak data — never include another tenant's IDs, never include sensitive fields. Encode and sign if necessary.
- Empty pages return `{ items: [], nextCursor: null }`, not 404.

### Good

```ts
const listProjectsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
  zoneId: z.string().uuid().optional(),
});
```

```ts
async listByZone(query: ListQuery<{ zoneId: ZoneId }>, tenantId: TenantId): Promise<Page<Project>> {
  const rows = await this.db
    .select()
    .from(projectsTable)
    .where(and(
      eq(projectsTable.tenantId, tenantId.value),
      query.filter?.zoneId ? eq(projectsTable.zoneId, query.filter.zoneId.value) : undefined,
      query.cursor ? gt(projectsTable.createdAt, decodeCursor(query.cursor).createdAt) : undefined,
    ))
    .orderBy(projectsTable.createdAt, projectsTable.id)
    .limit(query.limit + 1); // fetch one extra to detect next page

  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit).map(mapProjectRowToDomain);
  const nextCursor = hasMore ? encodeCursor(rows[query.limit - 1]) : null;

  return { items, nextCursor };
}
```

---

## §48. API and event versioning

Public surfaces are versioned. Internal-only types are not.

### HTTP

```txt
/v1/projects
/v1/projects/:projectId
/v1/quotes
```

- Version goes in the URL prefix.
- Never make a breaking change to a `v1` payload — add `v2` and run both for a transition window.

### Events

```txt
project.created.v1
project.updated.v1
project.deleted.v1
quote.accepted.v1
```

- Domain events versioned only if they have **external consumers**. Internal-only events do not need versioning.
- Distinguish **domain events** (internal vocabulary) from **integration events** (external payloads). Their shapes can diverge; the mapping is explicit at the publish boundary.
- A new version is a new event type, not a mutated old one. Old consumers keep working on the old version until they migrate.

---

## §49. Expand-then-contract migrations

Database migrations are part of every release. Destructive changes (drop column, rename column, narrow a type) **must** be split across two releases.

### Rules

- Prefer backward-compatible migrations. Add columns nullable or with defaults.
- Never drop a column used by the previous app version.
- For a destructive change, split into expand → migrate → contract releases:
  1. **Expand**: add the new column/table; write to both old and new.
  2. **Migrate**: backfill the new column; deploy the app reading from the new column.
  3. **Contract**: drop the old column once no app version reads it.
- Migrations are reviewed in the PR.
- Migrations run **before** the code that depends on them is enabled.
- Every migration is either reversible or has a forward-fix strategy documented in the PR.

### Bad

```sql
-- ❌ in a single release
ALTER TABLE projects DROP COLUMN legacy_name;
ALTER TABLE projects RENAME COLUMN name_v2 TO name;
```

Either of these breaks the previously-deployed app the moment the migration runs.

### Good

Release N (expand):
```sql
ALTER TABLE projects ADD COLUMN name_v2 varchar(120);
-- app writes to both name and name_v2; reads from name
```

Release N+1 (migrate + cutover):
```sql
UPDATE projects SET name_v2 = name WHERE name_v2 IS NULL;
ALTER TABLE projects ALTER COLUMN name_v2 SET NOT NULL;
-- app reads from name_v2; still writes both
```

Release N+2 (contract):
```sql
ALTER TABLE projects DROP COLUMN name;
ALTER TABLE projects RENAME COLUMN name_v2 TO name;
-- app writes only the renamed column
```
