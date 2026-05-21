# Constitución del proyecto — task_flow

> **Status:** stub inicial (sin ratificar)
>
> **Cómo usar este archivo:** la constitución es la palabra final de tu proyecto. Si una regla §N del framework (`docs/engineering/core/*.md`) dice algo distinto a lo aquí escrito, **gana este archivo**. Es el único lugar donde personalizas Stormhelm para tu proyecto sin tocar las reglas globales.
>
> **Cómo construirla:** corre `/constitution` para una sesión guiada. La skill te pregunta tenets, restricciones de stack, decisiones de dominio, y SLOs default; tú apruebas cada decisión.

---

## Plantilla — completa antes del primer `/feature`

### 1. Tenets del proyecto

Lista 3-7 principios no-negociables que rigen este proyecto. Ejemplos:

- C.1 — Toda mutación de estado de negocio emite un evento de dominio (§17).
- C.2 — Money se representa como `bigint` en centavos. Nunca `number` ni `string`.
- C.3 — Endpoints públicos cumplen SLO p99 < 200ms (sobreescribe §83 default).

*(Reemplaza con tus tenets.)*

### 2. Stack obligatorio

- **Runtime:** *(p. ej. Node.js 22 LTS)*
- **Lenguaje:** *(p. ej. TypeScript strict)*
- **Framework HTTP:** *(p. ej. Hono)*
- **Persistencia:** *(p. ej. PostgreSQL 16 + Drizzle ORM)*
- **Tests:** *(p. ej. Vitest + Cucumber.js)*
- **Capability activa:** `typescript-hono`

### 3. Dominios y bounded contexts

- `tasks` — gestión de tareas (CRUD, asignación, estados).
- `users` — autenticación y perfiles.
- *(añadir según el proyecto)*

### 4. Ubicuidad del lenguaje (referencia rápida — completa en `docs/CONTEXT.md`)

- *Task:* entidad principal del dominio.
- *Owner:* el User que creó la Task.
- *Assignee:* el User responsable de ejecutar la Task.
- *(añadir términos a medida que aparecen)*

### 5. Sensitive paths (refinamiento de §64)

Por defecto Stormhelm trata como sensitive: `auth/`, `crypto/`, `payments/`, middlewares de auth y rate-limit, webhooks, clients externos. Aquí puedes añadir o restringir.

### 6. SLOs por endpoint (refinamiento de §83)

- **Public read endpoints:** p99 < *XXX*ms.
- **Public write endpoints:** p99 < *XXX*ms.
- **Internal admin endpoints:** p99 < *XXX*ms.

### 7. Compliance aplicable

- [ ] SOC2 — *(sí/no, qué controles)*
- [ ] GDPR — *(sí/no, qué PII)*
- [ ] PCI-DSS — *(sí/no, qué scope)*
- [ ] HIPAA — *(sí/no)*

### 8. Definition of Done por slice

- [ ] Todos los `@release` del slice pasan en `/run-acceptance`.
- [ ] El reviewer agent no reporta findings críticos.
- [ ] Traceability matrix muestra cada `scn-NNN` cubierto.
- [ ] Si toca sensitive paths: `/security-hardening` reporta 0 críticos.
- [ ] PR aprobado por al menos 1 humano (HITL #3).

### 9. Política de bugs

- Severity p0 (caída total / data loss): hotfix dentro de 4h, postmortem obligatorio (`incident:production`).
- Severity p1 (degradación crítica): fix dentro de 24h, postmortem si `incident:production`.
- Severity p2: fix priorizado en siguiente sprint.
- Severity p3: backlog.

### 10. Política de improvements

- Tech debt se trata como features con rubric ICE (§99).
- Dep upgrades menores → `/optimize` directo. Mayores → ADR primero.
- Refactors > 5 archivos → `/improve-codebase-architecture` con plan.

---

## Ratificación

| Tenet | Aprobado por | Fecha | ADR si aplica |
|---|---|---|---|
| (vacío) | | | |

---

**Próximo paso:** corre `/constitution` para generar esta plantilla rellena interactivamente.
