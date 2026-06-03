# Session handoff — Claude Code (2026-06-03)

> Read after `CLAUDE.md`. Closes the FOLLOW-UPS-HANDOFF (8 items) **and** the ADOPTION-COPY-LIST-BRIEF (FOLLOW-UP 9). All work merged to `main`; no open PRs.

## TL;DR

- **14 PRs merged this window (#39–#52).** Two tracks: (1) ADR-0002 implementation (PR-M/N/O) + a parser fix it exposed; (2) the framework-consistency / adoption-copy-list cleanup (FOLLOW-UPs 1–9).
- **`main` is green:** `check-framework-metadata` ✅, `check-invariants` ✅, `sync-closed-sets --check` ✅, `node --test scripts/__tests__/*.test.mjs` ✅ **30/30**.
- **No known open follow-ups.** Both working briefs in `.planning/` (`FOLLOW-UPS-HANDOFF.md`, `ADOPTION-COPY-LIST-BRIEF.md`) are fully addressed — safe to consider closed/archived.

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
| #52 | move framework-self skill to `skills-internal/` + framework-maint docs out of shipped `AGENTS.md` |

## State changes a future session must know

- **Rules now go to §123** (was §122). §123 = "Cumulative vs stacked PRs" in `core/13`. `coreRules` 98, `totalRules` 123.
- **`skills/` = 31 consumer-facing (invokable) skills.** A new top-level **`skills-internal/`** holds framework-self skills (only `verify-framework-consistency`) — NOT shipped to consumers, excluded from the "N skills" count. `check-framework-metadata.mjs` counts `skills/` only, but resolves `/skill` links + `§refs` against `skills/` ∪ `skills-internal/`.
- **`docs/maintaining-stormhelm.md`** is the new framework-internal doc (self-verification gate + the framework-self vs shipped boundary). Adoption does **not** copy it.
- **Consumer hooks live at `.claude/hooks/`** (not repo-root `hooks/`); wired via `${CLAUDE_PROJECT_DIR}/.claude/hooks/`. All sources (§113/core-19, hooks/README, README Phase 0, `/setup`) agree now.
- **`/setup` copies** consumer-runtime `scripts/` (7) + the 5 hooks + a `// stormhelm: <sha>` provenance stamp; **never** `check-framework-metadata.mjs` (framework-self).
- **`CLAUDE.md` is tracked** (genericized — no `belong-marketplace` coupling, no dangling refs).
- **`task_flow/` is gone.** The repo dogfoods itself as the adoption example.

## Conventions reinforced (lessons from this window)

- **Count churn is gate-invisible in prose.** `check-framework-metadata.mjs` only guards canonical phrasings; "all N rules" / `§1–§122` prose slips through. On any `§N`/skill-count change, also sweep README/WORKFLOWS-GUIDE/CLAUDE.md prose — or make it count-agnostic ("every rule"). `CLAUDE.md` is **not** scanned by the gate at all.
- **Framework-self vs shipped** is now an explicit boundary (see `docs/maintaining-stormhelm.md`): `skills/` vs `skills-internal/`; consumer-runtime `scripts/` vs `check-framework-metadata.mjs`; hooks shipped to `.claude/hooks/`. When adding a skill/script/hook, decide which side it sits on **and** wire it into `/setup` if consumer-runtime.
- **Agnosticism:** never add `belong`/`simetrik`/local paths to shipped files (keep the Belong attribution credit in README/AGENTS/LICENSE). The `cp -R skills` adoption copies wholesale — that's why physical separation (`skills-internal/`) beats a copy-time filter.
- **Merge discipline:** only merge at `MERGEABLE && CLEAN`, never `UNKNOWN` (it recomputes after a sibling merge — wait it out).

## Open questions / not done

- None blocking. The two non-blocking judgement calls from the prior (cowork) handoff are resolved: `task_flow/` fate (deleted, #47); review-budget defaults rode in with PR-Group earlier.
- Optional housekeeping: the two working briefs (`.planning/FOLLOW-UPS-HANDOFF.md`, `.planning/ADOPTION-COPY-LIST-BRIEF.md`) are done — archive or delete at will. `.planning/handoff/` + `pr-bodies/` are still **untracked** locally despite CLAUDE.md calling them "tracked" (see [[stormhelm-planning-layer-gaps]] in agent memory) — track them if you want the convention to hold.

## Quick orientation

```bash
git checkout main && git pull --ff-only
node scripts/check-framework-metadata.mjs && node scripts/check-invariants.mjs && node scripts/sync-closed-sets.mjs --check
node --test scripts/__tests__/*.test.mjs
gh pr list --state open            # empty as of this handoff
git log --oneline --merges main -16
```
