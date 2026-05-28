# Stormhelm

> *"A smooth sea never made a skilled sailor."*

**Stormhelm** is an engineering harness for building software with AI coding agents — primarily Claude Code. It is a set of skills, sub-agents, hooks, and stable numbered rules that codify the discipline a senior developer would apply when working with AI.

The name combines two ideas: the **helm** — the wheel that keeps a ship on course — and the **storm** that surrounds modern AI-assisted development: vibe coding, context rot, runaway agents, hallucinated code, audit-less changes. Stormhelm is what you hold when the autopilot can't see the rocks. **The developer stays at the helm; the agents are the crew.**

---

## TL;DR — what you get

- **31 invokable skills** (`/grill-me`, `/specify`, `/to-issues`, `/tdd`, `/run-acceptance`, `/debug`, `/optimize`, `/postmortem`, `/sad`, `/check-consistency`, `/verify-framework-consistency`, …) that drive a disciplined workflow inside Claude Code.
- **122 numbered rules** (`§1 – §122`) that govern architecture, testing, security, supply chain, observability, and AFK operations. Skills load only the rules relevant to the task.
- **A sub-agent** (`reviewer`) that audits diffs in a fresh context and cites rule numbers in its findings.
- **Five Claude Code hooks** that cache `WebFetch`, monitor context size, route a graceful handoff before compaction, block destructive shell commands via `git-guardrails.js` (§68), and warn on closed-set/doc drift via `closed-set-check.js` (§36).
- **A capability system** with `capabilities/typescript` + `capabilities/typescript-hono` and `capabilities/python` + `capabilities/python-fastapi` shipped. Each capability activates only when your project uses that stack.
- **MCP convention**: Context7 wired by default so agents verify third-party APIs against current docs instead of inventing them from training-data memory.
- **A workflow from 0 to 100**: project init → grilling → spec → scenarios → issues → plan → TDD → acceptance → review → release with audit trail.

---

## The mental model: Day Shift and Night Shift

Stormhelm partitions work into two operating modes:

```
DAY SHIFT (human + agent, interactive)
  /constitution → /grill-me → /domain-model → /specify → /clarify
                                                   ↓
                                          (/prototype if needed)
                                          (/sad if scope is large)
                                                   ↓
                                          /to-scenarios   ← HUMAN CHECKPOINT #1
                                                   ↓
                                          /to-issues → /plan

NIGHT SHIFT (Ralph, autonomous, local)
  ralph-local.sh
   └─ for each issue labeled `ralph-ready` + `scenarios:scn-NNN`
        ├─ /tdd                       (red-green-refactor)
        ├─ /run-acceptance            (gate: all @release scenarios pass)
        ├─ /code-review               (reviewer agent, read-only, fresh context)
        ├─ /security-hardening        (if `require-human-review` label)
        └─ gh pr create --draft

DAY SHIFT next morning
  Human reviews drafts → /traceability-matrix → merge
                                                   ↓
                                          /check-consistency
                                          (catches cross-artifact drift)
```

The Day Shift is where decisions get made and recorded. The Night Shift is where mechanical execution happens within the boundaries the Day Shift set.

> **Night Shift status:** production-ready. The shipped `templates/ralph-local.sh.tmpl` + `templates/ralph-lib.sh` implement §63 (label gate), §65 (max-iterations), §66 (reviewer agent invocation pre-PR + `ralph-blocked` automation with structured comment), §67 (draft PR), §68 (git-guardrails `PreToolUse` hook), §69 (NDJSON session logs in `.planning/ralph-sessions/`), and §70 (exponential backoff on HTTP 429). The first-overnight canary procedure is documented in `docs/runbooks/ralph-first-overnight-canary.md`; the full contract is `docs/specs/ralph-hardening.md`.

---

## 0 to 100: the full flow

### Phase 0 — Adopt Stormhelm in a project (one-time)

