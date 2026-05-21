# 08 — Testability & Tests

**Scope.** How to keep behavior reproducible and observable: injecting time and IDs, and where to draw the testing boundary.

**When to read.** Writing time- or ID-dependent logic, designing dependency injection for a service, deciding what to test.

**Rules in this file.** §25, §26, §29

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `02-architecture.md` (ports as the natural injection seams), `05-domain-modeling.md` (Result types make assertions cleaner).

---

## §25. Do not hide time

Any time-dependent logic must receive a clock dependency.

This includes:

- quote TTL
- SLA deadlines
- cure periods
- 72-hour appeal windows
- renewal windows
- notification retries
- webhook retry backoff

### Good

```ts
const isExpired = quote.expiresAt <= deps.clock.now();
```

### Bad

```ts
const isExpired = quote.expiresAt <= new Date();
```

---

## §26. Do not hide randomness or IDs

ID generation should be injectable where it affects testability or business behavior.

### Good

```ts
const sowId = deps.idGenerator.sowId();
```

### Bad

```ts
const sowId = crypto.randomUUID();
```

Using `crypto.randomUUID()` directly inside thin adapters or infrastructure code is fine. Avoid it inside domain services that need deterministic tests.

---

## §29. Write tests through public boundaries

Test observable behavior, not private implementation details.

Good test targets:

- HTTP route behavior
- MCP tool behavior
- CLI command behavior
- domain service public function
- repository contract
- adapter contract against fake external service
- workflow handler behavior with fake clock

Avoid tests that assert private helper calls or internal state that users cannot observe.
