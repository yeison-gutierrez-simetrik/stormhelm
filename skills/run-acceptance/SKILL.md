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
- **The machine-readable result file `.planning/acceptance/issue-<N>-result.json` (MANDATORY — see Step 10).** This is the ONLY green/fail signal automation (the Ralph loop) reads; prose summaries are for humans.
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
- **Step-definition ambiguity check (FOLLOW-UP 40).** Sibling slices may
  both define a generic expression (each green in isolation — the collision
  only exists once both sets of steps share a checkout; live: 9/38
  scenarios `ambiguous` post-merge). A `--dry-run` pass catches it in ~1-2s
  (no World boot):

  ```bash
  # Grep the OUTPUT for ambiguity — NEVER use the exit code: --dry-run also
  # exits non-zero for sibling slices' undefined steps, which are
  # §61-by-design (the FOLLOW-UP 15 class); failing on rc would re-block
  # every slice-group.
  AMBIG=$($BDD_RUNNER --dry-run 2>&1 | grep -iE "multiple step definitions match|ambiguous" || true)
  if [ -n "$AMBIG" ]; then
    echo "::error::Ambiguous step definitions — consolidate the generic expression into features/support/ (§61 addendum):"
    echo "$AMBIG"
    exit 1
  fi
  ```

### Step 2 — Run @smoke scenarios (scoped to delivered + this-slice work)

> **Why scoped, not global?** In a slice-group (§30), sibling slices' `.feature`
> files are approved and committed **before** implementation — their step
> definitions do not exist yet *by design* (§61). A global `@smoke` run reports
> those sibling scenarios as `undefined` → non-zero exit → this gate would block
> every slice until the **whole group** is implemented. Exclude scenarios owned
> by **other open issues**; everything already delivered (closed issues) and
> everything owned by **this** issue stays in scope.

```bash
# ISSUE_NUM = the issue being gated.
# Scenarios owned by OTHER open issues = siblings not yet implemented (§61).
# Handles both label forms: scenarios:scn-021,scn-022 and scenarios:scn-021+022.
# --limit 1000: gh defaults to 30 and truncates SILENTLY — a >30-issue backlog
# would leave some siblings' undefined scns in the smoke selection, resurrecting
# exactly the failure mode this scoping exists to kill. 1000 is the same
# far-above-any-real-backlog backstop the framework uses elsewhere.
SIBLING_SCNS=$(gh issue list --state open --limit 1000 --json number,labels \
  --jq "[.[] | select(.number != ${ISSUE_NUM}) | .labels[].name | select(startswith(\"scenarios:\"))] | join(\",\")" \
  | tr ',+' '\n' | sed -E 's/^scenarios://; s/^scn-//; /^$/d; s/^/scn-/' \
  | grep -E '^scn-[0-9]+$' | sort -u)

if [ -n "$SIBLING_SCNS" ]; then
  EXCLUDE=$(echo "$SIBLING_SCNS" | sed 's/^/@/' | tr '\n' '|' | sed 's/|$//; s/|/ or /g')
  $BDD_RUNNER --tags "@smoke and not (${EXCLUDE})"
else
  $BDD_RUNNER --tags=@smoke
fi
```

The tag expression is the standard cucumber tag-expression syntax (cucumber-js,
behave and most Gherkin runners accept it); adapt the flag spelling if the
active capability's runner differs.

- If any **selected** `@smoke` scenario fails → **BLOCK**, return immediately. No point in running heavier gates.
- An **empty selection is legitimate here** (early in a slice-group every `@smoke` scenario may belong to open siblings) — treat as pass and record "0 selected, N excluded (§61)" in the report. Contrast with Step 3, where an empty selection always means the filter is wrong.
- A scenario owned by **this** issue is never excluded — if its steps are undefined, that is a real failure (the slice is missing step definitions), not a §61 exemption.

### Step 3 — Run this slice's scenarios (from the issue's `scenarios:*` labels)

