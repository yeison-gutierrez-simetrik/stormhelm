# 02 — Hexagonal Architecture & Layering

**Scope.** How code is organized into layers, what each layer owns, where dependencies are allowed to point, what belongs in adapters, and when to use a class vs a function.

**When to read.** Creating a new module or use case, adding an adapter (HTTP, MCP, Drizzle, Stripe, DocuSign, A2A), designing a read model, shaping an MCP response, choosing between `class` and a pure function.

**Rules in this file.** §3, §37, §24, §14, §23

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `09-stack-conventions.md` (Hono/Drizzle/Zod-specific placement), `05-domain-modeling.md` (the types these layers exchange).

---

## §3. Layer-first hexagonal architecture

The codebase is organized into four top-level layers. **All dependencies point inward.** The domain knows nothing about Hono, Drizzle, Zod, Redis, AWS SDKs, Pino, MCP, or A2A transport details.

```txt
entrypoints  →  infrastructure  →  application  →  domain
                                        ↑
                                        |
                           all dependencies point inward
```

### Folder structure

```txt
src/
├── entrypoints/                  # Node, Bun, Workers, Lambda — runtime-specific bootstraps
│   ├── server.ts
│   ├── worker.ts
│   └── listener.ts
│
├── domain/                       # Pure business core. No frameworks. No SDKs.
│   ├── entities/
│   ├── value-objects/
│   ├── services/                 # Domain services (rules that span entities)
│   ├── events/
│   ├── errors/                   # *Error classes for unexpected throws only (see §19)
│   └── types/
│
├── application/                  # Use cases. Orchestrates domain + ports. No concrete impls.
│   ├── use-cases/
│   ├── ports/                    # *Port interfaces that use cases require
│   ├── types/                    # RequestContext, pagination, etc.
│   ├── dtos/                     # @hono/zod-openapi DTOs — see §39
│   └── mappers/                  # domain ↔ DTO
│
└── infrastructure/               # Everything that touches the outside world
    ├── config/                   # env parsing, composition root — see §38
    ├── security/
    └── adapters/
        ├── input/                # HTTP routes, MCP tools, message listeners
        │   ├── http/
        │   └── messaging/
        └── output/               # DB, cache, queues, external APIs
            ├── persistence/drizzle/
            ├── messaging/
            ├── cache/
            ├── logger/
            ├── clock/
            └── id/
```

### Direction rule (what each layer may import)

| Layer | May import from | Must not import |
|---|---|---|
| `domain/` | nothing outside `domain/` | `hono`, `drizzle-orm`, `zod`, any framework or SDK |
| `application/` | `domain/`, own `ports/`/`types/`/`dtos/`. `@hono/zod-openapi` allowed in `application/dtos` only (§39) | `hono`, `drizzle-orm`, anything in `infrastructure/` |
| `infrastructure/` | `domain/`, `application/`, libraries | nothing |
| `entrypoints/` | `infrastructure/` only | direct domain or application logic |

### Good: use case depends on a port, not an adapter

```ts
// application/use-cases/create-project.use-case.ts
import type { ProjectRepositoryPort } from "../ports/project.repository";
import type { ClockPort } from "../ports/clock.port";
import type { IdGeneratorPort } from "../ports/id-generator.port";

export class CreateProjectUseCase {
  constructor(
    private readonly projects: ProjectRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(input: CreateProjectInput, ctx: RequestContext): Promise<CreateProjectResult> {
    // pure orchestration — no Drizzle, no Hono, no Stripe
  }
}
```

### Bad: domain knows about Drizzle and HTTP

```ts
// domain/services/create-project.ts  ❌
import { db } from "../../infrastructure/db";

export const createProject = async (input) => {
  const [row] = await db.insert(projectsTable).values(input).returning();
  await fetch(input.agentUrl, { method: "POST", body: JSON.stringify(row) });
  return row;
};
```

Why bad:

- The domain imports infrastructure.
- The mutation returns a DB row.
- The HTTP call is embedded in business logic.
- Testing requires a database and a network.

### Evolution: nest under `contexts/` when a second bounded context grows

The structure above is right for a single bounded context. When a second context (e.g. Quotes, SOWs, Disputes) reaches comparable code mass, **keep layer-first but nest it under a `contexts/` directory**:

```txt
src/contexts/quotes/
  domain/  application/  infrastructure/
src/contexts/sows/
  domain/  application/  infrastructure/
src/contexts/shared/             # shared kernel: cross-context value objects only
  domain/
src/entrypoints/                 # entrypoints stay at the top
```

The direction rule and layer responsibilities do not change. Cross-context references must go through `application/ports` of one side and be implemented by an adapter in the other side — never through direct domain imports.

---

## §37. OOP-lite frontier: class for identity, dependencies, or behavior; functions for everything else

The codebase uses **OOP-lite**: classes are used where they buy clarity (DI, identity, invariants), and pure functions everywhere else. The trade-off is *expressiveness of architectural boundaries*, not runtime performance.

### Use a `class` for

