# fix(ralph): batch-21 — classification + delivery gates (FOLLOW-UPs 87, 88, 89)

Processes the belong auto-pilot slices 16–17 batch under the v2 STRICT rubric. All three claims reproduced against `main` first. FU-88 and FU-89 were escalated as maintainer decisions (Step 3a) and implemented per the rulings. Docs-handoff ledger PR: #123.

One commit per FU; cumulative branch per §123 (no shared-region conflicts).

## FU-87 — `packages/` + `src/test-support` are not bounded contexts · IMPLEMENT (corrected)

**Reproduced:** `detect-ceremony.mjs` `NON_APP_ROOTS` lacked `packages` and `test-support` (belong slices 16/17: `module_count` 3 and 7, `context_count` 1 → false multi-module, forcing a per-file `skip-invariant: INV-6` on the most common slice shape).

**Deviation from the literal FU:** adding `test-support` to `NON_APP_ROOTS` alone would not work — `src/test-support` carries `segs[0]==='src'`, so the bare-`segs[0]` check never excludes it. Fix: add both roots **and** generalize the exclusion to peek one level under `src/` (the effective root of `src/test-support/x` is `test-support`, of `packages/cli` is `packages`). A real layer (`src/domain/…`) is never a `NON_APP_ROOT`, so the peek is transparent — the special case dissolves into the existing mechanism (same class as FU-70/78). The reviewer's live re-detect stays the one-way backstop for a rare real context under `packages/`.

## FU-88 — skill-doc delivery gate (§125), spec-FR enforced against the diff · IMPLEMENT (maintainer decision)

**Reproduced:** no skill-doc enforcement in `check-invariants.mjs`. A spec FR "Skill doc `<name>` extended" ships green when skipped — acceptance can't see a missing Markdown file — caught only by the §114 reviewer (belong PR #146 lone REQUIRED; #147 one of six).

**Maintainer ruling:** a diff-aware gate at acceptance, firing only when the spec/issue declares a skill-doc as an FR-deliverable; named `spec-FR ⇒ gate`. The FU's Option A (an invariant in `check-invariants.mjs`) does **not** fit — that script is artifact-only and never diff-aware; making it run `git diff` would break its offline, repo-agnostic model. So the gate is its own consumer-runtime script `scripts/check-skill-doc-delivery.mjs`, and the engine flips a green-but-doc-skipped acceptance to not-green **before** the reviewer, feeding the next `/tdd` so Ralph writes the doc itself (no human round-trip). Contract named in three places (FU-17): the spec FR token ⇒ the gate ⇒ the `/tdd` feedback. Fires only on an explicit declaration (`na` otherwise — no-op for the majority case). New rule **§125**; `/setup` copies the script. **Reference:** Danger.js "changed X ⇒ must change Y", made deterministic.

## FU-89 — lifecycle-edge completeness nudge · IMPLEMENT (maintainer decision, lightweight)

**Maintainer ruling:** the lightweight option, not structural exhaustive generation. `/to-scenarios` Step 3b adds a completeness **prompt**: for each closed-set-status entity, ask whether option-set integrity / per-transition precondition / double-action idempotency / empty-oversized input applies, and add the scenario where it does. Auto-pilot stays happy-path-biased by design and the §114 reviewer remains the designated backstop — the nudge converts the common, cheap misses (belong slice 17 shipped 4 such bugs green) into RED `/tdd` scenarios without mandating a brittle exhaustive cross-product. Docs-only; no new §N (deliberately kept as guidance, not a hard rule).

## Gates

- `check-framework-metadata.mjs` rc=0 ✅
- `check-invariants.mjs` rc=0 ✅
- `sync-closed-sets.mjs --check` rc=0 ✅
- `node --test scripts/__tests__/*.test.mjs` rc=0 ✅ (190 tests; +3 FU-87, +4 FU-88 unit, +3 FU-88 engine)

All rc values captured unpiped.

⚠️ Left open for maintainer review — not merging.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