> **Tag-expression semantics — do NOT use repeated `--tags` flags.** cucumber-js
> (and the cucumber standard) combine multiple `--tags` flags with **AND**. A
> scenario carries exactly **one** `@scn-NNN` tag, so
> `--tags=@release --tags=@scn-042 --tags=@scn-043` matches **zero scenarios —
> and exits 0**: the gate "passes nothing, successfully" (false green). Always
> build a single **OR** expression.

```bash
# This issue's scenarios, expanded from the label (both , and + compact forms):
THIS_SCNS=$(gh issue view "$ISSUE_NUM" --json labels \
  --jq '[.labels[].name | select(startswith("scenarios:"))] | join(",")' \
  | tr ',+' '\n' | sed -E 's/^scenarios://; s/^scn-//; /^$/d; s/^/scn-/' \
  | grep -E '^scn-[0-9]+$' | sort -u)

# Partition out @manual scenarios (§60: documented-not-automated — they have
# no step definitions BY DESIGN). Executing one yields undefined steps → a
# false failure; counting one distorts the sanity check below. A scn is
# manual iff its tag line in the .feature carries @manual.
MANUAL_SCNS=""; AUTO_SCNS=""
for scn in $THIS_SCNS; do
  if grep -rhE "@${scn}([^0-9]|\$)" features/ | grep -q '@manual'; then
    MANUAL_SCNS="${MANUAL_SCNS}${MANUAL_SCNS:+ }${scn}"
  else
    AUTO_SCNS="${AUTO_SCNS}${AUTO_SCNS:+ }${scn}"
  fi
done

if [ -z "$AUTO_SCNS" ]; then
  echo "All labeled scenarios are @manual — nothing to execute (expected 0); record them as \"manual\" in Step 10."
else
  EXPECTED_COUNT=$(echo "$AUTO_SCNS" | wc -w | tr -d ' ')
  # 'and not @manual' is belt-and-braces: even if the partition above missed
  # one (e.g. an unreadable .feature), the runner still won't execute it.
  TAG_EXPR="($(echo "$AUTO_SCNS" | tr ' ' '\n' | sed 's/^/@/' | tr '\n' '|' | sed 's/|$//; s/|/ or /g')) and not @manual"
  $BDD_RUNNER --tags "$TAG_EXPR"    # e.g. --tags "(@scn-042 or @scn-043) and not @manual"
fi
```

This runs **all automatable** scenarios the issue's labels claim (the
`@release` subset included — an extra `and @release` conjunct would only blur
the count check below; re-running a `@smoke`-tagged scenario already covered
by Step 2 is harmless). `@manual` scenarios are excluded from execution AND
from the expected count, and surface in Step 10's result file as `"manual"`.

**MANDATORY sanity check.** The run must report **exactly `EXPECTED_COUNT`
scenarios** (the labeled set **minus** the `@manual` ones). `0 scenarios`
when `AUTO_SCNS` is non-empty (or any count below `EXPECTED_COUNT`) means the
filter is wrong or a `.feature` file is missing its `@scn-NNN` tag — treat it
as **FAIL**, never as pass. An empty selection exits 0 in cucumber-js; this
check is what prevents that false green.

Report pass/fail per scenario, plus `ran/expected` counts and the manual
exclusions.

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

> **This is the single reviewer invocation for the slice.** `/feature` Step 12 and the à-la-carte chain `/gates` rely on it and do not re-invoke the reviewer. Do not separately run `/code-review` in the same gating pass — that double-invokes the agent (redundant, double token spend). **The Ralph loop also relies on it** (FOLLOW-UP 33): it reads your verdict from Step 10's `gates.reviewer` and your report from the `issue-<N>-reviewer.md` file and never re-invokes — which is why writing **both** is mandatory.

Regardless of pass/fail in Steps 2-7, invoke the `reviewer` agent:

```
Task tool, subagent_type: "reviewer"
Prompt: "Review the diff on branch <branch>. Scenarios: <scn-NNN list>. INVARIANT GATE RESULT (engine-run): <paste the INVARIANT GATE RESULT from your own context — the Ralph engine injects it into the acceptance prompt>. Produce the standard structured report."
```

