---
name: setup
description: |
  Interactive wizard that configures Stormhelm for the current project. Asks about
  language, framework, persistence, deployment target, Ralph activation, and compliance
  needs, then generates a personalized AGENTS.md, installs hooks, and seeds template
  artifacts (constitution.md, CONTEXT.md, .planning/ directory).
  Use when: starting a new project, onboarding an existing project to Stormhelm,
  or changing the project's stack and needing to refresh active capabilities.
---

# /setup — Stormhelm Configuration Wizard

## Purpose

`/setup` personalizes Stormhelm for a specific project. It runs **once per project** (or whenever the stack changes substantially) and produces:

1. A personalized `docs/engineering/AGENTS.md` that lists only the rules active for the chosen stack.
2. Template artifacts in `docs/`: `constitution.md`, `CONTEXT.md`, `slos.md`, `events.md`.
3. A scaffolded `.planning/` directory with `budget.txt` and `ralph-sessions/` subfolder.
4. Pre-commit hooks configuration (gitleaks, linters, formatters).
5. The `ralph-local.sh` script tailored to the selected stack.
6. A README section in the project root documenting which capabilities are active.

## When to invoke

- First time adopting Stormhelm in a project.
- Adding a new bounded context with a different stack.
- Switching frameworks (e.g., Express → Hono).
- Upgrading capabilities when new ones ship.

## Execution flow

The skill is interactive. It asks 6-8 questions sequentially and uses each answer to determine the next question's options.

### Step 1 — Project context

```
? Project type:
  ○ Greenfield (new project, empty repository)
  ○ Brownfield (existing code, adopting Stormhelm now)

? Project name (used in headers, READMEs):
  > _______________________________________________

? Will multiple developers run Ralph against the same repo? [y/N]
  (Determines whether to set up worker-id partitioning per §11.11.1)
```

### Step 2 — Stack selection

Branching by primary language. Each branch activates one capability folder.

```
? Primary language:
  ○ TypeScript                          → capabilities/typescript activated
  ○ Python                              → capabilities/python activated
  ○ Go (capability pending)             → falls back to core only + warning
  ○ Multi-language (monorepo)           → multi-select below

? HTTP framework:
  IF TypeScript:
    ○ Hono                              → capabilities/typescript-hono activated
    ○ Fastify (capability pending)
    ○ Express (capability pending)
    ○ None / library-only
  IF Python:
    ○ FastAPI                           → capabilities/python-fastapi activated
    ○ Litestar (capability pending)
    ○ Django (capability pending)
    ○ None / library-only

? Persistence layer:
  IF TypeScript:
    ○ Drizzle ORM                       → enables §44 Drizzle rules
    ○ Prisma (capability pending)
    ○ Raw SQL
    ○ None
  IF Python:
    ○ SQLAlchemy 2.x (async)            → enables §44-py SQLAlchemy rules
    ○ SQLModel (capability pending)
    ○ Raw SQL (asyncpg / psycopg)
    ○ None

? Validation library:
  IF TypeScript:
    ○ Zod                               → enables §39, §4 examples
    ○ Yup / Valibot (capability pending)
    ○ Custom
  IF Python:
    ○ Pydantic v2                       → enables §39-py, §4 examples
    ○ msgspec (capability pending)
    ○ attrs + cattrs (capability pending)
    ○ Custom

? Type checker (Python only):
  IF Python:
    ○ pyright --strict                  → enables §5-py..§7-py enforcement
    ○ mypy --strict
    ○ pyrefly
```

### Step 3 — Runtime and deployment

```
? Deployment target (multi-select):
  IF TypeScript:
    □ Node.js                             → §55 Node-specific notes activated
    □ Bun
    □ Deno
    □ Cloudflare Workers                  → §55 + §51 waitUntil patterns activated
    □ AWS Lambda
  IF Python:
    □ uvicorn (dev / single worker)       → §55-py dev entrypoint
    □ gunicorn + uvicorn workers (prod)   → §55-py multi-worker, lifespan per worker
    □ hypercorn (HTTP/2, HTTP/3, WS)
    □ AWS Lambda via Mangum / LWA         → §55-py cold-start entrypoint
```

