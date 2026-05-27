# Stormhelm

> *"A smooth sea never made a skilled sailor."*

**Stormhelm** is an engineering harness for building software with AI coding agents.

The name combines two ideas: the **helm** — the wheel that keeps a ship on course — and the **storm** that surrounds modern AI-assisted development: vibe coding, context rot, runaway agents, hallucinated code, audit-less changes. Stormhelm is what you hold when the autopilot can't see the rocks. The developer stays at the helm; the agents are the crew.

---

## What it is

Stormhelm is a **stack-agnostic framework** that codifies the discipline a senior developer would apply when working with AI agents. It combines patterns from the best open-source approaches of 2025-2026 (AI Hero, Spec-Kit, BMAD, Superpowers, GSD, addyosmani/agent-skills) into a single coherent system.

It has three layers:

1. **Core engineering rules** (`docs/engineering/core/`) — language-agnostic patterns for architecture, domain modeling, testability, observability, security, BDD, and autonomous operation.
2. **Capabilities** (`docs/engineering/capabilities/<stack>/`) — stack-specific rules that activate only when your project uses that stack. Shipped today: `typescript` + `typescript-hono` (Hono/Drizzle/Zod) and `python` + `python-fastapi` (FastAPI/SQLAlchemy 2.x async/Pydantic v2). Others (Fastify, Go/Echo) follow the same template.
3. **Skills** (`skills/`) — invokable commands for Claude Code that drive the workflow: `/setup`, `/onboard`, `/grill-me`, `/to-scenarios`, `/to-issues`, `/tdd`, `/run-acceptance`, `/code-review`, `/traceability-matrix`, and the Ralph local AFK loop.

## What it solves

| Problem in raw AI coding | What Stormhelm does |
|---|---|
| Agent generates code that "works" but violates project architecture | Hierarchical `AGENTS.md` with stable rule numbering (`§N`) the agent reads on demand |
| TDD alone doesn't guarantee the product is correct | BDD outside-in with Gherkin scenarios as the executable acceptance gate |
| Context rot in long sessions | Domain language in `CONTEXT.md`, ADRs, structured handoffs |
| AFK runs explode tokens without guardrails | Issue-level token budget, `max-iterations`, draft-only PRs, exponential backoff on rate-limits, structured `ralph-blocked` automation, NDJSON session logs, git-guardrails hook |
| Brownfield gets broken by overconfident agents | Characterization tests + impact analysis + strangler pattern before touching legacy |
| Bug fixes that patch symptoms and reappear later | `/debug` skill with 6 mandatory steps: reproduce → localize → reduce → root-cause fix → regression test (fails-first) → verify |
| "Optimizations" without measurement that don't actually optimize | `/optimize` skill with 5 mandatory steps starting from a measured baseline; §97 forbids perf work without measurement |
| Refactor, tech debt, dep upgrades treated like features and shipped reckless | `core/18-improvements.md` separates the 5 kinds of improvement with explicit gates per kind |
| Auditability for regulated environments | Versioned `.feature` files, traceability matrix, SBOM per release, postmortems on `docs/postmortems/` |

## Workflow at a glance

```
Day Shift (human + agent, interactive)
  /constitution  →  /grill-me  →  /domain-model  →  /specify  →  /clarify
                                       ↓
                              /to-scenarios (human approves)
                                       ↓
                                  /to-issues  →  /plan

Night Shift (Ralph, autonomous, local)
  ralph-local.sh
   └─ for each issue with label `ralph-ready` + scenarios:scn-NNN
        ├─ /tdd (red-green-refactor, inner loop)
        ├─ /run-acceptance (gate: all @release scenarios pass)
        ├─ /code-review + /security-hardening
        └─ gh pr create --draft

Day Shift next morning
  Human reviews drafts → /traceability-matrix → merge
```

