---
name: gates
description: |
  Runs the pre-merge gate chain in the correct order with the right de-duplication,
  for developers who work à-la-carte (invoking individual skills) instead of through
  /feature. Orchestrates check-consistency (off-ramp) → run-acceptance (which owns the
  reviewer §114) → security-hardening (sensitive paths only) → traceability-matrix
  (pre-merge draft), then hands off to the human merge + post-merge close-out.
  Use when: a slice is implemented (/tdd done) and you want it gated for merge but are
  NOT running the full /feature orchestrator. Do NOT use mid-implementation, or to
  re-run a gate that already passed in this slice.
---

# /gates — Pre-Merge Gate Chain (à-la-carte orchestrator)

## Purpose

`/feature` runs the whole pipeline and gets the gate **ordering and de-duplication** for free. But many developers work à-la-carte — invoking `/run-acceptance`, `/code-review`, `/security-hardening`, `/traceability-matrix` by hand. Done in the wrong order or combination, that loses the guarantees `/feature` encodes:

- The `reviewer` agent (§114) is invoked **once**, by `/run-acceptance` Step 8. Running `/code-review` *and* `/run-acceptance` separately invokes it twice — redundant, double the token spend.
- The traceability matrix is a `-draft` **pre-merge** and is finalized to `-final` **post-merge** (Step 13). Running it only once, pre-merge, leaves a stale draft anchored to a branch commit that may change at merge.
- `/check-consistency` belongs **before** the matrix (so the matrix audits a reconciled chain), not after.

`/gates` is the thin orchestrator that preserves all of this without committing to the full `/feature` flow. It is **composition, not duplication** — it invokes the same skills, in the right order, with the dedup rules applied.

> This skill exists because of FW-1: the second-half skills assume `/feature` orchestration for their ordering/dedup guarantees, but are commonly run standalone. `/gates` is the happy path for standalone gating; the individual skills also now carry "if invoked alone, preserve this ordering" notes so the bare à-la-carte path is safe too.

## When to invoke

- A slice is implemented (`/tdd` green) and you want it gated for merge, outside `/feature`.
- After addressing reviewer findings, to re-gate before opening/merging the PR.

## When NOT to invoke

- Mid-implementation (gates run on a finished slice).
- Inside `/feature` — Steps 11-13 already run this chain; `/gates` would double-invoke.
- To re-run a single gate that already passed for this slice (invoke that skill directly).

## The chain (in order)

1. **`/check-consistency`** *(off-ramp — only if the spec, scenarios, or ADRs changed during implementation)*. Reconciles cross-artifact drift so the matrix audits a consistent chain. Skip if nothing upstream changed.
2. **`/run-acceptance`**. Runs the `@release`/`@smoke` scenarios **and invokes the `reviewer` agent (§114) — this is the single reviewer invocation for the slice.** Its report lands in `.planning/acceptance/<slug>-*.md` and is attached to the PR.
   - If the reviewer returns 🛑 blocking findings → fix via `/tdd` (one iteration), then re-run `/gates` from step 2.
3. **`/security-hardening`** *(only if the slice touches sensitive paths per §64, or the issue has `require-human-review`)*. Otherwise skip — the reviewer already covered §27 etc.
4. **`/traceability-matrix`** — writes the **`-draft`** matrix (pre-merge; not anchored to a merged commit yet).
5. **⛔ Human merge** (HUMAN CHECKPOINT 2). Run the §67 merge-safety asserts (`scripts/check-merge-safety.mjs <pr> pre`). `/gates` does **not** merge.
6. **Post-merge close-out** (`/feature --close <issue>` or manually): `check-merge-safety <pr> post`, re-run `/traceability-matrix` to produce the **`-final`** matrix anchored to the merged commit, and close the issue(s) — see `/feature` Step 13.

## De-duplication rules `/gates` enforces

- **Reviewer once.** `/gates` never calls `/code-review` when it calls `/run-acceptance` — Step 8 of `/run-acceptance` already invokes the reviewer. (`/code-review` is for an *ad-hoc* review outside a gating run.)
- **Matrix twice, by design.** Once pre-merge (`-draft`), once post-merge (`-final`). INV-8 enforces the `-final` exists for an implemented feature.
- **Consistency before matrix.** Never audit an unreconciled chain.

## What this skill never does

- Re-invoke the reviewer a second time.
- Merge (human-only, §67).
- Run gates on an unfinished slice.
- Replace `/feature` — it is the standalone-mode equivalent of `/feature` Steps 11-13.

## Integration with the framework

- **Standalone-mode counterpart of `/feature` Steps 11-13.**
- **Invokes** `/check-consistency`, `/run-acceptance` (→ `reviewer` §114), `/security-hardening`, `/traceability-matrix`.
- **Read by the `reviewer` agent** indirectly: the chain produces the evidence the reviewer and `/traceability-matrix` consume.