### Step 4 — Operational mode

```
? Enable Ralph (AFK Night Shift)? [Y/n]
  IF yes:
    ? Maximum AFK budget per night (tokens): [default: 500000]
    ? Workers in parallel: [default: 1]
    ? Sandbox mode:
      ○ Docker (recommended)
      ○ VM
      ○ None (development only)
```

### Step 5 — Compliance

```
? Compliance requirements (multi-select, affects which §84-§90 enforcements are mandatory):
  □ SOC2                                → enables retention §62 + audit logs
  □ ISO 27001                           → enables §87 threat modeling required
  □ EU AI Act                           → enables §62 traceability matrix mandatory
  □ GDPR                                → enables §79 strict PII rules
  □ HIPAA                               → enables additional encryption rules
  ☑ None of the above                   → security rules become recommended, not blocking
```

### Step 6 — Vocabulary seed

```
? Provide the project vocabulary (you can edit CONTEXT.md later).
  Enter 5-15 core domain terms separated by commas:
  > Customer, Order, Product, Cart, Payment, ...
```

## Output: generated files

### `docs/engineering/AGENTS.md` (personalized)

Generated from the template, including only the activated capability sections. Header is rewritten:

```markdown
# AGENTS.md — <ProjectName> Engineering Rules

Stack: TypeScript + Hono + Drizzle + Zod
Capabilities active: core, typescript, typescript-hono
Generated by Stormhelm /setup on <date>

[... rule index from template, filtered to active capabilities ...]
```

### `docs/constitution.md` (template)

```markdown
# <ProjectName> Constitution

> Principles that override everything else. Never compromised by tactical decisions.

## C.1 Architecture
Layer-first hexagonal architecture (§3). Domain layer has zero infrastructure imports.

## C.2 Coverage minimums
- Domain layer: 90% line coverage
- Application layer: 80%
- Infrastructure adapters: 60%

## C.3 Security defaults
[autogenerated based on compliance answers — SOC2 enables retention, GDPR enables PII rules, etc.]

## C.4 Naming
PRD vocabulary is authoritative. Terms from the seed: <list from Step 6>.

[... template continues ...]
```

### `docs/CONTEXT.md` (template)

```markdown
# Ubiquitous Language

> Single source of truth for domain vocabulary. Used by humans and agents (§22).
> Every term carries an `_Avoid_:` line listing rejected alternatives, so drift is detectable.

## Terms

**Customer** — _Define here_
_Avoid_: _list rejected wordings here, e.g., "user", "client", "account"_.

**Order** — _Define here_
_Avoid_: _e.g., "purchase", "transaction"_.

[... seed terms from Step 6, each with its own `_Avoid_:` line ...]

## Bounded contexts
- _List the bounded contexts of the project_

## Anti-vocabulary (deprecated terms, do not use)
- _Add terms that were once canonical and are now retired here. Prefer adding `_Avoid_:` to the replacing term._
```

### `docs/slos.md` (template)

```markdown
# Service Level Objectives

> Declared per public endpoint and per critical command. See §81.

(empty — populated as endpoints are added)
```

### `.planning/budget.txt`

```
500000
```

### All required directories scaffolded

`/setup` creates every directory that downstream skills assume exists. Each gets a `.keep` file so the empty directory persists in Git (or is gitignored where appropriate). The full list:

**Versioned in Git (production artifacts):**

