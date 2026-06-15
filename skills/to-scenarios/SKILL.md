---
name: to-scenarios
description: |
  Generates Gherkin .feature drafts from the clarified spec, one .feature file per
  bounded context the feature touches. Each scenario gets a stable scn-NNN ID and
  a runtime tag (@release, @smoke, @manual). The output is a DRAFT — a human
  must approve before the file is treated as authoritative (§58). Once approved,
  the agent never modifies it without human review.
  Use when: spec is Status: Clarified. Step 7 of /feature. Always followed by a
  HUMAN CHECKPOINT before /to-issues runs.
---

# /to-scenarios — Generate Gherkin Drafts

## Purpose

Acceptance scenarios are the executable contract between Product/QA and Engineering (§56-§62). `/to-scenarios` translates the clarified spec into Gherkin `.feature` files in the project's ubiquitous language. The output is **always a draft** — the human reviewer is the one who turns it into an authoritative contract by approving and committing.

After approval, the `.feature` file is **read-only for the agent** (§58). Subsequent changes require human authoring or another explicit `/to-scenarios` invocation that the human approves again.

## When to invoke

- After `/clarify` marks the spec as Clarified.
- Step 7 of `/feature` — immediately followed by HUMAN CHECKPOINT 1.
- When new FRs are added to an approved spec (then a new round produces additional scenarios for review).

## When NOT to invoke

- To "improve" wording of already-approved scenarios — that's a human edit.
- For features without business-visible behavior (internal refactors, dep upgrades).
- For bugs — the regression test added by `/debug` Step 5 covers the scenario need.

## Inputs

- `docs/specs/<feature-slug>.md` (Status: Clarified).
- `docs/CONTEXT.md` (ubiquitous language).
- Existing `features/<context>/*.feature` (to avoid scn-NNN collisions).
- `docs/constitution.md`.

## Outputs

- One or more draft files in `features/<bounded-context>/<feature-slug>.feature`. The full `.feature` file format spec lives at `skills/to-scenarios/references/feature-file-format.md`.
- Each scenario tagged with stable `@scn-NNN` and at least one runtime tag.
- A summary of scenarios produced, returned to the workflow.

## Status transition (§58)

This skill **owns** the entry transition: it writes each new `.feature` with the Gherkin comment header `# status: draft`. The file stays agent-editable until HUMAN CHECKPOINT 1 (`/feature` Step 7) flips it to `approved`. Never write `# status: approved` here — only the human checkpoint does.

## Workflow

### Step 1 — Identify bounded contexts

For each FR, identify which bounded context owns it. The mapping comes from `CONTEXT.md` and the existing folder structure of `features/`. If a feature crosses 2+ bounded contexts, produce one `.feature` per context (each focused).

### Step 2 — Choose the next scn-NNN

Scan all existing `features/**/*.feature` for the highest `@scn-` tag. Start your numbering at the next integer. IDs are global across the project, never re-used.

### Step 3 — Translate each FR into one or more scenarios

Rules per scenario:

- Written in present tense, third person ("the Provider publishes a Listing"), never imperative ("publish a Listing").
- Uses only `CONTEXT.md` vocabulary.
- One `When` per scenario (one action).
- Multiple `Then` allowed when one action has multiple observable consequences.
- Multiple `Given` allowed to set up state.
- Negative scenarios (failure cases) are mandatory when the FR mentions error states.
- Never pin a **surface that grows by design** (tool sets, CLI command groups,
  API/event catalogs) with an "is exactly {…}" assertion — once approved, every
  planned addition becomes a §58 edit to an approved scenario. Assert
  containment of the founding baseline + agreement with a checked-in registry
  fixture the unit gate diffs; additions update the fixture, an unexpected
  entry still fails (§124).

Example translation:

```
FR-3: Listings MUST be visible to Customers only when state = "published".
    Clarification: Non-published returns 404.

→ becomes 2 scenarios:

@scn-042 @release @smoke
Scenario: Customer views a published Listing
  Given a published Listing "Logo design"
  When the Customer requests the Listing detail page
  Then the Listing is returned with status 200

@scn-043 @release
Scenario: Customer cannot view a non-published Listing
  Given a Listing "Mobile app development" in state "verified"
  When the Customer requests the Listing detail page
  Then the response is 404 with code "LISTING_NOT_FOUND"
```

### Step 3b — Lifecycle-edge completeness pass (closed-set state machines)

