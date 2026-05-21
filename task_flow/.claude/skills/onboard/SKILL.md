---
name: onboard
description: |
  Interactive orientation for a developer who is new to Stormhelm (or new to a project
  that uses it). Explains the workflow, the rule index, the Day Shift / Night Shift split,
  how to invoke skills, how Ralph works, and which docs to read first. Adapts to whether
  the user is a first-time Stormhelm user or only new to this project.
  Use when: a new developer joins, a developer adopts Stormhelm for the first time, or
  someone needs a refresher after a long break.
---

# /onboard — Stormhelm Workflow Orientation

## Purpose

`/onboard` gives a developer the working knowledge needed to operate inside a Stormhelm-powered project. It is **not** a deep-dive into the rules — it teaches the workflow and points to where to learn more.

The skill adapts based on context:

- **First-time Stormhelm user**: full walkthrough of the philosophy, structure, and Day/Night shifts.
- **New to this project, knows Stormhelm**: shorter tour focused on the project's active capabilities, vocabulary, and conventions.
- **Refresher**: cheat sheet only, with links to topical files.

## When to invoke

- A new engineer joins the team.
- A contractor or external collaborator gets repo access.
- A developer hasn't touched the project in months.
- After `/setup` completes (the skill suggests it).

## Detection: who is in front of us?

The skill asks one short question first:

```
? How familiar are you with Stormhelm?
  ○ First time — give me the full tour
  ○ I know Stormhelm, but this project is new to me
  ○ I need a refresher / cheat sheet only
```

The path below shows the **full tour**. The other modes are condensed versions.

---

## Full tour (~10 minutes reading)

### Part 1 — The mental model

```
Stormhelm is what you build with when working alongside AI agents.

Three core ideas:
  1. The agent is a new hire every session — externalize knowledge in files.
  2. Behavior is the contract, not code — BDD scenarios are the gate.
  3. Humans drive direction, agents drive volume — Day Shift sets intent,
     Night Shift (Ralph) executes.
```

### Part 2 — Project layout

Skill reads the active `AGENTS.md` and shows the active capability stack:

```
This project's active stack:
  - Core engineering rules (language-agnostic)
  - TypeScript (style + async)
  - TypeScript + Hono (HTTP framework conventions)

Active rule count: §1 – §116
```

Skill walks through the folder map:

```
docs/engineering/        ← the rule set (the AGENTS.md is the index)
docs/CONTEXT.md          ← ubiquitous language (read this before naming anything)
docs/constitution.md     ← inviolable principles
docs/slos.md             ← service level objectives
features/                ← .feature files (the BDD gate)
.planning/               ← Ralph state (don't commit secrets here)
src/
  domain/                ← pure business core, no frameworks
  application/           ← use cases, ports, DTOs
  infrastructure/        ← adapters (HTTP, DB, external)
  entrypoints/           ← runtime bootstraps (server.ts, worker.ts)
```

### Part 3 — The workflow (visualized)

```
DAY SHIFT (you + agent, interactive)
─────────────────────────────────────────────
  /constitution    Define non-negotiables (once per project)
  /grill-me        Agent interrogates you about a feature idea
  /domain-model    Refine CONTEXT.md, add ADRs
  /specify         Capture intent (what + why, no tech)
  /clarify         Resolve ambiguities
  /to-scenarios    Generate Gherkin draft (you approve)
  /to-issues       Decompose into vertical slices
  /plan            Technical plan
  /tdd             Write tests + implementation interactively

NIGHT SHIFT (Ralph, autonomous)
─────────────────────────────────────────────
  ./ralph-local.sh
   Loops over issues labeled `ralph-ready` and:
     - implements via /tdd
     - runs /run-acceptance (gate: all @release scenarios pass)
     - runs /code-review + /security-hardening
     - opens draft PR
     - logs to .planning/ralph-sessions/

NEXT MORNING
─────────────────────────────────────────────
  - Review the draft PRs
  - Approve / request changes
  - /traceability-matrix (audit trail)
```

### Part 4 — How to use the rules

```
Rules are organized as:
  - AGENTS.md is the index (skim once, return as reference)
  - Each topical file is self-contained — load only when relevant
  - Cite by number in PRs: "violates §27 + §42"

Best practice: when reviewing a PR (your own or an agent's), open
the relevant topical file in a split pane. Don't try to memorize.
```

### Part 5 — Your first feature

Skill walks through a concrete example, using the project's actual stack:

```
Try this now:

1. Pick a small feature you understand well.
2. Run /grill-me "I want to <describe in one sentence>"
3. Answer the agent's questions until it has no more.
4. Run /to-scenarios — review the Gherkin output carefully.
5. Run /to-issues — see the vertical slices.
6. Try /tdd on the first issue.
7. When comfortable, mark an issue `ralph-ready` and run Ralph.

This loop is the heart of Stormhelm. Everything else is detail.
```

