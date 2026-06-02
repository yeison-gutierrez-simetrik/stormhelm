# How to push the 7 PRs from session 2026-06-01

**Prerequisite:** you are on your Mac with `gh` authenticated against `yeison-gutierrez-simetrik/stormhelm`. The 7 branches and the backup branch already exist locally — verify with `git branch | grep -E 'feat/|docs/|backup/'`.

The 7 PRs are independent except for two known auto-merge cases (noted below). Push order does not matter for git, but the recommended merge order in `.planning/improvements/consolidated-roadmap-2026-06.md` does matter for the framework's logical evolution.

## Sanity check before pushing

```bash
cd ~/path/to/stormhelm   # framework repo root

git fetch origin --quiet
git checkout main && git pull --ff-only origin main
git branch | grep -E "(feat|docs)/" | head -10
```

You should see at least these 7 local branches:

```
feat/merge-safety-asserts
feat/parse-layers-affected
docs/rationale-in-git-and-cap
docs/cve-upgrade-discipline
feat/stable-traceability-identifiers
feat/capability-driven-sonar
docs/adr-0002-conditional-ceremony
```

## Push + create PR — one branch at a time

### 1. PR-Sec (highest priority, security-critical)

```bash
git checkout feat/merge-safety-asserts
git push -u origin feat/merge-safety-asserts
gh pr create --base main --head feat/merge-safety-asserts \
  --title "feat: merge safety asserts (PR-Sec / FW-5)" \
  --body-file .planning/pr-bodies/pr-sec-merge-safety.md
```

### 2. Parser (shared infra, pre-req for PR-Group + PR-M)

```bash
git checkout feat/parse-layers-affected
git push -u origin feat/parse-layers-affected
gh pr create --base main --head feat/parse-layers-affected \
  --title "feat: parse-layers-affected.mjs shared parser" \
  --body-file .planning/pr-bodies/parser-layers-affected.md
```

### 3. PR-I + PR-Cap (bundled — rationale + §122 timing)

```bash
git checkout docs/rationale-in-git-and-cap
git push -u origin docs/rationale-in-git-and-cap
gh pr create --base main --head docs/rationale-in-git-and-cap \
  --title "docs: rationale lives in docs/decisions (PR-I) + §122 fires at capability adoption (PR-Cap)" \
  --body-file .planning/pr-bodies/pr-i-rationale-and-pr-cap-122.md
```

**Known partial overlap** with PR #5 (PR-MatrixStable): both PRs touch `scripts/check-invariants.mjs` but on different lines (PR-I changes line 45 walk; PR-MatrixStable adds INV-8 block after line 118). Whichever merges first, the second will auto-merge cleanly. No conflict resolution needed.

### 4. PR-Up (CVE disposition discipline)

```bash
git checkout docs/cve-upgrade-discipline
git push -u origin docs/cve-upgrade-discipline
gh pr create --base main --head docs/cve-upgrade-discipline \
  --title "docs(§85): major upgrade re-enters test gate (PR-Up / FW-7)" \
  --body-file .planning/pr-bodies/pr-up-cve-upgrade.md
```

### 5. PR-MatrixStable (stable identifiers + INV-8)

```bash
git checkout feat/stable-traceability-identifiers
git push -u origin feat/stable-traceability-identifiers
gh pr create --base main --head feat/stable-traceability-identifiers \
  --title "feat(traceability): stable identifiers + INV-8 enforces Step 13 (PR-MatrixStable / FW-4)" \
  --body-file .planning/pr-bodies/pr-matrix-stable.md
```

### 6. PR-Sonar (capability-driven SAST)

```bash
git checkout feat/capability-driven-sonar
git push -u origin feat/capability-driven-sonar
gh pr create --base main --head feat/capability-driven-sonar \
  --title "feat(sonar): capability-driven SAST config (PR-Sonar / FW-6)" \
  --body-file .planning/pr-bodies/pr-sonar-capability-driven.md
```

### 7. ADR-0002 (Proposed — needs co-sign)

```bash
git checkout docs/adr-0002-conditional-ceremony
git push -u origin docs/adr-0002-conditional-ceremony
gh pr create --base main --head docs/adr-0002-conditional-ceremony \
  --title "docs(adr): ADR-0002 — Conditional ceremony by per-feature detection (Proposed)" \
  --body-file .planning/pr-bodies/adr-0002-conditional-ceremony.md
```

**Important:** request review from the belong-marketplace author on this PR specifically. Do not merge until they co-sign (commit trailer `Co-Authored-By:`) and the three open questions are resolved.

## After all 7 are open

Quick verification:

```bash
gh pr list --author "@me" --state open --limit 10
```

You should see all 7. Each one is small enough to review in 15-30 minutes.

## Suggested merge order (per the consolidated roadmap)

1. **PR-Sec** — security-critical, no dependencies.
2. **Parser** — pre-req for PR-Group (which is in a future session).
3. **PR-I + PR-Cap** — closes the rationale-in-git contradiction. PR-Cap rides along.
4. **PR-Up** — CVE disposition discipline.
5. **PR-MatrixStable** — stable identifiers (will auto-merge with PR-I in `check-invariants.mjs`).
6. **PR-Sonar** — capability-driven SAST.
7. **ADR-0002** — last, waits for co-sign + open questions.

Per the framework's own §35 ("boring PRs"), each PR is intentionally small and focused. Do not bundle them at merge time — review and merge one at a time.

## Recovery

If anything goes wrong locally, the backup branch `backup/all-7-prs-1780424111` has everything as a single squashed commit. Recover with:

```bash
git checkout backup/all-7-prs-1780424111 -- <path/to/file>
```

The backup is local-only and not pushed; it's just an insurance policy.

## Things this does NOT include

- **PR-Group, PR-Std, PR-Attr, PR-Closes** — design is complete but implementation deferred. PR-Group needs a 30-min design pass with the belong-marketplace author (5 verbatim planes as test fixture).
- **PR-M (ADR-0002 implementation)** — blocked on this ADR being `Accepted` + co-sign + open questions.
- **The `.planning/responses/*.md` and `.planning/improvements/*.md` files from this session** — those are working artifacts kept local; not pushed.

## Local cleanup after PRs are merged

Once each PR is merged on GitHub:

```bash
git checkout main && git pull --ff-only origin main
git branch -d feat/merge-safety-asserts            # only after merge
# ... repeat for each merged branch
git branch -D backup/all-7-prs-1780424111          # after all 7 are merged
```

The framework linter should be green after each merge:

```bash
node scripts/check-framework-metadata.mjs
node scripts/check-invariants.mjs
node scripts/sync-closed-sets.mjs --check
```
