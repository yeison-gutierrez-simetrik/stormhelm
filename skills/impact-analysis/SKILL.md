---
name: impact-analysis
description: |
  Maps the ripple effects of a proposed change before it's implemented: which
  files are touched directly, which modules are transitively affected, which
  tests are at risk, which external consumers depend on the surface being
  modified. Required by §73 when the change touches >3 files or crosses
  bounded contexts. The output guides /plan and /tdd to avoid surprises.
  Use when: B4 step of brownfield sub-flow, or before /plan for any large
  change. Also used by /debug when the bug fix has non-obvious scope.
---

# /impact-analysis — Ripple Effect Mapping

## Purpose

A change that looks local often isn't. A rename in the domain triggers updates in 30 consumers. An interface change breaks two other modules. A new field in an event payload silently breaks downstream subscribers. `/impact-analysis` makes the blast radius visible **before** the change is applied, so `/plan` can scope correctly and `/tdd` doesn't surprise the reviewer.

§73 requires this when:
- Change touches >3 files, OR
- Change crosses bounded contexts, OR
- Change modifies a public API or event contract, OR
- Change touches code imported by >5 other modules.

## When to invoke

- B4 step of brownfield sub-flow.
- Before `/plan` for any change matching §73 triggers.
- During `/debug` Step 2-3 when the bug's location implies broader impact.
- Before any dependency upgrade major version (§100B).

## When NOT to invoke

- For trivial single-file changes (<3 files, single context).
- For greenfield work that adds new files without modifying existing.

## Inputs

- Description of the proposed change (the issue / spec / bug context).
- The codebase.

## Outputs

- An impact report at `.planning/impact/<change-slug>-<YYYYMMDD>.md`.
- Returned to the workflow for `/plan` consumption.

## Workflow

### Step 1 — Identify the surface being changed

What is the **boundary** being modified?

- A function signature.
- A class interface.
- An event payload schema.
- An HTTP/RPC endpoint shape.
- A configuration schema.
- A database table column.

### Step 2 — Direct edits

List the files that will be edited as part of the change. Use `git grep` or `ripgrep` to find:

```bash
# For a function rename
rg "functionOldName" --type ts --files-with-matches

# For an import change
rg "from .*old-path" --type ts --files-with-matches
```

### Step 3 — Transitive consumers

For each file in Step 2, find what imports it:

```bash
# TypeScript with dependency-cruiser
npx depcruise --include-only "^src" --output-type text src/path/to/file.ts

# Python with pydeps
pydeps src/path/to/file.py --max-bacon=2 --no-output --show-deps
```

Build the consumer tree (direct + transitive up to 2 levels).

### Step 4 — Tests at risk

For each file in Steps 2 and 3, find existing tests:

```bash
rg "from .*<path>" --type ts --files-with-matches | grep test
```

Identify which tests:
- Will need updating (if the change alters contract).
- Will likely still pass (if the change is internal).
- May fail unexpectedly (heuristic: high coupling, low test isolation).

### Step 5 — External consumers (the dangerous ones)

For interfaces with external visibility, identify:

- **HTTP endpoints**: which clients call them? Check `/v1/*` routes against API documentation, OpenAPI spec, and known consumer apps.
- **Events**: which subscribers consume them? Check `events.md` registry and subscriber configurations.
- **Webhooks**: which partners receive them?
- **CLI commands**: who uses them in scripts?
- **Published libraries**: who depends on them via package manager?

### Step 6 — Cross-context references

If the change crosses a bounded context, document the crossings:

- Where does Context A call into Context B?
- Are those calls through declared ports (good — encapsulated) or direct domain imports (bad — §3 violation)?
- Does the change require coordinated updates in both contexts?

### Step 7 — Write the impact report

```markdown
# Impact analysis — <change-slug>

**Date:** YYYY-MM-DD
**Change:** <one-line description>

## Direct edits (N files)
- src/application/use-cases/accept-quote.use-case.ts
- src/infrastructure/persistence/drizzle/repositories/drizzle-quote.repository.ts

## Transitive consumers
- src/application/use-cases/list-active-quotes.use-case.ts (imports QuoteRepository)
- src/infrastructure/adapters/input/http/routes/v1/quote.routes.ts (calls acceptQuote)
- src/infrastructure/adapters/input/mcp/tools/accept-quote.tool.ts (calls acceptQuote)

## Tests at risk (M files)
- src/application/use-cases/__tests__/accept-quote.test.ts (will need new mocks)
- features/quotes/quote-acceptance.feature (scn-001, scn-002 must continue passing)

## External consumers
- Provider Dashboard frontend (calls POST /v1/quotes/:id/accept)
- Mobile app (calls POST /v1/quotes/:id/accept)
- Webhook subscribers for `quote.accepted.v1` event

## Cross-context references
- `payments/` reads `Quote.priceCents` via `QuoteReadPort` — no interface change required, safe.
- `sows/` creates SOW from `QuoteAcceptance` event — verify payload backward compatibility.

## Risk assessment
- **High:** external consumers depend on this surface; any contract change requires §48 versioning.
- **Medium:** 3 use cases share the repository; their tests must be re-run.
- **Low:** the domain change is internal; no cross-context interface affected.

## Suggested approach
- **In-place modification** (interface unchanged): single PR per §94, full /run-acceptance gate.
- **OR strangler pattern** (interface changing): emit v2 event alongside v1, deprecate v1 over 2 releases per §49.

## Open questions
- (Any ambiguities the analyst could not resolve.)
```

### Step 8 — Return to workflow

The report goes to `/plan` (which uses it to scope the plan) and/or the human (who decides the approach).

## Tooling per stack

| Stack | Dependency analyzer | Import grep |
|---|---|---|
| TypeScript | `dependency-cruiser`, `madge` | `rg --type ts` |
| Python | `pydeps`, `import-linter` | `rg --type py` |
| Go | `go mod graph`, `goda` | `rg --type go` |

If no analyzer is available, fall back to `rg` with manual interpretation — slower but always works.

## Integration with the framework

- **Invoked by B4 step of brownfield sub-flow**.
- **Invoked before `/plan`** for any change matching §73 triggers.
- **Used by `/debug` Step 2-3** for non-obvious bug fixes.
- **Used by major dep upgrades** (§100B).
- **Read by `reviewer` agent**: a PR exceeding its declared impact is a finding.

## What this skill never does

- Modify code (read-only analysis).
- Guess at consumers without verification (every entry in the report is grep-able).
- Skip external consumers (they are the most expensive to miss).
- Decide the approach (returns options; humans + `/plan` choose).
