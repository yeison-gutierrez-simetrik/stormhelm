---
name: to-issues
description: |
  Decomposes the approved spec + scenarios into vertical-slice GitHub issues, each
  with the labels Ralph needs (ralph-ready, shift:afk|hitl, scenarios:scn-NNN,
  budget:NNk). Each issue is independently testable and demoable per §30. For
  multi-module features (§107 Agent Teams detected), also generates module
  contracts under features/<ctx>/contracts/<module>/.
  Use when: /to-scenarios has been approved by a human. Step 8 of /feature. Output
  is the queue Ralph consumes.
---

# /to-issues — Vertical-Slice Decomposition

## Purpose

A monolithic feature is not implementable in one pass. `/to-issues` breaks the approved spec + scenarios into vertical slices (§30) — each slice is one demoable behavior end-to-end, small enough to fit in a single PR. The output is a queue of GitHub issues with all the labels Ralph needs to consume them autonomously (§63-§70).

For multi-module features (detected when the spec spans 3+ modules or 2+ bounded contexts), the skill also emits the contract artifacts (§103) that enable Agent Teams (§107) parallelization.

## When to invoke

- After human approval of `.feature` files from `/to-scenarios`.
- Step 8 of `/feature`.
- When an approved spec needs to be re-decomposed (rare; typically because a slice turned out to be too big).

## When NOT to invoke

- Before scenarios are approved — issues without scn-NNN labels fail §63.
- For single-scenario changes — those are direct `/tdd` invocations.

## Inputs

- `docs/specs/<feature-slug>.md` (Status: Clarified).
- `features/<context>/<feature-slug>.feature` (human-approved).
- Active capabilities (from `AGENTS.md`).
- `docs/constitution.md` (to detect sensitive domains → §64 `require-human-review`).

## Outputs

- N GitHub issues created via `gh issue create`, each:
  - Body following the template below.
  - Labels: `ralph-ready` (if applicable), `shift:afk|hitl|hybrid`, `scenarios:scn-NNN,scn-MMM`, `budget:NNk`, `severity:p2` (greenfield default), `require-human-review` (if sensitive).
- For multi-module: `features/<context>/contracts/<module>/` with `api-contracts.ts`, `openapi-spec.yaml`, `mocks.ts`, `architecture.md` skeletons (§103).
- A summary returned to the workflow.

## Rule files to load (progressive disclosure)

Decomposition into vertical slices and labeling for Ralph requires loading the rules that govern slice shape and Ralph's contract:

- **Always:**
  - `docs/engineering/core/01-philosophy.md` — §30 (vertical slices over horizontal completeness), §31 (omit before mocking). Without these, the agent emits horizontal slices ("backend first, frontend later") that violate §30 and stall the pipeline.
  - `docs/engineering/core/13-ralph-and-afk.md` — §63 (scn-NNN labels mandatory for `ralph-ready`), §64 (require-human-review on sensitive), §65 (max-iterations heuristics for budget), §70 (rate-limit policy). The labels this skill emits are the contract Ralph reads.

- **If multi-module is detected (§107 triggers: 3+ modules OR 2+ bounded contexts):**
  - `docs/engineering/core/12-bdd-and-acceptance.md` §103 — module contracts pattern (`api-contracts.ts` + `openapi-spec.yaml` + `mocks.ts` + `architecture.md`).
  - `docs/engineering/core/13-ralph-and-afk.md` §107 — Agent Teams pattern. The skill emits the `feature:multi-module` label that activates the dependency-graph orchestration.

- **If brownfield is detected (paths exist with consumers):**
  - `docs/engineering/core/14-brownfield.md` full read — §71 (characterization mandatory if cov<50%), §73 (impact-analysis mandatory if cross-context), §75 (branch prefix `agent/legacy/`). Brownfield issues get `shift:hybrid` label.

- **If the change is an improvement (not feature/bug):**
  - `docs/engineering/core/18-improvements.md` — §99 (tech debt as features with ICE rubric), §100 (dep upgrade routing). The issue labels (`improvement:refactor`, `:perf`, `:tech-debt`, `:hardening`, `:dep-upgrade`) come from here.

- **If sensitive paths detected (auto-scan):**
  - `docs/engineering/core/16-security-supply-chain.md` §87 — threat-model precondition. The skill applies `require-human-review` per §64 and may flag `improvement:hardening` separately.

The issue labels this skill emits are read by Ralph (`ralph-local.sh`), by `/run-acceptance` (`scenarios:scn-*`), by `reviewer` agent (`require-human-review`), and by `/traceability-matrix` (compliance metadata). Loading the right rules ensures every label has the right shape.

## Workflow

### Step 1 — Identify vertical slices

A vertical slice (§30):

- Touches all relevant layers for ONE user-facing behavior (domain → application → infrastructure → entrypoints).
- Has at least one approved `scn-NNN` it satisfies.
- Is demoable on its own.

For each `Feature:` block in the `.feature` files, count scenarios that share a domain action. Group into slices of 1-5 scenarios each (more usually means the slice is too broad).

### Step 2 — Detect multi-module (§107 trigger)

The feature is multi-module if **any** of:

- 3+ modules in the slice list.
- 2+ bounded contexts.
- Explicit `module:X` markers in the spec.

If multi-module, switch to Agent Teams mode (§107) at issue-generation time.

### Step 3 — Detect sensitive paths

Read the spec for mentions of: auth, authentication, authorization, payment, credit card, PII, personal data, encryption, JWT, OAuth, secret, token.

