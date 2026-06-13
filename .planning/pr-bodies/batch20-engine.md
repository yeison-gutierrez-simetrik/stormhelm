# fix(ralph): batch-20 engine hardening — FOLLOW-UPs 83, 84, 85

Processes the belong auto-pilot campaign batch (slices 12–15) under the v2 STRICT rubric. All three claims reproduced against `main` before any code was written. FU-86 is a maintainer decision and is escalated separately, not implemented here. Docs-handoff ledger PR: #120.

One commit per FU; cumulative branch per §123 (no shared-region conflicts).

## FU-83 — `RALPH_MODEL`: the engine model is a config point · IMPLEMENT (differently)

**Reproduced:** `templates/ralph-lib.sh` invoked `claude -p` with no `--model` — the engine ran on whatever the consumer's CLI default is, and the only escape from a model-specific rate window was hand-editing the vendored script (belong did exactly that, live).

**Deviation from the FU:** it asked for a hardcoded mid-tier default. Shipping a model *name* in the engine would rot and bakes a tier choice into the core. Instead: `RALPH_MODEL` set → `--model` on every engine call; unset → CLI default, byte-for-byte the old behavior. The chosen model lands in `ralph.session.started` (`engine_model`) and the watch notification.

**Alternatives weighed:** "document: change your CLI default" (rejected — can't split the interactive tier from the engine tier); hardcoded default + override (rejected — name rot, consumer cost choice in the core). **Reference:** [LiteLLM router fallbacks](https://docs.litellm.ai/docs/proxy/reliability) — a different model is a different rate bucket.

## FU-84 — iteration-level no-progress detector + one-shot fallback · IMPLEMENT

**Reproduced:** the FU-74 guard is per-call (`exit 0` + 0 tokens). A CLI that exits **non-zero without matching the 429 regex** — the subscription usage-window message — slips past it: `/tdd` burns the iteration as `tdd-failed`, `/run-acceptance` as `result-file-missing`, and the loop spins to `max_iterations` with frozen tokens. Live cost: two full 30-iteration allowances in one session, work already complete, issue wrongly `ralph-blocked`.

**Fix:** a real work iteration always advances the token counter — so `RALPH_ENGINE_MAX` consecutive non-green iterations with **zero token delta** → try `RALPH_FALLBACK_MODEL` once (opt-in; also fronts both FU-74 per-call exits) → else end `engine_failure` with a "the branch may already carry complete work — check `git log <branch>` before `--resume`" hint. Never `ralph-blocked`: the work is untainted.

**Alternatives weighed:** extending the 429 regex to "usage limit" (rejected — that path serializes into `rate_limit_exhausted`, which ralph-blocks the issue); counting non-zero exits per call (rejected — conflates real `/tdd` tool failures with outages; the zero token *delta* at iteration level is the unambiguous signal). **Reference:** [OpenHands' stuck detector](https://docs.openhands.dev/sdk/guides/agent-stuck-detector) — pathological no-progress is a *distinct terminal state*, not "out of turns".

**Mock enforces the real contract:** the new `MOCK_ENGINE_DOWN_FOR` knob emits the usage-limit stderr that must NOT match the retry regex, exits 1, reports 0 tokens, writes no result file — the exact live failure shape.

## FU-85 — workspace worktrees get a real install · IMPLEMENT (option b, not the FU's recommended a)

**Reproduced:** `ralph-isolated.sh` symlinks the primary's `node_modules` into the worktree (FU-69), so in a workspace monorepo every `@scope/*` import resolves through the primary checkout to **main's** code, not the branch under test — a permanent local red on every CLI-touching slice (belong: 4-for-4).

**Deviation from the FU:** option (a) — overlay re-links — cannot work: `node_modules` *is* the symlink, so writing `node_modules/@scope/*` through it mutates the **primary's** resolution; a per-entry symlink farm breaks pnpm's `.pnpm` layout. Option (b): detect a workspace (`pnpm-workspace.yaml` or a `"workspaces"` field) → run a real install in the worktree, giving it exactly CI's clean-checkout semantics — the green the consumer already trusts. Non-workspace consumers keep the FU-69 symlink unchanged (regression-tested). `RALPH_WORKTREE_INSTALL_CMD` overrides the install command (the `RALPH_PREFLIGHT_CMD` config-point pattern).

**Reference:** [pnpm's own git-worktrees guidance](https://pnpm.io/next/git-worktrees) prescribes a per-worktree `node_modules` (the shared store keeps it cheap) — the ecosystem answer is a real install per worktree, not sharing the primary's tree.

## FU-86 — exact-set scenario pins · ESCALATED, not in this PR

Marked `decision (maintainer)` by the consumer and touches the §58 approval contract — per the skill's Step 3a this is escalated with options + recommendation rather than decided here.

## Incidental fixes found during the sweep

- `ralph-local.sh.tmpl` header said `Implementa:` — Spanish in a shipped artifact (hard rule 6) → `Implements:`.
- `ralph_end_session`'s doc comment never listed `engine_failure` (added by FU-74) → now documented.
- `ralph-watch.sh` now surfaces `engine_model` on session start and the mid-run fallback switch as a headline notification (contract sweep: the watch is a consumer of the session NDJSON).

## Gates

- `check-framework-metadata.mjs` rc=0 ✅
- `check-invariants.mjs` rc=0 ✅
- `sync-closed-sets.mjs --check` rc=0 ✅
- `node --test scripts/__tests__/*.test.mjs` rc=0 ✅ (6 new tests: 2× FU-83, 3× FU-84/fallback, 1× FU-85)

All rc values captured unpiped.

⚠️ Left open for maintainer review — not merging.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
