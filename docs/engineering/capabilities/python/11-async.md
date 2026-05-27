# 11 — Async Behavior & Runtime (Python)

**Scope.** How the codebase behaves under Python's `asyncio` event loop. What never to do in a request path, how to handle work that must outlive the response, how to cancel and time out external calls, and how to encapsulate runtime differences (uvicorn, gunicorn+uvicorn, hypercorn, Lambda Web Adapter).

**When to read.** Anything with `async`/`await`, long-running work, external I/O, streaming, fire-and-forget temptations, or runtime-specific entrypoints.

**Rules in this file.** §50-py, §51-py, §52-py, §53-py, §54-py, §55-py

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `07-infrastructure.md` (§15 `asyncio.gather`, §17 outbox), `09-stack-conventions.md` (§38-py composition root, where lifespan hooks live).

---

## §50-py. Do not block the event loop

`asyncio` runs on a single event loop per worker process. Blocking it freezes every concurrent request handled by that worker.

Avoid inside async handlers, dependencies, and use cases:

- Synchronous I/O: `open()` without `aiofiles`, `requests.get`, `psycopg2` (use `psycopg` v3 async or `asyncpg`), sync Redis client, sync HTTP clients.
- CPU-heavy loops over large collections.
- Expensive sync libraries: PIL image transforms, large `json.dumps`/`json.loads`, BeautifulSoup parsing, compression, hashing.
- Unbounded `asyncio.gather()` over user-controlled arrays (see §53-py).
- `time.sleep()` (use `await asyncio.sleep()`).
- Busy waits (`while time.monotonic() < deadline: pass`).

If an operation is CPU-heavy or genuinely sync, push it off the loop:

- `await asyncio.to_thread(fn, *args)` — for IO-bound sync code (e.g. `requests` you cannot replace).
- `await loop.run_in_executor(process_pool, fn, *args)` — for CPU-bound work.
- Better: move it to a worker / queue / separate process and have the use case enqueue and return a status.

### Good: heavy work deferred via outbox

```python
async def execute(self, input_: GenerateReportInput, ctx: RequestContext) -> GenerateReportResult:
    job_id = self.ids.job_id()

    async with self.transactions.run() as ports:
        await ports.jobs.create(
            id=job_id, tenant_id=ctx.tenant_id, kind="report", input=input_,
        )
        await ports.events.publish(ReportRequestedEvent(job_id=job_id))

    return GenerateReportResult(ok=True, job_id=job_id)  # §13: return ID, not the report
```

### Bad: CPU work in the request path

```python
@router.post("/v1/reports")
async def create_report(...):
    report = compute_big_report(rows)  # ❌ runs over 50k rows synchronously
    return report
```

### Good: bounded sync work pushed to a thread

```python
# Library is sync-only (e.g. PyPDF2). Push to a thread so the loop continues.
pdf_bytes = await asyncio.to_thread(extract_pdf_text, raw_bytes)
```

---

## §51-py. No untracked `create_task` (no floating coroutines)

Every coroutine must be **awaited**, **returned**, or **explicitly scheduled in a tracked group** (`asyncio.TaskGroup`, outbox, background task framework). A task that no one is watching is a silent error path — exceptions get logged in obscure handlers (or lost entirely on shutdown).

### Bad: untracked `create_task`

```python
@router.post("/v1/projects")
async def create_project(...):
    asyncio.create_task(container.audit.log_async("project.create"))  # ❌
    return {"ok": True}
```

If `log_async` raises, the failure is invisible. The request returns 200 either way. If the process shuts down before the task completes, the audit is silently dropped.

### Bad: missing `await`

```python
container.audit.log_async("project.create")  # ❌ coroutine never awaited
return {"ok": True}
# RuntimeWarning: coroutine 'log_async' was never awaited
```

### Good: part of the request path

```python
await container.audit.log_async("project.create")
return {"ok": True}
```

### Good: structured concurrency with `TaskGroup` (Python 3.11+)

```python
async with asyncio.TaskGroup() as tg:
    project_task = tg.create_task(repository.fetch_project(id_))
    zone_task = tg.create_task(repository.fetch_zone(zone_id))
# both are awaited and their exceptions propagate together
project, zone = project_task.result(), zone_task.result()
```

### Good: post-response in FastAPI via `BackgroundTasks` (best-effort) or outbox (durable)

`BackgroundTasks` runs after the response returns but **within the same worker process**. If the process dies, the task is lost. Use it only for genuinely best-effort work (e.g., warming a cache).

