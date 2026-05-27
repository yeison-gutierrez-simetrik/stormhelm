# 03 — Python Style

**Scope.** Language-level rules for writing safe, readable Python. These are about *how* code is written, not about domain modeling.

**When to read.** Writing or reviewing any Python code. Anything involving type hints, casts, optional access, mutation, or operator choice.

**Rules in this file.** §5-py, §6-py, §7-py, §8-py, §9-py, §10-py, §33-py

> See `../../AGENTS.md` (or `../../../AGENTS.md` from capabilities) for the full rule index. For domain types, naming, and closed-value sets, see `05-domain-modeling.md`.

> **Type checker.** These rules assume a strict-mode checker (`pyright --strict`, `mypy --strict`, or `pyrefly`). Without a strict checker, most of the type-safety rules are unenforceable. Strict mode is part of `/setup`.

---

## §5-py. Do not use `Any`

`typing.Any` is the Python equivalent of TypeScript's `any` — it disables the type checker. It hides bugs precisely where type safety is most valuable.

Use `object` at boundaries (forces explicit narrowing), or parse to a typed model. Use `typing.Unknown`-equivalents (`object` + isinstance, or Pydantic `parse_obj`) to validate.

### Good

```python
from pydantic import BaseModel

class StripeWebhookEvent(BaseModel):
    id: str
    type: str
    data: dict[str, str]

def parse_stripe_webhook(payload: object) -> StripeWebhookEvent:
    return StripeWebhookEvent.model_validate(payload)
```

### Bad

```python
from typing import Any

def parse_stripe_webhook(payload: Any) -> StripeWebhookEvent:
    return payload  # ❌ no validation, returns whatever was passed
```

### Good

```python
def get_error_message(error: object) -> str:
    if isinstance(error, Exception):
        return str(error)
    return "Unknown error"
```

### Bad

```python
from typing import Any

def get_error_message(error: Any) -> str:
    return error.message  # ❌ may not have .message
```

### Allowed rare exception

`Any` is acceptable in a single, contained place when interfacing with a third-party library whose stubs declare `Any` at the boundary. Wrap immediately in a typed model.

---

## §6-py. Do not use `cast()` or `# type: ignore`

`typing.cast(T, value)` and `# type: ignore` tell the type checker "trust me." Prefer parsing, narrowing with `isinstance` / `TypeGuard`, or fixing the upstream type.

### Good: parse external input

```python
from pydantic import BaseModel, Field

class ProviderQuoteResponse(BaseModel):
    quote_id: str = Field(pattern=r"^[0-9a-f-]{36}$")
    price_cents: int = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)

provider_response = ProviderQuoteResponse.model_validate(raw_provider_response)
```

### Bad

```python
from typing import cast

provider_response = cast(ProviderQuoteResponse, raw_provider_response)  # ❌
```

### Good: narrow with `TypeGuard`

```python
from typing import TypeGuard

class Listing(BaseModel):
    state: str

class PublishedListing(Listing):
    state: Literal["published"]

def is_published_listing(listing: Listing) -> TypeGuard[PublishedListing]:
    return listing.state == "published"

published_listings = [l for l in listings if is_published_listing(l)]
# ↑ type-checker now knows these are PublishedListing
```

### Bad

```python
from typing import cast

published_listings = cast(
    list[PublishedListing],
    [l for l in listings if l.state == "published"],
)  # ❌ no real check
```

### Allowed rare exception

A `cast` or single `# type: ignore[code]` may be acceptable only when interacting with a broken or incomplete third-party stub and the value has already been validated or narrowed locally.

When this happens:

- keep the cast at the adapter boundary
- add a short comment explaining why it is safe
- pin the ignore code (e.g., `# type: ignore[attr-defined]`), never bare `# type: ignore`
- never let it leak into domain code

---

## §7-py. Do not use unsafe optional access

Python has no `!` non-null operator, but the equivalent patterns are everywhere: indexing a possibly-`None` value, accessing `.attr` on `Optional[X]`, using `assert x is not None` to silence the checker. All hide missing-data bugs.

Handle absence explicitly.

### Good

```python
company = await company_repository.find_by_id(company_id)

if company is None:
    return Err(type="company_not_found", company_id=company_id)

return Ok(company)
```

### Bad

```python
company = await company_repository.find_by_id(company_id)

return Ok(company)  # ❌ company may be None
```

### Good

```python
stripe_account_id = company.stripe_account_id

if stripe_account_id is None:
    return Err(type="stripe_account_missing", company_id=company.id)

await stripe_client.create_account_link(stripe_account_id=stripe_account_id)
```

### Bad

```python
# ❌ assert-as-narrowing is also banned; use real conditionals
assert company.stripe_account_id is not None
await stripe_client.create_account_link(stripe_account_id=company.stripe_account_id)
```

### Bad

```python
# ❌ pyright ignore to silence None warnings
await stripe_client.create_account_link(
    stripe_account_id=company.stripe_account_id,  # pyright: ignore[reportOptionalMemberAccess]
)
```

---

## §8-py. Avoid unnecessary mutability

