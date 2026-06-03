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

## Suggested order

1. **Items 1 + 9** (adoption copy-list correctness) — highest real risk; same class (`/setup` copies the wrong set: misses hooks, ships framework-self skills). Do together — both edit `skills/setup/SKILL.md`'s copy logic.
2. **Item 2** (dangling refs) — quick, prevents future sessions chasing ghosts; pairs with item 7.
3. **Items 4, 5, 6** — small, mechanical/decisions; batchable in an afternoon (still **separate PRs** — different concerns).
4. **Item 3** (task_flow) + **Item 7** (CLAUDE.md) + **Item 8** (drift) — decisions; do once the maintainer rules on direction.
5. ~~**Items 12 + 13** (consumer Sonar)~~ — ✅ **DONE via #59** (root engine in `VENDORED_EXCLUSIONS` + `--write` emits both `.sonarcloud.properties` and `sonar-project.properties`). FOLLOW-UP 10 was already merged (#54). ~~**Remaining sliver:**~~ ✅ done via #74 — `/setup` now calls `compose-sonar-properties.mjs --write` and validates both files exist.
6. ~~**Items 14–17 (Night Shift kill chain)**~~ — ✅ **DONE** (#63, #64, #65+#66, #68) — see the PR map banner above.
7. ~~**Items 18–19** (pre-flight + budget accounting)~~ — ✅ **DONE** (#69, #70).
8. ~~**Items 20–22** (preflight filename matching, INV-5 compact labels, slug sanitization)~~ — ✅ **DONE** (#72, #73, #71).

Each item: branch off `main`, fix, run the four gates, `Closes`/reference as appropriate, verify `MERGEABLE/CLEAN` before merge.
