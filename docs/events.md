# Event Registry

This file is the **canonical registry of all events emitted by this project**, per §78 (event names use `dot.notation`, past tense for completed events, never free text).

Every event name that appears in production code or in `logger.info({ event: "..." })` calls **must** be registered here. Adding a new event without registering it is a CI failure.

## Structure

For each event:

```markdown
## <domain>.<entity>.<verb>

**Emitted by:** `<file:line>` (use case or adapter)
**Emitted when:** <one-line description of the moment>
**Payload schema:** TypeScript type / Pydantic model reference, OR inline
**Version:** v1, v2, ... (only if external consumers exist — see §48)
**External consumers:** list of subscribers, OR "internal-only"
**Retention:** <how long the event is kept in observability backend>
```

## Naming rules (from §78)

- Format: `<domain>.<entity>.<verb>` (e.g. `quote.accepted`, `payment.charge.failed`).
- Past tense for completed actions (`accepted`, `failed`, `succeeded`).
- Present-imperative for attempts (`accept`, `process`) — only when outcome is logged separately.
- **Never** free text (`"Quote was accepted"`).
- **Never** camelCase (`quoteAccepted`).
- **Never** SCREAMING_SNAKE (that belongs to Result codes per §19).

## Registered events

> Replace these examples with your project's real events. Delete examples before first commit.

### Example: `quote.accepted`

**Emitted by:** `src/application/use-cases/accept-quote.use-case.ts:42`
**Emitted when:** A Quote is successfully accepted and the SOW is created.
**Payload schema:**
```ts
{
  quoteId: string;
  sowId: string;
  priceCents: number;
  currency: "USD" | "EUR" | "BRL";
}
```
**Version:** v1 (external consumers exist)
**External consumers:** Provider Dashboard, billing pipeline
**Retention:** 90 days hot, 7 years cold (compliance)

### Example: `quote.acceptance.failed`

**Emitted by:** same use case, on `result.ok === false` branch
**Emitted when:** Quote acceptance attempt fails for any business reason.
**Payload schema:**
```ts
{
  quoteId: string;
  code: "QUOTE_EXPIRED" | "COMPANY_NOT_VERIFIED" | "FORBIDDEN";
}
```
**Version:** v1
**External consumers:** internal-only (monitoring alerts)
**Retention:** 30 days

---

## Adding a new event

1. Append a new section above following the structure.
2. Use only names valid per §78.
3. If external consumers exist, declare a version per §48.
4. If the event will be emitted from a new use case, add the registry update in the same PR as the use case (do not separate).
5. The `reviewer` agent verifies §78 + §80 + this registry on PR.

## Deprecating an event

- Mark the section with `## ~~event.name~~ (deprecated YYYY-MM-DD)`.
- Document the migration path to its replacement.
- Never delete the entry — it is part of the audit trail per §62.
