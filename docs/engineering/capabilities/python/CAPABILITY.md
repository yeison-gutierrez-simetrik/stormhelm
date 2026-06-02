---
name: python
description: Base Python language capability — strict mypy, Pydantic at boundaries, ruff.
sonar:
  test_inclusions:
    - "src/**/test_*.py"
    - "src/**/*_test.py"
    - "tests/**"
    - "src/test_support/**"
  coverage_exclusions:
    - "src/**/test_*.py"
    - "src/**/*_test.py"
    - "tests/**"
    - "src/test_support/**"
    - "src/entrypoints/**"
---

# Capability: python

Base Python capability (parity with `typescript`). Activated when `pyproject.toml` exists.

Rules in this directory mirror the TypeScript ones with `-py` suffix on the rule numbers (e.g. §5-py, §33-py).

## `sonar:` frontmatter (PR-Sonar)

Python conventions for test files (pytest defaults). The composer reads this and contributes to `sonar-project.properties` when the project has Sonar configured.
