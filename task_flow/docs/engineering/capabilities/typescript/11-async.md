# 11 — Async Behavior & Runtime

**Scope.** How the codebase behaves under the JavaScript event loop. What never to do in a request path, how to handle work that must outlive the response, how to cancel and time out external calls, and how to encapsulate runtime differences (Node, Bun, Deno, Workers, Lambda).

**When to read.** Anything with `await`, long-running work, external I/O, streaming, fire-and-forget temptations, or runtime-specific entrypoints.

**Rules in this file.** §50, §51, §52, §53, §54, §55

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `07-infrastructure.md` (§15 `Promise.all`, §17 outbox), `09-stack-conventions.md` (§38 composition root, where lifecycle hooks live).

---

## §50. Do not block the event loop

JavaScript runs on a single event loop per process or isolate. Blocking it freezes every concurrent request.

Avoid inside handlers, middlewares, and use cases:

- Synchronous I/O: `readFileSync`, `writeFileSync`, expensive sync crypto, sync shell calls.
- CPU-heavy loops over large collections.
- `JSON.stringify` / `JSON.parse` over unbounded payloads.
- Heavy compression, hashing, or transformations in the request path.
- Unbounded `Promise.all()` over user-controlled arrays (see §53).
- Artificial waits via busy loops (`while (Date.now() < deadline) {}`).

If an operation is CPU-heavy or long-running:

- Move it to a worker, job, queue, or separate process.
- Expose it behind an application port.
- Let the use case enqueue work and return a status (`{ ok: true, jobId }`).

### Good: heavy work deferred via outbox

```ts
async execute(input: GenerateReportInput, ctx: RequestContext): Promise<GenerateReportResult> {
  const jobId = this.ids.jobId();

  await this.transactions.run(async ({ jobs, events }) => {
    await jobs.create({ id: jobId, tenantId: ctx.tenantId, kind: "report", input });
    await events.publish(new ReportRequestedEvent(jobId));
  });

  return { ok: true, jobId }; // §13: return ID, not the report
}
```

### Bad: CPU work in the request path

```ts
// ❌ inside a route handler
const report = computeBigReport(rows); // synchronous, runs over 50k rows
return c.json(report);
```

---

## §51. No floating promises

Every promise must be **awaited**, **returned**, or **explicitly delegated** (queue, outbox, `waitUntil`). A promise that no one is watching is a silent error path.

### Bad

```ts
app.post("/v1/projects", async (c) => {
  container.audit.logAsync("project.create"); // ❌ unhandled
  return c.json({ ok: true });
});
```

If `logAsync` rejects, the failure is invisible. The request returns 200 either way.

### Good: part of the request path

```ts
await container.audit.logAsync("project.create");
return c.json({ ok: true });
```

### Good: post-response in Cloudflare Workers

```ts
c.executionCtx.waitUntil(
  container.telemetry
    .flush()
    .catch((err) => container.logger.error("telemetry.flush_failed", err)),
);
```

### Good: post-response in Node / Bun / Deno → use the outbox

Node/Bun/Deno do not have `waitUntil`. Fire-and-forget in memory is unsafe: the process can shut down or be reused mid-flight. Use the outbox pattern (§17) for anything that must happen after the response.

```ts
await outbox.enqueue({ type: "audit.project_created", payload: { projectId } });
return c.json({ ok: true });
```

### Lint enforcement

`@typescript-eslint/no-floating-promises` is a required rule in the project ESLint config.

---

## §52. External calls have timeout and AbortSignal

Every call to the network — Stripe, DocuSign, A2A provider, LLM, internal HTTP service, S3 — must have a timeout and respect cancellation when the client disconnects.

### `RequestContext` carries the signal

```ts
c.set("requestContext", {
  requestId,
  userId,
  tenantId,
  idempotencyKey,
  abortSignal: c.req.raw.signal,   // forwarded from the inbound request
  logger,
});
```

### Ports accept the signal

```ts
export interface HttpClientPort {
  get<T>(url: string, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
  post<T>(url: string, body: unknown, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<T>;
}
```

### Adapters compose signals

```ts
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(new Error("timeout")), options.timeoutMs ?? 5000);
const signal = AbortSignal.any([controller.signal, options.signal].filter(Boolean));

try {
  return await fetch(url, { signal });
} finally {
  clearTimeout(timeout);
}
```

### Good

```ts
const response = await this.http.get(stripeUrl, {
  signal: ctx.abortSignal,
  timeoutMs: 5000,
});
```

