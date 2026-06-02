---
name: feature
description: |
  End-to-end feature development workflow. Takes a feature description (inline text or a
  reference to a .md file) and orchestrates the full Stormhelm pipeline from intent to
  draft PR in a single invocation: constitution lookup, grilling, domain modeling, spec,
  clarification, scenario generation, vertical-slice issue decomposition, technical plan,
  TDD implementation, acceptance verification, code/security review, and traceability
  matrix update. Maintains one human checkpoint after /to-scenarios (for scenario
  approval) and one before merge. Internally delegates to the same skills that are
  invokable individually — /feature is composition, not duplication.
  Use when: starting a new greenfield feature where you trust the workflow and want a
  single trigger. For brownfield or bug work, use /debug or the brownfield sub-flow
  individually. Compatible with Agent Teams (§107) for multi-module features.
---

# /feature — End-to-End Feature Development

## Purpose

`/feature` is the monolithic counterpart to running the 12-step Stormhelm workflow by hand. It exists for the case where:

- The feature is greenfield (not brownfield — for that, see `core/14-brownfield.md`).
- You want a single trigger that runs the pipeline.
- You trust the rules (§1-§122) to enforce themselves throughout.
- You want one explicit human checkpoint (after `/to-scenarios`) rather than 12 mini-checkpoints.

Internally, `/feature` invokes the same skills that are callable individually. It is **composition, not duplication**. The result is identical to running each skill in sequence by hand; the difference is operational ergonomics.

## When to invoke

- A new feature with a clear intent and no obvious brownfield risk.
- A team that has internalized the workflow and wants to skip the manual orchestration.
- Multi-module features that benefit from Agent Teams (§107) — `/feature` detects and switches modes.

## When NOT to invoke

- Bug fix → use `/debug`.
- Brownfield modification → use the B1-B5 sub-flow from `core/14-brownfield.md`.
- Performance optimization → use `/optimize`.
- The first feature in a new project → run `/setup` first, then `/onboard`, then your first `/feature`.
- You want maximum control of each step → use the 12-step workflow by hand.

## Inputs

- A feature description as inline text:
  ```
  /feature "Provider can publish a verified Listing with a price in cents"
  ```
- Or a reference to a markdown file:
  ```
  /feature @docs/briefs/listing-publication.md
  ```

## Outputs

- A draft PR per vertical slice (per §67), on branches `agent/feature-<slug>-<issue-NNN>`.
- All artifacts in canonical locations:
  - `docs/specs/<feature>.md` (from `/specify`)
  - `docs/CONTEXT.md` (updated by `/domain-model`)
  - `features/<context>/<feature>.feature` (from `/to-scenarios`, human-approved)
  - `features/<context>/contracts/<module>/` (from `/to-issues` if multi-module per §103)
  - `issues/*.md` (from `/to-issues`)
  - One traceability matrix snapshot.

## Status transitions (§58)

This orchestrator owns two `.feature` status flips:

- **Step 7 — HUMAN CHECKPOINT 1:** after the human confirms in chat, flip `# status: clarifying → approved` and write `approved_at`, `approved_by`, `approved_in_commit` (the checkpoint commit SHA). From here the file is read-only to the agent.
- **Step 13 — post-merge close-out:** flip `approved → implemented` once all `@release` scenarios are green on the default branch.

## Workflow — 13 steps with 2 human checkpoints

> The 2 human checkpoints map to the `WORKFLOWS-GUIDE` HITL inventory (synonyms): **HUMAN CHECKPOINT 1 = HITL #1** (scenarios, Step 7); **HUMAN CHECKPOINT 2 = HITL #3** (merge, Step 12). A conditional **HITL #2** (threat-model approval) applies in Step 12 when `require-human-review` is set.

The agent **cannot skip steps**. Each step calls the corresponding individual skill or rule.

### Step 1 — Pre-flight checks

Verifies the project is set up:

