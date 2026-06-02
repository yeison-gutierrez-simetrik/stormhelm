# feat(sonar): capability-driven SAST config (PR-Sonar / FW-6)

## TL;DR

Each capability declares its `sonar-project.properties` contributions in YAML frontmatter. The composer reads active capabilities, resolves `extends:` topologically, and emits a `sonar-project.properties` file. Belong's exact patterns become a **test fixture**, not a default template.

## Motivating incident

belong-marketplace slice 01: the actual merge gate was SonarCloud, not semgrep. Belong had to hand-write classification rules in `sonar-project.properties`:

- Classify `features/**` (Cucumber feature files) and `src/test-support/**` as tests so hardcoded test passwords don't get flagged as "C Security Rating".
- Exclude drizzle-kit migrations and Better Auth's generated `auth-schema.ts` as not-hand-written code.

None of this was modeled in the framework — every project would reinvent the same classification mapping. The framework's SAST story was just "semgrep", which doesn't match real production CI.

## What changes

**New `CAPABILITY.md` per capability** (4 total: typescript, typescript-hono, python, python-fastapi):

```yaml
---
name: typescript-hono
extends: typescript
sonar:
  test_inclusions:
    - "features/**"
  exclusions:
    - "src/**/migrations/**"
    - "src/**/schema/*-schema.ts"
---
```

Each capability declares contributions to:

- `test_inclusions` — what Sonar should treat as tests (vitest patterns, pytest patterns, Cucumber `features/**`).
- `coverage_exclusions` — tests + non-testable entry points.
- `exclusions` — ORM-generated migrations + scaffolded schema files.

**New `scripts/compose-sonar-properties.mjs`** (~190 LOC, zero-deps):

```bash
# Compose for a project using typescript-hono (auto-resolves extends to typescript)
node scripts/compose-sonar-properties.mjs typescript-hono > sonar-project.properties

# Check mode: verify composer output matches a golden file (for CI fixtures)
node scripts/compose-sonar-properties.mjs --check expected.properties typescript-hono
```

Includes a tiny YAML-frontmatter parser (no external dep) and topological `extends:` resolution. Per-project keys (`projectKey`, `organization`, lcov reportPaths) are NOT composed; they live as a project header above the composed section.

## Why capability-driven and not a template

Per the belong author's design feedback (response round 4): the classification is **stack-driven** (cucumber + vitest + drizzle + better-auth), not project-driven. Hardcoding belong's `sonar-project.properties` as a Stormhelm default would lock other projects into that exact stack. A composer that reads capability metadata works for any stack combination.

Belong's verbatim patterns become a **golden test fixture** (`--check` mode) validating that the abstraction produces the right output for that capability set — not the default for everyone.

## What is NOT in this PR

- Integration into `/setup` to auto-detect Sonar and run the composer (follow-up; depends on `/setup` capability-detection logic).
- Composer integration with the `reviewer` agent or `/security-hardening` (Sonar findings as a gate). These are documented in §85/§86 as separate work.

## Acceptance

- [x] Composing for `typescript-hono` (extends `typescript`) produces:
  - `sonar.tests=src,features`
  - test_inclusions covering vitest patterns + `features/**` + `src/test-support/**`.
  - exclusions covering ORM migrations + generated schema files.
- [x] Composing for `python-fastapi` (extends `python`) produces the parallel structure with pytest patterns.
- [x] `--check` mode correctly compares against a golden file (ignoring comment lines).
- [x] Framework linter green after merge.

## Notes for the reviewer

- The YAML parser is intentionally minimal — handles only what the framework needs (scalar keys, one nested `sonar:` block, lists). If a future capability needs more YAML features, extend deliberately.
- `extends:` chains are resolved topologically; circular extends would loop, but the framework's capabilities form a tree by convention.
- The capability `CAPABILITY.md` file is a new convention — it lives at the root of each `capabilities/<name>/` directory and is the natural home for capability-level metadata. The composer reads only the `sonar:` block today, but more metadata can be added (e.g. for PR-M's section taxonomy in ADR-0002).

Refs:
- belong-marketplace `.planning/framework-feedback/slice01-part2-tdd-to-merge.md` (FW-6).
- belong-marketplace `.planning/framework-feedback/housekeeping-close.md` (capability-driven design + golden patterns).
