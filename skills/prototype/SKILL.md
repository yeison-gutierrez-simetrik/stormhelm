---
name: prototype
description: |
  Builds throwaway code to validate a design decision before committing to the
  real implementation. The output is intentionally NOT shipped — it is a learning
  artifact. Two flavors: (a) terminal app to validate logic/state, (b) UI
  variants on a single route to validate UX. Adopted from Matt Pocock's
  /prototype pattern.
  Use when: a design question is genuinely contested (multiple plausible
  approaches with unclear tradeoffs), a UX choice needs visual comparison, or a
  spike is needed to de-risk an estimate before /grill-me commits to one path.
---

# /prototype — Throwaway Code for Design Validation

## Purpose

Sometimes the right answer to a design question is "let me try it both ways and see which feels right." `/prototype` makes that legitimate — produces small, focused, throwaway code that exists to **answer one question**, then is discarded.

The output is **never merged**. The learning is what merges (as an ADR, a `/grill-me` answer, or a `/specify` decision).

## When to invoke

- A `/grill-me` question is genuinely contested (the human says "I don't know, let's see").
- `/clarify` Step 2 surfaces an ambiguity whose resolution depends on **technical feasibility** rather than product intent (e.g., "p95 < 200ms with this external API — is that even possible?"). Run `/prototype` to produce evidence, then return to `/clarify` with the answer.
- Multiple plausible architectures with unclear tradeoffs before `/sad` is generated.
- UX choice with no clear winner — need to see the variants side by side.
- Spike to de-risk an estimate before committing to a sprint.

## When NOT to invoke

- For questions answerable by reading docs or existing code.
- To "explore the codebase" — that's `/grill-with-docs`.
- For features that have a clear path — go straight to `/specify`.
- For perf questions — use `/optimize` (it has measurement discipline `/prototype` lacks).

## Inputs

- The specific question to answer (single, sharp).
- The constraints: which inputs the prototype must accept, which outputs it must produce.
- Time-box: typically 30-90 minutes; if longer, the question is too broad.

## Outputs

- Code in `.planning/prototypes/<question-slug>/` (gitignored by default).
- The learning recorded in `.planning/prototypes/<question-slug>/LEARNING.md` (this **does** persist):

  ```markdown
  ## Question
  <one sentence>

  ## What I tried
  - Variant A: <approach>
  - Variant B: <approach>

  ## Observations
  - A felt clearer because…
  - B was faster because…
  - Neither solved <edge case>.

  ## Decision
  <chosen direction, or "neither — open new question">

  ## Confidence
  High / Medium / Low

  ## Next
  - Record as ADR in docs/adr/NNNN-<slug>.md (if architecture choice).
  - Add to /grill-me transcript (if was a grilling question).
  - Discard prototype code; the LEARNING.md is the artifact.
  ```

## Workflow

### Step 1 — Sharpen the question

Refuse to start with vague questions. Force a one-sentence form:

- ✅ "Does it feel better to model Quote as a discriminated union by state, or as a single type with optional fields per state?"
- ❌ "How should we model Quote?"

If the human cannot phrase the question sharply, return to `/grill-me`.

### Step 2 — Choose the flavor

**Flavor A: Terminal app (for logic / state questions)**

Build a minimal terminal app that exercises the question:

```ts
// .planning/prototypes/quote-shape/app.ts
import readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
// ... prompts user for inputs, exercises both variants, prints comparison
```

Run it. Try the variants. Take notes.

**Flavor B: UI variants (for UX questions)**

Build one route in the existing frontend with 2-3 variants behind a search param:

```tsx
// .planning/prototypes/listing-card/page.tsx
const variant = new URLSearchParams(location.search).get("v") ?? "a";

return variant === "a" ? <ListingCardVariantA /> : <ListingCardVariantB />;
```

Navigate to `/listing-card?v=a`, `/listing-card?v=b`, `/listing-card?v=c`. Compare side by side. Take notes.

### Step 3 — Time-box ruthlessly

If 90 minutes pass and the answer is not clearer than when you started, stop. The question is wrong. Return to `/grill-me` with the observation "I prototyped two ways and neither was obviously right."

### Step 4 — Write the LEARNING.md

The format above. Be brutally honest:

- If neither variant won → say so. The new artifact is a refined question, not an answer.
- If one variant won but you're not sure → say so. Confidence: Medium.
- If you discovered a third option mid-prototype → say so. Update the question.

### Step 5 — Discard the code

```bash
# After the LEARNING.md is committed (or saved outside .planning/)
rm -rf .planning/prototypes/<question-slug>/app.ts  # or the relevant prototype files
```

The LEARNING.md stays. The code does not. This is non-negotiable: keeping the prototype around invites someone to "polish it up and ship it" — at which point it stops being a prototype and starts being unmaintained production code.

**Exception**: if the prototype reveals a small reusable utility (a helper function, a config snippet), extract it as a separate ADR or PR through the normal `/feature` flow. The original prototype still gets discarded.

### Step 6 — Record outcome

- If the question was from `/grill-me` → return the answer to the grilling transcript.
- If the question was architectural → write an ADR in `docs/adr/NNNN-<slug>.md`.
- Either way: the prototype's purpose is now served.

## Integration with the framework

- **Invoked by humans** when an open question in `/grill-me` or `/clarify` warrants experimentation.
- **Invoked by `/grill-me` Step 5** when an open question is marked "blocking" and the human authorizes a spike.
- **Invoked by `/clarify` Step 2** when an ambiguity resolution depends on technical feasibility evidence.
- **Output (LEARNING.md) feeds**: `/grill-me` answers, `/domain-model` ADRs, `/specify` if the answer is large enough to be its own design, `/clarify` if the spike resolved an ambiguity, or `/sad` "Evidence" section if the spike contributed to an architecture decision.
- **NOT integrated into Ralph** — prototyping is interactive, not autonomous.

## Attribution

The "throwaway, terminal-app or UI-variants" pattern is adapted from `/prototype` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). MIT licensed.

## What this skill never does

- Produce code intended to ship (the LEARNING.md is the ship-able artifact).
- Skip the discard step (Step 5).
- Spend more than 90 minutes (if it does, the question is wrong).
- Replace `/grill-me` (the prototype answers one question; the grilling resolves the design tree).
- Replace `/optimize` (no measurement discipline; do not use for perf decisions).
