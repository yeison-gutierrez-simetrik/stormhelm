---
name: process-followups
description: |
  Processes a batch of consumer FOLLOW-UPs (feedback in
  `.planning/FOLLOW-UPS-HANDOFF.md`) into framework changes, under the v2
  STRICT evaluation rubric: reproduce each claim, run it through a critical
  evaluation gate (necessity / alternatives / external benchmark / generality /
  complexity), reach a per-FU verdict (IMPLEMENT / SIMPLIFY-INSTEAD /
  DEFER-with-criteria / REJECT), implement the valid ones with tests + the four
  gates, and open PRs that a human merges — never self-merge.
  Use when: new `## FOLLOW-UP N` sections appear in
  `.planning/FOLLOW-UPS-HANDOFF.md`, or when asked to "process the follow-ups".
  This is a FRAMEWORK-SELF skill (skills-internal/) — the maintainer's loop for
  turning consumer feedback into framework PRs. NOT shipped to consumers, NOT
  for project-artifact work.
---

# /process-followups — the consumer-feedback → framework-PR loop

## Purpose

Stormhelm evolves through an iterative dialogue with the projects that adopt it
(see CLAUDE.md "Feedback loop with consumer projects"). A consumer files
numbered FOLLOW-UPs in its handoff (`.planning/FOLLOW-UPS-HANDOFF.md`); this
skill turns a batch of them into reviewed framework changes **without
accreting niche complexity**. The product goal is a GENERAL framework for the
majority of development cases — not point solutions for one consumer.

This skill is the durable form of the v2-strict workflow. The rubric below
**overrides** an uncritical "validate → implement" default: with the engine
stable, implementation is no longer the default — evaluation is.

## When to invoke

- The FOLLOW-UPs monitor reports new `## FOLLOW-UP N` sections (N greater than
  `.planning/.fu-watch-state`).
- A maintainer says "process the follow-ups" / "¿hay follow-ups nuevos?".

## When NOT to invoke

- For a consumer PROJECT's planning-artifact drift → that is `/check-consistency`.
- For framework prose-vs-filesystem drift → that is `/verify-framework-consistency`.

## Workflow

### Step 0 — Pre-flight (do this BEFORE cutting any branch)

1. `git fetch origin && git checkout main && git pull` — **always start from a
   freshly-pulled main.** Cutting a branch from a stale local main is the root
   cause of the recurring docs-handoff append-conflict.
2. Verify the framework is green: run the three self-checks (see "Gates").
3. **Read every new `## FOLLOW-UP N` section COMPLETE** — never a truncated
   preview. A verdict reached from a partial read ships an incomplete fix
   (the cost lands as a consumer round-2). Read to the end of each FU's Fix +
   Acceptance block.

### Step 1 — Reproduce each claim

Run the FU's `Verify:` commands against the current code. A FOLLOW-UP that
does not reproduce gets a REJECT comment with the evidence — do not implement
on the consumer's say-so alone. Note where the claim is stale (e.g. it cites a
file/flag that has since changed).

### Step 2 — The critical evaluation gate (per FU)

Implementation is NOT the default. Run each reproduced FU through:

- **Necessity.** Does it bite the *general* development case, or only this
  consumer's setup? Estimate frequency × severity honestly.
- **Alternatives.** Weigh ≥2 approaches, always including **"document / config
  point instead of engine code"** and **"do nothing"**. Compare
  complexity-vs-coverage.
- **External benchmark.** WebSearch how comparable harnesses solve the same
  class (Aider, OpenHands/SWE-agent, GitHub coding agent / merge queue,
  Graphite/ghstack/spr for stacks, Bors/Mergify for queueing, Renovate for
  dependency flows, Pact for contract testing, Claude Code itself). Adopt a
  proven pattern over inventing one; cite it in the PR.
- **Generality bar.** Core-engine changes must serve the majority case;
  consumer-specific needs go to config points (env hooks like
  `RALPH_PREFLIGHT_CMD` / `RALPH_NOTIFY_CMD`, capabilities, `/setup` tailoring),
  never hardcoded.
- **Complexity budget.** Every addition justifies its maintenance cost. When
  you touch an area, actively look for something to REMOVE or consolidate (the
  FOLLOW-UP 24 spirit). A fix that *simplifies the underlying mechanism* so the
  special case disappears beats one that adds a special case.

### Step 3 — Per-FU verdict

One of:

- **IMPLEMENT** — possibly *differently or simpler* than the FU proposed; say
  how and why. (You may deviate from the FU's recommended option with evidence
  — e.g. FU-68: the FU recommended command-position matching, reproduction
  showed it can't distinguish a heredoc body line from a real multi-line
  command, so heredoc-stripping was correct instead.)
- **SIMPLIFY-INSTEAD** — fix the underlying mechanism so the special case is
  gone.
- **DEFER-with-criteria** — record an explicit activation condition (e.g.
  "build the auto-detect when the topology recurs / a 2nd consumer needs it").
  A deferral without a criterion is procrastination; with one it is design.
- **REJECT** — hand the maintainer a reasoned comment for the consumer-side
  reviewer.

### Step 3a — Maintainer decisions (escalate, don't decide)