- **Use cases.** `class CreateProjectUseCase { constructor(...ports) {} execute(input, ctx) {} }` — the constructor declares the dependencies a use case needs, which is the strongest form of DI documentation.
- **Adapters.** `class DrizzleProjectRepository implements ProjectRepositoryPort { constructor(private readonly db: DrizzleExecutor) {} }` — the class captures the resource handle.
- **Domain entities and value objects with invariants or behavior.** `class Project` if it has methods like `rename()`, validation in the constructor, or identity semantics. Otherwise it is data — see below.

### Use `type` / `interface` for

- **Ports** (`ProjectRepositoryPort`, `ClockPort`, `EventPublisherPort`).
- **DTOs** (`*Input`, `*Output`).
- **Result types** (`type CreateProjectResult = { ok: true; ... } | { ok: false; code: "..." }` — see §19).
- **Anemic entities** — domain types that are pure data with no behavior. A `class Listing` with no methods and no invariants is just `type Listing = { ... }`. **Do not introduce classes to hold data.**

### Use pure functions for

- Mappers (`mapProjectRowToDomain`, `mapProjectToInsert`).
- Small factories.
- Helpers, predicates, narrowers.
- Zod schemas and route builders (`createRoute(...)`).
- Anything that is a transformation `input → output` with no resources.

### Good

```ts
// application/use-cases/create-project.use-case.ts
export class CreateProjectUseCase {
  constructor(
    private readonly projects: ProjectRepositoryPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(
    input: CreateProjectInput,
    ctx: RequestContext,
  ): Promise<CreateProjectResult> {
    // ...
  }
}

// domain/entities/project.ts — has behavior, so it's a class
export class Project {
  constructor(
    public readonly id: ProjectId,
    public readonly tenantId: TenantId,
    public readonly name: string,
    public readonly createdAt: Date,
  ) {}

  rename(name: string): Project {
    return new Project(this.id, this.tenantId, name, this.createdAt);
  }
}

// infrastructure/adapters/output/persistence/drizzle/mappers/project.mapper.ts
// pure functions, no class
export const mapProjectRowToDomain = (row: ProjectRow): Project => {
  return new Project(ProjectId.from(row.id), TenantId.from(row.tenantId), row.name, row.createdAt);
};

export const mapProjectToInsert = (project: Project): ProjectInsert => ({
  id: project.id.value,
  tenantId: project.tenantId.value,
  name: project.name,
  createdAt: project.createdAt,
});
```

### Bad: anemic class entity

```ts
// domain/entities/listing.ts  ❌
export class Listing {
  public id: string;
  public title: string;
  public price: number;

  constructor(id: string, title: string, price: number) {
    this.id = id;
    this.title = title;
    this.price = price;
  }

  getId(): string { return this.id; }
  getTitle(): string { return this.title; }
  setTitle(title: string): void { this.title = title; }
}
```

This is data wearing a class. Use a `type` with `readonly` fields instead.

### Bad: heavy OOP

Do **not** introduce:

- deep inheritance chains
- base classes for "all use cases"
- decorators or reflection-based DI
- DI containers that hide which dependencies a component has
- exceptions for expected business flow (see §19)

The point of OOP-lite is that the structure is visible. Anything that hides the structure defeats it.

---

## §24. Keep adapters boring

Adapters translate between the outside world and the domain.

They should not contain business decisions.

Examples of adapters:

- Hono route handlers (input/http)
- Drizzle repositories (output/persistence)
- Stripe client (output/payments)
- DocuSign client (output/contracts)
- Better Auth integration (output/auth)
- MCP tool handler (input/mcp)
- A2A JSON-RPC client (output/provider-agent)
- email sender
- webhook sender

Good adapter responsibilities:

- parse input
- call use case (or domain service)
- translate domain Result to HTTP/MCP/CLI response (see §42)
- map external API payloads into internal types
- handle transport-level errors

Bad adapter responsibilities:

- deciding whether a quote is expired
- deciding whether a provider can publish
- calculating take rate
- determining dispute outcome
- mutating SOW state directly

---

## §14. Keep read models deliberate

Queries can return data shaped for the user interface or agent context.

Do not expose internal database rows directly.

### Good

```ts
type McpListingSearchResult = {
  listingId: string;
  title: string;
  providerName: string;
  priceSummary: string;
  trustSummary: string;
};
```

### Bad

```ts
type McpListingSearchResult = typeof listingsTable.$inferSelect;
```

MCP responses should be especially compact (see §23).

---

## §23. Keep MCP responses compact

MCP is a customer-facing agent interface. It must be context-window efficient.

Return exactly what the agent needs for the next decision.

### Good

```ts
type SearchListingsMcpResult = {
  results: Array<{
    listingId: string;
    title: string;
    providerName: string;
    priceSummary: string;
    reputationSummary: string;
    nextActions: Array<"request_quote" | "start_scoping">;
  }>;
};
```

### Bad

```ts
type SearchListingsMcpResult = {
  results: ListingWithProviderAgentCompanyReviewsPaymentsAndAuditEvents[];
};
```
