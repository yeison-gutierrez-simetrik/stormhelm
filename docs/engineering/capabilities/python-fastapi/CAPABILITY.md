---
name: python-fastapi
description: Python + FastAPI framework conventions. Inherits `python` capability.
extends: python
sonar:
  test_inclusions:
    - "features/**"
  coverage_exclusions:
    - "features/**"
  exclusions:
    - "alembic/versions/**"
    - "src/**/migrations/**"
---

# Capability: python-fastapi

Activated when the project uses FastAPI + Alembic. Inherits from `python`.

## `sonar:` frontmatter (PR-Sonar)

**Adds on top of `python`:**

- `test_inclusions` += `features/**` — pytest-bdd feature files (Cucumber for Python).
- `exclusions` += Alembic migrations + custom migration directories — generated/scaffolded code that shouldn't be quality-gated.
