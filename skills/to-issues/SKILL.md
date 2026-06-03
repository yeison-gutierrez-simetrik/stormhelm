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

## Pre-flight checks

Run before Step 1; each fails fast with an actionable message instead of failing deep in the workflow (§58, ADR-0001):

```bash
node scripts/preflight.mjs git-repo
node scripts/preflight.mjs feature-approved <feature-slug>   # §58/§63: do not derive issues from a draft
node scripts/preflight.mjs gh-auth
```

If any check exits non-zero, stop and report it — do not start the workflow.

## Workflow

### Step 1 — Identify vertical slices

A vertical slice (§30):

- Touches all relevant layers for ONE user-facing behavior (domain → application → infrastructure → entrypoints).
- Has at least one approved `scn-NNN` it satisfies.
- Is demoable on its own.

For each `Feature:` block in the `.feature` files, count scenarios that share a domain action. Group into slices of 1-5 scenarios each (more usually means the slice is too broad).

### Step 2 — Detect multi-module + emit ceremony labels (§107 trigger; ADR-0002 PR-M)

Don't eyeball the module count — **derive it** from the `/plan` "Layers affected" via the shared detector (OQ1 of ADR-0002 — same parser PR-Group's grouping uses):

```bash
node scripts/detect-ceremony.mjs <issue1>.md <issue2>.md ...
```

It returns `{ modules, module_count, contexts, context_count, labels }`. Rule (conservative): **multi-module ⇔ ≥3 modules OR ≥2 bounded contexts**; **cross-context ⇔ ≥2 contexts**. Apply the emitted **ceremony labels** to each issue (ADR-0002 safeguard 1 — classification is detected, never hand-declared):

- `feature:single-module` **or** `feature:multi-module`
- `feature:cross-context` (when vocabulary spans ≥2 contexts)

**Auto-create the labels if missing** in the repo: `gh label create feature:single-module --force` (and the other two). A team may override a classification, but only by an audited label flip in the GitHub timeline (ADR-0002 safeguard 1) — never a silent frontmatter field. Over-classification is safe (it only adds ceremony, downgradable by an explicit human flip); under-classification is caught later by escalation (PR-N, INV-6).

> **Layout assumption.** The detector counts *bounded contexts* from the path segment under a known layer dir — `src/{domain,application,infrastructure,entrypoints,modules,contexts}/<ctx>/…` — i.e. the §3 layer-first hexagonal layout this framework prescribes. The **module count** (the primary §107 trigger) is layout-independent and always works; only `feature:cross-context` is layout-sensitive. A project that nests code differently (e.g. `src/features/<ctx>/…`, or no `src/` prefix) will **under-detect** `cross-context` — which is safe by design (conservative + one-way escalation, PR-N/INV-6), but if your layout diverges, expect to set `feature:cross-context` by hand (audited label flip).

If `feature:multi-module`, also switch to Agent Teams mode (§107) at issue-generation time. (An explicit `module:X` marker in the spec still forces multi-module.)

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

**Labels:** `ralph-ready` `shift:afk` `scenarios:scn-042+scn-043` `budget:50k` `severity:p2`

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

## Depends on
- #<issue> (what foundation this issue consumes; structured `#N` so the grouping graph can read it). `None (foundation)` for the slice root.

## Branch
agent/feature-<slug>   (one cumulative branch per slice-group; see Step 5b)
```

### Step 5b — Compute slice-groups (PR-Group / FW-2)

Issues that share a foundation must ship together. Don't eyeball this — compute it from the dependency graph the plans already declare (`## Depends on` + the `(#N)` / `from #N` / `reused by #N` references in each `/plan`'s "Layers affected"):

```bash
node scripts/group-slice-issues.mjs <issue1>.md <issue2>.md ...
```

It returns the connected components: each component of ≥2 issues is a **slice-group** (a cohesive set), each singleton is **standalone**. For each group it names the topological **root** (the foundation — verify it carries `introduces-capability:*` if applicable; a multi-root warning means the foundation is ambiguous and the decomposition needs a second look).

Then decide packaging (Axis 2, by review-size budget — see `core/13` "Cumulative vs stacked PRs"):

- **Group within budget →** one cumulative branch `agent/feature-<slug>`, one PR, `Closes #a #b #c …` for all members.
- **Group over budget →** stacked PRs in topological order, finding-attribution (PR-Attr) mandatory.
- **Standalone →** its own `agent/feature-<slug>` branch, `Closes #n`.

Emit a `slice-group:<slug>` label on every issue of a group so the relationship is queryable.

### Step 6 — Create via `gh issue create`

For each slice:

```bash
gh issue create \
  --title "<slug> — <slice title>" \
  --body "$(cat <generated-body>)" \
  --label "ralph-ready,shift:afk,scenarios:scn-042+scn-043,budget:50k,severity:p2,slice-group:<slug>"
```

If the slice is sensitive: add `--label "require-human-review"` and **omit** `--label "ralph-ready"` until human confirms. Omit `slice-group:<slug>` for standalone issues (singletons).

> **The local issue file MUST mirror these labels in its `**Labels:**` line** (Step 5 template). GitHub labels alone are not visible to the offline invariant gate (`scripts/check-invariants.mjs`), which reads issue files from `issues/` (or `.planning/issues/`). If the `**Labels:**` line is missing, INV-1/2/3/5 silently read N/A — the gate becomes a no-op and emits a `CONFIG` failure. Keep the `--label` flags and the file's `**Labels:**` line in sync.

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
