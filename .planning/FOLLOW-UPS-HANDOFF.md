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

## Suggested order

1. **Items 1 + 9** (adoption copy-list correctness) — highest real risk; same class (`/setup` copies the wrong set: misses hooks, ships framework-self skills). Do together — both edit `skills/setup/SKILL.md`'s copy logic.
2. **Item 2** (dangling refs) — quick, prevents future sessions chasing ghosts; pairs with item 7.
3. **Items 4, 5, 6** — small, mechanical/decisions; batchable in an afternoon (still **separate PRs** — different concerns).
4. **Item 3** (task_flow) + **Item 7** (CLAUDE.md) + **Item 8** (drift) — decisions; do once the maintainer rules on direction.
5. **Items 12 + 13** (consumer Sonar, follow-ons to the merged #54/FOLLOW-UP 10) — do together; both touch the composer's Sonar output. **13 first** (it's load-bearing: writing to `.sonarcloud.properties` is what makes ANY composed exclusion take effect for Automatic-Analysis consumers — without it, 12 is also a no-op there), then 12 (add the root Night Shift files to `VENDORED_EXCLUSIONS`). FOLLOW-UP 10 is already merged — leave it as-is.

Each item: branch off `main`, fix, run the four gates, `Closes`/reference as appropriate, verify `MERGEABLE/CLEAN` before merge.
