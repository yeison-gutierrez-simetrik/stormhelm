# 06 — Commands, Reads, and Authorization

**Scope.** How a use case that changes state is shaped: who is allowed to call it, what it checks, what it returns, and how it reasons about prior facts.

**When to read.** Writing a domain service that mutates state, an authorization check, a mutation HTTP/MCP endpoint, or a query that branches on state.

**Rules in this file.** §27, §12, §28, §13

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `02-architecture.md` (adapters stay boring), `05-domain-modeling.md` (§19 Result types and illegal states), `07-infrastructure.md` (transactions and side effects), `09-stack-conventions.md` (§41 authN vs authZ, §42 Result→HTTP mapping).

---

## §27. Security gates belong before domain actions

Check identity, membership, role, scopes, and ownership before invoking state-changing domain behavior.

**Authentication** ("who are you?") happens in HTTP middleware and populates `RequestContext` (§41). **Authorization** ("can you do this?") lives in the use case — it returns a `{ ok: false; code: "FORBIDDEN" }` Result (§19), not a thrown exception.

### Good: use case checks authorization, returns Result

```ts
async execute(input: CreateListingInput, ctx: RequestContext): Promise<CreateListingResult> {
  const membership = await this.memberships.findByUserAndCompany(ctx.userId, input.companyId);

  if (membership === null || !["owner", "admin", "developer"].includes(membership.role)) {
    return { ok: false, code: "FORBIDDEN" };
  }

  const listingId = this.ids.listingId();
  await this.listings.create({ ...input, listingId, createdBy: ctx.userId });
  return { ok: true, listingId };
}
```

### Bad: authorization checked after the mutation, or thrown

```ts
const listingId = await createListing(input, deps);
await assertUserCanManageListing(userId, listingId); // too late + throws
```

---

## §12. Prefer local reasoning over global reasoning

Do not assume prior actions based on workflow state alone.

Check the fact you need directly.

### Good

```ts
const submittedApplication = await applicationRepository.findSubmittedByCompanyId(companyId);

if (submittedApplication === null) {
  return err({ type: "submitted_application_missing" });
}
```

### Bad

```ts
if (company.state === "ready_for_credit") {
  return ok("application_was_submitted");
}
```

### Marketplace examples

Good:

```ts
const acceptedQuote = await quoteRepository.findAcceptedQuote(quoteId);

if (acceptedQuote === null) {
  return err({ type: "quote_not_accepted", quoteId });
}
```

Bad:

```ts
if (sow.state === "draft") {
  return createContractFromQuote(quoteId);
}
```

Good:

```ts
const signedEnvelope = await contractRepository.findCompletedEnvelope(sowId);

if (signedEnvelope === null) {
  return err({ type: "contract_not_signed", sowId });
}
```

Bad:

```ts
if (sow.state === "active") {
  return ok("contract_was_signed");
}
```

State is useful. It is not proof of every fact.

---

## §28. Use defensive checks even when flow suggests safety

Do not assume that because the UI only shows a button in one state, the backend can skip validation.

Every command validates its own preconditions.

### Good

```ts
if (sow.state !== "delivering") {
  return { ok: false, reason: "sow_not_delivering" };
}
```

### Bad

```ts
// Dashboard only shows submit button while delivering.
await deliverableRepository.create(input);
```

---

## §13. Mutation APIs should usually return IDs or status, not full entities

Prefer commands that mutate state to return:

- created ID
- accepted status
- operation status
- redirect/action URL
- conflict/error information

Do not return full domain entities from mutation endpoints unless there is a specific business need.

### Good

```ts
return c.json({ quoteRequestId }, 202);
```

### Bad

```ts
return c.json({ quoteRequest }, 201);
```

Why:

- Mutations that return entities create extra access paths to the domain model.
- Queries should be the main way to retrieve entity state.
- It avoids coupling command behavior to read models.
- It keeps APIs safer and easier to reason about.

### Good

```ts
return c.json({
  accountLinkUrl,
  expiresAt,
}, 201);
```

This is acceptable because the business action is to redirect the user to Stripe onboarding.
