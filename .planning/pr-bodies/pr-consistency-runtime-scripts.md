# fix(setup): install consumer-runtime scripts + framework-consistency corrections

## Why

A review of everything merged in the #19–#38 window (against Stormhelm's own philosophy: §1 proportionality, dogfooding, §N/INV-N numbering, "one parser, two consumers", the adoption-by-copy model) found the merged **code** sound and all gates green — but surfaced one real **flow** gap and several doc-accuracy drifts that the recent merges introduced or deepened. This PR fixes the two clearly-correct items and details the rest as suggestions for maintainer decision.

> Scope note: `CLAUDE.md` was **untracked** in the repo. Its corrections land here as a **separate commit** so it can be dropped if you'd rather keep `CLAUDE.md` local — but the dogfooding principle (version your context) and the fact that #38 left its INV-6/INV-7 block stale argue for tracking it.

## What this PR changes

### 1. `/setup` now installs the consumer-runtime scripts (the substantive fix)

**Problem.** 7 of the 8 files in `scripts/` are **consumer-runtime**: shipped skills/hooks invoke them by *relative* path (`node scripts/<x>.mjs`, resolved against the consumer repo root):

| Script | Invoked by |
|---|---|
| `preflight.mjs` | feature, run-acceptance, security-hardening, tdd, to-issues, traceability-matrix (×12) |
| `check-invariants.mjs` | traceability-matrix etc. (×4) |
| `check-merge-safety.mjs` | feature, /gates (×3) |
| `group-slice-issues.mjs` | to-issues (×2) |
| `parse-layers-affected.mjs` | imported by `group-slice-issues.mjs` |
| `sync-closed-sets.mjs` | the `closed-set-check.js` hook (which *is* copied to consumers) |
| `compose-sonar-properties.mjs` | Sonar config generation |

But `/setup` scaffolds `docs/*`, `features/`, `issues/`, `.planning/*` and copies `events.md`/`incidents.md` — and copies **none** of these scripts. A project that adopts Stormhelm by the documented path (copy `.claude/` + `docs/engineering/`, run `/setup`) hits a `node scripts/...: No such file` the first time it runs `/to-issues`, `/run-acceptance`, `/gates`, `/traceability-matrix`, `/tdd`, or `/security-hardening`. The dependency is pre-existing but **#35 (group-slice-issues) and #36 (/gates → check-merge-safety) deepened it** without closing the install story. This is exactly the "broken gate every consumer inherits" class the dogfooding principle warns about.

**Fix.** `skills/setup/SKILL.md` now copies the 7 consumer-runtime scripts from `$STORMHELM_PATH/scripts/` into the consumer's `scripts/`, adds them to the "Versioned in Git" list, and adds a validation-step check that they resolved. `check-framework-metadata.mjs` (framework-self-maintenance) is intentionally not copied.

### 2. `CLAUDE.md` accuracy corrections (separate commit; also brings it into git)

- **`scripts/` taxonomy.** The layout labelled the *whole* dir "framework self-maintenance" — wrong for 7/8. Re-tagged each entry `[consumer-runtime]` vs `[self-maint]`, added the missing `group-slice-issues.mjs`, and added a "scripts/ taxonomy" section explaining the install requirement.
- **INV-6 / INV-7 reservations.** #38 (PR-Attr) made the old block stale. Corrected to match `check-invariants.mjs`: INV-6 cites `—` (not "§123") and is for PR-N; **INV-7 is intentionally NOT an executable invariant** — finding-attribution shipped as a reviewer + process concern in `agents/reviewer.md` + `core/13` §67.
- **CI status.** #37 added `verify-scripts-tests.yml`; the doc still said "CI runs only the first gate". Corrected (and added the workflow to the layout).
- **`.planning/` layout.** `improvements/` (consolidated roadmap) and `responses/` (design-rationale trail) are referenced throughout the repo/handoffs but are **not present on disk** — never committed. Flagged inline so future sessions don't assume they exist.

## Suggestions (NOT changed here — for your call)

1. **Track the coordination artifacts.** `.planning/handoff/` and `.planning/pr-bodies/pr-31-review-comments.md` are present but untracked, yet `CLAUDE.md` says these dirs are "tracked". Recommend `git add`-ing them — but the current handoff (`2026-06-02-from-cowork.md`) is **stale** (says active branch `feat/pr-group`, lists PR-Std/PR-Attr as "not started"; all three — #35/#36/#38 — are merged). Update it first, then track.
2. **Missing roadmap + responses (possible data loss).** `consolidated-roadmap-2026-06.md` and `.planning/responses/response-{1..6}-*.md` are referenced as the source of priorities + design rationale but don't exist in the repo. Worth recovering from local/Cowork state or formally retiring the references.
3. **Give the "Cumulative vs stacked PRs" rule a §N.** Added in #35 as an *unnumbered* `###` subsection of `core/13` §67, yet it carries normative language ("Cumulative is the default; stacked is discouraged", "finding-attribution is mandatory"). The framework numbers its rules for traceability/closed-set; a "mandatory" rule without a §N is a mild convention break. Either fold it explicitly into §67's prose or assign the next free §N (§123 is free — the old "INV-6 §123" reservation was dropped).
4. **`/setup` hook install is also under-specified.** Same class as the scripts gap: the framework's Node hooks (`git-guardrails.js`, `closed-set-check.js`, etc.) are referenced via `.claude/settings.json` but `/setup` doesn't show copying them into `.claude/hooks/`. Worth an explicit copy step mirroring the scripts fix.
5. **Consumer-script drift.** Copied runtime scripts will drift from the skills that call them as the framework evolves. Consider a version stamp or a `/setup --resync-scripts` path.

## Verification

```
node scripts/check-framework-metadata.mjs   # ✅
node scripts/check-invariants.mjs           # ✅
node scripts/sync-closed-sets.mjs --check   # ✅
node --test scripts/__tests__/*.test.mjs    # ✅ 15/15
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