> **Night Shift status:** production-ready. The shipped `templates/ralph-local.sh` + `templates/ralph-lib.sh` implement §63 (label gate), §65 (max-iterations), §66 (reviewer agent invocation pre-PR + `ralph-blocked` automation with structured comment), §67 (draft PR), §68 (git-guardrails `PreToolUse` hook blocks `git push --force`, `reset --hard`, `branch -D`, `rm -rf .git`), §69 (NDJSON session logs in `.planning/ralph-sessions/`), and §70 (exponential backoff on HTTP 429). See `docs/specs/ralph-hardening.md` for the full contract.

## Project structure

```
stormhelm/
├── README.md                                    # this file
├── docs/
│   ├── engineering/
│   │   ├── AGENTS.md                            # rule index (generated/personalized by /setup)
│   │   ├── core/
│   │   │   ├── 01-philosophy.md                 # §1, §2, §30, §31, §35, §122
│   │   │   ├── 02-architecture.md               # §3, §37, §24, §14, §23
│   │   │   ├── 04-input-boundaries.md           # §4, §34
│   │   │   ├── 05-domain-modeling.md            # §11, §19, §20, §21, §22, §32, §36
│   │   │   ├── 06-commands-and-security.md      # §12, §13, §27, §28
│   │   │   ├── 07-infrastructure.md             # §15, §16, §17, §18
│   │   │   ├── 08-testability.md                # §25, §26, §29
│   │   │   ├── 10-cross-cutting.md              # §45, §46, §47, §48, §49
│   │   │   ├── 12-bdd-and-acceptance.md         # §56, §57, §58, §59, §60, §61, §62
│   │   │   ├── 13-ralph-and-afk.md              # §63, §64, §65, §66, §67, §68, §69, §70
│   │   │   ├── 14-brownfield.md                 # §71, §72, §73, §74, §75, §76
│   │   │   ├── 15-observability.md              # §77, §78, §79, §80, §81, §82, §83
│   │   │   ├── 16-security-supply-chain.md      # §84, §85, §86, §87, §88, §89, §90
│   │   │   ├── 17-bug-handling.md               # §91, §92, §93, §94, §95, §96 + severity matrix
│   │   │   ├── 18-improvements.md               # §97, §98, §99, §100, §101, §102 (5 kinds)
│   │   │   ├── 19-hooks-and-runtime-guards.md   # §108, §109, §110, §111, §112, §113
│   │   │   └── 20-agents.md                     # §114, §115, §116 (formal sub-agents)
│   │   └── capabilities/
│   │       ├── typescript/
│   │       │   ├── 03-style.md                  # §5, §6, §7, §8, §9, §10, §33
│   │       │   ├── 11-async.md                  # §50, §51, §52, §53, §54, §55
│   │       │   └── 12-package-management.md     # §117, §118, §119, §120, §121
│   │       └── typescript-hono/
│   │           └── 09-stack-conventions.md      # §38, §39, §40, §41, §42, §43, §44
├── docs/postmortems/TEMPLATE.md                # /debug postmortem template (used by §95)
├── hooks/
│   ├── README.md                                # installation + configuration
│   ├── webfetch-cache-pre.js                    # PreToolUse(WebFetch) — §108
│   ├── webfetch-cache-post.js                   # PostToolUse(WebFetch) — §108
│   └── context-monitor.js                       # PostToolUse(*) — §112
├── agents/
│   └── reviewer.md                              # Independent code review agent — §114
└── skills/
    # === Framework & Onboarding ===
    ├── setup/SKILL.md                           # /setup — configure Stormhelm for your project
    ├── onboard/SKILL.md                         # /onboard — orient new developers to the workflow
    ├── feature/SKILL.md                         # /feature — end-to-end orchestrator (13 steps, 2 human checkpoints)
    # === Workflow (used by /feature) ===
    ├── constitution/SKILL.md                    # /constitution — establish non-negotiable principles
    ├── grill-me/SKILL.md                        # /grill-me — pre-coding interrogation (40-100 questions)
    ├── domain-model/SKILL.md                    # /domain-model — refine CONTEXT.md + emit ADRs
    ├── specify/SKILL.md                         # /specify — capture intent (what + why) in docs/specs/
    ├── clarify/SKILL.md                         # /clarify — resolve spec ambiguity
    ├── to-scenarios/SKILL.md                    # /to-scenarios — generate Gherkin drafts for human approval (§58)
    ├── to-issues/SKILL.md                       # /to-issues — vertical-slice decomposition with Ralph labels
    ├── plan/SKILL.md                            # /plan — technical plan per slice
    ├── tdd/SKILL.md                             # /tdd — red-green-refactor cycle
    ├── run-acceptance/SKILL.md                  # /run-acceptance — multi-layer gate (BDD + visual + Schemathesis + stub + SLO)
    ├── code-review/SKILL.md                     # /code-review — thin wrapper invoking reviewer agent
    ├── security-hardening/SKILL.md              # /security-hardening — STRIDE + §84-§90 audit for sensitive paths
    ├── traceability-matrix/SKILL.md             # /traceability-matrix — audit trail per release (§62)
    # === Bug fixing & operational ===
    ├── debug/SKILL.md                           # /debug — disciplined bug investigation (6 steps)
    ├── diagnose/SKILL.md                        # /diagnose — root cause loop (reproduce → minimise → ... → regression test)
    ├── postmortem/SKILL.md                      # /postmortem — draft postmortem from incident artifacts (§95)
    ├── optimize/SKILL.md                        # /optimize — performance optimization with mandatory baseline (5 steps)
    ├── handoff/SKILL.md                         # /handoff — compact session for transfer (used by context-monitor hook)
    # === Brownfield ===
    ├── grill-with-docs/SKILL.md                 # /grill-with-docs — interrogate existing code (B1)
    ├── characterization-tests/SKILL.md          # /characterization-tests — document current behavior (B2, §71, §72)
    ├── impact-analysis/SKILL.md                 # /impact-analysis — ripple effect mapping (B4, §73)
    ├── strangler-plan/SKILL.md                  # /strangler-plan — phased migration plan (B5, §74)
    └── improve-codebase-architecture/SKILL.md   # /improve-codebase-architecture — surface refactor candidates with ICE rubric
    # === Issue routing & exploration ===
    ├── triage/SKILL.md                          # /triage — classify and label incoming issues
    └── prototype/SKILL.md                       # /prototype — throwaway code to validate design decisions
```