```python
@router.post("/v1/projects")
async def create_project(
    input_: CreateProjectInput,
    background: BackgroundTasks,
    container: Container = Depends(get_container),
) -> ProjectCreated:
    project_id = await container.create_project.execute(input_, ctx)
    background.add_task(container.cache.warm_project, project_id)
    return ProjectCreated(project_id=project_id)
```

For anything that **must** happen, use the outbox (§17):

```python
await outbox.enqueue({"type": "audit.project_created", "payload": {"project_id": project_id}})
return {"ok": True}
```

### Lint enforcement

`ruff` rules `RUF006` (`asyncio.create_task` without keeping the reference) and `ASYNC*` are required in the project's `pyproject.toml`. Type checkers also flag un-awaited coroutines.

---

## §52-py. External calls have timeout and cancellation

Every call to the network — Stripe, DocuSign, A2A provider, LLM, internal HTTP service, S3 — must have a timeout and respect cancellation when the client disconnects.

### `RequestContext` carries cancellation

```python
@dataclass(frozen=True)
class RequestContext:
    request_id: str
    user_id: UserId | None
    tenant_id: TenantId | None
    idempotency_key: str | None
    logger: Logger
    # Python uses asyncio.CancelledError propagation; explicit cancel_scope from anyio if needed
```

When using `httpx` or `asyncpg`, cancellation propagates naturally if the calling task is cancelled (e.g., when the client disconnects, Starlette cancels the request task).

### Ports accept explicit timeout

```python
from typing import Protocol

class HttpClientPort(Protocol):
    async def get(self, url: str, *, timeout_seconds: float = 5.0) -> object: ...
    async def post(self, url: str, body: object, *, timeout_seconds: float = 5.0) -> object: ...
```

### Adapters apply the timeout

```python
import httpx

class HttpxAdapter(HttpClientPort):
    def __init__(self, client: httpx.AsyncClient) -> None:
        self._client = client

    async def get(self, url: str, *, timeout_seconds: float = 5.0) -> object:
        async with asyncio.timeout(timeout_seconds):
            response = await self._client.get(url)
            response.raise_for_status()
            return response.json()
```

### Good

```python
response = await self.http.get(stripe_url, timeout_seconds=5.0)
```

### Bad: unbounded fetch

```python
response = await httpx.AsyncClient().get(stripe_url)  # ❌ default timeout is None
```

If Stripe stalls, the request task is held indefinitely. Combined with `gunicorn`'s worker timeout, the worker will be killed and the request lost.

### Use `asyncio.timeout()` (Python 3.11+), not `wait_for`

```python
# Good (3.11+)
async with asyncio.timeout(5.0):
    response = await slow_call()

# Acceptable (pre-3.11, deprecated semantics in 3.11+)
response = await asyncio.wait_for(slow_call(), timeout=5.0)
```

`asyncio.timeout()` is a context manager and cooperates correctly with `TaskGroup` and nested cancellation.

---

## §53-py. Bound concurrency over user-controlled arrays

`asyncio.gather(*coros)` is fine for a known small set of independent calls (§15). It is **not** safe over a sequence whose size comes from the request body, a query result, or an external feed.

### Bad

```python
await asyncio.gather(*(external_client.process(item) for item in items))  # ❌ items may be 10k long
```

### Good: bounded concurrency with `asyncio.Semaphore`

```python
semaphore = asyncio.Semaphore(container.config.external_concurrency)  # e.g. 5

async def bounded_process(item: Item) -> ProcessResult:
    async with semaphore:
        return await external_client.process(item)

results = await asyncio.gather(*(bounded_process(item) for item in items))
```

### Good: `anyio` task group with limit

```python
import anyio

async with anyio.create_task_group() as tg:
    limiter = anyio.CapacityLimiter(5)
    async def bounded(item):
        async with limiter:
            return await external_client.process(item)
    for item in items:
        tg.start_soon(bounded, item)
```

### Good: sequential when ordering or rate limits demand it

```python
for item in items:
    await external_client.process(item)
```

### Reminder

Per §15, **never** open many concurrent database transactions via `asyncio.gather`. Run them sequentially.

---

## §54-py. Use streaming for large or long responses

Do not build large responses in memory. For large payloads, server-sent events, or LLM streaming, stream with backpressure.

### Streaming port

```python
from typing import AsyncIterator, Protocol

class LlmStreamPort(Protocol):
    def stream_completion(self, input_: LlmInput) -> AsyncIterator[str]: ...
```

### FastAPI SSE

