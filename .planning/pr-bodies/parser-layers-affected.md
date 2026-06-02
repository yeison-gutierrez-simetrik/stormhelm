# feat(scripts): parse-layers-affected.mjs shared parser

## TL;DR

Shared parser for the "### Layers affected" section of `/plan` artifacts. Emits a stable JSON AST consumed by two downstream PRs:

- **PR-Group** (FW-2) → uses `references_to_issues[]` to build the slice dependency graph and emit `slice-group:<slug>` labels.
- **PR-M** (ADR-0002 INV-6) → uses `affected_modules[]` to count modules and emit `feature:multi-module` labels.

## Why one parser, not two

The cross-link insight came from the belong-marketplace author in `housekeeping-close.md` (feedback round 6): the open question #1 of ADR-0002 ("how to count modules for `feature:multi-module`") and PR-Group's edge extractor parse the **same artifact**. One parser, two consumers, one fixture — avoids the classic drift trap where two scripts diverge in their interpretation of the same input.

## What changes

**New:** `scripts/parse-layers-affected.mjs` (~200 LOC, zero-deps).

```bash
node scripts/parse-layers-affected.mjs <issue.md>           # one file
node scripts/parse-layers-affected.mjs *.md                 # multi-file with cross-check
```

Output (per file):

```json
{
  "issue_number": 4,
  "affected_modules": ["src/domain/org", "src/application", "src/infrastructure"],
  "references_to_issues": [
    { "from": 4, "to": 2, "kind": "backward", "evidence": ["from #2 enforces..."] },
    { "from": 4, "to": 3, "kind": "backward", "evidence": ["reuse ownership.ts (#3)..."] }
  ],
  "warnings": []
}
```

## Edge patterns (5 total, all verified against belong slice 01)

| # | Pattern | Direction | Example |
|---|---|---|---|
| 1 | `(#N)` after a symbol | backward | `reuse ownership.ts (#3)` |
| 2 | `from #N` in prose | backward | `unique (...) from #2 enforces` |
| 3 | `reused by #N/#M/#K` | forward | `defined here, reused by #3/#4/#5` |
| 4 | `#N builds` | forward | `#4 builds on this` |
| 5 | `Depends on: #N` (strict, in section only) | backward | issue body header |

## Why both forward AND backward

belong slice 01 has an edge `#2 → #5` that appears **only** in #2's plan ("reused by #5"), **not** in #5's plan. A backward-only parser misses this entirely. The composer test fixture asserts: "backward-only produces 7 edges; with reverse-projection, 8".

## Cross-check warning

If an edge `A→B (backward)` exists in `A`'s record but no matching `B→A (forward)` exists in `B`'s record, the parser emits a non-blocking warning. This is the plan-drift detector (§22-adjacent) the author proposed — `#2` says "reused by #4" but `#4` doesn't say "from #2" is a signal that the plans were edited at different times.

## What is NOT in this PR

- The grouping algorithm itself (in PR-Group).
- The module counter (in PR-M).
- `/to-issues` Step 5 changes to emit structured `Depends on: #N` (in PR-Group).

## Acceptance

- [x] Parses the 5 belong slice 01 plans (#1-#5) and produces 8 edges + correct affected modules.
- [x] Edge dedup by `(from, to, kind)` with aggregated evidence.
- [x] Cross-check warning fires only on missing forward counterparts (not on missing backward).
- [x] Framework linter green after merge.

## Notes for the reviewer

The parser scans the **whole** document, not just "Layers affected", because ~30% of edges in real belong plans live in preambles or "Dependency graph" sections. The `affected_modules[]` is the only field scoped to the "Layers affected" section specifically, to avoid path pollution from unrelated mentions.

Regex patterns are intentionally simple — extend deliberately with tests rather than speculatively.
