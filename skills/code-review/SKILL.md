---
name: code-review
description: |
  Thin wrapper that invokes the `reviewer` sub-agent (§114) to audit a diff. The
  real review happens in the agent (read-only, fresh context, structured report).
  This skill exists so humans and Ralph can request a review via slash command
  without needing to remember Task tool syntax. For automated invocation from
  /feature Step 12 or Ralph, /run-acceptance Step 8 already invokes the agent —
  use this skill only for ad-hoc invocations.
---

# /code-review — Invoke Reviewer Agent

## Purpose

`/code-review` is a **convenience wrapper** around the `reviewer` sub-agent (§114). The real review logic lives in `agents/reviewer.md`. This skill exists for two cases:

1. **Human ad-hoc review request** — a developer wants a fresh review of their working branch outside the `/feature` flow.
2. **Main agent ad-hoc invocation** — during interactive work, the main agent wants to audit a diff before committing.

For the automated workflows (`/feature` Step 12, Ralph pre-PR), `/run-acceptance` Step 8 already invokes the reviewer. **Do not invoke this skill from those flows** — that would double-invoke.

## When to invoke

- Manual request from a human or the main agent.
- Before pushing a long branch that hasn't been through `/run-acceptance` yet.
- To re-review after addressing previous findings.

## When NOT to invoke

- Inside `/feature` Step 12 — already automated via `/run-acceptance`.
- Inside Ralph — already automated.
- For partial diffs that are not yet ready to ship.

## Inputs

- Target: PR number (`#142`), commit range (`HEAD~3..HEAD`), branch name, or current working tree.
- Optionally: a list of `scn-NNN` scenarios to focus the review.

## Outputs

- The reviewer agent's structured report (see `agents/reviewer.md` for the canonical format).
- The report is also saved to `.planning/reviews/<target>-<YYYYMMDD>-<HHMMSS>.md`.

## Workflow

### Step 1 — Validate target

Parse the input:

- PR number → use `gh pr view <num>` to verify it exists.
- Commit range → use `git rev-list` to verify it exists.
- Branch name → use `git rev-parse` to verify it exists.
- Working tree → use `git status` to verify it has changes.

If invalid → stop and ask for valid input.

### Step 2 — Invoke the reviewer agent

```
Task tool with:
  subagent_type: "reviewer"
  prompt: "Review the diff on <target>. <optional scenarios>. Produce the standard structured report and save to .planning/reviews/<target>-<timestamp>.md."
```

The Task tool runs the agent in a fresh context (key per §114 — confirmation bias avoidance).

### Step 3 — Capture the report

The agent's response is the structured report. Save to `.planning/reviews/`. Return the path to the caller.

### Step 4 — Surface blocking findings

If the report contains any 🛑 findings, the skill output emphasizes them at the top:

```markdown
## /code-review summary

**Target:** <target>
**Blocking findings:** 2 — must fix before merge
**Should-fix findings:** 3
**Suggestions:** 5

Full report: .planning/reviews/<target>-<timestamp>.md
```

If no blocking findings, the summary is brief and positive.

## Integration with the framework

- **Uses `reviewer` agent (§114) under the hood.**
- **NOT invoked by `/feature` or Ralph** (they use `/run-acceptance` Step 8 instead).
- **Saves to `.planning/reviews/`** — versioned for audit.

## Why this skill is thin

The architectural decision is in §114 + `agents/reviewer.md`: code review must run in a **separate agent session** with a **read-only tool set**. A skill cannot enforce that constraint — only an agent invocation via Task tool can. So this skill's only job is to make the invocation ergonomic and to handle the input parsing.

## What this skill never does

- Run the review logic itself (delegates to the agent).
- Modify the code being reviewed (the agent is read-only).
- Approve or merge (humans do).
- Re-invoke the agent if the first response had findings (the human decides what to do with them).
