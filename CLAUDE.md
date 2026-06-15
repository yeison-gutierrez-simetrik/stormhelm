# Stormhelm — Project Context for Claude Code

This file is auto-loaded by Claude Code at session start. It documents enduring context for this repository so any Claude session can pick up work without re-discovering the project. Session-specific handoffs live in `.planning/handoff/<date>-from-<source>.md` — read the latest one for "what's in flight right now".

---

## What this repo is

Stormhelm is a **stack-agnostic AI-assisted SDLC framework**. It ships as a set of files (skills, agents, hooks, engineering rules) that a consumer project copies into its `.claude/` directory and `docs/engineering/` to adopt the workflow. Stormhelm is **not a library**: there is nothing to import. The artifacts are markdown + small Node scripts that Claude Code consumes directly.

The repo's own `skills/`, `agents/`, `hooks/`, and `docs/engineering/` are the **source of truth** that downstream projects copy. The repo's `.github/workflows/`, `scripts/`, and `docs/decisions/` are operational infrastructure for maintaining the framework itself.

## Repo layout

```
.
├── README.md                           — pitch for the project
├── CLAUDE.md                           — this file
├── docs/
│   ├── WORKFLOWS-GUIDE.md              — canonical user-facing guide (English)
│   ├── engineering/
│   │   ├── AGENTS.md                   — rule index (all §N rules)
│   │   ├── core/                       — 17 rule files (§1 – §125 to date)
│   │   └── capabilities/               — language/stack-specific rules
│   │       ├── typescript/, typescript-hono/    — TS + Hono
│   │       ├── python/, python-fastapi/         — Python + FastAPI
│   │       └── <each>/CAPABILITY.md             — frontmatter declaring sonar/etc contributions
│   ├── adr/                            — Architecture Decision Records (numbered, status-tracked)
│   ├── decisions/                      — durable rationale (grilling, clarify-logs, open-questions). See PR-I.
│   ├── specs/                          — feature specs from /specify
│   ├── architecture/                   — Solution Architecture Documents from /sad
│   ├── threat-models/                  — from /security-hardening
│   ├── perf-baselines/                 — from /optimize
│   ├── audit/                          — traceability matrices (-draft.md pre-merge, -final.md post-merge)
│   ├── postmortems/                    — from /postmortem (incident:production only)
│   └── runbooks/                       — operational procedures (e.g. Ralph first canary)
├── skills/                             — SKILL.md files (canonical, copied to .claude/skills/ in consumers)
├── agents/                             — sub-agent definitions (canonical, copied to .claude/agents/)
├── hooks/                              — Node.js hooks (canonical, copied to .claude/hooks/)
│   ├── git-guardrails.cjs               — PreToolUse(Bash) blocking destructive git ops (§68)
│   ├── webfetch-cache-pre/post.cjs      — §108 WebFetch caching
│   ├── context-monitor.cjs              — PostToolUse(*) §112 context tracking
│   └── closed-set-check.cjs             — PostToolUse(Write|Edit) §36 drift detection
├── templates/                          — operational templates (ralph-local.sh.tmpl, ralph-lib.sh, etc.)
├── scripts/                            — Node helpers, two kinds (see "scripts/ taxonomy" below)
│   ├── check-framework-metadata.mjs    — [self-maint]       self-consistency linter (PR-A)
│   ├── check-invariants.mjs            — [consumer-runtime] executable §N invariants (PR-D / INV-N)
│   ├── check-merge-safety.mjs          — [consumer-runtime] mergeable + post-merge verify (PR-Sec / FW-5)
│   ├── train-merge.mjs                 — [consumer-runtime] stacked-train merge: retarget-before-delete (FU-60)
│   ├── sonar-sweep.mjs                 — [consumer-runtime] post-PR Sonar QG/issues read-out (FU-65)
│   ├── compose-sonar-properties.mjs    — [consumer-runtime] capability-driven Sonar config (PR-Sonar / FW-6)
│   ├── group-slice-issues.mjs          — [consumer-runtime] slice-group resolver (PR-Group / FW-2)
│   ├── parse-layers-affected.mjs       — [consumer-runtime] shared AST parser, imported by group-slice (future PR-M)
│   ├── preflight.mjs                   — [consumer-runtime] per-skill precondition checks (PR-B)
│   ├── check-skill-doc-delivery.mjs    — [consumer-runtime] §125 spec-FR ⇒ skill-doc diff gate (FU-88)
│   ├── sync-closed-sets.mjs            — [consumer-runtime] §36 generator, called by closed-set-check hook (PR-E)
│   └── __tests__/                      — [self-maint]       test fixtures + .test.mjs files (node --test)
├── .github/workflows/
│   ├── verify-framework-metadata.yml   — CI gate: runs check-framework-metadata.mjs
│   └── verify-scripts-tests.yml        — CI gate: runs scripts/__tests__/ suite (PR #37 / issue #32)
└── .planning/                          — ephemeral scratch, partially gitignored
    ├── dry-runs/                        — tracked
    ├── pr-bodies/                       — tracked
    └── handoff/                         — tracked (session-to-session handoffs)
    # Other .planning/ subdirs (working notes, etc.) are ephemeral and left untracked.
```

