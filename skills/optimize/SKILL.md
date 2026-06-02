---
name: optimize
description: |
  Disciplined performance optimization workflow for Stormhelm. Takes a slow endpoint,
  hot function, or cost concern and walks through five mandatory steps: Measure
  (baseline), Identify (bottleneck), Fix (smallest change that addresses the cause),
  Verify (measure after, beat the target), Guard (perf budget or regression test).
  Combines the workflow from addyosmani/agent-skills with the bisect harness reused
  from /debug. Enforces §97 (baseline required) and §98 (one improvement, one PR).
  Use when: an endpoint exceeds its SLO, a hot path needs to scale, token cost of an
  agent loop needs to come down, or a Core Web Vital is failing. Do NOT use for bugs
  (use /debug) or features (use /grill-me → /tdd).
---

# /optimize — Disciplined Performance Optimization

## Purpose

`/optimize` enforces the rules of `core/18-improvements.md` for performance work. It guarantees that:

- A baseline is measured before any change (§97).
- The bottleneck is identified mechanically, not guessed.
- The fix is the smallest change that addresses the cause.
- The after-measurement beats the target with proof.
- A regression guard is in place so the improvement doesn't decay.

## When to invoke

- An endpoint exceeds its SLO (declared in `docs/slos.md`, §81).
- A hot function consumes disproportionate CPU/memory in profiles.
- Token cost of an agent loop or LLM-backed component is too high.
- A Core Web Vital (LCP, CLS, INP) is failing on a frontend route.
- Cost optimization — reduce database load, network egress, etc.

## When NOT to invoke

- A bug (use `/debug` — performance regression that breaks an SLO is a bug, not a proactive improvement).
- A feature (use `/grill-me` → `/to-scenarios` → `/tdd`).
- A refactor without performance goal (use `/improve-codebase-architecture`).

## Inputs

- An issue or description of the target (endpoint, function, route).
- The current SLO target from `docs/slos.md` if applicable.
- Optionally: a profile output, a flame graph, or specific user reports.

## Outputs

- A draft PR (always `--draft` per §67) on branch `agent/optimize-<short-slug>`.
- A `## Baseline` and `## After` section in the PR description.
- A regression guard (perf budget in CI or benchmark test).
- For tracked endpoints: an entry in `docs/perf-baselines/` updated.

## Workflow — five mandatory steps

The agent **cannot skip steps**. Each step has an exit condition.

### Step 1 — MEASURE *(baseline; §97)*

> Adapted from `performance-optimization` (addyosmani/agent-skills).

Capture a measured baseline before any code change. The measurement environment must be reproducible.

**For HTTP endpoints:**

```bash
# Use k6 (or wrk, vegeta, autocannon) with a controlled synthetic load
k6 run --vus 50 --duration 5m \
  --summary-export=/tmp/baseline-quote-accept.json \
  scripts/perf/quote-accept.k6.js

# Extract p50, p95, p99, throughput, error rate
jq '.metrics.http_req_duration' /tmp/baseline-quote-accept.json
```

**For hot functions:**

```bash
# Node.js
node --inspect --prof src/cli/profile.js
node --prof-process isolate-*.log > profile.txt

# Python
python -m cProfile -o /tmp/profile.out src/cli/profile.py
python -c "import pstats; pstats.Stats('/tmp/profile.out').sort_stats('cumulative').print_stats(30)"
```

**For Core Web Vitals:**

```bash
# Lighthouse (synthetic)
npx lighthouse https://staging.example.com/page \
  --output=json --output-path=/tmp/baseline-lh.json
jq '.audits["largest-contentful-paint"], .audits["cumulative-layout-shift"], .audits["interaction-to-next-paint"]' \
  /tmp/baseline-lh.json
```

**For agent token cost:**

```bash
# Replay a representative workload (re-run a fixed set of tasks/prompts through
# the agent) and capture tokens consumed per task into a log, then summarize:
awk '/tokens_total/{sum+=$2; n++} END{print "avg:", sum/n, "total:", sum}' /tmp/tokens-baseline.log
```

> There is no bundled replay harness. Produce `/tmp/tokens-baseline.log` with whatever
> driver your project uses to exercise the agent over a fixed task set — the point is a
> repeatable token baseline, not a specific tool.

**Required PR section after Step 1:**

```markdown
## Baseline (§97)

**Target:** POST /v1/quotes/:id/accept
**Environment:** staging-perf, k6 50 VUs, 5 min warmup + 5 min measurement
**Date:** 2026-05-20

**Before:**
- p50 latency: 320 ms
- p95 latency: 870 ms  (SLO: ≤ 600 ms — currently 45% over)
- p99 latency: 2100 ms
- Throughput: 47.2 req/s
- Error rate: 0.02%
- CPU (worker): 78%
- Memory (worker): 412 MB

**SLO target (docs/slos.md):** p95 ≤ 600 ms
**Goal for this PR:** p95 ≤ 550 ms (8% margin under SLO)
```

