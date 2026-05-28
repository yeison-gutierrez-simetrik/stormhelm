---
name: check-consistency
description: |
  Detects cross-artifact drift after edits to any planning artifact —
  `CONTEXT.md`, constitution, spec, ADRs, `.feature` files, issues, plans, SAD.
  Walks the planning chain top-down, extracts claims from each artifact, finds
  differences, and resolves each one with the human via multiple-choice
  approval. Different from `/clarify` (which finds ambiguity inside one spec)
  and `/domain-model` (which resolves vocabulary drift between code and docs);
  this skill reconciles **artifact ↔ artifact** drift.
  Use when: a spec, ADR, or CONTEXT.md was edited and you suspect downstream
  artifacts drifted; before opening a release; before /traceability-matrix
  runs to ensure the chain it audits is internally consistent; after a major
  /clarify pass that changed FRs.
---

# /check-consistency — Cross-Artifact Reconciliation

## Purpose

`/clarify` prevents drift within one document. `/domain-model` resolves drift between code and `CONTEXT.md`. Neither catches the dominant failure mode of a long-running project: **edits to one artifact silently invalidate sibling artifacts**.

Examples this skill catches:

- The spec's FR-3 was edited to add a 5-minute timeout, but the `.feature` file's `Then` step still asserts no timeout.
- ADR-0014 chose Redis for caching; the spec still says "in-memory cache".
- A scenario was deprecated but the issue tagged `scenarios:scn-021` is still `ralph-ready`.
- `CONTEXT.md` renamed `Customer` → `Tenant`; three open issues still say `Customer`.

A single skipped reconciliation can compound into days of wrong work. `/check-consistency` makes the reconciliation explicit, sequential, and approved.

## When to invoke

- After any edit to `CONTEXT.md`, `constitution.md`, a spec, or an ADR — before downstream work resumes.
- Before opening a release.
- Before `/traceability-matrix` runs at release; the matrix is only as good as the chain.
- After a major `/clarify` pass that changed FRs or NFRs.
- Quarterly on the whole project (governance sweep).

## When NOT to invoke

- Within a single artifact for ambiguity → `/clarify`.
- For code-vs-docs vocabulary drift → `/domain-model` Step 2.
- For "the code does not satisfy the scenario" — that's `/run-acceptance`, not consistency.
- For a brand-new feature with no prior artifacts — there is nothing to reconcile.

## Relationship with the `reviewer` agent

This skill does **not** replace the `reviewer` agent (§114). They are orthogonal and both run pre-merge:

| Concern | Tool |
|---|---|
| Code violates rule §N (e.g., §27 authorization, §45 tenant isolation) | `reviewer` agent |
| Spec ↔ `.feature` ↔ issue ↔ plan drift | `/check-consistency` |
| Code vs `CONTEXT.md` vocabulary drift | `/domain-model` Step 2 |
| Ambiguity inside a single artifact | `/clarify` |

**Rule of thumb:** the `reviewer` audits **code vs rules**; this skill audits **artifact vs artifact**. Both are required for a release-ready slice; neither replaces the other.

## Inputs

- The **changed artifact** named by the user (if any). If none is named, infer from `git status`, `git diff --name-only main`, and recent issue updates.
- The **planning chain** to walk (default order, top-down):
  1. `docs/constitution.md`
  2. `docs/CONTEXT.md`
  3. `docs/adr/*.md`
  4. `docs/specs/<feature>.md`
  5. `docs/architecture/<scope>-*.md` (if `/sad` was used)
  6. `features/<context>/*.feature`
  7. Open issues for this feature
  8. `.planning/plans/<feature>/*.md`

## Outputs

- A reconciliation report at `.planning/consistency/<scope>-<YYYYMMDD>.md` listing every difference found, the chosen resolution, and the artifact touched.
- Patches applied **only after human approval** to the downstream artifacts.

## Workflow

### Step 1 — Resolve the scope

Ask one MCQ if scope is not obvious from invocation:

```markdown
**Q.** What is the reconciliation scope?

- **(a) Single feature** — ✅ recommended when the user named a changed artifact. Walk the chain for that feature only.
- **(b) Bounded context** — when multiple features share a context and a constitution-level change happened.
- **(c) Whole project** — quarterly sweep; high cost.
- **(d) Other / correction** — describe.
```

### Step 2 — Gather artifacts in chain order

Read **only** the artifacts in scope. Do not read code at this stage — drift between code and docs belongs to `/domain-model` and `/run-acceptance`, not here.

### Step 3 — Extract claims per artifact

For each artifact in scope, extract a **claim list**. A claim is a short statement that the artifact asserts about the system. Track for each claim:

