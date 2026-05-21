# 03 — TypeScript Style

**Scope.** Language-level rules for writing safe, readable TypeScript. These are about *how* code is written, not about domain modeling.

**When to read.** Writing or reviewing any TypeScript code. Anything involving type assertions, optional chaining, mutation, or operator choice.

**Rules in this file.** §5, §6, §7, §8, §9, §10, §33

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. For domain types, naming, and closed-value sets, see `05-domain-modeling.md`.

---

## §5. Do not use `any`

`any` disables TypeScript. It hides bugs precisely where type safety is most valuable.

Use `unknown` at boundaries, then parse or narrow it.

### Good

```ts
const parseStripeWebhook = (payload: unknown): StripeWebhookEvent => {
  return stripeWebhookSchema.parse(payload);
};
```

### Bad

```ts
const parseStripeWebhook = (payload: any): StripeWebhookEvent => {
  return payload;
};
```

### Good

```ts
const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
};
```

### Bad

```ts
const getErrorMessage = (error: any): string => {
  return error.message;
};
```

---

## §6. Do not use `as` casts

`as` usually means "trust me instead of the compiler." Prefer parsing, narrowing, or changing the type source.

### Good: parse external input

```ts
const providerResponseSchema = z.object({
  quoteId: z.string().uuid(),
  priceCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
});

const providerResponse = providerResponseSchema.parse(rawProviderResponse);
```

### Bad

```ts
const providerResponse = rawProviderResponse as ProviderQuoteResponse;
```

### Good: narrow with a predicate

```ts
type PublishedListing = Listing & { state: "published" };

const isPublishedListing = (listing: Listing): listing is PublishedListing => {
  return listing.state === "published";
};

const publishedListings = listings.filter(isPublishedListing);
```

### Bad

```ts
const publishedListings = listings.filter(
  (listing) => listing.state === "published",
) as PublishedListing[];
```

### Allowed rare exception

A cast may be acceptable only when interacting with a broken or incomplete third-party type and the value has already been validated or narrowed locally.

When this happens:

- keep the cast at the adapter boundary
- add a short comment explaining why it is safe
- never let the cast leak into domain code

---

## §7. Do not use non-null assertions

The `!` operator hides missing-data bugs.

Handle absence explicitly.

### Good

```ts
const company = await companyRepository.findById(companyId);

if (company === null) {
  return err({ type: "company_not_found", companyId });
}

return ok(company);
```

### Bad

```ts
const company = await companyRepository.findById(companyId);

return ok(company!);
```

### Good

```ts
const stripeAccountId = company.stripeAccountId;

if (stripeAccountId === null) {
  return err({ type: "stripe_account_missing", companyId: company.id });
}

await stripeClient.createAccountLink({ stripeAccountId });
```

### Bad

```ts
await stripeClient.createAccountLink({
  stripeAccountId: company.stripeAccountId!,
});
```

---

## §8. Avoid unnecessary mutability

Prefer `const`, immutable values, and pure transformations.

Use `let` only when mutation makes the code simpler and local. Never use mutation to communicate state across distant parts of a function.

### Good

```ts
const publishedListings = listings.filter((listing) => listing.state === "published");

const result = publishedListings.map((listing) => ({
  listingId: listing.id,
  title: listing.title,
}));
```

### Bad

```ts
let result = [];

for (const listing of listings) {
  if (listing.state === "published") {
    result.push({
      listingId: listing.id,
      title: listing.title,
    });
  }
}
```

### Good: explicit local mutation when it improves clarity

```ts
let totalCents = 0;

for (const lineItem of lineItems) {
  totalCents += lineItem.amountCents;
}

return totalCents;
```

This is acceptable because the mutation is local, simple, and not shared.

### Bad: shared mutable state

```ts
let currentCompanyId: string | undefined;

export const setCurrentCompanyId = (companyId: string) => {
  currentCompanyId = companyId;
};

export const createListing = async (input: CreateListingInput) => {
  return listingRepository.create({
    ...input,
    companyId: currentCompanyId!,
  });
};
```

---

## §9. Use sound operators

Use operators according to what they mean.

### `??` means "defaults to"

Use `??` when only `null` or `undefined` should trigger a default.

#### Good

```ts
const currency = user.preferredCurrency ?? "USD";
```

#### Bad

```ts
const currency = user.preferredCurrency || "USD";
```

Why bad:

- `||` treats empty string, `0`, and `false` as missing.
- That is not the same as defaulting missing values.

### `||` means logical OR

Use `||` for boolean logic.

#### Good

```ts
const canManageCompany = membership.role === "owner" || membership.role === "admin";
```

#### Bad

```ts
const displayName = user.name || user.email;
```

Use explicit handling instead:

```ts
const displayName = user.name.trim() === "" ? user.email : user.name;
```

---

## §10. Numbers are not booleans

Do not rely on truthiness for numbers, array lengths, or counts.

### Good

```ts
if (listings.length === 0) {
  return [];
}
```

### Bad

```ts
if (!listings.length) {
  return [];
}
```

### Good

```ts
if (amountCents > 0) {
  await collectPayment(amountCents);
}
```

### Bad

```ts
if (amountCents) {
  await collectPayment(amountCents);
}
```

### Good

```ts
if (retryCount === 0) {
  return "first_attempt";
}
```

### Bad

```ts
if (!retryCount) {
  return "first_attempt";
}
```

---

## §33. Use readonly types where practical

Use readonly arrays and object fields when values should not be mutated.

### Good

```ts
type SearchResult = {
  readonly listingId: ListingId;
  readonly title: string;
  readonly nextActions: readonly NextAction[];
};
```

### Bad

```ts
type SearchResult = {
  listingId: string;
  title: string;
  nextActions: NextAction[];
};
```

Do not contort code to make everything deeply immutable. Prefer practical immutability where it improves local reasoning.
