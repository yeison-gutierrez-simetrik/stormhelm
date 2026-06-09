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

---

# Multi-slice operation batch 6 — FOLLOW-UP 43 (the accumulate-and-drain queue, 2026-06-04)

**Context.** With batches 1-5 closed, the consumer's operating pattern evolves: the Day Shift specifies SEVERAL slices ahead (`/specify → … → /to-issues` per slice), `ralph-ready` issues ACCUMULATE across slices, and the Night Shift should drain the whole backlog unattended. The engine's queue mode is the right entry point — and its own source admits the missing piece. This is the last structural gap between "launch issues by hand, in order" and the fully-AFK multi-slice night the maintainer explicitly wants. Note: 38a (base-branch chaining) is now SHIPPED (`426010a`, the §123 Night Shift exception) — this item composes with it rather than re-litigating it.

---

## FOLLOW-UP 43 — Queue mode is dependency-blind: created-DESC order runs leaf dependents FIRST against an unmerged foundation  ·  **Severity: HIGH for multi-slice operation (the engine documents the gap itself)**

**Problem.** Queue mode (`templates/ralph-local.sh.tmpl`, the `if [ -z "$ISSUE_NUM" ]` block, ~lines 95-117) selects work with:
```bash
READY=$(gh issue list --label ralph-ready --state open --json number --jq '.[].number')
```
and iterates **in `gh issue list` default order: created DESC** — for a foundation-first decomposition (the only order `/to-issues` produces: root issue created first, dependents after), DESC is the **pessimal** order: the newest leaf dependent runs first, its gate fails against a missing foundation, budget burns until `ralph-blocked`, and the queue moves on to the next-worst choice. The engine *says so itself* — its ⚠️ comment (lines ~104-110) warns "processes in gh default order … you may wake up to ralph-blocked issues" and even points at the DAG machinery (`group-slice-issues.mjs` / `parse-layers-affected.mjs`) as the known fix direction. There is **zero** `Depends on` parsing anywhere in the engine (verify: `grep -ci depends templates/ralph-local.sh.tmpl templates/ralph-lib.sh` → 0).