- `docs/engineering/AGENTS.md` exists (Stormhelm configured via `/setup`).
- `docs/constitution.md` exists.
- `docs/CONTEXT.md` exists (even if minimal).
- Git working tree is clean (no uncommitted changes).
- No active Ralph session is touching the same files.

If any check fails, the skill stops with a clear remediation message.

### Step 2 — Read constitution (§ index)

> `/constitution` is a **precondition**, run **once per project** before `/feature` — not a step `/feature` invokes. This step only **reads** the existing `docs/constitution.md`.

Lists the active capabilities and the relevant §N for the feature type. Detects:

- UI involved → §104 (visual gate) applies.
- Public API endpoints → §105 (Schemathesis) applies.
- Sensitive domain → §64 (`require-human-review`) applies.
- Multi-module (>2 bounded contexts) → §107 (Agent Teams) applies.

### Step 3 — `/grill-me` (interrogation)

Invokes the existing `/grill-me` skill against the feature description. The agent asks 40-100 questions across:

- User & business value.
- Edge cases.
- Success criteria.
- Constraints.
- Anti-requirements (what NOT to build).

Stops asking when the design tree is resolved.

### Step 4 — `/domain-model` (ubiquitous language)

Invokes `/domain-model`. Updates `docs/CONTEXT.md` with any new vocabulary the feature introduces. Generates or updates ADRs in `docs/adr/` if architectural decisions emerge.

### Step 5 — `/specify` (intent capture)

Invokes `/specify`. Produces `docs/specs/<feature>.md` with the what + why + acceptance criteria in user-language, **not** technical jargon.

### Step 6 — `/clarify` (resolve ambiguity)

Invokes `/clarify`. Detects underspecified areas and asks targeted questions. Updates the spec.

### Off-ramps after Step 6 (optional — not counted in the 13)

Two optional skills branch off here, **before** scenarios are written:

- **`/prototype`** — when a design/UX question is genuinely contested; produces a throwaway spike + `LEARNING.md`, then is discarded.
- **`/sad`** — when the feature is multi-module (≥3 modules / ≥2 bounded contexts) or touches a sensitive path; assembles the Solution Architecture Document. **Mandatory for multi-module** per §107.

Both feed back in before Step 7. They are off-ramps, not numbered steps.

### Step 7 — `/to-scenarios` (Gherkin generation, ⛔ human checkpoint)

Invokes `/to-scenarios`. Generates `.feature` file draft in `features/<context>/<feature>.feature` with stable `scn-NNN` IDs, tagged `@release` / `@smoke` / `@manual` per §60.

**⛔ HUMAN CHECKPOINT 1**:

> *"I've drafted N scenarios across M modules. Please review `features/<context>/<feature>.feature` and approve. The agent cannot modify this file once you approve (per §58). Reply `yes` to continue, or `edit:<feedback>` to iterate."*

The skill waits. Once approved, the `.feature` file is committed by the human (or marked approved). The agent treats it as read-only from this point.

### Step 8 — `/to-issues` (vertical-slice decomposition)

Invokes `/to-issues`. Produces issue files in `issues/` directory, each with:

- Stable ID.
- Linked `scn-NNN` IDs (via GitHub labels per §59).
- Module assignment (if multi-module → §107 Agent Teams).
- `severity:p2` default (since this is greenfield, not a bug).
- `shift:afk` or `shift:hitl` per §63.

For multi-module features (§107 detected), also produces `features/<context>/contracts/<module>/` skeletons per §103: `api-contracts.ts`, `openapi-spec.yaml`, `mocks.ts`, `architecture.md`.

### Step 9 — `/plan` (technical plan)

Invokes `/plan`. Generates the technical plan per slice. References the active capabilities and stack-specific rules.

### Step 10 — `/tdd` per slice (or Agent Teams if §107 applies)

For each slice:

**Single-agent path:**

- Invokes `/tdd`.
- Red-green-refactor per §92.
- Stops at the first failing scenario from `/run-acceptance`.

