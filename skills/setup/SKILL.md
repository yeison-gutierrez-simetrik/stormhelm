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

> **No ceremony "mode" prompt — by design (ADR-0002).** Compliance scope (above) is project-level and sets which `§84-§90` enforcements are mandatory. **Ceremony level is NOT a project setting** — there is intentionally no "lightweight vs compliance track" toggle. How much process a feature carries is *derived per feature* by detectors (`scripts/detect-ceremony.mjs` + the sensitive-path scan) and recorded as labels, escalated one-way and gated by `INV-6`. A project-level toggle was considered and rejected (stickiness toward permanent opt-out; wrong granularity — sensitivity is a property of the feature, not the project). See ADR-0002 and `docs/WORKFLOWS-GUIDE.md` §1.

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
scripts/<consumer-runtime>.mjs       # copied from $STORMHELM_PATH (see below) — skills invoke these by relative path
.claude/hooks/*.js                   # copied from $STORMHELM_PATH (see below) — wired in .claude/settings.json per §113
.claude/hooks/README.md              # install + per-hook config reference
ralph-local.sh                       # Night Shift entry point (materialized from template; tailored to stack)
ralph-lib.sh                         # Night Shift engine — sourced by ralph-local.sh (verbatim)
ralph-blocked-comment.md.tmpl        # rendered by ralph-lib on block (verbatim)
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

# Consumer-runtime scripts. Shipped skills/hooks invoke these by RELATIVE path
# (`node scripts/<x>.mjs`, resolved against the consumer repo root), so they must
# live in the consumer repo — not only in $STORMHELM_PATH. Without this step every
# gate that runs `node scripts/...` (preflight, invariants, merge-safety, slice
# grouping, ceremony detection, closed-set sync, Sonar compose) fails on a
# freshly-adopted project. check-framework-metadata.mjs is framework-self-
# maintenance and is intentionally NOT copied. See CLAUDE.md "scripts/ taxonomy".
#
# When adding a new scripts/*.mjs that a shipped skill or hook invokes by relative
# path, add it here AND to the validation `ls` below — otherwise it ships broken.
mkdir -p scripts
for s in preflight.mjs check-invariants.mjs check-merge-safety.mjs \
         group-slice-issues.mjs parse-layers-affected.mjs detect-ceremony.mjs \
         sync-closed-sets.mjs compose-sonar-properties.mjs; do
  cp "$STORMHELM_PATH/scripts/$s" "scripts/$s"
done

# Consumer-runtime hooks. Installed at `${CLAUDE_PROJECT_DIR}/.claude/hooks/<x>.js`
# — the conventional Claude Code project-hook location, matching the README Phase 0
# adoption path and existing consumers; the `.claude/settings.json` wiring below
# references it. All 5 are consumer-runtime: git-guardrails.js is mandatory whenever
# Ralph runs; the other four are opt-in (§113). They are copied here; wiring them is
# the settings.json step below. Same "broken on adoption if missing" class as scripts.
mkdir -p .claude/hooks
cp "$STORMHELM_PATH"/hooks/*.js  .claude/hooks/
cp "$STORMHELM_PATH/hooks/README.md" .claude/hooks/README.md   # install + per-hook config reference
chmod +x .claude/hooks/*.js

# Provenance stamp (cheap, optional): record which framework commit each copied
# script/hook came from, so a later re-sync (see "Re-running /setup") can tell what
# is stale without a live link to the framework. Inserted after a shebang if present,
# else at the top. awk is portable (the sed -i flag differs across macOS/Linux). The
# rule drops any pre-existing `// stormhelm:` line first, so it is **idempotent** —
# safe to re-run on already-stamped files (a re-sync re-copies pristine files anyway).
SH="$(git -C "$STORMHELM_PATH" rev-parse --short HEAD 2>/dev/null || echo unknown)"
for f in scripts/*.mjs .claude/hooks/*.js; do
  awk -v s="// stormhelm: $SH" '/^\/\/ stormhelm:/{next} NR==1&&/^#!/{print;print s;st=1;next} !st{print s;st=1} {print}' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done
chmod +x .claude/hooks/*.js   # re-assert after rewrite

# Night Shift engine (Ralph). `ralph-local.sh` SOURCES `ralph-lib.sh` and RENDERS
# `ralph-blocked-comment.md.tmpl` — all three must be CO-LOCATED or the loop aborts
# on entry ("ralph-lib.sh no encontrado"). Deliver all three to the project root,
# matching the documented `./ralph-local.sh <issue>` usage. ralph-lib.sh + the comment
# template are verbatim (the shared engine); ralph-local.sh is the materialization base
# whose TEST_CMD/ACCEPTANCE_CMD/... the wizard tailors to the stack (see "ralph-local.sh"
# below). Without this step, the autonomous Night Shift is broken on first run.
cp "$STORMHELM_PATH/templates/ralph-lib.sh"                  ralph-lib.sh
cp "$STORMHELM_PATH/templates/ralph-blocked-comment.md.tmpl" ralph-blocked-comment.md.tmpl
cp "$STORMHELM_PATH/templates/ralph-local.sh.tmpl"           ralph-local.sh
chmod +x ralph-local.sh

# .gitignore additions for ephemeral directories
cat >> .gitignore <<'EOF'

# Stormhelm ephemeral working state
.planning/
.claude/webfetch-cache/
EOF
```

This ensures every downstream skill's `mkdir -p` is defensive but not required for first-time correctness.

### `ralph-local.sh`

Delivered to the **project root** alongside its engine `ralph-lib.sh` and `ralph-blocked-comment.md.tmpl` (the copy step above) — all three must stay co-located; `ralph-local.sh` sources the lib and renders the template by `SCRIPT_DIR`. The wizard tailors the test-command block to the stack. For TypeScript + Hono + Drizzle + Zod, the script includes:

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

### `.claude/settings.json` — hooks + MCP servers

The wizard writes the `hooks` wiring **and** an `mcpServers` block. Hooks were copied to `.claude/hooks/` above; they are **registered here** — Claude Code does not auto-discover them. Registration is per **§113** (`docs/engineering/core/19-hooks-and-runtime-guards.md`), which is the **canonical wiring reference**; keep this block in sync with it. The commands reference `${CLAUDE_PROJECT_DIR}/.claude/hooks/<hook>.js`. `git-guardrails.js` is wired **always** (mandatory whenever Ralph runs, §68); the other four are **opt-in** (§113) — the wizard enables the sensible defaults below, each individually removable:

```jsonc
{
  "permissions": { /* ... */ },
  "hooks": {
    "PreToolUse": [
      { "matcher": "Bash",     "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/git-guardrails.js" }] },
      { "matcher": "WebFetch", "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-pre.js" }] }
    ],
    "PostToolUse": [
      { "matcher": "WebFetch",             "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/webfetch-cache-post.js" }] },
      { "matcher": "*",                    "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/context-monitor.js" }] },
      { "matcher": "Write|Edit|MultiEdit", "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/closed-set-check.js" }] }
    ]
  },
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
4. Verify the consumer-runtime scripts copied: `ls scripts/preflight.mjs scripts/check-invariants.mjs scripts/check-merge-safety.mjs scripts/group-slice-issues.mjs scripts/parse-layers-affected.mjs scripts/detect-ceremony.mjs scripts/sync-closed-sets.mjs scripts/compose-sonar-properties.mjs` all resolve — otherwise every `node scripts/...` gate would fail at first use.
5. Verify the hooks copied and wired: `ls .claude/hooks/git-guardrails.js .claude/hooks/closed-set-check.js .claude/hooks/context-monitor.js .claude/hooks/webfetch-cache-pre.js .claude/hooks/webfetch-cache-post.js` all resolve, and `.claude/settings.json` registers at least `git-guardrails.js` under `hooks.PreToolUse` (matcher `Bash`, §68/§113) pointing at `${CLAUDE_PROJECT_DIR}/.claude/hooks/git-guardrails.js` — otherwise the destructive-git guard is silently absent.
6. Verify the Night Shift engine is co-located + sound: `ls ralph-local.sh ralph-lib.sh ralph-blocked-comment.md.tmpl` all resolve at the project root, and `bash -n ralph-local.sh` parses — otherwise `./ralph-local.sh <issue>` aborts on entry with "ralph-lib.sh no encontrado" and the autonomous Night Shift never runs.
7. Print a summary:

