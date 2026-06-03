---
name: verify-framework-consistency
description: |
  Verifies that Stormhelm's own documentation stays consistent with its
  filesystem: skill/hook/agent/rule/file/step counts, §N rule references, and
  skill references. Runs scripts/check-framework-metadata.mjs (zero-dependency
  Node) and reports any drift. This is the META-framework counterpart to
  /check-consistency: where /check-consistency reconciles a PROJECT's planning
  artifacts (spec ↔ feature ↔ issue), this skill reconciles the FRAMEWORK's
  prose against its own repo.
  Use when: editing framework docs (README, AGENTS.md, WORKFLOWS-GUIDE, any
  SKILL.md), adding/removing a skill/hook/agent/rule, or before opening a PR to
  the framework repo. Also runs automatically in CI
  (.github/workflows/verify-framework-metadata.yml). Do NOT use for project
  artifact drift — that is /check-consistency.
---

# /verify-framework-consistency — Framework Self-Consistency Check

## Purpose

Counts and references that live in prose drift from the filesystem. PRs #7 and
#8 were *pure count-sync* (rule count, skill/hook/step counts) and PR #3
re-introduced "28 skills" the same day the repo reached 30. The root cause:
the framework documents derivable facts by hand and nothing re-verifies them.

This skill runs a linter that **derives the truth from the filesystem** and
fails if the canonical metadata phrases disagree. It never rewrites prose — it
verifies claims, and the contributor fixes the divergence.

## When to invoke

- Before opening any PR to the framework repo.
- After adding/removing a skill, hook, agent, rule file, or rule (§N).
- After editing README, `docs/engineering/AGENTS.md`, `WORKFLOWS-GUIDE.md`, or any `SKILL.md`.
- It also runs in CI on every PR (`.github/workflows/verify-framework-metadata.yml`).

## When NOT to invoke

- For a project's spec ↔ feature ↔ issue drift → that is `/check-consistency`.
- For semantic review of rule content → that is the `reviewer` agent.

## What it checks

| Check | Severity | What |
|---|---|---|
| Cardinality | BLOCK | Canonical phrases — "N invokable skills", the version footer `(N reglas, N skills, N agente, N hooks, N steps)`, "Active rule count: §1–§N", "N rule files / archivos de reglas", "N steps with N human checkpoints", "the N rules", "N (core) rules" — must equal the filesystem count. |
| Rule references | BLOCK | Every `§N` cited in docs/skills must resolve to a rule defined in `core/` or `capabilities/` (`-py` twins recognized). |
| Phantom skills | WARN | A `/slug` in a markdown link or cheat-sheet row should have `skills/<slug>/SKILL.md`. (Catches renamed/ghost skills, e.g. `/slice-plan` vs `/plan`.) |

It is **precision-first**: it matches only canonical metadata phrasings, not
every `<number> <noun>`, so it does not false-fail on rule numbers
(`§107 Agent Teams`) or hypotheticals (`only 5 skills`).

## How to run

```bash
node scripts/check-framework-metadata.mjs
```

Exit 0 = consistent. Exit 1 = blocking mismatch (printed with `file:line`).

## Resolving a failure

1. **The prose is wrong** (the usual case): fix the number/reference to match the filesystem.
2. **The line is intentionally hypothetical** (e.g. "when there are only 5 skills"): add a trailing `<!-- metadata-ok -->` to suppress that single line.
3. **You added a skill/hook/rule**: update every canonical count phrase the linter flags. (This is the point — the gate forces the update that PRs #3/#7/#8 missed.)

## Integration with the framework

- **CI gate**: `.github/workflows/verify-framework-metadata.yml` runs it on every PR touching docs/skills/agents/hooks; a failure blocks merge.
- **Sibling of `/check-consistency`**: that skill audits a project; this audits the framework itself.
- **Read by the `reviewer` agent**: a clean run is evidence the PR did not introduce metadata drift.

## What this skill never does

- Rewrite or generate prose (it verifies, the human fixes).
- Check semantic correctness (only counts and references).
- Audit project artifacts (that is `/check-consistency`).