**Agent Teams path (§107):**

- Lead enters delegate mode.
- Teammates implement modules in parallel against the contracts from Step 8.
- Reviewer teammate runs continuously.
- Each teammate marks tasks as complete; dependents unblock automatically.

### Step 11 — `/run-acceptance` (gate) — explicit retry policy

Invokes `/run-acceptance` with the full gate:

- All `@release` scenarios pass.
- §104 visual gate if UI is involved.
- §105 Schemathesis if public API endpoints exist.
- §106 stub detection on frontend.
- §83 SLO gate if measurable performance targets exist.

**Retry / abort policy (explicit, governs Steps 10 ↔ 11 loop):**

| Step 11 outcome | Action | Tokens consumed against budget |
|---|---|---|
| ✅ All gates pass + 0 🛑 blocking + 0 ⚠️ should-fix | Continue to Step 12 | nominal |
| ✅ Pass + 0 🛑 + 1+ ⚠️ should-fix | Continue to Step 12; reviewer report goes in PR body; human decides at HUMAN CHECKPOINT 2 | nominal |
| ✅ Pass + 0 🛑 + 1+ 💡 suggestions | Continue to Step 12 (suggestions are informational) | nominal |
| 🛑 Blocking finding (reviewer) — **1st time** | Return to Step 10 (`/tdd`) with the reviewer's report as input; one extra iteration permitted | +1 iteration against `max-iterations` |
| 🛑 Blocking finding — **2nd time on same slice** | Mark issue `ralph-blocked` with attached report; do **not** retry further; surface to human | +final iteration |
| Technical gate fails (Schemathesis 5xx, SLO breach, visual gate fail) | Treat as 🛑 blocking; same retry policy | +1 iteration |
| §92 fails-first cycle did not actually fail when reverted | Treat as 🛑 blocking (the test does not catch the bug); return to Step 10 to tighten the test | +1 iteration |
| Token budget for the issue (`budget:NNk` label) exhausted at any point | Stop immediately; invoke `/handoff`; mark issue `budget-exceeded`; never retry past budget | session ends for this issue |
| `@smoke` scenarios fail | Treat as 🛑 blocking; same retry policy (smoke is the harshest gate) | +1 iteration |

**Anti-pattern (forbidden):**

- Retrying indefinitely "until it passes." The 2-iteration cap is hard.
- Suppressing a 🛑 finding by changing the test instead of the implementation.
- Marking a slice `ralph-done` when `@release` scenarios failed.

### Off-ramp after Step 11 (optional — not counted in the 13)

- **`/check-consistency`** — if the spec, scenarios, or ADRs changed during implementation, reconcile cross-artifact drift **before** `/traceability-matrix` (Step 12) audits the chain.

### Step 12 — `/security-hardening` + `/traceability-matrix` + ⛔ human merge

For each completed slice:

