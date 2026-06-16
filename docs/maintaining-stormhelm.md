# Maintaining Stormhelm (framework-internal)

> This doc is for people working **on** Stormhelm itself — not for projects that adopt it. Adoption copies `.claude/` (skills, agents, hooks), `docs/engineering/`, and the consumer-runtime `scripts/`; it does **not** copy this file, `skills-internal/`, or `check-framework-metadata.mjs`.

## Framework self-verification

The cardinality facts in `docs/engineering/AGENTS.md` and across the docs — skill/hook/agent/file/step counts, plus `§N` and `/skill` references — are **verified mechanically**, not maintained by hand. `scripts/check-framework-metadata.mjs` derives the truth from the filesystem and fails if the canonical prose disagrees; it runs in CI on every PR (`.github/workflows/verify-framework-metadata.yml`) and locally via the `/verify-framework-consistency` skill (in `skills-internal/`). This is the framework-level counterpart to `/check-consistency` (which audits a *project's* artifacts). When you add a skill, hook, rule, or rule file, the gate forces the matching count update — the failure mode that produced the count-only PRs #7 and #8.

## Framework-self vs shipped artifacts

Not everything in this repo ships to a consumer. Keep the boundary explicit — when adding a skill or script, decide which side it sits on:

- **`skills/`** — consumer-facing, invokable skills. Adoption copies this tree wholesale, so these are the "N invokable skills" the README/footer count.
- **`skills-internal/`** — framework-self skills that maintain Stormhelm itself (e.g. `verify-framework-consistency`; `process-followups` — the v2-strict consumer-feedback → framework-PR loop). **Not** copied to consumers (the README's `cp -R skills .claude/skills` never reaches them) and **excluded** from the skill count.
- **`scripts/`** — consumer-runtime helpers, copied into the consumer by `/setup` — **except** `check-framework-metadata.mjs`, which is framework-self-maintenance and intentionally not copied. **The split is machine-readable (FU-95):** every `scripts/*.mjs` carries a `// scope: consumer-runtime | framework-self` header near the top, and that header is the single source of truth. `/setup`'s copy loop and any **re-sync** to a consumer MUST vendor only the `consumer-runtime` set — a framework-self script hardcodes the framework repo-root layout (`skills/`, `agents/`) and ENOENT-crashes in a consumer where those live under `.claude/`. `check-framework-metadata.mjs` enforces both that every script is tagged and that `/setup`'s loop equals the `consumer-runtime`-tagged set, so the tag, `/setup`, and the re-sync cannot drift.

  > **Re-sync filter (the FU-95 contract).** When re-syncing the vendored `scripts/` delta into a consumer, never copy the whole directory diff: filter it to the `consumer-runtime`-tagged files — e.g. `grep -lE '^// scope: consumer-runtime' scripts/*.mjs`. Copying a `framework-self` script is the live bug FU-95 fixed (it vendored `check-framework-metadata.mjs` into belong, which crashed).

The `check-framework-metadata.mjs` gate counts only `skills/` for the cardinality figure, but resolves `/skill` links and validates `§N` refs against `skills/` ∪ `skills-internal/`.
