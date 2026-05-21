# 09 — Stack Conventions (Hono / Drizzle / Zod)

**Scope.** How the chosen stack — Hono (HTTP), Drizzle (persistence), Zod + `@hono/zod-openapi` (validation + spec) — is wired into the hexagonal layers. Composition root, dependency injection, middleware order, schema placement, error handling.

**When to read.** Wiring the composition root, adding a Hono middleware, placing a Zod schema, mapping a `Result` to HTTP, defining an error response, writing a Drizzle repository, deciding where authentication vs authorization belongs.

**Rules in this file.** §38, §39, §40, §41, §42, §43, §44

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `02-architecture.md` (layers and direction), `04-input-boundaries.md` (parsing at the perimeter), `05-domain-modeling.md` (§19 Result types).

---

## §38. Composition root owns dependencies; Hono context is request-scoped only

There is exactly **one** composition root: `infrastructure/config/container.ts`. It builds singletons (DB pool, logger, adapters, use cases) at startup. Routes receive the container **through closure**, not through Hono's `c.set` / `c.get`.

Hono's `Context` is for **request-scoped data only**: `requestId`, `userId`, `tenantId`, `RequestContext`, `idempotencyKey`. Treating it as a DI container makes it a service locator and hides dependencies.

### Container

```ts
// src/infrastructure/config/container.ts
import type { LoggerPort } from "../../application/ports/logger.port";
import { CreateProjectUseCase } from "../../application/use-cases/create-project.use-case";
import { SystemClockAdapter } from "../adapters/output/clock/system-clock.adapter";
import { UuidGeneratorAdapter } from "../adapters/output/id/uuid-generator.adapter";
import { PinoLoggerAdapter } from "../adapters/output/logger/pino-logger.adapter";
import { DrizzleTransactionManager } from "../adapters/output/persistence/drizzle/transaction-manager";
import type { DrizzleDB } from "../adapters/output/persistence/drizzle/client.types";
import type { Env } from "./env";

export type Container = {
  readonly config: {
    readonly allowedOrigins: readonly string[];
    readonly maxBodySizeBytes: number;
    readonly version: string;
  };
  readonly logger: LoggerPort;
  readonly createProject: CreateProjectUseCase;
  shutdown(): Promise<void>;
};

export const buildContainer = (env: Env, db: DrizzleDB): Container => {
  const logger = new PinoLoggerAdapter();
  const clock = new SystemClockAdapter();
  const ids = new UuidGeneratorAdapter();
  const transactionManager = new DrizzleTransactionManager(db);

  return {
    config: {
      allowedOrigins: env.ALLOWED_ORIGINS,
      maxBodySizeBytes: env.MAX_BODY_SIZE_BYTES,
      version: env.APP_VERSION,
    },
    logger,
    createProject: new CreateProjectUseCase(transactionManager, clock, ids),
    shutdown: async () => {
      // close pools, flush logger, etc.
    },
  };
};
```

### Entrypoint

```ts
// src/entrypoints/server.ts
import { serve } from "@hono/node-server";
import { loadEnv } from "../infrastructure/config/env";
import { buildContainer } from "../infrastructure/config/container";
import { createNodeDrizzleClient } from "../infrastructure/adapters/output/persistence/drizzle/client.node";
import { createApp } from "../infrastructure/adapters/input/http/app";

const env = loadEnv();
const db = createNodeDrizzleClient(env.DATABASE_URL);
const container = buildContainer(env, db);
const app = createApp(container);

serve({ fetch: app.fetch, port: env.PORT });

process.on("SIGTERM", async () => {
  await container.shutdown();
  process.exit(0);
});
```

### Good: route receives container by closure, request data from `c.get`

```ts
export const projectRoutes = (container: Container) => {
  const app = new OpenAPIHono<HttpAppEnv>();

  app.openapi(createProjectRoute, async (c) => {
    const input = c.req.valid("json");
    const ctx = c.get("requestContext");

    const result = await container.createProject.execute(input, ctx);
    return resultToHttp(c, result); // §42
  });

  return app;
};
```