For each match, the slice's issue gets label `require-human-review` (§64).

### Step 3b — Detect new capabilities introduced by this slice

Scan the spec + plan + the current `docs/engineering/capabilities/` directory. The slice introduces a **new capability** if any of:

- The plan declares a new file under `src/infrastructure/adapters/output/<tier>/` where `<tier>` does not currently have a sibling directory (e.g., first `storage/`, first `email/`, first `payments/`).
- The plan adds a top-level **runtime** dependency (not dev-tool, not patch/minor of existing) — verifiable by checking the project's manifest delta.
- The plan declares a new MCP server in `.claude/settings.json`.
- The plan introduces an outbound integration with an external service not previously used.

For each detected capability, the issue gets:

- Label `introduces-capability:<name>` (per §63).
- **No** `ralph-ready` label (first iteration is always human-driven).
- `shift:hitl` (forced; cannot be afk).
- `require-human-review` if not already applied (new attack surface).

Naming convention for `<name>`:

| Capability type | Format | Example |
|---|---|---|
| Output adapter tier | `<tier>` | `object-storage`, `email`, `cache` |
| Stack-specific output | `<tier>-<vendor>` | `payments-stripe`, `email-sendgrid` |
| Inbound MCP | `mcp-<name>` | `mcp-atlassian`, `mcp-github` |
| LLM port | `llm-<vendor>` | `llm-anthropic`, `llm-openai` |
| Other | freeform lowercase-hyphen | `feature-flags`, `analytics` |

If a slice introduces **multiple** capabilities, emit multiple labels (`introduces-capability:object-storage`, `introduces-capability:image-processing`). Each gets the same treatment: no `ralph-ready`, `shift:hitl`.

After the first successful PR for a new capability lands, the team may follow up with a separate PR adding `docs/engineering/capabilities/<name>/*.md` documenting the conventions. Subsequent slices using the same capability can then be `ralph-ready`.

### Step 4 — Estimate budget per issue

Estimate tokens needed per issue using heuristics:

- Greenfield isolated module: ~50k (`budget:50k`).
- Brownfield modification with tests: ~80k.
- Brownfield no tests (characterization first): ~120k.
- Multi-file feature (>5 files): scale linearly.

Use coarse buckets (50k, 80k, 100k, 150k, 200k). Round up.

### Step 5 — Generate issue body per slice

```markdown
# Issue NNN — <slice title>

## Scenarios covered
- scn-042, scn-043 (see `features/listings/listing-publication.feature`)

## Vertical slice
<one paragraph: what user-visible behavior this slice delivers end-to-end>

## Acceptance
All scenarios marked `@release` for this slice must pass via `/run-acceptance`.

## Estimated budget
~50000 tokens (one cycle /tdd complete + /run-acceptance).

## Constraints
- Ubiquitous language: `docs/CONTEXT.md` (see Listing, Provider).
- Constitution: C.5 (money as integer cents) — N/A for this slice.
- Sensitive paths: none / [list].

## Module contracts (for multi-module only)
- See `features/listings/contracts/publication/` for api-contracts.ts, openapi-spec.yaml, mocks.ts.

## Branch
agent/feature-<slug>-NNN
```

### Step 6 — Create via `gh issue create`

For each slice:

```bash
gh issue create \
  --title "<slug> — <slice title>" \
  --body "$(cat <generated-body>)" \
  --label "ralph-ready,shift:afk,scenarios:scn-042+scn-043,budget:50k,severity:p2"
```

If the slice is sensitive: add `--label "require-human-review"` and **omit** `--label "ralph-ready"` until human confirms.

### Step 7 — Generate module contracts (multi-module only)

For each module, create `features/<context>/contracts/<module>/`:

- `api-contracts.ts` — TypeScript types for requests/responses/errors.
- `openapi-spec.yaml` — OpenAPI 3.0 spec.
- `mocks.ts` — realistic mock data with 300-500ms delay.
- `architecture.md` — exact file paths per task.

These contracts are the basis of §103. Frontend and backend teammates work against them in parallel.

### Step 8 — Return summary

```markdown
## /to-issues output

**Slices generated:** 5
**Multi-module:** yes (3 modules) — Agent Teams mode activated
**Sensitive domains:** 1 issue (auth slice) — require-human-review applied

Issues created:
- #142 Provider submits draft Listing (scn-040)
- #143 System verifies Provider before publication (scn-041) — require-human-review
- #144 Listing transitions to published (scn-042)
- #145 Customer searches published Listings (scn-046, scn-047)
- #146 Customer views Listing detail page (scn-043, scn-044, scn-045)

Module contracts:
- features/listings/contracts/publication/
- features/listings/contracts/search/
- features/listings/contracts/detail/

Total estimated budget: 290k tokens.
```

## Integration with the framework

- **Invoked by `/feature` Step 8**, after HUMAN CHECKPOINT 1.
- **Output consumed by `/plan`, `/tdd`, Ralph, Agent Teams (§107)**.
- **Each issue's scn-NNN labels are read by `/run-acceptance`** to know which scenarios gate the merge.
- **`require-human-review` label is read by Ralph (§64)** to keep PRs in draft.

## What this skill never does

- Create issues without scn-NNN labels (would fail §63).
- Skip the budget estimation (Ralph aborts on missing budget per §63).
- Mark sensitive issues as `ralph-ready` without explicit human confirmation.
- Generate or commit `.feature` files (those are owned by `/to-scenarios` + human).
