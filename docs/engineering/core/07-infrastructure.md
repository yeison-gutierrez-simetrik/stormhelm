# 07 — Persistence & External Integrations

**Scope.** How database work and external side effects are structured: concurrency, transaction scope, the outbox pattern, and idempotency.

**When to read.** Writing a repository method, opening a transaction, calling Stripe / DocuSign / a Provider Agent / a webhook receiver, designing how an external event is consumed.

**Rules in this file.** §15, §16, §17, §18

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `06-commands-and-security.md` (the use cases that drive these calls).

---

## §15. Use `Promise.all` intentionally

Prefer `Promise.all` for independent non-transactional work.

Use a `for...of` loop when each iteration opens a database transaction, depends on the previous result, calls a rate-limited external API, or needs controlled sequencing.

### Good: independent reads

```ts
const [company, listing, membership] = await Promise.all([
  companyRepository.findById(companyId),
  listingRepository.findById(listingId),
  membershipRepository.findByUserAndCompany(userId, companyId),
]);
```

### Bad: many concurrent transactions

```ts
await Promise.all(
  listings.map((listing) =>
    transactionManager.transaction(async (tx) => {
      await listingRepository.publish(tx, listing.id);
    }),
  ),
);
```

### Good: controlled transactional writes

```ts
for (const listing of listings) {
  await transactionManager.transaction(async (tx) => {
    await listingRepository.publish(tx, listing.id);
  });
}
```

---

## §16. Keep transactions short and boring

Rules:

- Do not open a transaction inside another transaction.
- Do not call Stripe, DocuSign, email, A2A providers, webhooks, LLMs, or other unreliable external APIs inside a database transaction.
- Do not perform long-running computation inside a transaction.
- Use transactions for the smallest set of database writes that must commit atomically.
- Defer external work to an outbox, workflow exit hook, or explicit post-commit step.

### Good

```ts
const quoteRequestId = await transactionManager.transaction(async (tx) => {
  return quoteRepository.createRequest(tx, input);
});

await providerAgentClient.sendQuoteRequest({ quoteRequestId });
```

### Bad

```ts
await transactionManager.transaction(async (tx) => {
  const quoteRequestId = await quoteRepository.createRequest(tx, input);

  await providerAgentClient.sendQuoteRequest({ quoteRequestId });
});
```

Why bad:

- External API latency holds database locks.
- External failure creates unclear transaction behavior.
- Retries can duplicate side effects.

---

## §17. Model external side effects explicitly

External side effects should be visible and retryable.

Use an outbox/workflow pattern for:

- Provider Agent A2A calls
- email notifications
- webhook delivery
- Stripe follow-up actions
- DocuSign follow-up actions
- long-running verification probes

A handler should be safe to retry.

### Good

```ts
await outboxRepository.enqueue({
  type: "provider.quote_requested",
  payload: {
    quoteRequestId,
    providerAgentId,
  },
});
```

### Bad

```ts
await providerAgentClient.sendQuoteRequest({
  quoteRequestId,
  providerAgentId,
});
```

Direct calls are acceptable only for intentionally synchronous user-facing behavior where the product requires waiting for the response.

---

## §18. Make idempotency part of integration design

All external webhooks and provider callbacks must be idempotent.

This includes:

- Stripe webhooks
- DocuSign webhooks
- provider-to-marketplace REST callbacks
- A2A retry delivery
- webhook notification delivery

### Good

```ts
const claimed = await integrationEventRepository.claimOnce({
  provider: "stripe",
  externalEventId: stripeEvent.id,
});

if (!claimed) {
  return { status: "already_processed" };
}

await processStripeEvent(stripeEvent);
```

### Bad

```ts
await processStripeEvent(stripeEvent);
```
