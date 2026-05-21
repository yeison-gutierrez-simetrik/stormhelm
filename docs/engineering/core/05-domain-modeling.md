# 05 — Domain Modeling

**Scope.** How to design the types and names of the domain itself: vocabulary, closed sets of values, units, booleans vs unions, illegal-state prevention, and how expected failures are represented.

**When to read.** Defining a new entity, picking a name, deciding between a `boolean` and a string union, choosing between an `enum` / `as const` / literal union, storing money or percentages, designing a result type for a use case.

**Rules in this file.** §22, §32, §36, §11, §20, §21, §19

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `03-typescript-style.md` (language-level rules), `06-commands-and-security.md` (how these types flow through use cases), `09-stack-conventions.md` (§42: how Results are mapped to HTTP).

---

## §22. Keep domain names aligned with the PRD

Use the project vocabulary consistently.

### Preferred names

- Company
- Company Membership
- Provider Agent
- Listing
- Agent Tester
- Service Scoping
- Quote
- MSA
- SOW
- Deliverable
- Progress Event
- Customer Request
- Deliverable Feedback
- Dispute
- H2H Meeting
- SLA
- Cure Period
- Reputation
- Promoted Placement
- Take Rate

### Avoid

- `service_request`
- `order`
- `service`
- `engagement`
- `service_listing`
- `execution_task`
- `task_status_event`
- `service_provider`
- unqualified `agent`
- `org membership`
- `delivery feedback`
- `service brief`
- `bill`
- `invoice`
- `refund` as first-class internal billing entities

Stripe is the source of truth for payment objects. Store Stripe references and marketplace settlement state, not a parallel billing system.

---

## §32. Keep naming precise

Prefer names that include domain concept and unit.

### Good

```ts
priceCents
takeRateBps
quoteExpiresAt
sowId
providerAgentId
companyMembershipId
```

### Bad

```ts
price
fee
expiry
id
agentId
membershipId
```

---

## §36. Closed domain values come from the domain, not magic strings

Domain states, kinds, codes, and other closed sets of values must be defined **once**, in the domain module that owns them, as a string literal union or an `as const` map. Adapters, routes, MCP tools, tests, and migrations import the type or constant — they do not write the raw string literal inline.

This rule serves the same intent as §20 (boolean blindness), §21 (illegal states), and §22 (PRD vocabulary): the vocabulary of the domain lives in the domain, and nowhere else.

### Why not `enum`

Do **not** use TypeScript `enum` for these values:

- `enum` emits runtime code; it is not just a type.
- Numeric enums have reverse-mapping that leaks into transport payloads.
- Mapping a raw string (from HTTP, Stripe, DocuSign, etc.) into an `enum` value requires a cast — which conflicts with §6 ("No `as` casts").
- String literal unions and `as const` maps give the same ergonomics with none of the runtime baggage.

### Good: string literal union owned by the domain

```ts
// src/modules/listings/domain/listing-state.ts
export type ListingState =
  | "sandbox"
  | "pending_verification"
  | "verified"
  | "published";
```

Used by:

```ts
import type { ListingState } from "@/modules/listings/domain/listing-state";

const isPublic = (state: ListingState): boolean => state === "published";
```

### Good: `as const` map when you also need a runtime value bag

```ts
// src/modules/listings/domain/listing-state.ts
export const LISTING_STATES = [
  "sandbox",
  "pending_verification",
  "verified",
  "published",
] as const;

export type ListingState = (typeof LISTING_STATES)[number];
```

Now iteration, validation, and exhaustiveness all share a single source:

```ts
import { z } from "zod";
import { LISTING_STATES, type ListingState } from "@/modules/listings/domain/listing-state";

export const listingStateSchema = z.enum(LISTING_STATES);
//                                  ^ runtime list, single source of truth
```

### Bad: magic string scattered in an adapter

```ts
// somewhere in src/http/listing-routes.ts
if (listing.state === "publised") {
  // typo: compiler cannot help when `state` is `string`
}
```

### Bad: per-file constants duplicating the domain vocabulary

```ts
// src/jobs/republish-listings.ts
const STATE_PUBLISHED = "published"; // duplication of vocabulary
const STATE_VERIFIED = "verified";
```

### Bad: TypeScript `enum`

```ts
enum ListingState {
  Sandbox = "sandbox",
  PendingVerification = "pending_verification",
  Verified = "verified",
  Published = "published",
}

// Then at every transport boundary you end up writing:
const state = rawStateFromStripe as ListingState; // violates §6
```

### Where the literal *is* allowed

Inside the module that **owns** the type, comparing against the literal is fine — that file already defines the vocabulary:

```ts
// src/modules/listings/domain/listing-state.ts
export const isPublic = (state: ListingState): boolean => state === "published";
```

Outside that module, prefer named helpers (`isPublic(state)`) or, at minimum, an import-typed comparison so the literal is checked against the union.