**Forward the INVARIANT GATE RESULT verbatim (FOLLOW-UP 52).** The engine runs
`check-invariants.mjs` and injects its output into YOUR prompt precisely
because the reviewer's sandbox cannot run `node` — if you omit it, the
reviewer must emit a 🛑 "result absent" finding and the pass fails. Outside
the Ralph loop (manual `/run-acceptance`), run
`node scripts/check-invariants.mjs` yourself and paste the output.

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
| @smoke scenarios (scoped, §61) | ✅ 12/12 | 3 sibling-owned scn excluded |
| This-slice scenarios | ✅ 2/2 (expected 2) | scn-042, scn-043 passed |
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

### Step 10 — Write the machine-readable result (MANDATORY, always — pass or fail)

This is an **output contract, not a courtesy**: the Ralph loop (and any other
automation) decides green/fail by reading this file with `jq` — it never greps
your prose. Skipping this step makes a green run register as a failure
(`result-file-missing`). Write it as the **last** action of the skill, after
the reviewer invocation, regardless of outcome:

```bash
mkdir -p .planning/acceptance
# 1. The full Step-8 reviewer report (FOLLOW-UP 33 — the loop embeds this
#    in the PR / posts it to the issue instead of re-invoking the reviewer):
cat > .planning/acceptance/issue-${ISSUE_NUM}-reviewer.md <<'EOF'
<the reviewer agent's full structured report, verbatim>
EOF
# 2. The machine-readable result:
cat > .planning/acceptance/issue-${ISSUE_NUM}-result.json <<EOF
{
  "issue": ${ISSUE_NUM},
  "exit_code": 0,
  "scenarios": { "scn-042": "passed", "scn-043": "passed" },
  "ran": 2,
  "expected": 2,
  "gates": { "smoke": "pass", "slice_scenarios": "pass", "visual": "n/a",
             "contract": "n/a", "stubs": "pass", "slo": "n/a",
             "reviewer": "should-fix" },
  "reviewer_report": ".planning/acceptance/issue-${ISSUE_NUM}-reviewer.md",
  "failure_reason": null
}
EOF
```

Field rules:
- `issue` — the issue number being gated (consumers validate it; a result for another issue is rejected).
- `exit_code` — `0` **only** if every gate passed AND `ran == expected` (Step 3's sanity check) AND the reviewer found no 🛑. Anything else → non-zero.
- `scenarios` — one entry per `@scn-NNN` from the issue's labels, value `"passed"`, `"failed: <one-line reason>"`, or `"manual"` (§60 scenario excluded from execution by Step 3 — explicit, so a manual scn is never mistaken for a filter bug). Omit a scenario only if it was never attempted.
- `ran` / `expected` — scenario counts from Step 3 (**both exclude `@manual` scenarios**). `ran < expected` means the tag filter was wrong; consumers treat it as failure even if `exit_code` says 0.
- `gates` — per-gate `"pass"` / `"fail"` / `"n/a"`; **`reviewer` is MANDATORY** and carries the Step-8 severity (`clean` / `suggestion` / `should-fix` / `blocking`) — automation reads the verdict here, never by re-running the reviewer (FOLLOW-UP 33).
- `reviewer_report` — path to the report file written above (per-issue, same `.planning/acceptance/` directory).
- `failure_reason` — `null` on success; on failure, a **single actionable line** (this lands in the session NDJSON, feeds the NEXT iteration's /tdd prompt, and is often the only forensic trace). If the reviewer blocked, end it with "; reviewer verdict BLOCKING".

The filenames are **per-issue** (`issue-<N>-result.json` / `issue-<N>-reviewer.md`)
so parallel workers never race on shared files.

### Step 11 — Return

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
- Skip Step 10's result file, or report the outcome **only** in prose — automation reads the file, not the phrasing.
- Approve a PR (only humans merge per §67).
- Re-run if previous run blocked (workflow returns to `/tdd` first).
