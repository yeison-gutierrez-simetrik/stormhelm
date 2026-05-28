---
name: run-acceptance
description: |
  Executes the full acceptance gate for a slice or feature. Runs Gherkin scenarios
  (§57-§60), visual gate for UI features (§104), API contract fuzz testing (§105),
  stub detection (§106), and SLO benchmark (§83). Reports pass/fail per sub-gate
  with structured output. Blocks merge if any sub-gate fails. The gate that
  separates "code that compiles" from "code that ships."
  Use when: after /tdd green on a slice. Step 11 of /feature. Also invoked by
  Ralph local before opening PR. Always invokes the reviewer agent at the end.
---

# /run-acceptance — Acceptance Gate

## Purpose

`/tdd` proves a slice's tests pass. `/run-acceptance` proves the slice **delivers the contract** — the scenarios approved in `/to-scenarios`, the visual quality the users will see, the API contract external consumers will hit, the SLOs operations promised. It is the gate that prevents "tests green, product broken."

The gate is **multi-layered**. Any layer that fails blocks merge.

## When to invoke

- After `/tdd` reports all tests green on a slice.
- Step 11 of `/feature`.
- After `/debug` Step 5 (regression test added, fix applied).
- After `/optimize` Step 4 (perf measured beats target).
- Ralph local invokes this before `gh pr create --draft`.

## When NOT to invoke

- Before `/tdd` finishes (the gate would always fail).
- For pure refactors (§102) — the existing scenarios should already pass without modification.

## Inputs

- The slice's branch (`agent/feature-<slug>-<NNN>` or similar).
- The issue's `scenarios:scn-NNN,scn-MMM` labels.
- Active capability stack (which test commands to run).
- `docs/slos.md` (for §83 gate).
- `features/<context>/<feature>.feature` (the source of truth — approved, read-only).

## Outputs

- A structured report saved to `.planning/acceptance/<slug>-<YYYYMMDD>.md`.
- Exit code: 0 if all gates pass, non-zero if any fail.
- A summary returned to the workflow.
- Reviewer agent invocation at the end (always — passing or failing).

## Pre-flight checks

Run before Step 1; each fails fast with an actionable message instead of failing deep in the workflow (§58, ADR-0001):

```bash
node scripts/preflight.mjs git-repo
node scripts/preflight.mjs feature-approved <feature-slug>   # §58: refuse draft/clarifying features
node scripts/preflight.mjs slice-implemented <slug>          # nothing to gate if /tdd has not run
node scripts/preflight.mjs gh-auth
```

If any check exits non-zero, stop and report it — do not start the workflow.

## Workflow

### Step 1 — Pre-flight

- Verify the branch is on its own commit (clean working tree).
- Verify the issue's `scenarios:scn-NNN` labels exist.
- Verify the corresponding `.feature` files exist and are unchanged from the approved versions (§58 — agent-modified `.feature` files fail this check).

### Step 2 — Run @smoke scenarios (always)

```bash
$BDD_RUNNER --tags=@smoke
```

If any `@smoke` scenario fails → **BLOCK**, return immediately. No point in running heavier gates.

### Step 3 — Run @release scenarios for this slice

Filter to scenarios in the issue's labels:

```bash
$BDD_RUNNER --tags=@release --tags=@scn-042 --tags=@scn-043
```

Report pass/fail per scenario.

### Step 4 — Visual acceptance gate (§104) — if UI involved

If the feature has UI (detected by spec or by changed paths in `web/`, `app/`, `src/components/`):

```bash
# Playwright visual gate
$PLAYWRIGHT_CMD --grep "visual"
```

Verify:
- Zero console errors.
- Responsive at 375×812, 768×1024, 1440×900.
- Dark mode renders correctly.
- Accessibility tree includes all interactive elements.
- API calls return 2xx.
- No stub UI (§106).

If MCP browser tools are available, also do a one-shot visual verification by navigating, screenshotting, resizing, and reading the page.

### Step 5 — API contract fuzz testing (§105) — if public API endpoints

If the slice adds or modifies `/v1/*` endpoints:

```bash
# Wait for Docker to be healthy
$WAIT_FOR_HEALTH http://localhost:8000

# Schemathesis against the OpenAPI spec
schemathesis run http://localhost:8000/openapi.json \
  --checks all \
  --hypothesis-max-examples=50 \
  --validate-schema=true \
  --exitfirst
```