```bash
# Clone Stormhelm to a temp location
git clone https://github.com/yeison-gutierrez-simetrik/stormhelm.git /tmp/stormhelm

# In your project
mkdir my-project && cd my-project
git init

# Copy what Claude Code needs into .claude/
mkdir -p .claude
cp -R /tmp/stormhelm/skills  .claude/skills
cp -R /tmp/stormhelm/agents  .claude/agents
cp -R /tmp/stormhelm/hooks   .claude/hooks

# Copy the engineering rules + workflow guide
mkdir -p docs
cp -R /tmp/stormhelm/docs/engineering  docs/engineering
cp /tmp/stormhelm/docs/WORKFLOWS-GUIDE.md docs/

# Minimal .claude/settings.json (hooks, permissions, Context7 MCP)
cat > .claude/settings.json <<'EOF'
{
  "permissions": {
    "allow": ["Read", "Grep", "Glob", "Edit", "Write", "Bash(git:*)", "Bash(gh:*)", "Bash(pnpm:*)"]
  },
  "hooks": {
    "PreToolUse":  [
      { "matcher": "WebFetch", "hooks": [{ "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/webfetch-cache-pre.js" }] },
      { "matcher": "Bash",     "hooks": [{ "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/git-guardrails.js" }] }
    ],
    "PostToolUse": [
      { "matcher": "WebFetch", "hooks": [{ "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/webfetch-cache-post.js" }] },
      { "matcher": "*",        "hooks": [{ "type": "command", "command": "node $CLAUDE_PROJECT_DIR/.claude/hooks/context-monitor.js" }] }
    ]
  },
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
  }
}
EOF
```

Then inside Claude Code:

```
> /setup        # configure for your stack (TS+Hono, Python+FastAPI, etc.)
> /constitution # establish project's non-negotiable tenets
> /onboard      # 5-minute walkthrough of the workflow
```

`/setup` generates a personalized `docs/engineering/AGENTS.md` containing only the rules active for your chosen stack, seeds the `docs/` skeleton (`CONTEXT.md` with `_Avoid_:` format, `slos.md`, `events.md`, `constitution.md` stub, `architecture/INDEX.md`), creates `.planning/` for ephemeral working state, and materializes `ralph-local.sh` from `templates/ralph-local.sh.tmpl` + `templates/ralph-lib.sh` tailored to your stack, budget, and worker count.

`/constitution` walks you through writing `docs/constitution.md` — the non-negotiable principles that override every other rule for this specific project (e.g., "no PII ever leaves region X", "p99 < 500ms is sacred").

---

### Phase 1 — Greenfield feature: 0 to draft PR

The full chain end-to-end. Most users run it via the single `/feature "..."` orchestrator; the manual path below makes every step inspectable.

#### 1. Grill the request — `/grill-me "<feature description>"`

The agent asks 10-120 questions in **multiple-choice format with recommendation** (one option marked ✅, rationale per option, `Other / correction` last). The transcript lands in `.planning/grilling/<slug>-<YYYYMMDD>.md` preserving every rejected option (these become free `Considered Options` for any ADR that follows).

Format spec: `skills/grill-me/references/transcript-format.md`.

**Output**: shared mental model + open-questions file for blockers needing stakeholders.

#### 2. Resolve vocabulary — `/domain-model`

Extracts domain nouns/verbs from the grilling, settles them in `docs/CONTEXT.md`. Every term gets an `_Avoid_:` line listing the rejected alternatives — drift later becomes detectable.

**Output**: updated `CONTEXT.md` + ADRs in `docs/adr/` when a vocabulary choice locks an architectural decision.

#### 3. Capture intent — `/specify`

Produces `docs/specs/<feature-slug>.md` in pure business language: Why, Actors, User stories, FRs, NFRs, Out of scope. **No technical detail** — endpoints, schemas, libraries live in `/plan`.

Format spec: `skills/specify/references/spec-format.md`.

**Status**: `Draft`.

#### 4. Scrub ambiguity — `/clarify`

Walks Step 1b's systematic ambiguity checklist (units, boundaries, state machines, defaults, error semantics, concurrency, tenancy, compliance) and asks **multiple-choice questions** for each ambiguity found. The clarifications log preserves both chosen and rejected interpretations.

