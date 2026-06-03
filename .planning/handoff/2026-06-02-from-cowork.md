# Session handoff — Cowork → Claude Code (2026-06-02)

> Read this **after** `CLAUDE.md`. It documents the state of the framework at the end of a long Cowork session (2026-05-26 to 2026-06-02) so the next Claude Code session can pick up without re-reading the chat history. Future handoffs go in the same directory with the same naming pattern.

## TL;DR — what's in flight right now

- **7 PRs merged** in this window covering Sec, Sonar, MatrixStable, Up, Cap, I, parser (#19–#24, #26–#28, #30, #31, #33, #34 — see "Merged in this window" below).
- **ADR-0002 accepted** (PR #33). Conditional ceremony by per-feature detection is now framework policy. The implementation (PR-M) is now **unblocked**.
- **Current branch:** `feat/pr-group`. Work on PR-Group (FW-2 — slice-group label + cumulative branch convention) is in progress on this branch; some `/feature` SKILL.md updates have already landed reflecting the new convention (line 57 references the new `agent/feature-<slug>` cumulative branch shape and `scripts/group-slice-issues.mjs`).
- **Three follow-ups still to start:** PR-Std (FW-1 / `/gates` orchestrator), PR-Attr (FW-3 / finding attribution + INV-7), PR-M (ADR-0002 implementation).
- **One issue to file:** synthetic-consumer fixture for invariant tests (drafted in `.planning/pr-bodies/pr-31-review-comments.md` comment #3; open after PR-Group lands so it can reference the new test pattern).

## Merged in this window

| PR | Branch | What |
|---|---|---|
| #19 | `feat/merge-safety-asserts` | PR-Sec / FW-5 — `check-merge-safety.mjs` pre + post |
| #20 | `feat/parse-layers-affected` | Shared parser AST for PR-Group + PR-M |
| #21 | `docs/rationale-in-git-and-cap` | PR-I + PR-Cap bundle (docs/decisions/, §122 early) |
| #22 | `docs/cve-upgrade-discipline` | PR-Up / FW-7 — §85 major-upgrade discipline |
| #23 | `feat/stable-traceability-identifiers` | PR-MatrixStable / FW-4 — issue+SHA, -draft/-final |
| #24 | `feat/capability-driven-sonar` | PR-Sonar / FW-6 — CAPABILITY.md frontmatter + composer |
| #26 | `adjust/sonar-coverage-exclusions` | Follow-up: `features/**` also in `coverage_exclusions` |
| #27 | `adjust/inv8-per-feature-mandatory` | Follow-up: INV-8 per-feature + Step 13 mandatory |
| #28 | `adjust/parser-tests-and-list` | `scripts/__tests__/` regression suite for parser |
| #30 | `chore/genericize-project-refs` | Removed `belong-marketplace` mentions from framework |
| #31 | `chore/review-fixes-omnibus` | Big code-review fix: silent no-op gate, regex bugs |
| #33 | `docs/adr-0002-accept` | ADR-0002 Proposed → Accepted (co-signed) |
| #34 | `fix/fw8-closes-interactive` | PR-Closes / FW-8 — `Closes #N` in interactive path |

## What's not done

### PR-Group (current — `feat/pr-group`)

**Goal:** `/to-issues` Step 5 emits a `slice-group:<slug>` label and switches branch convention from per-issue (`agent/feature-<slug>-NNN`) to cumulative-per-slice (`agent/feature-<slug>`). Reuses `scripts/parse-layers-affected.mjs` (already in main) to build the dependency graph.

**Status:** `/feature` SKILL.md already references the new convention (line 57 mentions `agent/feature-<slug>` and `scripts/group-slice-issues.mjs`). The grouping script itself + `/to-issues` updates are pending. PR-Closes (#34) already shipped the `Closes #N1, #N2, ...` multi-issue template, so the orchestration side is partly done.

**To do on this branch (high level):**

- `scripts/group-slice-issues.mjs` — consumes the parser AST, emits group label + axis-2 decision (cumulative vs stacked based on size budget).
- `scripts/__tests__/group-slice-issues.test.mjs` — fixture using the same 5-plan synthetic data the parser uses.
- `/to-issues` SKILL.md Step 5 update — emit `slice-group:<slug>` label and the cumulative branch instruction.
- `core/13-ralph-and-afk.md` §67 (or new §N) — document "cumulative vs stacked" rule with the LOC/file budget.
- `docs/constitution-template.md` (or wherever C.N lives) — new C.6 for review-budget thresholds (proposed default 400 LOC / 15 files; tunable per project).

**Reference design:** Round 3 of the belong-marketplace feedback proposed the two-axis model (cohesion + packaging). See `.planning/responses/response-3-to-design-pass.md` for the safeguards.

### PR-Std (FW-1 — skill standalone awareness + `/gates`)

**Not started.** Largest of the pending work (~2 days estimated). Goal: instrument `/run-acceptance`, `/code-review`, `/security-hardening`, `/traceability-matrix` to detect prior artifacts in `.planning/` and skip redundant invocations; ship a thin `/gates` skill that orchestrates Step 11 → 13 with dedup. Origin: feedback round 1 (FW-1 in `slice01-part2-tdd-to-merge.md`). The author's correction (round 2) was important: this is "make standalone robust", not "discourage standalone".

### PR-Attr (FW-3 — finding attribution + INV-7)

**Not started.** Depends on PR-Group landing (needs the slice-group concept for cross-PR scanning). Goal: every reviewer-agent and `/security-hardening` finding carries `originating_commit: <sha>`; new INV-7 blocks merge if blocking findings appear in any open PR's diff without a follow-up fix in the originating branch. This was the highest-severity case in the original belong feedback (almost merged `main` without a security guard).

### PR-M (ADR-0002 implementation — UNBLOCKED)

**Not started but unblocked.** ADR-0002 was accepted in PR #33 with the 3 open questions resolved. PR-M implements:

- Detector emission in `/to-issues` Step 3 (`feature:single-module|multi-module`, `feature:cross-context`, `nfr:slo-declared`).
- Section taxonomy in `/specify` (label-aware).
- `scripts/check-invariants.mjs` INV-6 §123 — classification stability across diff.
- `agents/reviewer.md` re-runs detectors on the diff.
- `skills/setup/SKILL.md` minimal-bootstrap defaults for constitution + CONTEXT.

Read `docs/adr/0002-conditional-ceremony-by-detection.md` for the full decision + resolved open questions.

### Synthetic-consumer fixture issue (not yet filed)

Drafted in `.planning/pr-bodies/pr-31-review-comments.md` comment #3. The motivating bug (PR #31's silent no-op gate) demonstrated that running `check-invariants.mjs` against the framework repo itself doesn't validate the gate — the framework is the most degenerate consumer (no issues, no labels). Need a fixture at `scripts/__tests__/fixtures/synthetic-consumer/` with populated issues + features + ADRs, plus `check-invariants.test.mjs` + CI wiring. Estimated 3 hours.

**When to file this issue:** right after PR-Group merges (so the issue can reference the new grouping convention as one of the things the fixture should exercise).

## How the conversation worked (process notes)

This window introduced a formalized feedback loop with the belong-marketplace author. Pattern, captured because future sessions should preserve it:

1. **Consumer writes feedback** at `<belong-marketplace>/.planning/framework-feedback/<topic>.md`.
2. **Framework writes responses** at `<stormhelm>/.planning/responses/response-N-to-<topic>.md`. Files in this directory are working artifacts of the design conversation; they document **why** decisions were made, not the decisions themselves.
3. **When a decision is philosophy-level**, elevate to a co-signed ADR. ADR-0002 was the first instance — the author retired their own original FW-5 toggle proposal during design after seeing a counter-argument. The retired-then-reformulated arc is what the ADR documents.
4. **Implementation lands as labeled PRs** with FW-N tags so they're traceable back to the originating feedback.

If you find a new file under `belong-marketplace/.planning/framework-feedback/` that doesn't have a matching `<stormhelm>/.planning/responses/response-N-to-<same-name>.md`, it's awaiting a response.

## Where the design rationale lives

These are the working artifacts. Keep them tracked; they're the audit trail for why current choices were made:

- `.planning/responses/response-to-slice01-part2-feedback.md` — first response, set up the conventions.
- `.planning/responses/response-2-to-slice01-part2.md` — concession on the walkthrough framing.
- `.planning/responses/response-3-to-design-pass.md` — adopted the two-axis grouping model (cohesion + packaging).
- `.planning/responses/response-4-to-raw-plans.md` — accepted the 5-plan fixture data.
- `.planning/responses/response-5-graph-correction.md` — adopted the decoupled-fixtures architecture for PR-Group.
- `.planning/responses/response-6-close-design-phase.md` — explicit close of design phase; adopted the cross-link parser/contour.
- `.planning/improvements/framework-self-consistency-plan.md` — earlier audit-driven plan (still partly relevant for PR-Std).
- `.planning/improvements/consolidated-roadmap-2026-06.md` — master roadmap with the 12 PRs and dependencies. Update this after each PR lands.

## Quick orientation (do this first on next session start)

```bash
cd <stormhelm-repo>

# 1. Sync with origin
git fetch origin
git checkout main && git pull --ff-only

# 2. See what's already in flight
gh pr list --state open

# 3. Read the roadmap
less .planning/improvements/consolidated-roadmap-2026-06.md

# 4. Pick up where work left off (feat/pr-group)
git checkout feat/pr-group
git log --oneline main..HEAD

# 5. Sanity: all three gates green?
node scripts/check-framework-metadata.mjs
node scripts/check-invariants.mjs
node scripts/sync-closed-sets.mjs --check
node --test scripts/__tests__/*.test.mjs
```

## Open questions for the next session

None blocking. Two judgement calls when convenient:

1. **PR-Group review-budget defaults** (C.6 in constitution template): proposed 400 LOC / 15 files. The belong-marketplace author confirmed in round 3 ("hybrid with override auditable"). Confirm if Belong's actual code review experience suggests different numbers; otherwise ship 400/15 and revisit if friction surfaces.
2. **`task_flow/` long-term fate.** PR #31 added a disclaimer. The original Cowork-session recommendation was to delete and replace with a canonical walkthrough, but that walkthrough (`.planning/new-project-walkthrough.md`) lives only in local Cowork state — never pushed. Two options: (a) push the walkthrough and delete `task_flow/`, or (b) keep `task_flow/` with disclaimer indefinitely. The disclaimer is fine for now; revisit when someone has time to write the canonical walkthrough into the repo.