Any 5xx error → BLOCK. Any schema mismatch → BLOCK.

### Step 6 — Stub detection (§106)

```bash
STUBS=$(grep -rl "return <div />\|return null\|TODO: implement\|throw new Error('Not implemented')" \
  app/ components/ src/components/ src/app/ web/src/ 2>/dev/null || true)

# Filter to files this PR touched
DIFF_FILES=$(git diff --name-only main)
STUBS_IN_DIFF=$(echo "$STUBS" | grep -F "$DIFF_FILES" || true)

if [ -n "$STUBS_IN_DIFF" ]; then
  # Check for explicit @stub markers
  EXCLUDED=$(grep -l "// @stub" $STUBS_IN_DIFF 2>/dev/null || true)
  REAL_STUBS=$(comm -23 <(echo "$STUBS_IN_DIFF" | sort) <(echo "$EXCLUDED" | sort))

  if [ -n "$REAL_STUBS" ]; then
    echo "::error::Stub components found in this slice. See §106."
    echo "$REAL_STUBS"
    BLOCK=1
  fi
fi

# Verify the project builds
$BUILD_CMD || BLOCK=1
```

### Step 7 — SLO benchmark (§83) — if SLO declared

For each endpoint in this slice that has a declared SLO in `docs/slos.md`:

```bash
$PERF_RUNNER --target <endpoint> --duration 3m --vus 50 \
  --summary-export=/tmp/slo-result.json

P95=$(jq '.metrics.http_req_duration.values["p(95)"]' /tmp/slo-result.json)
SLO_P95=$(yq ".endpoints[\"<endpoint>\"].p95_ms" docs/slos.md)

if (( $(echo "$P95 > $SLO_P95 * 1.1" | bc -l) )); then
  echo "::error::p95 $P95 ms exceeds SLO $SLO_P95 ms by >10%."
  BLOCK=1
fi
```

If no SLO declared for the endpoint → record measurement informationally, do not block.

### Step 8 — Invoke reviewer agent (§114)

Regardless of pass/fail in Steps 2-7, invoke the `reviewer` agent:

```
Task tool, subagent_type: "reviewer"
Prompt: "Review the diff on branch <branch>. Scenarios: <scn-NNN list>. Produce the standard structured report."
```

The reviewer's findings are appended to the acceptance report.

### Step 9 — Write the structured report

```markdown
# Acceptance report — <slug> #<issue>

**Date:** YYYY-MM-DD HH:MM
**Branch:** agent/feature-<slug>-NNN
**Scenarios:** scn-042, scn-043

## Gate results

| Gate | Result | Detail |
|---|---|---|
| @smoke scenarios | ✅ 12/12 | |
| @release scenarios (this slice) | ✅ 2/2 | scn-042, scn-043 passed |
| Visual gate (§104) | ✅ | 3 viewports, dark mode, a11y tree clean |
| Schemathesis (§105) | ⏭️ N/A | no public API in this slice |
| Stub detection (§106) | ✅ | no stubs in diff |
| SLO benchmark (§83) | ✅ p95 482 ms ≤ SLO 600 ms | |
| Reviewer agent (§114) | ⚠️ 2 Should-fix findings | see below |

## Reviewer findings
[full reviewer report]

## Decision
✅ READY FOR PR (no blocking findings; 2 Should-fix to address)

OR

🛑 BLOCKED (gate failures listed above must be resolved)
```

### Step 10 — Return

If all gates pass with no blocking reviewer findings → exit 0, workflow continues.
If any gate fails or reviewer found 🛑 → exit non-zero, workflow returns to `/tdd` (one extra iteration allowed) or marks issue `ralph-blocked`.

## Integration with the framework

- **Invoked by `/feature` Step 11**, by `/debug` Step 5, by `/optimize` Step 4.
- **Ralph invokes this** before opening any PR.
- **Always invokes `reviewer` agent (§114)** at the end.
- **Reads `docs/slos.md`** for §83 benchmark targets.
- **Reads `features/**/*.feature`** as source of truth (§58 — verifies they were not modified by agent).

## What this skill never does

- Modify `.feature` files (§58 — read-only for agents).
- Skip a sub-gate to "save time."
- Approve a PR (only humans merge per §67).
- Re-run if previous run blocked (workflow returns to `/tdd` first).
