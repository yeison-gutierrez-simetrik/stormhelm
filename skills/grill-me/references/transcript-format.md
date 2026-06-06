# Grilling Transcript Format

`/grill-me` writes a transcript to `docs/decisions/grilling/<slug>-<YYYYMMDD>.md` using this shape. The transcript is the canonical record of the design tree resolution and is read by `/domain-model`, `/specify`, and the `reviewer` agent.

**The round orientation is EXCLUDED from the transcript (FOLLOW-UP 59).** The transcript is decision-only — resolved nodes, confirmed assumptions, open questions. The orientation block that opens a returning-session round is framing, not a decision, and must never be persisted here (nor counted toward the question-count calibration).

## Template

```markdown
# Grilling session — <slug>

- **Date:** YYYY-MM-DD
- **Feature:** <one-line summary>
- **Source:** <inline | @file.md>
- **Status:** complete | stopped-early | blocked-on-OQ
- **Question count:** <n> (target range per calibration table)
- **Open questions document:** `docs/decisions/grilling/<slug>-open-questions.md` (if any)

## Resolved design tree

### Actor: <ActorName>

**Q<N>.** <verbatim question text>
- (a) <option A text> — ✅ recommended. <rationale>
- (b) <option B text> — <viable trade-off>
- (c) <option C text> — <viable trade-off>
- (d) Other / correction — _(not selected | selected → user described: ...)_

**Answer:** (<letter>). _Rationale at decision time:_ <one-line summary>.
_Rejected options preserved as future ADR `Considered Options`._

**Q<N+1>.** ...

### Actor: <NextActor>
...

## Confirmed assumptions

- **A1:** <assumption>
- **A2:** <assumption>

## Shared mental model

<3-5 paragraph synthesis of what we're going to build, in the project's vocabulary (§22).>

## Hand-off

- Next skill: `/domain-model` (vocabulary refinement) → `/specify` (intent capture).
- ADR candidates discovered: <list of Q<N> that imply an ADR>.
- Constitution overrides discovered: <Q<N> that override a default like §11>.
```

## Why this format

- **Multiple-choice with recommendation** forces the agent to do design work before asking; rejected options are the ADR's "Considered Options" for free.
- **Verbatim option text** lets a future reviewer audit not only the chosen path but the rejected ones with their original framing.
- **Open questions doc** is separate (`<slug>-open-questions.md`) so blocking items can be tracked independently and Ralph can refuse `ralph-ready` until they resolve.
- **Hand-off section** explicitly names the next skill so workflow continuation is mechanical.
