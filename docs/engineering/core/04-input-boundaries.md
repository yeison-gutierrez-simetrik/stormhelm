# 04 — Input Validation at the Perimeter

**Scope.** Anything that crosses into the process from the outside world: HTTP bodies, MCP tool arguments, CLI args, webhook payloads, provider responses, environment variables. All of it is parsed once at the edge and passed inward as fully-typed values.

**When to read.** Adding an HTTP route, MCP tool, webhook handler, CLI command, or any code that reads `process.env`.

**Rules in this file.** §4, §34

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. Related: `03-typescript-style.md` (no `any`, no `as`), `05-domain-modeling.md` (the types you parse *into*).

---

## §4. Parse and validate at the perimeter

Parse unknown input as soon as it enters the system:

- HTTP request body
- MCP tool arguments
- CLI arguments
- webhook payloads
- A2A provider responses
- environment variables
- external API responses

After parsing, pass properly typed values deeper into the code.

Use Zod where helpful.

### Good

```ts
import { z } from "zod";

const requestQuoteSchema = z.object({
  listingId: z.string().uuid(),
  message: z.string().min(1),
});

type RequestQuoteInput = z.infer<typeof requestQuoteSchema>;

export const requestQuoteRoute = async (c: AppContext) => {
  const input: RequestQuoteInput = requestQuoteSchema.parse(await c.req.json());

  const quoteRequestId = await requestQuote(input, c.var.deps);

  return c.json({ quoteRequestId }, 202);
};
```

### Bad

```ts
export const requestQuoteRoute = async (c: AppContext) => {
  const body = await c.req.json();

  const quoteRequestId = await requestQuote({
    listingId: body.listingId,
    message: body.message,
  }, c.var.deps);

  return c.json({ quoteRequestId });
};
```

Why bad:

- `body` is untrusted.
- Missing fields are discovered too late.
- Domain code receives unvalidated data.

---

## §34. Environment variables are input too

Parse environment variables once at startup.

### Good

```ts
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  STRIPE_SECRET_KEY: z.string().min(1),
  DOCUSIGN_BASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);
```

### Bad

```ts
export const stripeSecretKey = process.env.STRIPE_SECRET_KEY!;
```