Format spec: `skills/clarify/references/clarifications-log-format.md`.

**Off-ramps**:
- If an ambiguity's resolution depends on technical feasibility → `/prototype` to produce evidence, return here.
- If the feature crosses ≥3 modules or introduces a new bounded context → `/sad` to assemble the architecture snapshot.

**Status transition**: `Draft → Clarified`.

#### 5. (Optional) Validate via spike — `/prototype`

Throwaway code that exists only to answer one question. Lives in `.planning/prototypes/<slug>/` (gitignored). The persistent artifact is the `LEARNING.md` (recorded in `docs/prototypes/` for evidence).

Hard time-box: 30–90 minutes. If the answer isn't clearer after 90 min, the question was wrong — return to `/grill-me`.

#### 6. (Optional) Assemble architecture snapshot — `/sad`

Closes the gap that distributed artifacts (spec + ADRs + CONTEXT.md + threat models + prototypes + plans) create: nobody can answer "show me the architecture" with one document.

`/sad` **assembles** — never authors — a snapshot at `docs/architecture/<scope>-<YYYYMMDD>.md`:
- Quoted Context & constraints from the spec.
- Prioritized Quality Attributes (the section that's NOT derived; asked as MCQs).
- Relevant ADRs.
- Vocabulary delta.
- Component map (from `/plan` files).
- Threat model summary.
- Evidence (`/prototype` LEARNING.md, `/optimize` baselines).
- Open questions and risks.

Regenerated on demand; never edited by hand.

#### 7. Generate scenarios — `/to-scenarios`

Writes one `.feature` file per bounded context the feature touches, into `features/<context>/<feature-slug>.feature`. Every scenario carries a stable `@scn-NNN` ID and a runtime tag (`@release`, `@smoke`, `@manual`).

Format spec: `skills/to-scenarios/references/feature-file-format.md`.

**Status**: `draft`.

#### 🔴 HUMAN CHECKPOINT #1 — scenario approval

A human flips the `status: draft → approved` header. Until then Ralph cannot consume any issue tied to these scenarios. `/feature` pauses here.

#### 8. Decompose into issues — `/to-issues`

Each issue is an **independently testable vertical slice** (§30) with the Ralph label set:
- `ralph-ready` — eligible for AFK.
- `shift:afk` or `shift:hitl` — autonomous or human-in-the-loop.
- `scenarios:scn-NNN[,scn-MMM]` — the acceptance gate (§63).
- `budget:50k` — token cap for this issue.
- `introduces-capability:<name>` — flagged when this slice introduces a new external dependency, MCP server, or adapter family. New-capability issues are **never** `ralph-ready` on first pass (§63 companion rule).

#### 9. Technical plan — `/plan`

Per issue: file paths, port interfaces, adapter responsibilities, migration files, test layout, dependency graph. The plan is specific enough that `/tdd` can run AFK without making fresh design decisions.

Output: `.planning/plans/<feature-slug>/<issue-id>.md`.

---

### Phase 2 — AFK execution: Night Shift

`ralph-local.sh` is materialized in your project by `/setup` from `templates/ralph-local.sh.tmpl` + `templates/ralph-lib.sh`, tailored to your stack, budget, and worker count.

```bash
./ralph-local.sh                      # uses budget from .planning/budget.txt
./ralph-local.sh --max-iterations 3   # override per-issue iteration cap
```

For each issue picked from the `ralph-ready` queue:

1. **Validate gates** (§63) — abort if no `scenarios:scn-*` label, if budget exhausted, or if `introduces-capability:*` is set and unreviewed. Aborts produce a `ralph-blocked` label + structured comment from `templates/ralph-blocked-comment.md.tmpl` (§66).
2. **`/tdd`** — strict red-green-refactor. Tests fail first (§92). One issue, one PR.
3. **`/run-acceptance`** — multi-layer gate:
   - Gherkin scenarios (§57–§60).
   - Visual gate for UI features (§104).
   - API contract fuzz testing with Schemathesis (§105).
   - Stub detection (§106).
   - SLO benchmark (§83).
4. **`/code-review`** — invokes the `reviewer` sub-agent (§114) in a fresh context, **pre-PR**. The reviewer cites `§N` violations explicitly and blocks the PR if findings exist (§66).
5. **`/security-hardening`** — only if the issue has `require-human-review` or touches sensitive paths (auth, payments, PII, crypto). STRIDE threat model + §84–§90 supply-chain audit.
6. **`gh pr create --draft`** — never `--ready` (§67); humans approve readiness.

Runtime guarantees from the Ralph hardening (PR #4–#6):

- **§68 git-guardrails hook**: `PreToolUse(Bash)` blocks `git push --force`, `git reset --hard`, `git branch -D`, and `rm -rf .git` even if the agent tries them.
- **§69 NDJSON session log**: every iteration writes one JSON line to `.planning/ralph-sessions/<YYYYMMDD>-<run-id>.ndjson` — token spend, duration, tool calls, rule citations, exit reason. Queryable with `jq`.
- **§70 exponential backoff**: HTTP 429 from Anthropic / GitHub triggers `2^n` second backoff up to a cap; the run keeps going instead of crashing.

First-time operators: run the canary procedure documented in `docs/runbooks/ralph-first-overnight-canary.md` before unleashing Ralph on a real backlog. Full production-readiness contract: `docs/specs/ralph-hardening.md`, acceptance scenarios in `features/ralph/hardening.feature`.

---

### Phase 3 — Day Shift next morning

Human review of overnight draft PRs.

#### `/traceability-matrix`

At release tag, generates `docs/audit/traceability-<version>.md` linking every `scn-NNN` → implementing issue → commits/PRs → tests → SLOs. Required for SOC2, ISO 27001, EU AI Act, GDPR audits (§62).

#### `/check-consistency`

If any planning artifact (spec, ADR, CONTEXT.md, scenario, plan) was edited during implementation, walk the chain top-down and reconcile cross-artifact drift one difference at a time. Each resolution is an MCQ approved by the human; patches forward-only.

This is the difference from `/clarify` (single-artifact ambiguity) and `/domain-model` (code-vs-docs vocabulary drift): `/check-consistency` reconciles **artifact ↔ artifact** drift, which is the dominant failure mode in long-running projects.

---

### Phase 4 — When things break

| Situation | Skill |
|---|---|
| Bug reported (P0 / P1 / P2) | `/triage` → `/debug` (six-step flow) |
| Test fails unexpectedly | `/diagnose` (reproduce → minimise → hypothesise → fix → regression test) |
| P0 / user-facing P1 resolved | `/postmortem` — drafts blameless postmortem from incident artifacts |
| Endpoint exceeds SLO | `/optimize` — five-step flow with mandatory baseline (§97) |
| Tech debt sprint | `/improve-codebase-architecture` — surfaces refactor candidates with ICE rubric |

---

### Phase 5 — When the codebase is brownfield

| Situation | Skill |
|---|---|
| Modifying legacy code without coverage | `/characterization-tests` (B2 step) |
| Need to understand existing code first | `/grill-with-docs` (B1 step) |
| Change crosses many files | `/impact-analysis` (B4 step) |
| Replacing a module piece by piece | `/strangler-plan` (B5 step) |

---

## Project structure

```
stormhelm/
├── README.md
├── docs/
│   ├── WORKFLOWS-GUIDE.md
│   ├── engineering/
│   │   ├── AGENTS.md                              # rule index (generated/personalized by /setup)
│   │   ├── core/
│   │   │   ├── 01-philosophy.md                   # §1, §2, §30, §31, §35, §122
│   │   │   ├── 02-architecture.md                 # §3, §37, §24, §14, §23
│   │   │   ├── 04-input-boundaries.md             # §4, §34
│   │   │   ├── 05-domain-modeling.md              # §11, §19, §20, §21, §22, §32, §36
│   │   │   ├── 06-commands-and-security.md        # §12, §13, §27, §28
│   │   │   ├── 07-infrastructure.md               # §15, §16, §17, §18
│   │   │   ├── 08-testability.md                  # §25, §26, §29
│   │   │   ├── 10-cross-cutting.md                # §45, §46, §47, §48, §49
│   │   │   ├── 12-bdd-and-acceptance.md           # §56, §57, §58, §59, §60, §61, §62
│   │   │   ├── 13-ralph-and-afk.md                # §63, §64, §65, §66, §67, §68, §69, §70
│   │   │   ├── 14-brownfield.md                   # §71, §72, §73, §74, §75, §76
│   │   │   ├── 15-observability.md                # §77, §78, §79, §80, §81, §82, §83
│   │   │   ├── 16-security-supply-chain.md        # §84, §85, §86, §87, §88, §89, §90
│   │   │   ├── 17-bug-handling.md                 # §91, §92, §93, §94, §95, §96 + severity matrix
│   │   │   ├── 18-improvements.md                 # §97, §98, §99, §100, §101, §102 (5 kinds)
│   │   │   ├── 19-hooks-and-runtime-guards.md     # §108, §109, §110, §111, §112, §113
│   │   │   └── 20-agents.md                       # §114, §115, §116 (formal sub-agents)
│   │   └── capabilities/
│   │       ├── typescript/
│   │       │   ├── 03-style.md                    # §5, §6, §7, §8, §9, §10, §33
│   │       │   ├── 11-async.md                    # §50, §51, §52, §53, §54, §55
│   │       │   └── 12-package-management.md       # §117, §118, §119, §120, §121
│   │       ├── typescript-hono/
│   │       │   └── 09-stack-conventions.md        # §38, §39, §40, §41, §42, §43, §44
│   │       ├── python/
│   │       │   ├── 03-style.md                    # §5-py, §6-py, §7-py, §8-py, §9-py, §10-py, §33-py
│   │       │   ├── 11-async.md                    # §50-py, §51-py, §52-py, §53-py, §54-py, §55-py
│   │       │   └── 12-package-management.md       # §117-py, §118-py, §119-py, §120-py, §121-py (uv)
│   │       └── python-fastapi/
│   │           └── 09-stack-conventions.md        # §38-py, §39-py, §40-py, §41-py, §42-py, §43-py, §44-py
├── docs/
│   ├── runbooks/
│   │   └── ralph-first-overnight-canary.md        # first-overnight Ralph procedure
│   ├── specs/
│   │   └── ralph-hardening.md                     # production-readiness contract for Ralph
│   └── …                                          # specs/, adr/, audit/, postmortems/, threat-models/, architecture/
├── features/
│   └── ralph/hardening.feature                    # acceptance scenarios for Ralph hardening
├── templates/
│   ├── ralph-local.sh.tmpl                        # materialized by /setup
│   ├── ralph-lib.sh                               # shared helpers used by ralph-local.sh
│   └── ralph-blocked-comment.md.tmpl              # structured comment when Ralph aborts (§66)
├── hooks/
│   ├── README.md
│   ├── webfetch-cache-pre.js                      # PreToolUse(WebFetch) — §108
│   ├── webfetch-cache-post.js                     # PostToolUse(WebFetch) — §108
│   ├── context-monitor.js                         # PostToolUse(*) — §112
│   ├── git-guardrails.js                          # PreToolUse(Bash) — §68 destructive-shell guard
│   └── closed-set-check.js                         # PostToolUse(Write|Edit) — §36 closed-set/doc drift
├── agents/
│   └── reviewer.md                                # Independent code review sub-agent — §114
└── skills/
    # === Framework & onboarding ===
    ├── setup/                                     # /setup — configure Stormhelm for your project
    ├── onboard/                                   # /onboard — orient new developers
    ├── feature/                                   # /feature — end-to-end orchestrator
    # === Day Shift: design ===
    ├── constitution/                              # /constitution — non-negotiable principles
    ├── grill-me/                                  # /grill-me — pre-coding interrogation (MCQ format)
    │   └── references/transcript-format.md
    ├── domain-model/                              # /domain-model — CONTEXT.md + ADRs
    ├── specify/                                   # /specify — intent capture
    │   └── references/spec-format.md
    ├── clarify/                                   # /clarify — resolve spec ambiguity (MCQ format)
    │   └── references/clarifications-log-format.md
    ├── prototype/                                 # /prototype — throwaway evidence
    ├── sad/                                       # /sad — derived architecture snapshot  ⭐ NEW
    │   └── references/template.md
    ├── to-scenarios/                              # /to-scenarios — Gherkin drafts
    │   └── references/feature-file-format.md
    ├── to-issues/                                 # /to-issues — vertical slices with Ralph labels
    ├── plan/                                      # /plan — technical plan per slice
    # === Night Shift: execution ===
    ├── tdd/                                       # /tdd — red-green-refactor
    ├── run-acceptance/                            # /run-acceptance — multi-layer gate
    ├── code-review/                               # /code-review — wraps the reviewer agent
    ├── security-hardening/                        # /security-hardening — STRIDE + §84–§90
    # === Release & maintenance ===
    ├── traceability-matrix/                       # /traceability-matrix — audit trail
    ├── check-consistency/                         # /check-consistency — cross-artifact drift  ⭐ NEW
    # === Bug-fix & operational ===
    ├── debug/                                     # /debug — six-step bug flow
    ├── diagnose/                                  # /diagnose — root-cause loop
    ├── postmortem/                                # /postmortem — incident draft
    │   └── references/postmortem-template.md
    ├── optimize/                                  # /optimize — perf with baseline (§97)
    ├── handoff/                                   # /handoff — session compaction
    # === Brownfield ===
    ├── grill-with-docs/                           # /grill-with-docs — interrogate legacy
    ├── characterization-tests/                    # /characterization-tests — document current behavior
    ├── impact-analysis/                           # /impact-analysis — ripple mapping
    ├── strangler-plan/                            # /strangler-plan — phased migration
    └── improve-codebase-architecture/             # /improve-codebase-architecture — refactor candidates
    # === Routing ===
    ├── triage/                                    # /triage — classify and label incoming issues
    ⭐ NEW skills added in this iteration
```

## How a skill loads its rules (progressive disclosure)

Skills do not read all 122 rules; they declare which files they need. Example excerpt from `grill-me/SKILL.md`:

> **Always**:
> - `core/01-philosophy.md` — §1, §2, §30, §31 so questions reflect "build only validated business needs."
> - `core/05-domain-modeling.md` — §22 (PRD vocabulary).
>
> **If the feature involves new components**:
> - `core/02-architecture.md` — §3 (hexagonal layering) so questions probe layer boundaries.
>
> **If the feature is agentic**:
> - `core/13-ralph-and-afk.md` — §63–§70.
>
> **If the feature touches sensitive paths**:
> - `core/16-security-supply-chain.md` — §87 threat modeling triggers.

This keeps the agent's context lean. A feature task pulls ~3 rule files (~1500 lines); a bug fix pulls 1–2. Nobody loads all 122 rules at once.

For the full operational guide with worked example, HITLs, and responsibilities, see [`docs/WORKFLOWS-GUIDE.md`](docs/WORKFLOWS-GUIDE.md). The complete rule index is in [`docs/engineering/AGENTS.md`](docs/engineering/AGENTS.md); the project-specific overrides live in `docs/constitution.md` generated by `/constitution`.

## Rule index (high-level)

| Range | Topic |
|---|---|
| §1 – §10 | Philosophy + TypeScript style |
| §11 – §22 | Domain modeling |
| §23 – §37 | Architecture, input boundaries |
| §38 – §49 | Stack conventions (Hono/Drizzle/Zod) + cross-cutting |
| §50 – §55 | Async, runtime |
| §56 – §62 | BDD & acceptance + traceability |
| §63 – §70 | Ralph & AFK operations |
| §71 – §76 | Brownfield discipline |
| §77 – §83 | Observability, SLOs |
| §84 – §90 | Security & supply chain (CI-level) |
| §91 – §96 | Bug handling + postmortems |
| §97 – §102 | Improvements (refactor, perf, debt, hardening, deps) |
| §103 – §107 | BDD extras + Agent Teams |
| §108 – §113 | Hooks & runtime guards |
| §114 – §116 | Formal sub-agents |
| §117 – §121 | Package management & supply-chain hygiene (TypeScript; Python twins under `-py` suffix) |
| §122 | External library API verification (Context7) |

## Capabilities roadmap

| Capability | Status | Rules |
|---|---|---|
| `core` (stack-agnostic) | ✅ Shipped | every §N living in `docs/engineering/core/*.md` — 97 rules; remaining 25 are stack-specific |
| `capabilities/typescript` | ✅ Shipped | §5–§10, §33, §50–§55, §117–§121 |
| `capabilities/typescript-hono` | ✅ Shipped | §38–§44 (Hono / Drizzle / Zod) |
| `capabilities/python` | ✅ Shipped | §5-py–§10-py, §33-py (style); §50-py–§55-py (async); §117-py–§121-py (uv + supply chain) |
| `capabilities/python-fastapi` | ✅ Shipped | §38-py–§44-py (FastAPI / SQLAlchemy 2.x async / Pydantic v2) |
| `capabilities/typescript-fastify` | 🚧 Planned | Same shape as `typescript-hono`, different placement rules |
| `capabilities/go` | 📋 Backlog | Go baseline (error handling, contexts) |
| `capabilities/go-echo` | 📋 Backlog | Go + Echo framework |

Adding a capability does not require modifying `core/` or existing capabilities. Write the rule files following the template, register in the `/setup` wizard, ship.

## What Stormhelm solves

| Problem in raw AI coding | What Stormhelm does |
|---|---|
| Agent generates code that "works" but violates project architecture | Hierarchical `AGENTS.md` with stable rule numbering (`§N`) the agent reads on demand |
| TDD alone doesn't guarantee the product is correct | BDD outside-in with Gherkin scenarios as the executable acceptance gate (`/to-scenarios` → `/run-acceptance`) |
| Context rot in long sessions | Domain language in `CONTEXT.md` with `_Avoid_:` markers, ADRs, structured handoffs (`/handoff`) |
| AFK runs explode tokens without guardrails | Issue-level token budget, `max-iterations`, sandbox Docker option, draft-only PRs |
| Brownfield gets broken by overconfident agents | `/characterization-tests` + `/impact-analysis` + `/strangler-plan` before touching legacy |
| Bug fixes that patch symptoms and reappear | `/debug` six-step flow with mandatory regression test |
| "Optimizations" without measurement | `/optimize` five-step flow with §97 enforced baseline |
| Architecture decisions vanish into history | ADRs + `/sad` derived snapshots |
| Multi-artifact drift over time | `/check-consistency` cross-artifact reconciler |
| Agent invents APIs that don't exist | §122 + Context7 MCP — verify against current docs |
| Supply-chain attacks via postinstall scripts | §118 explicit allowlist (`pnpm.onlyBuiltDependencies`) + §119 `--frozen-lockfile` |
| Auditability for regulated environments | Versioned `.feature` files, traceability matrix, SBOM per release, postmortems |

## Provenance and credits

The foundation (§1 – §55) is **inspired by and adapted from** the engineering guidelines published by the Belong A2A Marketplace team. Stormhelm preserves the rule numbering as a sign of respect.

The structural pattern (hierarchical `AGENTS.md` index + topical files loaded on demand + `references/` folders per skill) comes from **`mattpocock/skills`** (AI Hero). The BDD outside-in approach draws from **swingerman/atdd**. The Night Shift loop is the **Ralph technique** invented by **Geoffrey Huntley** and popularized by Matt Pocock.

The multiple-choice questioning format in `/grill-me` and `/clarify`, the `_Avoid_:` vocabulary marker, the `/sad` document shape, and the `/check-consistency` cross-artifact pattern are adapted from **Alejo Questions / Alejo workflow** in `sandcastle-synth`.

Frameworks evaluated and selectively integrated: AI Hero, GSD, Superpowers, BMAD, Spec-Kit, addyosmani/agent-skills, Alejo workflow.

## License

MIT — use freely in any project, commercial or open-source.

---

*Hold the helm. Weather the storm.*
