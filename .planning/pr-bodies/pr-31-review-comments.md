# Comments to post on PR #31 — corrected after Yei's feedback

Three originally drafted; **comment #2 was retracted** because it relied on `.planning/new-project-walkthrough.md` that exists only in local working state, never pushed. Without that file, deleting `task_flow/` would remove the only example scaffold — the disclaimer in PR #31 is the correct call.

Comment #3 was corrected on two points:
- CI currently runs only `check-framework-metadata.mjs`; the invariant gate and the `scripts/__tests__/` suite are NOT in CI. The follow-up must wire them in, not "extend an existing wiring".
- The repo already has a test convention at `scripts/__tests__/` with `fixtures/` next to it (used by `parse-layers-affected.test.mjs`). The synthetic-consumer fixture must follow that path, not invent a parallel `tests/fixtures/`.

---

## ▶ Comment #1 — Approve

> Paste this as the PR review body and click "Approve" in the GitHub UI.

**LGTM. The 🔴 HIGH finding is the most important catch in this PR and the fix is the right shape.**

The silent no-op is the worst class of bug for invariant gates — same pattern as the FW-5 `mergeable=UNKNOWN` problem at a different level. A gate that says ✅ without checking anything is more dangerous than one that says ❌. The original `check-invariants.mjs` had two implicit assumptions that were false for real consumer projects:

1. `walk('.planning/issues', ...)` — but `/to-issues` ships issues as GitHub issues, not local markdown. Most projects have `issues/` or no local files at all.
2. `**Labels:**` line in the body — but `/to-issues` applies labels via `gh issue create --label`, never writes them into the markdown.

So in any real consumer, `lbl = ""` → no issue qualified as `ralphReady`/`multiModule`/`sensitive` → INV-1/2/3/5 all returned N/A → ✅ on the empty set. My tests in the framework repo couldn't catch this because the framework has no local issues either — the green output was happy-path-empty, not happy-path-validated.

The double fix is the right architectural call: scan both `issues/` + `.planning/issues/`; add the CONFIG meta-invariant that fails loud when issue files exist but none carry `**Labels:**`; `/to-issues` emits the line in the template.

The MEDIUM and LOW items are all legitimate; specifically:

- **`/optimize` dead script ref** — standard hygiene.
- **`INV-\d` → `INV-\d+`** — the override only worked for INV-1..9; the next we add (INV-6 from ADR-0002, INV-7 from PR-Attr, INV-8 from PR-MatrixStable) would have made the override silently stop working.
- **SHA regex `{40}` → `{40,64}`** — SHA-256 git repos exist and adoption is growing; my `{40}` would have broken silently there.
- **Dead `EDGE_PATTERNS` in `parse-layers-affected`** — refactor leftover, exactly the drift trap the framework predicates against.
- **Reserve INV-6 (ADR-0002) / INV-7 (PR-Attr) in the header comment** — documents the 5→8 gap intentionally so no one "fills the hole" without context.
- **INV-3 also fails when a `ralph-ready` scn is in no `.feature`** — covers the "tag exists but scn doesn't" case I missed.
- **`Analisis-Comparativo-*.md` cleanup** — correct, had local `/Users/...` paths and internal planning content that shouldn't be public.

**One migration note worth adding to the merge announcement:** existing consumer projects whose local `.planning/issues/*.md` lack a `**Labels:**` line will start seeing the new CONFIG check fail after this lands. That's the intended behavior (loud over silent), but a one-liner heads-up in the release notes lets them either add the line to their templates or remove the stale local issue files. No code action needed in the framework — the CONFIG message itself is actionable enough.

**Process meta-observation:** this PR is exactly what the feedback loop is supposed to produce. The bug was invisible to my testing because the framework repo is the most degenerate consumer (no issues, no labels, no features) — so everything correctly returned N/A and looked green. The only way to catch it was code-reading or running against a populated consumer. I'll file a follow-up issue to add a synthetic consumer fixture so future invariants are validated against a populated project, not just the empty framework repo.

Approving. Merge when ready.

---

## ▶ Comment #2 — RETIRADO (no postear)

The original draft argued for deleting `task_flow/` and pointing at a canonical walkthrough document. That argument depended on `.planning/new-project-walkthrough.md`, which is **local working state in my session, never pushed to main**. Without that file the recommendation removes the only existing example scaffold and worsens onboarding.

The disclaimer in PR #31 is the correct call. If a canonical walkthrough lands in a future PR, the question reopens; until then, keep `task_flow/` with the disclaimer.

**Nothing to paste on GitHub for this one.**

---

## ▶ Comment #3 — Follow-up issue (corrected)

