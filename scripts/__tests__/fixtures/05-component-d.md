# Issue 5 — Component D + read authz

## Depends on
- #4

## Plan (/plan)

### Layers affected
- authz reused from #4 — non-privileged mutate denied.
- the context middleware (#1) already reads the scope header; validation stays in the use case.
- `src/modules/d/list.use-case.ts` (paginated).
