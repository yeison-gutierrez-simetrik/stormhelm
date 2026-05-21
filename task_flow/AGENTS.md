# AGENTS.md — task_flow

> **Punto de entrada para agentes que trabajan en este proyecto.**
>
> Este proyecto sigue el framework **Stormhelm**. Las reglas operativas están en `docs/engineering/AGENTS.md`. Las decisiones específicas del proyecto (que sobreescriben las reglas §N por defecto) están en `docs/constitution.md`.

## Orden de lectura obligatorio para cualquier tarea

1. **`docs/engineering/AGENTS.md`** — índice de las 116 reglas (§1-§116). NO leas todas; carga progresivamente las que apliquen.
2. **`docs/constitution.md`** — la palabra final del proyecto. Si dice algo distinto a §N, **gana la constitución**.
3. **`docs/CONTEXT.md`** — lenguaje ubicuo, contextos, sub-dominios. Léelo antes de proponer cualquier identificador.
4. **`docs/WORKFLOWS-GUIDE.md`** — cómo se ejecutan los flujos. Si vas a invocar `/feature`, `/debug`, `/optimize` o cualquier skill, primero entiende dónde están los HITLs.

## Skills disponibles

Claude Code descubre 28 skills desde `.claude/skills/`. Los más usados:

- `/feature` — flujo greenfield monolítico (13 pasos).
- `/debug` — flujo de bug fix (orquesta `/diagnose` + `/tdd`).
- `/optimize`, `/improve-codebase-architecture` — flujos de improvement.
- `/setup`, `/onboard` — bootstrap del proyecto.
- `/constitution` — generación interactiva de `docs/constitution.md`.

## Agente especializado

- `.claude/agents/reviewer.md` — revisión read-only de PRs contra §27, §41, §45, §52, §103.

## Hooks activos

- `.claude/hooks/context-monitor.js` — alerta cuando el contexto baja de 35% / 25%.
- `.claude/hooks/webfetch-cache-pre.js` + `-post.js` — cache HTTP 304 para fetches repetidos.

Configurados en `.claude/settings.json`.

## Anti-patrones que el agente NUNCA debe hacer

1. **Editar `docs/engineering/core/*.md`** para "personalizar" reglas. Esos archivos son inmutables. Si una regla necesita override, va en `docs/constitution.md`.
2. **Saltarse HITLs.** Si una skill llega a un checkpoint humano (HITL #1, #2, #3, o subordinados), debe **detenerse y esperar input explícito**.
3. **Mezclar capas hexagonales.** Domain no importa de application, application no importa de infrastructure. Override solo vía ADR en `docs/decisions/`.
4. **Lanzar excepciones para errores de negocio.** Usa Result types con `{ ok: false, code: SCREAMING_SNAKE, message }`. Excepciones son solo para fallos de programador o infra (§19).
5. **Acceder a `process.env.*` directamente fuera del entry point.** Todo env var se valida al inicio y se inyecta como objeto tipado (§34).

## Cuando no sepas qué hacer

1. Lee la `WORKFLOWS-GUIDE.md`.
2. Si la guía no cubre el caso, pregúntale al humano via HITL.
3. Si el humano no está disponible y la tarea es bloqueante, **detente** y deja un `TODO` documentado. Nunca improvises.
