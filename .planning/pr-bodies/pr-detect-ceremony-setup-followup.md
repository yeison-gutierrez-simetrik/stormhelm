# fix(setup): install detect-ceremony.mjs (PR-M follow-up) + exit-code comment

Follow-up to a detailed review of **#40** (ADR-0002 PR-M). #40 is faithful to the ADR (detector-derived classification, conservative over-classification, audited label-flip override, section taxonomy matching Safeguard 2, OQ1 parser reuse + OQ2 capability sections, correctly scoped away from PR-N/PR-O). This PR fixes the one process regression it introduced plus a doc nit, and records the remaining review findings for maintainer decision.

## Fixed here

### 1. 🔴 `detect-ceremony.mjs` was a new consumer-runtime script never wired into `/setup`

#40 added `scripts/detect-ceremony.mjs`, invoked by **three shipped skills** (`to-issues` Step 2, `specify` Step 2b, `domain-model` Step 5) via `node scripts/detect-ceremony.mjs`, and it imports `parse-layers-affected.mjs`. But it was **not** added to `/setup`'s consumer-runtime copy loop (`skills/setup/SKILL.md`) — which #39 established the same day. A freshly-adopted consumer would hit `node scripts/detect-ceremony.mjs: No such file` on the first `/to-issues` run.

This is the exact gap #39 closed, reopened two PRs later — which is why this PR also adds an inline reminder in the copy block: *when adding a new skill/hook-invoked `scripts/*.mjs`, add it here AND to the validation `ls`.*

**Change:** add `detect-ceremony.mjs` to the `for s in ...` copy loop and the validation-step `ls` in `skills/setup/SKILL.md`.

### 2. ⚪ Nit: exit-code comment

`detect-ceremony.mjs` header said *"Exit 0 always"*, but the CLI does `process.exit(2)` on missing args. Corrected to *"Exit 0 on success; 2 on usage error."*

## Not changed — review findings for your call

### A. Test fidelity: a unit test asserts a module count the real parser wouldn't produce

`scripts/__tests__/detect-ceremony.test.mjs` → `'>=3 modules (one context)'` injects **file-level** paths (`src/core/a.ts`, `src/core/b.ts`, `src/lib/c.ts`) directly into `detectCeremony` and asserts `module_count === 3`. But `parse-layers-affected.mjs` groups paths to 3 segments (`segs.slice(0,3).join('/')`) before `detectCeremony` ever sees them — so via the real CLI those three files collapse to **two** modules (`src/core`, `src/lib`) → `feature:single-module`, not multi-module. (Confirmed: the real fixture `02-component-a.md` lists two files under `src/modules/a/*` and the CLI reports `module_count: 1`.)

The test validates the pure function's counting contract, which is legitimate — but its name implies a `/plan` shape the parser can't emit. **Suggestion:** add a CLI/integration test asserting the grouping→classification path end-to-end, or rename the unit test to make clear it tests the pure-function contract (not a realistic `/plan` input).

*(Upside of the parser's grouping: it eliminates the over-classification risk of a 3-file single-context change — those files collapse to one module.)*

### B. Context detection is coupled to a fixed layer vocabulary

`detect-ceremony.mjs` recognizes bounded contexts only under `src/{domain,application,infrastructure,entrypoints,modules,contexts}/`. A consumer with a different layout (`src/features/<ctx>`, or no `src/` prefix) gets **`feature:cross-context` under-detected**. The `feature:multi-module` trigger via `≥3 modules` still fires (it's layout-independent), so the primary §107 gate holds; only cross-context detection is layout-sensitive. ADR-0002's conservative + one-way-escalation design (PR-N / INV-6) mitigates under-classification, but there's a mild tension with "stack-agnostic". **Suggestion:** document the assumed layout where the detector is referenced, or make `KNOWN_LAYERS` configurable (e.g. read from a capability/constitution hint). §3 hexagonal layering is a core rule, so the current convention is defensible as a default.

## Verification

```
node scripts/check-framework-metadata.mjs   # ✅
node scripts/check-invariants.mjs           # ✅
node scripts/sync-closed-sets.mjs --check   # ✅
node --test scripts/__tests__/*.test.mjs    # ✅ 21/21
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