### Bad: Hono context as a service locator

```ts
// ❌ at startup
c.set("container", container);

// ❌ in a route
const container = c.get("container");
await container.createProject.execute(input, c.get("requestContext"));
```

This hides what each route depends on and makes static analysis useless.

---

## §39. Zod schemas live in the layer they belong to

Zod is allowed in `application/dtos`, `infrastructure/adapters/...`, and `infrastructure/config/env.ts`. **It is not allowed in `domain/`.**

| Schema | Layer | File location |
|---|---|---|
| DTO reused by HTTP, listeners, and tests | application | `application/dtos/*.dto.ts` (uses `@hono/zod-openapi`) |
| HTTP path params, headers, query strings | infrastructure | `infrastructure/adapters/input/http/schemas/*.openapi.ts` |
| Broker-specific payload (Pulsar, SQS) | infrastructure | `infrastructure/adapters/input\|output/messaging/schemas/*.ts` |
| Environment variables | infrastructure | `infrastructure/config/env.ts` |
| Domain entity / value object invariants | domain | **no Zod** — use constructors and Result types |

### Good: DTO once, used by HTTP and tests

```ts
// src/application/dtos/create-project.dto.ts
import { z } from "@hono/zod-openapi";

export const CreateProjectInputSchema = z.object({
  zoneId: z.string().uuid(),
  name: z.string().min(1).max(120).openapi({ example: "main-project" }),
}).openapi("CreateProjectInput");

export const ProjectOutputSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  zoneId: z.string().uuid(),
  name: z.string(),
  createdAt: z.string().datetime(),
}).openapi("Project");

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type ProjectOutput = z.infer<typeof ProjectOutputSchema>;
```

### Good: HTTP-only schema in the HTTP adapter

```ts
// src/infrastructure/adapters/input/http/schemas/project.openapi.ts
import { z } from "@hono/zod-openapi";

export const ProjectIdParamSchema = z.object({
  id: z.string().uuid().openapi({ param: { name: "id", in: "path" } }),
});
```

### Bad: Zod in the domain

```ts
// src/domain/entities/project.ts  ❌
import { z } from "zod";

export const ProjectSchema = z.object({ id: z.string().uuid(), ... });
```

The domain must compile if Zod is removed. Domain invariants live in constructors and value-object factories.

---

## §40. Middleware ordering: security → identity → context → routes

Hono middleware registration is order-sensitive. The fixed order is:

```ts
// 1. transport hygiene + safety
app.use("*", secureHeaders());
app.use("*", cors({ origin: container.config.allowedOrigins }));
app.use("*", compress());
app.use("*", requestIdMiddleware());

// 2. body shape and size
app.use("/v1/*", contentTypeMiddleware());
app.use("/v1/*", bodyLimit({ maxSize: container.config.maxBodySizeBytes }));

// 3. abuse control + identity
app.use("/v1/*", rateLimitMiddleware(container));
app.use("/v1/*", authenticationMiddleware(container));   // who you are — §41

// 4. request context (depends on identity)
app.use("/v1/*", requestContextMiddleware(container));

// 5. errors
app.onError(errorHandler(container));                    // §42
app.notFound(notFoundHandler);
```

Notes:

- `/health`, `/docs`, and `/openapi.json` may stay outside `/v1/*` and skip auth.
- Authorization ("can you do this?") is **not** middleware — it is per-use-case (§41).
- `onError` and `notFound` always live in the root HTTP app.

### `requestContextMiddleware`

```ts
// src/infrastructure/adapters/input/http/middlewares/request-context.middleware.ts
export const requestContextMiddleware = (container: Container) =>
  createMiddleware<HttpAppEnv>(async (c, next) => {
    const requestId = c.get("requestId");
    const userId = c.get("userId") ?? null;
    const tenantId = c.req.header("X-Tenant-Id") ?? null;

    c.set("requestContext", {
      requestId,
      userId,
      tenantId,
      idempotencyKey: c.req.header("Idempotency-Key") ?? null,
      abortSignal: c.req.raw.signal,
      logger: container.logger.child({ requestId, userId: userId?.value ?? null, tenantId }),
    });

    await next();
  });
```

