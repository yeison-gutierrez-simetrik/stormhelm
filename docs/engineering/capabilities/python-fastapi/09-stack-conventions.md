# 09 — Stack Conventions (FastAPI / SQLAlchemy / Pydantic)

**Scope.** How the chosen stack — FastAPI (HTTP), SQLAlchemy 2.x async (persistence), Pydantic v2 (validation) — is wired into the hexagonal layers. Composition root, dependency injection, middleware order, schema placement, error handling.

**When to read.** Wiring the composition root, adding a FastAPI middleware or dependency, placing a Pydantic model, mapping a `Result` to HTTP, defining an error response, writing a SQLAlchemy repository, deciding where authentication vs authorization belongs.

**Rules in this file.** §38-py, §39-py, §40-py, §41-py, §42-py, §43-py, §44-py

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `02-architecture.md` (layers and direction), `04-input-boundaries.md` (parsing at the perimeter), `05-domain-modeling.md` (§19 Result types).

---

## §38-py. Composition root owns dependencies; FastAPI `Depends` is for request-scoped only

There is exactly **one** composition root: `infrastructure/config/container.py`. It builds singletons (DB engine, logger, adapters, use cases) at startup, inside the FastAPI `lifespan`. Routes receive the container **through a single `Depends(get_container)`**, not through ad-hoc `Depends` for each dependency.

FastAPI's `Depends` is for **request-scoped data only**: `RequestContext`, `current_user`, `tenant_id`, the database session for the current request, the idempotency key. Using `Depends` as a service locator for every singleton makes the dependency tree opaque and hides what each route actually uses.

### Container

```python
# src/infrastructure/config/container.py
from dataclasses import dataclass
from sqlalchemy.ext.asyncio import AsyncEngine

from application.ports.logger import LoggerPort
from application.use_cases.create_project import CreateProjectUseCase
from infrastructure.adapters.output.clock.system_clock import SystemClockAdapter
from infrastructure.adapters.output.id.uuid_generator import UuidGeneratorAdapter
from infrastructure.adapters.output.logger.structlog_logger import StructlogLoggerAdapter
from infrastructure.adapters.output.persistence.sqlalchemy.transaction_manager import SqlAlchemyTransactionManager
from infrastructure.config.env import Env


@dataclass(frozen=True)
class ContainerConfig:
    allowed_origins: tuple[str, ...]
    max_body_size_bytes: int
    version: str


class Container:
    def __init__(self, env: Env, engine: AsyncEngine) -> None:
        self.config = ContainerConfig(
            allowed_origins=tuple(env.ALLOWED_ORIGINS),
            max_body_size_bytes=env.MAX_BODY_SIZE_BYTES,
            version=env.APP_VERSION,
        )
        self.logger: LoggerPort = StructlogLoggerAdapter()
        self._engine = engine

        clock = SystemClockAdapter()
        ids = UuidGeneratorAdapter()
        transaction_manager = SqlAlchemyTransactionManager(engine)

        self.create_project = CreateProjectUseCase(transaction_manager, clock, ids)

    async def startup(self) -> None:
        # warm pools, run migrations, etc.
        pass

    async def shutdown(self) -> None:
        await self._engine.dispose()


def build_container(env: Env, engine: AsyncEngine) -> Container:
    return Container(env, engine)
```

### Entrypoint

```python
# src/entrypoints/server.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import create_async_engine

from infrastructure.adapters.input.http.app import create_app
from infrastructure.config.container import build_container
from infrastructure.config.env import load_env


env = load_env()
engine = create_async_engine(env.DATABASE_URL, pool_size=env.DB_POOL_SIZE)
container = build_container(env, engine)
app = create_app(container)   # FastAPI app
```

### `lifespan` runs container startup/shutdown per worker

```python
# src/infrastructure/adapters/input/http/app.py
from contextlib import asynccontextmanager
from fastapi import FastAPI

def create_app(container: Container) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        await container.startup()
        app.state.container = container
        yield
        await container.shutdown()

    app = FastAPI(lifespan=lifespan, title="MyApp", version=container.config.version)
    # register middleware (§40-py), error handlers (§42-py), routers
    return app
```

### Good: routes receive container via a single `Depends`

