---
name: grill-me
description: |
  Interrogation skill that resolves ambiguity in a feature request BEFORE any spec
  is written or any code is touched. The agent asks 40-100 targeted questions
  walking the design tree until no assumption remains unvalidated. Adopted from
  Matt Pocock's AI Hero `/grill-me` pattern. The single most effective skill for
  avoiding rework on agent-generated code.
  Use when: a feature request arrives, a design question is contested, the team
  feels "I'm not sure exactly what this is supposed to do." Always run before
  /specify. Do NOT use for bugs (use /debug, the bug is the spec) or improvements
  (use /optimize for perf, refactor follows §102).
---

# /grill-me — Pre-Coding Interrogation

## Purpose

Most agent-generated rework comes from skipping this step. A feature description that "sounds clear" usually has 20-50 unresolved decisions hiding in it. `/grill-me` surfaces them by walking the design tree systematically: every node is interrogated until the agent has no remaining assumptions.

When the interrogation is over, the agent and the human share a **single mental model** of what is going to be built. `/specify` writes that model down; `/to-scenarios` turns it into testable contracts. Skipping `/grill-me` means writing specs against a phantom model.

## When to invoke

- A feature request arrives (text, ticket, or `@file.md`).
- The team has a "design discussion" looming.
- A spec already exists but the agent is uncertain (re-grill is fine).
- Before `/specify` in the `/feature` workflow (Step 3).

## When NOT to invoke

- For a bug fix → `/debug` (the bug already specifies itself).
- For a performance optimization → `/optimize` (baseline data is the spec).
- For a known refactor with no behavior change → straight to `/tdd` with §102 in mind.

## Inputs

- Feature description: inline text or `@docs/briefs/<file>.md`.
- `docs/CONTEXT.md` (ubiquitous language).
- `docs/constitution.md` (non-negotiables).
- Optional: existing related code paths (for brownfield, see `/grill-with-docs`).

## Outputs

- A conversation transcript saved to `docs/decisions/grilling/<slug>-<YYYYMMDD>.md`.
- A **shared design concept**: the resolved tree of decisions, ready to feed `/domain-model` and `/specify`.
- A list of **open questions** that need stakeholders beyond the immediate developer (saved as `<slug>-open-questions.md`).

## Rule files to load (progressive disclosure)

Before asking the first question, load these files so questions are framed by the framework's discipline:

- **Always:**
  - `docs/engineering/core/01-philosophy.md` — disciplines the asking itself: §1 (build only validated business needs), §2 (simplest correct solution), §30 (vertical slices over horizontal completeness), §31 (omit before mocking). Without these, the agent asks for "nice to have" features the human did not validate.
  - `docs/engineering/core/05-domain-modeling.md` — §22 (PRD vocabulary) so questions use the project's words, not the agent's invention.

- **If the feature involves new components, modules, or bounded contexts:**
  - `docs/engineering/core/02-architecture.md` — §3 (hexagonal layering) so questions probe which layers the feature will touch. Avoids late surprises like "oh, this needs an outbound adapter we didn't plan for."

- **If the feature involves money, time, units, or quantities:**
  - `docs/engineering/core/05-domain-modeling.md` §11 in detail — ask explicitly about units (cents? basis points? seconds?). Skipping this question produces float-vs-int arguments in the §19 phase.

- **If the feature is agentic (uses LLMs, tools, autonomous loops):**
  - `docs/engineering/core/13-ralph-and-afk.md` §63-§70 — ask about HITL gates, budget caps, and what should be `require-human-review`.

- **If the feature touches sensitive paths (auth, payments, PII):**
  - `docs/engineering/core/16-security-supply-chain.md` §87 — ask the threat-model-relevant questions during grilling, not after `/specify`.

This rule is the §Memento Pattern of grilling: externalize the context before asking, so questions reflect the framework's discipline rather than the agent's intuition.

## Workflow

### Step 1 — Read the input and the context

Parse the feature description. Read `docs/CONTEXT.md` and `docs/constitution.md`. The questions you ask must use the project's vocabulary (§22).

### Step 2 — Build the design tree

Identify the top-level decisions implicit in the request. For each:

- What is the user-facing action?
- Who is the actor? (multiple actors → branch)
- What inputs does the actor provide? (each input → sub-branch)
- What is the success state?
- What are the failure states?
- What side effects?
- What persistence?
- What auth/authz?
- What external dependencies?

Each branch with uncertainty becomes a question.

### Step 3 — Ask, one node at a time

Rules of asking:

- **One question per turn**, until you have a clear answer. Don't ask 5 things at once.
- **Every question is multiple choice** with 2-4 concrete options, never open-ended or yes/no. Yes/no hides the underlying decision — force the human to choose between *named alternatives*.
- **Mark the recommended option** (`✅ recommended`) and explain in one line *why* it is recommended (constitution principle, §N rule, `CONTEXT.md` term, or the precedent in the codebase).
- **Explain why each non-recommended option is viable** in one line each — never list strawman options. If an option has no defensible reason to exist, drop it from the list.
- **Always include an `Other / correction` option** as the last choice. The human selects it when the listed alternatives miss the real decision; they then describe the actual option in prose, and you re-issue the question with the corrected option set.
- **Quote back** the human's previous answer when asking the next question.
- **Reference §N and constitution** when a default exists ("§11 stores money as integer cents — do you want to override that for this feature, or keep the default?").
- **Stop asking** about things already settled by the constitution or by `CONTEXT.md`.

