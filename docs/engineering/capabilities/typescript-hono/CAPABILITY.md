---
name: typescript-hono
description: TypeScript + Hono web framework conventions. Inherits `typescript` capability.
extends: typescript
sonar:
  test_inclusions:
    - "features/**"
  coverage_exclusions:
    - "features/**"
  exclusions:
    - "src/**/migrations/**"
    - "src/**/schema/*-schema.ts"
---

# Capability: typescript-hono

Activated when the project uses Hono. Inherits from `typescript`; the composer merges this capability's `sonar` block on top of the base capability's.

Rules live in this directory:

- `09-stack-conventions.md` — Hono routing, middleware, port/adapter layout.

## `sonar:` frontmatter (PR-Sonar)

**Adds on top of `typescript`:**

- `test_inclusions` += `features/**` — Cucumber feature files are tests too. When Sonar's per-file analysis sees `features/**/*.feature` content (Gherkin) or step-definition files, they should be classified as tests, not production code. Without this, Sonar flags throwaway credentials in Cucumber fixtures as security risks.
- `coverage_exclusions` += `features/**` — the same acceptance glue must also be excluded from coverage, mirroring the base `typescript` capability which already excludes its `*.test.ts`/`test-support` from coverage. Without this, `features/**` is classified as tests but still demanded to have coverage, which is incoherent.
- `exclusions` += migrations + generated `*-schema.ts` files — ORM-generated code (e.g. Drizzle migrations, Better Auth's `auth-schema.ts`) is not hand-written and should be excluded from quality gates entirely.

Project-specific tooling (e.g. Drizzle vs Prisma, Cucumber vs Mocha) can be configured project-local by editing the composed `sonar-project.properties` after `/setup`.
