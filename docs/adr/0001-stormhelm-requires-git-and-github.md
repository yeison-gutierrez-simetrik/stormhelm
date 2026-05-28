# ADR 0001 — Stormhelm requires git + GitHub; pre-git and non-GitHub forges are not supported

**Date:** 2026-05-28
**Status:** Accepted

## Context

Stormhelm assumes a git repository hosted on GitHub, but that assumption is
**implicit and undocumented**. Many skills and Ralph depend on the `gh` CLI:

| Operation | Where | Command |
|---|---|---|
| Create / list / read / label / comment issues | `/to-issues`, `/feature`, `/tdd`, Ralph | `gh issue …` |
| Create / comment / list PRs | `/feature`, `reviewer` agent | `gh pr …` |
| Link issues in the audit trail | `/traceability-matrix` | `github.com/.../issues/N` |
| CI gates (e.g. `verify-framework-metadata`) | `.github/workflows/` | GitHub Actions |

Two gaps surfaced in practice:

1. **Pre-git projects.** A scaffold where issues live as `.planning/issues/*.md`
   (not GitHub issues) hits a cliff: `/to-issues`, `/run-acceptance`, and Ralph
   all assume `gh`. The framework half-acknowledges this in prose but offers no
   first-class mode.
2. **Non-GitHub forges.** GitLab (`glab`), Gitea/Forgejo (`tea`), and Bitbucket
   shops cannot adopt Stormhelm without reimplementing the issue/PR machinery.

Three options were considered:

- **A — GitHub-only (formalize the status quo).** Implementation cost ~0; only an ADR + docs. Closes the door on GitLab/Gitea/Bitbucket and pre-git.
- **B — GitHub-only + a `local` (pre-git) backend.** ~2.5 weeks. The PR review cycle (inline comments, the `reviewer` agent commenting on a PR) has no good local equivalent; the result would be clearly inferior and rarely used.
- **C — Forge-agnostic abstraction (`gh`/`glab`/`tea`).** ~4 days plus ongoing dual-forge test maintenance. Opens cross-forge adoption.

## Decision

**Stormhelm requires git + GitHub.** Pre-git mode and non-GitHub forges are
**not supported** at this time (Option A).

Rationale:

- **Cost/benefit.** Option A is free and honest; B is expensive and produces an
  inferior mode; C carries a permanent dual-forge maintenance tax with no
  current consumer.
- **The review cycle is core.** §67 (draft PRs, human merge), §114 (the
  `reviewer` agent commenting on a diff), and the traceability audit trail are
  GitHub-native today. A local or alternate-forge mode would degrade exactly the
  parts that make the framework valuable.
- **The "minimum" is cheap.** `git init && gh repo create --private` is under a
  minute. Requiring it is a low barrier, not a wall.

## Consequences

- **Documented requirement.** The quickstart's step 0 is `git init && gh repo create`. A "known blockers" note lists what does not work without GitHub.
- **Doors closed for now.** GitLab/Gitea/Bitbucket and pure pre-git workflows are unsupported. This is a deliberate scope choice, not an oversight.
- **A clean reopen path.** If a concrete need appears (e.g. a GitLab-only client or a security-isolated runner), the **forge-agnostic** path (Option C — abstract `gh`/`glab`/`tea` behind a thin `lib/forge.sh`) is the documented next step and would supersede this ADR. A reduced local backend (branches + manifest, no full PR cycle) is the fallback only for a hard isolation requirement.
- **No code change in this ADR.** This records the decision; it does not refactor the existing `gh` usage (none is needed for GitHub-only).