**Exit condition for Step 1:**

- [ ] Baseline measured 3+ times; the variance is reported.
- [ ] Target is explicit and quantified.
- [ ] Measurement environment is reproducible (script + config in repo).

If the baseline is too noisy to detect plausible improvements (variance > expected delta), **fix the measurement methodology before optimizing**. Optimization on noisy data produces fake wins.

### Step 2 — IDENTIFY *(bottleneck)*

Find the bottleneck mechanically — through profile, trace, or query plan analysis — not by guessing.

**Sub-tree of investigation:**

```
What does the profile show?
├─ CPU-bound function consuming N% of time
│   └─ Look at the hot function, its callers, and call frequency
├─ I/O wait (DB, external API, disk)
│   └─ Look at the slow query plan, the upstream service, or storage tier
├─ Memory allocation pressure (high GC time)
│   └─ Look at allocation hotspots, immutable copies, large temporary objects
├─ Serialization overhead (JSON, ORM hydration)
│   └─ Look at payload sizes, ORM N+1 queries, mapping cost
├─ Concurrency contention (lock, semaphore, connection pool)
│   └─ Look at hold times, queue depth, pool saturation
└─ Network round-trips
    └─ Look at sequential calls that could parallelize (§15), payload size, location
```

**Reusable bisect harness** (from `/debug`): if the regression was recent and the introducing commit is unclear, use `git bisect run` with a performance script that exits 0 if the metric is **under** the target and non-zero if **over**.

```bash
# bisect-perf-helper.sh
#!/usr/bin/env bash
set -e
pnpm install --silent
PERF_RESULT=$(k6 run --vus 50 --duration 2m \
  scripts/perf/quote-accept.k6.js --summary-export=/tmp/r.json 2>&1)
P95=$(jq '.metrics.http_req_duration.values["p(95)"]' /tmp/r.json)
if (( $(echo "$P95 > 600" | bc -l) )); then exit 1; fi
exit 0

# bisect run
git bisect start
git bisect bad HEAD
git bisect good v1.40.0
git bisect run ./bisect-perf-helper.sh
```

**Required PR section after Step 2:**

```markdown
## Identified bottleneck

**Method:** Flame graph from `node --prof`; query log from PostgreSQL.

**Finding:** The endpoint loads the full Company entity with all related listings,
quotes, and SOWs in a single Drizzle query — 1.2 MB hydrated, 340 ms on the DB.
The use case only needs Company.name and Company.verified for the accept check.

**Layer:** Application — `accept-quote.use-case.ts` and `drizzle-company.repository.ts`.

**Why this is the right target:** 340 ms of 870 ms total p95 is in this query;
nothing else exceeds 80 ms.
```

**Exit condition for Step 2:**

- [ ] The bottleneck accounts for ≥ 50% of the gap to target.
- [ ] The bottleneck is in a specific layer / function / query, not a hand-wave.
- [ ] The profile data is included or linked in the PR.

### Step 3 — FIX *(smallest cause-addressing change)*

Apply the smallest possible change that addresses the identified bottleneck. The fix follows the same anti-patches discipline as §93 (root cause over symptom).

**Common performance fixes:**

| Pattern | Anti-pattern (refuse) |
|---|---|
| Fetch only the fields needed | "Add a cache" without understanding the access pattern |
| Add a missing DB index | "Bump CPU on the server" |
| Parallelize independent waits (§15) | "Add a retry" |
| Reduce payload size (§14, §23) | "Add a CDN" without measuring CDN miss cost |
| Avoid N+1 with joinable read | "Add a memcached layer" before fixing N+1 |
| Use `Promise.all` for independent reads (§15) | "Increase the timeout" |

**Restrictions (per §98):**

- The PR contains only the perf optimization.
- No refactor (separate PR).
- No tech debt cleanup (separate PR).
- No dependency upgrade (separate PR).

**Exit condition for Step 3:**

- [ ] The change is mechanically derived from Step 2's identified bottleneck.
- [ ] The PR diff is focused on the identified path.
- [ ] All existing tests still pass.

### Step 4 — VERIFY *(measure after, beat the target)*

Re-run the exact same measurement from Step 1, in the same environment, and prove the improvement.