#### Question format

```markdown
**Q<N>.** <one-sentence question, in PRD vocabulary>

- **(a) <option A>** — ✅ recommended. <one-line rationale citing §N, constitution, or precedent>.
- **(b) <option B>** — <one-line why this is also viable / what trade-off it makes>.
- **(c) <option C>** — <one-line why this is also viable / what trade-off it makes>.
- **(d) Other / correction** — the options above miss the real decision; describe it.
```

#### Example

```markdown
**Q12.** Should a Listing be visible to Customers before a Provider verifies the underlying Company?

- **(a) Not visible until verified** — ✅ recommended. C.3 requires authenticated provenance; showing unverified Listings violates the trust contract.
- **(b) Visible with a `pending verification` badge** — viable if Product wants discovery before verification; adds a status enum to the public API and a §48 versioning step.
- **(c) Visible, no badge, soft-launched** — viable only as an experiment; requires a feature flag and a kill-switch documented as an ADR.
- **(d) Other / correction** — the options above miss the real decision; describe it.
```

#### Why this format

- Multiple-choice with named alternatives forces the agent to do design work *before* asking, instead of dumping the decision on the human.
- The rejected options become free `Considered Options` for the next ADR — no extra writing.
- The `Other / correction` escape valve prevents the agent from forcing the human into a false trichotomy when the real answer is none of the above.

**Question count scales with feature complexity.** A single-actor single-behavior feature does not need 40 questions; a multi-context greenfield does not get away with 10. Use this table as a calibration:

| Complexity signal | Target range |
|---|---|
| Single user action, ≤2 actors, ≤3 failure cases (e.g. "create a Task with title") | **10-20 questions** |
| Multiple actors OR cross-context flow (e.g. "Provider publishes Listing visible to Customers") | **20-40 questions** |
| Greenfield with multiple modules OR new bounded context (e.g. "build the entire payments module") | **40-80 questions** |
| Major rewrite, technology migration, or framework adoption (e.g. "migrate Express → Hono across the codebase") | **80-120 questions** |

**Calibration rules:**

- **Below the lower bound** = suspicious. You missed branches. Re-walk the design tree before stopping.
- **Above the upper bound** = re-asking or going off-scope. Stop and surface the open question to the human ("we keep circling X — needs stakeholder input").
- The bounds are **after dedupe and after settling assumptions** — questions that just confirm what was already said don't count.
- If you can't decide which bucket the feature belongs in after the first 5 questions, ask the human directly: "Is this scope closer to a single action or a multi-context flow?"

### Step 4 — Surface assumptions you made

After ~30 questions, restate your understanding back:

> "Based on what you've said so far, I'm assuming: (a) provider verification is required before publication; (b) listings are scoped to a single Company; (c) the customer can search published listings without authentication. Are any of these wrong?"

This catches assumptions the human didn't realize they hadn't confirmed.

### Step 5 — Identify open questions for others

Some questions need a stakeholder you can't reach (legal, security, product). Move these to `<slug>-open-questions.md` with structure:

```markdown
## OQ-1: Retention policy for listing draft state
**Who decides:** Product + Legal
**Why it matters:** affects DB schema (TTL column) and §49 migration plan
**Default if unresolved:** 90 days (matches existing entity)
**Blocking:** No — can proceed with default and revisit before launch
```

Blocking open questions stop the workflow. Non-blocking proceed with documented defaults.

### Step 6 — Write the design concept

Save `docs/decisions/grilling/<slug>-<YYYYMMDD>.md` with:

- The original input.
- The resolved design tree (questions + answers, organized by branch).
- Assumptions surfaced and confirmed.
- Open questions (blocking / non-blocking).
- The "shared mental model" summary (3-5 paragraphs).

## Output template

> The full transcript format spec lives at `skills/grill-me/references/transcript-format.md`. The snippet below is the minimum.


```markdown
# Grilling session — <slug>

**Date:** YYYY-MM-DD
**Feature:** <one-line summary>
**Source:** <inline | @file.md>

## Resolved design tree

### Actor: Provider

**Q1.** <question text>
- (a) <option A> — ✅ recommended. <rationale>
- (b) <option B> — <viable trade-off>
- (c) Other / correction — _(not selected)_

**Answer:** (a). _Rationale at decision time:_ <one-line summary>.
_Rejected options preserved as future ADR `Considered Options`._

**Q2.** ...

### Actor: Customer

**Q3.** ...

## Confirmed assumptions
- A1: ...
- A2: ...

## Open questions (see <slug>-open-questions.md)
- OQ-1 (blocking): ...
- OQ-2 (non-blocking): ...

## Shared mental model
<3-5 paragraph synthesis of what we're going to build, in the project's vocabulary>
```

## Integration with the framework

- **Invoked by `/feature` Step 3** before any artifact is written.
- **Output feeds `/domain-model` and `/specify`** directly.
- **`reviewer` agent reads this transcript** when auditing whether the implemented code matches what was actually agreed.

## Attribution

The structured-interrogation pattern is adapted from `/grill-me` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). MIT licensed.

## What this skill never does

- Skip questions to "save time."
- Accept ambiguous answers as resolved.
- Write code, specs, or scenarios — this skill is conversation only.
- Resolve questions on behalf of stakeholders it can't reach (those become OQ).
