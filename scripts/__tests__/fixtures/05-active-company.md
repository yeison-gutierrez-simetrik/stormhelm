# 01e — Active Company resolution + membership-list authz

## Depends on
- #4

## Plan (/plan)

### Layers affected
- mutation authz (owner/admin) reused from #4 — non-admin mutate denied.
- the `requestContextMiddleware` (#1) already reads `X-Company-Id`; validation stays in the use case.
- `GET /v1/companies/:id/memberships?limit&cursor` (paginated).