Prefer immutable data structures, pure transformations, frozen models. Use mutable structures only when mutation is local and improves clarity.

### Good

```python
published_listings = [l for l in listings if l.state == "published"]

result = [
    {"listing_id": l.id, "title": l.title}
    for l in published_listings
]
```

### Bad

```python
result = []

for listing in listings:
    if listing.state == "published":
        result.append({"listing_id": listing.id, "title": listing.title})  # ❌ unnecessary mutation
```

### Good: explicit local mutation when it improves clarity

```python
total_cents = 0

for line_item in line_items:
    total_cents += line_item.amount_cents

return total_cents
```

This is acceptable because the mutation is local, simple, and not shared.

### Bad: shared mutable module-level state

```python
# ❌ module-level mutable singleton
_current_company_id: str | None = None

def set_current_company_id(company_id: str) -> None:
    global _current_company_id
    _current_company_id = company_id

async def create_listing(input_: CreateListingInput) -> Listing:
    return await listing_repository.create(
        company_id=_current_company_id,  # ❌ hidden global state
        **input_.model_dump(),
    )
```

### Bad: mutable default arguments

```python
def add_tag(tags: list[str] = []) -> list[str]:  # ❌ shared list across calls
    tags.append("new")
    return tags
```

Use sentinel values or factories:

```python
def add_tag(tags: list[str] | None = None) -> list[str]:
    tags = list(tags) if tags is not None else []
    tags.append("new")
    return tags
```

---

## §9-py. Use sound operators

Use operators according to what they mean.

### `x if y is not None else default` means "defaults to None"

Python lacks a `??` operator. Use an explicit conditional when only `None` should trigger the default.

#### Good

```python
currency = user.preferred_currency if user.preferred_currency is not None else "USD"
```

#### Bad

```python
currency = user.preferred_currency or "USD"  # ❌ empty string "" also falls through
```

Why bad:

- `or` returns the first truthy value. An empty string, `0`, `False`, `[]`, all trigger the default.
- That is not the same as defaulting *only* missing values.

### `or` is for boolean / truthy logic only

Use `or` for genuine boolean conditions or to chain non-empty fallbacks where falsy *should* fall through.

#### Good

```python
can_manage_company = (
    membership.role == "owner" or membership.role == "admin"
)
```

#### Bad

```python
display_name = user.name or user.email  # ❌ "" name silently falls back
```

Use explicit handling:

```python
display_name = user.email if not user.name.strip() else user.name
```

### Walrus (`:=`) only inside a `while` / `if` where it removes a duplicate line

#### Good

```python
while (line := file.readline()):
    process(line)
```

#### Bad

```python
result = (x := compute()) + use(x)  # ❌ obscures order
```

---

## §10-py. Numbers and collections are not booleans

Do not rely on Python's truthiness for numbers, collection lengths, or counts. Empty containers and zero values are silently false.

### Good

```python
if len(listings) == 0:
    return []
```

### Bad

```python
if not listings:  # ❌ also true for None — different meaning
    return []
```

### Good

```python
if amount_cents > 0:
    await collect_payment(amount_cents)
```

### Bad

```python
if amount_cents:  # ❌ 0 means "no", but so does None
    await collect_payment(amount_cents)
```

### Good

```python
if retry_count == 0:
    return "first_attempt"
```

### Bad

```python
if not retry_count:  # ❌ None and 0 collapse
    return "first_attempt"
```

### Exception

`if not items:` is acceptable when the function is *guaranteed* to receive a list (not `None`), and "empty list" is the same as "no work to do." When in doubt, use the explicit form.

---

## §33-py. Use immutable / frozen types where practical

Prefer immutable data shapes: `frozen=True` dataclasses, `tuple`, `frozenset`, `Mapping` over `dict`, `Sequence` over `list`. Pydantic models can be frozen via `model_config`.

### Good

```python
from dataclasses import dataclass
from typing import Sequence

@dataclass(frozen=True, slots=True)
class SearchResult:
    listing_id: ListingId
    title: str
    next_actions: tuple[NextAction, ...]   # tuple, not list

@dataclass(frozen=True, slots=True)
class CreateListingInput:
    company_id: CompanyId
    title: str
    price_cents: int
```

### Good: Pydantic frozen

```python
from pydantic import BaseModel, ConfigDict

class SearchResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    listing_id: ListingId
    title: str
    next_actions: tuple[NextAction, ...]
```

### Good: read-only signatures

```python
from collections.abc import Mapping, Sequence

def render_listings(
    listings: Sequence[Listing],            # not list[Listing]
    badges_by_id: Mapping[ListingId, str],  # not dict[ListingId, str]
) -> RenderedHtml:
    ...
```

### Bad

```python
@dataclass
class SearchResult:
    listing_id: str       # ❌ primitive, not value object
    title: str
    next_actions: list[NextAction]   # ❌ mutable, can be appended after creation
```

Do not contort code to make everything deeply immutable. Prefer practical immutability where it improves local reasoning, especially for inputs/outputs of use cases and read models.
