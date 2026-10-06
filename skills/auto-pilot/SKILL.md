---
name: auto-pilot
description: |
  Autonomous Planning Campaign. Runs the full Day-Shift planning pipeline for one
  slice with the agent self-answering every /grill-me, /clarify, /to-scenarios,
  /to-issues and /plan question against researched precedent — never model memory —
  then hands the slice to Ralph and drives it to a draft implementation PR. The
  executable form of core/13's Appendix "Autonomous planning (auto-pilot) mode"
  (FOLLOW-UP 80): §58 is NOT relaxed; the mode's safety rests on the layered
  controls this skill enforces — the per-decision audit log, the §114 reviewer,
  and the invariant gates.
  Use when: the operator EXPLICITLY opts a slice into autonomous planning ("run
  slice NN on auto-pilot") and the slice's decision space is precedent-rich
  (mechanism decisions with in-repo patterns + industry referents). The opt-in is
  per-slice and never inferred. Do NOT use for bugs (/debug), for policy-heavy
  slices (pricing rules, legal posture, money thresholds — those belong to a
  human round), or to bypass the human merge gate on require-human-review work.
---

# /auto-pilot — Autonomous Planning Campaign

## Purpose

Runs the full Day-Shift planning pipeline for one slice **autonomously** — the agent self-answers
every /grill-me, /clarify, /to-issues and /plan question — then hands the slice to Ralph and drives
it to a draft PR. This is the executable form of
**core/13 Appendix "Autonomous planning (auto-pilot) mode"** (FOLLOW-UP 80): §58 is NOT relaxed;
this skill is the deliberate, per-slice opt-in whose safety rests on the layered controls it
enforces — the per-decision audit log, the §114 reviewer, and the invariant gates.

**Status: framework skill — promoted 2026-07-18 per the FU-80 criteria.** Piloted consumer-side
across three campaigns: 2 slices to draft PRs with zero pre-PR human checkpoints (the §114
reviewer caught a constitution violation the autonomous planner itself introduced, proving the
gates hold), 4 slices with 12 implementation PRs driven to green, and a QA campaign of ~15
implementation PRs. The operator's post-hoc audit ratified the track record: overrides
concentrated in **policy** decisions, which the blocking rule escalates by design (live: one slice
correctly held 4 product/brand decisions BLOCKED for the operator instead of guessing). The
promotion does not change the posture: **the opt-in remains per-slice and explicit; §58's
interactive human round stays the framework default.**

## When to invoke

- The operator EXPLICITLY opts a slice into autonomous planning ("run slice NN on auto-pilot").
  The opt-in is per-slice and never inferred — that friction is deliberate.
- A slice whose decision space is precedent-rich (in-repo patterns + industry referents exist).

## When NOT to invoke

- The operator wants the interactive rounds (default §58 posture — this skill never becomes it).
- Bugs (/debug) or improvements (rule-specific contracts).
- A slice that is mostly POLICY decisions (pricing rules, legal posture, money thresholds) —
  auto-pilot's track record is on MECHANISM decisions; policy belongs to a human round.
- To bypass the human merge gate on `require-human-review` slices — never; see Hard rules.

## THE ANSWERING CONTRACT (the operator's rule — how every self-answer is produced)

**No self-answer without a citable precedent, researched — never recalled.** Every materially
significant question is answered against evidence gathered IN THIS CAMPAIGN, not from the model's
training memory. Mechanics:

### 1. Research BEFORE the round (mandatory, not best-effort)

Before /grill-me runs, launch the **orientation fan-out** — two background agents:

- **Code-map agent (Explore):** in-repo precedents — the existing pattern every option must be
  weighed against (outbox/retry precedents, auth/role preambles, crypto-at-rest patterns, port
  conventions, migration numbering, BDD/World layout).
- **Industry-research agent (web):** the referent practices for the slice's decision axes, with
  **exact numbers and URLs** (retry curves, limits, header formats, quota values, timeouts).
  Frame its questions from the slice doc's design axes BEFORE answering anything.

The grilling round does not start until both reports are in. A question whose axis was not covered
by the research is answered only if an in-repo precedent settles it — otherwise it follows the
blocking rule (below).

### 2. The referent mapping — which industry leader answers which decision class

The default mapping (proven by the marketplace pilot). A consumer adapts the domain-mechanics row
to its own product domain; the rule itself is invariant — no self-answer without a researched,
citable referent:

| Decision class | Referents to research and cite |
|---|---|
| Product / domain mechanics (publication, review loops, testers, sandbox, visibility, developer-facing events) | The domain's leading platforms — e.g. **Apple App Store** (App Store Connect, TestFlight, Server Notifications) and **Google Play** (Play Console, testing tracks, RTDN) for marketplace mechanics |
| Infrastructure (retries, queues, delivery, ordering, DLQ, health checks, rate limits, scaling) | **AWS** (EventBridge, SNS/SQS, ALB) and **Google Cloud** (Pub/Sub, Cloud Load Balancing) |
| Code / protocol / API design (wire formats, signing, versioning, validation, tolerant-reader, idempotency) | **Leading specs and frameworks**: the protocol's own spec (e.g. A2A, CloudEvents, JSON-RPC), Stripe's API design, Microsoft REST guidelines, Zalando RESTful guidelines, Google AIP, Kubernetes/gRPC conventions |
| Payments / money | **Stripe** docs are the default referent (plus the constitution's absolutes — these are also where policy starts and auto-answer stops) |

When two referents disagree, the decision log records BOTH and the rationale picks per the
project's constraints (constitution > CONTEXT.md > §N > in-repo precedent > referent consensus).

### 3. Citability — the URL is part of the answer

Every industry reference in the decision log carries its **URL** (the audit must be verifiable
without trusting the agent). "Stripe does something like this" without a link fails the contract.
Trivial mechanical decisions may cite `n/a (mechanical)` — sparingly.

### 4. Option discipline (the grilling format survives)

Each question is still resolved as a multiple-choice node: 2-4 named options, each viable, with the
recommended one justified by §N/constitution/CONTEXT/precedent/referent. The agent then SELECTS
instead of asking — the rejected options are preserved verbatim (future ADR Considered Options and
the audit's counterfactual).

### 5. Blocking rule (the only pause)

**Low confidence AND (irreversible OR sensitive — security, external contract, money):** the entry
is marked `BLOCKED`, listed at the top of the log, and the pipeline halts on that point only. The
campaign never guesses through a one-way door it is unsure about.

## The mode's two standing deviations (named, never silent)

- **OD-1 — agent-merged planning PRs.** Docs-only planning PRs merge at green CI without a human.
  This is the ONLY merge this skill performs.
- **OD-2 — post-hoc §58.** `.feature` files are written `# status: approved` with §58 satisfied
  post-hoc by the decision log; the file header's deviation line cites this skill + the log. On
  `require-human-review` slices, the independent §58 ratification happens at the
  implementation-PR review at the latest (this also preserves author/reviewer separation).

## Inputs

- The slice doc (the issue file produced by /to-issues, `Status: ready-for-agent`).
- Next free `scn-NNN` block — **reserved up front and partitioned per slice** when the campaign
  spans multiple slices (FOLLOW-UP 105; verify against features/ AND any parallel session).
- `docs/CONTEXT.md`, `docs/constitution.md`, ADRs, prior specs (the precedence chain).

## Outputs

- Planning artifacts on a `chore/slice-NN-planning` branch in a dedicated worktree: grilling
  transcript + open-questions (docs/decisions/grilling/), CONTEXT/ADR updates, spec (Clarified),
  .feature (approved per OD-2), GH issue with embedded plan + Labels-line file mirror, §87 threat
  model (self-reviewed, ratification deferred to the implementation-PR review).
- **The decision audit log** `docs/decisions/auto-clarify/NN-<slug>-decisions.md` — one entry per
  self-answered question with the core/13 appendix fields (question · options · chosen+rationale ·
  **industry reference with URL** · confidence · reversibility · ☐ audit checkbox), deviations and
  doc supersessions flagged FIRST, and a "top-N to audit first" section.
- Planning PR (docs-only) → merged at green CI (OD-1) → issue rotated `ralph-ready` → Ralph AFK →
  implementation PR lands DRAFT.
- Final campaign report (good/bad/metrics/pending) + a framework-feedback retrospective.

## Workflow

1. **Pre-flight:** slice doc exists; explicit operator opt-in confirmed; scn range reserved;
   no conflicting in-flight Ralph on the same files.
2. **Orientation fan-out** (Answering contract §1) — both agents in background; read both reports.
3. **Pipeline, each skill invoked normally but in auto-answer mode** (/grill-me, /clarify and
   /to-scenarios carry the FU-80 opt-in note in their own SKILL.md; core/12 §58 names the OD-2
   exception): /grill-me → /domain-model → /specify → /clarify →
   /to-scenarios (written `# status: approved`, OD-2 — the deviation line in the file header cites
   this skill + the log) → /to-issues (detect-ceremony, FU-71 label fallback when >50 chars) →
   /plan (embedded in the issue body) → §87 threat model (deviation flagged in the log).
   Campaign-proven rules: (i) the `.feature` MUST carry a per-scenario `@scn-NNN` tag from the
   FIRST write — the tag is the §59 selection surface and the invariant gate enforces title↔tag
   (FU-124); (ii) any **informative money-adjacent field** carries its non-binding marker IN the
   wire payload (e.g. a literal `binding: false`), never only in comments or tool descriptions;
   (iii) when this campaign invokes an ad-hoc §114 reviewer, INJECT the invariant-gate output and
   the acceptance ran/expected numbers into the reviewer prompt (FU-52/FU-116 contract) instead of
   letting it self-derive from CI.
   **Every decision goes to the audit log AS IT IS MADE** — never reconstructed afterwards.
4. **Gates:** `node scripts/check-invariants.mjs` ALL GREEN (no leaning on other issues'
   overrides); preflight checks; planning PR → CI green → merge (OD-1: docs-only planning PRs are
   the ONLY thing this skill merges).
5. **Ralph:** rotate `ralph-ready`, launch the Ralph runner (`ralph-local.sh`, or the
   isolated-worktree wrapper `templates/ralph-isolated.sh`) `[--base <chain>]` (FU-46a for
   chained slices; a chain-leaf PR under auto-pilot gets the `require-§114-confirmation` label
   applied at PR-open — only the §114 reviewer's CLEAN verdict removes it, §128a), arm a watcher
   (iterations, PR landing, session end). Budget per the heavy-slice multiplier (FU-75: new
   context / sensitive / >15 scns → ×150k, 400-500k buckets). On `budget_exceeded` with green
   work or `engine_failure`: just `--resume` (FU-77). **The handoff brief passed to Ralph names
   two campaign-proven traps:** (a) any Given-seed that drives `container.X.execute()` needs the
   `// acceptance-driver-ok` marker on the IMMEDIATELY-PRECEDING line — the §127 gate matches the
   adjacent line only (highest-frequency CI round-trip across the pilot campaigns); (b) the
   implementation PR targets the **integration branch** (e.g. `develop`), never the release
   branch, and is opened from a branch freshly rebased on (or merged with) that base — stale
   branches force update-branch churn and pollute the diff with unrelated deletions.
6. **Draft PR is the finish line.** The skill stops there. Review (/code-review with the invariant
   gate result attached), human merge, and close-out (/traceability-matrix) are separate,
   human-triggered steps. After a branch has merged, never open a redundant self-review PR over
   the same content — check merge state first; an empty diff means the review already happened
   where it belonged.
7. **Report + retrospective:** final report with the override-rate sheet pointer; run the
   framework-feedback retrospective (zero findings is a valid outcome).

## Hard rules (inviolable — these make the mode sound)

- `require-human-review` implementation PRs land DRAFT and are merged ONLY by the human (or their
  explicit per-PR delegation). The skill NEVER merges implementation code.
- §87 threat models drafted here are ratified by the human at the implementation-PR review at the
  latest — the PR comment names them.
- The §114 reviewer and the invariant gates always run — remove any layer and auto-pilot is not
  sound (core/13 appendix).
- The decision log is written in-repo (docs/decisions/auto-clarify/), rides the planning PR, and
  is never gitignored.
- The operator's audit (checkboxes) is the campaign's metric; a rising override rate drops the
  slice class back to interactive rounds.
- Chain-leaf implementation PRs carry `require-§114-confirmation` until the §114 reviewer posts a
  CLEAN verdict and removes it (§128a) — the train-merge gate refuses PRs still wearing it.

## Integration with the framework

- Executes the core/13 Appendix "Autonomous planning (auto-pilot) mode" (FU-80).
- Composes the standard skills (/grill-me, /clarify, /to-scenarios, /to-issues, /plan,
  /traceability-matrix at close-out) — it is composition, not duplication, mirroring /feature.
- Read by the reviewer agent: the decision log is citable evidence for plan-vs-implementation
  audits; deviations (OD-1, OD-2, deferred threat-model ratification) are named, never silent.

## What this skill never does

- Run without the explicit per-slice operator opt-in.
- Answer a material question from model memory (the research step is mandatory).
- Decide POLICY (money thresholds, legal posture, compliance scope) — blocking rule applies.
- Merge implementation PRs, ratify its own threat models, or skip the reviewer/invariants.
- Modify approved `.feature` files outside the OD-2-flagged initial write.
- Pad the retrospective — zero findings is a valid outcome.
