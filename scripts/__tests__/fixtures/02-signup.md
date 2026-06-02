# 01b — Sign-up + implicit personal Company

## Depends on
- #1

## Plan (/plan)

> Assumes the project skeleton + auth (#1) already exist. This slice hooks tables
> and the two domain closed sets reused by #3/#4/#5.

### Layers affected
- `src/domain/org/company-role.ts` — closed set of the 7 roles — defined here, reused by #3/#4/#5.
- `src/infrastructure/adapters/output/persistence/drizzle/schema/org-schema.ts` — companies + memberships.