### Part 6 — Cheat sheet (printed at the end)

```
Stormhelm Cheat Sheet
══════════════════════

FRAMEWORK SKILLS (entry points)
  /setup                Configure Stormhelm for your project (run once)
  /onboard              This orientation (run when joining or returning)
  /feature              End-to-end feature workflow (12 steps, 2 human checkpoints)
  /debug                Disciplined bug fix workflow (6 steps)
  /optimize             Performance optimization with mandatory baseline (5 steps)

WORKFLOW SKILLS (invoked by /feature)
  /constitution         Establish project principles
  /grill-me             Interrogation before coding
  /domain-model         Refine vocabulary in CONTEXT.md
  /specify              Capture intent (what + why)
  /clarify              Resolve underspec
  /to-scenarios         Generate Gherkin (HUMAN APPROVES)
  /to-issues            Vertical slices with scenarios:scn-NNN label
  /plan                 Technical plan
  /tdd                  Red-green-refactor loop
  /run-acceptance       Gate: all @release scenarios pass + visual + Schemathesis + stub + SLO + reviewer
  /code-review          Wrapper that invokes the reviewer sub-agent (ad-hoc only)
  /security-hardening   §84–§90 checks + STRIDE for sensitive paths
  /traceability-matrix  Audit trail for compliance (release time)

LEGACY CODE SKILLS (brownfield sub-flow B1-B5)
  /grill-with-docs           B1 — Interrogate existing code
  /characterization-tests    B2 — Capture current behavior before changing
  /domain-model              B3 — Surface vocabulary drift (also greenfield)
  /impact-analysis           B4 — Map ripple effects of a change
  /strangler-plan            B5 — Plan a gradual replacement (when chosen)

OPERATIONAL & UTILITY SKILLS
  /diagnose             Disciplined debugging loop (used by /debug)
  /triage               Classify and label issues by type/severity/scope
  /prototype            Throwaway code to validate a design question (time-boxed 90 min)
  /handoff              Compact a session for a fresh agent (used by context-monitor)
  /postmortem           Draft postmortem from incident artifacts (when incident:production)
  /improve-codebase-architecture   Surface refactor candidates with ICE rubric

NIGHT SHIFT
  ./ralph-local.sh                Run Ralph against ralph-ready issues
  caffeinate -i ./ralph-local.sh  (macOS) prevent sleep during AFK
  systemd-inhibit ./ralph-local.sh (Linux)

PR REVIEW CITATIONS (most-cited §N)
  §1  Build only validated business needs
  §3  Hexagonal architecture, dependencies point inward
  §19 Result types with `code` for expected failures
  §27 Security gates before domain actions
  §35 PRs should be boring to review
  §42 Map Result to HTTP at the adapter
  §45 tenantId in every repository filter
  §57 Scenarios in ubiquitous language
  §58 .feature files are read-only for agents
  §63 ralph-ready requires scenarios:scn-NNN
  §76 Refactor and behavior change are never the same PR
  §92 Regression test fails-first (before the fix)
  §93 Root cause over symptom; symptom fixes are failure
  §95 Postmortem mandatory when incident:production label present
  §114 Independent code review via reviewer agent before draft PR

KEY FILES (read these in order)
  1. docs/engineering/AGENTS.md          The rule index
  2. README.md                            Project overview
  3. docs/constitution.md                 Inviolable principles
  4. docs/CONTEXT.md                      Ubiquitous language
  5. docs/engineering/core/01-philosophy.md  The mental model
  6. docs/engineering/core/02-architecture.md Layer-first hexagonal

STUCK?
  /grill-with-docs          Ask the codebase
  Read the relevant topical .md file (it's self-contained)
  Check .planning/ralph-sessions/ for prior agent runs on similar issues
```

---

## Mode: "I know Stormhelm, but this project is new to me"

Condensed flow:

1. Show active capabilities.
2. Open `docs/constitution.md` and walk through the project-specific principles.
3. Open `docs/CONTEXT.md` and highlight the vocabulary.
4. List the bounded contexts (parsed from folder structure under `src/contexts/` if present).
5. Show the cheat sheet (Part 6 above).

## Mode: "Refresher / cheat sheet only"

Just print Part 6 (cheat sheet) with a note:

```
Welcome back. Here's the cheat sheet.
Recent changes worth noting:
[parsed from CHANGELOG.md if present, or git log of docs/ in last 14 days]
```

---

## What the skill does not do

- Does not modify files.
- Does not run the workflow on behalf of the user — only orients.
- Does not enforce reading — just suggests an order.

## Pairing with `/setup`

`/onboard` is typically the first thing a developer runs after `/setup` completes. The setup wizard suggests it explicitly:

```
✅ Stormhelm configured for <ProjectName>
Next: /onboard to learn the workflow
```

For team adoption: a tech lead runs `/setup` once for the project; every other developer runs `/onboard` on their first day.
