# 01c — Company registration + ownership

## Depends on
- #1
- #2

## Plan (/plan)

> Reuses companies/company_memberships + the closed sets from #2. This slice owns
> explicit Company registration; #4 builds on the ownership rule defined here.

### Layers affected
- reuse `company.ts`, `company-membership.ts`, `company-role.ts` (#2).
- `src/domain/org/ownership.ts` — last-owner invariant.
