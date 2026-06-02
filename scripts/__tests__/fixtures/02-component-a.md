# Issue 2 — Component A + shared catalog

## Depends on
- #1

## Plan (/plan)

> Assumes the platform foundation (#1) already exists. This slice defines the
> shared catalog reused by #3/#4/#5.

### Layers affected
- `src/modules/a/catalog.ts` — shared catalog — defined here, reused by #3/#4/#5.
- `src/modules/a/store.ts` — persistence.