## Quick start

### 1. Scaffold a new project

```bash
# Clone Stormhelm to a temporary location
git clone https://github.com/yeison-gutierrez-simetrik/stormhelm.git /tmp/stormhelm

# Create your project
mkdir my-project && cd my-project

# Copy what Claude Code needs into .claude/
mkdir -p .claude
cp -R /tmp/stormhelm/skills  .claude/skills
cp -R /tmp/stormhelm/agents  .claude/agents
cp -R /tmp/stormhelm/hooks   .claude/hooks

# Copy the engineering rules + workflows guide
mkdir -p docs
cp -R /tmp/stormhelm/docs/engineering  docs/engineering
cp /tmp/stormhelm/docs/WORKFLOWS-GUIDE.md docs/

# Create minimal .claude/settings.json (hooks + permissions)
cat > .claude/settings.json <<EOF
{
  "permissions": { "allow": ["Read", "Grep", "Glob", "Edit", "Write", "Bash(git:*)", "Bash(gh:*)", "Bash(pnpm:*)"] },
  "hooks": {
    "PreToolUse":  [{ "matcher": "WebFetch", "hooks": [{ "type": "command", "command": "node \$CLAUDE_PROJECT_DIR/.claude/hooks/webfetch-cache-pre.js" }] }],
    "PostToolUse": [{ "matcher": "WebFetch", "hooks": [{ "type": "command", "command": "node \$CLAUDE_PROJECT_DIR/.claude/hooks/webfetch-cache-post.js" }] }],
    "PreCompact":  [{ "hooks": [{ "type": "command", "command": "node \$CLAUDE_PROJECT_DIR/.claude/hooks/context-monitor.js" }] }]
  },
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] }
  }
}
EOF
```

