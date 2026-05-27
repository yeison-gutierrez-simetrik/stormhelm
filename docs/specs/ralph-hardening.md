# Ralph (Night Shift) Hardening — Spec

**Slug:** `ralph-hardening`
**Status:** Draft
**Date:** 2026-05-27
**Source:** Internal review of `core/13-ralph-and-afk.md` (specified) vs `templates/ralph-local.sh.tmpl` (implemented)

## What changes after this ships

The `ralph-local.sh` script becomes production-ready. Today it is a 40-line MVP that loops `/tdd` + `/run-acceptance` and opens a draft PR on success. After this change it is a structured 250-300-line script that:

- Refuses to run on issues missing the required label contract (already today) **and** writes the rejection to a structured session log so the team can grep "why did Ralph skip this".
- Invokes the `reviewer` agent on every diff before opening the PR, embeds the reviewer's findings in the PR description, and retries `/tdd` if the reviewer marks blocking issues.
- Detects when the iteration budget is exhausted, applies the `ralph-blocked` label, removes `ralph-ready`, and posts a structured comment with the last 5 actions, the scenario results, and the path to the session log — without the developer having to clean up the issue manually.
- Survives 429 rate-limit responses from the Anthropic API with exponential backoff (1s → 60s) instead of crashing the session.
- Is shielded by a Claude Code `PreToolUse` hook (`git-guardrails`) that blocks destructive Git operations (`push --force`, `reset --hard`, `clean -fdx`, `branch -D`) before the agent can call them.

The contract Ralph reads (labels on the GitHub issue) does **not** change. Existing issues prepared for the MVP script continue to work.

## Why

Ralph is the most ambitious part of Stormhelm: a script that, while you sleep, takes work off a queue and produces draft PRs. Today the script is functional for demos but unsafe for any team that wants real overnight throughput. The five gaps in this spec are exactly the difference between "interesting prototype" and "I trust this to touch our codebase tonight."

Concretely:

- Without `git-guardrails` (§68), one runaway iteration can force-push and destroy evidence of what went wrong.
- Without JSON logging (§69), postmortems of a bad session are guesswork and `/postmortem` cannot consume the artifact.
- Without the reviewer agent pre-PR (§66), the developer wakes up to a draft PR with no inline justification, has to invoke `/code-review` manually, and re-runs work the night already paid for.
- Without `ralph-blocked` automation (§66), a stuck issue stays labeled `ralph-ready` and a second Ralph instance picks it up; the developer must manually re-label.
- Without 429 backoff (§70), a single Anthropic rate-limit spike kills a multi-hour session.

This work raises Ralph from "documented MVP" to "production-ready Night Shift" and is the prerequisite for the Capabilities Roadmap row "AFK Night Shift" to flip from 🚧 to ✅.

## Actors and their goals

### Developer running Ralph overnight
- **Goal:** queue 3-5 issues at 7pm, wake up at 8am, find 3-5 draft PRs (or `ralph-blocked` issues with enough information to diagnose without re-running anything).

### Reviewer / Tech Lead reviewing morning PRs
- **Goal:** open a draft PR, immediately see the `reviewer` agent's findings in the body, decide in 30 seconds whether to approve, request changes, or close.

### Incident responder writing a postmortem
- **Goal:** parse `.planning/ralph-sessions/<NNN>-<timestamp>.log` with `jq` to reconstruct exactly what Ralph did, how many tokens it spent, and where it failed — no guesswork.

### Auditor / Compliance
- **Goal:** for any merged PR, trace which Ralph session produced it, which scenarios it satisfied, and which findings the reviewer agent surfaced and accepted.

## Functional requirements

