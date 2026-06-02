---
name: typescript
description: Base TypeScript language capability — strict tsconfig, no `any`, Zod-at-boundary.
sonar:
  test_inclusions:
    - "src/**/*.test.ts"
    - "src/**/*.test.tsx"
    - "src/**/__tests__/**"
    - "src/test-support/**"
  coverage_exclusions:
    - "src/**/*.test.ts"
    - "src/**/*.test.tsx"
    - "src/test-support/**"
    - "src/entrypoints/**"
---

# Capability: typescript

This is the **base TypeScript capability**. Activated when a project sets `language: typescript` in its constitution C.3 or when `package.json` exists with TypeScript in deps.

Rules live in this directory:

- `03-style.md` — language-level rules (no `any`, no `as`, strict tsconfig).
- `11-async.md` — Promise / async-await conventions.
- `12-package-management.md` — pnpm conventions.

## `sonar:` frontmatter (PR-Sonar)

The `sonar:` block above declares what this capability contributes to a project's `sonar-project.properties` when `/setup` detects a SAST gate (Sonar / SonarCloud). The composer at `scripts/compose-sonar-properties.mjs` reads this block from every active capability and merges the contributions.

**This capability contributes:**
- `test_inclusions` — TypeScript test file conventions (vitest, jest, ava all use `*.test.ts`).
- `coverage_exclusions` — test files (don't measure coverage of test code) plus entry points (not testable).

Framework-specific capabilities (`typescript-hono`) may extend these with framework-aware paths like `features/**` for Cucumber.