### Bad: unbounded fetch

```ts
const response = await fetch(stripeUrl); // ❌ no timeout, no cancel
```

If Stripe stalls, the request thread is held until Node's default `fetch` socket timeout, which can be minutes.

---

## §53. Bound concurrency over user-controlled arrays

`Promise.all` is fine for a known small set of independent calls (§15). It is **not** safe over an array whose size comes from the request body, a query result, or an external feed.

### Bad

```ts
await Promise.all(items.map((item) => externalClient.process(item))); // ❌ items may be 10k long
```

### Good: bounded concurrency

```ts
import pLimit from "p-limit";

const limit = pLimit(container.config.externalConcurrency); // e.g. 5
await Promise.all(items.map((item) => limit(() => externalClient.process(item))));
```

### Good: sequential when ordering or rate limits demand it

```ts
for (const item of items) {
  await externalClient.process(item);
}
```

### Reminder

Per §15, **never** open many concurrent database transactions via `Promise.all`. Use a `for ... of` loop.

---

## §54. Use streaming for large or long responses

Do not build large responses in memory. For large payloads, server-sent events, or LLM streaming, stream with backpressure.

### Streaming port

```ts
export interface LlmStreamPort {
  streamCompletion(
    input: LlmInput,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<string>;
}
```

### Hono SSE

```ts
import { streamSSE } from "hono/streaming";

app.get("/v1/completions/:id", async (c) =>
  streamSSE(c, async (stream) => {
    for await (const chunk of container.llm.streamCompletion(input, {
      signal: c.req.raw.signal,
    })) {
      await stream.writeSSE({ data: chunk });
    }
  }),
);
```

### Rules

- Respect client disconnect: pass `c.req.raw.signal` through every step (§52).
- Do not buffer the entire stream in a string before writing — that defeats the purpose.
- Long-running streams must be cancellable from both sides; the producer must check the signal between chunks.

---

## §55. Runtime differences live in entrypoints and adapters

The application and domain layers must compile and run identically on Node, Bun, Deno, Cloudflare Workers, and Lambda. **Every runtime-specific concern is isolated in `entrypoints/` or in a runtime-specific adapter file.**

### Where runtime branches

| Runtime | What to know | Where it goes |
|---|---|---|
| Node.js | `pg` driver, connection pools, `process.on("SIGTERM")` for graceful shutdown, avoid sync APIs in the request path | `entrypoints/server.ts`, `infrastructure/adapters/output/persistence/drizzle/client.node.ts` |
| Bun | Validate driver compatibility, prefer Web APIs where possible | `entrypoints/server.bun.ts`, `client.bun.ts` |
| Deno | `fetch`-first, explicit permissions, Web APIs | `entrypoints/server.deno.ts`, `client.deno.ts` |
| Cloudflare Workers | Bindings instead of env vars, Workers-compatible clients only, use `c.executionCtx.waitUntil()` for post-response work, no Node-only APIs unless polyfilled | `entrypoints/worker.ts`, `client.workers.ts` |
| Lambda | Initialize the container outside the handler to reuse connections across invocations, mind cold starts and timeouts | `entrypoints/lambda.ts` |

### Good: shared application, runtime-specific entrypoint

```ts
// entrypoints/worker.ts (Cloudflare)
import { createApp } from "../infrastructure/adapters/input/http/app";
import { buildContainer } from "../infrastructure/config/container";
import { createWorkersDrizzleClient } from "../infrastructure/adapters/output/persistence/drizzle/client.workers";

export default {
  async fetch(request: Request, env: WorkerBindings, executionCtx: ExecutionContext) {
    const db = createWorkersDrizzleClient(env.DATABASE_URL);
    const container = buildContainer(envFromBindings(env), db);
    const app = createApp(container);
    return app.fetch(request, env, executionCtx);
  },
};
```

### Bad: runtime check inside a use case

```ts
// application/use-cases/...  ❌
if (typeof process !== "undefined") {
  // Node-specific code
} else {
  // Workers-specific code
}
```

If application code branches on runtime, the abstraction has failed — push the branch out into an adapter or entrypoint.

### Shared state caveats

- DB pool: singleton per process / per isolate.
- Logger: singleton.
- Redis client: singleton.
- `RequestContext`: per request.
- Workers and Lambda may reuse adapters across invocations — adapters must tolerate reuse and never store mutable request-scoped state.