---

## §41. Authentication is middleware; authorization is the use case

| Question | Concern | Location |
|---|---|---|
| "Who are you?" | Authentication | HTTP middleware |
| "Can you do this?" | Authorization | Use case |

Middleware verifies the token, populates `userId` and `tenantId` on `RequestContext`, and stops there. Authorization is a business rule — it depends on the specific operation, the actor's membership and role, the entity's state, the tenant boundary — and therefore lives inside the use case and returns a Result (§19, §27).

### Middleware: authentication only

```ts
const user = await container.authVerifier.verify(token);
c.set("userId", user.id);
```

### Use case: authorization as Result

```ts
async execute(input: EditProjectInput, ctx: RequestContext): Promise<EditProjectResult> {
  if (ctx.userId === null) {
    return { ok: false, code: "UNAUTHORIZED" };
  }

  const project = await this.projects.findById(input.projectId, ctx.tenantId);
  if (project === null) {
    return { ok: false, code: "PROJECT_NOT_FOUND" };
  }

  if (!project.canBeEditedBy(ctx.userId)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  // ...
}
```

---

## §42. Map Result to HTTP at the adapter; `errorHandler` is for unexpected only

The HTTP adapter has a single helper, `resultToHttp`, that takes a Result and writes the response. The global `errorHandler` exists **only** to catch unexpected throws (programmer errors, infra outages) and return `500`.

**Never use the `errorHandler` to drive business behavior.** If a flow can be predicted, it is a Result.

### `resultToHttp`

```ts
// src/infrastructure/adapters/input/http/result-to-http.ts
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

type Ok<T> = { ok: true } & T;
type Err<C extends string> = { ok: false; code: C; details?: unknown };

export const httpError = <C extends string>(
  c: Context<HttpAppEnv>,
  code: C,
  status: ContentfulStatusCode,
  message: string,
  details?: unknown,
) =>
  c.json(
    {
      code,
      message,
      requestId: c.get("requestId"),
      ...(details === undefined ? {} : { details }),
    },
    status,
  );
```

Each route exhaustively maps its own Result. The switch is local, explicit, and TS-exhaustive:

```ts
app.openapi(createProjectRoute, async (c) => {
  const input = c.req.valid("json");
  const ctx = c.get("requestContext");
  const result = await container.createProject.execute(input, ctx);

  if (result.ok) {
    return c.json({ projectId: result.projectId.value }, 201);
  }

  switch (result.code) {
    case "UNAUTHORIZED":
      return httpError(c, result.code, 401, "Unauthorized");
    case "FORBIDDEN":
      return httpError(c, result.code, 403, "Forbidden");
    case "ZONE_NOT_FOUND":
      return httpError(c, result.code, 404, "Zone not found");
    case "PROJECT_NAME_TAKEN":
      return httpError(c, result.code, 409, "Project name already taken in this zone");
  }
});
```

Why explicit `switch` per route instead of a global code→status table:

- TypeScript exhaustiveness flags missing cases at compile time.
- Status codes are a route-level decision (the same code can legitimately map differently per endpoint).
- The mapping is documented next to the OpenAPI route definition.

### `errorHandler` is the safety net, not the flow

```ts
// src/infrastructure/adapters/input/http/errors/error-handler.ts
export const errorHandler =
  (container: Container): ErrorHandler<HttpAppEnv> =>
  (err, c) => {
    const requestId = c.get("requestId");
    const logger = c.get("requestContext")?.logger ?? container.logger;

    logger.error("http.unhandled_error", err instanceof Error ? err : new Error(String(err)));

    return c.json(
      { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId },
      500,
    );
  };
```

The handler does **not** branch on `instanceof DomainError` to map to specific status codes. If you reach the handler, something unexpected happened — log it, return 500.

---

## §43. All HTTP errors share a single response shape