If a FU asks to **relax a core safety invariant** — §58 (human approval of
features), §64 (sensitive-domain human merge), §68 (destructive-git guard), an
INV-N — that is the maintainer's call, NOT yours, even under a standing
"decide yourself" delegation. Use `AskUserQuestion` with the options and your
recommendation. (Ergonomics / classification / docs decisions you may decide
yourself and document for veto at review.)

### Step 4 — Implement (the valid ones)

- **Docs handoff PR first.** Cut `docs/handoff-<batch>` from the
  freshly-pulled main; append the batch's FU sections to
  `.planning/FOLLOW-UPS-HANDOFF.md`; one docs PR per batch.
- **Implementation, cumulative per §123** unless the FUs touch shared regions
  needing separate branches. **One commit per FU**, message stating the v2
  verdict + the alternatives weighed + the external reference.
- **Mocks ENFORCE real contracts.** A test mock must fail the way the real
  tool fails (e.g. `gh pr create` aborts on an unpushed branch; `gh issue edit
  --add-label` refuses a non-existent label) so a regression can't return
  silently. The mock-`bin` harness in `scripts/__tests__/fixtures/` is the
  pattern; the test fixture must mirror a real consumer (e.g. carry the
  `.gitignore` `/setup` writes) or it masks the bug.
- **Shipped artifacts are English only** (templates, skills, prompts,
  user-facing messages). Spanish belongs only in the conversation with the
  maintainer.
- **Contract change ⇒ enumerate ALL its consumers.** The dominant recurring
  defect is a contract fixed for one consumer and forgotten for another
  (FU-71→72 the `scenarios:` label; 38a/64→73 the `--base` ref; 52→82 the
  injected invariant-gate result). Before declaring a contract fix complete,
  grep for every reader of that label / flag / value / event.

### Step 5 — Gates (run all; never pipe them)

```bash
node scripts/check-framework-metadata.mjs    # cardinality + §N / skill refs
node scripts/check-invariants.mjs            # executable §N invariants
node scripts/sync-closed-sets.mjs --check    # §36 closed-set drift
node --test scripts/__tests__/*.test.mjs     # the suite
```

**Never pipe a gate** (`gate | tail`, `gate | grep`) — the pipe swallows the
exit code and a red gate reads as green. Capture the rc explicitly
(`node --test ... > out.txt 2>&1; echo "rc=$?"`) or run unpiped. This rule has
been broken (and caught) in this very repo more than once; it is not optional.

All four must be green before any PR. Verify the test rc WITHOUT a pipe.

### Step 6 — Open PRs (never merge), comment per FU

- **Open the PRs and STOP.** Never self-merge — the maintainer reviews and
  merges (§67). A merge *procedure* is not a merge *authorization*; authority
  is explicit, in-conversation, per-PR. Each PR body ends with "⚠️ Left open
  for maintainer review — not merging."
- **Per-FU comment** carrying: the v2 verdict, the alternatives considered, and
  the external references. For a DEFER, the activation criterion. For a REJECT,
  the reasoned hand-off.
- Update `.planning/.fu-watch-state` to the batch's max N.

### Step 7 — Consumer reviews and merge hygiene

- A consumer/reviewer comment on a PR → **iterate that PR (round-N)**: fix,
  re-run tests + gates, push, reply point-by-point. Resolve the comment, don't
  argue it.
- After a maintainer merges, **verify integrity**:
  `node scripts/check-merge-safety.mjs <pr> post <full-head-sha>`.
- A docs-handoff PR that goes `CONFLICTING` after a sibling handoff merged →
  rebase it onto the updated main, keeping both FU entries. (Prevent it by
  Step 0's pull-first and by not opening two docs-handoff PRs that race the
  same file end.)

## Hard rules (the cross-cutting lessons)

1. **Read each FU COMPLETE before the verdict** (FU-59 round-2).
2. **A contract change touches every consumer of that contract** (FU-71/73/82).
3. **Never pipe a gate** (the rc-swallow trap).
4. **Pull main before cutting any branch** (the append-conflict).
5. **Mocks enforce real contracts; fixtures mirror real consumers.**
6. **Shipped artifacts are English only.**
7. **Never self-merge; relaxing a core invariant escalates to the maintainer.**
8. **Deferral needs an explicit activation criterion.**

## Integration with the framework

- **Input:** `.planning/FOLLOW-UPS-HANDOFF.md` (the tracked consumer-feedback
  ledger); state in `.planning/.fu-watch-state`.
- **Conventions consumed:** §67 (require human review / never self-merge), §123
  (cumulative-vs-stacked), §36 (closed sets), the INV-N invariants, ADR-0002
  (ceremony classification).
- **Self-checks:** `scripts/check-framework-metadata.mjs`,
  `check-invariants.mjs`, `sync-closed-sets.mjs --check`, the `__tests__/`
  suite — see `docs/maintaining-stormhelm.md`.
- **Companion:** `/verify-framework-consistency` (prose-vs-filesystem) runs as
  part of the Gates step.

## What this skill never does

- Merge a PR (open and stop — §67).
- Implement a FOLLOW-UP that does not reproduce.
- Relax a core safety invariant without an explicit maintainer decision.
- Ship Spanish (or any non-English) in a consumer-facing artifact.
- Pipe a gate, or report green from a piped (rc-swallowed) run.
- Hardcode a consumer-specific need into the core engine (use a config point).