```python
# src/infrastructure/adapters/input/http/dependencies.py
from fastapi import Request
from infrastructure.config.container import Container

def get_container(request: Request) -> Container:
    return request.app.state.container
```

```python
# src/infrastructure/adapters/input/http/routes/projects.py
@router.post("/v1/projects", response_model=ProjectCreatedResponse, status_code=201)
async def create_project(
    input_: CreateProjectInput,
    ctx: RequestContext = Depends(get_request_context),
    container: Container = Depends(get_container),
) -> Response:
    result = await container.create_project.execute(input_, ctx)
    return result_to_http(result)   # §42-py
```

### Bad: `Depends` as a service locator for every singleton

```python
# ❌ each dependency wired separately, hides what the route really depends on
@router.post("/v1/projects")
async def create_project(
    input_: CreateProjectInput,
    create_project_uc: CreateProjectUseCase = Depends(get_create_project),
    logger: LoggerPort = Depends(get_logger),
    clock: ClockPort = Depends(get_clock),
    ids: IdGeneratorPort = Depends(get_ids),
) -> ...:
    ...
```

### Bad: pulling the container from the global

```python
# ❌ at startup
_global_container: Container | None = None

# ❌ in a route
from infrastructure.config.container import _global_container
await _global_container.create_project.execute(...)
```

This hides what each route depends on, breaks parallel testing, and makes static analysis useless.

---

## §39-py. Pydantic schemas live in the layer they belong to

Pydantic is allowed in `application/dtos`, `infrastructure/adapters/...`, and `infrastructure/config/env.py`. **It is not allowed in `domain/`.**

| Schema | Layer | File location |
|---|---|---|
| DTO reused by HTTP, listeners, and tests | application | `application/dtos/*.py` (Pydantic `BaseModel`) |
| HTTP path params, headers, query strings | infrastructure | `infrastructure/adapters/input/http/schemas/*.py` |
| Broker-specific payload (Kafka, SQS) | infrastructure | `infrastructure/adapters/input\|output/messaging/schemas/*.py` |
| Environment variables | infrastructure | `infrastructure/config/env.py` (`pydantic-settings`) |
| Domain entity / value object invariants | domain | **no Pydantic** — frozen dataclass + `__post_init__` validation; Result types for errors |

### Good: DTO once, used by HTTP and tests

```python
# src/application/dtos/create_project.py
from pydantic import BaseModel, Field, ConfigDict

class CreateProjectInput(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    zone_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    name: str = Field(min_length=1, max_length=120, examples=["main-project"])


class ProjectOutput(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    tenant_id: str
    zone_id: str
    name: str
    created_at: datetime
```

### Good: HTTP-only schema in the HTTP adapter

```python
# src/infrastructure/adapters/input/http/schemas/project.py
from pydantic import BaseModel, Field

class ProjectIdParam(BaseModel):
    id: str = Field(pattern=r"^[0-9a-f-]{36}$")
```

### Good: env validation with `pydantic-settings`

```python
# src/infrastructure/config/env.py
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Env(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", frozen=True, extra="forbid")

    DATABASE_URL: str
    APP_VERSION: str
    PORT: int = 8000
    ALLOWED_ORIGINS: list[str] = Field(default_factory=list)
    MAX_BODY_SIZE_BYTES: int = 1_048_576
    DB_POOL_SIZE: int = 10


def load_env() -> Env:
    return Env()   # validates at startup; raises on missing/invalid
```

### Bad: Pydantic in the domain

```python
# src/domain/entities/project.py  ❌
from pydantic import BaseModel

class Project(BaseModel):
    id: str
    tenant_id: str
    ...
```

The domain must compile and run if Pydantic is removed. Domain invariants live in frozen dataclasses with `__post_init__` validation:

```python
# src/domain/entities/project.py
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class Project:
    id: ProjectId
    tenant_id: TenantId
    zone_id: ZoneId
    name: str
    created_at: datetime

    def __post_init__(self) -> None:
        if not 1 <= len(self.name) <= 120:
            raise ValueError(f"name length out of range: {len(self.name)}")
```

---

## §40-py. Middleware ordering: security → identity → context → routes