Every error response uses `{ code, message, requestId, details? }`.

```ts
// src/infrastructure/adapters/input/http/schemas/error-response.schema.ts
import { z } from "@hono/zod-openapi";

export const ErrorResponseSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string().optional(),
  details: z.unknown().optional(),
}).openapi("ErrorResponse");
```

Rules:

- `code` is **SCREAMING_SNAKE** and is the stable contract for clients. It matches the `code` from the domain Result (§19).
- `message` is human-readable English. It may change without breaking clients.
- `requestId` is always included when available — it is the join key for support tickets and logs.
- `details` is optional and used for structured field-level information (e.g. Zod validation errors).
- Every route declares its possible error responses in OpenAPI per status code, referencing `ErrorResponseSchema`.

---

## §44. Drizzle schemas are not domain entities

`drizzle-orm` SQL table definitions live in `infrastructure/adapters/output/persistence/drizzle/schema/` and are SQL contracts, not domain types. A mapper always sits between a row and a domain entity.

### Good

```ts
// schema/projects.ts
export const projectsTable = pgTable("projects", {
  id: uuid("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  zoneId: uuid("zone_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export type ProjectRow = typeof projectsTable.$inferSelect;
export type ProjectInsert = typeof projectsTable.$inferInsert;
```

```ts
// mappers/project.mapper.ts — pure functions, no class (§37)
export const mapProjectRowToDomain = (row: ProjectRow): Project =>
  new Project(
    ProjectId.from(row.id),
    TenantId.from(row.tenantId),
    ZoneId.from(row.zoneId),
    row.name,
    row.createdAt,
  );

export const mapProjectToInsert = (project: Project): ProjectInsert => ({
  id: project.id.value,
  tenantId: project.tenantId.value,
  zoneId: project.zoneId.value,
  name: project.name,
  createdAt: project.createdAt,
});
```

```ts
// repositories/drizzle-project.repository.ts
export class DrizzleProjectRepository implements ProjectRepositoryPort {
  constructor(private readonly db: DrizzleExecutor) {}

  async findById(id: ProjectId, tenantId: TenantId): Promise<Project | null> {
    const [row] = await this.db
      .select()
      .from(projectsTable)
      .where(and(
        eq(projectsTable.id, id.value),
        eq(projectsTable.tenantId, tenantId.value), // §45
      ))
      .limit(1);

    return row ? mapProjectRowToDomain(row) : null;
  }
}
```

### Bad: leaking Drizzle types into the domain or application

```ts
// application/use-cases/...  ❌
import type { ProjectRow } from "../../infrastructure/adapters/output/persistence/drizzle/schema/projects";

const project: ProjectRow = await this.db.select()...;
```

```ts
// domain/entities/project.ts  ❌
import { pgTable } from "drizzle-orm/pg-core";
```

### Transactions: `TransactionManagerPort`

When a use case must commit multiple operations atomically (e.g. write entity + outbox event), it depends on `TransactionManagerPort`, not on the DB directly (§16, §17).

```ts
// application/ports/transaction-manager.port.ts
export type TransactionalPorts = {
  projects: ProjectRepositoryPort;
  events: EventPublisherPort;
};

export interface TransactionManagerPort {
  run<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T>;
}
```

```ts
// infrastructure/adapters/output/persistence/drizzle/transaction-manager.ts
export class DrizzleTransactionManager implements TransactionManagerPort {
  constructor(private readonly db: DrizzleDB) {}

  run<T>(work: (ports: TransactionalPorts) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(buildPersistencePorts(tx)));
  }
}

// infrastructure/adapters/output/persistence/drizzle/persistence-ports.factory.ts
export const buildPersistencePorts = (exec: DrizzleExecutor): TransactionalPorts => ({
  projects: new DrizzleProjectRepository(exec),
  events: new DrizzleOutboxEventPublisher(exec),
});
```

The use case never sees a `tx`, `scope`, or any Drizzle object.

If a use case has a single repository write, the transaction can remain an internal detail of the adapter — `TransactionManagerPort` is opt-in.