```
docs/specs/.keep                     # consumed by /specify, /clarify, /to-issues, /plan
docs/adr/.keep                       # consumed by /domain-model, /strangler-plan, /constitution
docs/audit/.keep                     # consumed by /traceability-matrix
docs/postmortems/.keep               # consumed by /postmortem, /debug (template lives in skills/postmortem/references/)
docs/architecture/.keep              # consumed by /sad (derived snapshots, regenerated)
docs/architecture/INDEX.md           # one-line entry per generated SAD
docs/threat-models/.keep             # consumed by /security-hardening
docs/perf-baselines/.keep            # consumed by /optimize, /traceability-matrix
features/.keep                       # consumed by /to-scenarios, /run-acceptance
issues/.keep                         # consumed by /to-issues, /plan, Ralph
```

**Durable rationale (tracked — see `docs/decisions/README.md`):**

```
docs/decisions/grilling/.keep        # /grill-me transcripts (PR-I)
docs/decisions/open-questions/.keep  # questions deferred to stakeholders
docs/decisions/clarify-logs/.keep    # /clarify pass outputs
```

**Gitignored (ephemeral working state):**

```
.planning/budget.txt                 # token budget for Ralph
.planning/ralph-sessions/.keep       # Ralph session logs (§69)
.planning/grilling-docs/.keep        # /grill-with-docs brownfield reconnaissance reports
.planning/acceptance/.keep           # /run-acceptance reports (kept until merge)
.planning/reviews/.keep              # /code-review (reviewer agent) reports
.planning/security-audits/.keep      # /security-hardening reports
.planning/diagnoses/.keep            # /diagnose reports
.planning/characterizations/.keep    # /characterization-tests reports
.planning/impact/.keep               # /impact-analysis reports
.planning/architecture-reviews/.keep # /improve-codebase-architecture reports
.planning/prototypes/.keep           # /prototype throwaway code (LEARNING.md goes to docs/prototypes/)
.planning/consistency/.keep          # /check-consistency reconciliation reports
```

The script:

```bash
mkdir -p \
  docs/{specs,adr,audit,postmortems,threat-models,perf-baselines,architecture} \
  docs/decisions/{grilling,open-questions,clarify-logs} \
  features issues \
  .planning/{ralph-sessions,grilling-docs,acceptance,reviews,security-audits,diagnoses,characterizations,impact,architecture-reviews,prototypes,consistency}

for d in docs/specs docs/adr docs/audit docs/postmortems docs/threat-models docs/perf-baselines docs/architecture \
         docs/decisions/grilling docs/decisions/open-questions docs/decisions/clarify-logs \
         features issues \
         .planning/ralph-sessions .planning/grilling-docs .planning/acceptance \
         .planning/reviews .planning/security-audits .planning/diagnoses .planning/characterizations \
         .planning/impact .planning/architecture-reviews .planning/prototypes .planning/consistency; do
  touch "$d/.keep"
done

# Templates now live inside each skill (skills/<skill>/references/). Skills read them in place;
# /setup no longer copies the postmortem template into the project tree.
cp "$STORMHELM_PATH/docs/events.md"               docs/events.md
cp "$STORMHELM_PATH/docs/audit/incidents.md"      docs/audit/incidents.md

# .gitignore additions for ephemeral directories
cat >> .gitignore <<'EOF'

# Stormhelm ephemeral working state
.planning/
.claude/webfetch-cache/
EOF
```

This ensures every downstream skill's `mkdir -p` is defensive but not required for first-time correctness.

### `ralph-local.sh`

Tailored to the stack. For TypeScript + Hono + Drizzle + Zod, the script includes:

```bash
# Test commands chosen for the stack
TEST_CMD="pnpm test"
ACCEPTANCE_CMD="pnpm test:acceptance"
LINT_CMD="pnpm lint"
TYPECHECK_CMD="pnpm typecheck"
COVERAGE_CMD="pnpm test:coverage"
```

For Python + FastAPI + SQLAlchemy + Pydantic:

```bash
TEST_CMD="uv run pytest"
ACCEPTANCE_CMD="uv run behave"
LINT_CMD="uv run ruff check"
TYPECHECK_CMD="uv run pyright --strict"
COVERAGE_CMD="uv run pytest --cov"
```