- **Source artifact** (e.g., `spec FR-3`).
- **Claim text** (verbatim or close paraphrase).
- **Intended destinations**: which downstream artifacts should reflect this claim (e.g., FR-3 → `feature@scn-007 Then step`, `issue #42 acceptance criteria`).
- **Observed status in each destination**: `present | missing | stale | contradicted | removed | out-of-place`.

Pseudocode in prose:

> "Spec FR-3 says: 'Quote acceptance must complete within 5 minutes.' Expected in scn-007 `Then` step → currently asserts 'completes successfully' with no timeout (status: stale). Expected in issue #42 acceptance criteria → matches (status: present). Expected in plan-007.md → not mentioned (status: missing)."

### Step 4 — Classify each difference

Before asking the human, classify each found difference into exactly one bucket:

- **Improvement** — adding or clarifying it improves consistency or completeness. Low controversy.
- **Stale-downstream** — the upstream artifact moved; the downstream is wrong because nobody updated it. Default fix: update downstream.
- **Stale-upstream** — the downstream evolved during implementation; the upstream document is out of date. Default fix: update upstream (and check if it implies new ADR).
- **Contradiction** — the two artifacts disagree and neither is obviously right. Requires human decision.
- **Removed** — claim was deliberately removed somewhere; the question is whether the removal should propagate.

### Step 5 — Resolve one difference at a time

For each difference, present a multiple-choice question. The recommendation depends on the classification:

```markdown
**D{n}.** {short description of the difference}

- **Source**: `{file}` — quoted claim.
- **Downstream**: `{file}` — observed state.
- **Classification**: stale-downstream.

How to resolve?

- **(a) Update downstream to match source** — ✅ recommended for stale-downstream when source artifact has higher authority (constitution > spec > scenarios > issues > plans).
- **(b) Update source to match downstream** — recommended when implementation revealed the source was wrong; this typically requires a new ADR.
- **(c) Both are wrong; introduce a third resolution** — describe.
- **(d) Defer** — record in `.planning/consistency/<scope>-<YYYYMMDD>.md` as unresolved with a reason. Use sparingly.
- **(e) Other / correction** — describe.
```

Apply **only** the human-approved patches. Stop and ask if a single resolution would invalidate ≥3 prior approvals (signal that the chain has deeper problems).

### Step 6 — Special case: vocabulary drift

If a `CONTEXT.md` term was renamed and downstream artifacts still use the old name, do **not** auto-rewrite. Hand off to `/domain-model` Step 2, which already handles vocabulary drift with the proper §22 discipline. Record the hand-off in the consistency report.

### Step 7 — Special case: scenario removal

If a scenario was removed from a `.feature` file and any issue is still labeled `scenarios:scn-NNN` for that scenario, the issue cannot remain `ralph-ready`. Two valid resolutions, presented as MCQ:

```markdown
- **(a) Strip the label and add `ralph-blocked`** — ✅ recommended when the scenario is intentionally retired. The issue requires re-scoping.
- **(b) Restore the scenario in the `.feature` file** — when the removal was accidental.
- **(c) Other / correction** — describe.
```

### Step 8 — Write the report

`.planning/consistency/<scope>-<YYYYMMDD>.md` records:

- Differences found per classification.
- Resolutions chosen + rationale.
- Patches applied (with file paths and line ranges).
- Unresolved-and-deferred items with reason.
- Hand-offs to other skills (`/domain-model`, `/clarify`).

### Step 9 — Return

Tell the human:

- Count of differences found, resolved, deferred.
- Critical chain breaks that require re-running `/run-acceptance` or `/traceability-matrix`.
- The next workflow step.

## Integration with the framework

- **Invoked manually** after any edit to a planning artifact.
- **An optional off-ramp in `/feature`** — after `/run-acceptance` (Step 11) and **before** `/traceability-matrix` (Step 12) — when the spec/scenarios changed during implementation, so the matrix audits a consistent chain.
- **Output feeds `/traceability-matrix`**: the matrix can assume the chain is consistent at release.
- **Read by `reviewer` agent** when reviewing a PR whose scenarios changed; the consistency report is evidence that the chain was reconciled.

## What this skill never does

- Auto-apply patches without human approval, even for "obvious" improvements.
- Reach into code to "fix" the implementation to match the docs — that's `/run-acceptance` / `/debug`.
- Resolve vocabulary drift directly — hands off to `/domain-model`.
- Re-write history (no force-pushes, no rebases). Patches are forward-only.
- Cover code-vs-docs drift — only artifact-vs-artifact.

## Attribution

The "extract claims, classify differences, resolve one at a time" pattern is adapted from `/alejo-consistency-propagation` in `sandcastle-synth`. The MCQ format is shared with `/grill-me` and `/clarify`.
