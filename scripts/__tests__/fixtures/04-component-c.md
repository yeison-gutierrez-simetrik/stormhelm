# Issue 4 — Component C (mutation path)

## Depends on
- #3

## Plan (/plan)

> Reuses everything from #2/#3. Owns the mutation path.

### Layers affected
- reuse `invariant.ts` (#3) for the guard.
- a uniqueness constraint from #2 enforces a single record.
- `src/modules/c/mutate.use-case.ts`.
