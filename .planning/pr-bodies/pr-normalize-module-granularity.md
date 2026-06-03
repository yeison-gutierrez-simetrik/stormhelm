# fix(parser): normalize module granularity (fixes INV-6 false-escalation)

Follow-up to the **#42 (PR-N)** review. Fixes the root cause behind the INV-6 false-positive: `parse-layers-affected`'s `extractModules` counted modules **depth-inconsistently**, which became a *blocking* problem once INV-6 (PR-N) started gating merges on it.

## The bug

`extractModules` did `segs.slice(0,3)` on a matched **file** path without first stripping the filename:

- 3-segment path `src/domain/user.ts` → kept `src/domain/user.ts` → counted **per file**.
- 4+-segment path `src/domain/identity/user.ts` → `src/domain/identity` → counted **per directory**.

So 3 flat files in one layer read as **3 modules**, while 3 files in one deep context read as **1**. Harmless when it only drove initial labeling (over-classification is "safe" per ADR-0002) — but **#42 made INV-6 a blocking merge gate** that reuses this detector. Confirmed end-to-end against the synthetic consumer:

```
issue 002 labeled feature:single-module, /plan lists:
  - src/domain/user.ts
  - src/domain/order.ts
  - src/domain/cart.ts
→ ❌ INV-6: classification escalated (plan detects 3 modules / 0 contexts) — exit 1
```

A genuinely single-context slice (3 entities flat under a layer, or 3 helpers under `src/lib/`) was **blocked from merging**, falsely demanding multi-module artifacts (SAD + spec sections) or an audited `skip-invariant: INV-6` override — violating §1 proportionality and polluting the override audit log. The framework's golden path (`src/<layer>/<ctx>/`) collapses correctly, which is why the existing tests missed it; flatter consumer layouts get hit.

## The fix

A "module" is the **directory containing the file**, at `src/<layer>/<ctx>` granularity, regardless of path depth. `extractModules` now strips the trailing filename *before* grouping:

```js
const dir = m[1].split('/').slice(0, -1);          // drop the filename
if (!dir.length) continue;                          // top-level file → no module
set.add((dir[0] === 'src' ? dir.slice(0, 3) : dir.slice(0, 2)).join('/'));
```

| Plan | Before | After |
|---|---|---|
| `src/domain/{user,order,cart}.ts` | 3 modules → multi-module | **1 module → single-module** ✓ |
| `src/domain/{identity,billing,orders}/*.ts` | 3 modules → multi-module | 3 modules → multi-module (unchanged — real escalation still caught) |
| `src/modules/a/{catalog,store}.ts` | 1 module | 1 module (unchanged) |
| `package.json` | (ignored) | (ignored, unchanged) |

## Impact on the three parser consumers (verified)

- **INV-6 (PR-N)** — fixed: flat single-context slices no longer false-escalate; the genuine 3-context escalation test still fails as designed.
- **detect-ceremony labeling (PR-M)** — flat single-context features now correctly label `feature:single-module`. Its unit tests inject raw `affected_modules` arrays directly into `detectCeremony`, so they're unaffected by the parser change.
- **group-slice-issues (PR-Group)** — uses only the dependency-edge DAG, not `affected_modules`; unaffected. All grouping tests pass.
- Only fixture touched in behavior: `01-foundation.md` (`src/core/*.ts`, the platform foundation) now reads as 1 module — a *more* correct classification; no test asserted its module count.

## Tests added

- `parse-layers-affected.test.mjs`: 5 `extractModules` cases pinning the granularity (flat→1, deep→per-context, multi-file-one-context→1, depth-invariance, top-level→none).
- `check-invariants.test.mjs`: INV-6 regression — a single-module slice of 3 flat files under one layer must NOT escalate (the exact reported false positive).

## Verification

```
node scripts/check-framework-metadata.mjs   # ✅
node scripts/check-invariants.mjs           # ✅
node scripts/sync-closed-sets.mjs --check   # ✅
node --test scripts/__tests__/*.test.mjs    # ✅ 30/30 (was 24)
```

🤖 Generated with [Claude Code](https://claude.com/claude-code)
