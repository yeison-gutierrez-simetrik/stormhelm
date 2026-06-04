---
name: handoff
description: |
  Compacts the current session into a structured handoff document so a fresh
  agent can pick up where this one left off without context loss. Triggered
  manually OR automatically by `context-monitor.cjs` hook (§112) when context
  drops below thresholds. Adopted from Matt Pocock's `/handoff` pattern.
  Use when: context is approaching saturation, work needs to pause across
  sessions, or transferring an in-flight task to another developer/agent.
---

# /handoff — Session Compaction & Transfer

## Purpose

Sessions die. Context fills. Developers go home. Without an explicit handoff, the next agent (or human) starts from zero — re-reading code, re-discovering decisions, re-deriving the plan. `/handoff` produces a single document that captures the **minimum context needed to resume**: what was done, what's in flight, what decisions were made, what to do next.

This is the **safety net** for long Ralph sessions, multi-day features, and any work that crosses session boundaries.

## When to invoke

- The `context-monitor.cjs` hook (§112) emits a WARNING or CRITICAL — handoff before context fails.
- End of day if work is mid-issue.
- Before invoking `/clear` to start a fresh context.
- When handing a branch to another developer.
- When Ralph hits `max-iterations` (§66) and the work needs to transfer to a human.

## When NOT to invoke

- For sessions with <10 tool uses and no significant decisions (waste of tokens).
- After `/feature` Step 12 completes (the PR description + traceability matrix already capture state).

## Inputs

- The current session's history (tool uses, decisions, files touched).
- The issue being worked on (if any).
- `.planning/ralph-sessions/<current>.log` if Ralph session.

## Outputs

- A handoff file in a temp location: `$(mktemp -t handoff-XXXXXX.md)` (consistent with mattpocock pattern).
- Path returned to the workflow.
- Optionally: attached as comment on the issue if `--issue <NNN>` provided.

## Workflow

### Step 1 — Identify the work scope

What is the agent doing right now?

- Issue / PR number being worked on.
- Branch name.
- Phase: planning / Red / Green / Refactor / Review / Blocked.
- Files touched (modified, created, deleted).

### Step 2 — Identify decisions made

What decisions were settled during this session that are NOT obvious from the code?

- Architectural choices made.
- Tradeoffs accepted ("we chose X over Y because Z").
- Open questions answered.
- Open questions surfaced (not yet answered).

### Step 3 — Identify what's next

What is the immediate next action?

- Specific file to touch next.
- Specific test to make pass.
- Specific person to ask about an OQ.
- Specific skill to invoke (`/run-acceptance`, etc.).

### Step 4 — Write the handoff

Save to `$(mktemp -t handoff-XXXXXX.md)` (mattpocock pattern):

```markdown
# Handoff — <issue/branch> — YYYY-MM-DD HH:MM

## Working on
- **Issue:** #142 (Listing publication)
- **Branch:** agent/feature-listing-publication-142
- **Phase:** Green (5 of 8 tests passing)

## What I just did
1. Wrote Red phase tests for `publish-listing.use-case.ts` (3 tests).
2. Implemented the use case Green path (2 of 3 tests pass).
3. Started on the §27 authorization check; not finished.

## Files touched
- src/domain/listings/listing.ts (added `publish()` method)
- src/domain/listings/listing-state.ts (added `published` state)
- src/application/use-cases/publish-listing.use-case.ts (new file)
- src/application/use-cases/__tests__/publish-listing.use-case.test.ts (new file)

## Decisions made this session
- Chose to model Listing state as string literal union (§36) rather than enum (§5/§6 violation).
- Authorization: only Provider members with role `owner` or `admin` can publish (per /grill-me answer Q14).

## Open questions
- OQ-3 (non-blocking): should we emit `listing.published.v1` event in the same use case or via outbox (§17)?
  - Default if unresolved: same use case (simpler for v1).

## Next concrete action
Resume in `publish-listing.use-case.ts:line 47`. The §27 check is in progress; the membership lookup is partially written. After completing it, run:
```
$TEST_CMD src/application/use-cases/__tests__/publish-listing.use-case.test.ts
```
expected: 3 of 3 tests pass.

## Rule context loaded so far
- core/02-architecture.md (§3 hexagonal)
- core/05-domain-modeling.md (§19, §36)
- core/06-commands-and-security.md (§27)
- features/listings/listing-publication.feature

## Skills not yet run for this issue
- `/run-acceptance` (next after Green completes)
- reviewer agent (after acceptance)
```

### Step 5 — Optionally attach to the issue

If `--issue <NNN>` was provided:

```bash
gh issue comment <NNN> --body "$(cat $HANDOFF_FILE)"
```

This way the handoff is visible to humans reviewing the issue queue.

### Step 6 — Return path to caller

```markdown
## /handoff output

Handoff saved to: /tmp/handoff-Xn4kP2.md
Issue commented: #142 (if --issue flag passed)

To resume in a fresh session, run:
  cat /tmp/handoff-Xn4kP2.md
And then continue from "Next concrete action".
```

## Integration with the framework

- **Invoked manually OR by `context-monitor.cjs` hook (§112)** when context drops.
- **Invoked by Ralph** when hitting `max-iterations` (§66) with partial work — preserves the state for human review.
- **Read by the next session's main agent** as the first input after `/clear`.

## Attribution

The `mktemp -t handoff-XXXXXX.md` pattern and the "context as concrete next action" approach is adapted from `/handoff` in [`mattpocock/skills`](https://github.com/mattpocock/skills) (AI Hero). MIT licensed.

## What this skill never does

- Save to a tracked location (handoffs are ephemeral; only PR descriptions and issue comments persist).
- Include code diffs (the next agent will read the diff from git).
- Resolve open questions on behalf of stakeholders.
- Mark the issue done (only `/run-acceptance` + human merge can).
