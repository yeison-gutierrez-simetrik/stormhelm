# Stormhelm — Guía de Flujos de Desarrollo

> **Audiencia:** developers que adoptan Stormhelm en un proyecto y necesitan saber cómo se ejecuta cada flujo, qué produce cada paso, y dónde el humano debe intervenir.
>
> **Pre-requisitos de lectura:** `README.md` raíz (qué es Stormhelm), `docs/engineering/AGENTS.md` (índice de reglas). No necesitas haber leído las 122 reglas — esta guía las invoca cuando aplican.
>
> **Esta guía usa un ejemplo conductor:** *"Customer deja una reseña (1-5 estrellas + comentario opcional) sobre un Provider después de completar un Quote."* Se referencia como **`provider-review`** a lo largo del documento.

---

## Tabla de contenidos

1. [Filosofía de los flujos](#1-filosofía-de-los-flujos)
2. [Anatomía de un HITL (Human-In-The-Loop)](#2-anatomía-de-un-hitl-human-in-the-loop)
3. [Setup inicial del proyecto](#3-setup-inicial-del-proyecto)
4. [Flujo principal: feature greenfield (`/feature` o manual)](#4-flujo-principal-feature-greenfield-feature-o-manual)
5. [Flujo de bug fix (`/debug`)](#5-flujo-de-bug-fix-debug)
6. [Flujo de improvement (`/optimize` y otros)](#6-flujo-de-improvement-optimize-y-otros)
7. [Flujo brownfield (sub-flow B1-B5)](#7-flujo-brownfield-sub-flow-b1-b5)
8. [Inventario de HITLs y responsabilidades](#8-inventario-de-hitls-y-responsabilidades)
9. [Referencia rápida — skills, inputs, outputs](#9-referencia-rápida--skills-inputs-outputs)

---

## 1. Filosofía de los flujos

Stormhelm no automatiza el desarrollo. **Lo disciplina.** El framework está diseñado bajo dos principios operacionales:

1. **El humano dirige, los agentes ejecutan.** Las decisiones de negocio, arquitectura, y aceptación viven con el humano. La ejecución mecánica (escribir tests, implementar, validar gates) es delegable.
2. **Cada artefacto del flujo es revisable, versionable, y auditable.** No hay "magia" — cada decisión produce un archivo, cada gate produce un reporte, cada PR produce evidencia.

### Los 4 flujos principales

| Flujo | Trigger | Skill principal | Duración típica |
|---|---|---|---|
| **Feature greenfield** | Nueva capacidad de negocio | `/feature` (orquestador) o invocación manual de skills | 1-3 días |
| **Bug fix** | Defecto reportado | `/debug` | 2-8 horas |
| **Improvement** | Optimización, refactor, tech debt, dep upgrade, hardening proactivo | `/optimize`, `/improve-codebase-architecture`, etc. | Variable |
| **Brownfield** | Modificación de código legacy sin cobertura | Sub-flow B1-B5 (precede a `/feature`) | +30-50% sobre greenfield |

### Modo manual vs orquestado

Cada flujo se puede ejecutar de dos formas:

- **Orquestado** (`/feature`, `/debug`): un único comando ejecuta todos los pasos.
- **Manual** (invocando skills individuales): el developer pasa por cada paso con control granular.

**Recomendación inicial:** correr manual las primeras 2-3 features para sentir cada skill, luego pasar a orquestado.

---

## 2. Anatomía de un HITL (Human-In-The-Loop)

Un HITL es un punto donde **el flujo se detiene y espera explícitamente al humano** antes de continuar. Stormhelm tiene HITLs deliberadamente escasos — uno por cada decisión que **solo un humano puede tomar** sin pérdida de valor.

### Tipos de HITL

| Tipo | Comportamiento | Bloquea workflow |
|---|---|---|
| **Checkpoint duro** | El skill emite un prompt y espera respuesta explícita (`yes`, `approve`, `edit:<notes>`, `block`). El workflow no continúa hasta recibir la respuesta. | **Sí** |
| **Checkpoint blando** | El skill emite una notificación o sugerencia; el humano puede actuar pero el workflow continúa si no hay objeción dentro de un margen. | No |
| **Aprobación retroactiva** | El skill ejecuta automáticamente, pero el output requiere firma humana antes de ser autoritativo (ejemplo: threat model draft). | Parcial |

Stormhelm usa **principalmente checkpoints duros** porque los blandos tienden a ser ignorados. La filosofía: si una decisión requiere humano, **detente y pregunta**.

### Responsabilidad humana en cada HITL

Cada HITL tiene una **única responsabilidad humana clara**. El humano no está "supervisando todo" — está tomando **esta decisión específica**:

| Responsabilidad | Habilidad humana requerida | Tiempo típico |
|---|---|---|
| Aprobar la spec/scenarios como contrato | Conocimiento del producto/dominio | 5-15 min |
| Aprobar threat model como contrato de seguridad | Conocimiento de security + business risk | 10-30 min |
| Aprobar/rechazar PR draft | Conocimiento técnico + judgment | 15-45 min |
| Firmar postmortem como blameless | Senior engineer / tech lead | 30-90 min |
| Decidir descope vs implementar | Product owner / tech lead | 5-15 min |

**Anti-patrón:** el humano "revisa todo a vuelo de pájaro" antes de continuar. Eso es ruido, no valor. El HITL existe para forzar una decisión, no para teatro de supervisión.

---

## 3. Setup inicial del proyecto

Antes de cualquier flujo, el proyecto necesita:

### Paso A: `/setup` (wizard interactivo, una vez)

```
/setup
```

**HITL involucrado:** sí, el wizard tiene 6-8 preguntas. El humano responde:
1. Project type (greenfield / brownfield)
2. Primary language y framework
3. Persistence layer
4. Validation library
5. Deployment target
6. Compliance requirements (SOC2, GDPR, etc.)
7. Vocabulary seed (5-15 términos del dominio)

**Output:**

```
project-root/
├── docs/
│   ├── engineering/
│   │   ├── AGENTS.md                  # personalizado a la stack elegida
│   │   ├── core/                       # 17 archivos de reglas neutrales
│   │   └── capabilities/<stack>/        # reglas stack-specific
│   ├── constitution.md                  # TEMPLATE vacío
│   ├── CONTEXT.md                       # con seed vocabulary
│   ├── slos.md                          # vacío
│   ├── events.md                        # template para registry
│   ├── adr/.keep
│   ├── audit/incidents.md               # template
│   ├── postmortems/TEMPLATE.md          # plantilla de postmortem
│   ├── threat-models/.keep
│   └── perf-baselines/.keep
├── features/.keep                       # .feature files irán aquí
├── issues/.keep
├── .planning/                            # gitignored
│   ├── budget.txt
│   └── (subdirs para grilling/, acceptance/, reviews/, etc.)
├── .claude/
│   ├── settings.json                    # hooks + MCP + permisos
│   ├── agents/reviewer.md               # symlink al reviewer agent
│   ├── hooks.config.json
│   └── webfetch-cache/                  # gitignored
├── hooks/                                # scripts ejecutables
├── ralph-local.sh                       # template tailored al stack
└── .gitleaks.toml, .pre-commit-config.yaml
```

**Responsabilidad humana:** responder con honestidad. Si dudas entre opciones, elige la más restrictiva — siempre puedes relajar después con un ADR.

### Paso B: `/constitution` (entrevista de 6 preguntas, una vez)

```
/constitution
```

**HITL involucrado:** sí, entrevista de 6 preguntas con discusión.

**Output:** `docs/constitution.md` con principios `C.1`, `C.2`, ... Cada uno con título, rationale, relación con §N, ejemplo. Toma 30-60 min la primera vez.

**Responsabilidad humana:** declarar los tenets no-negociables del proyecto. Mínimo 2 humanos co-firman. (Ver detalle de `/constitution` en `skills/constitution/SKILL.md`.)

### Paso C: `/onboard` (cuando se incorpora nuevo developer)

```
/onboard
```

**HITL involucrado:** no — es informativo.

**Output:** orientación al developer sobre dónde está cada cosa y cómo se invoca cada skill.

---

## 4. Flujo principal: feature greenfield (`/feature` o manual)

### Ejemplo conductor

> **`provider-review`** — Un Customer que ha completado un Quote con un Provider puede dejar una reseña: rating obligatorio (1-5 estrellas) + comentario opcional (max 1000 chars). Al publicarse, el Provider recibe una notificación por email. Las reseñas son visibles públicamente en el perfil del Provider.

### Características de la feature de ejemplo

- **Greenfield** — módulo Reviews no existe aún.
- **Single bounded context** — todo vive en `src/domain/reviews/`.
- **UI involved** — formulario de calificación + display público.
- **Public API** — endpoints `/v1/reviews` y `/v1/providers/:id/reviews`.
- **Sensitive (PII)** — el comentario puede contener nombres, emails (PII de usuario, no del Provider).
- **Multi-actor** — Customer crea, Provider lee, público lee.
- **Introduces capability** — primer email adapter del proyecto.

Esta feature ejercita los 3 HITLs principales del flujo + el HITL del capability promotion.

---

### Step 1 — Pre-flight check

**Skill invocado:** ninguno (verificación interna del orquestador o del developer manualmente).

**Input:** la estructura del proyecto.

**Procesamiento:**

```bash
# Verifications:
ls docs/engineering/AGENTS.md docs/constitution.md docs/CONTEXT.md
git status                          # working tree clean
ls .planning/budget.txt             # exists, > 0
```

**Output:** OK o stop con diagnóstico claro.

**HITL:** no.

**Validación de reglas:** §setup pre-conditions.

---

### Step 2 — Read constitution

**Skill invocado:** ninguno (intern del orquestador, lectura).

**Input:**
- `docs/engineering/AGENTS.md` (capabilities activas).
- `docs/constitution.md` (tenets).
- Descripción de la feature.

**Procesamiento:**

El orquestador (o el developer mental) detecta:

```
Active capabilities: typescript, typescript-hono, drizzle, zod
Feature touches sensitive paths? → YES (PII en comentarios) → §64 require-human-review
Multi-module? → NO (single context: reviews)
UI involved? → YES → §104 visual gate
Public API endpoints? → YES → §105 Schemathesis
Introduces new capability? → YES (first email adapter) → §63 introduces-capability:email
SLO declared for this endpoint? → Will be checked at /specify with §3b SLO source rule
```

**Output:** una "ficha de modo" mental o explícita en `.planning/feature-sessions/provider-review.modes.md`:

```markdown
# Feature mode detection — provider-review
- Multi-module: NO
- Sensitive: YES (PII in comments)
- UI: YES
- Public API: YES → Schemathesis
- New capability: email (first time)
- Therefore:
  - HITL approval for threat model (§87 + checkpoint) — required
  - HITL approval for capability promotion (post-PR)
  - shift:hitl on the slice (no ralph-ready)
```

**HITL:** no.

**Validación de reglas:** §107 mode detection, §64 sensitive detection, §63 capability detection.

---

### Step 3 — `/grill-me`

**Skill invocado:** `/grill-me`.

**Input:**
- Feature description.
- `docs/CONTEXT.md` (vocabulary).
- `docs/constitution.md`.

**Carga progresiva de reglas:**
- `core/01-philosophy.md` (§1, §2, §30, §31, §35).
- `core/05-domain-modeling.md` (§22 vocabulary).
- `core/02-architecture.md` (§3 — feature toca dominio + adapter + repo + email).
- `core/16-security-supply-chain.md` (§87 — sensitive).

**Procesamiento:**

El skill detecta complejidad: multi-actor + 4 failure cases potenciales + 1 new capability → bucket **"Multiple actors OR cross-context flow"** → target **20-40 preguntas**.

Ejecuta 28 preguntas representativas:

```
Q1: ¿El rating es obligatorio? → SÍ
Q2: ¿El comentario es obligatorio? → NO, opcional
Q3: Rango del rating → 1-5 enteros (no 0, no decimales)
Q4: Length max del comentario → 1000 chars
Q5: ¿Puede un Customer revisar múltiples veces al mismo Provider? → NO, una review por (Customer, Quote completed)
Q6: ¿Editable después de publicada? → SÍ, dentro de 7 días; luego frozen
Q7: ¿Eliminable por el Customer? → soft delete dentro de 30 días; luego frozen
Q8: ¿Visible para todos antes del email al Provider? → NO, email primero, luego pública
Q9: ¿Notificación al Provider — sincronía? → asíncrona via outbox (§17)
Q10: ¿El Provider puede responder? → fuera de scope v1 (§31)
Q11: ¿Moderación de comentarios (profanidad/abuse)? → fuera de scope v1; flag system es feature futura
Q12: ¿Filtrado público de reviews? → ordenar por fecha desc; sin filtros v1
Q13: ¿Sistema de "helpful" votes? → fuera de scope
Q14: ¿Una vez frozen, se puede editar como admin? → SÍ, via panel admin (separado de este feature)
Q15: ¿Multi-tenant? → YES, reviews scoped por tenant
Q16: ¿GDPR delete request del Customer borra la review? → SÍ, hard delete del comment, mantener anonymized rating
Q17: ¿Edad mínima del Customer para revisar? → no aplica para v1
Q18-Q28: variantes sobre email format, errores, retry, etc.
```

**Output:**

`.planning/grilling/provider-review-20260601.md`:

```markdown
# Grilling session — provider-review

**Date:** 2026-06-01
**Feature:** Customer leaves Review for Provider after Quote completion

## Resolved design tree

### Actor: Customer
- Q1-Q7: rating obligatorio (1-5), comentario opcional (max 1000), editable 7d, soft-delete 30d
- Q15-Q16: tenant scope, GDPR delete

### Actor: Provider (asynchronous reader)
- Q9: receives email notification after review publishes
- Q10: cannot reply in v1 (§31)

### Actor: Público (read-only)
- Q8: reviews visible publicly after publication
- Q12: sorted by date desc, no filters v1

## Confirmed assumptions
- A1: One review per (Customer, Quote_id), enforced by unique constraint
- A2: Review state machine: published → editable (7d) → frozen → soft-deleted (30d) → hard-deleted
- A3: Email notification is fire-and-forget via outbox; failures don't roll back the review

## Open questions
- OQ-1 (non-blocking): ¿Spam protection necesario? → default: rate limit middleware (§46) basta para v1

## Shared mental model
[3 párrafos resumen]
```

**HITL:** no formal (es un diálogo developer-agent).

**Responsabilidad humana:** responder con honestidad y confirmar el modelo mental compartido al final.

**Validación de reglas:** §1 build only validated needs (Q10, Q11, Q13 marcados out-of-scope), §22 vocabulary (Customer, Quote, Provider, Review).

---

### Step 4 — `/domain-model`

**Skill invocado:** `/domain-model`.

**Input:**
- `.planning/grilling/provider-review-20260601.md`.
- `docs/CONTEXT.md`.
- `docs/adr/`.

**Carga progresiva de reglas:**
- `core/02-architecture.md` (§3, §37 — class vs type).
- `core/05-domain-modeling.md` (full read).
- `capabilities/typescript/03-style.md` (§5-§10, §33).

**Procesamiento:**

Decisiones tomadas:

1. **Nuevo término:** `Review` añadido a CONTEXT.md (entity, no value object — tiene identidad y comportamiento `edit()`, `softDelete()`, `freeze()`).
2. **Rating:** value object `Rating` con factory `Rating.from(n: number): Result<Rating, "INVALID_RATING">` (§19).
3. **ReviewState:** closed set `"published" | "editable_window" | "frozen" | "soft_deleted"` (§36) en `src/domain/reviews/review-state.ts`.
4. **ReviewComment:** value object opcional, `readonly value: string | null`.
5. **ADR emitido:** `0003-review-as-entity-with-lifecycle.md` justificando que Review es entity (no value object) por tener lifecycle propio.

**Output:**

`docs/CONTEXT.md` actualizado:

```markdown
## Entities (added)
- **Review** — entity within Reviews context. State machine: published → editable_window → frozen → soft_deleted. Owned by Customer; references Provider + Quote.

## Value objects (added)
- **Rating** — integer 1-5, factory-validated (§19).
- **ReviewComment** — optional string, max 1000 chars after trim.

## States (added)
- **ReviewState** — `"published" | "editable_window" | "frozen" | "soft_deleted"` (§36, in `src/domain/reviews/review-state.ts`).

## Events (will be added by /specify, registered after /tdd)
- **review.published.v1**
- **review.edited.v1**
- **review.soft_deleted.v1**
```

`docs/adr/0003-review-as-entity-with-lifecycle.md`:

```markdown
# ADR 0003 — Review as entity with lifecycle, not value object

**Date:** 2026-06-01
**Status:** Accepted
**Context:** Review has identity (one per (Customer, Quote)), state machine, and behavior
  (`edit`, `softDelete`, `freeze`). Per §37, this qualifies as a class entity.
**Decision:** `class Review` with constructor + methods, owned by Reviews aggregate.
**Consequences:**
  - New table `reviews` in DB (migration in /plan step).
  - Domain code: `src/domain/reviews/review.ts`.
  - Outbox event publication on each transition.
**Alternatives:** Embedded in Quote as `quote.review` value object — rejected
  (Review has lifecycle independent of Quote post-completion).
```

**HITL:** no formal.

**Responsabilidad humana:** revisar el delta de CONTEXT.md y el ADR. Si discrepa, pedir revisión.

**Validación:** §22, §36 (closed set), §37 (entity vs value object).

---

### Step 5 — `/specify`

**Skill invocado:** `/specify`.

**Input:**
- `.planning/grilling/provider-review-20260601.md`.
- `docs/CONTEXT.md` (updated by Step 4).
- `docs/constitution.md`.
- `docs/adr/0003-review-as-entity-with-lifecycle.md`.

**Carga progresiva de reglas:**
- `core/01-philosophy.md` (§1, §35).
- `core/05-domain-modeling.md` (§22).
- `core/10-cross-cutting.md` (§45 tenant — reviews scoped).
- `core/16-security-supply-chain.md` (§87 — sensitive).

**Aplicación de mejora #3 (SLO source obligatorio):**

Al redactar NFR de latencia, el skill se detiene:

> *"NFR-N mentions p95 latency target. No baseline exists (greenfield). Grilling doesn't mention latency. Constitution C.7 declares default 'public API p95 ≤ 500 ms'. Apply this default? (y/n)"*

Developer responde: **y**.

**Output:**

`docs/specs/provider-review.md`:

```markdown
# Provider review — Spec

**Slug:** provider-review
**Status:** Draft
**Date:** 2026-06-01

## What changes after this ships

After completing a Quote, Customers can leave a Review (1-5 stars + optional comment)
about the Provider they worked with. The Provider receives an email notification
when the Review publishes. Reviews are publicly visible on the Provider's profile.

## Why

PRD §5.3 (trust signals). Public reviews are the primary signal Customers use to
choose Providers; we cannot validate the Customer-Provider matching loop without
this primitive.

## Actors and their goals

### Customer
- **Goal:** share my experience with a Provider after our engagement.

### Provider (asynchronous reader)
- **Goal:** be notified when I receive a Review so I can adjust my offering.

### Público (read-only)
- **Goal:** browse Reviews on a Provider's profile to evaluate trustworthiness.

## Functional requirements

- **FR-1.** A Customer who has completed a Quote with a Provider can submit a Review
  with a Rating (1-5) and optional ReviewComment (max 1000 chars after trim).
- **FR-2.** Reviews are uniquely keyed by (CustomerId, QuoteId). A second submission
  for the same pair MUST be rejected with code `REVIEW_ALREADY_EXISTS`.
- **FR-3.** Reviews are in state `published` immediately upon creation. After
  7 days they transition to `frozen` (read-only for the Customer).
- **FR-4.** The Customer can `edit` a Review while in `editable_window` (within 7 days).
- **FR-5.** The Customer can `softDelete` a Review within 30 days. After 30 days,
  the comment is hard-deleted (GDPR Article 17); the anonymized rating remains.
- **FR-6.** Upon Review publication, an email notification MUST be enqueued to the
  Provider (async via outbox, §17). Email failure does NOT roll back the Review.
- **FR-7.** Reviews are visible publicly via `GET /v1/providers/:id/reviews`,
  ordered by creation date descending.
- **FR-8.** Only the owning Customer (within their tenant) can edit or delete their Review (§27, §45).

## Non-functional requirements

- **NFR-1.** POST /v1/reviews p95 latency ≤ 500 ms. **Source: constitution C.7** (public API default).
- **NFR-2.** GET /v1/providers/:id/reviews p95 latency ≤ 300 ms. **Source: constitution C.7** (read-heavy default).
- **NFR-3.** Tenant isolation enforced at data layer (§45).
- **NFR-4.** Idempotency support via Idempotency-Key header on POST (§46).
- **NFR-5.** Public read endpoint must paginate with cursor (§47), max 50 per page.

## Out of scope (v1)

- Provider reply to reviews.
- Moderation / profanity filtering.
- "Helpful" voting on reviews.
- Filtering public reviews by rating or recency beyond date desc.
- Admin edit panel (separate feature).

## Constraints

- Constitution: C.1 hexagonal, C.6 tenant isolation, C.8 PII retention (comment is PII).
- Compliance: GDPR — comment is PII; hard-delete within 30 days of customer request.
- Introduces capability: `email` (first email adapter — see §63).
```

**HITL:** no formal (Status: Draft).

**Responsabilidad humana:** ninguna en este step; viene en Step 7.

**Validación:** §1 validated business needs, §22 vocabulary, §3b SLO source, §31 out-of-scope explícito.

---

### Step 6 — `/clarify`

**Skill invocado:** `/clarify`.

**Input:** `docs/specs/provider-review.md` (Status: Draft).

**Aplicación de mejora #2 (checklist sistemático de 7 categorías):**

El skill ejecuta explícitamente cada categoría. Encuentra 8 ambigüedades:

```
[x] Units & precision
  - "max 1000 chars after trim" — ¿cuenta whitespace en medio? → SÍ.
  - "7 days editable" — desde creation? → desde createdAt UTC.
  - "30 days soft-delete" — desde creation o desde delete request? → desde delete request.

[x] Boundaries (inclusive/exclusive)
  - "max 1000 chars" — inclusive de 1000 o hasta 999? → inclusive de 1000.

[x] State machine
  - ¿published puede saltar directo a soft_deleted antes de 7 días? → SÍ (editable_window incluye delete option).

[x] Defaults vs required
  - ReviewComment ausente vs string vacío → ausente y empty string equivalentes; ambos persisten como NULL.

[x] Error semantics
  - Códigos explícitos: REVIEW_ALREADY_EXISTS, QUOTE_NOT_COMPLETED, COMMENT_TOO_LONG, FORBIDDEN, UNAUTHORIZED, REVIEW_FROZEN, REVIEW_NOT_FOUND.

[x] Concurrency
  - ¿Dos requests simultáneos del mismo Customer al mismo Quote? → first-write-wins via DB unique constraint + 409 CONFLICT.

[x] Tenancy (§45)
  - Cross-tenant attempts? → 404 (no leak FORBIDDEN vs NOT_FOUND signal).

[x] Compliance & retention
  - "Anonymized rating remains after hard-delete" — ¿qué significa? → rating se preserva con customerId=null, comment=null, only rating numeric value persisted.
```

**Output:** `docs/specs/provider-review.md` actualizado a Status: Clarified con clarifications log.

**HITL:** no formal.

**Validación:** §57 (vocabulary), checklist sistemático mejora #2.

---

### Step 7 — `/to-scenarios` (⛔ HITL #1)

**Skill invocado:** `/to-scenarios`.

**Input:** `docs/specs/provider-review.md` (Status: Clarified).

**Procesamiento:** genera draft de `.feature` con escenarios cubriendo cada FR + variantes de failure.

**Output (draft):**

`features/reviews/provider-review.feature`:

```gherkin
Feature: Provider review by Customer after Quote completion

  Background:
    Given an authenticated Customer "acme"
    And Provider "p_acme" exists
    And Quote "q_001" between "acme" and "p_acme" is in state "completed"

  @scn-200 @release @smoke
  Scenario: Customer submits a 5-star review with comment
    When the Customer submits a Review for Quote "q_001" with rating 5 and comment "Excellent service"
    Then a Review is created in state "published"
    And the email notification is enqueued for "p_acme"
    And the Provider review count increments by 1

  @scn-201 @release
  Scenario: Customer submits a 3-star rating without comment
    When the Customer submits a Review for Quote "q_001" with rating 3
    Then a Review is created in state "published"
    And the comment field is null

  @scn-202 @release
  Scenario: Duplicate review for same Quote rejected
    Given the Customer has already submitted a Review for Quote "q_001"
    When the Customer submits another Review for Quote "q_001" with rating 4
    Then the response is 409 with code "REVIEW_ALREADY_EXISTS"

  @scn-203 @release
  Scenario: Cannot review a Quote in non-completed state
    Given Quote "q_002" is in state "draft"
    When the Customer submits a Review for Quote "q_002" with rating 5
    Then the response is 422 with code "QUOTE_NOT_COMPLETED"

  @scn-204 @release
  Scenario: Comment exceeds 1000 chars rejected
    When the Customer submits a Review with a 1001-char comment
    Then the response is 422 with code "COMMENT_TOO_LONG"

  @scn-205 @release
  Scenario: Customer edits Review within editable window
    Given Customer published Review 6 days ago (within editable window)
    When the Customer edits the Review with rating 4 and comment "Updated impression"
    Then the Review is updated
    And a review.edited.v1 event is emitted

  @scn-206 @release
  Scenario: Customer cannot edit Review after frozen
    Given Customer published Review 8 days ago (frozen)
    When the Customer attempts to edit the Review
    Then the response is 409 with code "REVIEW_FROZEN"

  @scn-207 @release
  Scenario: Customer soft-deletes Review within 30 days
    Given Customer published Review 20 days ago
    When the Customer soft-deletes the Review
    Then the Review state becomes "soft_deleted"
    And it does not appear in public listings
    And it is still recoverable by admin

  @scn-208 @release
  Scenario: Hard delete after 30 days from soft-delete
    Given Customer soft-deleted Review 31 days ago
    When the daily cleanup job runs
    Then the comment is hard-deleted (set to NULL)
    And the rating value persists with customerId=NULL
    And event review.hard_deleted.v1 emitted

  @scn-209 @release
  Scenario: Unauthorized read on public endpoint
    When an unauthenticated request GETs /v1/providers/p_acme/reviews
    Then the response is 200 with the public reviews list

  @scn-210 @release @smoke
  Scenario: Cross-tenant attempt rejected
    Given another tenant "bigco" with Provider "p_bigco"
    When Customer "acme" attempts to submit a Review for "p_bigco" Quote
    Then the response is 404 with code "QUOTE_NOT_FOUND" (no signal of existence)

  @scn-211 @release
  Scenario: Email failure does not roll back Review
    Given the email adapter is unavailable
    When the Customer submits a Review with rating 5
    Then the Review is created in state "published"
    And the email is queued in outbox for retry (§17)
    And the Customer receives 201 with reviewId
```

**Total: 12 escenarios.**

### ⛔ HITL #1 — Aprobación de escenarios

> *"I've drafted 12 scenarios covering: happy paths (scn-200, scn-201), uniqueness (scn-202), validation failures (scn-203, scn-204), lifecycle (scn-205, scn-206, scn-207, scn-208), public access (scn-209), tenant isolation (scn-210), partial failure (scn-211).*
>
> *Please review `features/reviews/provider-review.feature`. Per §58, the agent will NOT modify this file once approved.*
>
> *Type:*
> - `yes` *to confirm and continue.*
> - `edit:<feedback>` *to revise specific scenarios.*
> - `block` *if the scenarios miss something critical."*

**Responsabilidad humana en este HITL:**

| Lo que el humano DEBE hacer | Lo que el humano NO debe hacer |
|---|---|
| Leer cada scenario y verificar que captura el comportamiento de negocio | Aprobar sin leer ("se ve bien") |
| Confirmar que el lenguaje usa vocabulario de CONTEXT.md | Discutir implementación técnica (esa es la spec, no scenarios) |
| Verificar que casos edge importantes están cubiertos | Pedir scenarios para casos out-of-scope (§31) |
| Validar que el comportamiento descrito ES el que el negocio quiere | Pedir scenarios fuera del alcance del slice |
| Aprobar el contrato Provider/Customer | Reescribir el lenguaje del scenario |
| Pedir nuevos scenarios si detecta gaps | Aprobar y luego pedir cambios después |

**Tiempo típico:** 10-20 min.

**Aprobación simulada:** `yes`.

**Validación de reglas tras aprobación:** §58 (.feature read-only para el agente desde este momento), §59 (scn-NNN IDs estables), §60 (tags @release/@smoke aplicados).

---

### Step 8 — `/to-issues`

**Skill invocado:** `/to-issues`.

**Input:** spec Clarified + `.feature` aprobado.

**Aplicación de mejora #1 (fricción aplicada): detección de nueva capability**

El skill detecta:
- Nuevo adapter: `src/infrastructure/adapters/output/email/` no existe previamente → **introduces-capability:email**.
- Sensitive (PII en comentario) → **require-human-review**.
- NO `ralph-ready` por ser primera capability email.

**Output:**

`issues/003-provider-review.md`:

```markdown
# Issue 003 — Provider review slice

## Scenarios covered
scn-200 a scn-211 (12 escenarios, ver features/reviews/provider-review.feature)

## Vertical slice
Customer submits Review → validation → uniqueness check → persist → outbox email → 201.
Lifecycle endpoints (edit, soft-delete) + public list endpoint included.
Email adapter introduced (first time).

## Estimated budget
~150000 tokens (greenfield + new capability + lifecycle + email integration).

## Constraints
- C.1 hexagonal, C.6 tenant, C.8 PII retention.
- §27 authz, §45 tenancy, §46 idempotency, §47 pagination, §17 outbox.
- §4 input boundary parsing (comment trim, rating validation).
- §52 timeout on email adapter.
- New EmailPort interface; first time email is used.
- New cron-like job for hard-delete cleanup at day 30.
```

### Labels (vía `gh issue create`):

```
severity:p2
shift:hitl                         # sensitive + new capability
scenarios:scn-200,scn-201,...,scn-211
budget:150k
require-human-review              # §64 sensitive (PII)
introduces-capability:email        # §63 first email adapter
```

**No `ralph-ready`** (forbidden por `introduces-capability:*` en primera iteración).

**HITL:** no formal (el humano puede revisar el issue antes de proceder, pero no se detiene el workflow).

**Responsabilidad humana:** revisar que el budget de 150k es razonable; si no, pedir descope.

**Validación:** §63 introduces-capability, §64 require-human-review, §107 multi-module mode (NO en este caso).

---

### Step 9 — `/plan`

**Skill invocado:** `/plan`.

**Input:** issue + scenarios + AGENTS.md + CONTEXT.md + constitution.

**Carga progresiva de reglas (9 archivos):**
- `core/02-architecture.md`, `core/05-domain-modeling.md`, `core/08-testability.md` (always)
- `core/06-commands-and-security.md` (use cases + auth)
- `core/07-infrastructure.md` + `core/10-cross-cutting.md` (DB + tenancy + outbox + pagination)
- `core/04-input-boundaries.md` (POST endpoints)
- `capabilities/typescript/03-style.md`, `capabilities/typescript/11-async.md`, `capabilities/typescript-hono/09-stack-conventions.md`.

**Output (resumido):**

```
Layers affected:
- Domain:
  - src/domain/reviews/review.ts (entity class with edit, softDelete, freeze methods)
  - src/domain/reviews/review-state.ts (closed set)
  - src/domain/reviews/rating.ts (value object with factory)
  - src/domain/reviews/review-comment.ts (value object, optional)
  - src/domain/reviews/errors/review-codes.ts (closed set of Result codes)
  - src/domain/reviews/ports/review.repository.ts
  - src/domain/reviews/ports/quote-reader.port.ts (read-only port to verify Quote state)
- Application:
  - src/application/use-cases/reviews/submit-review.use-case.ts
  - src/application/use-cases/reviews/edit-review.use-case.ts
  - src/application/use-cases/reviews/soft-delete-review.use-case.ts
  - src/application/use-cases/reviews/list-public-reviews.use-case.ts (with §47 pagination)
  - src/application/use-cases/reviews/hard-delete-expired-reviews.use-case.ts (job)
  - src/application/dtos/submit-review.dto.ts
  - src/application/ports/email.port.ts (new — first email adapter)
- Infrastructure:
  - src/infrastructure/adapters/output/email/sendgrid-email.adapter.ts
  - src/infrastructure/adapters/output/persistence/drizzle/schema/reviews.ts
  - src/infrastructure/adapters/output/persistence/drizzle/repositories/drizzle-review.repository.ts
  - src/infrastructure/adapters/input/http/routes/v1/review.routes.ts
  - src/infrastructure/adapters/input/http/routes/v1/provider-reviews.routes.ts (public read)
  - src/infrastructure/jobs/hard-delete-reviews.job.ts (daily cron)
  - migration 0010_create_reviews.ts
- Tests:
  - tests/reviews/review.domain.test.ts (state machine, value objects, ~10 tests)
  - tests/reviews/submit-review.use-case.test.ts (12 tests, one per scn-NNN)
  - tests/reviews/edit-review.use-case.test.ts
  - tests/reviews/soft-delete-review.use-case.test.ts
  - tests/reviews/list-public-reviews.use-case.test.ts (with pagination)
  - tests/reviews/hard-delete-expired.use-case.test.ts (cron logic with FakeClock)
  - tests/reviews/sendgrid-email.adapter.integration.test.ts (with email sandbox)
  - features/reviews/steps/review.steps.ts (step definitions invoking use cases)

Rules applied per layer:
- §3, §4, §11 (rating as integer 1-5), §17 (outbox), §19 (Result types), §22, §27, §36
- §44 (Drizzle separate from domain), §45, §46, §47, §52
- §61 step defs invoke use cases, §92 fails-first

Dependency graph: ~16 ordered tasks.
Estimated tokens: ~140k (within 150k budget).
```

**HITL:** no formal.

**Responsabilidad humana:** verificar que el plan respeta el budget y que el dependency graph es razonable.

**Validación:** §3 hexagonal direction explícita, §47 pagination, §17 outbox para email, §52 timeout.

---

### Step 10 — `/tdd` (Red-Green-Refactor)

**Skill invocado:** `/tdd`.

**Carga progresiva de reglas (12 archivos):** los del plan + `core/15-observability.md` (§77 estructurado, §78 dot.notation, §80 event on close).

**Procesamiento:**

#### Red phase (todos los tests fallando):

12 tests para el use case + 10 para el domain + 8 para adapters + step definitions = ~30 tests escritos primero.

```ts
// tests/reviews/submit-review.use-case.test.ts (representativo)
test("scn-200: Customer submits 5-star review with comment", async () => {
  const result = await useCase.execute(
    {
      quoteId: "q_001",
      rating: 5,
      comment: "Excellent service",
    },
    { customerId: "acme", requestId: "req-1" }
  );

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("unexpected");

  // §19 Result type
  expect(result.reviewId).toBeDefined();

  // §17 outbox event enqueued
  expect(outbox.lastEvent()).toMatchObject({
    type: "review.published.v1",
    payload: { reviewId: result.reviewId, providerId: "p_acme" },
  });

  // §80 use case emits log event
  expect(logger.lastEvent()).toMatchObject({
    event: "review.published",
    details: { reviewId: result.reviewId },
  });
});
```

Run all tests → **30 failing.** Commit:

```
test: red — provider-review slice (30 tests for scn-200..scn-211 + lifecycle) issue #003
```

#### Green phase (implementación mínima):

Sigue el dependency graph del plan. Implementa cada archivo en orden. Después de cada commit incremental, corre el test correspondiente.

```ts
// src/application/use-cases/reviews/submit-review.use-case.ts (fragment)
export class SubmitReviewUseCase {
  constructor(
    private readonly reviews: ReviewRepositoryPort,
    private readonly quotes: QuoteReaderPort,
    private readonly outbox: OutboxPort,
    private readonly clock: ClockPort,
    private readonly ids: IdGeneratorPort,
  ) {}

  async execute(
    input: SubmitReviewInput,
    ctx: RequestContext,
  ): Promise<SubmitReviewResult> {
    // §27 auth
    if (ctx.customerId === null) {
      return { ok: false, code: "UNAUTHORIZED" };
    }

    // §4 input validation (Zod already validated; defense in depth per §28)
    const ratingResult = Rating.from(input.rating);
    if (!ratingResult.ok) return ratingResult;
    const commentResult = ReviewComment.from(input.comment ?? null);
    if (!commentResult.ok) return commentResult;

    // §27 + §45: verify Quote belongs to this Customer in this tenant
    const quote = await this.quotes.findById(input.quoteId, ctx.tenantId);
    if (quote === null || quote.customerId !== ctx.customerId) {
      return { ok: false, code: "QUOTE_NOT_FOUND" }; // §27 leak avoidance
    }
    if (quote.state !== "completed") {
      return { ok: false, code: "QUOTE_NOT_COMPLETED" };
    }

    // FR-2: uniqueness
    const existing = await this.reviews.findByQuoteAndCustomer(input.quoteId, ctx.customerId);
    if (existing !== null) {
      return { ok: false, code: "REVIEW_ALREADY_EXISTS" };
    }

    // Create review
    const review = Review.create({
      id: this.ids.reviewId(),
      customerId: ctx.customerId,
      providerId: quote.providerId,
      quoteId: input.quoteId,
      rating: ratingResult.value,
      comment: commentResult.value,
      createdAt: this.clock.now(),                    // §25
    });

    // Persist + outbox event in single transaction (§16)
    await this.reviews.saveWithEvent(review, ctx.tenantId, {
      type: "review.published.v1",
      payload: { reviewId: review.id, providerId: review.providerId, rating: review.rating.value },
    });

    // §80 emit close event
    ctx.logger.info({
      event: "review.published",
      details: { reviewId: review.id, providerId: review.providerId }, // §79 no PII
    });

    return { ok: true, reviewId: review.id.value };
  }
}
```

Run all 30 tests → **30 passing.** Commit:

```
feat: green — submit-review use case implementation (scn-200, 201, 202, 203, 204, 210, 211) issue #003
```

(Y otros commits para edit, soft-delete, hard-delete, public list.)

#### Refactor phase:

- Extract helper `validateQuoteOwnership(quote, ctx): Result` reusado en 3 use cases.
- Named constant `EDITABLE_WINDOW_DAYS = 7`, `SOFT_DELETE_RETENTION_DAYS = 30` para evitar magic numbers (§10).
- Rename `findByQuoteAndCustomer` → `findByCompositeKey` (mejor naming §22).

Tests siguen pasando.

#### §92 verification (fails-first cycle):

Para 2 tests representativos, ciclo Write→Pass→Revert→Fail→Restore→Pass ejecutado. ✓

**Output:**

```
Tests:           30 passed
Coverage:        domain 94%, application 88%, infrastructure 72% (matches C.2)
Lint:            clean
Typecheck:       clean
Commits:         8 (1 red + 6 green incrementales + 1 refactor)
```

**HITL:** no formal.

**Validación:** §3 hexagonal, §19 Result types, §27 authz, §45 tenant, §17 outbox, §25/§26 inject clock/ids, §92 fails-first verified.

---

### Step 11 — `/run-acceptance` (gate)

**Skill invocado:** `/run-acceptance`.

**Procesamiento:**

```
Step 1 Pre-flight: ✓ branch + .feature unchanged from approved
Step 2 @smoke: scn-200 ✓, scn-210 ✓
Step 3 @release for slice: 12/12 ✓
Step 4 Visual gate (§104):
  - Review form (rating selector + comment textarea + submit button):
    ✓ Mobile/tablet/desktop responsive
    ✓ Dark mode
    ✓ Accessibility (rating stars labeled, textarea labeled)
    ✓ Empty/loading/error states visible
    ✓ Console clean
  - Public review list (paginated):
    ✓ All checks pass
Step 5 Schemathesis (§105):
  - POST /v1/reviews: 81 fuzzed inputs, 0 unexpected 5xx ✓
  - GET /v1/providers/:id/reviews: 47 fuzzed inputs, 0 unexpected 5xx ✓
Step 6 Stub detection (§106): ✓ no stubs
Step 7 SLO benchmark (§83):
  - POST /v1/reviews p95: 287 ms ≤ 500 ms target ✓
  - GET /v1/providers/:id/reviews p95: 142 ms ≤ 300 ms target ✓
Step 8 Reviewer agent (§114): (see below)
```

#### Reviewer agent invocation

```markdown
# Code review — provider-review slice

**Diff:** 27 files, 1.142 lines added
**Rules loaded (progressive disclosure):**
  always: §1, §3, §19, §22, §35
  domain: §5-§10, §11, §33, §36, §37
  application: §12, §13, §27, §28, §15-§18
  infrastructure: §38-§44, §45, §46, §47, §52
  inputs: §4, §34
  bdd: §56-§62, §103-§106
  async: §51, §52
  observability: §77-§80

## 🛑 Blocking findings (0)

## ⚠️ Should fix (1)

### 1. §19 — Inconsistent Result type usage
**File:** src/application/use-cases/reviews/edit-review.use-case.ts:54
**Issue:** Returns `{ ok: true, review }` (full entity) but §13 says mutation APIs
return IDs/status, not full entities.
**Fix:** Return `{ ok: true, reviewId, updatedAt }` instead.

## 💡 Suggestions (3)

### 2. §22 — Naming
**File:** src/domain/reviews/review.ts:32
**Issue:** `freeze()` method could be `transitionToFrozen()` for consistency with PRD vocabulary.

### 3. §47 — Pagination edge case
**File:** src/application/use-cases/reviews/list-public-reviews.use-case.ts
**Issue:** Empty page returns `{items: [], nextCursor: null}`. Could explicitly document this behavior in the contract.

### 4. §17 — Outbox retry
**Suggestion:** Document the email retry policy (linear vs exponential backoff) in `docs/specs/provider-review.md` as ADR follow-up.

## What the author got right
- §3 Domain has zero infrastructure imports.
- §19 Result types with `code` everywhere except the noted exception.
- §27 Auth check before any state mutation.
- §45 tenantId in every repository method.
- §17 outbox pattern correctly used for email side-effect.
- §46 IdempotencyMiddleware on POST /v1/reviews.
- §92 fails-first verified for submit use case.
- Coverage exceeds C.2 thresholds.

## Summary
| | Count |
|---|---|
| 🛑 | 0 |
| ⚠️ | 1 |
| 💡 | 3 |

**Recommendation:** merge after author addresses the 1 Should-fix.
```

**Aplicación de mejora #4 (retry policy explícita):**

| Outcome | Action |
|---|---|
| 0 🛑 blocking + 1 ⚠️ should-fix | Continue to Step 12; reviewer report goes in PR body |

El developer arregla el should-fix (5 min, 1 commit) y re-corre `/run-acceptance` para verificar. **Pass.**

**HITL:** no formal en el gate, pero el should-fix lleva al developer a una mini-iteración.

**Validación:** todas las §N listadas en el reviewer report.

---

### Step 12 — `/security-hardening` + `/traceability-matrix` + ⛔ HITL #3

#### `/security-hardening` (con HITL #2 nuevo — threat model approval)

```
Step 1 Sensitive scope: ✓ touches PII (comments)
Step 2 §87 threat model:
  - docs/threat-models/provider-review.md does NOT exist
  - Generating STRIDE draft...
  - Draft saved to docs/threat-models/provider-review.draft.md
```

### ⛔ HITL #2 — Aprobación del threat model

> *"A new threat model has been drafted at `docs/threat-models/provider-review.draft.md`. §87 requires explicit human approval before the security audit can proceed.*
>
> *Please review the STRIDE draft and:*
> - *`approve`: rename `.draft.md` → `.md`, treat as authoritative.*
> - *`edit:<notes>`: revise specific rows, then re-run /security-hardening.*
> - *`block`: the slice cannot proceed; reject the spec or reduce scope to avoid the trust boundary."*

**Contenido del draft** (que el humano debe revisar):

```markdown
# Threat model — Provider review (DRAFT)

## STRIDE

### Spoofing
- **Threat:** Customer impersonates another Customer to publish a Review.
- **Mitigation:** §27 authz check + §45 tenant scope.
- **Residual risk:** Compromise of Customer account (out of scope; covered by auth feature).

### Tampering
- **Threat:** Review payload modified in transit.
- **Mitigation:** HTTPS + Zod validation at perimeter (§4).
- **Residual risk:** None known.

### Repudiation
- **Threat:** Customer claims they didn't post a Review.
- **Mitigation:** review.published.v1 event in outbox with customerId + timestamp; immutable audit trail.
- **Residual risk:** Account compromise; not in scope.

### Information Disclosure
- **Threat:** Review comment leaks PII publicly.
- **Mitigation:** Customer warned in UI before submit; comment is public by design (informed consent).
- **Residual risk:** Customer mistakenly puts PII in comment. Mitigation: future UI warning + admin tools.

### Denial of Service
- **Threat:** Review spam by single Customer.
- **Mitigation:** Unique constraint (1 per Quote); rate limit middleware.
- **Residual risk:** Distributed spam (out of scope for v1).

### Elevation of Privilege
- **Threat:** Customer modifies another Customer's Review.
- **Mitigation:** Authorization check in edit/delete use cases.
- **Residual risk:** None known.
```

**Responsabilidad humana en HITL #2:**

| Lo que el humano DEBE hacer | Lo que el humano NO debe hacer |
|---|---|
| Leer cada row STRIDE | Aprobar sin leer |
| Evaluar si los residual risks son aceptables para el negocio | Inventar amenazas hipotéticas no realistas |
| Decidir entre mitigate / accept / transfer cada amenaza | Pedir mitigaciones imposibles |
| Confirmar que cubre el surface real del slice | Aprobar y pedir cambios después |
| Si hay duda → `edit:<notes>` con cambios concretos | Aprobar mecánicamente |

**Tiempo típico:** 15-30 min para slice sensitive.

**Aprobación simulada:** `approve`.

→ `docs/threat-models/provider-review.draft.md` renombrado a `.md`. Auditable a partir de este momento.

#### Continuación de `/security-hardening`:

```
Step 3 gitleaks: ✓ no secrets in diff
Step 4 npm audit:
  - sendgrid@7.7.0 (new dep) — no CVEs
Step 5 semgrep (PII paths): ✓ no findings
Step 6 §27 authz audit: ✓ verified
Step 7 §45 tenant audit: ✓ verified
Step 8 §52 timeouts: ✓ 5s on email + outbox
Step 9 §88 secrets: ✓ SENDGRID_API_KEY via env (parsed at startup §34)

Decision: ✓ CLEAR
```

#### `/traceability-matrix`

```
docs/audit/traceability-v0.3.0-reviews.md generated.

| scn-NNN | Feature file | Issue | PR | Constitution | SLO |
|---|---|---|---|---|---|
| scn-200..211 | features/reviews/provider-review.feature | #003 | #PR-200 | C.1, C.6, C.7, C.8 | p95 287ms ≤ 500ms ✓ |

Events registered (added to docs/events.md):
- review.published.v1
- review.edited.v1
- review.soft_deleted.v1
- review.hard_deleted.v1
```

### ⛔ HITL #3 — Aprobación del PR draft (merge gate)

`gh pr create --draft` ejecutado. Notificación al developer:

> *"Feature complete. Draft PR #PR-200 ready for review:*
> - `agent/feature-provider-review-003` — 12 scenarios passed*
>
> *Reviewer: 0 blocking (after iteration), 3 suggestions.*
> *Security: CLEAR.*
> *Traceability: docs/audit/traceability-v0.3.0-reviews.md*
> *Threat model: docs/threat-models/provider-review.md (approved 2026-06-01 by @reviewer)*
> *SLO: p95 287ms ≤ 500ms ✓*
>
> *No PRs auto-merge. Review, mark ready when satisfied, merge."*

**Responsabilidad humana en HITL #3:**

| Lo que el humano DEBE hacer | Lo que el humano NO debe hacer |
|---|---|
| Leer el diff completo (líneas por línea para sensitive paths) | Aprobar por ojeada superficial |
| Verificar que el reviewer report no escondió hallazgos críticos | Confiar 100% en el reviewer sin verificar |
| Probar manualmente el endpoint (al menos happy path) | Solo correr CI |
| Verificar que la UI se ve como se esperaba | Ignorar el visual gate |
| Comentar dudas / pedir cambios concretos | Aprobar y reportar problemas después del merge |
| Mark ready → merge cuando esté satisfecho | Mergear sin marcar ready (rompe §67) |

**Tiempo típico:** 30-60 min para slice greenfield + new capability.

**Aprobación simulada:** humano revisa, agrega 1 comentario sobre la UI label de rating, developer arregla en 1 commit, humano mark ready → merge.

---

### Step 13 — Post-merge close-out

Triggered automáticamente por el merge (vía webhook GitHub o invocación manual).

**Acciones (todas idempotentes):**

```
✓ Step 13 — Post-merge close-out for #003

1. Re-running /traceability-matrix on merged commit a3b9f12
   → docs/audit/traceability-v0.3.0-reviews.md updated with final commit hash
2. Issue #003 updated:
   - PR link: #PR-200
   - Merged at: 2026-06-01T16:42:00Z
   - Label ralph-done → released
   - Closed
3. Spec docs/specs/provider-review.md: Status Clarified → Released
4. docs/events.md updated:
   - + review.published.v1
   - + review.edited.v1
   - + review.soft_deleted.v1
   - + review.hard_deleted.v1
5. docs/audit/incidents.md: no incident this slice
6. No deploy trigger (manual gate)
7. Session log: feature.released.v1 emitted

Lifecycle closed.
```

### Sub-HITL post-Step 13 — Promoción de capability `email`

Después del merge exitoso de la primera feature con `introduces-capability:email`, el framework sugiere (no obliga):

> *"Capability `email` was introduced for the first time in this slice. The patterns used (SendGrid adapter, outbox event, retry policy) may become the standard for future email features. Consider:*
>
> *Option A: Create `docs/engineering/capabilities/email/SKILL.md` documenting the conventions. Future slices using email can then be `ralph-ready`.*
> *Option B: Wait until 2-3 features use email to extract patterns from real usage.*
> *Option C: Defer indefinitely."*

**Responsabilidad humana en este sub-HITL:**

| Decisión | Cuándo |
|---|---|
| Opción A — promover ahora | El equipo está seguro del patrón; quiere desbloquear futuras features email |
| Opción B — esperar | Patrón aún ajustándose; promover prematuro causaría retrabajo |
| Opción C — no documentar | Email es uso único; no se va a repetir |

**Tiempo típico:** decisión rápida (5 min) si el equipo ya lo discutió en el PR review.

---

## 5. Flujo de bug fix (`/debug`)

### Trigger

Un bug es reportado en la issue tracker. El humano (o automation) corre `/triage` para clasificarlo:

```
/triage --issue 042
```

`/triage` aplica:
- `severity:p0/p1/p2`
- `incident:production` si el bug llegó a producción con impacto real
- `type:bug`
- `shift:hitl` (los P0/P1 production siempre hitl)

### Flujo manual paso a paso

**Step 1 — `/debug` arranca:** lee el issue + cualquier stack trace, logs, screenshots.

**Step 2-3 — `/debug` invoca `/diagnose` internamente:** reproduce → minimise → hypothesise → instrument → identifica root cause.

**Output de `/diagnose`:**

`.planning/diagnoses/quote-expiry-bypass-20260601.md`:

```markdown
# Diagnosis — quote-expiry-bypass

## Reproduction
$TEST_CMD tests/integration/quote-expiry.test.ts (deterministic 10/10 runs)

## Verified cause
isExpired() in src/application/use-cases/quotes/accept-quote.use-case.ts:34
uses `new Date()` instead of `this.clock.now()`. Drift between server UTC and
client tz can bypass the expiry check.

## Fix direction
Inject ClockPort (§25); replace new Date() with clock.now().

## Regression test ready
tests/quotes/accept-quote.use-case.test.ts — new test exercises the timezone case.
```

**HITL:** no formal en `/diagnose` (puramente analítico).

**Step 4 — `/tdd` para el fix:**

- Red: regression test que captura el bug (failing).
- Green: aplicar fix mínimo (1 línea: cambiar `new Date()` por `this.clock.now()`).
- §92 fails-first verified.

**Step 5 — `/run-acceptance`:** verifica que el fix no rompe otros scenarios + el regression test pasa.

**Step 6 — `/code-review` (reviewer agent) + opcional `/security-hardening` si bug era de seguridad.**

### ⛔ HITL — Aprobación del PR de fix (HITL #3 reutilizado)

Mismo HITL que en feature flow. Responsabilidad humana:

- Verificar que el fix es root cause, no symptom patch (§93).
- Verificar que el regression test realmente captura el bug.
- Decidir si requiere postmortem (§95 + nueva regla: solo si `incident:production` label).

### Post-merge — `/postmortem` (si aplica)

**Solo si el issue tiene `incident:production` label.**

`/postmortem --issue 042` genera draft → humano lo refina → publica en `docs/postmortems/2026-06-01-quote-expiry-bypass.md`.

### Sub-HITL — Aprobación del postmortem

| Lo que el humano DEBE hacer | Lo que el humano NO debe hacer |
|---|---|
| Verificar que el postmortem es **blameless** (sistemas, no personas) | Asignar culpa a individuos |
| Confirmar timeline contra logs reales | Confiar en el draft sin verificar |
| Refinar "Lessons learned" con perspectiva humana | Aceptar lessons genéricas del agente |
| Asignar action items concretos a owners | Dejar action items sin owner |
| Firmar como reviewer externo al response team | Auto-aprobar siendo del response team |

**Tiempo típico:** 1-2 horas para un P0 production.

---

## 6. Flujo de improvement (`/optimize` y otros)

Los improvements tienen sub-skills específicos por categoría:

| Categoría | Skill |
|---|---|
| Performance optimization | `/optimize` |
| Refactor sin behavior change | usar `/tdd` con plan refactor (§102) |
| Tech debt reduction | `/improve-codebase-architecture` → genera issues → `/feature` flow normal |
| Security hardening proactivo | `/security-hardening` invocado manualmente |
| Dependency upgrade | Runbook embebido en §100 (Renovate/Dependabot) |

### Ejemplo: `/optimize`

**Trigger:** un endpoint excede el SLO declarado en `docs/slos.md`.

**Flujo:**

1. `/optimize --endpoint POST /v1/reviews` — el skill lee el SLO target.
2. **Step 1: MEASURE** — baseline con k6/wrk, guarda en `docs/perf-baselines/reviews-post.md`.
3. **Step 2: IDENTIFY** — profile (flamegraph, query plan), identifica bottleneck mecánicamente.
4. **Step 3: FIX** — `/tdd` para el cambio.
5. **Step 4: VERIFY** — re-measure, debe vencer el target.
6. **Step 5: GUARD** — perf budget en CI o benchmark test.

**HITL:** sub-HITL si el fix requiere descope o cambio de SLO.

**Responsabilidad humana:**

| Lo que el humano DEBE hacer | Lo que el humano NO debe hacer |
|---|---|
| Aprobar el baseline antes de optimizar | Optimizar sin baseline (§97 violación) |
| Decidir si el target SLO necesita ajuste (raise/lower) | Bajar SLO porque "no se puede alcanzar" sin justificación |
| Verificar que el guard (perf budget) catchea regresiones futuras | Mergear sin guard |

---

## 7. Flujo brownfield (sub-flow B1-B5)

**Trigger:** el feature toca código legacy con cobertura <50% O cruza bounded contexts O modifica APIs públicas con consumers externos.

Los Steps B1-B5 **preceden** a `/specify` en el flujo principal:

### Step B1 — `/grill-with-docs`

Interroga el código existente, no al humano. Captura la **realidad del código actual** antes de proponer cambios.

**Output:** `.planning/grilling-docs/<module>-<date>.md` con public surface, implicit invariants, git history signals, drift vs CONTEXT.md.

### Step B2 — `/characterization-tests`

Si cobertura <50%, **mandatorio** escribir tests que documenten el comportamiento actual (incluyendo bugs).

**Output:** suite de tests `char-001`, `char-002`, ... committed en su propio PR antes de cualquier modificación.

**HITL:** sub-HITL — revisar que los characterization tests capturan el comportamiento real, no el ideal.

### Step B3 — `/domain-model` (re-aplica)

Con la información de B1, refina CONTEXT.md para que refleje la realidad del código (no la aspiracional).

### Step B4 — `/impact-analysis`

Mapea el blast radius del cambio propuesto.

**Output:** `.planning/impact/<change>-<date>.md` con consumers directos, transitivos, tests at risk, external consumers.

**Responsabilidad humana:** evaluar si el blast radius es manejable. Si no, ir a B5.

### Step B5 — Decisión: in-place vs strangler

**HITL crítico** — el humano decide:

| Opción | Cuándo |
|---|---|
| **In-place** — modificación directa con safety net | Cambio acotado, blast radius manejable |
| **Strangler** — invocar `/strangler-plan` | Cambio grande, blast radius alto, riesgo de rollback complejo |

**Responsabilidad humana en B5:**

| Lo que el humano DEBE hacer | Lo que el humano NO debe hacer |
|---|---|
| Leer el impact analysis completo | Decidir sin leer el análisis |
| Evaluar tolerancia al riesgo del cambio | Elegir lo más fácil sin evaluar |
| Considerar timing (mid-sprint vs nueva release) | Forzar strangler innecesariamente (overkill) |
| Comprometer al equipo a la decisión | Elegir y luego cambiar mid-flujo |

Después de B5 (in-place), el flujo continúa al `/specify` regular del flujo principal con el contexto brownfield baked-in.

---

## 8. Inventario de HITLs y responsabilidades

### Mapa visual de los HITLs del flujo principal

```
/feature flow:
├─ Step 1-6: skills sin HITL formal (developer puede revisar outputs)
├─ Step 7 ⛔ HITL #1: APPROVE SCENARIOS (Gherkin)
│   └─ Responsabilidad: confirmar contrato de comportamiento
├─ Step 8-10: skills sin HITL formal
├─ Step 11 (Schemathesis 🛑 blocking → retry policy automático, no HITL)
├─ Step 12.1 ⛔ HITL #2: APPROVE THREAT MODEL (si sensitive)
│   └─ Responsabilidad: aceptar/mitigate/transfer residual risks
├─ Step 12.2-3: skills sin HITL
├─ ⛔ HITL #3: APPROVE DRAFT PR (merge gate)
│   └─ Responsabilidad: verificar diff + UI + mergeable
└─ Step 13 (post-merge): sub-HITL CAPABILITY PROMOTION si new capability
    └─ Responsabilidad: decidir si documentar como capability
```

### Tabla completa de HITLs

| HITL | Cuándo | Quién | Decisión | Tiempo |
|---|---|---|---|---|
| **HITL #0a** Setup answers | Una vez por proyecto | Tech lead | Stack + compliance + vocabulary | 15-30 min |
| **HITL #0b** Constitution | Una vez (re-revisar anual) | Tech lead + 1+ senior | Tenets no-negociables | 30-60 min |
| **HITL #1** Scenarios approval | Step 7 de cada feature | Product owner / QA lead | Aprobar contrato de comportamiento | 10-20 min |
| **HITL #2** Threat model approval | Step 12 si sensitive | Security lead / senior engineer | Aceptar residual risks | 15-30 min |
| **HITL #3** PR draft approval | Step 12 final de cada feature | Reviewer engineer (no autor) | Verificar diff + ready to merge | 30-60 min |
| **HITL B5** In-place vs strangler | Brownfield sub-flow | Tech lead + product | Decisión arquitectónica de risk | 15-30 min |
| **HITL postmortem** | Después de bug `incident:production` | Tech lead + senior fuera del response team | Firmar blameless | 1-2 horas |
| **HITL capability promote** | Post-merge si new capability | Tech lead | Documentar como capability o esperar | 5-15 min |
| **HITL improvement scope** | Antes de improvement work | Tech lead | Priorizar via ICE rubric | 10 min |

### Anti-patrones de HITL (errores comunes)

| Anti-patrón | Problema | Solución |
|---|---|---|
| Aprobar sin leer | El HITL pierde su valor; bugs/contratos malos pasan | Time-box: cada HITL tiene un tiempo mínimo de revisión esperado |
| "Yo después reviso" — aprobar y revisar luego | Compromete el flujo; post-merge problems caen en producción | Política: si no tienes tiempo ahora, devuelve el HITL al day siguiente |
| Convertir todo en checkpoint duro | Workflow se vuelve burocrático | Solo las 8-9 decisiones críticas son HITL; el resto fluye |
| Hacer al reviewer agent el "responsable final" | El agente no toma decisiones políticas; siempre es un humano | El reviewer agent informa; el humano decide |
| Compartir HITLs entre roles | Confusión sobre quién aprobó qué | Cada HITL tiene un dueño claro (tabla arriba) |

---

## 9. Referencia rápida — skills, inputs, outputs

### Workflow skills (orden típico del flujo principal)

| Skill | Input principal | Output principal | HITL |
|---|---|---|---|
| `/constitution` | Template + interview 6Q | `docs/constitution.md` | HITL #0b |
| `/setup` | Wizard 6-8Q | `AGENTS.md`, scaffold, hooks | HITL #0a |
| `/onboard` | (nothing) | Orientación al developer | — |
| `/grill-me` | Feature desc + CONTEXT | `.planning/grilling/<slug>-*.md` | — |
| `/domain-model` | Grilling + CONTEXT | Updated CONTEXT.md + ADRs | — |
| `/specify` | Grilling + CONTEXT + constitution | `docs/specs/<slug>.md` Draft | — |
| `/clarify` | Spec Draft | Spec Clarified (con 7-cat checklist) | — |
| `/to-scenarios` | Spec Clarified | `.feature` DRAFT | ⛔ **HITL #1** |
| `/to-issues` | Spec + .feature aprobado | GitHub issues + contracts si multi-mod | — |
| `/plan` | Issue + scenarios + AGENTS.md | Plan in issue body con file paths + dep graph | — |
| `/tdd` | Issue + plan + .feature | Source + tests + step defs | — |
| `/run-acceptance` | Branch + scn labels + slos | `.planning/acceptance/*` + reviewer report | — |
| `/code-review` | PR/branch | Reviewer report (invoca reviewer agent) | — |
| `/security-hardening` | Diff + sensitive paths | Security audit + threat model | ⛔ **HITL #2** if new threat model |
| `/traceability-matrix` | Features + acceptance + reviews | `docs/audit/traceability-<v>.md` | — |
| (merge by human) | — | — | ⛔ **HITL #3** |
| `/feature --close` | Merged PR | Spec → Released, events sync, issue closed | — |

### Operational & utility skills

| Skill | Cuándo | Output |
|---|---|---|
| `/debug` | Bug fix workflow | Draft PR + regression test + diagnosis |
| `/diagnose` | Standalone investigation | `.planning/diagnoses/*` |
| `/postmortem` | Post-incident if `incident:production` | `docs/postmortems/<date>-<slug>.md` draft |
| `/optimize` | Endpoint exceeds SLO | Perf optimization PR + baseline + guard |
| `/handoff` | Context near saturation | `mktemp` handoff file |
| `/triage` | Issue without labels | Labels applied + routing decision |
| `/prototype` | Open design question | `.planning/prototypes/*/LEARNING.md` |

### Brownfield skills (sub-flow B1-B5)

| Step | Skill | Output |
|---|---|---|
| B1 | `/grill-with-docs` | Public surface inventory + drift |
| B2 | `/characterization-tests` | Tests documenting current behavior |
| B3 | `/domain-model` (re-apply) | Updated CONTEXT.md with reality |
| B4 | `/impact-analysis` | Blast radius report |
| B5 | (HITL decision) | In-place OR `/strangler-plan` |

---

## Apéndice: comandos útiles del día a día

```bash
# Inicio de proyecto
/setup
/constitution
/onboard

# Por cada feature (flujo manual)
/grill-me "<feature description>"
/domain-model
/specify
/clarify
/to-scenarios                              # ⛔ HITL #1 aquí
/to-issues
/plan
/tdd                                       # red-green-refactor
/run-acceptance                            # gates + reviewer agent
/security-hardening                        # ⛔ HITL #2 si sensitive
/traceability-matrix
gh pr create --draft                       # ⛔ HITL #3 antes de merge
# (humano marca ready y mergea)
/feature --close <issue>                   # Step 13 post-merge

# O todo en uno (flujo orquestado)
/feature "<feature description>"

# Bug fix
/triage --issue <NNN>                      # clasifica
/debug --issue <NNN>                       # invoca /diagnose + /tdd + /run-acceptance
# Si incident:production:
/postmortem --incident <NNN>               # draft

# Improvement
/optimize --endpoint <path>                # con baseline obligatorio
/improve-codebase-architecture             # surface refactor candidates

# Cuando contexto se satura
/handoff --issue <NNN>                     # compact session

# Para nuevo developer en el equipo
/onboard
```

---

## Cierre

Este documento es la guía operacional. Las reglas detalladas viven en `docs/engineering/core/`. El framework está diseñado para ser **escaneable**: lees solo lo que necesitas en cada momento.

**Si tu primer instinto es saltarte un HITL — léelo dos veces.** Los 8 HITLs son los puntos donde el framework refuerza que **el humano dirige**. Saltárselos convierte Stormhelm en automatización ciega, que es exactamente lo que el framework existe para prevenir.

**Si tu primer instinto es duplicar un HITL — léelo una vez.** El framework no quiere supervisión teatral; quiere decisiones humanas en los puntos exactos donde aportan valor único.

Para feedback sobre esta guía o sugerencias de mejora basadas en uso real, comenta en el repositorio o pinea un mensaje al tech lead.

---

*Última actualización: 2026-06-01*
*Versión del framework: Stormhelm v1.0 (122 reglas, 30 skills, 1 agente, 4 hooks, 13 steps en flujo principal)*