```
✅ Stormhelm configured for <ProjectName>

Active capabilities:
  - core (every §N living in `docs/engineering/core/*.md` — currently 98 rules: §1–§4, §11–§32, §34–§37, §45–§49, §56–§107, §108–§116, §122–§123; the rest is stack-specific)
  - typescript (§5–§10, §33, §50–§55, §117–§121)        ← if TS selected
  - typescript-hono (§38–§44)                            ← if Hono selected
  - python (§5-py–§10-py, §33-py, §50-py–§55-py,
           §117-py–§121-py)                              ← if Python selected
  - python-fastapi (§38-py–§44-py)                       ← if FastAPI selected

Active rules: §1–§123 (plus -py twins where Python is active)
Hooks: git-guardrails (mandatory) + webfetch-cache, context-monitor, closed-set-check (opt-in, §113)
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

### Re-syncing copied framework artifacts

The framework is adopted by **copying** files (README Phase 0 + the copy step above): `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`, `scripts/`, and `docs/engineering/`. Those copies **drift** as the upstream framework evolves — there is no live link, and post-adoption the consumer no longer has `$STORMHELM_PATH` (it was a throwaway clone). The provenance stamp (`// stormhelm: <sha>`) in each copied script/hook records the version it came from. To refresh an adopted project to a newer framework version:

1. **Re-clone the framework** at the target version: `git clone … /tmp/stormhelm` (set `STORMHELM_PATH=/tmp/stormhelm`).
2. **Overwrite the framework-owned artifacts only:**
   - `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` (+ `hooks/README.md`)
   - the consumer-runtime `scripts/` set (the `for s in …` list above) — re-stamped automatically
   - `docs/engineering/` (the `§N` rules), then re-run the AGENTS.md generation (it prompts before overwriting your personalized index).
3. **Never touch product-owned artifacts** — these are yours, the framework does not own them:
   `docs/constitution.md`, `docs/CONTEXT.md`, `docs/slos.md`, `docs/specs/`, `docs/adr/`, `docs/decisions/`, `docs/audit/`, `features/`, `issues/`, `src/`, and your `.claude/settings.json` customizations.
4. **Verify:** `node scripts/check-invariants.mjs` + your test suite still pass; the stamps now show the new `<sha>`.

The split **is** the rule: *framework-owned → overwrite on re-sync; product-owned → never touched.* (A `/setup --resync` flag that automates steps 2-3 with exactly this allow/deny split is a candidate; until it ships, this is the manual procedure — the same discipline applied by hand in real adoptions.)

## Non-destructive

`/setup` never:

- Deletes existing source code.
- Modifies committed `.feature` files (§58).
- Force-pushes any branch.
- Removes existing `.git/hooks/*` without backing them up to `.git/hooks/backup-<timestamp>/`.

## Future extensions

Capabilities will be addable as plugins. The roadmap (see README) defines the order: `typescript-fastify` → `go` → `go-echo`. Each new capability registers itself by adding a folder under `capabilities/<stack>/` and an entry in `/setup`'s decision tree.

Adding a new capability does **not** require modifying `core/` rules or existing capabilities.
