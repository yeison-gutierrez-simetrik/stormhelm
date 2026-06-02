# docs: rationale lives in docs/decisions (PR-I) + §122 fires at capability adoption (PR-Cap)

## Why bundled

Both PRs touch `skills/domain-model/SKILL.md` — PR-I migrates a path reference, PR-Cap adds a new section. Splitting into two PRs would force PR-Cap to depend on PR-I (stacked PRs, which PR-Group later argues against). Bundled is simpler and the two changes share a domain ("how the framework manages decision context").

## Part 1 — PR-I: rationale moves to `docs/decisions/` (FW-1, round 1)

### Problem

`.planning/grilling/` was the de-facto location for grilling transcripts and rationale. But projects (real case: belong-marketplace) add `.planning/` blanket-style to `.gitignore` as a scratchpad pattern. Result:

- The `reviewer` sub-agent (§114) supposedly reads grilling transcripts to audit decisions — but they don't exist in CI.
- Open questions deferred to stakeholders are lost on machine swap or contributor handoff.
- The framework's own audit-trail promise (§62) contradicted its scratchpad convention.

### Fix

Move durable rationale to `docs/decisions/`, which projects always track because it lives inside `docs/`.

**New:**
- `docs/decisions/README.md` documenting the convention (rationale vs scratch, what goes where, gitignore recommendation).
- `docs/decisions/{grilling,open-questions,clarify-logs}/.gitkeep`.

**Migrated paths in skills:**
- `skills/grill-me/SKILL.md` writes to `docs/decisions/grilling/`.
- `skills/grill-me/references/transcript-format.md` updated.
- `skills/clarify/SKILL.md` (path migration — clarify logs go to `docs/decisions/clarify-logs/`).
- `skills/specify/SKILL.md` + its `references/spec-format.md` references updated.
- `skills/sad/SKILL.md` + its `references/template.md` references updated.
- `skills/domain-model/SKILL.md` path references updated (the migration part).
- `skills/setup/SKILL.md` scaffolds `docs/decisions/` on `mkdir` and lists it in the "tracked" section.
- `docs/WORKFLOWS-GUIDE.md` + `README.md` example paths updated.

**`.gitignore` template** (`task_flow/.gitignore`):
- Explicit list of `.planning/` subpaths to ignore (no blanket `.planning/` rule).
- Comment block referencing `docs/decisions/README.md` for the convention.

**Linter fix in `scripts/check-invariants.mjs`:**
- INV-4 walked both `docs/adr/` and `docs/decisions/` looking for ADRs. PR-I makes the namespaces distinct: ADRs live only in `docs/adr/`. Walk corrected.

## Part 2 — PR-Cap: §122 fires at capability adoption (cross-note)

### Problem

§122 (verify external library APIs against current docs) caught a Better Auth mismatch in belong-marketplace at `/tdd` Step 7 — too late. The ADR had assumed RFC 7662/7009 endpoints stable Better Auth does not ship. Catching it at `/domain-model` time (when the capability is introduced) would have prevented the FR-5 mid-implementation rescope.

### Fix

**`docs/engineering/core/01-philosophy.md` §122:**

New "When to verify — early, not in /tdd" section ordering the invocation points by ascending cost-of-failure:

1. `/setup` capability adoption — verify capability metadata against current docs.
2. `/domain-model` Step 3 — verify symbols/endpoints the ADR/spec assumes exist.
3. `/tdd` Step 7 — last-line defense (failure here is a process bug).

**`skills/domain-model/SKILL.md` Step 3:**

New block "§122 invocation (PR-Cap)" with the explicit rule: before writing a third-party term into `CONTEXT.md`, run a Context7 lookup against the specific symbols the ADR/spec depends on. Stop and surface the discrepancy if Context7 contradicts the assumption. Cites the Better Auth incident as the motivating example.

## Acceptance

- [x] All `.planning/grilling/` references in framework files migrated to `docs/decisions/grilling/` (no false positives in `grilling-docs/` which is unrelated).
- [x] Framework linter green after merge.
- [x] INV-4 walk fix correctly counts only ADRs in `docs/adr/`, not the rationale README.
- [x] §122 amendment integrates without breaking existing skills that already invoke it (notably the reviewer agent's `§122 enforcement`).

## Notes for the reviewer

- The migration is mechanical (sed) for most files. Manual edits only in `setup/SKILL.md` (directory creation script) and `domain-model/SKILL.md` (PR-Cap addition).
- Existing projects that pre-date this PR can keep their `.planning/grilling/` files; the migration applies forward. They can migrate when convenient.
- The `task_flow/.gitignore` template is the recommended starting point; projects free to deviate but the README explicitly warns against blanket `.planning/` rules.

Refs:
- belong-marketplace `.planning/framework-feedback/stormhelm-improvements-20260529.md` (FW-1).
- belong-marketplace `.planning/framework-feedback/slice01-part2-tdd-to-merge.md` (cross-note on §122).