> For any TypeScript stack the package manager is `pnpm` per §117. The setup wizard rejects projects that contain `package-lock.json` or `yarn.lock` and offers to convert them; lifecycle scripts are blocked by default per §118 — the wizard seeds an empty `pnpm.onlyBuiltDependencies` allowlist in `package.json`.
>
> For any Python stack the package manager is `uv` per §117-py. The wizard rejects projects that contain `Pipfile`, `poetry.lock`, or `requirements.txt` (as source) and offers to convert them; build hooks are blocked by default per §118-py — the wizard adds `[tool.uv] no-build-package = ["*"]` to `pyproject.toml` and seeds an empty `build-package` allowlist.

### `.claude/settings.json` — MCP servers

The setup wizard writes an `mcpServers` block enabling the Context7 MCP (§122) so agents can fetch current library documentation instead of relying on training-data memory:

```jsonc
{
  "permissions": { /* ... */ },
  "hooks": { /* ... */ },
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"]
    }
  }
}
```

The wizard asks whether to enable Context7 (default: yes for any project that declares a third-party library in its stack). When declined, §122 falls back to `WebFetch` against official docs URLs, cached by the WebFetch hook (§108).

### `.gitleaks.toml`

Pre-populated with rules for the chosen integrations (Stripe if mentioned, AWS if Lambda selected, etc.).

### `.pre-commit-config.yaml`

```yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks
  # ... language-specific hooks based on stack
```

## Validation step

After generation, the skill runs a self-check:

1. Verify every `§N` referenced in the generated `AGENTS.md` exists in a file present in the project.
2. Verify pre-commit hooks installed successfully.
3. Verify `.planning/` is writable.
4. Print a summary:

```
✅ Stormhelm configured for <ProjectName>

Active capabilities:
  - core (every §N living in `docs/engineering/core/*.md` — currently 97 rules: §1–§4, §11–§32, §34–§37, §45–§49, §56–§107, §108–§116, §122; the rest is stack-specific)
  - typescript (§5–§10, §33, §50–§55, §117–§121)        ← if TS selected
  - typescript-hono (§38–§44)                            ← if Hono selected
  - python (§5-py–§10-py, §33-py, §50-py–§55-py,
           §117-py–§121-py)                              ← if Python selected
  - python-fastapi (§38-py–§44-py)                       ← if FastAPI selected

Active rules: §1–§122 (plus -py twins where Python is active)
Compliance mode: SOC2 + GDPR
Ralph: enabled, 1 worker, 500k token budget/night

Next steps:
  1. /onboard           — learn the workflow
  2. Edit docs/CONTEXT.md to flesh out vocabulary
  3. Run /constitution to formalize project principles
  4. Try your first feature: /grill-me "describe your first feature"
```

## Re-running `/setup`

`/setup` is **idempotent for additions** but **prompts before overwrites**. If `docs/engineering/AGENTS.md` already exists:

```
⚠️ docs/engineering/AGENTS.md already exists.

Choose:
  ○ Replace with fresh generation (current edits lost)
  ○ Merge (add new capability sections, preserve existing customizations)
  ○ Diff (show what would change, do not modify)
  ○ Cancel
```

## Non-destructive

`/setup` never:

- Deletes existing source code.
- Modifies committed `.feature` files (§58).
- Force-pushes any branch.
- Removes existing `.git/hooks/*` without backing them up to `.git/hooks/backup-<timestamp>/`.

## Future extensions

Capabilities will be addable as plugins. The roadmap (see README) defines the order: `typescript-fastify` → `go` → `go-echo`. Each new capability registers itself by adding a folder under `capabilities/<stack>/` and an entry in `/setup`'s decision tree.

Adding a new capability does **not** require modifying `core/` rules or existing capabilities.
