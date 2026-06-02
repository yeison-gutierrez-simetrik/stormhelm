# feat(traceability): stable identifiers + Step 13 enforced via INV-8 (PR-MatrixStable / FW-4)

## TL;DR

The traceability matrix used mutable PR numbers as canonical references; consolidating PRs broke the column. PR-MatrixStable anchors on stable identifiers (issue # + merged commit SHA + release tag) and adds `INV-8` to mechanically enforce that `/feature` Step 13 (post-merge close-out) actually runs.

## Motivating incident

belong-marketplace slice 01: the Step 12 matrix referenced PR #8/#9. The team consolidated (#8 closed, all work absorbed into #9). The matrix's "PR" column was now wrong. PR #10 was opened to correct it — and itself was nearly lost in the merge (cf. PR-Sec / FW-5). The whole episode happened because PR numbers are not stable identifiers.

## What changes

### `skills/traceability-matrix/SKILL.md`

- Matrix columns reordered. Canonical (in priority order): `Issue(s)` → `Merged commit` (SHA) → `Release tag`. PR # demoted to "auxiliary" with explicit marker `*(auxiliary)*` in the table header.
- New "Stable identifiers" section explaining why PR # is mutable, citing the belong incident.
- Step 6 (save and commit) now branches on whether `MERGED_COMMIT_SHA` is set: pre-merge writes `traceability-vN.M.K-draft.md`; post-merge writes `-final.md`. Auditors read `-final` only.
- New `Status: draft | final` field in the matrix header.

### `scripts/check-invariants.mjs`

New **INV-8 §58**: feature in `# status: implemented` MUST have a corresponding `docs/audit/traceability-v*-final.md`. A `-draft.md` does not satisfy it.

This is the mechanical enforcement of `/feature` Step 13. Without it, Step 13 was honor-system; the feature could be marked `implemented` and pushed without the post-merge matrix re-run, and nothing would catch it.

## Why this is not a new §N rule

§62 already requires the traceability matrix as auditable evidence. PR-MatrixStable doesn't add a new requirement — it makes the existing one verifiable. The "stable identifiers" principle and the `-draft.md`/`-final.md` convention are spelled out in the skill, not in core rules.

## Acceptance

- [x] Matrix can be regenerated against a merged SHA without column rewrites.
- [x] INV-8 fires when a feature is `# status: implemented` but no `-final` matrix exists in `docs/audit/`.
- [x] Framework linter green after merge. Specifically: existing matrices (none currently exist in framework repo) are not invalidated.
- [x] `/traceability-matrix` SKILL.md changes don't break its existing skill consumers (`reviewer` agent, `/feature` Step 12).

## Notes for the reviewer

The "stable identifiers" principle is also why the matrix should not reference branches by name — branches can be renamed or deleted. The triple `(issue, commit SHA, release tag)` is the smallest set of identifiers that survives any topology change.

INV-8 conflicts trivially with the original `const adrs = [...walk('docs/adr', ...), ...walk('docs/decisions', ...)];` line at the top of `check-invariants.mjs`. This PR does NOT touch that line; PR-I touches it. The two PRs modify different sections of the same file and should auto-merge cleanly when both land.

Refs: belong-marketplace `.planning/framework-feedback/slice01-part2-tdd-to-merge.md` (FW-4).