```python
from fastapi.responses import StreamingResponse

@router.get("/v1/completions/{id}")
async def stream_completion(
    id: str,
    container: Container = Depends(get_container),
) -> StreamingResponse:
    async def event_stream() -> AsyncIterator[str]:
        async for chunk in container.llm.stream_completion(LlmInput(id=id)):
            yield f"data: {chunk}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
```

### Rules

- Respect client disconnect: when the client disconnects, FastAPI cancels the generator task. Producers must check for `asyncio.CancelledError` between chunks if they cannot tolerate immediate cancellation.
- Do not buffer the entire stream in a string before yielding — that defeats the purpose.
- Long-running streams must be cancellable from both sides; the producer must yield control between chunks (`await asyncio.sleep(0)` if needed).

### Good

```python
async def generate_csv() -> AsyncIterator[str]:
    yield "id,name,email\n"
    async for row in repository.iter_users():
        yield f"{row.id},{row.name},{row.email}\n"

return StreamingResponse(generate_csv(), media_type="text/csv")
```

### Bad

```python
rows = await repository.fetch_all_users()  # ❌ loads 200k rows
csv = "id,name,email\n" + "\n".join(f"{r.id},{r.name},{r.email}" for r in rows)
return Response(content=csv)
```

---

## §55-py. Runtime differences live in entrypoints and adapters

The application and domain layers must run identically under uvicorn (sync or async), gunicorn + uvicorn workers, hypercorn, AWS Lambda (via Mangum or Lambda Web Adapter), and any local test runner. **Every runtime-specific concern is isolated in `entrypoints/` or in a runtime-specific adapter file.**

### Where runtime branches

| Runtime | What to know | Where it goes |
|---|---|---|
| `uvicorn` (dev) | Hot reload, single worker — useful for development | `entrypoints/server_dev.py`, run with `uvicorn entrypoints.server_dev:app --reload` |
| `gunicorn + uvicorn` (prod) | Multi-worker; lifespan runs per worker; share nothing in-process; use Redis for cross-worker state | `entrypoints/server.py`, `gunicorn.conf.py` |
| `hypercorn` | HTTP/2 / HTTP/3 / WebSockets at scale, similar config to uvicorn | `entrypoints/server_hypercorn.py` |
| AWS Lambda (Mangum / LWA) | Cold starts — initialize container at module load, not per request; mind 15-min timeout | `entrypoints/lambda.py` |
| Local tests | In-process via `httpx.AsyncClient(transport=ASGITransport(app=app))`; lifespan not auto-started | `tests/conftest.py` |

### Good: shared application, runtime-specific entrypoint

```python
# entrypoints/server.py — gunicorn + uvicorn
from infrastructure.adapters.input.http.app import create_app
from infrastructure.config.container import build_container
from infrastructure.config.env import load_env
from infrastructure.adapters.output.persistence.sqlalchemy.client import create_async_engine

env = load_env()
engine = create_async_engine(env.DATABASE_URL)
container = build_container(env, engine)
app = create_app(container)   # FastAPI app
```

```python
# entrypoints/lambda.py — AWS Lambda
from mangum import Mangum
from entrypoints.server import app

# Mangum wraps the FastAPI app for Lambda invocation
handler = Mangum(app, lifespan="off")
# lifespan="off": run startup once at module load (above), not per invocation
```

### Bad: runtime check inside a use case

```python
# application/use_cases/...  ❌
import os

if os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    # Lambda-specific path
    ...
else:
    # gunicorn path
    ...
```

If application code branches on runtime, the abstraction has failed — push the branch out into an adapter or entrypoint.

### Shared state caveats

- **DB pool (`asyncpg`/SQLAlchemy async):** singleton per worker process. Created during FastAPI lifespan `startup`, disposed at `shutdown`.
- **Logger:** singleton per process.
- **Redis client:** singleton per process; the underlying connection pool handles concurrency.
- **`RequestContext`:** per request, via FastAPI dependency or middleware.
- **Lambda cold starts:** the container is created at module load. Subsequent invocations on the same warm container reuse pools — adapters must tolerate reuse and never store mutable request-scoped state at module/instance level.

### Lifespan

```python
# infrastructure/adapters/input/http/app.py
from contextlib import asynccontextmanager
from fastapi import FastAPI

def create_app(container: Container) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # startup
        await container.startup()
        yield
        # shutdown
        await container.shutdown()

    app = FastAPI(lifespan=lifespan)
    # register routes, middleware, error handlers
    return app
```

The lifespan hook is the **only** place to open and close resources tied to the worker process. Never open a DB pool inside a request handler.