A completeness **prompt**, not a generator. When an entity in the spec has a
**closed-set status** (a lifecycle: `draft → under_review → accepted/rejected`,
an option enum, a state machine), happy-path + one-step-negative scenarios
routinely miss the edge/abuse paths where real lifecycle bugs live — and they
ship green, caught only by the §114 merge-gate reviewer (an extra round-trip).
Live: belong slice 17 went green (12/12 `@release` + 1137 unit tests) carrying
four such bugs (option-set never enforced; a double-action CAS result ignored;
an FR with no covering scenario; an empty-text sealed response).

For each closed-set entity the slice touches, **ask whether each class below
applies, and add the scenario where it does** (skip with a one-line note where
it genuinely doesn't — judgment, not a mechanical cross-product):

- **Option-set integrity** — an action that takes a value from a closed set
  rejects a value outside it (a transition can't strand the entity via an
  unlisted choice).
- **Per-transition precondition** — each state transition refuses from a state
  that should not allow it (not only the one happy transition).
- **Double-action idempotency** — a money/settlement-adjacent or
  signal-emitting action invoked twice does not double-emit / diverge (the CAS
  result is honored).
- **Empty / oversized input** — a free-text or collection field rejects empty
  and over-limit values.

This is intentionally a **nudge**: auto-pilot scenario generation stays
happy-path-biased by design, and the §114 reviewer remains the designated
backstop for lifecycle-edge correctness (maintainer decision, batch-21 / FU-89)
— the goal is to convert the *common, cheap* misses into RED `/tdd` scenarios,
not to mandate an exhaustive edge cross-product that bloats the suite with
brittle scenarios.

### Step 4 — Apply runtime tags

Every scenario must have at least one runtime tag (§60):

- `@smoke` — runs on every push (pre-push hook). Reserved for absolutely critical happy paths.
- `@release` — runs in CI before merge. Default for most acceptance scenarios.
- `@manual` — documents flows that cannot be automated yet (chaos, external integrations).

Untagged scenarios fail CI (§60).

**Schema-only / foundation slices (FOLLOW-UP 66):** a substrate slice (a
migration with no use case — see §61 "Foundation / schema-only slices") tags
its structural scenarios `@structural` IN ADDITION to a runtime tag. They are
satisfied by an integration/migration test rather than a use-case step, still
pinned to their `scn-NNN`. Do not improvise a §61 exception — cite the
documented sub-pattern.

### Step 5 — Save as draft and flag for review

> **Auto-pilot exception (FOLLOW-UP 80, opt-in).** §58's default is: write
> scenarios `# status: draft` and flag for HUMAN approval. A consumer running
> auto-pilot may instead write `# status: approved` and satisfy §58 **post-hoc**
> via the decision log (`core/13` Appendix "Autonomous planning") — never
> silently: the self-answered scope decisions must each appear in
> `docs/decisions/auto-clarify/<slice>-decisions.md` with an industry reference
> and an audit checkbox. Sensitive (`require-human-review`) slices are still
> ratified by a human at the implementation-PR review (§64); auto-pilot never
> auto-merges them.


Save `features/<context>/<feature-slug>.feature`. Mark the PR/branch as `feature-review` so the human reviewer knows this file requires explicit approval.

The agent's output to the workflow:

```markdown
## /to-scenarios draft — <feature-slug>

Files written (DRAFT — pending human approval):
- features/listings/listing-publication.feature (4 scenarios: scn-042, scn-043, scn-044, scn-045)
- features/listings/listing-search.feature (3 scenarios: scn-046, scn-047, scn-048)

⛔ HUMAN CHECKPOINT 1: review and approve `.feature` files before /to-issues.
Per §58, the agent will NOT modify these files once approved.
```

The `/feature` workflow halts here for human approval.

## Integration with the framework

- **Invoked by `/feature` Step 7**, followed by HUMAN CHECKPOINT 1.
- **Output consumed by `/to-issues`** (each issue links to its scn-NNN labels) and `/run-acceptance` (the gate runs these scenarios).
- **Read by `reviewer` agent**: any code change that touches a behavior covered by a scenario must keep that scenario green.
- **§58 enforcement**: once committed, the agent does not modify these files. The CI rule in §58 blocks agent-authored commits that touch `*.feature`.

## What this skill never does

- Commit `.feature` files automatically (human approves first).
- Re-use scn-NNN IDs.
- Modify scenarios already approved without a new `/to-scenarios` round.
- Skip the runtime tag (would fail CI per §60).
- Write step definitions — those live in `application/steps/` OR `features/<context>/steps/` (§61 admits both) and are created by `/tdd`.
