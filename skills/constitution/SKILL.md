---
name: constitution
description: |
  Establishes (or revises) the project's `docs/constitution.md` — the non-negotiable
  principles that override every other rule for THIS specific project. Combines the
  framework's §N defaults with the project's compliance requirements, sensitive
  domains, and architectural tenets to produce a single source of truth for what
  the team will never compromise. Run once at project start (after /setup), and
  re-run only when a foundational tenet changes (e.g., new compliance framework
  added, major stack change).
  Use when: starting a new project after /setup, onboarding to a project missing a
  constitution, formalizing a previously implicit principle, responding to a compliance
  audit requirement.
---

# /constitution — Project Constitution

## Purpose

`docs/constitution.md` is the **project's last word**. When a framework §N rule and the constitution disagree, the constitution wins (see `agents/reviewer.md` "Constitution overrides"). This skill produces or revises that document deliberately, after asking the human enough questions to know what the project will not compromise on.

## When to invoke

- Right after `/setup` produces the template `constitution.md`.
- When a new compliance requirement appears (SOC2, ISO 27001, EU AI Act, GDPR, HIPAA).
- When a tenet that was implicit becomes contested (someone proposed something that "feels wrong" and you realize the rule was never written down).
- Annually as part of governance review.

## When NOT to invoke

- For tactical decisions (those go in ADRs in `docs/adr/`, not the constitution).
- For style preferences (those live in `capabilities/<stack>/03-style.md`).
- To revise a §N framework rule — propose that upstream instead.

## Inputs

- `docs/constitution.md` template (created by `/setup`) or the current version.
- Active capabilities (from `docs/engineering/AGENTS.md`).
- Compliance requirements (from `/setup` answers or fresh interview).
- The project's PRD vocabulary (from `docs/CONTEXT.md`).

## Outputs

- `docs/constitution.md` finalized: principles `C.1`, `C.2`, ... each with title, rationale, rule it overrides (if any), and an example of a decision it makes obvious.
- Commit message: `docs: establish constitution v1` (or `vN` if revising).

## Workflow

### Step 1 — Interview for non-negotiables

Ask the human these questions in order. Stop when answers are firm:

1. **Architecture**: what is the one architectural choice you will never compromise? (Examples: hexagonal layer-first §3; event-sourcing; CQRS; monolith-first.)
2. **Coverage minimums**: what is the floor below which code cannot ship? Per layer? Per module type?
3. **Security defaults**: what are the security tenets nobody overrides? (PII handling, secret rotation, auth required by default, etc.)
4. **Data**: what data invariants are absolute? (Money is integer cents §11; tenant isolation §45; immutable audit log.)
5. **Process**: what process discipline is law? (Test fails-first §92; one bug one PR §94; no force-push; reviewer required §114.)
6. **External commitments**: any compliance, contractual, or regulatory obligations that translate to code-level rules? (SOC2 retention, GDPR right-to-delete, EU AI Act traceability.)

### Step 2 — Translate to numbered principles

Each answer becomes a `C.N` principle. The structure:

```markdown
## C.5 — Money is stored as integer cents, never floats

**Rationale.** Float arithmetic for money produces rounding errors that compound
across transactions. Every prior incident report in this codebase that touched
money involved a float.

**Overrides.** None — this is consistent with §11.
**Strengthens.** §11 (integer units) — promotes from default to absolute.

**Example decision.** A PR that introduces `price: number` for a USD value is
rejected, regardless of whether tests pass.
```

If a principle goes **beyond** a framework rule, mark it with **"Strengthens §N"**. If it **contradicts** a framework rule, mark it with **"Overrides §N"** and explain why this project is different.

### Step 3 — Human approval

Present the draft. Explicit confirmation required per principle. Open questions tracked separately in `docs/adr/`.

### Step 4 — Commit and integrate

- Write `docs/constitution.md`.
- Update `AGENTS.md` to reference the constitution as a precondition for `reviewer` agent (§114).
- Notify the team: this is the contract.

## Integration with the framework

- **`reviewer` agent (§114)** cites `C.N` alongside `§N` when relevant.
- **`/feature` Step 1** verifies `constitution.md` exists before proceeding.
- **`/code-review` skill** loads the constitution as its first input.
- **`/setup`** creates the template; this skill fills it in.

## Output template

```markdown
# <Project name> Constitution

> Principles that override everything else. Never compromised by tactical decisions.
> When §N framework rules and the constitution disagree, the constitution wins.

**Version:** 1.0
**Established:** YYYY-MM-DD
**Reviewed:** YYYY-MM-DD
**Owner:** <team or person>

## C.1 — <Title>
**Rationale.** ...
**Overrides / Strengthens.** §N — ...
**Example decision.** ...

## C.2 — ...
```

## What this skill never does

- Inventing principles the human did not approve.
- Burying compliance obligations as "suggestions."
- Editing `docs/constitution.md` without the human in the loop (read-only after approval; revisions require a new run of this skill).
