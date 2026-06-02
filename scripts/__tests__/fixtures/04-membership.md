# 01d — Company Membership invitation and roles

## Depends on
- #3

## Plan (/plan)

> Reuses everything from #2/#3. This slice owns the invitation + role mutation path.

### Layers affected
- reuse `ownership.ts` (#3) for the demote/remove guard.
- `unique (user_id, company_id)` from #2 enforces single membership.
- `src/application/use-cases/invite-member.use-case.ts`.
