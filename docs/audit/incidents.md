# Incidents Index

Auto-maintained index of all production incidents and their postmortems, per §62 + §95.

The `/traceability-matrix` skill keeps this file in sync. The `/postmortem` skill appends a new row when a postmortem is finalized.

## Index

| Incident date | Severity | Slug | Postmortem | Resolved | Mean time to resolution |
|---|---|---|---|---|---|

> Replace this empty table with real incidents as they occur. The columns are auto-filled by `/postmortem` Step 9 and verified by `/traceability-matrix` at release time.

## Retention

- This index: indefinite (part of the audit trail, never deleted).
- Linked postmortems: minimum 7 years for production incidents per constitution `C.8` (or your project's equivalent).

## Compliance mapping

This index is the source of truth for compliance frameworks that require incident records:

| Framework | Requirement | Satisfied by |
|---|---|---|
| SOC2 | CC7.3 (incident response) | This index + linked postmortems |
| ISO 27001 | A.16 (incident management) | This index + linked postmortems |
| EU AI Act | Article 17 (record-keeping for AI systems) | This index + traceability matrix |

## What this file is NOT

- Not the postmortem itself (those live in `docs/postmortems/<YYYY-MM-DD>-<slug>.md`).
- Not the timeline (those live inside each postmortem).
- Not the bug tracker (issues live in GitHub).

This file is **just the index** — a flat, queryable list for auditors.

## Maintaining this file manually

If `/traceability-matrix` is not yet wired into CI, add new rows manually following this format:

```markdown
| 2026-05-20 | P0 | quote-expiry-bypass | [docs/postmortems/2026-05-20-quote-expiry-bypass.md](../postmortems/2026-05-20-quote-expiry-bypass.md) | 2026-05-20 | 2h 14m |
```

Keep the table sorted by **date descending** (most recent first).