- Invokes `/security-hardening` if `require-human-review` label is set (sensitive domain per §64).
- Updates the traceability matrix per §62.
- Opens a draft PR per §67 (always `--draft`).
- Applies the `ralph-done` label when the draft PR opens (slice implemented + gated, awaiting human merge). Step 13 then transitions `ralph-done` → `released`. (Ralph's `ralph-local.sh` does the same after its draft PR.)

**Note on reviewer agent:** the `reviewer` sub-agent (§114) was **already invoked** by `/run-acceptance` Step 8 in the previous step. Its report is included in `.planning/acceptance/<slug>-*.md` and is attached to the PR description automatically. Step 12 does **not** re-invoke the reviewer — that would be redundant and double the token spend.

If the reviewer's report from Step 11 contained 🛑 blocking findings, the workflow already returned to `/tdd` (one extra iteration allowed). By the time Step 12 runs, the diff has either passed reviewer with no blocking findings, OR the issue has been marked `ralph-blocked` and Step 12 never executes for that slice.

**Optional: `/improve-codebase-architecture` invocation.** If `/tdd` Step 10 noticed an anti-pattern (e.g., a §25 violation in 3+ places, a shallow module candidate, vocabulary drift) but the fix was out of scope for the current slice, Step 12 optionally invokes `/improve-codebase-architecture` to surface those candidates as `improvement:tech-debt` issues. This converts a one-time observation into a tracked backlog item without bundling the cleanup into the current PR (§94 + §102).

This invocation is **opt-in** based on a `surface-tech-debt` flag in the slice's plan. Default: off, to keep the workflow lean. Active when the spec or `/grill-me` transcript explicitly mentions architectural concerns adjacent to the feature.

**⛔ HUMAN CHECKPOINT 2** (per §67):

> *"Feature complete. N draft PRs ready for review:*
> - `agent/feature-<slug>-001` — slice 1 (scenarios scn-NNN, scn-NNN)
> - `agent/feature-<slug>-002` — slice 2 (...)
>
> *No PRs auto-merge. Review each, mark ready when satisfied, and merge."*

The skill does not auto-merge; human always closes the loop.

**⚠️ Merge safety asserts (mandatory, §67).** Before invoking `gh pr merge`, run:

```bash
node scripts/check-merge-safety.mjs <pr_number> pre
```

The script refuses if `mergeable ≠ MERGEABLE` or `mergeStateStatus ≠ CLEAN` (especially `UNKNOWN`, which means GitHub is still recomputing mergeability — merging in this state has caused silent commit loss in production, cf. belong-marketplace PR #9). If the check fails, **WAIT and re-run**, do not bypass.

### Step 13 — Post-merge close-out — **MANDATORY**

`/feature` does not end at PR creation. After the human merges the PR (at HUMAN CHECKPOINT 2), Step 13 closes the feature lifecycle. This step runs **once per merged PR**, triggered by the merge event (manually invoked, or by a GitHub Action that calls `/feature --close <issue>`).

**Step 13 is mandatory, not optional.** It is enforced mechanically by **INV-8** (`scripts/check-invariants.mjs`): a feature at `# status: implemented` whose scenarios are not pinned to a `traceability-v*-final.md` matrix fails the invariant gate and blocks release certification (`/traceability-matrix`). The pre-merge matrix from Step 12 is a `-draft`; only the post-merge Step 13 run produces the `-final` anchored to the merged commit. Skipping Step 13 is therefore caught, not silently tolerated.

**Actions (all idempotent — safe to re-run):**

0. **Verify merge integrity first (§67).** Before any other Step 13 action, confirm no commit was silently dropped during the merge:

   ```bash
   node scripts/check-merge-safety.mjs <pr_number> post
   ```

   The script compares the merge commit's 2nd parent against the head GitHub recorded for the PR. If they differ, a commit was lost (cf. belong-marketplace PR #9 → PR #10 recovery). Investigate before proceeding with steps 1-7 below.

1. **Re-run `/traceability-matrix` over the merged commit.** The Step 12 run was on the pre-merge branch; the post-merge run pins the matrix to the actual main-branch commit hash that ships.
2. **Update the issue with merge metadata:**
   - PR link, merged-at timestamp, merged-by user.
   - Move label from `ralph-done` → `released`.
   - Close the issue.
3. **Update the spec status:** edit `docs/specs/<feature-slug>.md` Status from `Clarified` (or `In implementation`) to **`Released`**.
4. **Update `docs/events.md`** if new event names were registered during `/tdd` Step 6 (logs phase). The Step 13 verifies the event registry is in sync with what production emits.
5. **Append to `docs/audit/incidents.md`** *only if* an incident was tied to this slice (e.g., this PR was the resolution of a `/postmortem`). Otherwise no-op.
6. **Optional deploy trigger:** if continuous deployment is wired (separate `/deploy` skill or CI pipeline), the merge auto-deploys. `/feature` does not own this; it just records the deploy trigger in the session log.
7. **Final session log entry:** structured `feature.released.v1` event with the slug, scenarios closed, and the merged commit.

**What this step does NOT do:**

- Does not delete the issue, the branch, or the spec.
- Does not auto-deploy (handed off to the deploy pipeline).
- Does not notify external systems beyond the issue update (custom notifications go in a separate skill).

**Why this step exists:**

Without it, the feature lifecycle ends in an ambiguous state — the PR is merged but the framework's bookkeeping (traceability, spec status, event registry) lags or never catches up. Step 13 closes the loop so the next audit, the next compliance review, the next `/feature` invocation all see a consistent picture.

## Mode detection

The skill detects mode early and adapts:

| Detection | Mode |
|---|---|
| Single bounded context, ≤2 modules | Single-agent path through all 13 steps |
| 3+ modules or 2+ bounded contexts | Agent Teams (§107) at Steps 10-11 |
| Any sensitive domain (auth, payments, PII) | Forces `require-human-review` (§64) on all slices |
| UI involved | Activates §104 visual gate in Step 11 |
| Public API | Activates §105 Schemathesis in Step 11 |
| Feature flag mentioned in spec | Activates §74 strangler awareness for rollout |

## Composition guarantee

Every skill invoked by `/feature` is independently callable. Running `/feature` is equivalent to:

```
/grill-me <feature>
/domain-model
/specify
/clarify
/to-scenarios     # ⛔ human approval (HUMAN CHECKPOINT 1)
/to-issues
/plan
# For each slice:
/tdd
/run-acceptance   # reviewer agent invoked here; retry policy at Step 11
/security-hardening (if sensitive)
/traceability-matrix
# ⛔ Human merges draft PR (HUMAN CHECKPOINT 2)
# Triggered by merge:
/feature --close <issue>   # Step 13: post-merge close-out
```

The two-checkpoint structure is **deliberate**: scenario approval is the single most important guardrail (`.feature` becomes the contract); draft-PR merge is the single most important compliance gate. Everything in between can be automated.

Step 13 runs **after** HUMAN CHECKPOINT 2 closes — it is not gated by a checkpoint, but by the merge event itself.

## Failure modes and recovery

| Failure | Recovery |
|---|---|
| Pre-flight check fails (Step 1) | Stop, report what to fix. Run `/setup` if Stormhelm not configured. |
| Grilling stalls (Step 3) | Save progress to `.planning/feature-<slug>/grilling.md`, exit. Resume manually with `/grill-me`. |
| Spec ambiguous after `/clarify` (Step 6) | Stop, ask human directly with the open questions. |
| Scenarios rejected at checkpoint 1 (Step 7) | Iterate with `edit:<feedback>` — never bypass. |
| `/run-acceptance` fails 3 times on a slice (Step 11) | Mark slice `blocked`, continue with other slices, surface in final report. |
| Token budget exhausted (any step) | Stop, log progress, send notification. Resume after budget refresh. |

## Telemetry

`/feature` writes a structured session log following §69 schema:

```
.planning/feature-sessions/<feature-slug>-<YYYYMMDD>-<HHMMSS>.log
```

Each step transition emits an event (`feature.step.started`, `feature.step.completed`, etc.) for postmortem and audit.

## What this skill does NOT do

- Does not merge PRs.
- Does not modify `.feature` files post-approval (§58).
- Does not skip rules to "be faster."
- Does not invent capabilities not declared in the active stack via `/setup`.

## Comparison with the distributed workflow

| Aspect | Distributed (12 manual steps) | `/feature` (this skill) |
|---|---|---|
| Control | Maximum — human invokes each step | Lower — human watches and approves at 2 checkpoints |
| Speed of invocation | Slower — 12 commands | Faster — 1 command |
| Trust required | Less — each step verified before next | More — trust §1-§122 enforce themselves |
| Best for | Exploratory work, brownfield, high-risk changes | Routine greenfield features in a team that knows the rules |

Both paths are first-class. Use whichever fits the day.
