## Summary

Doc-hygiene PR that resolves 13 stale narrative references to the rule count. The framework's rule set grew with PR #1 (§117–§121 — TypeScript package management) and the Context7 PR (§122 — verify external library APIs against current docs), but several narrative passages still cite the older totals (`§1–§116` or even `§1–§90`). This PR brings every textual mention into sync.

No rule numbers change. No code changes. Only narrative text in docs and skill metadata.

## Provenance

The gap was surfaced by a thorough audit performed on the `task-flow` test project. The audit document (kept in that project as `docs/AUDITORIA-CONTEOS-REGLAS.md`) catalogued 13 references across 8 files, distinguished proyecto-editable vs framework-immutable, and protected 6 legitimate `§116` mentions that refer to the individual rule for the Security-auditor agent (correctly excluded from the rename).

## Changes — mechanical replacements (8 refs, single number)

| File | Lines | Change |
|---|---|---|
| `agents/reviewer.md` | 6, 18, 186 | `§1-§116` → `§1-§122` |
| `skills/feature/SKILL.md` | 25, 314 | `§1-§116` → `§1-§122` |
| `skills/onboard/SKILL.md` | 70 | `Active rule count: §1 – §122` |
| `docs/engineering/core/16-security-supply-chain.md` | 451 | `Total rules in the set: §1 – §122` (was §90) |
| `docs/WORKFLOWS-GUIDE.md` | 5, 1594 | `116 reglas` → `122 reglas` |

## Changes — conceptual rewrites (3 refs, structural)

The §90-era text was structurally wrong, not just numerically stale — it omitted entire topical blocks (§91–§122) that landed in subsequent PRs. These required full sentence rewrites:

### `docs/engineering/AGENTS.md` line 356 — Provenance section

The provenance text used to say "Stormhelm preserves the rule numbering... and extends it (§56 – §90) with patterns required for AI-agent operation: BDD outside-in, Ralph/AFK discipline, brownfield protocols, observability, and supply-chain security." That listed the topics only up to §90. The new text enumerates every block up to §122 with topic labels — so the index reads honestly:

```
... extends it (§56 – §122) with patterns required for AI-agent operation:
BDD outside-in (§56–§62), Ralph/AFK discipline (§63–§70),
brownfield protocols (§71–§76), observability (§77–§83),
supply-chain security (§84–§90), bug handling (§91–§96),
improvements (§97–§102), module contracts + Agent Teams (§103–§107),
hooks & runtime guards (§108–§113), formal sub-agents (§114–§116),
package management & supply-chain hygiene (§117–§121),
and external-API verification via Context7 (§122).
```

### `skills/setup/SKILL.md` line 368 — "Active capabilities" summary

Replaced the imprecise `core (§1–§3, §11–§90, §122 minus stack-specific)` with an exact description of every range that lives in `docs/engineering/core/*.md` and a current count of 97 rules.

### `README.md` Capabilities Roadmap row "core"

Same approach as setup/SKILL.md — replaced `§1-§3, §11-§90 minus stack-specific` (which was wrong in both directions: omitted §91+ entirely, and the "§1-§3" implied no §4) with a precise description.

## What this PR does NOT change

- **No rule renumbering.** §N labels are stable across the codebase as always.
- **No code changes.** Only Markdown narrative text and one YAML-style skill metadata line.
- **No falsos positivos touched.** The 6 mentions of `§116` as the individual rule for the Security-auditor agent (in `docs/engineering/core/20-agents.md` and `docs/engineering/AGENTS.md`) are correctly preserved.
- **No mention of `§84–§90` as a range was changed** — that range remains a legitimate label inside the rewritten provenance for the supply-chain security block.

## Excluded from this PR

- **`Analisis-Comparativo-Frameworks-AI-Development.md`** still has stale totals (`§1-§90`, `116 reglas`). That document is historical research, not operational framework. A future PR can rev it if useful for reference, but its consumption pattern (linked from outside, read for context) does not warrant a fix here.
- **`task_flow/` scaffold copies in this repo** also have stale numbers. They are intentionally out of scope — those refresh automatically on the next `/setup` re-run downstream from this PR.
- **Downstream projects (`pruebas/task-flow`)** that already adopted Stormhelm with the older texts will pick up the fixed wording the next time their operator runs `/setup` (or copies the affected files manually).

## Reviewer checklist

- [ ] Read the audit (`task-flow/docs/AUDITORIA-CONTEOS-REGLAS.md` in any downstream project that ran it, or reproduce locally with `grep -rn "§1-§116\|§1 – §116\|§1-§90\|116 reglas" --include="*.md"`).
- [ ] Verify `grep -rn "§1-§116\|§1 – §116\|§1-§90"` against this branch returns only the legitimate §116 references in `core/20-agents.md` and `AGENTS.md` (the formal-sub-agents file, where §116 names the deferred Security-auditor agent — never the total).
- [ ] Optional sanity: render `docs/engineering/AGENTS.md` provenance block and confirm the new enumeration reads naturally.

## Why this matters

These references are read by both humans (in PRs, in onboarding sessions) and by agents (when `feature/SKILL.md` is parsed by `/feature`, the agent internalizes "§1-§116" as the boundary and may fail to cite a §117–§122 violation as legitimate). The fix is small but the failure mode without it is silent rule-set truncation — exactly the kind of cumulative drift that erodes trust in the documentation.

The audit itself is also a model: it catalogued, classified by risk, protected falsos positivos, distinguished two eras of error (§90 vs §116), and respected the immutability principle by reporting upstream rather than patching locally. Worth promoting as a `/audit-doc-consistency` skill (or absorbing into `/check-consistency` once PR #3 lands).