- **FR-1.** The script MUST validate the three required labels (`ralph-ready`, `scenarios:scn-*`, `budget:NNk`) before any branch creation and exit non-zero on missing labels (no change from MVP).
- **FR-2.** The script MUST invoke the `reviewer` agent on the working diff before `gh pr create`. The reviewer's stdout MUST be embedded in the PR body.
- **FR-3.** If the reviewer marks any 🛑 blocking finding, the script MUST loop back once to `/tdd` to address it (counted against `max-iterations`). If still blocking after the retry, the script MUST apply `ralph-blocked` per FR-5.
- **FR-4.** The script MUST emit one NDJSON event per significant operation (session start, iteration start/end, scenario pass/fail, budget checkpoint, git action including blocked attempts, API rate limit, session end) to `.planning/ralph-sessions/<issue>-<YYYYMMDD-HHMMSS>.log`.
- **FR-5.** When `max-iterations` is exhausted **or** the reviewer remains blocking after a retry, the script MUST apply label `ralph-blocked`, remove label `ralph-ready`, and post a structured comment on the issue containing: iterations consumed, last 5 logged actions, scenarios passed vs failed, session log path. The branch MUST be preserved.
- **FR-6.** Any invocation of the `claude` CLI that returns HTTP 429 MUST be retried with backoff `1s, 2s, 4s, 8s, 16s, 32s, 60s`. After exhausting all 7 retries, the session MUST mark `ralph-blocked` with reason `rate-limit-exhausted`. Each retry attempt MUST emit a `ralph.api.rate_limited` event.
- **FR-7.** A Claude Code `PreToolUse` hook MUST intercept Bash invocations matching the destructive-git regex list (`git push --force*`, `git reset --hard*`, `git clean -fdx?`, `git branch -D`, `rm -rf .git`) and return exit code 2 with an explanatory stderr message. The blocked attempt MUST be loggable by the script as a `ralph.git.action` event.
- **FR-8.** The session log path, the reviewer report (or a pointer to it), and the iterations consumed MUST appear in the PR description for every PR Ralph opens.

## Non-functional requirements

- **NFR-1.** The `git-guardrails` hook MUST execute in under 50ms per Bash invocation. Source: stakeholder decision in this spec — anything more and developer experience suffers on every command.
- **NFR-2.** The session log MUST be valid NDJSON (each line independently parseable with `jq`). Source: constitution C.7 implied by §69 schema definition.
- **NFR-3.** The script MUST remain pure Bash + standard Unix tools (jq, gh, curl). No new runtime dependencies. Source: stakeholder decision — keeps the script portable and removes "install N tools first" friction.
- **NFR-4.** No new numbered rule (§N) is created. All work lands under existing §66, §68, §69, §70. Source: §107 multi-module work is out of scope for this slice.

## Out of scope (v1)

- **Agent Teams §107 multi-module orchestration.** Deferred to a separate spec.
- **Multi-issue queue.** The script processes one issue per invocation. A wrapper script (`for issue in 42 43 44; do ./ralph-local.sh "$issue"; done`) suffices for the queue pattern.
- **Sandbox Docker.** The script runs directly on the developer machine. Sandboxing is a separate hardening track.
- **Cross-project shared rate-limit awareness.** If two developers run Ralph at the same time against the same Anthropic API key, both will see 429s and back off independently. Coordinating them is out of scope.
- **Auto-marking PR as ready-for-review.** Per §67, every Ralph PR remains draft. No change.
- **Auto-merging.** Per §67, no Ralph PR auto-merges. No change.
- **Sigstore signing of Ralph commits.** Useful for compliance, but separate from this hardening track.

## Constraints

- **Constitution:** §35 (PRs boring to review) — the new script is structured into named functions, each PR slice (1 through 5) lands a coherent subset, no slice exceeds ~120 lines of changes.
- **Compliance:** SOC2 audit trail — the NDJSON log is the auditable evidence per session; retention is the project's call but the format must remain stable for log shippers.
- **Compatibility:** the script MUST continue to work on the issues already created with `/to-issues` under the MVP contract (labels `ralph-ready`, `scenarios:scn-*`, `budget:NNk`). No new mandatory label.

## Open questions

- *(None blocking. The reviewer agent's CLI invocation contract is `/code-review` — confirmed in `skills/code-review/SKILL.md` and `agents/reviewer.md`.)*