> Open this as a **new GitHub issue** on the repo, after PR #31 merges.

**Title:**

```
chore: add synthetic consumer fixture for invariant gate tests (extend scripts/__tests__/)
```

**Body:**

```markdown
## Context

PR #31 caught a silent no-op in `scripts/check-invariants.mjs`: it scanned `.planning/issues/` (wrong convention for real consumers) and required a `**Labels:**` line that `/to-issues` never wrote. INV-1/2/3/5 returned N/A on every real project → ✅ green gate that checked nothing.

The bug was invisible to existing tests because:

- The framework repo itself is the most degenerate consumer (no local issues, no labels, no `.feature` scenarios) — every invariant correctly returned N/A.
- CI currently runs only `scripts/check-framework-metadata.mjs` (`.github/workflows/verify-framework-metadata.yml`). The `check-invariants.mjs` script and the `node --test scripts/__tests__/` suite are **not** in CI.

So "green on main" only meant "the code parses and the metadata linter passes". It did NOT mean "the invariants catch what they claim".

## Proposal

### 1. Extend `scripts/__tests__/` with a synthetic consumer fixture

Follow the existing convention (`parse-layers-affected.test.mjs` + `fixtures/`):

```
scripts/__tests__/
├── parse-layers-affected.test.mjs        (existing)
├── check-invariants.test.mjs             (NEW)
└── fixtures/
    ├── 01-foundation.md ... 05-...md      (existing — parser fixtures)
    └── synthetic-consumer/                (NEW — populated consumer)
        ├── issues/                         — N issues with **Labels:** + scenarios:scn-NNN
        ├── features/<context>/<feature>.feature  — @release @scn-NNN + # status: approved
        ├── docs/specs/<feature>.md
        ├── docs/architecture/<feature>.md  (optional, for INV-1 multi-module)
        ├── docs/threat-models/<feature>.md (optional, for INV-2 sensitive)
        └── docs/adr/0001-*.md              (for INV-4)
```

### 2. `check-invariants.test.mjs` runs the script against the fixture

Use `node --test` (matches the existing test convention). The test:

1. `cd` into `fixtures/synthetic-consumer/`.
2. Runs `scripts/check-invariants.mjs` and asserts the expected pass/fail/na per invariant.
3. Mutates a single file (e.g. flips a feature from `approved` → `clarifying`, or removes the threat model for a `require-human-review` issue) and asserts the corresponding invariant now fails.
4. Also asserts the CONFIG check fires when the `**Labels:**` line is stripped — direct regression for the PR #31 finding.

### 3. Wire the suite into CI (this is new wiring, not an existing one)

CI today runs only `check-framework-metadata.mjs`. Two options, both valid:

**Option A — extend the existing workflow.** Add a step to `.github/workflows/verify-framework-metadata.yml`:

```yaml
- name: Run scripts/__tests__/ suite
  run: node --test scripts/__tests__/*.test.mjs
```

Pro: one workflow, simple. Con: stretches the file's scope beyond its name ("metadata" no longer covers it).

**Option B — new workflow `verify-scripts-tests.yml`** with the same `paths:` filter on `scripts/**` and `docs/engineering/capabilities/**`. Runs `node --test scripts/__tests__/*.test.mjs`.

Pro: clear scope per workflow. Con: one more file to maintain.

Recommendation: B if we expect to add more script tests soon (compose-sonar-properties, etc.); A if this is the only addition for a while.

## Why this matters

The same lesson applies to every future executable invariant: INV-6 (ADR-0002), INV-7 (PR-Attr), INV-8 (PR-MatrixStable). Without a populated fixture, "tests pass" only means "the code parses"; it does NOT mean "the rule it implements actually catches what it's supposed to catch".

This is the framework-level instance of FW-5: silent green is worse than loud red.

## Estimated effort

- Synthetic-consumer fixture: ~1 hour.
- `check-invariants.test.mjs` with assertions per invariant + mutation cases: ~1 hour.
- CI wiring (Option A or B): ~30 min.
- Integration sanity (regress against PR #31's fixes to confirm they actually do what they claim): ~30 min.

**Total: 3 hours.**

## Related

- PR #31 (originating finding).
- ADR-0002 (proposed INV-6).
- Future PR-Attr (proposed INV-7).
- PR-MatrixStable (introduces INV-8).
- Existing convention: `scripts/__tests__/parse-layers-affected.test.mjs` + `scripts/__tests__/fixtures/`.
```

---

## Posting checklist

- [ ] Comment #1 → as PR review body + Approve.
- [ ] Comment #2 → **do not post**.
- [ ] Comment #3 → open as a separate issue **after PR #31 merges**, so the issue can reference the merge SHA.