For a complete pre-built scaffold (with `.planning/`, templates, stubs, `.gitignore`, etc.), see [`task_flow/`](task_flow/) in this repo — copy it as a starting point instead of doing the steps above.

### 2. Run inside Claude Code

```bash
claude
```

Claude Code auto-discovers all skills, the reviewer agent, and the hooks. Then:

```
> /onboard            # 5-min tour of the framework
> /setup              # configure for your stack (TS+Hono, Python+FastAPI, other)
> /constitution       # establish your project's non-negotiable tenets
> /feature "I want users to be able to create and list tasks"
```

That last command runs the full 13-step greenfield flow end-to-end, with three human checkpoints (scenario approval, threat-model approval if sensitive, PR approval). To run manually with full control, follow the chain documented in [`docs/WORKFLOWS-GUIDE.md`](docs/WORKFLOWS-GUIDE.md):

```
/grill-me → /clarify → /specify → /domain-model → /to-scenarios   [HITL #1]
         → /to-issues → /plan → /tdd → /run-acceptance
         → /security-hardening → /traceability-matrix             [HITL #3]  →  merge
```

### 3. Recommended reading order

1. [`docs/WORKFLOWS-GUIDE.md`](docs/WORKFLOWS-GUIDE.md) — operational guide with worked example, HITLs, and responsibilities.
2. [`docs/engineering/AGENTS.md`](docs/engineering/AGENTS.md) — index of the 122 rules. Skills load only the relevant ones (progressive disclosure).
3. `docs/constitution.md` (in your project) — the project's last word, generated by `/constitution`.

## Capabilities roadmap

| Capability | Status | Notes |
|---|---|---|
| `core` (stack-agnostic patterns) | ✅ Shipped | every §N living in `docs/engineering/core/*.md` — 97 rules; the rest is stack-specific |
| `capabilities/typescript` | ✅ Shipped | §5-§10, §33, §50-§55, §117-§121 |
| `capabilities/typescript-hono` | ✅ Shipped | §38-§44 (Hono / Drizzle / Zod) |
| `capabilities/python` | ✅ Shipped | §5-py–§10-py, §33-py (style); §50-py–§55-py (async); §117-py–§121-py (uv + supply chain) |
| `capabilities/python-fastapi` | ✅ Shipped | §38-py–§44-py (FastAPI / SQLAlchemy 2.x async / Pydantic v2) |
| `capabilities/typescript-fastify` | 🚧 Planned | Same shape as `typescript-hono`, different placement rules |
| `capabilities/go` | 📋 Backlog | Go baseline (error handling, contexts) |
| `capabilities/go-echo` | 📋 Backlog | Go + Echo framework |

Adding a new capability is a contained task: write the rule files following the template, register it in the `/setup` wizard, ship it.

## Provenance and credits

The foundation (§1 – §55) is **inspired by and adapted from** the engineering guidelines published by the Belong A2A Marketplace team. Their public AGENTS.md is one of the strongest practical implementations of the hierarchical agent-rules pattern we have seen, and Stormhelm preserves the rule numbering as a sign of respect to the original work.

The structural pattern (hierarchical `AGENTS.md` index + topical files loaded on demand) comes from **`mattpocock/skills`** (AI Hero). The BDD outside-in approach draws from **swingerman/atdd** and the broader spec-driven development movement. The Night Shift loop is the **Ralph technique** invented by **Geoffrey Huntley** and popularized by Matt Pocock.

Frameworks evaluated and selectively integrated: AI Hero, GSD, Superpowers, BMAD, Spec-Kit, addyosmani/agent-skills.

## License

MIT — use freely in any project, commercial or open-source.

---

*Hold the helm. Weather the storm.*