**Live operating evidence (belong, slices 01-02):** every multi-issue run was launched **by number, manually, in dependency order** specifically to dodge this (#14 → then #15 → then #16); the maintainer's stated target workflow — "I finish slice 3, continue with slice 4, issues accumulate and Ralph takes them" — is exactly the pattern queue mode cannot yet serve safely.

**The assets ALREADY exist — this is assembly, not invention:**
1. Every `/to-issues` issue body carries a structured `## Depends on` section: `- #<N> (…)` per dependency, or `None (foundation)` for roots (the format is explicitly "structured `#N` so the grouping graph can read it").
2. GitHub knows dependency satisfaction: a dep issue `CLOSED` = its PR merged (the human gate passed).
3. 38a chaining is shipped: `--base <branch>` runs a sibling on top of an unmerged foundation's branch.
4. `ralph-done` (post-FU-41 reliably applied) marks "draft PR delivered, awaiting human merge" — the precise intermediate state chaining needs.

**Fix — dependency-aware eligibility in the queue block:**
1. **Fetch candidates WITH bodies** (one call): `gh issue list --label ralph-ready --state open --json number,body --limit 1000` (the FU-15 `--limit` lesson applies here too).
2. **Parse deps section-scoped:** extract `#\d+` ONLY from the `## Depends on` section of each body (never the whole body — `Closes #N`, scenario references and prose elsewhere would false-positive). `None (foundation)` or a missing section ⇒ no deps.
3. **Resolve satisfaction in one batched lookup** (`gh issue list --state all --json number,state,labels --limit 1000` → a number→{state,labels} map; never N×`gh issue view`).
4. **Two eligibility modes:**
   - **Default (merged-deps, conservative):** runnable ⟺ every dep is `CLOSED`. A dependent whose foundation has a draft PR awaiting human review correctly WAITS — that pause *is* the `require-human-review` gate.
   - **Chained (`RALPH_QUEUE_CHAINED=1`, opt-in):** a dep that is OPEN **but labeled `ralph-done`** also satisfies — the dependent runs `--base <foundation-branch>` (discover the branch from the dep's open PR: `gh pr list --state open --json headRefName,body --jq '.[] | select(.body | contains("Closes #<dep>")) | .headRefName'`). Composes with shipped 38a; default OFF because stacking unreviewed work is §123's *documented exception*, an operator's per-night choice — never silent default.
5. **Order the runnable set ASC by number** — foundations precede dependents by construction; also fixes the DESC footgun for fully independent issues.
6. **Skipped ≠ silent (the no-silent-caps rule):** per skipped issue, a stdout line AND an NDJSON event `ralph.queue.skipped {"issue": N, "blocked_on": [M, …], "mode": "merged-deps|chained"}` — the watcher can surface "3 queued, 1 runnable, 2 waiting on #25".
7. **Re-evaluate eligibility after each completed item** — in chained mode, a foundation that just delivered (`ralph-done`) unlocks its dependents within the same night.
8. **Fail-safe edges:** a dep referencing a nonexistent issue ⇒ treat as blocked + loud warning (never run on a broken graph); a dependency cycle (A↔B) ⇒ skip both + warning naming the cycle (never spin).

**Tests (mock-gh fixtures with issue bodies):**
- A(foundation, `None`) ← B(`#A`) ← C(`#A`, `#B`), created in order A,B,C: assert the old DESC order would have picked C; the new queue runs ONLY A, emits `queue.skipped` for B and C with the right `blocked_on`.
- Close A ⇒ B becomes runnable on the next evaluation; C still waits on B.
- Chained mode: A open + `ralph-done` + a mock open PR carrying `Closes #A` ⇒ B runs and the mock records `--base <A's headRefName>`; with the flag unset, B waits.
- Cycle fixture (A deps B, B deps A) ⇒ both skipped, warning names the cycle, queue exits cleanly.
- ASC pin: two independent issues created newest-first run oldest-first.

**Acceptance.** Queue mode never starts an issue with unsatisfied dependencies in either mode; the template's ⚠️ order-caveat comment is REPLACED by the real behavior's documentation (and `core/13`'s queue-mode section updated to describe accumulate-and-drain as the supported pattern); `RALPH_QUEUE_CHAINED` is documented next to the §123 exception it leverages; all fixtures above pinned; suite green. A consumer can then specify slices 3-4-5 by day, run `./ralph-local.sh` (or `ralph-isolated` per worker) by night, and wake to a topologically-ordered stack of draft PRs.

---

## FOLLOW-UP 45 — Vendored hooks are CJS with `.js` extension: silently broken under every `"type": "module"` consumer  ·  **Severity: MEDIUM-HIGH (silent — every hook invocation failed since adoption)**

**Problem.** The 5 hooks in `hooks/` use CommonJS (`require(...)`) with a `.js` extension. A consumer whose `package.json` declares `"type": "module"` (the modern default — belong does) makes Node load every `.js` under the project tree as ESM: each hook invocation dies with `ReferenceError: require is not defined in ES module scope` (surfaced as `PostToolUse hook error … cjs/loader:1423`). Because hook failures are NON-BLOCKING, this is invisible-but-total: belong ran since adoption with **zero functioning hooks** — no git-guardrails (C.10's mechanical enforcement!), no closed-set-check, no context-monitor — and nobody noticed until the operator asked about the recurring error line. Pairs with FOLLOW-UP 1 (hooks aren't even copied by /setup); this one says: when they ARE present, they must work regardless of the consumer's module type.

**Verify:** in any `type:module` repo: `echo '{}' | node .claude/hooks/context-monitor.js` → ReferenceError. Belong fix PR #28 (rename to `.cjs` + settings paths) → all 5 exit 0.

**Fix.** Ship the hooks as **`.cjs`** (forces CJS regardless of consumer type; zero code changes — belong validated all 5 run as-is) and update every reference: the framework's own `.claude/settings.json`, `/setup`'s copy step + settings wiring (coordinate with FOLLOW-UP 1, same surface), and any docs naming `hooks/*.js`. Add a metadata-gate or test asserting the shipped hook extensions match the settings references. Consumers that already renamed (belong) re-converge byte-identical.

**Acceptance.** A fresh `type:module` consumer has working hooks out of the box (`echo '{}' | node .claude/hooks/<each>.cjs` → 0); framework settings/docs reference `.cjs`; the FU-1 copy step (when done) copies the `.cjs` names.

---

## FOLLOW-UP 46 — Queue-mode operational gaps: branch-base drift between non-chained items; no queue-level observability; undocumented single-worker constraint  ·  **Severity: MEDIUM (bites the first multi-issue queue night)**

**Problem (three gaps, found by code-reading FU-43's shipped implementation before its first live run — fix them BEFORE they bite).**

**(a) Branch-base drift.** Per-issue branch setup is `git checkout -b "$BRANCH" ${BASE_REF:+"$BASE_REF"}` (`templates/ralph-local.sh.tmpl` ~line 327): with no `--base`, the branch starts at **current HEAD**. The queue loop invokes `"$0" "$n"` per item with NO reset between items — so after issue A completes (HEAD = A's branch tip), an **independent** issue B runnable in the same pass branches from A's tip: B's PR (base `main`) carries A's commits. Dependency-gated graphs don't hit it (serialization or explicit `--base` in chained mode), but the headline use-case — accumulated independent issues from multiple slices, drained in one night — produces polluted PRs on the SECOND item. Fix: between queue items, when the next item is non-chained, reset to the session's recorded start ref (`git checkout --detach <session-start-ref>`; record it once when the queue starts — do NOT re-fetch origin/main mid-queue, the night should be a consistent snapshot). Chained items keep their explicit `--base`. Pin with a loop test: two independent ready issues → second PR's branch contains zero commits of the first.

**(b) No queue-level observability.** `templates/ralph-watch.sh` binds per-issue (`${ISSUE}-*.log` glob): a queue night has no single monitoring surface, and the queue's own `ralph.queue.skipped` events (written to the queue-level NDJSON) are read by nobody. Fix: a `--queue` mode for the watch — glob `*-*.log` newest-first regardless of issue (the rebind-per-tick mechanism already exists, only the glob is issue-scoped), and ALSO tail the queue-level log so skips/cycles surface as notifications ("queue: 4 ready, running #27, skipped #29 (blocked on #27), #30 (blocked on #29)"). Replay mode should accept the queue log too.

**(c) Undocumented single-worker constraint.** Nothing claims an issue for a worker: two concurrent queue workers (`RALPH_WORKER_ID=w1/w2`) would both list the same `ralph-ready` set and double-process. Cheapest honest fix: DOCUMENT "one queue worker per repo; parallelism = explicit per-issue `ralph-isolated` launches" in `core/13`'s queue section + the template header. A label-based claim (`ralph-claimed:w1` applied before processing, cleared after) is the real fix if multi-worker queues are ever wanted — maintainer's call whether to build it now or document the constraint (recommend: document now, build when a consumer actually runs two queue workers).

**Verify:** (a) `sed -n '325,335p' templates/ralph-local.sh.tmpl` + the queue loop's recursion with no reset; (b) `grep -n 'ISSUE.*log' templates/ralph-watch.sh` → issue-scoped glob; `grep -rn "queue.skipped" templates/ralph-watch.sh` → 0; (c) `grep -rci claim templates/ralph-local.sh.tmpl` → 0.

**Acceptance.** (a) the two-independent-issues loop test pins clean PR bases; (b) `ralph-watch.sh --queue` follows a whole queue night and surfaces skip events (replay-tested with a fixture queue log); (c) the constraint is documented where queue mode is described (or claims implemented with a race test). Suite green.

---

# Batch 8 — slice-03-planning + slice-04 campaign retrospective (belong, 2026-06-05)

Context: one Day-Shift session ran slice-03's full upfront pipeline, then the slice-04 campaign
end-to-end (4 issues: 1 hitl + 3 Ralph chained via per-issue `ralph-isolated --base`; merge trains in
belong AND the adopted Python catalog repo; first cross-service E2E 13/13 incl. real Stripe). All
gates green; these five are the session's structural findings. Suggested order: 50 → 51 → 52 → 53 → 54
(50 is the load-bearing one; 51 is a one-liner that burned an iteration; the rest are independent).

## FOLLOW-UP 50 — §60 full-suite CI gate fails on approved-but-unimplemented scenarios: the status-aware acceptance scoping exists only consumer-side, and the obvious wrapper fix is a silent no-op under cucumber-js v12  ·  **Severity: HIGH (blocks every planning PR and every in-flight slice PR of any consumer that lands `.feature` files before implementation)**

**Problem.** The §58 lifecycle lands approved `.feature` files BEFORE their step definitions exist
(undefined-by-design until each issue's /tdd — core/12 even documents that dry-run exit codes lie for
this reason). But the §60 CI contract (`test:acceptance` → `cucumber-js --tags @release`) runs the FULL
feature set: every approved-but-unimplemented scenario is `undefined` → exit 1 → the planning PR that
introduces scenarios is red, and every subsequent in-flight slice PR stays red until close-out. Slice 02
never hit it (its CI arrived at close-out with everything implemented); slice-03's planning PR hit it
the first time CI saw an in-flight surface. belong fixed it consumer-side and the fix is NOT vendored
back: the framework still ships the gate that fails.

**The trap that invalidates the obvious fix (must be documented in the contract):** a wrapper script
that computes the implemented-only file list and passes it as CLI positional paths is a **silent
no-op** — cucumber-js v12 MERGES config `paths` with CLI paths (override is deferred to a future major;
it prints a deprecation notice and runs the union). belong's first fix shipped exactly that wrapper and
the full suite ran anyway. The narrowing must happen INSIDE the cucumber config (compute `paths` there,
behind an env flag).

**Live evidence:** belong PR #33 (planning PR, first red): run 26966545769 — `76 scenarios (38
undefined, 38 passed)` WITH the wrapper fix present (the no-op); run 26966875546 after moving the
filter into `cucumber.mjs` — `38 scenarios (38 passed)` + explicit `[cucumber.mjs] implemented-only
gate: skipping 2 in-flight feature file(s)` log. Working implementation to lift verbatim: belong
`cucumber.mjs` on main (commit 21aa2c1: `CUCUMBER_IMPLEMENTED_ONLY=1` env flag set by
`test:acceptance`/`test:smoke`; reads each feature's `# status:` header; skipped files logged to
stderr — never silent truncation). Side-discovery the same fix surfaced: slice-01's features were never
flipped to `# status: implemented` at close-out (pre-INV-8 legacy) and would have silently left the
regression surface — the gate makes the INV-8 flip load-bearing, so the docs must say so.

**Verify:**
```bash
git grep -rn "CUCUMBER_IMPLEMENTED_ONLY\|implemented-only" origin/main -- templates skills docs  # → no hits today
# Repro shape: any consumer repo with one implemented + one approved-no-steps feature; run the §60 gate.
```

**Fix.** (1) Ship a cucumber config template (or a documented config block) computing `paths` from the
`# status:` headers behind `CUCUMBER_IMPLEMENTED_ONLY=1`; `test:acceptance`/`test:smoke` set the flag
(plain invocations — the FU-44 pnpm `--` rule still holds). (2) core/12 §60: state the contract
explicitly — "the CI regression surface is `# status: implemented` features only; in-flight slices gate
per-issue via /run-acceptance's `--tags`; the close-out flip is the act of joining the CI surface
(INV-8)". (3) /setup + close-out skill: same statement (FU-17 anti-drift — gate, docs, and skill must
not diverge). (4) Document the cucumber v12 CLI-path-merge trap next to the config so nobody
re-implements the wrapper.

**Acceptance.** Fixture test: repo with implemented+approved features → gate runs only the implemented
one and exits 0, logs the skip; with the flag unset, full suite (both) runs. A fresh consumer's
planning PR (features-without-steps) passes §60 CI without manual fixes.

## FOLLOW-UP 51 — /setup's .gitignore block omits the Claude-harness runtime artifacts: a committed `.claude/scheduled_tasks.lock` cost a Night-Shift iteration (~92k tokens) to a BLOCKING reviewer verdict  ·  **Severity: MEDIUM-HIGH (one-line fix; silent until it burns an iteration)**

**Problem.** `skills/setup/SKILL.md` appends `.planning/`, `.claude/webfetch-cache/`, `.worktrees/` to
.gitignore — but not the other runtime files the Claude harness drops in `.claude/` during normal
operation (`scheduled_tasks.lock` observed live; `settings.local.json` is the same class). Any
`git add -A` (a pattern /tdd sessions use) sweeps them into a commit; the reviewer then correctly
blocks the PR for an untracked-runtime-artifact violation — a whole iteration spent on a file /setup
should have ignored on day one.

**Live evidence:** belong session `43-20260605-025715` iteration 1: outcome `acceptance-failing`,
reason verbatim: *"Remove the accidentally committed runtime lock .claude/scheduled_tasks.lock
(tracked, not gitignored; introduced by 3ba0b4f) and add it to .gitignore (§35/§76); reviewer verdict
BLOCKING"* — 92,649 tokens consumed before iteration 2 went green.

**Verify:**
```bash
git show origin/main:skills/setup/SKILL.md | grep -A6 "gitignore additions"   # block lacks .claude runtime files
```

**Fix.** Extend the heredoc: `.claude/scheduled_tasks.lock`, `.claude/settings.local.json` (and any
other runtime names the maintainer knows the harness writes). Consider the inverse pattern (`.claude/*`
+ explicit un-ignores for the vendored `skills/ hooks/ agents/ settings.json`) — maintainer's call;
the explicit-list version is the minimal safe fix.

**Acceptance.** Fresh /setup run → `git add -A` immediately after a harness session stages no
`.claude/` runtime files; fixture asserts the gitignore content.

## FOLLOW-UP 52 — reviewer.md MANDATES running `check-invariants.mjs`, but the agent sandbox refuses the invocation: the mandated step is structurally dead in consumers, silently downgraded to a "human should run it" caveat  ·  **Severity: MEDIUM (every sensitive-slice review ships with its invariant evidence missing)**

**Problem.** `agents/reviewer.md` line ~43: *"Before auditing, run `node scripts/check-invariants.mjs`.
Treat every ❌ as 🛑 blocking."* In live runs the reviewer's sandbox refuses the `node` invocation
(even read-only), so every report substitutes manual spot-checks plus a delegation note. The mandate
exists; the harness makes it unexecutable; nothing fails loudly — the gap travels as prose inside each
PR body. Two consecutive slices show the identical caveat.

**Live evidence:** belong PR #38 reviewer report, verbatim: *"`node scripts/check-invariants.mjs` was
blocked by the sandbox (the harness refused the `node` invocation even read-only)… **I could not run
the executable gate; a human or the Ralph loop should run it before merge**"*; belong PR #54 report
carries the same caveat.

**Verify:**
```bash
git show origin/main:agents/reviewer.md | sed -n '40,46p'   # the mandate
# vs. any consumer reviewer report: the sandbox-refusal caveat (belong PRs #38, #54 bodies)
```

**Fix (recommended).** Structured contract over agent shelling-out: the ENGINE runs
`check-invariants.mjs` once per gating pass (it already can — it's the same process that runs
acceptance) and injects the machine result (the script's line output, or better a `--json` mode) into
the reviewer's context; reviewer.md changes from "run it" to "read the injected result; missing result
= blocking finding". Alternative (weaker): grant the reviewer agent an explicit Bash allowance for
exactly that command — fragile across harness permission models, which is how this broke. Keep
reviewer.md + engine + core/13 in sync (FU-17).

**Acceptance.** A gating pass on a consumer repo produces a reviewer report whose invariant section
cites the actual gate output (fixture: mock engine injects a failing INV → reviewer must emit 🛑);
no report may contain the "could not run the gate" caveat.

## FOLLOW-UP 53 — slice-group merge-train hazards are undocumented: manual deletion of a stacked PR's base branch CLOSES the dependent PR irrecoverably; `--delete-branch` fails from detached HEAD  ·  **Severity: MEDIUM (one PR lost live; recovery = recreate + re-run CI)**

**Problem.** core/13 §123 documents the Night-Shift stacking model and merge ORDER (merge commits,
base merges first) but not the merge-train mechanics, and two of them bit live: (a) after merging the
root PR, deleting its branch MANUALLY (`git push origin --delete`) closes every PR based on it — GitHub
only auto-retargets dependents when the deletion happens AS PART of the merge; a closed PR with a
deleted base can be neither reopened nor retargeted (GraphQL refuses both). (b) `gh pr merge
--delete-branch` errors out entirely when the local checkout is on a detached HEAD ("could not
determine current branch"), which is exactly the state ralph-isolated worktree operation leaves the
main checkout in. The recovery (recreate the PR from the surviving head branch, re-run CI) costs a full
CI cycle and orphans the review history on the closed PR.

**Live evidence:** belong PR #52 (stacked on #51's branch) CLOSED by a manual base-branch deletion
post-#51-merge; `gh pr edit 52 --base main` → *"Cannot change the base branch of a closed pull
request"*; `gh pr reopen 52` → refused; superseded by recreated PR #55 (note in its body). The
detached-HEAD failure: first `gh pr merge 51 --merge --delete-branch` errored *"could not determine
current branch: failed to run git: not on any branch"* (the merge had succeeded server-side — the
failure was local cleanup, masking the result).

**Verify:** the two PR timelines above; GitHub's documented retarget-on-merge-deletion behavior.

**Fix.** (1) core/13: a "merge train runbook" paragraph — assert `MERGEABLE/CLEAN` structurally (the
existing lesson), merge with merge commit, then for each dependent: RETARGET FIRST (`gh pr edit
--base`), THEN delete the branch; never `git push --delete` a branch that is any open PR's base.
(2) Recommended: graduate a `templates/merge-train.sh <pr...>` that encodes the sequence (state
assertion, merge, dependent discovery via `gh pr list --base <branch>`, retarget, safe delete) — it
also mechanizes the older merged-at-UNSTABLE lesson in one place. (3) Note the detached-HEAD trap next
to `--delete-branch` guidance.

**Acceptance.** Runbook present in core/13; if the script ships: fixture with a mocked `gh` that
refuses deletion while an open PR bases on the branch, asserts retarget-before-delete ordering.

## FOLLOW-UP 54 — detect-ceremony runs at /to-issues with inputs that cannot exist yet (the /plan "Layers affected" format): every multi-module slice under-detects and needs a manual audited flip — 3 for 3 in this consumer  ·  **Severity: MEDIUM-LOW (conservative-by-design, but the detector has never once detected)**

**Problem.** `/to-issues` Step 2 says "don't eyeball the module count — derive it" via
`detect-ceremony.mjs` over the issue files. But the parser reads the `/plan` "Layers affected" format,
and at /to-issues time the plans DON'T EXIST YET (they're Step 9 of /feature; /plan is even deferred
past implementation-of-dependencies in real operation). Result: the detector returns
`{module_count: 0, labels: ["feature:single-module"]}` on every real slice doc, and the operator
hand-applies `feature:multi-module`/`cross-context` with an audited-flip note — slices 02, 03 AND 04 in
this consumer, 3 for 3. Under-detection is documented as "safe by design", but a detector that has
never fired isn't conservative, it's dead weight plus recurring manual ritual (signal class:
intervention-as-spec).

**Live evidence:** belong `node scripts/detect-ceremony.mjs issues/03-register-provider-agent.md` →
`{"module_count": 0, "labels": ["feature:single-module"]}` against a slice doc whose `### Layers`
section names 3 modules verbatim (same for issues/04). Manual-flip notes embedded in both local issue
files' label blocks.

**Verify:**
```bash
# any consumer slice doc with a "### Layers" / "- **Module:**" section:
node scripts/detect-ceremony.mjs issues/<slice>.md   # → module_count: 0
```

**Fix (recommended).** Teach the parser the slice-doc shape as a second structured input: a `###
Layers` block with a `- **Module:**` line (`Marketplace Backend → Onboarding, Auth, Catalog
Integration` ⇒ 3 modules) — it's already a de-facto structured contract in the slice template.
Alternative: re-sequence (provisional detection at /to-issues from `features/<ctx>/` dir count of the
approved scenarios + confirmation at /plan with mandatory label rotation per FU-49's body↔label rule).
Either way, /to-issues' "don't eyeball it" instruction becomes honest. Sync: script + skill + ADR-0002
note (FU-17).

**Acceptance.** Fixture slice doc (3 modules in `### Layers`, 2 contexts in approved features) →
detector emits `feature:multi-module` (+`cross-context` where the features/ dirs show ≥2); the
existing /plan-format fixtures stay green; /to-issues docs updated to name both input shapes.

---

# Slice-03 campaign stragglers — FOLLOW-UPs 55-56 + a correction to FOLLOW-UP 53 (2026-06-05)

**Context.** Two findings from the belong slice-03 campaign (2026-06-04/05) that batch 8 did not cover, plus a live-proven correction to FU-53's recovery claim. Forensics: belong PRs #35-#40/#48-#50, issues #42-#45.

---

## CORRECTION to FOLLOW-UP 53 — the dependent-PR closure is NOT irrecoverable (proven live, slice 03)

FU-53 states the base-branch deletion closes the dependent PR "irrecoverably; recovery = recreate + re-run CI". The slice-03 merge train hit the identical trap (belong #35 merged `--delete-branch` → GitHub closed #36/#37/#38) and recovered **all three PRs without loss and without recreating anything**:

```bash
# 1. restore the deleted base branch at its merged head sha (no checkout needed):
git push origin <merged-head-sha>:refs/heads/<base-branch>
# 2. reopen each closed dependent, then retarget it:
gh pr reopen <N> && gh pr edit <N> --base main
# 3. delete the restored branch again (now nothing depends on it):
git push origin --delete <base-branch>
```

Constraint discovered on the way: `gh pr edit --base` REFUSES on a closed PR, and `gh pr reopen` refuses while the base branch is missing — so the restore (step 1) must come first; the order is restore → reopen → retarget → delete. Worth folding into FU-53's core/13 documentation (and it makes the preferred prevention — retarget children BEFORE deleting the base — cheap to justify: the cure exists but is a 3-step dance).

**Verify:** belong #36/#37/#38 timeline 2026-06-04 ~23:12-23:14Z (closed on #35's merge, reopened+retargeted minutes later, all three merged with original CI history intact).

---

## FOLLOW-UP 55 — FU-47a's Sonar left-shift cannot see duplication: the QG's `Duplication on New Code` failed twice in one campaign and the density math punishes SMALL diffs hardest  ·  **Severity: MEDIUM (bites any consumer PR that repeats ≥1 boilerplate block; eslint structurally cannot catch it)**

**Problem.** FU-47a shipped `eslint-plugin-sonarjs` so the recurrent S-rule classes fail locally inside /tdd. That covers single-file rules (nested ternary, duplicated branches, optional chain) but **duplication density is cross-file and diff-relative** — lint runs per-file and cannot evaluate either. Two consequences proven live in one campaign:
1. **Retarget re-evaluation:** a stacked PR that absorbs its base (merge train advance) SHRINKS its "new code" denominator — belong PR #38 went from QG-passed to **3.8% > 3% duplication** after retargeting to main, with zero new commits.
2. **Small-diff density:** a surgical PR has a tiny denominator — belong PR #50 (85 insertions) hit **21.7%** from ONE 9-line mapping block repeated across two route files.

Both were resolved the same way (the only correct way): locate the real clones and extract them (`managed-agent-gate.ts`, `idempotencyInFlight()` in `result-to-http.ts`) — never threshold-fiddling. But the loop is post-PR each time: push → wait for analysis → fail → locate clones locally → extract → re-push (≈10-15 min + a CI cycle per hit).

**Live evidence:** belong PR #38 (Sonar comment "3.8% Duplication on New Code (required ≤ 3%)", resolved by commit `76c0139`); belong PR #50 (comment "21.7% Duplication on New Code", resolved by commit `894cf27`). Clone localization both times via ad-hoc `npx -y jscpd --min-tokens 70 <changed prod files>` — which found the exact blocks Sonar saw, locally, in seconds.

**Verify:**
```bash
# the gap: nothing in the consumer's local gates measures duplication
git -C <consumer> grep -ln "jscpd\|duplication" package.json eslint.config.js scripts/ .claude/skills/ | wc -l   # → 0
# the locator that worked twice (run on any consumer diff):
npx -y jscpd --min-tokens 70 $(git diff --name-only origin/main...HEAD -- 'src/**/*.ts' | grep -v __tests__)
```

**Fix — two halves, the second is the durable one:**
1. **Document the pattern** where FU-47a's left-shift is described (skills/setup Sonar section + core/13 HC2 ownership note): *duplication findings are resolved by extracting the clone, never by threshold changes; `npx -y jscpd --min-tokens 70 <changed files>` locates Sonar's clones locally; stacked PRs re-evaluate density on retarget — expect QG flips with zero new commits.*
2. **Left-shift the measurement** (recommended): an advisory duplication check before PR-open — e.g. `/run-acceptance` or the engine's pre-PR step runs the jscpd one-liner over the slice's changed production files and WARNS (not blocks) above ~3%. `npx -y` keeps the zero-deps convention (no package.json change); advisory keeps false-positive cost at zero while killing the post-PR discovery loop. If the maintainer prefers no npx-at-gate-time, half 1 alone is acceptable — mark that choice.

**Acceptance.** The Sonar adoption docs state the duplication-resolution pattern + the retarget re-evaluation caveat; if half 2 lands: a consumer slice with a deliberately duplicated 9-line block sees the warning BEFORE `gh pr create` (loop-test pin with a fixture diff), and a clean slice sees none. Framework gates stay green.

---

## FOLLOW-UP 56 — multi-repo slice-groups: cross-repo dependencies are inexpressible to the queue's dep grammar, and PR refs inside `## Depends on` parse as nonexistent ISSUES  ·  **Severity: LOW-MEDIUM today (the §63 hitl rule absorbed it); decision (maintainer) on the durable grammar**

**Problem.** Slice 04 is belong's first BI-REPO slice-group (belong #42-#45 + reform issues in `Belong-Universe/universe#46/#47`). Two grammar gaps surfaced in `ralph_deps_from_body` / the queue's eligibility logic:
1. **Cross-repo deps are prose-only.** belong #42's `## Depends on` carries "- Universe reform issues (…tracked in `Belong-Universe/universe`)" — the parser extracts same-repo `#N` only, so the queue cannot gate on universe#46/#47. The slice survived because #42 is `shift:hitl` (capability introduction, §63 Step 3b) — the human IS the cross-repo gate. That coincidence is load-bearing and nowhere stated.
2. **PR refs in the section parse as issues.** The same section says "(PRs #35-#38 — provider_agents anchor)" — the parser would extract #35..#38, `queue_state_of` looks them up as ISSUES (`gh issue list` doesn't return PRs) → MISSING → "depends on #35 which does not exist — treating as blocked". Loud-and-safe (never silent), but a ralph-ready issue whose author annotates a dep with PR numbers blocks the night with a misleading reason.

**Verify:**
```bash
gh issue view 42 --repo Belong-Universe/belong-marketplace --json body --jq .body | sed -n '/## Depends on/,/^## /p'
# parser behavior: source templates/ralph-lib.sh; <that section> | ralph_deps_from_body  → emits 35 36 37 38 (PRs-as-issues) and nothing for universe#46/#47
```

**Fix — present both, mark (a) recommended now:**
- **(a) Rule + hygiene (documentation, cheap):** in /to-issues + /plan + core/13: *`## Depends on` lists ONLY same-repo issue refs (`- #N`), one per line; cross-repo dependencies make the issue `shift:hitl` (the human gates the cross-repo state — generalizing §63 Step 3b); never cite PR numbers inside the section (annotate them elsewhere in the body).* Optionally the FU-49-style backstop also warns when a `## Depends on` ref resolves to a PR instead of an issue.
- **(b) Grammar support (build when a 2nd multi-repo consumer exists):** parser accepts `owner/repo#N`, `queue_state_of` resolves via `gh -R owner/repo`; chained mode necessarily excluded for foreign deps (no branch to chain). Costs cross-repo API calls per eligibility pass and a claim story per §63 — not justified by one consumer.

**Acceptance.** (a): the three artifacts state the same contract (the FU-17 anti-drift rule); a fixture issue whose Depends-on cites a PR number produces the explicit warning, not "nonexistent issue". (b) if ever built: diamond fixture with a foreign dep pins merged-deps-only gating. Suite green either way.

---

# Batch 10 — post-batch-8 session tail (belong, 2026-06-06): two gate-ergonomics findings with same-day live evidence

Context: the same session that filed batch 8 continued through the slice-04 deferred-findings night
(#56/#62 → PRs #63/#64, both 1-iteration green) and the merge train. Both findings below surfaced in
the final hour, while a PARALLEL session was mid-pipeline on slice 05 — the collision of those two
facts is itself the evidence. Order: 57 then 58 (independent).

## FOLLOW-UP 57 — INV-5 counts `@release` scenarios from `# status: draft` features: the gate is structurally red during the NORMAL /to-scenarios → /to-issues window, and any concurrent session/CI reading it gets a false alarm  ·  **Severity: MEDIUM (every feature passes through this window on every slice; multi-session operation makes it visible)**

**Problem.** `check-invariants.mjs` builds `releaseScns` from EVERY `.feature` file with no
`# status:` discrimination (the loop greps `@release` lines per file, header unread), then INV-5
demands an issue reference for each. But the §58 lifecycle GUARANTEES a window where `@release`
scenarios exist with no issues: between /to-scenarios (writes `# status: draft`) and /to-issues
(creates the issues, AFTER the human approval checkpoint). During that window the gate reports
`❌ INV-5 @release scns with no issue: scn-XXX…` for work that is exactly on-process. Single-session
operation never sees it (the same session runs /to-issues before invoking the gate); concurrent
sessions and any CI/cron invocation DO — and the red is indistinguishable from a real orphan.
Note the asymmetry with INV-3, which already discriminates by status (`status === 'approved' ||
status === 'implemented'`) — INV-5 simply never got the same treatment.

**Live evidence:** belong, 2026-06-06: session A merges PRs #63/#64, runs the gate on main →
`❌ INV-5 … scn-093..122` — those 30 scenarios belong to session B's slice-05 `.feature` files,
both headers `# status: draft`, /to-issues not yet run. Session A spent an investigation cycle
ruling out its own merges before attributing the red to B's mid-pipeline state.

**Verify:**
```bash
git show origin/main:scripts/check-invariants.mjs | grep -n -A4 "releaseScns"   # no status filter
# Repro: add a `# status: draft` feature with one @release scn and no issue → gate exits 1.
```

**Fix.** Status-discriminate INV-5 exactly like INV-3: collect release scns only from features whose
header is `approved` or `implemented` (drafts/clarifying are pre-checkpoint — no issues are EXPECTED
yet). Optionally report draft-file scns as an informational `⏭️ INV-5: N scns in draft features
(pre-checkpoint, exempt)` line so the window stays visible without failing. Keep the strictness for
approved features — an APPROVED scenario with no issue is the real defect INV-5 exists to catch.
Sync: script + the §59 doc sentence describing INV-5 (FU-17).

**Acceptance.** Fixture: draft feature + orphan @release scn → gate green with the informational
line; same feature flipped to `approved` → gate red. Existing INV-5 fixtures unchanged.

## FOLLOW-UP 58 — check-invariants prints failures only inline: any truncated capture (`tail -N`, CI log folding) shows "1 invariant(s) failed" without WHICH — recap failing lines after the summary  ·  **Severity: LOW (defense-in-depth for a documented, thrice-recurring operator error)**

**Problem.** The gate prints the per-invariant lines first and the `❌ N invariant(s) failed…`
summary LAST. The campaign's "never pipe a gate" lesson exists precisely because operators keep
capturing gates through `| tail -N` — and when they do, the tail keeps the summary but cuts the
inline ❌ line naming the failing invariant: the operator learns THAT it failed but not WHAT. Exit
codes are already correct; this is output-ordering ergonomics for the failure path of a
known-recurring misuse (3rd live occurrence on 2026-06-06: `… | tail -2` showed the failure count
while hiding the INV-5 detail line, costing a re-run).

**Verify:** any failing invariant + `node scripts/check-invariants.mjs | tail -2`.

**Fix.** After the summary line, re-print every ❌ line (a "failures recap" block). One loop over the
already-collected results; no contract change for green runs (recap only on failure). Update the
script's header comment to note the recap is part of the output contract.

**Acceptance.** Fixture: failing invariant → last N output lines contain both the summary AND the
named ❌ recap; green run output unchanged.

## FOLLOW-UP 59 — /clarify and /grill-me open question rounds cold: no orientation step exists between "read the spec" and "ask Q1", so the human signs contract-grade answers without shared context  ·  **Severity: MEDIUM (HITL answer quality — clarifications persist as audit-grade contracts; a disoriented answer is a wrong contract, not a wasted question)**

**Problem.** Direct operator feedback after 4 slices of live use (belong maintainer, 2026-06-06,
verbatim): *"cuando se hace el clarify podrían dar un contexto corto de lo que trata el slice y
aclarar nomenclatura clave antes de comenzar con las preguntas. No siempre estamos al tanto de lo
que hace el slice."*

The mechanism: `skills/clarify/SKILL.md` goes **Step 1 — Read with adversarial eye** (the AGENT
reads the spec) directly into **Step 2 — Ask targeted questions** (one per turn). There is no step
in between that shares what the agent just loaded. The first thing the HUMAN sees is a
multiple-choice question dense with FR-Ns, scn-NNNs, closed-set values and CONTEXT.md terms — all
presuming the spec is fresh in their head. The asymmetry is structural: the agent read the whole
spec seconds ago; the human may be days away from it, or it was authored by a different session
entirely. `skills/grill-me/SKILL.md` has the same gap at round start (its Step 3 quotes back
PREVIOUS answers, which helps mid-round, but nothing orients at Q1).

Blast radius: every HITL round of every consumer. These answers are not throwaway — /clarify
answers persist into the spec's **Clarifications log** (reviewer-citable contracts, §57/§22
findings if violated) and /grill-me answers become **ADR Considered Options**. The skills currently
spend zero tokens protecting the quality of the single human input they exist to collect.

**Live evidence:** belong slice-03 /clarify (2026-06-04) Q1 opened directly on `ProviderAgentState`
closed-set semantics; slice-04 /clarify (2026-06-04) Q1 on submit-vs-outbox-ordering internals —
both answerable only with full spec recall. The operator answered well *because the same sitting
had produced the specs*; the feedback arrived the first time the rounds were experienced at a
distance from the spec's authoring.

**Verify:**
```bash
git show origin/main:skills/clarify/SKILL.md | grep -cin "preamble|orientation|context summary"   # → 0
git show origin/main:skills/clarify/SKILL.md | sed -n '/### Step 1/,/### Step 2/p'   # no human-facing step between read and ask
git show origin/main:skills/grill-me/SKILL.md | grep -n "Step 3"                      # quotes back answers; no round-start orientation
```

**Fix.** Add a mandatory **Step 2a — orientation preamble** to `skills/clarify/SKILL.md`, with a
mirrored "round-start preamble" addition to `skills/grill-me/SKILL.md` Step 3. The preamble is a
structured three-part contract (structured > prose so it cannot degrade into a spec re-dump):

1. **What this slice does** — 2-4 lines in business language, LIFTED from the spec's "What changes
   after this ships" (quote, don't paraphrase — paraphrase invites drift).
2. **Key nomenclature** — ONLY the 3-7 CONTEXT.md terms / closed sets that the planned questions
   will use, one line each (`term — definition`). Not the whole glossary.
3. **Where we are** — one line: spec status, what prior rounds settled (counts suffice), what THIS
   round will decide.

Hard rules, stated in both skills: the preamble is informational (never a question, never skippable
by the agent); it does NOT count toward the question-count calibration (10-120); it is NEVER
persisted into the Clarifications log or grilling transcript (it orients, it is not a decision —
keep the audit artifacts decision-only). Recommended placement: emitted in the same turn as Q1, so
the flow stays one-question-per-turn.

Artifacts to keep in sync (FU-17 anti-drift): `skills/clarify/SKILL.md` (Step 2a + the example
flow), `skills/grill-me/SKILL.md` (Step 3 preamble), `skills/clarify/references/
clarifications-log-format.md` and `skills/grill-me/references/transcript-format.md` (both must
state the preamble is excluded from persistence).

**Acceptance.** Both SKILL.md files carry the three-part preamble contract with the
never-persisted / never-counted rules; the reference format docs explicitly exclude the preamble;
a doc example shows preamble → Q1 ordering in one turn. Consumer-visible outcome: a human
cold-opening a /clarify round can answer Q1 correctly without opening the spec — the orientation
travels with the question.
# Batch 13 — slice-05 execution + close-out retrospective (belong, 2026-06-07)

Context: the first full slice executed END-TO-END in one session arc — chained Night Shift
(#65→#68), Day-Shift Sonar sweeps DURING the night, a cross-service contract realignment, an E2E
phase extension (28/28 vs the real second service), and the close-out. Two incidents and four
structural gaps surfaced; all with live evidence in belong PRs #71-#78 and universe PRs #52-#56.
Suggested order: FU-60 (train guard) and FU-62 (double fidelity) first — both bit hardest.

## FOLLOW-UP 60 — `gh pr merge --delete-branch` on a stacked train's first merge deletes a branch that is the BASE of open sibling PRs → GitHub closes them irrecoverably; the FU-53 runbook covers only the manual-deletion path  ·  **Severity: HIGH (second live incident of the class; docs-only mitigation demonstrably insufficient)**

**Problem.** FU-53's resolution was a runbook in `docs/engineering/core/13` ("never manually delete
a base branch; retarget dependents first or delete only via merge"). The flag path was not covered:
merging the train's FIRST PR with `--delete-branch` deletes its head — which is the BASE of the
stacked siblings — and GitHub CLOSES those PRs. A closed PR with a deleted base cannot be reopened
or re-based (`Cannot change the base branch of a closed pull request`). Recovery = recreate PRs
from the (intact) branches, losing PR continuity (reviewer reports survive only on the closed
originals).

**Live evidence:** belong train 2026-06-07 — `gh pr merge 71 --merge --delete-branch` (head
`agent/...-an-65`, the base of #72/#73) → #72/#73 CLOSED; recovered as #76/#77; matrix
`docs/audit/traceability-v0.5.0-final.md` records the supersession. First incident: slice-04 #52
(manual deletion). Two incidents, two slices.

**Verify:**
```bash
# any repo: stack B on A, merge A with --delete-branch, observe B close;
# then: gh pr edit B --base main  →  "Cannot change the base branch of a closed pull request"
```

**Fix.** Tooling, not more prose (the runbook existed and the operator still hit the variant):
a vendored `scripts/train-merge.mjs <pr>` (or a `merge_train` helper in ralph-lib.sh) that, BEFORE
merging: (1) `gh pr list --base <headRef> --state open` — if non-empty, retarget each dependent to
the merging PR's base (`gh pr edit N --base <target>`) and only then merge with `--delete-branch`;
(2) assert MERGEABLE/CLEAN in the command. Document in core/13 that bare
`gh pr merge --delete-branch` is FORBIDDEN inside a slice-group train. Runbook stays as the why;
the helper is the how.

**Acceptance.** Fixture test: repo with stacked PRs (mock gh bin) — train-merge retargets the
dependent before deletion; the dependent PR remains OPEN after the first merge. Consumer outcome:
a 4-PR train merges top-down with zero closed siblings.

## FOLLOW-UP 61 — chained-queue multi-dep integration base: sibling divergence (a dep branch advancing AFTER a later sibling chained from its older tip) makes the queue's integration-base merge CONFLICT and skip the issue, with no reconciliation recipe in the event or docs  ·  **Severity: MEDIUM (any Day-Shift push to an in-train branch triggers it; the skip is correct but a dead end)**

**Problem.** FU-46/FU-46a gave multi-dep issues an integration base built by merging dep branches.
When the Day Shift pushes to dep branch A (e.g. a Sonar dedup) AFTER sibling B already chained from
A's older tip, A and B diverge on the same files; the queue's integration-base merge for a later
multi-dep issue conflicts → `ralph.queue.skipped` ("dep branches CONFLICT on the integration base
(siblings diverged; reconcile before this issue can run)"). Correctly conservative — but the event
names neither the branches nor the files, and no documented recipe exists. The operator had to
diagnose from scratch.

**Live evidence:** belong queue log 2026-06-06 (`ralph-queue-slice05.log` tail): issue #68 skipped
after commit `4b67d82` (Day-Shift dedup on `...-ve-66`) diverged from `...-de-67` (chained earlier
from `f93833d`). Reconciliation that worked: merge A's tip INTO B (commit `ad30bd9` on the de-67
branch, conflict resolved keeping both sides), push, relaunch the issue.

**Fix.** (a) Event payload: `ralph.queue.skipped` for this cause should carry
`{dep_branches: [...], conflict_files: [...]}` (the engine just attempted the merge — it HAS this
from `git merge` output); the human-readable line prints them. (b) core/13 runbook: "sibling
divergence reconciliation" = merge the advanced dep tip into the diverged sibling (newest-into-
oldest, topological), resolve keeping both sides' intent, push, relaunch the skipped issue
(single-issue mode rebuilds the base clean). (c) optional, `decision (maintainer)`: an
auto-reconcile attempt (try the merge; only skip on REAL conflict after auto-merge) — recommend
(a)+(b) now, (c) only if a third incident shows the manual recipe is toil.

**Acceptance.** Fixture: two dep branches with a forced divergence → the skip event carries
branches+files; docs name the recipe. Consumer outcome: the next sibling-divergence skip is
self-service from the event text alone.

## FOLLOW-UP 62 — the in-repo service double can silently drift from the ADR-pinned contract: 30 BDD scenarios ran green against invented routes and wrong response bodies; nothing checks double↔contract fidelity  ·  **Severity: HIGH (false-green acceptance for any cross-service slice; the whole point of the double is the contract)**

**Problem.** The slice-05 night built the Universe double from the ISSUE text, not the ADR
contract, and drifted: invented routes (`POST /api/v1/discover/listings`,
`GET /api/v1/discover/listings/:ref` — the real surface is `POST /api/v1/discover/search` +
`GET /api/v1/listings/{uuid}`), a wrong path (`/submit-verification` vs `/submit-for-verification`),
a wrong field (`provider_agent_ref` vs `agent_external_ref`), and token bodies (`{result:
"published"}`) where the real service returns the entity representation + `{detail, reason_code}`
errors. All 30 scenarios stayed green because the belong adapter was written against the SAME
wrong double. Only the cross-service E2E exposed it (the adapter would have infinite-retried
against the real service: 2xx-with-entity parsed as malformed → CATALOG_UNAVAILABLE).

**Live evidence:** belong close-out commit `f220596` (the realignment diff: double + adapter), E2E
evidence `e2e/slice-05-e2e-result-20260607.txt` (28/28 only AFTER realignment), universe#56
(machine reason codes added to make the response contract §19-clean).

**Fix.** Structured contract over prose, two layers: (1) NOW — a reviewer (§114) rule + /plan
template line: every route a double registers MUST cite the ADR/contract line it mirrors, and the
reviewer greps the double's route table against the ADR amendment's endpoint list (a mismatch or
an uncited route = should-fix). (2) END-STATE (`decision (maintainer)`) — the §103 module-contract
artifact (`openapi-spec.yaml`) becomes the single source: a vendored
`scripts/check-double-fidelity.mjs` lints the double's registered routes/methods against it, and
the adapter's paths too. (2) is the FU-of-record's real ask; (1) is the cheap interim.

**Acceptance.** A double registering a route absent from the contract file fails the check; the
slice-05 drift (all four mismatches) reproduces as failures against the slice-04/05 contract.
Consumer outcome: a green BDD suite implies the double speaks the pinned contract.

## FOLLOW-UP 63 — §61 use-case-direct steps cannot see HTTP serializer gaps: two console-surface fields were dropped (view + route both) while the "reason observable" scenarios stayed green; observability FRs need a surface-level assertion rule  ·  **Severity: MEDIUM-HIGH (a §19 value-discriminated field silently absent from the API is a spec violation BDD blessed)**

**Problem.** §61 steps invoke use cases directly — correct for speed/isolation, but the HTTP route
re-serializes views FIELD BY FIELD, and a field the spec demands observable (`lastTransitionFailure`,
spec 05 FR-11/C1 "fails with the reason observable") was dropped twice: by the use-case view AND by
the route serializer. scn-102/105 asserted via the anchor/use case and stayed green; the E2E
phase-C (`C4b`) caught it against the real HTTP surface.

**Live evidence:** belong commits in close-out PR #78 (read-listing view + listings.routes
serializer + ListingDetailView type); E2E run 17/18 → 28/28 across the fix.

**Fix.** Two complementary contracts: (1) TypeScript-structural (capability stack rule,
typescript-hono/09): route response literals MUST be declared `satisfies <ViewType>` (or spread
the view object and only ADD transport fields) — a dropped field becomes a compile error, killing
the field-by-field re-serialization class entirely. (2) §61 addendum: an FR whose verb is
"observable from the console/API" gets at least ONE assertion through the HTTP boundary (a route
test or an `app.request`-level step), not only the use-case return. State the rule in BOTH the
skill (/tdd) and the docs (§61 section) — FU-17 anti-drift.

**Acceptance.** A route serializer omitting a view field fails typecheck in the template stack;
reviewer flags observability FRs lacking a surface-level assertion. Consumer outcome: "observable"
in a spec provably means observable over HTTP.

## FOLLOW-UP 64 — single-issue Ralph runs open the PR with base=main even when the issue declares deps: review diff and Sonar new-code measure the whole accumulated stack, not the issue's delta  ·  **Severity: MEDIUM (attribution noise on every recovered/standalone multi-dep run)**

**Problem.** Queue-chained runs pass `--base <prev sibling>`; a SINGLE-issue run
(`./ralph-local.sh 68`) builds its integration base from `## Depends on` for the WORK, but opens
the PR against `main`. The PR diff (and Sonar's new-code period) then spans every unmerged dep —
in the live case PR #74 showed #65+#66+#67+#68 and its Sonar QG failed on duplication that belonged
to (and was already fixed on) a DEP branch, costing a diagnosis cycle.

**Live evidence:** belong PR #74 (base `main`, QG ERROR 4.4% from pre-dedup dep code; fixed by
merging the dep tip `be09d51` into the head — the QG then passed with zero head-side changes).

**Fix.** At PR-open time, when `deps_from_body` is non-empty: if the dep set forms a chain
(topological order exists), `--base <topologically-last dep branch>`; if it does not (true
multi-root), keep `main` but the engine PREPENDS a body note "diff spans unmerged deps #a/#b —
review the last commits" and (optional) labels `stacked-diff`. The chain case covers every
slice-group; the note covers the rest honestly.

**Acceptance.** Mock-gh fixture: single-issue run with one dep → PR created with the dep branch as
base; with two divergent roots → base main + the body note. Consumer outcome: Sonar new-code on a
recovered sibling measures only its own delta.

## FOLLOW-UP 65 — post-PR Sonar sweep is undocumented manual ritual: QG status + open issues via the API token were hand-curled 5+ times across two campaigns; the recipe belongs in a vendored tool  ·  **Severity: MEDIUM (every require-human-review PR repeats it; FU-55's left-shift covers duplication pre-PR but not the post-PR QG/issue read-out)**

**Problem.** The Day Shift's per-PR routine (read QG conditions, list open issues with rule/file/
line, re-poll after a push) is pure API mechanics repeated by hand: slice-04 #54 (2 real findings),
slice-05 #71 (4 issues), #72 (QG dup 5.7%), #73 (QG dup 6.7% + per-file `new_duplicated_lines`
sweep to locate clones), #74 (QG dup 4.4%). Each time: same curl shapes, same `periods[0].value`
parsing pitfall (one sweep silently read all-zeros from a wrong key and cost a re-diagnosis).

**Live evidence:** belong session 2026-06-06/07 transcripts; matrix v0.5.0-final "Sonar" section;
`SONARQ_TOKEN` already provisioned in the consumer's `.env`.

**Fix.** Vendored `scripts/sonar-sweep.mjs <pr-number>`: reads `SONARQ_TOKEN` + the
`sonar-project.properties` projectKey; prints (a) QG status + failing conditions, (b) open issues
(severity/rule/file:line/message), (c) `--files` mode: per-file new_duplicated_lines (the
clone-locator). Exit 1 on QG ERROR (pipeable into the train guard, FU-60). NOT a merge gate by
default — the analyzer is post-PR and HC2-owned (04 precedent); it is the standard read-out tool.
Reference it from /run-acceptance's "post-PR" note and core/13's train runbook.

**Acceptance.** Mocked Sonar API fixture: sweep prints conditions+issues and exits 1 on ERROR;
`--files` locates a seeded dup. Consumer outcome: the next QG failure is one command, not six
curls.

---

## FOLLOW-UP 66 — foundation / schema-only slices have no first-class track: a Tier-0 substrate slice (no use case, no API) must shoehorn structural invariants into use-case Gherkin (§61 exception) AND override INV-6 because detect-ceremony reads table-ownership as multi-module  ·  **Severity: decision (maintainer) — recurring-by-design friction, not a bug; two facets, one root**

**Context.** belong slice 06 "schema foundations" (issue #80, PRs #81 `e79f206` + close-out #82 `4c8b956`, shipped v0.6.0-final 2026-06-09) was the first **pure schema substrate** slice: it lands 8 net-new tables (`msas`, 5× `sow_*_details`, `service_scopings`, `reviews`) + a behavior-preserving reshape of one live table (`integration_events`), with **zero business behavior** — no use case, no endpoint, no read path. The whole framework BDD+classification chain assumes a *behavioral* scenario (an actor invokes a use case, an observable result), so a foundation slice has to improvise the same two workarounds, and every future migration-only / substrate slice will repeat them.

**Problem — facet A (acceptance / §57-§61).** `/to-scenarios` + §61 assume each scenario maps to a use case the step definition reuses ("step defs reuse the use case directly, not HTTP"). A schema slice has **no use case** — its contract is structural (a UNIQUE/CHECK rejects a row; a migration applies + rolls back; a table exists with exactly these columns). Consequences observed:
- The 14 acceptance scenarios (scn-123..136) became cucumber step defs that probe the shared World DB / `information_schema` directly and assert via caught DB errors — a **documented §61 exception** the implementer had to invent and justify in `/plan` ("schema scenarios have no use case to reuse; steps operate on the shared World DB handle"). The reviewer *accepted* it as correct, which means §61 already tolerates this — but there is no documented pattern, so each consumer re-derives it.
- The migration up/down idempotency scenario (scn-123) **cannot run against the shared acceptance World DB** (rolling its schema back would corrupt every other scenario), so the step had to **spin its own ephemeral Postgres** inside the When step. That works but is undocumented and heavy (a container per such scenario).
- Net: the structural facts are ALSO covered by fast vitest integration tests (real Postgres, real constraints) — so the cucumber layer is largely duplicate ceremony for a schema slice. There is no guidance on whether a substrate slice should have @release Gherkin at all, or whether structural invariants belong in a different (vitest/migration-test) acceptance lane that still pins a scn-NNN for traceability.

**Problem — facet B (classification / detect-ceremony / INV-6).** `scripts/detect-ceremony.mjs` counts bounded contexts from the issue's `### Layers` `**Module:**` line. A schema substrate lands tables OWNED by several modules (here: Contract Engine / Service Scoping / Reputation / Settlement), so the detector returns ≥2 contexts → `feature:multi-module` / `cross-context`. `INV-6` then flags escalation ("declared single-module, plan detects multi-module") and **blocks** unless overridden — even though the slice has **zero runtime cross-module coupling**, ships **no API**, and **no §103 module contract is possible** (there is nothing to parallelize across teams). The only resolution was a documented override:
```
skip-invariant: INV-6 — schema-only substrate. The detector counts ≥2 bounded contexts because the
migration lands tables OWNED by 4 modules … but the span is PERSISTENCE-ONLY: one migration, no API
surface, no runtime cross-module coupling, no §103 module contracts … Deliberately single-module.
```
The reviewer judged the override "honest, not a mask." But it will be needed on **every** schema-substrate slice that touches >1 module's tables — i.e. recurring toil, and a signal that the classification model conflates "vocabulary spans N contexts' tables" (true, persistence-only) with "multi-module behavioral feature needing the §107 ceremony" (false here).

**Live evidence.**
- belong `issues/06-schema-foundations.md` — the `## Plan` §61-exception text + the `skip-invariant: INV-6` line.
- belong `docs/specs/06-schema-foundations.md` (Released) — the `pending-promotion` block arguing single-module for a schema substrate.
- belong `features/{contract-engine,service-scoping,reputation,settlement}/steps/*schema*.steps.ts` — the no-use-case step defs (World-DB probes, `information_schema`, an ephemeral-Postgres `startPostgres()` inside scn-123's When).
- belong vitest `…/drizzle/schema/__tests__/schema-foundations.test.ts` + `…/migrations/__tests__/schema-foundations-migration.test.ts` — the same facts covered fast, making the cucumber layer duplicate.
- belong `docs/audit/traceability-v0.6.0-final.md` — records the §61 exception + INV-6 override as close-out evidence.
- `node scripts/check-invariants.mjs` on belong main: INV-6 shows `OVERRIDDEN` with the reason; all others pass.

**Verify (against belong main, where the slice shipped):**
```bash
# detect-ceremony classifies a schema-only slice as multi-module from table ownership
node scripts/detect-ceremony.mjs issues/06-schema-foundations.md   # → ≥2 contexts
# INV-6 needs the override to pass
grep -n "skip-invariant: INV-6" issues/06-schema-foundations.md
# the §61 exception + ephemeral-DB scenario
grep -n "no use case\|startPostgres\|information_schema" features/*/steps/*schema*.steps.ts
```

**Fix (decision — two viable directions, present both).**
- **Option A — name the track, keep the escape hatches (recommended, low-cost).** Document a **"foundation / schema-only slice"** pattern in the BDD + ceremony docs: (1) §61 gains an explicit *structural-assertion* sub-pattern — a substrate slice's scn-NNN may be satisfied by an integration/migration test (not a use-case step), still pinned to the scenario for traceability; `/to-scenarios` may tag such scenarios `@structural` and `/plan` records the no-use-case rationale from a template instead of the implementer inventing it. (2) `INV-6` documents **"schema-only substrate spanning multiple modules' tables, persistence-only"** as a *canonical, pre-blessed* `skip-invariant` reason (or `detect-ceremony` learns a `persistence-only` signal: a slice whose `### Layers` has `API: none` + `MCP/CLI: none` + no use-case files is NOT multi-module-for-§107-purposes even if its tables span contexts). This makes the override a named recipe, not a per-consumer rediscovery.
- **Option B — first-class substrate slice type.** Add a `slice-type: schema-foundation` (or `tier:0`-derived) classification that `/to-issues` emits, which auto-exempts the slice from the §107 multi-module ceremony (no SAD, no module contracts, no multi-actor/capacity sections) and routes its acceptance to a structural lane. Heavier (new label + detector + skill branches) but removes the override + §61-exception entirely.

Recommended: **Option A** — it is documentation + one detector/INV refinement, lifts the exact friction belong hit, and keeps the conservative "over-classification is safe" default intact (the override just becomes blessed-and-cheap).

**Acceptance.** A fresh consumer's first schema-only / migration-foundation slice: (1) has a documented acceptance pattern for structural invariants (no improvised §61 exception, no surprise that the shared World DB can't host a migration up/down scenario), and (2) passes `check-invariants` without the implementer discovering INV-6 + authoring a bespoke `skip-invariant` reason — either via a pre-blessed canonical reason string the docs name, or via `detect-ceremony` recognizing persistence-only slices. Pin with a `scripts/__tests__/detect-ceremony.test.mjs` fixture (a schema-only multi-table-owner issue → not flagged, or flagged-but-with-the-canonical-skip documented) and a BDD-doc reference a reviewer can cite.

**Not framework (recorded for honesty, fix is belong-local):** the heaviest manual toil this session — `drizzle-kit generate` requiring a TTY to resolve column renames (piped input errors; `expect` keystrokes mis-fire on the TUI redraw) — is **drizzle-kit tooling, not Stormhelm**; handled belong-side (rename-isolated generate + hand-edit the SQL; snapshot records only final columns so it stays correct) and recorded in belong memory. No FU.