FastAPI middleware registration is **executed in reverse registration order** (last-registered runs first on the request, first-registered runs first on the response). To keep the mental model identical to other capabilities, **register middleware in reverse** of execution order, or use a thin builder that documents the intent.

The fixed execution order is:

```
1. transport hygiene + safety
2. body shape and size
3. abuse control + identity
4. request context (depends on identity)
5. errors (FastAPI exception handlers)
```

### Implementation

```python
# src/infrastructure/adapters/input/http/app.py
from fastapi.middleware.cors import CORSMiddleware

def create_app(container: Container) -> FastAPI:
    app = FastAPI(lifespan=lifespan, ...)

    # Registered in REVERSE execution order (FastAPI processes last-registered first)

    # 4. request context (depends on identity)
    app.add_middleware(RequestContextMiddleware, container=container)

    # 3. abuse control + identity
    app.add_middleware(AuthenticationMiddleware, container=container)   # §41-py
    app.add_middleware(RateLimitMiddleware, container=container)

    # 2. body shape and size
    app.add_middleware(BodyLimitMiddleware, max_size=container.config.max_body_size_bytes)
    app.add_middleware(ContentTypeMiddleware)

    # 1. transport hygiene + safety
    app.add_middleware(RequestIdMiddleware)
    app.add_middleware(SecureHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(container.config.allowed_origins),
        allow_credentials=True,
    )

    # 5. errors (registered separately via exception handlers — §42-py)
    register_error_handlers(app, container)

    # Routes
    app.include_router(project_router, prefix="/v1")
    return app
```

Notes:

- `/health`, `/docs`, and `/openapi.json` are routed outside `/v1` and skip auth via a `Depends` skip-list inside the middleware.
- Authorization ("can you do this?") is **not** middleware — it is per-use-case (§41-py).
- Error handlers (`add_exception_handler`) always live alongside `create_app`.

### `RequestContextMiddleware`

```python
# src/infrastructure/adapters/input/http/middlewares/request_context.py
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

class RequestContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, container: Container) -> None:
        super().__init__(app)
        self._container = container

    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or uuid4().hex
        user_id = getattr(request.state, "user_id", None)
        tenant_id = request.headers.get("x-tenant-id")

        request.state.context = RequestContext(
            request_id=request_id,
            user_id=user_id,
            tenant_id=tenant_id,
            idempotency_key=request.headers.get("idempotency-key"),
            logger=self._container.logger.bind(
                request_id=request_id,
                user_id=user_id,
                tenant_id=tenant_id,
            ),
        )

        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response
```

The `RequestContext` is then exposed via a tiny dependency:

```python
def get_request_context(request: Request) -> RequestContext:
    return request.state.context
```

---

## §41-py. Authentication is middleware; authorization is the use case

| Question | Concern | Location |
|---|---|---|
| "Who are you?" | Authentication | HTTP middleware |
| "Can you do this?" | Authorization | Use case |

Middleware verifies the token, populates `user_id` and `tenant_id` on `request.state`, and stops there. Authorization is a business rule — it depends on the specific operation, the actor's membership and role, the entity's state, the tenant boundary — and therefore lives inside the use case and returns a Result (§19, §27).

### Middleware: authentication only

```python
# src/infrastructure/adapters/input/http/middlewares/authentication.py
class AuthenticationMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # /health, /docs, /openapi.json skip
        if request.url.path in self._SKIP_PATHS:
            return await call_next(request)

        token = self._extract_bearer(request)
        if token is None:
            return JSONResponse(
                {"code": "UNAUTHORIZED", "message": "Missing or invalid bearer token"},
                status_code=401,
            )

        try:
            user = await self._container.auth_verifier.verify(token)
        except InvalidToken:
            return JSONResponse(
                {"code": "UNAUTHORIZED", "message": "Token verification failed"},
                status_code=401,
            )

        request.state.user_id = user.id
        return await call_next(request)
```

### Use case: authorization as Result

```python
async def execute(
    self,
    input_: EditProjectInput,
    ctx: RequestContext,
) -> Result[ProjectEdited, EditProjectError]:
    if ctx.user_id is None:
        return Err(code="UNAUTHORIZED")

    project = await self._projects.find_by_id(input_.project_id, ctx.tenant_id)
    if project is None:
        return Err(code="PROJECT_NOT_FOUND")

    if not project.can_be_edited_by(ctx.user_id):
        return Err(code="FORBIDDEN")

    # ... apply the edit ...
    return Ok(ProjectEdited(project_id=project.id))
```

