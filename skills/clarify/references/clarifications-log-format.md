# Clarifications Log Format

`/clarify` appends a `Clarifications log` section to `docs/specs/<feature-slug>.md`. The log preserves both the chosen interpretation **and** the rejected one(s), so a future reviewer can audit what the spec deliberately excludes.

## Template

```markdown
## Clarifications log

- **YYYY-MM-DD — FR-<N>.** <chosen interpretation in one sentence>. (option <letter>)
  Rejected: <rejected interpretation in one sentence> (option <letter>) — <why rejected, citing §N or constitution>.
- **YYYY-MM-DD — NFR-<N>.** <chosen interpretation>. (option <letter>)
  Rejected: <rejected interpretation> (option <letter>) — <why rejected>.
```

## Example

```markdown
## Clarifications log

- **2026-05-26 — FR-3.** Non-published Listings return 404 on direct URL access AND are excluded from search (option a).
  Rejected: visible at direct URL but hidden from search (option b) — would have required §48 versioning of the `state` field.
- **2026-05-26 — NFR-1.** p95 measured at the `/v1/listings` endpoint, not at the page render (option a).
  Rejected: end-to-end p95 including client render (option b) — outside the service boundary.
```

## Inline annotations

For each clarified FR/NFR, also add an inline sub-bullet directly under the requirement:

```markdown
- **FR-3.** Listings MUST be visible to Customers only when state = "published".
  - **Clarification (2026-05-26):** Non-published Listings return 404 on direct URL
    access (interpretation a). Search results include only published Listings.
```

## Status transition

- Spec starts at `Status: Draft` (from `/specify`).
- After all clarifications applied: `Status: Clarified` (this skill).
- After human approval and feature shipped: `Status: Released` (human, post-merge).

The clarifications log is **append-only**. Subsequent rounds of `/clarify` add new entries; they never edit prior entries (existing decisions are immutable unless an explicit `/check-consistency` resolution rewrites them).
