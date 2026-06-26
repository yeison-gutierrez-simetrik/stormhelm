# ADR 0003 — Engine-call liveness via a concurrent wall-clock sampler (not an in-process watchdog, not yet a stream heartbeat)

**Date:** 2026-06-26
**Status:** Proposed
**Supersedes:** none
**Decision owner:** maintainer (ratify the two open parameters W and R below)

> **DRAFT for ratification.** This ADR records the design agreed for the
> engine-liveness cluster (FOLLOW-UP 115 + issues #146/FU-117, #147/FU-118).
> The **approach** is decided (concurrent wall-clock sampler; buffered output
> kept; stream heartbeat deferred). The two **parameters** — sampler window `W`
> and retry budget `R` — carry recommended values that the maintainer ratifies
> before implementation. Flip Status → Accepted with `Accepted:` + the ratified
> W/R, then implement.

## Context

Ralph runs each engine turn as a **synchronous** shell command substitution:

```sh
output=$( timeout -k 10 "${RALPH_CALL_TIMEOUT:-3600}" \
          claude -p "$prompt" … --output-format json )
```

The only liveness backstop today is that `timeout` (FU-92): a call that hangs is
SIGKILLed at `RALPH_CALL_TIMEOUT` (default **3600s**) and scored apart from a
0-token engine no-op (FU-74/101). This floor is deliberately high — a real
money-slice acceptance cycle (full `@release` + Postgres testcontainers + 1500+
vitest) legitimately runs 24–30 min, and 1800s killed productive calls.

On the belong slice-41 campaign (issues #412, #146, #147) the engine call
**wedged** — alive PID, ~0 CPU, no `cucumber`/test descendant, zero worktree
writes — at least three times in one ~1 hr session. A direct short
`claude -p 'reply OK'` probe succeeded every time, so this is **not** an
Anthropic outage or a rate window: long-context calls on a long session
intermittently wedge. Recovery was manual kill-the-tree + `--resume`, each
wasting **up to the full 2700–3600s** before `timeout` would fire.

Two hard constraints frame the fix:

1. **No in-process watchdog can fire (FU-92).** The loop is blocked *inside* the
   `$(…)` substitution; an mtime/heartbeat check that runs in the same shell
   never gets a turn. Any watchdog must run **concurrently** — a separate
   process started before the call.

2. **A productive long generation and a wedge share one signature (FU-118/#147).**
   For 13–21 min a healthy `/tdd` shows flat *local* CPU (inference is remote),
   **0 worktree writes** (the model streams a large response before the engine
   applies edits), and a frozen token counter (logged only at call completion).
   A wedge shows the *same* three signals. Only the **outcome** (a commit + token
   advance vs a zero-token completion) separates them, and only *after* ~20 min.
   So any liveness signal built from CPU + worktree-writes alone cannot tell the
   two apart inside that window.

The three feedback items map onto this as:

| Item | Severity | Asks for |
|---|---|---|
| FU-115 | MED / decision | *some* wedge detection short of the 45-min timeout |
| #146 / FU-117 | HIGH / decision | a watchdog that aborts + retries a hung call itself |
| #147 / FU-118 | MED | a mid-call `engine.call.progress` heartbeat to tell productive from wedged |

## Decision

**Add a concurrent wall-clock sampler that bounds a *silent* engine call below
`RALPH_CALL_TIMEOUT`, and retries it a small fixed number of times before
falling through to the existing timeout.** Keep `--output-format json` (buffered)
— we do **not** adopt stream parsing in this ADR. The stream heartbeat (#147) is
deferred with an explicit activation criterion (below).

### Mechanism

Before launching `claude -p`, fork a **sampler** subprocess that, every ~30s,
records two liveness proxies and compares them to the previous tick:

- **worktree activity** — newest mtime across tracked + untracked files in the
  slice worktree (the same set Ralph already scores for "did the worktree
  advance", FU-101);
- **host activity** — presence of a test/`cucumber` descendant of the call PID,
  and a coarse CPU-delta on the process tree.

If **both** proxies stay flat for the whole window `W`, the sampler judges the
call **silent** and SIGTERMs the `claude` process tree (then SIGKILL after the
existing `-k 10` grace). That re-enters the FU-92 path: the call returns 124/137
→ Ralph's existing **126** ("call-timeout, score by whether the worktree
advanced") handling. The loop then **retries the same turn** up to budget `R`
(fresh sub-invocation, like a manual `--resume`), logging
`engine.call.watchdog_retry` per retry. After `R` retries it stops killing and
lets `RALPH_CALL_TIMEOUT` remain as the final backstop, so the change can only
make a wedged call recover *faster* — never hang *longer* — than today.

This satisfies FU-115 (wedge detection exists) and #146/FU-117 (the loop aborts
+ retries itself, bounded), reusing the 126 scoring path rather than inventing a
parallel one.

### Why this approach (alternatives weighed)

- **In-process mtime watchdog** — rejected by constraint 1 (can't fire inside the
  synchronous call). This is the FU-92 finding restated.
- **Just raise/lower `RALPH_CALL_TIMEOUT`** — rejected (#146 explicitly): a lower
  flat timeout kills productive 24–30 min acceptance cycles; a higher one only
  lengthens the waste. A *silence*-based bound is orthogonal to total-duration.
- **Concurrent sampler + `--output-format stream-json` heartbeat (#147)** — the
  most precise (keys on `streamed_tokens` advancing, so `W` could drop to ~5 min
  and never false-kill a productive call). **Deferred, not adopted**: it changes
  the engine output contract (every `ralph_extract_tokens_from_output` / result
  parser must handle the streamed envelope), and the wall-clock sampler delivers
  most of the recovery value first. See "Deferred".
- **External harnesses**: Aider/OpenHands bound a *step* with a wall-clock cap
  and retry; CI runners (GitHub Actions `timeout-minutes`, Bors) bound a job and
  re-queue. None infer wedge-vs-busy from a token stream — they bound wall-clock
  and retry, which is exactly the conservative tier chosen here.

### The parameter tension the maintainer is ratifying

Because of constraint 2, a wall-clock sampler **cannot** safely use a short `W`:
set `W` below the productive-no-write ceiling (~21 min observed) and it
false-kills healthy long `/tdd` generations. So `W` must sit **above** that
ceiling with margin — which makes this a **conservative, partial** win: the
watchdog fires somewhere between ~`W` and the 3600s timeout, not at ~5 min. That
is the accepted cost of *not* doing #147 in this round.

**Recommended for ratification:**

- **`W` (silent-window) = 1500s (25 min).** Above the ~21 min productive-no-write
  ceiling + ~4 min margin; default `RALPH_CALL_TIMEOUT` 3600s stays the backstop.
  Env override `RALPH_WEDGE_WINDOW`. (Sub-option: scale `W` by call type — a
  `/tdd` streams longer than a `/run-acceptance`, which should be producing test
  subprocesses; a `/run-acceptance` with **no `cucumber` descendant** for ~10 min
  is a stronger wedge signal than a silent `/tdd`. Recommend shipping the single
  `W` first; add per-call-type tuning only if false-kills/late-kills are
  observed.)
- **`R` (retry budget) = 1.** One automatic kill+retry, then fall through to
  `RALPH_CALL_TIMEOUT`. #146 reports `--resume` "re-hangs ~15–25 min later", so a
  large `R` would just chain wedges; one retry buys a fresh sub-session cheaply
  and a second wedge is better surfaced to the supervisor than retried blindly.
  Env override `RALPH_WEDGE_RETRIES`.

## Deferred — the stream heartbeat (#147 / FU-118)

**DEFER-with-criteria.** Implement the `--output-format stream-json` heartbeat
(emit `engine.call.progress` with advancing `streamed_tokens`, and re-key the
sampler on token-advance instead of worktree-writes) when **either**:

- (a) a wall-clock `W` that avoids false-kills proves too high to recover wedges
  acceptably fast in practice (i.e. the conservative tier is measured to be
  insufficient — late kills keep wasting >~25 min); **or**
- (b) a 2nd consumer needs mid-call progress for its own supervision, making the
  output-contract change pay for itself beyond this one cluster.

Until then the wall-clock sampler is the single mechanism. *(Open question to
validate during implementation: does `claude -p` append to its session
transcript JSONL incrementally during a buffered call? If so, that file's mtime
advances during a productive stream but stays flat during a wedge — a better
discriminator than worktree-writes that needs **no** stream-json contract
change, and could lower `W` without (a)/(b). Validate before fixing `W`.)*

## Consequences

- A wedged call recovers in ~`W`+retry instead of ~3600s; a productive call is
  unaffected (sampler only kills on *total* silence past `W`).
- New env knobs `RALPH_WEDGE_WINDOW`, `RALPH_WEDGE_RETRIES`; new event
  `engine.call.watchdog_retry`. Needs the same GNU `timeout`/`gtimeout`
  dependency already required by FU-92; absent it, the sampler degrades off with
  the existing warning.
- The sampler is a consumer-runtime addition to `templates/ralph-lib.sh`; it
  must be portable to bash 3.2 / macOS (FU-113) and reap its own child on exit
  (no orphaned sampler after the call returns).
- **Not** addressed here: distinguishing productive-streaming from wedged inside
  `W` — that is exactly what the deferred #147 heartbeat buys.

## Acceptance (when implemented)

A fixture engine-mock that emits no tokens and touches no worktree file for `W`
→ the sampler SIGTERMs the call, the loop logs `engine.call.watchdog_retry`,
retries once, and (mock still silent) falls through to `RALPH_CALL_TIMEOUT` —
asserting the kill happened *before* 3600s and the retry count == `R`. A second
fixture where the mock writes a worktree file every tick → the sampler never
fires (no false-kill of a productive call).