---

## §42-py. Map Result to HTTP at the adapter; exception handlers are for unexpected only

The HTTP adapter has a single helper, `result_to_http`, that takes a Result and writes the response. Global exception handlers exist **only** to catch unexpected exceptions (programmer errors, infra outages) and return `500`.

**Never use exception handlers to drive business behavior.** If a flow can be predicted, it is a Result. Custom `HTTPException` instances are forbidden in use cases.

### `result_to_http` helper

```python
# src/infrastructure/adapters/input/http/result_to_http.py
from fastapi.responses import JSONResponse

def http_error(
    code: str,
    status: int,
    message: str,
    request_id: str | None = None,
    details: object | None = None,
) -> JSONResponse:
    body: dict[str, object] = {"code": code, "message": message}
    if request_id is not None:
        body["request_id"] = request_id
    if details is not None:
        body["details"] = details
    return JSONResponse(body, status_code=status)
```

Each route exhaustively maps its own Result. The match is local, explicit, and (with `Literal` codes) checked by the type system:

```python
@router.post("/v1/projects", status_code=201)
async def create_project(
    input_: CreateProjectInput,
    ctx: RequestContext = Depends(get_request_context),
    container: Container = Depends(get_container),
):
    result = await container.create_project.execute(input_, ctx)

    if result.ok:
        return {"project_id": result.value.project_id}

    match result.code:
        case "UNAUTHORIZED":
            return http_error(result.code, 401, "Unauthorized", ctx.request_id)
        case "FORBIDDEN":
            return http_error(result.code, 403, "Forbidden", ctx.request_id)
        case "ZONE_NOT_FOUND":
            return http_error(result.code, 404, "Zone not found", ctx.request_id)
        case "PROJECT_NAME_TAKEN":
            return http_error(result.code, 409, "Project name already taken", ctx.request_id)
```

Why explicit `match` per route instead of a global code→status table:

- With `Literal` codes in the Result type, `pyright --strict` flags missing arms at compile time.
- Status codes are a route-level decision (the same code can legitimately map differently per endpoint).
- The mapping is documented next to the route definition.

### Exception handlers are the safety net, not the flow

```python
# src/infrastructure/adapters/input/http/errors/handlers.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

def register_error_handlers(app: FastAPI, container: Container) -> None:

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, err: Exception):
        ctx = getattr(request.state, "context", None)
        logger = (ctx.logger if ctx else container.logger)
        request_id = (ctx.request_id if ctx else None)

        logger.error("http.unhandled_error", exc_info=err)

        return JSONResponse(
            {
                "code": "INTERNAL_ERROR",
                "message": "Internal Server Error",
                "request_id": request_id,
            },
            status_code=500,
        )
```

The handler does **not** branch on `isinstance(err, DomainError)` to map specific status codes. If you reach the handler, something unexpected happened — log it, return 500.

---

## §43-py. All HTTP errors share a single response shape

Every error response uses `{code, message, request_id, details?}`.

```python
# src/infrastructure/adapters/input/http/schemas/error_response.py
from pydantic import BaseModel

class ErrorResponse(BaseModel):
    code: str
    message: str
    request_id: str | None = None
    details: object | None = None
```

Rules:

- `code` is **SCREAMING_SNAKE** and is the stable contract for clients. It matches the `code` from the domain Result (§19).
- `message` is human-readable English. It may change without breaking clients.
- `request_id` is always included when available — it is the join key for support tickets and logs.
- `details` is optional and used for structured field-level information (e.g., Pydantic validation errors).
- Every route declares its possible error responses in OpenAPI per status code:

```python
@router.post(
    "/v1/projects",
    status_code=201,
    responses={
        401: {"model": ErrorResponse, "description": "Unauthorized"},
        403: {"model": ErrorResponse, "description": "Forbidden"},
        404: {"model": ErrorResponse, "description": "Zone not found"},
        409: {"model": ErrorResponse, "description": "Name already taken"},
    },
)
async def create_project(...): ...
```

