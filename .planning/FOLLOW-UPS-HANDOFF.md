# Stormhelm — Follow-ups handoff (2026-06-02)

Hand this to an agent to resolve the remaining **non-blocking** follow-ups left after the
FW-1..FW-8 feedback backlog + ADR-0002 (PR-M/N/O) were fully merged. None of these block;
they are polish + adoption-hardening. Each is self-contained — do them as **separate PRs**.

- **Repo:** `github.com/yeison-gutierrez-simetrik/stormhelm` (local: `/Users/equipo/Documents/Claude/Projects/Harness Software Developer Senior`).
- **Branch off `main`** per item; PR per concern; **do not bundle** unrelated items.

---

## ⚠️ Conventions you MUST honor (read first)

1. **Project-agnostic.** Stormhelm ships to many teams. Do **not** introduce `belong`/`belong-marketplace`/`simetrik` or local `/Users/...` paths into shipped files (rules, skills, scripts, test fixtures). A full agnosticism pass already removed these (PRs #29/#30) — don't regress. KEEP the attribution credit (the "§1–§55 inspired by the Belong A2A Marketplace team" lines in `README.md` + `docs/engineering/AGENTS.md`, and the `LICENSE` copyright) — those are credits, not coupling.
2. **Gates that must stay green** (run before every PR, from repo root):
   ```bash
   node scripts/check-framework-metadata.mjs      # rule/skill/hook counts vs filesystem
   node scripts/check-invariants.mjs              # INV-1..INV-8 + CONFIG
   node scripts/sync-closed-sets.mjs --check
   node --test scripts/__tests__/*.test.mjs       # currently 30/30
   ```
   CI runs the first via `.github/workflows/verify-framework-metadata.yml` and the suite via `.github/workflows/verify-scripts-tests.yml`.
3. **No new numbered rule (`§N`) without a decision.** The set is exactly **§1–§122**. Adding `§123` bumps `check-framework-metadata.mjs` + the "122 rules" phrasings in `README.md` and `docs/WORKFLOWS-GUIDE.md` footer + `docs/engineering/AGENTS.md`. ADR-0002's INV-6 deliberately cites `—` (no §). Don't add a §N casually (see item 4).
4. **PR discipline.** One concern per PR. If it closes a tracked issue, put `Closes #N` in the PR body. **Before `gh pr merge`: confirm `mergeable == MERGEABLE && mergeStateStatus == CLEAN` (never `UNKNOWN`)** — merging at `UNKNOWN` has silently dropped a just-pushed commit (this is exactly what `scripts/check-merge-safety.mjs <pr> pre` guards). Don't `git add -A` blindly — `CLAUDE.md` and `.planning/*` are intentionally untracked; stage explicit paths.
5. **Test convention.** Executable scripts live in `scripts/`; tests in `scripts/__tests__/*.test.mjs` (`node:test`, zero deps); fixtures in `scripts/__tests__/fixtures/`. New executable behavior → add a test there (CI picks it up via the glob).
6. **Adoption model.** Consumers adopt by copying `.claude/`, `docs/engineering/`, and (since #39) the consumer-runtime `scripts/` — `/setup` (`skills/setup/SKILL.md`) is the install path. Items 1 is in this "broken-on-adoption" class.
7. **Shared parser, three consumers.** `scripts/parse-layers-affected.mjs` extracts the dependency graph + `affected_modules` from a `/plan`'s "Layers affected" section. Its consumers: `group-slice-issues.mjs` (PR-Group), `detect-ceremony.mjs` (PR-M classification), and INV-6 in `check-invariants.mjs` (PR-N). Touching the parser affects all three — run the full suite.

---

## FOLLOW-UP 1 — `/setup` does not install the framework hooks into the consumer  ·  **Severity: MEDIUM**

**Problem.** The framework ships 5 Node hooks in `hooks/` (`closed-set-check.js`, `context-monitor.js`, `git-guardrails.js`, `webfetch-cache-post.js`, `webfetch-cache-pre.js`). These are consumer-runtime: `git-guardrails.js` blocks destructive git ops, `closed-set-check.js` validates closed sets, etc. — they're referenced throughout the rules and `/setup`'s own description says it "installs hooks". **But the `/setup` workflow does not copy them.** The only hook mention in `skills/setup/SKILL.md` is line ~446 (backing up `.git/hooks/*`). This is the **same "broken on first use after adoption" class** as the `scripts/` gap that #39/#41 fixed for scripts — re-opened for hooks.

**Verify the gap:**
```bash
ls hooks/                                  # 5 .js hooks present in the framework
grep -niE "cp .*hook|\.claude/hooks|hooks/\*" skills/setup/SKILL.md   # → no copy step
```

**Fix.**
1. In `skills/setup/SKILL.md`, add a copy step (mirror the scripts loop already there — search for `for s in preflight.mjs`): copy `hooks/*.js` from `$STORMHELM_PATH/hooks/` into the consumer's `.claude/hooks/`.
2. Wire them in the consumer's `.claude/settings.json` `hooks` config. **First inspect how the framework's own hooks are wired** — check the framework's `.claude/settings.json` (or how `setup/templates/` references them) to copy the exact event→hook mapping format; don't invent it.
3. Add the hooks to `/setup`'s validation step (the numbered self-check list near the end — currently checks the copied scripts resolve) and to the "Versioned in Git" output list.
4. Reuse the durability reminder added in #41 ("when adding a new skill/hook-invoked artifact, add it to the install + validation").

**Acceptance.** A freshly `/setup`-ed consumer has `.claude/hooks/git-guardrails.js` (+ the other 4) on disk and wired in `.claude/settings.json`. `node scripts/check-framework-metadata.mjs` still passes (hook count unchanged in the framework). Add a note in `CLAUDE.md`'s "scripts/ taxonomy" area if you also touch hook taxonomy (but `CLAUDE.md` is untracked — see item 7).

**Gotcha.** Confirm whether some hooks are framework-self-maintenance only (not for consumers) before copying all 5 — mirror the `check-framework-metadata.mjs`-is-not-copied decision from the scripts fix. Likely all 5 are consumer-runtime, but verify against where each is referenced.

---

## FOLLOW-UP 2 — Dangling references to non-existent `.planning/` artifacts (possible data loss)  ·  **Severity: MEDIUM**

**Problem.** Several docs reference `consolidated-roadmap-2026-06.md` and `.planning/responses/` as the source of priorities + design rationale, but **neither exists in the repo.**

**Verify:**
```bash
ls .planning/responses/ .planning/consolidated-roadmap*.md 2>/dev/null   # → none
git grep -l "consolidated-roadmap\|\.planning/responses" -- ':!.git'      # → .planning/pr-bodies/HOW-TO-PUSH-ALL-7.md (and CLAUDE.md, untracked)
```

**Fix — decide one:**
- **(a) Recover** the files from local/Cowork working state if they exist elsewhere, and commit them (if they're meant to be tracked rationale).
- **(b) Retire the references**: edit the referencing files to drop or correct the pointers, so no live doc points at a missing artifact.

**Acceptance.** No tracked/shipped doc references a `.planning/` file that doesn't exist; or the files are restored. Note `.planning/` is largely local working state — keep blast radius small (don't commit ephemera).

**Note.** This connects to item 7 (`CLAUDE.md` also references these). Resolve together if you tackle 7.

---

## FOLLOW-UP 3 — `task_flow/` is a stale near-duplicate of the framework  ·  **Severity: LOW-MEDIUM (decision)**

**Problem.** `task_flow/` is a git-tracked sample project that duplicates the framework (`task_flow/.claude/skills/`, `task_flow/docs/engineering/...`). It has **drifted and gone stale**: **28 skills / 116 rules** vs the live **32 skills / 122 rules**, and it is **explicitly excluded from CI** (`check-framework-metadata.mjs` filters out `task_flow`), so its drift is invisible. A disclaimer was added to `task_flow/README.md` (#31) marking it non-authoritative.

**Verify:**
```bash
grep -c "" <(ls task_flow/.claude/skills/) ; ls skills/ | wc -l     # 28 vs 32
grep -rn "116\|122" task_flow/AGENTS.md task_flow/README.md | head
grep -n "task_flow" scripts/check-framework-metadata.mjs            # the CI exclusion
```

**Fix — decide one (this is a maintainer call, not auto):**
- **(a) Delete `task_flow/`** AND create the canonical onboarding example it was standing in for. Note: the #39 review assumed `.planning/new-project-walkthrough.md` already plays that role — **it does not exist**, so deletion without a replacement removes the only scaffold example. Create the walkthrough first if going this route.
- **(b) Regenerate** `task_flow/` from the live framework as a release step (and add it back to CI, or a dedicated check, so it can't silently rot).
- **(c) Keep** it with the current disclaimer (status quo) — acceptable but the drift cost grows.

**Acceptance.** Either `task_flow/` is gone with a working replacement example, or it's regenerated + CI-checked, or an explicit decision to keep-as-disclaimed is recorded. Don't half-fix.

---

## FOLLOW-UP 4 — The "Cumulative vs stacked PRs" rule has no `§N`  ·  **Severity: LOW (decision)**

**Problem.** The branch-convention rule added in #35 (PR-Group) lives as an **unnumbered `###` subsection** under `core/13` §67 ("Cumulative vs stacked PRs"), yet carries normative language: *"Cumulative is the default; stacked is discouraged"*, *"finding-attribution is mandatory"*. The framework numbers its normative rules (§N) for traceability and the closed-set linter; a "mandatory" rule without a §N is a mild convention break.

**Verify:** `grep -n "Cumulative vs stacked" docs/engineering/core/13-ralph-and-afk.md`

**Fix — decide one:**
- **(a) Fold it into §67's prose** explicitly (soften the standalone normative framing so it reads as guidance under the existing §67), OR
- **(b) Assign the next free `§N` (§123).** This bumps the rule count → update `README.md` ("122 … rules"), `docs/WORKFLOWS-GUIDE.md` footer, `docs/engineering/AGENTS.md`, and re-run `check-framework-metadata.mjs` until green. **Note:** OQ3 of ADR-0002 decided *not* to add §123 for INV-6 — but that was a different rule (an invariant). This is a genuine normative rule and assigning it §123 is a defensible, separate decision. Pick one and keep the rule-count phrasings consistent.

**Acceptance.** Either the rule is clearly subordinate prose under §67, or it's a numbered §123 with all count phrasings + the metadata gate updated.

---

## FOLLOW-UP 5 — `detect-ceremony` test #2 uses an input the parser can no longer emit  ·  **Severity: LOW (cosmetic)**

**Problem.** `scripts/__tests__/detect-ceremony.test.mjs` has a test named `'>=3 modules (one context)'` that injects file-level module entries directly:
```js
detectCeremony([rec(['src/core/a.ts', 'src/core/b.ts', 'src/lib/c.ts'])])  // asserts module_count === 3
```
It passes (it tests the pure function's counting), but **after #43** `parse-layers-affected.extractModules` strips filenames before grouping, so the real parser would emit `src/core`, `src/lib` (2 modules) for those files — the test's input is now impossible end-to-end. The test name implies a realistic `/plan` shape the pipeline can't produce.

**Verify:** `grep -n "src/core/a.ts" scripts/__tests__/detect-ceremony.test.mjs`

**Fix.** Switch the inputs to **directory-form** module entries (what the fixed parser actually emits), e.g. `['src/foo', 'src/bar', 'src/baz']` for the ≥3-modules case — keeping the assertion (3 → `feature:multi-module`). Optionally rename the test to make explicit it tests the pure function's contract.

**Acceptance.** `node --test scripts/__tests__/detect-ceremony.test.mjs` still green; the test's input is now producible by the real parser.

---

## FOLLOW-UP 6 — Context detection is coupled to a fixed layer vocabulary  ·  **Severity: LOW**

**Problem.** `scripts/detect-ceremony.mjs` recognizes bounded contexts only under `src/{domain,application,infrastructure,entrypoints,modules,contexts}/` (`KNOWN_LAYERS`). A consumer with a different layout (`src/features/<ctx>`, or no `src/` prefix) **under-detects `feature:cross-context`**. The `feature:multi-module` trigger via `≥3 modules` is layout-independent, so the primary §107 gate still holds; only cross-context detection is layout-sensitive. ADR-0002's conservative + one-way-escalation design (INV-6) mitigates under-classification, but there's mild tension with "stack-agnostic".

**Verify:** `grep -n "KNOWN_LAYERS" scripts/detect-ceremony.mjs`

**Fix — decide one:**
- **(a)** Document the assumed `src/<layer>/<ctx>` layout where the detector is referenced (`/to-issues` Step 2, the `detect-ceremony.mjs` header), framing §3 hexagonal layering as the default that makes it work. Lowest effort, defensible.
- **(b)** Make `KNOWN_LAYERS` configurable — read extra layer names from a capability or constitution hint. More work; only worth it if non-hexagonal consumers are expected.

**Acceptance.** Either the layout assumption is documented where a reader meets the detector, or `KNOWN_LAYERS` is configurable with a test covering a `src/features/<ctx>` layout.

---

## FOLLOW-UP 7 — `CLAUDE.md` is untracked (decision: track-after-genericize, or keep local)  ·  **Severity: LOW**

**Problem.** `CLAUDE.md` (framework maintainer context, auto-loaded for sessions working *on* the framework) is intentionally **untracked**. Its tracking commit was dropped from #39 for two reasons: (a) it contains a `## Feedback loop with belong-marketplace` section that **reintroduces project coupling** the agnosticism pass removed; (b) it references the **non-existent** `consolidated-roadmap-2026-06.md` + `.planning/responses/` (item 2). Its *content corrections* (scripts taxonomy, INV-6/INV-7 reservations, CI status) are accurate and worth keeping — the issue is tracking it as-is.

**Verify:** `git ls-files --error-unmatch CLAUDE.md` (errors → untracked); `grep -n "belong\|consolidated-roadmap\|responses/" CLAUDE.md`

**Fix IF tracking is wanted:** (1) genericize the `## Feedback loop with belong-marketplace` section (drop the customer name — it's maintainer context, but it lands in the public repo root); (2) remove or fix the dangling refs (coordinate with item 2); (3) then `git add CLAUDE.md`. **Otherwise** leave it local — the corrections live in the working copy and lose nothing.

**Acceptance.** Either `CLAUDE.md` is tracked with no project-name coupling and no dangling refs, or an explicit decision to keep it local is recorded (e.g., add `CLAUDE.md` to `.gitignore` so its untracked status is intentional, not accidental).

---

## FOLLOW-UP 8 — Copied consumer scripts will drift from the framework  ·  **Severity: LOW (forward-looking)**

**Problem.** `/setup` copies 8 `scripts/*.mjs` into the consumer repo (`#39`/`#41`). As the framework evolves and its skills change how they call those scripts, the consumer's copies drift — with no mechanism to detect or resync. No immediate breakage; a latent maintenance trap.

**Fix — options (pick the lightest that helps):**
- Stamp each copied script with a framework version/commit (a header comment `// stormhelm: <sha>`), and have `/setup` (or a small check) warn when the consumer's copy is older than `$STORMHELM_PATH`'s.
- Add a `/setup --resync-scripts` (or documented re-run) path that re-copies the consumer-runtime scripts + hooks.
- At minimum, document the resync expectation in `/setup` and `CLAUDE.md`'s scripts taxonomy.

**Acceptance.** A consumer (or a maintainer) has a documented, ideally mechanical, way to detect+refresh stale copied scripts/hooks.

---

## FOLLOW-UP 9 — `/setup` copies framework-self-maintenance skills into consumers  ·  **Severity: MEDIUM**

**Problem.** `/setup` (the adoption path) copies **all** of `skills/` into the consumer's `.claude/skills/` without distinguishing **consumer-facing** skills from **framework-self-maintenance** ones. The clear offender is **`verify-framework-consistency`** — its whole purpose is to reconcile *the framework's own* prose vs its repo (it runs `scripts/check-framework-metadata.mjs`). In a consumer it is a **dead skill**: it makes no sense for a product team, and it references `check-framework-metadata.mjs` — which `/setup` correctly does **not** copy (it's framework self-maint). So the adoption is internally inconsistent: it excludes the self-maint *script* but ships the self-maint *skill* that needs it.

This is the **same class as FOLLOW-UP 1/8** (the adoption copy-list is wrong) — here it copies something it shouldn't, rather than missing something it should. Confirmed live: a re-synced consumer (belong-marketplace) carries `verify-framework-consistency` with a dangling `check-framework-metadata.mjs` reference. **Fixing it consumer-side is futile** — the next re-sync re-introduces it; the durable fix is in the framework's adoption logic.

**Verify:**
```bash
grep -n "check-framework-metadata" skills/verify-framework-consistency/SKILL.md   # the self-maint dependency
grep -niE "cp -R .*skills|for s in.*skills|copy.*skills" skills/setup/SKILL.md     # how /setup copies skills (no exclusion filter)
```

**Fix.**
1. In `skills/setup/SKILL.md`, exclude framework-self-maintenance skills from the consumer copy — mirror the `check-framework-metadata.mjs`-is-not-copied decision. At minimum exclude `verify-framework-consistency`. **Audit for any other framework-meta skill** (the rest of the 32 are consumer workflow skills; `verify-framework-consistency` is the obvious one — confirm there are no others) and maintain the exclusion list next to the script-exclusion list.
2. Optionally tag such skills (e.g. a `framework-self: true` marker in their SKILL.md frontmatter) so the exclusion is data-driven rather than a hard-coded name list.
3. Note the parallel cleanup in the `AGENTS.md` **template** (`docs/engineering/AGENTS.md`): it ships a framework-maintenance section (the `/verify-framework-consistency` + `check-framework-metadata.mjs` guidance) that personalizes into consumer `AGENTS.md` files where it doesn't apply. Decide whether `/setup`'s AGENTS.md generation should strip framework-self sections for consumers.

**Acceptance.** A freshly `/setup`-ed consumer has **no** `verify-framework-consistency` skill (and no other framework-self skill), and its `AGENTS.md` carries no framework-maintenance-only guidance. `check-framework-metadata.mjs` (framework) still passes.

**Note.** A consumer that already adopted before this fix (e.g. belong-marketplace) keeps the dead skill until it re-syncs post-fix — harmless (it's never invoked for product work), so no consumer-side patch is warranted.

---

## FOLLOW-UP 10 — Consumer Sonar gate analyzes framework-vendored code  ·  **Severity: LOW-MEDIUM**

**Problem.** A consumer's SonarCloud quality gate flags the **framework's own vendored files** as product defects. Confirmed live on belong-marketplace (PR #11, a framework re-sync touching **0 `src/` files**): the gate failed with **10 Security Hotspots + D Reliability Rating on New Code**, and *every* finding is in framework-vendored code — `execSync`/`child_process` in `scripts/preflight.mjs`, `scripts/check-merge-safety.mjs`, `scripts/parse-layers-affected.mjs`, `.claude/hooks/closed-set-check.js` (OS-command hotspot); `new RegExp(...)` in `scripts/check-invariants.mjs`, `scripts/sync-closed-sets.mjs`, the webfetch hooks (ReDoS); `createHash` in the webfetch hooks (weak-hash cache keys). The product's `src/` was clean.

Two compounding facts make this bite:
1. **SonarCloud Automatic Analysis** (GitHub App, no CI workflow) **scans the whole repo and ignores `sonar.sources=src`** — so it reaches `scripts/` and `.claude/` even though the consumer scoped sources to `src`. (`sonar.sources` is a CI-scanner concept.)
2. **`compose-sonar-properties.mjs` derives `sonar.exclusions` from capability frontmatter only** — it has no notion of *vendored framework directories* (`scripts/`, `.claude/`). So there is no composed exclusion that covers the framework's own copied code, and a consumer hand-editing the line drifts from the composer.

This is the **same class as FOLLOW-UP 1/8/9** (the adoption surface doesn't distinguish framework-vendored from product) — here the vendored code pollutes the consumer's quality gate. It does **not** block product work (a `src/`-only PR's *new code* is clean → gate passes), but it red-flags every framework re-sync PR and leaves standing hotspots on the consumer's `main` dashboard that the product team neither owns nor should "fix" (fixing consumer-side drifts from upstream and is re-clobbered next sync).

**Verify:**
```bash
grep -rln "execSync\|child_process\|new RegExp(\|createHash" scripts/ .claude/hooks/   # the flagged patterns, all framework-vendored
grep -n "exclusion\|sources\|vendored\|scripts\|\.claude" scripts/compose-sonar-properties.mjs  # composer has no vendored-dir notion
```

**Fix — options (pick the lightest that helps):**
- Have the adoption/`/setup` Sonar story add `scripts/**` and `.claude/**` to `sonar.exclusions` for consumers (these are vendored framework code, not product). Cleanest if the composer emits a standing "vendored framework" exclusion block, or `/setup` documents it in the user-maintained header section of `sonar-project.properties`.
- Alternatively, address the hotspots/reliability **at the source** in the framework's own `scripts/`/`hooks/` (justify each `execSync`/`RegExp`/`createHash` with a `// NOSONAR`-style review note or refactor) so they don't trip *anyone's* gate — but exclusion is simpler since this is vendored infra, not product surface.
- At minimum, document in the adoption guide that a consumer using SonarCloud should exclude vendored framework dirs, so teams don't chase framework findings as product defects.

**Acceptance.** A freshly adopted consumer's Sonar gate does not report findings located in framework-vendored `scripts/`/`.claude/`; a framework re-sync PR does not fail the consumer's quality gate on vendored-code hotspots. The framework's own gates still pass.

**Note.** belong-marketplace merged PR #11 over this red (non-required) gate intentionally — the findings are framework-owned and `src/` is clean. No consumer-side patch was applied (would drift from the composer); it inherits the fix on the next re-sync once this lands. The maintainer chose to track this upstream rather than patch Belong.

---

## FOLLOW-UP 12 — `VENDORED_EXCLUSIONS` misses the root Night Shift engine  ·  **Severity: LOW-MEDIUM**

> ✅ **RESOLVED by #59** (merged 2026-06-03) — the three root engine files were added to `VENDORED_EXCLUSIONS` + pinned by the composer test. Kept below as the record.

**Problem.** FOLLOW-UP 10 (#54) gave `compose-sonar-properties.mjs` a standing `VENDORED_EXCLUSIONS = ['scripts/**', '.claude/**']` so a consumer's SonarCloud gate doesn't flag framework-vendored code. But **#56 delivers the Night Shift engine to the consumer's project ROOT** (`ralph-local.sh`, `ralph-lib.sh`, `ralph-blocked-comment.md.tmpl`) — and those root files are **outside** the two vendored dirs. **SonarCloud does analyze shell**, so the vendored Ralph bash trips the gate as product code.

Confirmed live on belong-marketplace (PR #13, a re-sync delivering the engine, touching **0 `src/` files**): the gate failed **`C Maintainability Rating on New Code`**, and the *only* analyzable non-excluded files in the PR were `ralph-lib.sh` + `ralph-local.sh` — i.e. the failure is **entirely** vendored framework bash, zero product code. Same class as FOLLOW-UP 10, just a surface the standing exclusion list forgot.

So every consumer that adopts/re-syncs the Night Shift engine (post-#56) will hit this on the delivering PR, and carry standing code smells on the engine in its `main` dashboard — framework code the product team neither owns nor should "fix".

**Verify:**
```bash
grep -n "VENDORED_EXCLUSIONS" scripts/compose-sonar-properties.mjs          # currently ['scripts/**','.claude/**'] only
grep -niE "cp .*ralph|ralph-local.sh|ralph-lib.sh" skills/setup/SKILL.md    # #56 delivers these THREE to project root
```

**Fix.** Extend the standing exclusion to the root Night Shift files:
```js
const VENDORED_EXCLUSIONS = ['scripts/**', '.claude/**', 'ralph-local.sh', 'ralph-lib.sh', 'ralph-blocked-comment.md.tmpl'];
```
Then update the composer test (`scripts/__tests__/compose-sonar-properties.test.mjs`): the `cap-plain` assertion changes to expect all five, and add/extend a case asserting the root engine files are present. (The blanket-`scripts/**` caveat comment already documents the trade-off; the root files are exact names, no glob risk.) Pairs naturally with FOLLOW-UP 10 — same `VENDORED_EXCLUSIONS` constant.

**Acceptance.** A consumer that re-syncs the Night Shift engine and re-composes `sonar-project.properties` gets the root Ralph files excluded → the delivering PR's gate is green on vendored bash. Composer test pins it. Framework's own gates still pass.

**Note.** belong-marketplace patched this consumer-side in PR #13 (added `ralph-local.sh,ralph-lib.sh,ralph-blocked-comment.md.tmpl` to its hand-maintained `sonar.exclusions`) to land the re-sync green; it inherits the durable composer fix on the next re-sync. No further consumer action needed.

---

## FOLLOW-UP 13 — Composer emits the wrong file for Automatic-Analysis consumers (`sonar-project.properties` is ignored; `.sonarcloud.properties` is read)  ·  **Severity: MEDIUM**

> ✅ **RESOLVED by #59** (merged 2026-06-03) — the composer gained a `--write` mode that emits **both** `.sonarcloud.properties` (Automatic Analysis) and `sonar-project.properties` (CI scanner), pinned by a test. ✅ **Adoption-wiring half resolved by #74** (2026-06-03): `/setup` now runs `compose-sonar-properties.mjs --write <capabilities>` as an explicit step and validation step 7 pins both files + the vendored exclusion. Kept below as the record.

**Problem.** `compose-sonar-properties.mjs` emits **`sonar-project.properties`**. But SonarCloud **Automatic Analysis** — the GitHub-App default with no CI scanner, which most adopters use — **does not read `sonar-project.properties` at all** (that file is only for the CI-based scanner). Automatic Analysis reads **`.sonarcloud.properties`** (repo root) + the SonarCloud UI. So for any Automatic-Analysis consumer the composed config (`sonar.sources`, `sonar.exclusions`, `sonar.coverage.exclusions`, `sonar.tests`) is **silently ignored** — nothing the composer writes takes effect. This is the actual mechanism behind the "Automatic Analysis ignores `sonar.sources`" observation noted in FOLLOW-UP 10.

**Consequence:** FOLLOW-UP 10's vendored exclusions (already in `main` via #54) are a **no-op for Automatic-Analysis consumers** — they only help CI-scanner consumers. The vendored framework code keeps tripping the gate for everyone on the App default. (FOLLOW-UP 10 is merged and correct *for the CI-scanner case* — do **not** edit it; this item carries the file-target correction.)

**Proven live (belong-marketplace #13).** Identical vendored exclusions:
- in `sonar-project.properties` → gate **red** (`C Maintainability on New Code`, on vendored code; 0 `src/` files in the PR);
- moved into a new `.sonarcloud.properties` → gate **green** on the next analysis.

**Verify:**
```bash
ls .github/workflows/*.yml 2>/dev/null | xargs grep -l -i sonar   # no hit → Automatic Analysis → needs .sonarcloud.properties
grep -n "sonar-project.properties\|sonarcloud.properties" scripts/compose-sonar-properties.mjs skills/setup/SKILL.md  # composer/setup only know sonar-project.properties
```

**Fix.**
- Detect the analysis mode in `/setup` (presence of a CI Sonar workflow). **Automatic Analysis** (no CI scanner) → emit the composed scope + `VENDORED_EXCLUSIONS` to **`.sonarcloud.properties`**. **CI scanner** → `sonar-project.properties` (today's behavior). Emitting **both** is harmless (each reader ignores the other) and is the most robust default if detection is undesirable.
- Whichever file is emitted carries the same `VENDORED_EXCLUSIONS` (incl. the root Night Shift files from FOLLOW-UP 12).
- Document the `sonar-project.properties` (CI scanner) vs `.sonarcloud.properties` (Automatic Analysis) distinction in the adoption/Sonar guide.

**Acceptance.** An Automatic-Analysis consumer's composed config lands in `.sonarcloud.properties` (or both) → the vendored exclusions actually take effect (gate green on a 0-`src/` re-sync PR). CI-scanner consumers unaffected. Framework's own gates pass.

**Note.** belong-marketplace patched this consumer-side in #13 (added `.sonarcloud.properties` with the vendored + root-engine exclusions) → its gate is green now; it inherits the durable composer fix on the next re-sync once this lands. Pairs with FOLLOW-UP 10 (which patterns) and 12 (the root engine files) — 13 is *which file they must be written to*.

---

# Night Shift gate hardening — FOLLOW-UPs 14–22 (from the belong-marketplace slice-02 live run, 2026-06-03)

> ✅ **ALL NINE RESOLVED (2026-06-03, same day).** PR map: **15→#63**, **16→#64**, **14→#65** (+#66 fix-forward: GNU-stat portability in the mtime check), **17→#68**, **18→#69**, **19→#70**, **22→#71**, **20→#72**, **21→#73**. Related, landed in the same run: **#67** (English sweep of `ralph-local.sh.tmpl` — shipped artifacts carry no Spanish), **#74** (item-13 adoption sliver: `/setup` runs the composer `--write`), **#75** (FOLLOW-UP 23, found during 19). Notable deltas vs the drafts below: 14 uses a **per-issue** result file (parallel workers don't race) and also fixed a latent `set -e` kill on non-zero `claude` exits; 17's `--comments` flag shows ONLY comments (the contract documents both calls); 19 had a second root cause the draft missed (subshell loses the cumulative — fixed with a token ledger file); 21 also fixed `summarize_scenarios` and canonicalized the label form in `/to-issues`. Each item's section is kept below as the record; the Ralph loop test suite grew 8 → 21 tests (repo suite 67).

**Context for all nine items.** First fully-AFK Ralph run on a consumer (belong-marketplace, issue #14, Stripe Connect onboarding). **The agent's code was green from iteration 1** (verified externally: 5/5 scenarios, 37/37 steps, 77/77 unit/integration, reviewer verdict CLEAN). Ralph still burned **8 iterations without ever registering green** — every failure was gate/loop tooling, not code. Full forensics: belong-marketplace PR #17 body + session log `14-20260603-191849.log`. Line numbers below refer to the consumer copies stamped `framework@3013f9d`; locate the framework originals with `git ls-files | grep -E "ralph-(local|lib)|run-acceptance|preflight|check-invariants"`. Items 14–17 are the kill chain (each alone was sufficient to block forever); 18–22 are hardening. **Separate PRs per item**, same conventions as above.

---

## FOLLOW-UP 14 — `ralph-local.sh` decides green by grepping the literal string `exit code: 0` in LLM prose  ·  **Severity: CRITICAL**

**Problem.** The loop's ONLY green signal is:
```bash
# ralph-local.sh line ~242 (consumer copy @3013f9d)
if echo "$ACCEPTANCE_OUT" | grep -q "exit code: 0"; then
```
`$ACCEPTANCE_OUT` is the free-text final message of a `claude -p /run-acceptance` session, prompted only with "Reporta exit code." Any phrasing drift — `Exit code: 0`, `exit code 0`, `exited with 0`, a Spanish sentence, a markdown table — reads as **failure even when every gate passed**. The inverse risk also exists: prose like `the previous run's exit code: 0 became 1` would read as green. A correctness gate must not depend on an LLM's phrasing.

**Evidence (live).** 8 iterations, all `outcome: acceptance-failing`, while the implementation was externally verified green. The failing iterations also record **no failure reason** — `ralph.iteration.completed {'outcome': 'acceptance-failing'}` is the only forensic trace, which made diagnosis needlessly slow.

**Verify:** `grep -n '"exit code: 0"' ralph-local.sh` (or templates/ equivalent).

**Fix.** Replace the prose grep with a **structured result channel**:
1. `/run-acceptance` (skill) writes a machine-readable result file as its LAST step, e.g. `.planning/acceptance/last-result.json`:
   ```json
   { "issue": 14, "exit_code": 0,
     "scenarios": { "scn-021": "passed", "scn-022": "passed" },
     "gates": { "smoke": "pass", "release": "pass", "stubs": "pass" },
     "failure_reason": null }
   ```
   The skill documents this as a MANDATORY output contract (file write, not prose).
2. `ralph-local.sh` reads the file with `jq` (exists + `exit_code == 0` + file mtime newer than iteration start), feeds `ralph_scenario_passed/failed` per scenario from `scenarios{}`, and logs `failure_reason` into the NDJSON on failure.
3. Keep the prose grep only as a deprecated fallback behind a warning, or delete it.
4. Add `scripts/__tests__/` coverage: a fixture result file → green path; missing/stale file → fail path with reason logged.

**Acceptance.** A green acceptance run registers green regardless of how the session phrases its summary; a failing run records *why* in the session NDJSON; tests cover both. No consumer prose-contract remains.

---

## FOLLOW-UP 15 — `/run-acceptance` Step 2 runs `@smoke` GLOBALLY → permanently blocks every slice-group  ·  **Severity: CRITICAL**

**Problem.** `skills/run-acceptance/SKILL.md` Step 2:
```bash
$BDD_RUNNER --tags=@smoke
```
runs **all** `@smoke` scenarios in the repo. In any slice-group (the framework's own PR-Group/§30 model), sibling slices' `.feature` files are approved and committed **before** implementation — their step definitions don't exist **by design** (§61). cucumber reports them `undefined` → non-zero exit → Step 2 **BLOCKS, unconditionally, until the whole slice-group is implemented**. The gate is structurally incompatible with the framework's own vertical-slice decomposition.

**Evidence (live).** Slice-02 ships 18 approved scenarios across 3 issues; #14 implements 5. The sibling `@smoke` scenarios scn-026/031/035 (issues #15/#16) were undefined → Step 2 could never pass for #14, regardless of code.

**Verify:** `grep -n 'tags=@smoke' skills/run-acceptance/SKILL.md`; reproduce with any repo holding an approved-but-unimplemented sibling `.feature`.

**Fix.** Scope the smoke gate to "implemented or this-slice" scenarios:
```bash
# Exclude @smoke scenarios belonging to OPEN sibling issues (their scenarios:* labels):
OPEN_SCNS=$(gh issue list --state open --json labels \
  --jq '[.[].labels[].name | select(startswith("scenarios:"))] | join("+")' \
  | grep -oE 'scn-[0-9]+' | sort -u | grep -v -F "$THIS_ISSUE_SCNS" || true)
$BDD_RUNNER --tags "@smoke and not (${OPEN_SCNS_AS_OR_EXPR})"
```
(Or equivalently: pre-compute defined scenarios via `--dry-run` and intersect.) Document the rationale inline (§61: sibling scenarios are undefined by design). Validated live: the scoped form passed 9/9 on the consumer.

**Acceptance.** A consumer with approved-but-unimplemented sibling features passes Step 2 for an implemented slice; a genuinely broken implemented `@smoke` scenario still blocks.

---

## FOLLOW-UP 16 — `/run-acceptance` Step 3 example uses ANDed `--tags` flags → matches 0 scenarios, exits 0  ·  **Severity: HIGH**

**Problem.** Step 3's canonical example:
```bash
$BDD_RUNNER --tags=@release --tags=@scn-042 --tags=@scn-043
```
cucumber-js combines multiple `--tags` flags with **AND**. A scenario carries exactly one `@scn-NNN` tag, so this matches **zero scenarios** — and cucumber exits **0** on an empty selection. The gate "passes nothing, successfully": with FOLLOW-UP 14's per-scn verification it reads as all-failed; without it, it would be a **false green**. Sessions copy skill examples literally, so the bug re-injects every iteration.

**Evidence (live).** Reproduced verbatim on the consumer: `--tags=@release --tags=@scn-021 --tags=@scn-022` → `0 scenarios, 0 steps, exit: 0`. The correct form passed 5/5.

**Verify:** `grep -n 'tags=@release --tags' skills/run-acceptance/SKILL.md`.

**Fix.**
1. Single expression: `$BDD_RUNNER --tags "@scn-042 or @scn-043"` (the `@release` conjunct is redundant when scn tags are explicit; if kept: `"(@scn-042 or @scn-043) and @release"`).
2. Add a MANDATORY sanity check to the skill: *the run must report exactly as many scenarios as the issue's `scenarios:*` label lists; `0 scenarios` means the filter is wrong — treat as FAIL, never pass.* (This guard also belongs in FOLLOW-UP 14's structured verification.)

**Acceptance.** Documented commands match cucumber-js tag semantics; an accidental empty selection is reported as failure, with a test (fixture or doc-tested snippet) pinning the semantics.

---

## FOLLOW-UP 17 — Ralph's sessions receive the issue BODY only; comments (where `/plan` writes!) are invisible  ·  **Severity: HIGH**

**Problem.** The iteration prompt (`ralph-local.sh` line ~197) says *"Lee el cuerpo del issue …"* and sessions comply — they run plain `gh issue view N`, which **does not include comments**. But `/plan` (skill) documents its output as *"added to the issue body **(via `gh issue comment` or by editing the issue body)**"* — and the comment path is the natural choice. Result: **the technical plan and any mid-flight amendments posted as comments never reach the implementing agent.** The two skills contradict each other on the contract channel.

**Evidence (live).** A plan amendment posted as a comment at 19:31Z was ignored for 5 consecutive iterations; the identical content appended to the **body** (`gh issue edit --body`) was picked up by the very next fresh iteration (which then did the change red-first, correctly).

**Verify:** `grep -n "cuerpo del issue\|gh issue view" ralph-local.sh skills/tdd/SKILL.md`; `grep -n "issue comment\|issue body" skills/plan/SKILL.md`.

**Fix — align the channel, pick ONE:**
- (a) **Recommended:** prompt instructs *"Lee el issue completo: `gh issue view N --comments`"* (and `/tdd`'s inputs section says the same) — comments become a first-class amendment channel; OR
- (b) `/plan` MUST write into the body (drop the comment option), and document that comments are advisory-only for Ralph.
Either way, state the chosen contract in BOTH `skills/plan/SKILL.md` and `skills/tdd/SKILL.md` + the ralph prompt, so they can't drift apart again.

**Acceptance.** A plan amendment posted via the documented channel demonstrably appears in the next iteration's behavior (manual test acceptable); the three artifacts name the same channel.

---

## FOLLOW-UP 18 — `ralph-local.sh` has no environment pre-flight (Docker, secrets) → burns iterations on unfixable failures  ·  **Severity: MEDIUM-HIGH**

**Problem.** The loop validates the issue contract (labels, budget) but nothing about the **execution environment**. If the acceptance stack needs Docker (testcontainers — the framework's own §31 "test-real" default) and the daemon is down, every iteration fails identically with zero diagnostic, and no amount of code edits can fix it. Same class: required env vars still set to dev placeholders.

**Evidence (live).** Docker daemon was off → iterations 2–4 (~25 min) produced zero commits and `acceptance-failing` with no recorded cause. `open -a Docker` fixed it in 6 seconds — after manual diagnosis.

**Verify:** `grep -n "docker" ralph-local.sh ralph-lib.sh` → no hits.

**Fix.** Pre-flight block before iteration 1 (fail fast, actionable message):
```bash
# testcontainers detected? (devDependency @testcontainers/* or cucumber World using it)
if grep -q '"@testcontainers/' package.json 2>/dev/null; then
  docker info >/dev/null 2>&1 || { echo "❌ Docker daemon not running — acceptance uses testcontainers (§31). Start Docker and relaunch."; exit 1; }
fi
```
Optionally a generic hook point (`RALPH_PREFLIGHT_CMD`) so consumers add stack-specific checks (e.g. "STRIPE_SECRET_KEY is not the dev sentinel"). Detection heuristics belong in the stack capability, not hardcoded.

**Acceptance.** With Docker stopped, `./ralph-local.sh N` exits before iteration 1 with the actionable message; with Docker up, behavior unchanged. Test with a fixture package.json.

---

## FOLLOW-UP 19 — Token accounting reports 0 for every iteration → the `budget:NNk` gate is dead code  ·  **Severity: MEDIUM**

**Problem.** Every NDJSON event in the live run shows `tokensConsumedDelta: 0, tokensConsumedCumulative: 0` across 8 real iterations (`Tokens: 0/120000` on stdout). The §63/§65 budget contract — the thing that distinguishes `budget:120k` from infinity — never engages; only `max_iterations` bounds the loop. Likely cause: the `claude -p` invocation's usage is never captured (plain text output has no usage data).

**Verify:** `grep -n "tokensConsumed\|usage\|output-format" ralph-lib.sh ralph-local.sh` — confirm no usage extraction; cross-check any consumer session log: `jq '.tokensConsumedCumulative' *.log | sort -u` → only `0`.

**Fix.** Invoke `claude -p ... --output-format json` (result JSON carries usage/cost fields), parse total tokens per call in `ralph_call_claude_with_retry`, and feed the existing `ralph_budget_checkpoint` / `check_budget_or_block` plumbing (whose `budget_exceeded → blocked` path #57 already fixed — it's currently unreachable). Keep the human-readable transcript by extracting `.result` text from the JSON for `$TDD_OUT`/`$ACCEPTANCE_OUT` consumers. Add a fixture test for the parser.

**Acceptance.** A real iteration logs non-zero deltas; an artificially tiny `budget:1k` label triggers the `budget_exceeded` block path; tests green.

---

## FOLLOW-UP 20 — `preflight.mjs feature-approved` matches by FILENAME `<slug>.feature` — false-negative for the naming `/to-scenarios` itself prescribes  ·  **Severity: MEDIUM**

**Problem.** `scripts/preflight.mjs` `findFeature()` (line ~42) returns a file only if it is literally named `<slug>.feature`. But `/to-scenarios` names outputs `features/<bounded-context>/<topic>.feature` (its own examples: `listing-publication.feature`) and **multi-context features produce N files** — none named after the slug. The check then fails with *"no features/**/<slug>.feature found — run /to-scenarios"* even when every file exists and is `# status: approved`. Consumers of `/to-issues` and `/run-acceptance` hit this on every multi-context feature.

**Evidence (live).** Slice-02: two approved files (`features/onboarding/stripe-connect-onboarding.feature`, `features/settlement/stripe-account-webhook.feature`) → `feature-approved 02-stripe-connect-onboarding` failed; approval had to be verified by hand.

**Verify:** `sed -n '33,46p' scripts/preflight.mjs`; `node scripts/preflight.mjs feature-approved <any-multi-context-slug>` in a consumer.

**Fix.** Resolve by **content, not filename**: a feature file belongs to a slug iff its header comment matches `# spec: docs/specs/<slug>.md` (the header `/to-scenarios` already writes). Collect ALL matches; fail if zero (unchanged message); fail listing the offenders if ANY match is not `approved`; pass only when all are approved. Keep the filename match as a fast-path. Add `scripts/__tests__/preflight.test.mjs` fixtures: single named file, multi-context spec-header files, one-of-N-draft.

**Acceptance.** A multi-context feature with all files approved passes; one draft file among them fails naming the file; legacy `<slug>.feature` naming still passes.

---

## FOLLOW-UP 21 — `check-invariants.mjs` INV-5 doesn't expand the compact `scenarios:scn-021+022` label form that the framework's own labels use  ·  **Severity: MEDIUM**

**Problem.** The issue-file label parser (line ~68):
```js
const scns = [...t.matchAll(/scenarios:([a-z0-9+-]+)/gi)].flatMap((m) => m[1].match(/scn-\d+/g) || []);
```
On `scenarios:scn-021+022+023` only `scn-021` matches `scn-\d+` — the `+022` continuations are silently dropped. The compact form is what real GitHub labels use (50-char limit pressure; e.g. consumer labels `scenarios:scn-010+011+012+013+020` from slice 01). Result: INV-5 reports false "@release scns with no issue" orphans, and the consumer must hand-spell `scenarios:scn-021+scn-022+…` in the local `**Labels:**` line — an undocumented divergence between the GitHub label and the file line.

**Evidence (live).** With the compact form, INV-5 flagged scn-022..038 as orphans while scn-021/026/031 (first of each label) were credited; spelling out `scn-` per token fixed it.

**Verify:** `node -e 'console.log("scn-021+022".match(/scn-\d+/g))'` → `["scn-021"]`.

**Fix.** Expand continuations in the parser: after capturing the token, also match `/(?:^|\+)(\d+)/g` and prefix `scn-` to bare numeric segments (or: normalize the token by replacing `+(?=\d)` with `+scn-` before the existing match). Pick ONE canonical documented form for the `**Labels:**` line (`/to-issues` Step 5/6 must emit it) and make the parser accept both. Fixture test: compact, spelled, and mixed forms each credit all scns.

**Acceptance.** `scenarios:scn-021+022+023` credits 3 scenarios; INV-5 stops reporting false orphans on consumers using GitHub-compact labels; `/to-issues` docs name the canonical form.

---

## FOLLOW-UP 22 — Branch slug not sanitized: em-dash from the issue title lands in the git ref  ·  **Severity: LOW**

**Problem.** `ralph-local.sh` line ~173 builds the slug with `tr ' ' '-' | tr -d ',' | tr '[:upper:]' '[:lower:]'` — non-ASCII passes through. An issue titled `02-stripe-connect-onboarding — Stripe Connect …` yields branch `agent/feature-02-stripe-connect-onboarding-—-stripe--14` (literal U+2014). Git accepts it, but it breaks naive tooling, shell-quoting habits, and the `agent/feature-<slug>-<NNN>` greppability the docs promise.

**Verify:** `sed -n '173p' ralph-local.sh`; `git branch -a | grep -P '[^\x00-\x7F]'` on the consumer.

**Fix.** Sanitize to the safe set and collapse: `... | iconv -f utf8 -t ascii//TRANSLIT 2>/dev/null | tr -c 'a-z0-9-' '-' | tr -s '-' | sed 's/^-//;s/-$//' | head -c 40`. Fixture test with an em-dash title.

**Acceptance.** An em-dash/emoji title produces a `[a-z0-9-]`-only branch; ASCII titles unchanged.

---

## FOLLOW-UP 23 — `ralph_render_blocked_comment` leaves placeholders unrendered on macOS (BSD awk)  ·  **Severity: LOW**

> ✅ **RESOLVED by #75** (2026-06-03) — found while debugging FOLLOW-UP 19, fixed immediately. Kept as the record.

**Problem.** The template substitution used `awk -v v="$value"`. BSD awk hard-errors `newline in string` on multiline values — and every real substitution is multiline (`scenario_results`, `last_actions`, `reviewer_section`) — so on macOS the `ralph-blocked` comment posted with raw `{placeholders}`. `-v` also escape-processes backslashes, mangling reviewer output containing `\n` even on GNU awk.

**Fix.** Values passed via `ENVIRON[]` (no escape processing, newline-safe on both awks). Test pins: multiline rendering, literal backslashes, no surviving placeholder, no `newline in string` on stderr.

---

# Post-batch review round (2026-06-03) — FOLLOW-UPs 24–25 + fast-follows

**Two reviews ran over the merged batch:** (a) the consumer-side review by the agent that authored items 14–22 (`.planning/REVIEW-PRS-62-76.md` — verdict: all 9 correctly resolved, 3 adjustments), and (b) an adversarial multi-agent code review of the cumulative diff `0c26c5d..main` (10 findings: 4 confirmed fixable, the rest altitude/maintenance). **Fast-follow PRs, open for maintainer review (not self-merged):** #77 (Adjustment 1 — `@manual` scenarios in Step 3 + result contract), #78 (Adjustment 2 — `--limit 1000` on the sibling query), #79 (Adjustment 3 — `.env` placeholder sentinels in env_preflight), #80 (self-review fixes: last Spanish remnant, tautological test assert, regex escape, expander numeric guard, dead stores). The altitude-class findings stay open as items 24–25 below.

## FOLLOW-UP 24 — scn-label expansion + executable gate logic live in 4 places, two of them prose  ·  **Severity: LOW-MEDIUM (decision)**

**Problem.** The `scenarios:*` expansion exists in `ralph-lib.sh` (`expand_scns`, bash), `check-invariants.mjs` (inline JS), and TWICE as sed/tr pipelines inside `skills/run-acceptance/SKILL.md` (Step 2 sibling-scoping, Step 3 this-slice selection). The skill copies are **prose an LLM re-interprets every run** — the exact drift class that caused FOLLOW-UP 16 ("sessions copy skill examples literally") — and have no test coverage. The framework's own pattern for executable gate logic is consumer-runtime `scripts/*.mjs` (preflight/check-invariants).

**Fix (proposed).** A `scripts/scope-scenarios.mjs` (or similar) owning: label expansion (canonical + legacy forms), sibling-scoping (the `gh issue list` query + exclusion), this-slice selection + expected-count (incl. the `@manual` partition from #77). The skill snippets become one-line `node scripts/...` calls; fixtures pin the behavior; bash/JS copies shrink to consumers of one implementation. Wire into `/setup`'s copy list (per [[stormhelm-new-runtime-script-wire-setup]] class) and the validation `ls`.

**Acceptance.** One executable implementation; Step 2/3 snippets invoke it; tests cover compact/spelled/comma + @manual + sibling truncation; `/setup` ships it.

## FOLLOW-UP 25 — no regression gates for two one-time fixes (English-only artifacts; result-file schema)  ·  **Severity: LOW**

**Problem.** (a) "Shipped artifacts are English" was enforced by a one-time sweep (#67) — and its grep already missed a line (#80 fixed `Invocando…`); nothing stops Spanish re-entering. (b) The acceptance result-file contract is documented in skill prose and parsed in bash with no shared schema artifact — field drift (e.g. a renamed `ran`) is only caught by a human reading both sides.

**Fix (proposed).** (a) Add a check to `check-framework-metadata.mjs` (or a test) flagging common Spanish words/accented chars in shipped files (`templates/`, `skills/`, `hooks/`, `agents/`). (b) Commit a small JSON Schema for `issue-<N>-result.json` next to the skill (or in `scripts/`), referenced by both the skill's Step 10 and `ralph_acceptance_result_check`'s header; optionally validate in the check itself via `jq`-expressible assertions.

**Acceptance.** A Spanish string in a shipped template fails CI; the result-file schema has one canonical machine-readable definition both sides cite.

---

# Night Shift live-run batch 3 — FOLLOW-UPs 26–32 (from the belong-marketplace issue-#15 run, 2026-06-04)

**Context.** First end-to-end run on the hardened engine (post #63–#81). Outcome: **draft PR delivered** (belong PR #19) — the agent coded, gated, and self-reviewed correctly; every failure below is harness, found live across 3 sessions. Items 26–29 were each diagnosed in MINUTES thanks to FU-14's `reason` field (vs hours on the #14 run) — the structured-forensics investment already paid for itself. **Items 27/28 were consumer-patched in belong's throwaway worktree to finish the run; 29 was completed manually. Those patches die with the worktree — the next slice (#16) hits all of them again until fixed here.** Forensics: belong issue #15 comments, session logs `15-20260604-{020645,022735,030121}.log`, belong PR #19 body. Line numbers = consumer copies @2606ddf.

---

## FOLLOW-UP 26 — Reviewer-retry is BLIND: `$LAST_REVIEWER_OUTPUT` is never passed to the retry `/tdd`  ·  **Severity: HIGH**

**Problem.** On `blocking` findings, the loop logs `ralph.reviewer.retry` and `continue`s to the top of the for-loop (`templates/ralph-local.sh.tmpl` ~line 320-326) — which re-runs the **standard** `/tdd` prompt (line ~246). The findings live only in the in-memory `LAST_REVIEWER_OUTPUT` variable: the retry session has **no way to know what to fix**. Live: the retry iteration committed nothing (it couldn't), then died on an unrelated stale-file failure; if it had gone green, the reviewer would have re-flagged the same findings → ping-pong until budget/max-iter death. The findings are also unrecoverable post-mortem (session memory only).

**Verify:** `sed -n '318,328p' templates/ralph-local.sh.tmpl` → `continue` with no findings handoff; `grep -n "LAST_REVIEWER_OUTPUT" templates/ralph-local.sh.tmpl` → set, formatted for the PR/block paths, never for the retry.

**Fix.** Before the retry `continue`, persist the findings to the channel the implementer already reads (FU-17's contract — elegant reuse):
```bash
gh issue comment "$ISSUE_NUM" --body "$(printf '## Reviewer findings (iteration %s — fix these, then the gate re-runs)\n\n%s' "$i" "$REVIEWER_OUTPUT")"
```
This simultaneously: (a) gives the retry `/tdd` (which reads body+comments) the exact findings; (b) makes findings survive session death (the forensic gap we hit). Optionally also append a one-line hint to the retry's tdd prompt ("reviewer findings are in the latest issue comment").

**Acceptance.** ralph-loop test: mock reviewer returns blocking once → assert a `gh issue comment` call carrying the findings happens before the retry iteration; the retry tdd prompt run sees it (mock gh records calls). Findings text recoverable from the issue after a kill.

---

## FOLLOW-UP 27 — `ralph_reviewer_severity` is an emoji grep: a CLEAN report's own section header classifies as BLOCKING  ·  **Severity: HIGH**

**Problem.** `templates/ralph-lib.sh` `ralph_reviewer_severity` greps `🛑|⚠️|💡` anywhere in the output. The reviewer agent's standard structured report **always** contains `## 🛑 Blocking findings (0)` and a summary table row `| 🛑 Blocking | 0 |` — so a CLEAN verdict parses as **blocking**. Confirmed live: in-loop "blocking" on a diff an independent §114 re-audit scored CLEAN 0/0; the false signal triggered the (blind, FU-26) retry. Same fragile-prose-contract class as FU-14/exit-code — third instance.

**Verify:** `bash -c 'source templates/ralph-lib.sh; ralph_reviewer_severity "## 🛑 Blocking findings (0)"'` → `blocking`.

**Fix (consumer-validated live — lift it).** Two halves, mirroring FU-14's pattern:
1. The engine's reviewer prompt demands an explicit terminal line: *"MANDATORY: end with the literal line `VERDICT: CLEAN` or `VERDICT: SHOULD-FIX` or `VERDICT: BLOCKING` (automation parses this exact line)."*
2. `ralph_reviewer_severity` parses the VERDICT line FIRST (last occurrence wins, case-insensitive, tolerate `**` markdown); emoji grep stays as fallback for legacy outputs. The belong worktree patch (validated: clean-with-emoji-header → `clean`, real blocking → `blocking`) can be lifted verbatim.

**Acceptance.** Unit tests: clean-report-with-emoji-headers fixture → `clean`; `VERDICT: BLOCKING` → `blocking`; no-verdict legacy → fallback behavior pinned. ralph-loop test: mock reviewer CLEAN report with emoji headers → PR path taken, no retry.

---

## FOLLOW-UP 28 — Acceptance sessions skip the MANDATORY result-file rewrite when "nothing changed" → `result-file-stale` burns an iteration  ·  **Severity: MEDIUM**

**Problem.** The skill's Step 10 says write the file ALWAYS, and the engine prompt repeats it — yet a live retry-iteration session, seeing the suite already green and no code changes, concluded **without rewriting** the file; the loop's (correct) mtime staleness check rejected the previous iteration's file → `acceptance-failing (result-file-stale)` → ~45k tokens wasted. The fail-safe worked; the iteration was still lost to an avoidable LLM judgment lapse.

**Verify:** belong session log `15-20260604-022735.log`, iteration 2: `reason: result-file-stale (mtime … < iteration start …)`.

**Fix — make it structural, not prompt-hopeful:** the engine deletes the old file BEFORE invoking `/run-acceptance` (`rm -f "$ACCEPT_RESULT_FILE"`); now a session that skips the write produces `result-file-missing` (unambiguous contract violation) and can never be confused with staleness. Keep (consumer-validated) the prompt reinforcement: *"ALWAYS rewrite that file fresh in THIS run — even if nothing changed since a previous green run."*

**Acceptance.** ralph-loop test: pre-seed a stale green result file + mock acceptance that does write → green via the FRESH file; mock that doesn't write (`MOCK_NO_RESULT_FILE`) → `result-file-missing` (existing T10 still passes with the pre-delete in place).

---

## FOLLOW-UP 29 — `gh pr create` aborts: the engine never pushes the branch  ·  **Severity: CRITICAL (hard-blocks every successful run at the finish line)**

**Problem.** The green path runs `gh pr create --draft …` without ever pushing `$BRANCH`. Non-interactive `gh` aborts: `aborted: you must first push the current branch to a remote, or use the --head flag`. **This was the first time in the framework's history the PR step executed** (every prior run died earlier) — and it failed. Live: belong #15 run 3 completed green + reviewer, decided "Creating PR…", aborted, ended `blocked·gh-pr-create-failed`; Day Shift had to push+create manually.

**Verify:** `grep -n "git push" templates/ralph-local.sh.tmpl` → no hit before the `gh pr create` block.

**Fix.**
```bash
git push -u origin "$BRANCH" || { ralph_error_tool "git" "push failed"; …block path…; }
gh pr create --draft --head "$BRANCH" …
```
(`--head` makes the call worktree/detached-HEAD-proof too.) Extend the mock `gh` to track pushed-state: `pr create` fails unless a prior `git push` happened (mock git or a sentinel file) so the regression is pinned.

**Acceptance.** ralph-loop happy-path test asserts the push precedes `pr create` and the PR opens; an injected push failure takes the block path with a structured reason.

---

## FOLLOW-UP 30 — Block-path robustness: `ralph-blocked` label add fails silently; blocked comment contradicts the result file  ·  **Severity: MEDIUM**

**Problem.** Two live defects in `ralph_block_issue`: (a) if the consumer repo lacks the `ralph-blocked` label, `gh issue edit --add-label` fails **silently** — belong had no such label (nothing provisions it) → no label, watcher/queries can't see the blocked state (the comment did post). (b) The blocked comment's scenario summary is built from NDJSON `scenario.passed/failed` events — which are only emitted on the GREEN path; a budget block right after a green acceptance run printed `⚪ not attempted` for 5 scenarios whose result file said `passed` — actively misleading the morning reviewer.

**Verify:** belong issue #15's first blocked comment (all ⚪) vs `issue-15-result.json` (5/5 passed) from the same minute; `grep -n "label create" templates/ralph-lib.sh` → none in the block path.

**Fix.** (a) `gh label create ralph-blocked --force …` (idempotent) before the add — or `/setup` provisions it (pairs with FOLLOW-UP 1's hook gap; both are "adoption provisions the runtime's GitHub surface"). (b) `ralph_summarize_scenarios` reads `issue-<N>-result.json` FIRST when present-and-fresh, NDJSON events as fallback.

**Acceptance.** Block in a label-less fixture repo → label exists + applied; blocked comment over a green result file shows ✅ per scenario, not ⚪.

---

## FOLLOW-UP 31 — `/to-issues` budget heuristics are ~2-4x under measured reality  ·  **Severity: MEDIUM (docs)**

**Problem.** The skill's Step 4 table ("greenfield isolated ~50k", buckets 50-200k) predates working token accounting — the numbers were invented. Measured on belong (first runs with real accounting): a full iteration = tdd + acceptance + reviewer ≈ **55-78k tokens** even for the SMALLEST slice (one use case + one route); a 50k budget blocked a *successful* run mid-flight (work was green; the label killed it).

**Verify:** belong #15 session logs — run 1: 78,007 by end of acceptance; run 3 (no-op tdd!): 55,541 incl. reviewer.

**Fix.** Recalibrate Step 4: `budget ≈ expected_iterations × 80k`, floor 150k for any slice; document the measured anatomy (tdd 25-45k · acceptance 15-20k · reviewer ~15k) and that input tokens dominate (session reads issue+skills+code each time). Note budgets are per-SESSION (a blocked-then-resumed issue re-spends).

**Acceptance.** Skill table updated with measured numbers + source note; no consumer-invented budget below 150k in examples.

---

## FOLLOW-UP 32 — Graduate the consumer Night Shift tooling: `ralph-isolated.sh` + `ralph-watch.sh`  ·  **Severity: decision (additive)**

**Problem/opportunity.** belong built and battle-tested two wrappers the framework lacks: **isolation** (worktree-per-worker so the Night Shift never hijacks the developer's checkout — pairs with the engine's own `--worker-id`) and **observability** (Slack notifier over the NDJSON: per-iteration outcome+commit-delta+`reason`, terminal PR/blocked alerts, an environmental-blocker heuristic — ≥2 failing iterations with 0 new commits — that back-tested as catching the #14 Docker outage at iteration 3 vs 25 minutes of manual archaeology). Sources at belong repo root (untracked): `ralph-isolated.sh`, `ralph-watch.sh`.

**Lessons to bake in if adopted** (all hit live): jq `.[0]` on an empty `gh pr list` renders `"null null"` → false PR-opened (use `.[] | …' | head -1`); blocked detection must be NDJSON-`session.ended`-first (labels can be missing, FU-30a); on relaunch the watcher must bind to the NEW session log (the old log's `session.ended` fires a false terminal alert); notifier needs `SLACK_WEBHOOK_URL` in consumer `.env` (+ `.env.example` entry).

**Fix (if adopted).** Ship both as `templates/` (English, stamped), wire `/setup` to offer them, add ralph-loop-style tests for the watcher's parsing (fixture NDJSON) and the wrapper's preflight. Alternatively: document as a recipe in `core/13`. Maintainer call.

**Acceptance.** A consumer adopting via `/setup` can run an isolated, Slack-monitored Night Shift without writing tooling; the four lesson-bugs are pinned by tests.

---

# Night Shift retrospective batch 4 — FOLLOW-UPs 33–38 (post-mortem of the first fully-autonomous run, 2026-06-04)

**Context.** belong issue #16 was the framework's **first issue→draft-PR run with zero manual intervention on the critical path** (2 iterations, 223,673/250,000 tokens, engine pushed + opened belong PR #21 natively). This batch is the *optimization* retrospective across all 12 sessions of the slice-02 campaign (issues #14/#15/#16, ~600k tokens measured). Nothing here is a run-blocker — the theme shifts from "make it work" to "make it efficient and self-feeding **without losing quality**": every fix below keeps the §114 reviewer, the real gates (testcontainers/sandbox), and red-first intact. Item 33 is the big one: a measured ~15k tokens of pure duplication per green iteration. Forensics: belong session logs `15-20260604-030121.log` + `16-20260604-040345.log`, belong PRs #19/#21.

---

## FOLLOW-UP 33 — The reviewer runs TWICE per green iteration: the loop re-invokes what the acceptance session already ran  ·  **Severity: HIGH (cost) / MEDIUM (correctness surface)**

**Problem.** `skills/run-acceptance/SKILL.md` Step 8 invokes the reviewer and declares, verbatim: *"**This is the single reviewer invocation for the slice.** … Do not separately run `/code-review` in the same gating pass — that double-invokes the agent (redundant, double token spend)."* The result-file schema (Step 10) even carries the verdict: `"gates": { …, "reviewer": "should-fix" }`. **The Ralph loop violates its own skill's warning:** on every green iteration, `templates/ralph-local.sh.tmpl` invokes `/code-review` AGAIN (the `ralph.reviewer.invoked` green path) and re-derives severity from prose.

**Measured, twice (NDJSON token checkpoints):**
- belong #16 iteration 2: `158,799 → 208,171` (tdd + acceptance, whose session ran its own Step-8 reviewer — its result file's `failure_reason`/fields carried a reviewer verdict) → `208,171 → 223,673` for the loop's duplicate `/code-review` = **15,502 tokens of pure duplication**.
- belong #15 run 3: `40,978 → 55,541` = **14,563 duplicated**.
- Corroborating: #16 iteration 1's `failure_reason` ends "…; reviewer verdict BLOCKING." — written by the acceptance session, proving its embedded reviewer ran even on a failing pass (Step 8 says "always — passing or failing").

**Verify:** `grep -n "code-review" templates/ralph-local.sh.tmpl` (loop's own invocation) vs `grep -n "single reviewer invocation" skills/run-acceptance/SKILL.md`; any green-run NDJSON shows the post-acceptance `ralph.reviewer.invoked` + token jump.

**Fix.** Make the result file the single reviewer channel (the FU-14 pattern, applied to the last prose surface):
1. Extend the Step-10 contract: alongside `gates.reviewer` (severity), the acceptance session writes the full reviewer report to **`.planning/acceptance/issue-<N>-reviewer.md`** and records `"reviewer_report": "<path>"` in the JSON. Schema docs updated (pairs with FOLLOW-UP 25b if a schema artifact lands).
2. The loop's green path **reads** `jq -r .gates.reviewer` + the report file instead of invoking `/code-review`: `blocking` → FU-26 retry (post the report file's content as the issue comment); `clean/suggestion/should-fix` → PR, embedding the report file.
3. Delete the loop's `/code-review` call. `ralph_reviewer_severity` (VERDICT parser) stays for the acceptance session's internal use / ad-hoc callers, but the loop no longer parses prose at all — severity arrives as a structured field.
4. Mock `claude`'s acceptance branch writes the reviewer file + field; loop tests assert **zero** `/code-review` invocations in a normal green run and that blocking-in-file triggers the retry+comment path.

**Quality argument (why this loses nothing):** the §114 reviewer still runs exactly once per gating pass, inside `/run-acceptance` where the skill says it belongs; the PR still embeds the full report; blocking still retries. Only the duplicate invocation and the prose-parsing surface disappear.

**Acceptance.** Green-run NDJSON shows no `/code-review` call from the loop; tokens-per-green-iteration drop ≈15k in the loop tests' mock accounting; blocking-from-file → findings comment + retry; PR body carries the report from the file. Suite green.

---

## FOLLOW-UP 34 — The forensic `failure_reason` is logged but never fed back: the next iteration rediscovers what the last one already diagnosed  ·  **Severity: MEDIUM (convergence)**

**Problem.** FU-14 gave failures a precise `failure_reason` (live example, #16 iteration 1: *"pnpm typecheck is red: FakeConnectedAccountRepo … missing findByConnectedAccountId/updateVerification; health.routes.test.ts Env fixture missing STRIPE_WEBHOOK_SECRET; … Fix the 3 test fixtures"* — an actionable TODO list). But the next iteration's `/tdd` prompt is **static**: the session must re-discover the failure by re-running the suite itself. It worked (#16 it2 converged in 14 min) but burns session time/tokens re-deriving known facts, and a subtler failure than "typecheck says X" might not be rediscovered at all.

**Verify:** `grep -n '"/tdd for issue' templates/ralph-local.sh.tmpl` — one static prompt, no reason interpolation; compare it1's `failure_reason` with it2's prompt in any session log.

**Fix.** The engine keeps the last iteration's reason (it already has it in the variable it logs); the next `/tdd` prompt appends: *"Previous iteration failed acceptance with: <reason, truncated ~600 chars>. Address this FIRST, then continue the slice."* Cleared after a green iteration. (Composes with FU-26: reviewer findings already arrive via issue comment; this covers gate/build failures.)

**Acceptance.** Loop test: iteration N fails with a distinctive mock reason → iteration N+1's recorded prompt (mock `claude` logs prompts) contains it; green iteration → next prompt clean. Suite green.

---

## FOLLOW-UP 35 — `scenarios:*` label grammar is unvalidated: an unsupported form silently expands to ZERO scenarios  ·  **Severity: MEDIUM (a live near-miss)**

**Problem.** The expanders (post-FU-21) accept compact `scn-031+032`, spelled, and comma forms — anything else (live near-miss: a **range form `scenarios:scn-031..038`** created by a Day Shift agent at issue creation) expands to **empty** with no error. Downstream, empty expansion is catastrophic-but-quiet: Step 3's all-`@manual` branch ("nothing to execute, expected 0"), sibling-exclusion gaps, per-scn summaries with no rows. The live trap was caught by luck (a human watching the contract.validated event) and hot-swapped minutes before the gate read it.

**Verify:** `bash -c 'source templates/ralph-lib.sh; ralph_expand_scns "scn-031..038"'` → empty output, exit 0, no warning.

**Fix — fail loudly at every layer that meets the label:**
1. **Engine contract validation** (pre-iteration, where budget/labels are already checked): expand `$SCENARIOS`; if the label is non-empty but the expansion is empty → abort before iteration 1 with *"unparseable scenarios label '<value>' — canonical form is scn-NNN+NNN (see /to-issues)"*. Same fail-fast class as FU-18.
2. **`check-invariants.mjs`**: any `scenarios:*` token containing characters outside `[0-9+,scn-]` (e.g. `..`) → CONFIG-class failure naming the file and the canonical form.
3. Optional: `ralph_expand_scns` itself warns to stderr when it drops a non-empty segment (today it drops silently by design from #80 — keep the drop, add the warning).

**Acceptance.** A `scn-031..038` label: engine refuses pre-iteration with the actionable message; invariants flag it offline; canonical forms unaffected. Tests for both layers.

---

## FOLLOW-UP 36 — Engine PR title/body are placeholder-grade: `--title "fix #N"`, thin body — humans retitle by hand  ·  **Severity: LOW (review UX)**

**Problem.** The green path creates the PR with `--title "fix #$ISSUE_NUM"` and a body that carries iterations/scenarios/log-path but not the per-scenario outcomes or the issue's actual title. Both live PRs (belong #19, #21) were manually retitled and (for #19) re-bodied by the Day Shift. The result file has everything needed to compose a review-grade PR automatically.

**Verify:** `grep -n 'fix #\$ISSUE_NUM' templates/ralph-local.sh.tmpl`; belong PR #21's original title.

**Fix.** Title: `"$(gh issue view "$ISSUE_NUM" --json title --jq .title) (#$ISSUE_NUM)"` (sanitized/truncated). Body composed from `issue-<N>-result.json`: per-scenario ✅/🛑/📖 table, `ran/expected`, tokens consumed vs budget, reviewer severity + embedded report (FU-33's file), session log path, `Closes #N`. Keep it template-driven (a heredoc the consumer can tune).

**Acceptance.** Loop test asserts the created PR title contains the mock issue's title and the body contains a per-scenario line and `Closes #N`.

---

## FOLLOW-UP 37 — Operational UX of the graduated tooling: no `--resume`, fixed silence threshold, commit-delta miscount  ·  **Severity: LOW-MEDIUM (3 small fixes, one PR)**

**Problem (three live paper-cuts in `templates/ralph-isolated.sh` / `templates/ralph-watch.sh`).**
(a) **No resume mode:** every #15 resume was manual (`cd` into the kept worktree, re-source `.env`, relaunch, re-bind the watcher) — three times in one night. The wrapper refuses an existing worktree dir by design but offers no sanctioned re-entry.
(b) **Fixed silence threshold:** the watcher's `--silence-min` default (25) false-alerted on a perfectly healthy 36-minute first iteration (#16 it1 — first iterations are structurally the heaviest: full implementation). 
(c) **Commit-delta miscount:** live, the watcher reported `commits nuevos: 0` for an iteration that produced commit `5b7ac1a` (belong #16 it1, notification at 04:40:22Z). Suspected: delta computed against a `LAST_HEAD` captured at watcher start vs the poll's read ordering, or `rev-list` arg orientation — reproduce in a replay/E2E test with a fixture repo that commits between polls, then fix. The delta feeds the environmental-blocker heuristic (failing + 0 commits), so a miscount degrades the watcher's best signal.

**Verify:** (a) `./templates/ralph-isolated.sh <n>` against an existing dir → hard refusal, no alternative; (b)/(c) belong watcher transcript 04:28:56Z (false silence alert) and 04:40:22Z (delta 0 with 1 commit).

**Fix.** (a) `--resume` flag: validates the worktree exists + has the engine + `.env`, skips create/install, relaunches in place (prints the watcher re-bind hint). (b) Silence threshold: default higher for iteration 1 (e.g. 45) or adaptive (`max(25, 1.5 × longest completed iteration)`). (c) Fix the delta with a pinned test (replay mode + a real tiny repo fixture).

**Acceptance.** `--resume` re-runs in a kept worktree; no false silence alert on a long first iteration in the E2E test; delta test pins `commits: 1` for one commit between polls.

---

## FOLLOW-UP 38 — Two strategic decisions + the instrumentation to make them with data  ·  **Severity: decision (maintainer)**

**Problem.** Two flow-level gaps surfaced that need a maintainer ruling, plus one measurement gap that blocks principled optimization:
(a) **Slice-group execution model.** `/to-issues` PR-Group promises a cumulative branch + one `Closes #a #b #c` PR, but each Ralph run branches from `main` → sibling PRs conflict (live: belong #19 and #21 both touch `container.ts`/ports; the second to merge needs manual resolution). Options: **(a1)** document a "merge-before-next-sibling" cadence (HITL-friendly — `require-human-review` slices pause there anyway); **(a2)** support base-branch chaining (`ralph-isolated --base <prev-branch>` exists; the engine would need PR-base awareness + PR-Attr finding attribution). 
(b) **Input-token economics.** A full slice costs 150-250k measured, dominated by INPUT tokens (each session re-reads issue+skills+code from scratch; sessions are intentionally fresh). Candidate levers — skill-payload pruning for in-loop calls, `--continue`ing acceptance from the tdd session (context reuse vs contamination trade-off) — should NOT be attempted blind.
(c) **The instrumentation for (b):** the NDJSON has per-event cumulative/delta but no per-call breakdown event. Add `ralph.call.completed {call: "tdd"|"run-acceptance"|"code-review", tokens: N, duration_s: S}` — then one more live slice yields the data to decide (b) (and to validate FU-33's ~15k saving in production).

**Verify:** belong PRs #19/#21 overlapping files; measured anatomy in `/to-issues` Step 4 (FU-31) currently sourced from manual checkpoint subtraction.

**Fix.** (a) Record the ruling as a `core/13` subsection (or ADR) + align `/to-issues`' PR-Group text with the chosen model. (b) defer until (c) ships. (c) Emit the per-call event from `ralph_call_claude_with_retry`'s caller side; loop tests assert presence and shape.

**Acceptance.** A documented decision for (a) that `/to-issues` and the engine agree on; `ralph.call.completed` events in every session log with a pinned test; (b) explicitly deferred-with-data-plan, not silently dropped.

---

# Slice close-out batch 5 — FOLLOW-UPs 39–42 (from belong slice-02's /gates close-out, 2026-06-04)

**Context.** The first full `/gates` close-out on a real merged slice (belong PRs #17/#19/#21 → close-out PR #23: traceability-v0.2.0-final, lifecycle flips, the repo's first-ever all-green `check-invariants` + 38/38 full-suite BDD). Four NEW defect classes surfaced — all in the **close-out/merge phase**, a phase no previous batch exercised (every earlier batch died before merge). None blocks *starting* the next slice's spec pipeline; **40 and 41 should land before the next Night Shift run** (40 bites any slice-group with siblings; 41 bites every single PR-open). Forensics: belong PR #23, this conversation's close-out transcript, belong issues #14-#16 label history.

---

## FOLLOW-UP 39 — INV-3 rejects the `implemented` lifecycle state: a correctly closed-out feature breaks the invariant gate  ·  **Severity: MEDIUM (close-out blocker, workaround exists)**

**Problem.** The §58 feature lifecycle is `draft → clarifying → approved → implemented` (INV-8 itself *requires* `# status: implemented` features to be pinned to a `-final` matrix — the close-out flips them). But INV-3's approval check is a strict equality: `scnApproved[scn] = status === 'approved'` (`check-invariants.mjs` ~line 83). Flip a feature to `implemented` at close-out and **every scenario it contains becomes "non-approved"** for any issue file whose `**Labels:**` line still carries `ralph-ready` — INV-3 lists all of them as §58 violations. The two invariants contradict each other: INV-8 demands the very state INV-3 rejects.

**Live failure (belong close-out, 2026-06-04):** flipping the two slice-02 features to `implemented` produced `❌ INV-3 §63: scns in non-approved features (§58): scn-021 … scn-038` — all 18, every one of them human-approved and shipped. Workaround used: edit the issue file's `**Labels:**` line from `ralph-ready` to `ralph-done` (accurate bookkeeping — the GH issues had rotated — but it only *dodges* INV-3 by removing its trigger; the semantic bug stands).

**Verify:**
```bash
grep -n "status === 'approved'" scripts/check-invariants.mjs
# fixture: a ralph-ready issue file + a feature with `# status: implemented` → INV-3 fails
```

**Fix.** INV-3's check accepts the approved-or-later states: `status === 'approved' || status === 'implemented'` (`implemented` is post-approval by definition — a scenario cannot reach it without the human checkpoint). Keep `draft`/`clarifying` rejected. Add a fixture test: implemented feature + ralph-ready issue → INV-3 passes; draft feature + ralph-ready issue → still fails.

**Acceptance.** A close-out (features `implemented`, `-final` matrix present) passes INV-3 *and* INV-8 simultaneously without label-line edits; the regression fixture is in `check-invariants.test.mjs`.

---

## FOLLOW-UP 40 — Sibling slices' step definitions collide: 9 scenarios went AMBIGUOUS, detectable only after merge  ·  **Severity: HIGH for slice-groups (invisible until it bites)**

**Problem.** Step definitions are authored per-slice by `/tdd` (§61), on independent branches. Generic assertions — `the response has status {int}`, `the response is {int} with code {string}` — are needed by *every* slice, so each sibling's `/tdd` session reasonably defines them in its own `features/<ctx>/steps/*.ts`… reading **its own flow's World state**. Each branch is green in isolation. **The collision only exists after both siblings merge:** cucumber then sees multiple matching definitions and marks every affected scenario `ambiguous` (it refuses to guess).

**Live failure (belong, post-merge of PRs #19 + #21):** the first-ever full-suite run reported `38 scenarios (9 ambiguous, 29 passed)`. Two expressions were defined in BOTH `features/onboarding/steps/` (#15: reads `bag.statusHttp` / `world.lastError`) and `features/settlement/steps/` (#16: reads `bag.scn.httpStatus` / `bag.scn.result`). The `.feature` wording is human-approved and read-only (§58), so disambiguating by rewording is forbidden. Resolution used: ONE canonical definition in `features/support/response.steps.ts` resolving the **union** of both flows' World state (exactly one source is populated per scenario), duplicates deleted from both slice files → 38/38.

**Verify:** belong PR #23 (`features/support/response.steps.ts` + the two deletions); reproduce with any two step files defining `the response has status {int}`.

**Fix — three layers:**
1. **Convention (§61 addendum, in `skills/tdd/SKILL.md` + `core/12`):** *generic/cross-slice step expressions (response-status, error-code, and similar flow-agnostic assertions) live in `features/support/` as canonical shared definitions; slice step files define only slice-specific steps. When a shared step must read flow-specific World state, it resolves the union (document the one-flow-per-scenario guarantee).*
2. **Detection (cheap, in `/run-acceptance` pre-flight):** `$BDD_RUNNER --dry-run` (no World boot, ~1-2s) — any `Multiple step definitions match` → FAIL listing the colliding definitions. Catches the collision the moment it becomes visible in a checkout.
3. **Note the 38a interplay:** under base-branch chaining (38a-a2), the second sibling's branch CONTAINS the first's steps — the collision surfaces during that slice's own `/tdd`/gate instead of post-merge. Another argument recorded for the chaining ruling.

**Acceptance.** Convention documented in both files; the dry-run ambiguity check runs in `/run-acceptance` Step 1 with a test (fixture with two colliding step files → gate fails naming both); a slice-group merged with the convention produces zero ambiguous scenarios.

---

## FOLLOW-UP 41 — `ralph-done` is never provisioned at runtime: the PR-open label rotation half-fails silently on every adopted consumer  ·  **Severity: MEDIUM-HIGH (bites every successful run)**

**Problem.** #83 (FU-30a) provisioned labels in two places: `ralph-blocked` **just-in-time in the block path** (`ralph-lib.sh` `ralph_block_issue`, line ~1024 — the only `gh label create` in the shipped engine) and the full ready/done/blocked trio **in `/setup`** (adoption-time). The gap: consumers who adopt updates via **re-sync** (vendoring files — the normal upgrade path, never re-running `/setup`) get an engine whose green path runs `gh issue edit --add-label ralph-done --remove-label ralph-ready` with **no guarantee `ralph-done` exists**. `gh` fails that edit silently (or atomically drops the add): the issue loses `ralph-ready` and gains nothing.

**Live failure (belong #16, the historic first autonomous run, 04:58Z):** after `ralph.pr.opened`, the issue had **zero** ralph-* labels — `ralph-done` did not exist in the repo (verified at close-out: `gh label create ralph-done` succeeded as a NEW label on 2026-06-04). The morning state read as "neither ready nor done nor blocked" — semantically *worse* than not rotating at all, and invisible unless someone inspects labels.

**Verify:**
```bash
grep -n "label create" templates/ralph-lib.sh templates/ralph-local.sh.tmpl
# → exactly one hit (ralph-blocked, block path). The green path's rotation has no provisioning.
```

**Fix.** Mirror the block path's pattern: provision idempotently **just-in-time where each label is used** — `gh label create ralph-done --force …` immediately before the PR-open rotation (and `ralph-ready` before any re-add in resume guidance), OR provision all three at session start (contract-validation block; one-time cost ~3 API calls). Prefer just-in-time for symmetry with #83's existing choice. Extend the mock `gh` to fail `issue edit --add-label` for labels not previously created (pinning the real failure mode), and assert the loop test's green path creates `ralph-done` before rotating.

**Acceptance.** A fresh consumer repo (no ralph-* labels) running the loop to a green PR ends with the issue labeled `ralph-done`; the mock-gh enforcement makes the regression impossible to reintroduce silently; suite green.

---

## FOLLOW-UP 42 — `/setup` never installs the §60 CI surface: `@release` scenarios run nowhere after merge  ·  **Severity: MEDIUM (adoption class, same family as FOLLOW-UP 1)**

**Problem.** §60's contract: `@smoke` runs on every push (pre-push hook), `@release` runs **in CI before merge**, untagged fails CI. The framework ships the rule but **no artifact installs it**: `/setup` scaffolds no workflow, no pre-push hook for smoke, and `check-framework-metadata`/invariants don't notice the absence. Same "broken-on-adoption" class as FOLLOW-UP 1 (hooks) and #39/#41 (scripts): the rule promises behavior only `/feature`-discipline delivers locally.

**Live evidence (belong, 2026-06-04):** the repo's 38/38 green exists ONLY in local runs (Ralph's gate + Day Shift). Zero GitHub Actions workflows (`ls .github/workflows` → none). Three slices have merged with **no remote re-verification at merge time** — the human reviewer's checkout discipline is the only backstop. On a `require-human-review` flow the risk is contained, but §60 explicitly promises more.

**Verify:** `grep -rn "workflow\|\.github" skills/setup/SKILL.md | grep -i ci` → no CI scaffolding step; any adopted consumer lacks the workflow.

**Fix.**
1. Ship `templates/github-workflows/acceptance.yml`: on `pull_request` → checkout, node+pnpm setup, `pnpm typecheck`, `pnpm test`, `$BDD_RUNNER --tags @release` (testcontainers runs natively on `ubuntu-latest` — docker daemon present). **Gate external-sandbox tests by secret presence** (e.g. skip Stripe-sandbox integration specs when `STRIPE_SECRET_KEY` is absent, with a visible skip note) so the workflow is green out-of-the-box and consumers opt into sandbox CI by adding repo secrets.
2. `/setup` copies it into `.github/workflows/` + adds the §60 pre-push smoke hook to the hook-install step (pairs with FOLLOW-UP 1 — coordinate, don't collide).
3. **Docs nit to fold in (from the same close-out):** add to the skills' bash conventions: *never pipe a gate command into formatting (`cmd | tail`) — the pipe swallows the exit code; capture RC explicitly or use `set -o pipefail`.* Two live incidents in one day: a red `pnpm typecheck` piped to `tail` let a broken commit get pushed (caught and fixed forward, but the same pattern inside an unattended skill session would silently pass a gate).

**Acceptance.** A freshly `/setup`-ed consumer gets a green `acceptance.yml` on its first PR (sandbox specs visibly skipped without secrets); §60's three promises each map to an installed artifact; the pipe-exit warning lives where skills document bash usage.

---

## Suggested order

1. **Items 1 + 9** (adoption copy-list correctness) — highest real risk; same class (`/setup` copies the wrong set: misses hooks, ships framework-self skills). Do together — both edit `skills/setup/SKILL.md`'s copy logic.
2. **Item 2** (dangling refs) — quick, prevents future sessions chasing ghosts; pairs with item 7.
3. **Items 4, 5, 6** — small, mechanical/decisions; batchable in an afternoon (still **separate PRs** — different concerns).
4. **Item 3** (task_flow) + **Item 7** (CLAUDE.md) + **Item 8** (drift) — decisions; do once the maintainer rules on direction.
5. ~~**Items 12 + 13** (consumer Sonar)~~ — ✅ **DONE via #59** (root engine in `VENDORED_EXCLUSIONS` + `--write` emits both `.sonarcloud.properties` and `sonar-project.properties`). FOLLOW-UP 10 was already merged (#54). ~~**Remaining sliver:**~~ ✅ done via #74 — `/setup` now calls `compose-sonar-properties.mjs --write` and validates both files exist.
6. ~~**Items 14–17 (Night Shift kill chain)**~~ — ✅ **DONE** (#63, #64, #65+#66, #68) — see the PR map banner above.
7. ~~**Items 18–19** (pre-flight + budget accounting)~~ — ✅ **DONE** (#69, #70).
8. ~~**Items 20–22** (preflight filename matching, INV-5 compact labels, slug sanitization)~~ — ✅ **DONE** (#72, #73, #71).
9. ~~**Items 26–30 (batch 3)**~~ — ✅ **DONE** (#83 cumulative + #84; #85 resolved 32). Validated live: belong #16 was the first fully-autonomous issue→draft-PR run (2 iterations, engine pushed + opened the PR natively).
10. ~~**Items 33–38 (batch 4)**~~ — ✅ **DONE** (#86 docs + #87 cumulative; 38a ruled a2-chaining + implemented in #87, 38b deferred-with-data-plan, 38c shipped).
11. **Items 39–42 (batch 5 — slice close-out class; first /gates run on a real merged slice):** **41 first** (bites EVERY successful run: the PR-open label rotation half-fails silently on re-sync-adopted consumers), then **40** (HIGH for slice-groups: sibling step collisions are invisible until merge — convention + cheap dry-run detection; interplay with the pending 38a ruling recorded), **39** (INV-3 vs INV-8 lifecycle contradiction — small checker fix), **42** (adoption class: ship the §60 CI workflow + pre-push smoke; coordinate with item 1's hook-install step; fold in the pipe-exit-swallowing bash-convention warning). All four carry live forensics: belong close-out PR #23 + issues #14-#16 label history.

Each item: branch off `main`, fix, run the four gates, `Closes`/reference as appropriate, verify `MERGEABLE/CLEAN` before merge.
