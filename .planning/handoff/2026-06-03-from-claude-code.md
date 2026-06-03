# Session handoff — Claude Code (2026-06-03)

> Read after `CLAUDE.md`. Closes the FOLLOW-UPS-HANDOFF (**10 items**), the ADOPTION-COPY-LIST-BRIEF (FOLLOW-UP 9), **FOLLOW-UP 11** (Night Shift engine delivery), and a **Night Shift automation pass** (queue mode + flags + CI coverage). All work merged to `main`; no open PRs.

## TL;DR

- **19 PRs merged this window (#39–#57).** Three tracks: (1) ADR-0002 implementation (PR-M/N/O) + a parser fix it exposed; (2) the framework-consistency / adoption-copy-list cleanup (FOLLOW-UPs **1–11**); (3) **Night Shift automation** — deliver the Ralph engine to consumers (#56) + queue mode/flags/status + the first CI coverage of the loop (#57).
- **`main` is green:** `check-framework-metadata` ✅, `check-invariants` ✅, `sync-closed-sets --check` ✅, `node --test scripts/__tests__/*.test.mjs` ✅ **43/43**.
- **No blocking follow-ups.** The two `.planning/` briefs are fully addressed (archive/delete at will). A short Night-Shift improvement backlog remains (non-blocking) — see "Open / not done".

## Merged in this window

| PR | What |
|---|---|
| #39 | `/setup` installs consumer-runtime `scripts/` (adoption gap) |
| #40 | ADR-0002 **PR-M** — ceremony detectors + label-aware section taxonomy |
| #41 | `/setup` installs `detect-ceremony.mjs` (PR-M follow-up) |
| #42 | ADR-0002 **PR-N** — INV-6 escalation + reviewer re-detection + traceability gate |
| #43 | parser: normalize module granularity → fixes an INV-6 false-escalation |
| #44 | ADR-0002 **PR-O** — "derived not configured" docs + canonical section taxonomy in `core/12` |
| #45 | track `CLAUDE.md` (genericized, de-dangled) + drop dangling refs |
| #46 | `/setup` installs + wires the 5 hooks; reconciled hook path to `.claude/hooks/` |
| #47 | remove stale `task_flow/` sample (dogfooding is the living example) |
| #48 | detect-ceremony test uses parser-producible directory-form input |
| #49 | document the detector's assumed `src/<layer>/<ctx>` layout |
| #50 | **§123** — number the cumulative-vs-stacked PR convention (+ count sync) |
| #51 | document `/setup` re-sync procedure + cheap provenance stamp |
| #52 | move framework-self skill to `skills-internal/` + framework-maint docs out of shipped `AGENTS.md` (FOLLOW-UP 9 facets B+C) |
| #53 | track `.planning/handoff/` + `pr-bodies/` so the convention holds |
| #54 | exclude framework-vendored `scripts/**`,`.claude/**` from the composed Sonar gate + composer test (FOLLOW-UP 10) |
| #55 | update the closing handoff (window #39–#54) |
| #56 | `/setup` delivers the Night Shift engine (ralph-lib.sh + comment tmpl) to consumers; reconcile path to root (FOLLOW-UP 11) |
| #57 | Night Shift: queue mode + `--max-iterations`/`--worker-id` flags + terminal-status fix + **first CI coverage of the Ralph loop** (8-case harness) |

## State changes a future session must know

- **Rules now go to §123** (was §122). §123 = "Cumulative vs stacked PRs" in `core/13`. `coreRules` 98, `totalRules` 123.
- **`skills/` = 31 consumer-facing (invokable) skills.** A new top-level **`skills-internal/`** holds framework-self skills (only `verify-framework-consistency`) — NOT shipped to consumers, excluded from the "N skills" count. `check-framework-metadata.mjs` counts `skills/` only, but resolves `/skill` links + `§refs` against `skills/` ∪ `skills-internal/`.
- **`docs/maintaining-stormhelm.md`** is the new framework-internal doc (self-verification gate + the framework-self vs shipped boundary). Adoption does **not** copy it.
- **Consumer hooks live at `.claude/hooks/`** (not repo-root `hooks/`); wired via `${CLAUDE_PROJECT_DIR}/.claude/hooks/`. All sources (§113/core-19, hooks/README, README Phase 0, `/setup`) agree now.
- **`/setup` copies** consumer-runtime `scripts/` (7) + the 5 hooks + a `// stormhelm: <sha>` provenance stamp; **never** `check-framework-metadata.mjs` (framework-self).
- **`CLAUDE.md` is tracked** (genericized — no `belong-marketplace` coupling, no dangling refs).
- **`task_flow/` is gone.** The repo dogfoods itself as the adoption example.
- **The composed Sonar gate excludes vendored framework dirs** (`scripts/**`, `.claude/**`) — `compose-sonar-properties.mjs` always emits them so a consumer's SonarCloud doesn't flag copied framework infra as product defects (covered by a composer test, #54).
- **`.planning/handoff/` + `pr-bodies/` are now tracked** (#53) — reality matches CLAUDE.md. Agnosticism note: the `belong-marketplace` mentions that remain live only in internal `.planning/` working records (historical pr-bodies + the cowork handoff), never in shipped/root artifacts — validated clean.
- **Night Shift (Ralph) is delivered + automatic** (#56/#57). `/setup` now copies the engine — `ralph-local.sh` + `ralph-lib.sh` + `ralph-blocked-comment.md.tmpl` co-located at the project root (it aborted on first run before — the engine wasn't shipped). `ralph-local.sh` parses `--max-iterations`/`--worker-id` (+ positional back-compat) and, with **no issue**, runs **queue mode** over the whole open `ralph-ready` backlog (self-invocation per issue; a blocked issue doesn't halt the queue). Max-iter exhaustion now ends `blocked` (not `budget_exceeded`). All consumer Ralph paths live at **project root** (the runbook's `templates/ralph-local.sh` outlier was reconciled).
- **The Ralph loop has CI coverage** (#57): `scripts/__tests__/ralph-loop.test.mjs` drives the real `ralph-local.sh` through committed mock `claude`/`gh` (`fixtures/ralph-mock-bin/`) — gate, happy→PR, flags, max-iter→blocked, reviewer-blocking, queue mode, NDJSON. The workflow now triggers on `templates/**` too. Suite is **43/43**. (To extend Ralph coverage, add cases there; it's `node:test` orchestrating bash, no bats/jq.)

## Conventions reinforced (lessons from this window)

- **Count churn is gate-invisible in prose.** `check-framework-metadata.mjs` only guards canonical phrasings; "all N rules" / `§1–§122` prose slips through. On any `§N`/skill-count change, also sweep README/WORKFLOWS-GUIDE/CLAUDE.md prose — or make it count-agnostic ("every rule"). `CLAUDE.md` is **not** scanned by the gate at all.
- **Framework-self vs shipped** is now an explicit boundary (see `docs/maintaining-stormhelm.md`): `skills/` vs `skills-internal/`; consumer-runtime `scripts/` vs `check-framework-metadata.mjs`; hooks shipped to `.claude/hooks/`. When adding a skill/script/hook, decide which side it sits on **and** wire it into `/setup` if consumer-runtime.
- **Agnosticism:** never add `belong`/`simetrik`/local paths to shipped files (keep the Belong attribution credit in README/AGENTS/LICENSE). The `cp -R skills` adoption copies wholesale — that's why physical separation (`skills-internal/`) beats a copy-time filter.
- **Merge discipline:** only merge at `MERGEABLE && CLEAN`, never `UNKNOWN` (it recomputes after a sibling merge — wait it out).

## Open questions / not done

- None blocking. The two non-blocking judgement calls from the prior (cowork) handoff are resolved: `task_flow/` fate (deleted, #47); review-budget defaults rode in with PR-Group earlier.
- **Night Shift improvement backlog (non-blocking; the maintainer agreed these are the right next steps):**
  - **Dependency-ordered queue (highest value):** queue mode iterates `gh issue list` order (created DESC), not slice-dependency order — #57 ships only a loud stderr warning. The DAG already exists (`group-slice-issues.mjs` / `parse-layers-affected.mjs`); order foundation-first so a dependent backlog doesn't wake you to `ralph-blocked`.
  - **Night-global budget across the queue:** per-issue `budget:NNk` is enforced, but `.planning/budget.txt` (the night's total) isn't gated across issues — queue mode can overrun the cost ceiling.
  - **`--resume`:** a crashed/killed run leaves a half-done `agent/*` branch; detect the branch + last session and continue.
  - **Empty-diff guard:** if `/tdd` produced no diff, skip reviewer/PR and log no-progress instead of opening an empty PR.
  - **/setup tailoring assertion (#56 Note 2, optional):** validation step asserts `bash -n` only; could also assert the stack's `TEST_CMD` line is present so "delivered" means "tailored".
- Optional housekeeping: the two working briefs (`.planning/FOLLOW-UPS-HANDOFF.md`, `.planning/ADOPTION-COPY-LIST-BRIEF.md`) are done — archive or delete at will. (`.planning/handoff/` + `pr-bodies/` are now tracked — #53 — so the CLAUDE.md "tracked" claim now holds.)
- Optional, deferred by decision: a stricter agnosticism pass could genericize the `belong-marketplace` mentions in the tracked internal `.planning/` records (handoffs/pr-bodies). Validated as **not required** — shipped/root surface is clean; internal historical records are below the agnosticism bar. Left as-is to avoid distorting the record.

## Quick orientation

```bash
git checkout main && git pull --ff-only
node scripts/check-framework-metadata.mjs && node scripts/check-invariants.mjs && node scripts/sync-closed-sets.mjs --check
node --test scripts/__tests__/*.test.mjs
gh pr list --state open            # empty as of this handoff
git log --oneline --merges main -22   # this window = #39–#57
```