---

## §44-py. SQLAlchemy models are not domain entities

SQLAlchemy 2.x ORM models live in `infrastructure/adapters/output/persistence/sqlalchemy/models/` and are SQL contracts, not domain types. A mapper always sits between a row and a domain entity.

### Good

```python
# models/projects.py
from datetime import datetime
from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from infrastructure.adapters.output.persistence.sqlalchemy.base import Base


class ProjectRow(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    zone_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False)
```

```python
# mappers/project_mapper.py — pure functions, no class (§37)
from domain.entities.project import Project
from domain.value_objects.ids import ProjectId, TenantId, ZoneId
from infrastructure.adapters.output.persistence.sqlalchemy.models.projects import ProjectRow


def map_project_row_to_domain(row: ProjectRow) -> Project:
    return Project(
        id=ProjectId.from_str(row.id),
        tenant_id=TenantId.from_str(row.tenant_id),
        zone_id=ZoneId.from_str(row.zone_id),
        name=row.name,
        created_at=row.created_at,
    )


def map_project_to_row(project: Project) -> ProjectRow:
    return ProjectRow(
        id=project.id.value,
        tenant_id=project.tenant_id.value,
        zone_id=project.zone_id.value,
        name=project.name,
        created_at=project.created_at,
    )
```

```python
# repositories/sqlalchemy_project_repository.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from application.ports.project_repository import ProjectRepositoryPort
from domain.entities.project import Project
from domain.value_objects.ids import ProjectId, TenantId


class SqlAlchemyProjectRepository(ProjectRepositoryPort):
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def find_by_id(
        self,
        id_: ProjectId,
        tenant_id: TenantId,
    ) -> Project | None:
        stmt = (
            select(ProjectRow)
            .where(
                ProjectRow.id == id_.value,
                ProjectRow.tenant_id == tenant_id.value,   # §45
            )
            .limit(1)
        )
        row = (await self._session.execute(stmt)).scalar_one_or_none()
        return map_project_row_to_domain(row) if row is not None else None
```

### Bad: leaking SQLAlchemy types into the domain or application

```python
# application/use_cases/...  ❌
from infrastructure.adapters.output.persistence.sqlalchemy.models.projects import ProjectRow

project: ProjectRow = (await self._session.execute(stmt)).scalar_one()
```

```python
# domain/entities/project.py  ❌
from sqlalchemy.orm import Mapped, mapped_column
```

### Transactions: `TransactionManagerPort`

When a use case must commit multiple operations atomically (e.g., write entity + outbox event), it depends on `TransactionManagerPort`, not on the session directly (§16, §17).

```python
# application/ports/transaction_manager.py
from contextlib import asynccontextmanager
from typing import AsyncContextManager, Protocol

from application.ports.event_publisher import EventPublisherPort
from application.ports.project_repository import ProjectRepositoryPort


@dataclass(frozen=True)
class TransactionalPorts:
    projects: ProjectRepositoryPort
    events: EventPublisherPort


class TransactionManagerPort(Protocol):
    def run(self) -> AsyncContextManager[TransactionalPorts]: ...
```

```python
# infrastructure/adapters/output/persistence/sqlalchemy/transaction_manager.py
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker


class SqlAlchemyTransactionManager(TransactionManagerPort):
    def __init__(self, engine: AsyncEngine) -> None:
        self._sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    @asynccontextmanager
    async def run(self):
        async with self._sessionmaker() as session:
            async with session.begin():
                yield build_persistence_ports(session)


def build_persistence_ports(session: AsyncSession) -> TransactionalPorts:
    return TransactionalPorts(
        projects=SqlAlchemyProjectRepository(session),
        events=SqlAlchemyOutboxEventPublisher(session),
    )
```

```python
# use case
async def execute(self, input_, ctx):
    async with self._transactions.run() as ports:
        project = Project(...)
        await ports.projects.save(project)
        await ports.events.publish(ProjectCreatedEvent(project_id=project.id))
    return Ok(...)
```

The use case never sees a `Session`, `Connection`, or any SQLAlchemy object.

If a use case has a single repository write, the transaction can remain an internal detail of the adapter — `TransactionManagerPort` is opt-in.