---

## §11. Store units as integers

Do not use floats for money, percentages, rates, durations, or quantities that have a smaller unit.

Use the smallest practical unit and include the unit in the name.

### Good

```ts
type FixedPriceQuote = {
  priceCents: number;
  currency: "USD" | "EUR" | "BRL";
  marketplaceFeeBps: number;
};
```

### Bad

```ts
type FixedPriceQuote = {
  price: number;
  marketplaceFeePercent: number;
};
```

### Preferred unit names

| Concept | Store as | Example name |
|---|---|---|
| Money | minor unit integer | `amountCents`, `priceCents` |
| Percentage | basis points | `takeRateBps`, `feeBps` |
| Duration | explicit unit | `ttlSeconds`, `noticeDays` |
| File size | bytes | `sizeBytes` |
| Usage | explicit unit | `usageUnits`, `tokensCount`, `apiCallsCount` |

---

## §20. Avoid Boolean blindness

Prefer domain-specific names and explicit unions over vague booleans.

### Good

```ts
type HandlingMode = "agent" | "manual";

type ProviderEventConfig = {
  eventType: ProviderEventType;
  handlingMode: HandlingMode;
};
```

### Bad

```ts
type ProviderEventConfig = {
  eventType: string;
  isManual: boolean;
};
```

### Good

```ts
type ListingState = "sandbox" | "pending_verification" | "verified" | "published";
```

### Bad

```ts
type Listing = {
  isPublished: boolean;
  isVerified: boolean;
  isSandbox: boolean;
};
```

---

## §21. Make illegal states hard to represent

Use discriminated unions for domain states with different required data.

### Good

```ts
type Quote =
  | {
      state: "requested";
      quoteRequestId: QuoteRequestId;
    }
  | {
      state: "ready";
      quoteId: QuoteId;
      priceCents: number;
      currency: CurrencyCode;
      expiresAt: Date;
    }
  | {
      state: "accepted";
      quoteId: QuoteId;
      sowId: SOWId;
    }
  | {
      state: "expired";
      quoteId: QuoteId;
      expiredAt: Date;
    };
```

### Bad

```ts
type Quote = {
  state: string;
  quoteId?: string;
  priceCents?: number;
  currency?: string;
  expiresAt?: Date;
  sowId?: string;
};
```

---

## §19. Use explicit Result types with `code` for expected failures

Expected business failures are **values**, not thrown exceptions.

Examples:

- quote expired
- company not verified
- listing not published
- user lacks role
- deliverable already accepted
- provider response missing critical fields

**Throw only for programmer errors or truly unexpected infrastructure failures.** The HTTP `errorHandler` exists to map those unexpected throws to a 500 response — it must not be relied on for business flow (see §42).

### Result shape

The discriminant is `ok`, and the failure case carries a `code` field with **SCREAMING_SNAKE** values. The same `code` flows from the domain through the application layer and into the HTTP response — clients depend on it (§43).

```ts
type AcceptQuoteResult =
  | { ok: true; sowId: SOWId }
  | { ok: false; code: "QUOTE_EXPIRED" }
  | { ok: false; code: "COMPANY_NOT_VERIFIED" }
  | { ok: false; code: "FORBIDDEN" };
```

The valid `code` values for an operation are a closed set and must be defined in the domain that owns them, per §36:

```ts
// domain/errors/quote-acceptance-codes.ts
export const QUOTE_ACCEPTANCE_ERROR_CODES = [
  "QUOTE_EXPIRED",
  "COMPANY_NOT_VERIFIED",
  "FORBIDDEN",
] as const;

export type QuoteAcceptanceErrorCode = (typeof QUOTE_ACCEPTANCE_ERROR_CODES)[number];
```

### Good

```ts
const result = await acceptQuoteUseCase.execute(input, ctx);

if (!result.ok) {
  return resultToHttp(c, result); // §42
}

return c.json({ sowId: result.sowId.value }, 201);
```

### Bad: throwing for expected flow

```ts
// domain/use-cases/accept-quote.ts  ❌
if (quote.expiresAt <= clock.now()) {
  throw new QuoteExpiredError();
}
```

```ts
// application/use-cases/accept-quote.use-case.ts  ❌
if (!membership.canAccept()) {
  throw new ForbiddenError();
}
```

These hide the failure in the function signature and force the HTTP adapter to discover business outcomes via `instanceof` checks. Return a Result instead.

### Allowed `throw`

Throw only for programmer errors and unexpected infrastructure failures:

- A value object constructor receives data that should have been validated by Zod (`new ProjectId("")` — that is a bug upstream).
- The database connection is down.
- A required env var is missing at runtime (already caught by §34 at startup; if it ever leaks past, throwing is fine).
- An exhaustiveness check (`assertNever(x)`).

These reach the global `errorHandler`, which always returns `500 INTERNAL_ERROR` + log (§42).