## Self-check scripts (run before opening any PR)

The framework maintains itself via three Node scripts. Run all three after touching any framework file:

```bash
node scripts/check-framework-metadata.mjs   # cardinality + rule/skill reference checks
node scripts/check-invariants.mjs           # executable §N invariants (INV-1..N)
node scripts/sync-closed-sets.mjs --check   # §36 closed-set drift
```

All three must be ✅ before merge. CI runs `check-framework-metadata.mjs` (`verify-framework-metadata.yml`) **and** the `scripts/__tests__/` suite (`verify-scripts-tests.yml`, added in #37 — exercises `check-invariants.mjs` against a populated synthetic consumer). `sync-closed-sets.mjs --check` remains a documented manual gate.

### scripts/ taxonomy — consumer-runtime vs self-maintenance

Two kinds of script live in `scripts/`, and the distinction matters for adoption:

- **`[self-maint]`** — run only against *this* repo while maintaining the framework: `check-framework-metadata.mjs` and the `__tests__/` suite. Consumers do **not** need these.
- **`[consumer-runtime]`** — invoked at runtime by shipped skills/hooks via `node scripts/<x>.mjs` (relative to the consumer repo root): `preflight`, `check-invariants`, `check-merge-safety`, `group-slice-issues`, `parse-layers-affected` (imported by group-slice), `sync-closed-sets` (called by the `closed-set-check` hook), `compose-sonar-properties`, `train-merge` (HC2 stacked merges), `sonar-sweep` (post-PR QG read-out), and `check-skill-doc-delivery` (§125 spec-FR ⇒ skill-doc diff gate). Because skills call them by relative path, **`/setup` copies this subset into the consumer repo** (see `skills/setup`). Adopting the framework without these scripts leaves every skill that calls `node scripts/...` broken — which is exactly the gap this taxonomy makes explicit.

## Key conventions

**§N rule numbering.** Rules are numbered §1 through §125 (current max). Each lives in exactly one file under `docs/engineering/core/` or `capabilities/`. The header of each file lists `**Rules in this file.** §X, §Y, §Z` — the linter enforces this header is correct. Never reuse a §N. New rules append at the next available number.

**INV-N invariants.** Executable invariants live in `scripts/check-invariants.mjs`. Reserved numbering:
- INV-1 §107 — multi-module feature ⇒ SAD exists
- INV-2 §87 — sensitive ⇒ threat model exists
- INV-3 §63 — ralph-ready scns are in approved `.feature`
- INV-4 — ADR Accepted ⇒ has a Date
- INV-5 §59 — @release scn referenced by some issue
- INV-6 — *(reserved: ADR-0002 Accepted, classification-stability detector — to be implemented by PR-N; cites `—`, NOT a §rule)*. **Schema-only substrate slices are the canonical pre-blessed `skip-invariant: INV-6` case** (FOLLOW-UP 66): tables spanning ≥2 modules' contexts are persistence span, not runtime coupling — the reason string lives in `core/12` §57.*
- INV-7 — *intentionally NOT an executable invariant. Finding-attribution (PR-Attr / FW-3) shipped in #38 as a reviewer + process concern (`agents/reviewer.md` blame→owning-branch, `core/13` §67) — there is no offline artifact to check. Slot kept so INV-8 isn't renumbered.*
- INV-8 §58 — feature 'implemented' ⇒ traceability-v*-final.md exists
- CONFIG — issues exist but none carry `**Labels:**` line (PR #31 fix)

**Override pattern.** Any invariant can be overridden with a `skip-invariant: INV-N — <reason>` line anywhere in the repo. The reason stays auditable in git.

**Capability frontmatter.** Each `docs/engineering/capabilities/<name>/CAPABILITY.md` carries YAML frontmatter declaring its contributions (e.g. `sonar.test_inclusions`). The composer scripts read these. Adding a new capability = create a directory + CAPABILITY.md + the rule files.

**ADRs.** Numbered, in `docs/adr/NNNN-<slug>.md`. Statuses: Proposed → Accepted (with `Date:` and optional `Co-signed:` trailer for cross-author decisions) → Superseded. ADR-0001 = git+GitHub required. ADR-0002 = conditional ceremony by detection.

**Decisions vs ADRs.** `docs/decisions/` holds the **deliberation trail** (grilling transcripts, clarify logs, open questions). `docs/adr/` holds **decisions**. Both are tracked in git (PR-I made this explicit).

## Feedback loop with consumer projects

Stormhelm evolves through an iterative dialogue with the projects that adopt it. The pattern:

- A consumer writes feedback in its own repo (by convention, under its `.planning/framework-feedback/`).
- The framework works through its reasoning in ephemeral notes under `.planning/` (working state, not committed), and lands the resulting changes as **labeled PRs** — `FW-N` = the Nth finding in a feedback round.
- When a decision touches framework philosophy, it is elevated to an **ADR**, co-signed when it spans both the framework and a consumer. ADR-0002 was the first instance.

## Authoritative info

- **What Stormhelm is, for new users:** `README.md`.
- **How the workflow runs:** `docs/WORKFLOWS-GUIDE.md`.
- **Rule details:** `docs/engineering/AGENTS.md` (index) → `docs/engineering/core/<N>-<topic>.md`.
- **Maintaining the framework itself:** `docs/maintaining-stormhelm.md` (self-verification gate, the `skills-internal/` framework-self skills, the framework-self vs shipped-artifact boundary).
- **Architecture decisions:** `docs/adr/*.md`.
- **Current planning state:** the most recent `.planning/handoff/*.md`, plus open PRs (`gh pr list`) and recent merges (`git log --merges main`).
- **Session-to-session handoffs:** `.planning/handoff/<date>-from-<source>.md` (read the most recent).
- **In-flight PR bodies:** `.planning/pr-bodies/*.md`.

## Dogfooding principle

The framework manages itself with its own conventions: it has invariants (INV-N), a feedback loop, structured PR review, ADRs, traceability — exactly what it asks consumer projects to use. When a question is "should Stormhelm have <X>?", check whether <X> exists for Stormhelm's own development. If not, that's usually the right answer for the consumer too. This is also why bugs in the framework's own gates (PR #31 was the canonical example) matter so much: every consumer inherits them.

## Quick orientation: starting fresh in this repo

```bash
# What's in flight?
ls -t .planning/handoff/ | head -1          # read the most recent handoff
gh pr list --state open                     # what's pending review

# What's the framework's actual state?
node scripts/check-framework-metadata.mjs   # all three should be ✅
node scripts/check-invariants.mjs
node scripts/sync-closed-sets.mjs --check

# What's pending review?
gh pr list --state open

# Recent merges (last week of activity is most relevant)
git log --oneline --merges main -20
```

After this, read the most recent `.planning/handoff/*.md` for session-specific context.