```markdown
## After (§97)

Same script, same environment, same date+1 (after change deployed to staging-perf).

**After:**
- p50 latency: 145 ms (−55%)
- p95 latency: 480 ms (−45%; SLO ≤ 600 ms ✅)
- p99 latency: 920 ms (−56%)
- Throughput: 89.4 req/s (+89%)
- Error rate: 0.02% (unchanged)
- CPU (worker): 62% (−16 pp)
- Memory (worker): 280 MB (−32%)

**Statistical confidence:** 5 runs each, p95 std dev 22 ms before / 18 ms after.
Effect size is far larger than noise. Confident in improvement.

**Target met:** ✅ p95 480 ms ≤ goal 550 ms
**SLO met:** ✅ p95 480 ms ≤ SLO 600 ms
```

If the after-measurement does **not** beat the target by a meaningful margin (effect size > variance), **the optimization failed**. Discard the change, return to Step 2 with the new information ("the suspected bottleneck was not the right one"), and re-identify.

**Exit condition for Step 4:**

- [ ] After-measurement posted in PR with same methodology.
- [ ] Effect size > measurement variance.
- [ ] Target is met (or the PR is abandoned).

### Step 5 — GUARD *(perf budget or regression test)*

Add a CI guard so the improvement doesn't decay silently.

**Option A — Perf budget in CI (preferred for HTTP / web)**:

```yaml
# .github/workflows/perf.yml
- name: Run perf check on PR
  run: |
    k6 run --vus 50 --duration 3m \
      --summary-export=/tmp/pr-perf.json \
      scripts/perf/quote-accept.k6.js

- name: Enforce budget
  run: |
    P95=$(jq '.metrics.http_req_duration.values["p(95)"]' /tmp/pr-perf.json)
    if (( $(echo "$P95 > 600" | bc -l) )); then
      echo "::error::p95 $P95 ms exceeds budget 600 ms"
      exit 1
    fi
```

**Option B — Benchmark test (for hot functions)**:

```ts
// src/application/use-cases/accept-quote.bench.ts
import { bench } from "vitest";

bench("acceptQuote happy path", async () => {
  await acceptQuote.execute(input, ctx);
}, {
  iterations: 1000,
  // Fail the bench if mean exceeds 50% of current observed performance
  // (set by Vitest baseline file)
});
```

**Option C — SLO gate (Ralph integration, §83)**:

If the optimized endpoint has an SLO declared in `docs/slos.md`, the existing §83 gate already enforces it. The optimization simply tightens the headroom.

**Update `docs/perf-baselines/`:**

```markdown
# docs/perf-baselines/quote-accept.md

| Date | Commit | p50 | p95 | p99 | Source |
|---|---|---|---|---|---|
| 2026-04-15 | a1b2c3d | 380 | 620 | 1400 | Initial baseline |
| 2026-05-15 | e4f5g6h | 320 | 870 | 2100 | Pre-optimization (regression) |
| 2026-05-20 | i7j8k9l | 145 | 480 | 920 | Post-optimization (PR #142) |
```

**Exit condition for Step 5:**

- [ ] At least one of {perf budget in CI, benchmark test, SLO gate} is in place.
- [ ] `docs/perf-baselines/<endpoint>.md` updated with the new measurement.
- [ ] Future regressions will be caught automatically.

## PR description template

```markdown
## Summary
Reduces p95 of POST /v1/quotes/:id/accept from 870 ms to 480 ms (−45%) by fetching
only the fields the use case needs from `companyRepository.findById`.

## Improvement kind (§ Five Kinds)
B — Performance optimization

## Baseline (§97)
[Step 1 output]

## Identified bottleneck
[Step 2 output]

## Fix scope (§98)
- src/application/ports/company.repository.ts (interface: new `findVerificationStatus`)
- src/infrastructure/.../drizzle-company.repository.ts (implementation)
- src/application/use-cases/accept-quote.use-case.ts (call site)

(No refactor, no tech debt cleanup, no dep upgrade in this PR.)

## After (§97)
[Step 4 output]

## Guard (§97 in conjunction with §83)
- Added perf budget check in .github/workflows/perf.yml: p95 ≤ 600 ms
- Updated docs/perf-baselines/quote-accept.md
```

## Attribution

This skill is composed from prior art with light adaptations:

- **5-step MEASURE → IDENTIFY → FIX → VERIFY → GUARD flow**: adapted from `performance-optimization` in [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills). MIT licensed.
- **Bisect harness for performance regressions**: adapted from `diagnose` in [mattpocock/skills](https://github.com/mattpocock/skills). MIT licensed.
- **Perf budget enforcement in CI**: industry pattern, codified by addyosmani's `references/performance-checklist.md`.
- **SLO integration (§83)**: original to Stormhelm.

Stormhelm did not invent this skill; it composed the best parts of existing open-source work and applies the rules (§97-§98, §102) consistently.
