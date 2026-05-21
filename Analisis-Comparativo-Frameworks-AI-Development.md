# Stormhelm — Análisis y Diseño del Framework

> **Objetivo:** Validar las ventajas, desventajas y aspectos diferenciadores de los seis frameworks open-source más relevantes para construir **Stormhelm**, un harness de desarrollo asistido por IA stack-agnóstico (prioridad TypeScript inicial, extensible a Python/Go) con foco en proyectos profesionales que requieren disciplina ingenieril, trazabilidad y operación AFK segura.
>
> **Autor del análisis:** Yei — Mayo 2026
> **Frameworks analizados:** AI Hero · GSD · Superpowers · BMAD-METHOD · Spec-Kit · addyosmani/agent-skills
>
> **Nombre del framework:** Stormhelm (el timón en la tormenta — el developer al mando, los agentes como tripulación, mientras se atraviesa el caos del AI-assisted development). Slogan: *Hold the helm. Weather the storm.*

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Marco de evaluación](#2-marco-de-evaluación)
3. [AI Hero (mattpocock/skills)](#3-ai-hero--mattpocockskills)
4. [GSD (Get Shit Done)](#4-gsd--get-shit-done)
5. [Superpowers (obra/superpowers)](#5-superpowers--obrasuperpowers)
6. [BMAD-METHOD](#6-bmad-method)
7. [Spec-Kit (GitHub oficial)](#7-spec-kit--githubspec-kit)
8. [addyosmani/agent-skills](#8-addyosmaniagent-skills)
9. [Matriz comparativa multi-criterio](#9-matriz-comparativa-multi-criterio)
10. [Síntesis de fortalezas únicas](#10-síntesis-de-fortalezas-únicas-qué-destaca-cada-uno)
11. [Recomendaciones según contexto Simetrik](#11-recomendaciones-según-contexto-simetrik)
12. [Propuesta de Harness híbrido](#12-propuesta-de-harness-híbrido-blueprint)
13. [El gap de QA de aceptación: BDD outside-in](#13-el-gap-de-qa-de-aceptación-bdd-outside-in)
14. [Estrategia Day Shift / Night Shift (Ralph)](#14-estrategia-day-shift--night-shift-ralph)
15. [Capa transversal: reglas de código y arquitectura](#15-capa-transversal-reglas-de-código-y-arquitectura)
16. [Flujo brownfield: trabajo sobre código legacy](#16-flujo-brownfield-trabajo-sobre-código-legacy)
17. [Bug handling: adopción dirigida + gaps reales](#17-bug-handling-adopción-dirigida--gaps-reales)
18. [Improvements: 5 categorías, 1 skill, 0 sobreingeniería](#18-improvements-5-categorías-1-skill-0-sobreingeniería)
19. [Validación cruzada y absorción de patrones operacionales](#19-validación-cruzada-y-absorción-de-patrones-operacionales)
20. [Hooks y runtime guards: capa defensiva opt-in](#20-hooks-y-runtime-guards-capa-defensiva-opt-in)
21. [Agentes formales: solo `reviewer`, dos especificados deferred](#21-agentes-formales-solo-reviewer-dos-especificados-deferred)
22. [Anexos: fuentes y enlaces](#22-anexos--fuentes-y-enlaces)

---

## 1. Resumen ejecutivo

La oleada 2025-2026 de frameworks para desarrollo con agentes converge en una conclusión: **el cuello de botella ya no es la generación de código, sino la gestión del contexto y la disciplina del proceso**. Los seis proyectos analizados resuelven el mismo problema desde ángulos distintos:

| Framework | Filosofía dominante | Mayor virtud | Mayor coste |
|---|---|---|---|
| **AI Hero** | Skills componibles + DDD/ADRs | Calidad ingenieril por composición | Sesgo TypeScript |
| **GSD** | Ingeniería de contexto multi-fase | Sesiones autónomas largas sin "rot" | 82+ comandos, pesado |
| **Superpowers** | Disciplina TDD ejecutable | TDD red-green inquebrantable | Alto consumo de tokens |
| **BMAD-METHOD** | Personas ágiles (Scrum simulado) | Replica una oficina completa | Curva y rigidez |
| **Spec-Kit** | Documentación como código | Auditoría y trazabilidad enterprise | Setup inicial pesado |
| **agent-skills** | Quality gates Google-style | Cobertura end-to-end del SDLC | Sesgo frontend/web |

**Recomendación abreviada:** ninguno de los seis es "el ganador absoluto". El Harness óptimo para Simetrik se construye combinando **AI Hero** (skills atómicos y DDD) + **Spec-Kit** (auditabilidad enterprise) + **agent-skills** (quality gates) + selección de skills puntuales de Superpowers (verificación) y GSD (gestión de sesión larga). BMAD queda como referencia para proyectos donde se requiera simulación multi-rol completa.

---

## 2. Marco de evaluación

Para evaluar cada framework objetivamente se aplicaron 10 criterios técnicos relevantes al contexto del proyecto:

| # | Criterio | Por qué importa |
|---|---|---|
| 1 | **Gestión de contexto** | Determina cuánto puede operar el agente sin degradación cognitiva |
| 2 | **Alineación previa (grilling/clarify)** | Reduce retrabajo por requerimientos ambiguos |
| 3 | **TDD / verificación obligatoria** | Pone un piso de calidad al código generado |
| 4 | **Multi-agente / paralelismo** | Permite escalabilidad de equipo simulado |
| 5 | **Evaluación de salidas LLM (evals)** | Mide calidad probabilística de outputs |
| 6 | **Curva de aprendizaje** | Costo de adopción por developer |
| 7 | **Soporte multi-lenguaje (TS + Python)** | Necesidad explícita del proyecto Simetrik |
| 8 | **Auditabilidad y trazabilidad** | Crítico para entornos regulados |
| 9 | **Composabilidad / modularidad** | Capacidad de tomar piezas sin adoptar todo |
| 10 | **Madurez y comunidad** | Riesgo de abandono y soporte futuro |

Cada framework se puntúa en una matriz al final (sección 9). Las puntuaciones son cualitativas (Alto / Medio / Bajo) y se argumentan por escrito.

---

## 3. AI Hero — `mattpocock/skills`

### 3.1 Identificación

- **Repo oficial:** https://github.com/mattpocock/skills
- **Autor:** Matt Pocock (educador TypeScript, creador de Evalite)
- **Estado a mayo 2026:** ~87-96k estrellas · ~4.5k forks · MIT · Actividad diaria
- **Sitio editorial:** https://www.aihero.dev/

### 3.2 Filosofía técnica

AI Hero parte de una crítica directa al "vibe coding": el código *no es barato*, su costo real está en mantenimiento y entropía. Pocock postula que el desarrollador humano debe operar como **director de orquesta**, diseñando interfaces y delegando implementación a agentes guiados por skills.

Sus pilares conceptuales:

- **Patrón Memento**: tratar al agente como un "nuevo empleado sin memoria" cada sesión, externalizando contexto en `AGENTS.md`, `CONTEXT.md`, ADRs.
- **Zona Inteligente vs Zona Tonta**: vigilar el límite ~100k tokens donde la atención del modelo se degrada cuadráticamente.
- **Módulos Profundos** (Ousterhout): el humano diseña la interfaz simple; la IA puede ser dueña de la implementación compleja interna.
- **Tracer Bullets / Vertical Slicing**: descomponer features en cortes verticales completos (DB → API → UI → tests) en lugar de capas horizontales.
- **Lenguaje Ubicuo (DDD)**: una sola palabra con un solo significado para humano y agente, anclado en `CONTEXT.md`.

### 3.3 Skills clave (28 skills agrupados)

**Engineering**
- `/tdd` — Ciclo red-green-refactor por slices verticales, prohíbe escribir código antes que el test.
- `/diagnose` — Loop disciplinado de debugging que prohíbe parches sin causa raíz.
- `/triage` — Máquina de estados para clasificar issues (HITL vs AFK).
- `/improve-codebase-architecture` — Busca "deepening opportunities" usando CONTEXT.md + ADRs.
- `/grill-with-docs` — Interrogatorio del agente contra el dominio existente.
- `/domain-model` — Refinamiento de terminología y actualización inline de CONTEXT.md y ADRs en `docs/adr/`.
- `/prototype` — Código desechable: app de terminal para lógica/estado, o varias UIs alternativas en una ruta con search-params.
- `/setup-matt-pocock-skills` — Scaffolding del repo con la estructura completa.
- `/design-an-interface`, `/request-refactor-plan`.

**Productivity / Planning**
- `/grill-me` — **Skill estrella.** Interrogatorio previo a codear: el agente hace 40-100 preguntas hasta resolver todo el árbol de decisión.
- `/to-prd` — Conversación → PRD como GitHub issue.
- `/to-issues` — Plan → issues verticales independientes (cada uno HITL o AFK).
- `/handoff` — Compacta la sesión a `mktemp -t handoff-XXXXXX.md` para que un agente fresco continúe.
- `/caveman` — Modo comprimido (~75% menos tokens manteniendo precisión).
- `/zoom-out`, `/write-a-skill`, `/edit-article`, `/ubiquitous-language`, `/obsidian-vault`.

**Misc / Tooling**
- `/setup-pre-commit` — Husky + lint-staged + Prettier.
- `/git-guardrails-claude-code` — Hook PreToolUse que bloquea `push`, `reset --hard`, `clean`, `branch -D`. **Esencial para sandboxes.**

### 3.4 Integración con Evalite

`mattpocock/evalite` (separado en `ai-hero-dev/ai-hero`) es un framework de evaluations Vitest-based diseñado por el mismo autor. Permite:
- Comparar versiones de prompts, modelos o arquitecturas RAG.
- LLM-as-a-Judge sobre datasets de referencia.
- Métricas de precisión y latencia versionadas en CI.

Es la pieza que cierra el círculo cuando el output es texto generado y no determinista.

### 3.5 Ventajas

1. **Calidad ingenieril por composición**: skills atómicos que se encadenan como Unix pipes (`/grill-me` → `/to-prd` → `/to-issues` → `/tdd`).
2. **DDD + ADRs como contexto persistente** — solución elegante al patrón Memento.
3. **`/grill-me`** ahorra 30+ min de codificación mal dirigida invirtiendo 5-15 min de entrevista.
4. **Guardrails operacionales reales** (git-guardrails, pre-commit).
5. **Composabilidad**: fácil de hacer fork y adaptar; no impone framework completo.
6. **Evalite** llena el vacío de testing para salidas LLM.
7. Comunidad explosiva: 87-96k stars en ~90 días.

### 3.6 Desventajas

1. **Opinionado a TypeScript/web**: `migrate-to-shoehorn` es solo TS-testing; `setup-pre-commit` asume JS toolchain. **No hay skills específicos para Python.**
2. Requiere adoptar la **filosofía completa** (DDD + ADRs + vertical slicing) para obtener el valor real.
3. Funciona mejor con modelos frontier (Opus 4.7, GPT-5, Gemini 3); modelos open pequeños "bailout".
4. Fricción en monorepos (dónde vive CONTEXT.md, scoping de labels de triage).
5. Pocock es **selectivo con PRs** — es catálogo personal, no proyecto comunitario.
6. Sin gestión explícita de sesión larga ni sub-agentes paralelos (gap que GSD sí cubre).

### 3.7 Qué lo destaca

Es el **primer catálogo de skills tratado como disciplina de ingeniería**, no como "prompts útiles". La integración Skills + AGENTS.md + CONTEXT.md + ADRs + Evalite forma un sistema cerrado: el agente no solo ejecuta tareas, sino que opera dentro de un contexto epistemológico persistente. Su `/grill-me` es probablemente el patrón más copiado en 2026.

---

## 4. GSD — Get Shit Done

### 4.1 Identificación

- **Repo oficial:** https://github.com/gsd-build/get-shit-done
- **CLI v2:** https://github.com/gsd-build/gsd-2
- **Sitio:** https://gsd.site/
- **Autor:** TÂCHES
- **Estado a mayo 2026:** ~59-63k estrellas · 138+ contribuidores · 2.100+ commits · 57 releases en ~4 meses · Crecimiento explosivo

### 4.2 Filosofía técnica

GSD ataca un fenómeno medible que llaman **"Context Rot"**: la degradación de la precisión del modelo cuando la sesión acumula tokens. Tras miles de líneas de chat, Claude olvida specs iniciales, genera código inconsistente y pierde la lógica de la aplicación.

La solución es radical: **mantener la sesión principal "lean" (30-40% de uso de contexto), y delegar el trabajo pesado a sub-agentes en ventanas frescas de 200K tokens**, donde cada fase (discusión, planning, ejecución, verificación, shipping) tiene su propio orquestador que persiste el estado en disco antes de pasar el relevo.

### 4.3 Componentes técnicos

- **~82 slash commands** con prefijo `/gsd-*` (en Gemini, `/gsd:*`).
- **6 meta-skills de namespace** (v1.40) para enrutamiento jerárquico.
- **Estado persistido en `.planning/`** del proyecto: archivos Markdown con YAML frontmatter.
- **Sub-agentes** (`gsd-executor`) con acceso Bash y permisos de escritura (`git commit`, `npm run`, `bundle exec`).
- **CLAUDE.md fallback**: sección de "resume" para CLIs sin soporte de hooks.
- **GSD v2** — CLI standalone sobre Pi SDK con control directo del agent harness: clear de contexto entre tareas, gestión de ramas git, tracking de costo/tokens, detección de loops, recuperación de crashes, auto-avance por milestones.

### 4.4 Ventajas

1. **Resuelve un problema real y medible**: context rot en proyectos largos. Hay benchmarks publicados.
2. **Ejecución autónoma prolongada** sin perder el "big picture" — ideal para sesiones overnight o AFK.
3. **Multi-CLI**: Claude Code, OpenCode, Gemini CLI, Codex, Cursor, Windsurf, Copilot, Kilo.
4. **Recuperación de crashes** y persistencia robusta de estado.
5. Adopción corporativa visible (Amazon, Google, Shopify, Webflow).

### 4.5 Desventajas

1. **Pesado**: 82+ slash commands, curva de aprendizaje notable.
2. **Sobrecarga de MCP**: servidores MCP (Playwright, Mac-tools) inyectan esquemas que pueden superar 20k tokens por turno.
3. **Pérdida de control del proceso**: crítica recurrente — "es difícil debuggear cuando algo falla dentro del proceso".
4. Requiere tooling estándar con permisos de escritura en Bash (riesgo en sandboxes regulados).
5. Issues abiertos sobre discoverability de slash commands en versiones recientes de Claude Code.

### 4.6 Qué lo destaca

GSD es el único framework de los seis que **resuelve el problema de la sesión larga de forma sistemática**. Pocock con `/handoff` lo aborda, pero como skill manual; GSD lo automatiza con sub-agentes y persistencia de estado. Es la elección si tu proyecto típico dura más de un par de horas de sesión.

---

## 5. Superpowers — `obra/superpowers`

### 5.1 Identificación

- **Repo:** https://github.com/obra/superpowers
- **Marketplace:** https://github.com/obra/superpowers-marketplace
- **Página oficial Anthropic:** https://claude.com/plugins/superpowers
- **Autor:** Jesse Vincent (creador de Request Tracker, ex-pumpking de Perl 5, cofundador de Keyboardio)
- **Licencia:** MIT

### 5.2 Filosofía técnica

Superpowers nace de la observación de que **los agentes tienden al camino más corto**: escriben código antes de entender requisitos, omiten tests, parchean síntomas sin investigar root cause, y sufren context drift. La solución es codificar una **cultura de ingeniería opinada** como archivos Markdown (SKILL.md) que el agente debe consultar antes de actuar.

El lema operacional: *"red-green-refactor obligatorio; si dices 'escribo el test después', se borra la implementación y se empieza de nuevo"*.

### 5.3 Skills clave (~14 skills + comandos)

- **`/superpowers:brainstorm`** — Sesión socrática que rehúsa escribir código hasta acordar diseño. Análogo a `/grill-me` de AI Hero.
- **`/superpowers:write-plan`** — Descompone features en tareas de 2-5 minutos con rutas de archivo y tests definidos antes de tocar código.
- **`/superpowers:execute-plan`** — Ejecuta el plan con verificación obligatoria.
- **`test-driven-development`** — Enforcement estricto de red/green/refactor.
- **`systematic-debugging`** — Proceso de 4 fases que prohíbe arreglar sin entender la causa raíz.
- **`subagent-driven-development`** — Despacha implementación a un subagente fresco con solo el plan y los tests; un segundo subagente revisa.
- **`verification-before-completion`** — Bloquea el cierre de tareas sin evidencia verificable.

**Workflow completo**: Brainstorm → Spec → Plan → TDD → Subagent Dev → Review → Finalize (7 fases).

### 5.4 Instalación

```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

Los SKILL.md son portables a Cursor, Codex, Copilot CLI, Gemini CLI y OpenCode.

### 5.5 Ventajas

1. **Aceptación oficial en el marketplace de Anthropic** — señal de calidad.
2. **TDD inquebrantable**: la disciplina más estricta de los seis.
3. **Subagentes con contexto fresco**: pareja sólida con GSD para sesiones largas.
4. **Verification gates**: una tarea no se cierra sin evidencia.
5. **Anti-rationalization**: combate las excusas comunes del LLM ("ya sé que funciona", "es trivial").

### 5.6 Desventajas

1. **Alto consumo de tokens**: planificación de dos fases + subagentes multiplican el coste.
2. *"Si Claude ya va en mala dirección, añadir más estructura desperdicia tokens más rápido"* — crítica del propio autor.
3. Prompts interactivos de Q&A pueden bloquear el input stream de Claude Code.
4. Setup no trivial, plan mode lineal e inflexible.
5. Sobredimensionado para tareas pequeñas; rinde mejor en proyectos mission-critical.

### 5.7 Qué lo destaca

Es **gobernanza ejecutable para el agente**, no formación humana. Mientras AI Hero educa, Superpowers ejecuta políticas de calidad sobre cada acción del agente. Su sistema de subagentes-fresh + verification-gate es probablemente el patrón más robusto contra el "agent drift" que han producido los seis.

---

## 6. BMAD-METHOD

### 6.1 Identificación

- **Repo oficial:** https://github.com/bmad-code-org/BMAD-METHOD
- **Sitio:** https://www.bmadcode.com
- **Docs:** https://docs.bmad-method.org
- **NPM:** `npx bmad-method install`
- **Autor:** Brian Madison (BMad Code, LLC) — veterano con experiencia en NASA, Northrop Grumman, Siemens
- **Estado a mayo 2026:** ~43.6k+ estrellas · Master Class con 250k+ vistas · 100% open source

### 6.2 Filosofía técnica

BMAD = "**B**reakthrough **M**ethod for **A**gile AI-**D**riven Development". Su tesis: replicar una **oficina de ingeniería completa** con personas especializadas que colaboran mediante workflows deterministas (YAML), produciendo artefactos versionables en Git.

La idea de "personas" responde a que cada agente debe tener contexto, responsabilidades y prompts optimizados de un rol Scrum real, evitando que un agente generalista pierda contexto.

### 6.3 Agentes / Personas (21 en V5)

| Agente | Función |
|---|---|
| **Analyst** | Explora el espacio del problema → `project-brief.md` |
| **PM (Product Manager)** | Convierte brief en PRD con FRs/NFRs, épicas |
| **Architect** | Diseña arquitectura full-stack → `architecture.md` |
| **PO (Product Owner)** | Valida consistencia de artefactos, maestría del backlog |
| **SM (Scrum Master)** | Transforma épicas en *hyper-detailed stories* auto-contenidas |
| **Dev (Developer)** | Implementa cada story siguiendo instrucciones embebidas |
| **QA** | Estrategia de testing, quality gates, validación |
| **UX Designer** | Diseño de experiencia/UI |
| **Orchestrator / BMad Master** | Coordina y habilita "Party Mode" (debate multi-agente) |

Plus **50+ workflows** y los **Expansion Packs**.

### 6.4 Flujo de trabajo

**Planning Phase** (Web UI / IDE chat — alto contexto):
1. Analyst → `project-brief.md`
2. PM → `prd.md`
3. Architect → `architecture.md`
4. PO → validación de consistencia (checklist)
5. Shard de documentos en piezas digeribles

**Development Phase** (IDE — ciclo iterativo):
1. SM lee shards y genera `story.md` auto-contenida (contexto + AC + dev notes)
2. Dev implementa siguiendo la story
3. QA revisa, ejecuta gates de calidad
4. Aprobación → siguiente story

Cuatro fases canónicas: **Analysis → Planning → Solutioning → Implementation** (bloqueantes).

### 6.5 Expansion Packs

Único entre los seis en ofrecer **paquetes modulares para dominios no-software**: Game Dev (Godot, Unity), DevOps/Infra, Creative Writing, Healthcare Data, B2B Data Products, Mobile, AI/ML Engineering, Cloud Architecture. La comunidad puede crear y compartir packs.

### 6.6 Ventajas

1. **Predecibilidad y trazabilidad**: artefactos versionados en Git por cada rol.
2. **Reduce ~30% el ciclo** de desarrollo manteniendo supervisión humana.
3. **Agnóstico de lenguaje y modelo**: TS, Python, Go, Rust, Java, Ruby, Shell + Claude, Gemini, GPT, Grok.
4. **Multi-IDE**: Claude Code, Cursor, Windsurf, Copilot, Cline, Roo, Trae.
5. Comunidad muy activa y popular.
6. **Expansion Packs**: extensible a dominios no-código.

### 6.7 Desventajas

1. **Curva de aprendizaje considerable** (21 agentes, muchos comandos, fases).
2. **Pesado/overhead** para proyectos pequeños o bug fixes triviales.
3. Workflow muy rígido — requiere disciplina para no saltarse fases.
4. Dependencia de Node/npm para instalación.
5. Calidad final depende fuertemente del modelo LLM elegido.
6. Documentación dispersa entre repo, docs site, DeepWiki, blog posts.

### 6.8 Qué lo destaca

La combinación **"Agentic Planning" + Context-Engineered Stories** es única: el SM agent inyecta toda la información arquitectónica directamente en la story para que el Dev agent nunca pierda contexto. Resuelve el problema clásico de fragmentación de memoria sin necesidad de RAG. Los Expansion Packs lo convierten en framework universal de agentes, no solo software.

---

## 7. Spec-Kit — `github/spec-kit`

### 7.1 Identificación

- **Repo oficial:** https://github.com/github/spec-kit
- **Docs:** https://github.github.com/spec-kit/
- **Mantenedor:** **GitHub** (oficial, no GitHub Next)
- **Licencia:** MIT
- **Estado a mayo 2026:** ~90k+ estrellas · ~8k+ forks · módulo de capacitación en Microsoft Learn

### 7.2 Filosofía SDD (Spec-Driven Development)

Invierte la jerarquía clásica: ***"las especificaciones no sirven al código; el código sirve a las especificaciones"***. La spec es el contrato y la fuente de verdad que los agentes usan para generar, testear y validar código.

Enfoque **intent-first**: primero declaras el "qué" y el "porqué" (sin stack técnico), luego el "cómo". Cada fase produce un artefacto Markdown versionado.

### 7.3 Comandos slash (prefijo `/speckit.*`)

| Comando | Función |
|---|---|
| `/speckit.constitution` | Define principios no-negociables (security, calidad, arquitectura) |
| `/speckit.specify` | Captura el "qué" y "porqué", sin detalles técnicos |
| `/speckit.clarify` *(opcional)* | Detecta áreas subespecificadas mediante preguntas |
| `/speckit.plan` | Genera el plan técnico dado el stack elegido |
| `/speckit.tasks` | Descompone el plan en lista ordenada por dependencias |
| `/speckit.analyze` *(opcional)* | Revisa spec, plan y tareas en busca de inconsistencias cruzadas |
| `/speckit.checklist` *(opcional)* | Crea "unit tests for English" sobre la spec |
| `/speckit.implement` | Ejecuta tareas con el agente |

**Flujo recomendado para producción**: Constitution → Specify → Clarify → Checklist → Plan → Tasks → Analyze → Implement.

### 7.4 CLI y stack soportado

```bash
# Uso puntual con uvx
uvx --from git+https://github.com/github/spec-kit.git specify init my-project

# Instalación persistente
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git

# Con agente específico
specify init my-project --integration claude   # o gemini, copilot, codex, etc.
```

**30+ agentes soportados** — los archivos de spec son **idénticos entre agentes** (verdadera agent portability).

### 7.5 Ventajas

1. **Rastro de auditoría de diseño** — cada artefacto es Markdown versionado en Git. Trazabilidad desde el intent original hasta el código. **Crítico para enterprise regulado.**
2. **Documentación como código real**: la spec viaja con el repo, no en Confluence.
3. **Determinismo aumentado** en salidas LLM al anclarse en spec escrita.
4. **Constitution** como mecanismo de guardrails corporativos (security-first, compliance).
5. **Portabilidad de agentes**: no hay vendor lock-in de IA.
6. **MIT, gratuito, mantenido por GitHub** — bajo riesgo de abandono.
7. Microsoft Learn ya ofrece módulo enterprise oficial.

### 7.6 Desventajas

1. **Cumplimiento enterprise no nativo**: no incluye SOC2, RBAC ni controles de compliance fuera de la caja; hay que construirlos alrededor.
2. **Drift management manual**: si el código diverge de la spec, no hay detección automática.
3. **Sobredimensionado** para proyectos pequeños.
4. **Madurez**: proyecto joven (sep 2025), integración con codebases legacy aún áspera.
5. Curva de aprendizaje en disciplina de escribir specs **antes** de codear.

### 7.7 Qué lo destaca

El respaldo de **GitHub oficial** (no experimento side-project) y el concepto de **Constitution** como capa de gobierno son únicos. Es el framework más alineado con el caso de uso **"proyectos enterprise/regulados con auditoría de diseño"** y el único con respaldo institucional fuerte (Microsoft + GitHub).

---

## 8. addyosmani/agent-skills

### 8.1 Identificación

- **Repo oficial:** https://github.com/addyosmani/agent-skills
- **Autor:** **Addy Osmani** (Google Chrome DX team, autor de "Learning JavaScript Design Patterns")
- **Licencia:** MIT
- **Estado a mayo 2026:** **43.1k estrellas · 4.7k forks · release 0.6.0 (abr 2026) · 191 commits**

### 8.2 Filosofía técnica

*"Production-grade engineering skills for AI coding agents"*. Resuelve el problema de que los agentes **tienden al camino más corto** (saltarse specs, tests, revisiones de seguridad). El repo codifica los workflows, quality gates y disciplinas que un *senior engineer* aplicaría, embebiendo prácticas de **"Software Engineering at Google"**: Hyrum's Law, Beyoncé Rule, test pyramid, Chesterton's Fence, trunk-based dev, Shift Left.

No son prompts genéricos: son **procesos verificables con criterios de salida medibles**.

### 8.3 Estructura por fases del SDLC

| Fase | Skills |
|---|---|
| **Meta (1)** | `using-agent-skills` |
| **Define (3)** | `interview-me`, `idea-refine`, `spec-driven-development` |
| **Plan (1)** | `planning-and-task-breakdown` |
| **Build (7)** | `incremental-implementation`, `test-driven-development`, `context-engineering`, `source-driven-development`, `doubt-driven-development`, `frontend-ui-engineering`, `api-and-interface-design` |
| **Verify (2)** | `browser-testing-with-devtools`, `debugging-and-error-recovery` |
| **Review (4)** | `code-review-and-quality`, `code-simplification`, `security-and-hardening`, `performance-optimization` |
| **Ship (5)** | `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `shipping-and-launch` |

**Total: 23 skills** + 3 agent personas (`code-reviewer`, `test-engineer`, `security-auditor`) + 4 reference checklists + 7 slash commands (`/spec`, `/plan`, `/build`, `/test`, `/review`, `/code-simplify`, `/ship`).

### 8.4 Anatomía consistente de cada skill

1. **Frontmatter** (YAML).
2. **Overview** — qué hace.
3. **When to Use** — cuándo invocarlo.
4. **Process** — pasos numerados.
5. **Rationalizations table** — excusas comunes del LLM con contraargumentos.
6. **Red Flags** — señales de que el agente está a punto de fallar.
7. **Verification** — evidencia obligatoria de salida.

Diseño *"process, not prose"* + **progressive disclosure** para minimizar tokens.

### 8.5 Instalación

```bash
# Claude Code
/plugin marketplace add addyosmani/agent-skills
/plugin install agent-skills@addy-agent-skills

# Cursor
cp skills/**/SKILL.md .cursor/rules/

# Gemini CLI
gemini skills install https://github.com/addyosmani/agent-skills.git --path skills
```

### 8.6 Ventajas

1. **Autoridad del autor** — Addy Osmani es referente global; respaldo bibliográfico real ("Software Engineering at Google").
2. **Cobertura end-to-end del SDLC** — único de los seis que cubre Define → Plan → Build → Verify → Review → Ship.
3. **Anti-rationalization tables** — combaten directamente el patrón "el LLM se inventa excusas para saltarse pasos".
4. **Multi-tool**: Claude Code, Cursor, Gemini, Windsurf, Copilot, Kiro, OpenCode.
5. **Slash commands** como entry points ergonómicos.
6. **Verification con evidencia obligatoria** — *"seems right is never sufficient"*.

### 8.7 Desventajas

1. **Muy opinionado**: impone procesos Google-style que pueden sentirse pesados en prototipos.
2. **Sesgo frontend/web** — Core Web Vitals, WCAG 2.1 AA, Chrome DevTools MCP. Backend puro y data engineering quedan menos cubiertos.
3. **23 skills + commands + agents** = curva de adopción no trivial.
4. Solapamientos (`code-review-and-quality` vs `code-simplification`).

### 8.8 Qué lo destaca

La combinación **autoridad del autor + rigor metodológico + cobertura completa del SDLC + tablas anti-racionalización** lo posicionan como referencia *de-facto* para producción. No enseña sintaxis: enseña al agente a **comportarse como senior engineer con quality gates inapelables**. Su `Rationalizations table` es un patrón que ningún otro framework de los seis tiene formalmente.

---

## 9. Matriz comparativa multi-criterio

Leyenda: ★★★ Alto · ★★ Medio · ★ Bajo · — No aplica/ausente

| Criterio | AI Hero | GSD | Superpowers | BMAD | Spec-Kit | agent-skills |
|---|---|---|---|---|---|---|
| **Gestión de contexto larga** | ★★ (handoff manual) | ★★★ (sub-agentes) | ★★★ (subagents) | ★★ (sharding) | ★★ (artefactos MD) | ★★ (context-engineering skill) |
| **Alineación previa / grilling** | ★★★ (`/grill-me`) | ★★ | ★★★ (brainstorm) | ★★★ (Analyst+PM) | ★★★ (constitution+clarify) | ★★★ (interview-me) |
| **TDD obligatorio** | ★★ (`/tdd`) | ★ | ★★★ (estricto) | ★★ (QA agent) | ★ | ★★★ (TDD skill + verification) |
| **Multi-agente / paralelismo** | ★ | ★★★ | ★★★ (subagentes) | ★★★ (21 personas) | ★ | ★★ (3 personas) |
| **Evaluación LLM (evals)** | ★★★ (Evalite) | ★ | ★ | ★ | ★ | ★ |
| **Curva de aprendizaje** | ★★ (manejable) | ★ (82 comandos) | ★★ | ★ (21 agentes) | ★★ (8 comandos) | ★★ (23 skills) |
| **TypeScript / Node** | ★★★ (nativo) | ★★★ | ★★★ | ★★★ | ★★★ | ★★★ |
| **Python / Backend** | ★ (gap real) | ★★★ | ★★★ | ★★★ | ★★★ | ★★ (sesgo frontend) |
| **Auditabilidad enterprise** | ★★ (ADRs) | ★★ (.planning/) | ★★ | ★★★ (Git artefactos) | ★★★ (constitution+specs) | ★★ (ADR skill) |
| **Composabilidad / modularidad** | ★★★ (skills atómicos) | ★ (todo o nada) | ★★ | ★ (framework completo) | ★★ (comandos sueltos) | ★★★ (skills + commands) |
| **Madurez / comunidad** | ★★★ (~90k★) | ★★★ (~60k★) | ★★★ (Anthropic oficial) | ★★★ (~44k★) | ★★★ (~90k★, GitHub) | ★★★ (~43k★) |

### Puntuación agregada para contexto Simetrik

Sumando los criterios ponderados al contexto (TS+Python+Enterprise+Claude Code), el ranking aproximado es:

| Posición | Framework | Puntaje | Comentario |
|---|---|---|---|
| 1 | **Spec-Kit** | 28/33 | Mejor encaje enterprise + agent portability |
| 2 | **AI Hero** | 27/33 | Mejor calidad ingenieril, pero gap Python |
| 2 | **agent-skills** | 27/33 | Mejor cobertura SDLC, sesgo frontend |
| 4 | **Superpowers** | 26/33 | Mejor TDD enforcement |
| 5 | **BMAD** | 25/33 | Mejor multi-agente, mayor overhead |
| 6 | **GSD** | 24/33 | Mejor sesión larga, más pesado |

> **Conclusión clave**: ningún framework gana en todos los criterios. La estrategia óptima es **combinar** las fortalezas complementarias.

---

## 10. Síntesis de fortalezas únicas: qué destaca cada uno

Cada framework tiene **un patrón irreemplazable** que los demás no replican con la misma calidad:

### AI Hero → "Skills atómicos + DDD persistente"
- `/grill-me` como protocolo de alineación previa.
- `CONTEXT.md` + ADRs como memoria externa epistemológica.
- **Evalite** — único framework con evaluación rigurosa de salidas LLM.

### GSD → "Sub-agentes en ventanas frescas"
- Único que ataca el "context rot" sistemáticamente.
- `.planning/` directory como single source of truth de estado de sesión.
- Recuperación de crashes y auto-avance por milestones.

### Superpowers → "TDD inquebrantable + verification gates"
- El TDD más estricto: borra implementación si no hay test primero.
- `verification-before-completion` como quality gate ejecutable.
- Aval de Anthropic en su marketplace oficial.

### BMAD → "Oficina ágil simulada + expansion packs"
- Único que simula roles Scrum completos con artefactos versionados.
- *Hyper-detailed stories* que inyectan contexto arquitectónico al Dev agent.
- Expansion packs lo convierten en framework universal de agentes.

### Spec-Kit → "Auditoría de diseño + agent portability"
- Único con respaldo institucional de GitHub.
- **Constitution** como capa de gobierno corporativo.
- Specs idénticas entre 30+ agentes (verdadero anti-lock-in).

### agent-skills → "Quality gates Google-style + anti-rationalization"
- Único con cobertura end-to-end del SDLC (Define → Ship).
- **Rationalizations table** combate excusas del LLM.
- Autoridad bibliográfica de Software Engineering at Google.

---

## 11. Recomendaciones según contexto Simetrik

El proyecto se desarrolla con **TypeScript/Node.js + Python/Backend en entornos enterprise/regulados con Claude Code**. Estas son las recomendaciones específicas:

### 11.1 Para proyectos nuevos con requisitos regulatorios

**Stack recomendado:** Spec-Kit como columna vertebral + AI Hero `/grill-me` y `/tdd` + agent-skills para security/review/ship.

**Por qué:** Spec-Kit da trazabilidad y `constitution.md` cubre los guardrails corporativos. AI Hero aporta el rigor de TDD y grilling. agent-skills añade los quality gates de Google al cierre.

### 11.2 Para proyectos existentes (brownfield)

**Stack recomendado:** AI Hero como base + Superpowers `subagent-driven-development` + GSD `gsd-executor` para sesiones largas.

**Por qué:** En brownfield el `/grill-with-docs` y `/improve-codebase-architecture` de AI Hero brillan. Superpowers garantiza no romper cosas existentes (TDD). GSD permite sesiones overnight para refactors masivos.

### 11.3 Para sprints de prototipado rápido

**Stack recomendado:** AI Hero `/prototype` + agent-skills `idea-refine`.

**Por qué:** Frameworks pesados (BMAD, GSD) matan velocidad en prototipos. AI Hero `/prototype` está diseñado exactamente para esto: código desechable, terminal apps, variantes UI en una ruta.

### 11.4 Para equipos multi-developer trabajando en paralelo

**Stack recomendado:** BMAD como meta-framework + AI Hero `/handoff` para context switching.

**Por qué:** BMAD es el único que modela roles colaborativos. `/handoff` permite que los developers se intercambien contexto sin perderlo.

### 11.5 Stack específico para Python/Backend

> ⚠️ **Atención**: AI Hero tiene un **gap real en Python**. Para componentes Python del proyecto, prioriza:
>
> - **BMAD-METHOD** (agnóstico de lenguaje, soporta Python first-class)
> - **agent-skills** (skills metodológicos sin sesgo de lenguaje)
> - **Spec-Kit** (workflow agnóstico)
> - **GSD** (multi-CLI, multi-lenguaje)

### 11.6 Para evaluación de calidad LLM (RAG, agentes propios)

**Stack recomendado:** **Evalite** (AI Hero) — sin alternativa en los otros 5 frameworks.

---

## 12. Propuesta de Harness híbrido: blueprint

Basado en el análisis, propongo un **Harness Simetrik** que combine lo mejor de cada framework. La estructura del repo se vería así:

```
harness-simetrik/
├── .claude/
│   ├── skills/                      # Skills compuestos
│   │   ├── alignment/
│   │   │   ├── grill-me/            # de AI Hero
│   │   │   └── brainstorm/          # de Superpowers
│   │   ├── planning/
│   │   │   ├── constitution/        # de Spec-Kit
│   │   │   ├── specify/             # de Spec-Kit
│   │   │   ├── to-prd/              # de AI Hero
│   │   │   └── to-issues/           # de AI Hero (vertical slicing)
│   │   ├── engineering/
│   │   │   ├── tdd/                 # combinar AI Hero + Superpowers (estricto)
│   │   │   ├── diagnose/            # de AI Hero
│   │   │   ├── systematic-debugging/ # de Superpowers
│   │   │   └── context-engineering/ # de agent-skills
│   │   ├── review/
│   │   │   ├── code-review-quality/ # de agent-skills
│   │   │   ├── security-hardening/  # de agent-skills
│   │   │   └── verification/        # de Superpowers
│   │   ├── session-mgmt/
│   │   │   ├── handoff/             # de AI Hero
│   │   │   └── gsd-executor/        # de GSD (sub-agentes frescos)
│   │   └── ship/
│   │       ├── ci-cd-automation/    # de agent-skills
│   │       └── deprecation-migration/ # de agent-skills
│   └── hooks/
│       └── git-guardrails/          # de AI Hero (bloqueo de comandos destructivos)
├── docs/
│   ├── constitution.md              # principios no negociables (Spec-Kit)
│   ├── CONTEXT.md                   # lenguaje ubicuo del dominio (AI Hero)
│   ├── AGENTS.md                    # índice jerárquico (AI Hero)
│   ├── adr/                         # Architecture Decision Records
│   └── specs/                       # specs versionadas (Spec-Kit)
├── .planning/                       # estado de sesiones (GSD)
├── evals/                           # Evalite suites (AI Hero)
└── personas/                        # 4-5 personas mínimas (BMAD lite)
    ├── architect.md
    ├── reviewer.md
    ├── security-auditor.md
    └── qa-engineer.md
```

### 12.1 Workflow propuesto (versión base, sin BDD)

> **Nota:** esta es la versión base del workflow. En la **sección 13.6** se presenta la versión definitiva con la capa BDD outside-in añadida, que es la recomendada para entornos enterprise/regulados. La versión base de abajo es suficiente para proyectos donde BDD no aplica (CLIs, infraestructura interna, prototipos).

1. **`/constitution`** *(Spec-Kit)* — Definir guardrails corporativos: security-first, compliance, naming conventions.
2. **`/grill-me`** *(AI Hero)* — Interrogatorio sobre la feature hasta resolver el árbol de decisión.
3. **`/domain-model`** *(AI Hero)* — Establecer lenguaje ubicuo en `CONTEXT.md` y ADRs antes de redactar la spec.
4. **`/specify`** *(Spec-Kit)* — Capturar intent en `specs/<feature>.md` (qué + porqué, sin tech stack).
5. **`/clarify`** *(Spec-Kit)* — Detección y resolución de subspecificación.
6. **`/to-issues`** *(AI Hero)* — Descomposición en vertical slices independientes (HITL vs AFK).
7. **`/plan`** *(Spec-Kit)* — Plan técnico con stack definido, anclado a issues.
8. **`/tdd` estricto** *(combinar AI Hero + Superpowers)* — Red-green-refactor + verification gate.
9. **`gsd-executor`** *(GSD)* — Para slices grandes, despachar a sub-agente fresco con contexto plan-only.
10. **`/code-review` + `/security-hardening`** *(agent-skills)* — Quality gates antes de cerrar.
11. **`/handoff`** *(AI Hero)* — Si la sesión supera 80k tokens, compactar y pasar a nuevo agente.

> **Decisión de diseño**: `/specify` (Spec-Kit) y `/to-prd` (AI Hero) producen artefactos equivalentes (documento de intent). Para evitar redundancia y mantener una sola fuente de verdad auditable, **se mantiene `/specify` como única fuente de intent** y se descarta `/to-prd`. Solo se conserva `/to-issues` de AI Hero para la descomposición en slices verticales.

### 12.2 Capa de evaluación

Para todo componente que use LLM en producción (RAG, agentes internos), **Evalite suite obligatoria** con:
- Dataset versionado de inputs reales.
- LLM-as-a-Judge con rúbrica explícita.
- Métricas: precisión, latencia, costo por request.
- Run en CI antes de merge.

### 12.3 Capa de gobierno (enterprise)

- `constitution.md` revisado trimestralmente.
- ADRs obligatorios para cambios arquitectónicos (`docs/adr/`).
- `git-guardrails` hook en todos los sandboxes de agentes.
- Logs de sesión persistidos en `.planning/` por auditoría.

### 12.4 Personas mínimas (BMAD lite)

En lugar de los 21 agentes de BMAD, **4-5 personas estratégicas**:
- `architect` — diseño de interfaces y módulos profundos.
- `security-auditor` — review de seguridad obligatorio para código en frontera.
- `qa-engineer` — diseño de test plans y validación.
- `reviewer` — code review automatizado pre-merge.

### 12.5 Roadmap de adopción sugerido

| Fase | Duración | Objetivo |
|---|---|---|
| **Fase 1** | 2 semanas | Adoptar AI Hero `/grill-me` + `/tdd` en un proyecto piloto |
| **Fase 2** | 2 semanas | Añadir Spec-Kit constitution + specify en el mismo proyecto |
| **Fase 3** | 2 semanas | Integrar agent-skills review y security |
| **Fase 4** | 2 semanas | Configurar Evalite para componentes LLM |
| **Fase 5** | Continuo | Iterar, medir velocidad y calidad, ajustar |

---

## 13. El gap de QA de aceptación: BDD outside-in

### 13.1 El problema detectado

Tras revisar los seis frameworks con foco en *criterios de aceptación ejecutables*, la conclusión es incómoda: **ninguno resuelve completamente el gap entre "tests pasan" y "producto correcto"**. Esta es la auditoría detallada:

| Framework | AC formal | Ejecutable | BDD/Gherkin | QA agent dedicado |
|---|---|---|---|---|
| AI Hero | Parcial (Markdown libre) | ❌ | ❌ | ❌ |
| GSD | Sí (hard gate v1.35.0) | Sí (fail-closed) | En exploración (issue #2634) | Parcial |
| Superpowers | No formal | Sí, pero **solo técnico** | ❌ | ❌ |
| **BMAD-METHOD** | **Sí (Given/When/Then)** | Parcial (vía Quinn agent) | **Sí nativo** | **Sí (Quinn + módulo TEA)** |
| Spec-Kit | Sí (G/W/T + FR-NNN) | Vía TDD | Estilo Gherkin en MD | ❌ |
| agent-skills | Sí (exit criteria) | Sí (evidence) | ❌ | Parcial (test-engineer) |

**El veredicto duro**: ninguno produce `.feature` files **ejecutables por Cucumber/Behave conectados a un runner real**. Todos delegan la traducción AC→test al *mismo agente que escribe el código* — el mismo agente que pudo haber malinterpretado el AC. Es un bucle vicioso.

- **AI Hero, Superpowers, agent-skills**: confunden estructuralmente "tests pasan" con "producto correcto". Excelente disciplina técnica, pero el gate sigue siendo "lo que el agente decidió testear", no "lo que el usuario esperaba".
- **GSD y Spec-Kit**: hacen AC obligatorios pero como aserciones que el agente verifica. GSD es más estricto (fail-closed); Spec-Kit es más declarativo.
- **BMAD es el único que aborda el problema en serio**: Gherkin como contrato funcional, agente QA dedicado (Quinn), módulo TEA (Murat) con 9 workflows incluyendo ATDD, traceability, NFR y risk profile. Pero sus `.feature` viven como Markdown, no como suites auto-ejecutables.

### 13.2 Por qué BDD ahora sí tiene sentido (no como en 2015)

BDD vivió un renacimiento real en 2025-2026 por tres factores:

1. **Los LLMs leen, escriben y mantienen Gherkin mejor que los humanos**. La fricción histórica del mantenimiento de step definitions se redujo drásticamente.
2. **Convergencia con Spec-Driven Development**: Spec-Kit, Kiro (AWS), BMAD y Tessl usan Given/When/Then como contrato ejecutable entre humano y agente. Gojko Adzic publicó que SDD es "Specification by Example evolucionado".
3. **AFK costoso lo justifica**: tras el recorte de créditos de Anthropic (junio 2026, 5x-20x menos AFK efectivo), cada ciclo del agente tiene que estar mejor alineado. Gherkin reduce reintentos.

Casos de uso publicados:
- **lowtouch.ai** reporta agentes generando 150+ escenarios Gherkin con 95% accuracy.
- **TDAD (Test-Driven Agent Definition)**, paper arxiv 2603.08806: dos agentes — uno convierte specs conductuales a tests, otro refina prompts hasta que pasen.
- **swingerman/atdd**: plugin Claude Code que implementa ATDD de Uncle Bob con parser/IR/generator multi-lenguaje (pytest, Jest, JUnit, Go, RSpec).

### 13.3 El patrón ganador: Outside-In TDD

El patrón que está consolidándose como estándar para flujos AFK:

```
┌─────────────────────────────────────────────────────────────┐
│ OUTER LOOP — BDD/Gherkin                                    │
│  ├─ feature files versionados (.feature)                    │  ← Contrato con producto
│  ├─ Given/When/Then ejecutables (Cucumber/Behave)           │  ← Gate AFK
│  ├─ Living documentation = audit trail                      │  ← Compliance/auditoría
│  │                                                          │
│  │   ┌───────────────────────────────────────────────────┐  │
│  │   │ INNER LOOP — TDD (red-green-refactor)             │  │
│  │   │  ├─ unit tests escritos por el agente             │  │  ← Correctness técnico
│  │   │  └─ implementación mínima                         │  │
│  │   └───────────────────────────────────────────────────┘  │
│  └─ Verification: TODOS los escenarios Gherkin deben pasar  │
└─────────────────────────────────────────────────────────────┘
```

**Reglas operativas del patrón:**

1. Los `.feature` los redacta y aprueba un humano (PO, QA o el desarrollador con contexto de negocio). **El agente NO modifica feature files sin revisión humana**, romper esta regla destruye la trazabilidad.
2. El agente solo genera step definitions y código de implementación.
3. El gate AFK es "todos los escenarios Gherkin pasan", no "todos los unit tests pasan".
4. Los unit tests siguen siendo del agente (TDD interno), pero subordinados al acceptance.

### 13.4 Stack BDD recomendado para tu Harness

Dado tu stack (TypeScript/Node + Python + enterprise):

| Lenguaje | Runtime BDD | Razón |
|---|---|---|
| **TypeScript / Node** | `playwright-bdd` (E2E) + `vitest-cucumber` (unit/integration) | Mejor integración Claude Code, MCP nativo |
| **Python / Backend** | `pytest-bdd` (preferido) o `behave` | Liviano, integra con pytest existente |
| **APIs / contratos** | `karate` (opcional) | Gherkin nativo + assertions HTTP |

### 13.5 Nuevos skills a añadir al Harness

Tres skills nuevos cubren el gap completo:

```
.claude/skills/
└── acceptance/
    ├── to-scenarios/           # PRD/spec → .feature files
    │   └── SKILL.md
    ├── run-acceptance/         # Ejecuta Cucumber/Behave y reporta gaps
    │   └── SKILL.md
    └── traceability-matrix/    # Mapea AC → tests → código → commits
        └── SKILL.md
```

**Skill 1: `/to-scenarios`** (genera `.feature` ejecutables desde la spec + lenguaje ubicuo)
- Input: `specs/<feature>.md` (de `/specify`) + `CONTEXT.md` (de `/domain-model`) + clarificaciones (de `/clarify`).
- Output: `features/<feature>.feature` con escenarios Given/When/Then redactados en lenguaje ubicuo del dominio.
- Regla: el output es **borrador para revisión humana**, no commit automático. Solo el humano modifica `.feature` files una vez aprobados — el agente solo lee.

**Skill 2: `/run-acceptance`** (corre los escenarios y reporta)
- Input: rama actual + `features/` aprobados.
- Output: reporte con escenarios pasados/fallidos/pendientes + cobertura AC (cuántos AC del PRD tienen al menos un escenario).
- Gate: bloquea `/handoff` y merge si no pasan todos los escenarios marcados como `@release`.

**Skill 3: `/traceability-matrix`** (auditoría enterprise)
- Genera tabla: AC → Gherkin scenario → step definition → archivo/línea de código → commit.
- Crítico para compliance (EU AI Act, SOC2, ISO 27001).

### 13.6 Workflow actualizado (11 pasos) — corregido

> **Nota sobre el workflow original (sección 12):** dos correcciones se aplican aquí.
>
> **(1)** Falta `/domain-model` (AI Hero) para producir `CONTEXT.md` antes de que cualquier skill pueda usar el lenguaje ubicuo del dominio.
>
> **(2)** `/specify` (Spec-Kit) y `/to-prd` (AI Hero) **se solapan**: ambos producen el documento de intent. Para evitar redundancia y mantener trazabilidad enterprise, **mantenemos `/specify` como única fuente de intent** y descartamos `/to-prd`. La descomposición en slices verticales sigue siendo de AI Hero (`/to-issues`), pero opera sobre la spec, no sobre un PRD separado.

El orden corregido garantiza que cada skill consume artefactos que ya existen:

| # | Comando | Fuente | Produce | Por qué este orden |
|---|---|---|---|---|
| 1 | `/constitution` | Spec-Kit | `docs/constitution.md` | Guardrails corporativos primero — todo lo demás se evalúa contra esto. |
| 2 | `/grill-me` | AI Hero | Conversación resuelta | Resuelve ambigüedad antes de cualquier artefacto formal. |
| 3 | `/domain-model` | AI Hero | `CONTEXT.md` + ADRs | **Lenguaje ubicuo establecido antes de redactar spec o Gherkin.** |
| 4 | `/specify` | Spec-Kit | `specs/<feature>.md` | Intent + porqué, usando el lenguaje ubicuo de CONTEXT.md. |
| 5 | `/clarify` | Spec-Kit | spec enriquecida | Detecta y resuelve áreas subspecificadas. |
| 6 | `/to-scenarios` *(nuevo BDD)* | propio | `features/<feature>.feature` | **Inputs ya existen**: spec + CONTEXT + clarificaciones. Output requiere aprobación humana. **Va antes de `/to-issues` porque los escenarios son contrato de negocio, no descomposición técnica.** |
| 7 | `/to-issues` | AI Hero | issues verticales en `issues/` con frontmatter `scenarios: [scenario-id-1, scenario-id-2]` | Slices verticales que satisfacen 1+ escenarios. Cada issue declara explícitamente qué escenarios ayuda a cumplir. |
| 8 | `/plan` | Spec-Kit | plan técnico | Plan con stack definido, anclado a issues y escenarios. |
| 9 | `/tdd` | AI Hero + Superpowers | tests + código | Inner loop: red-green-refactor por slice. |
| 10 | `/run-acceptance` *(nuevo BDD)* | propio | reporte de escenarios | **Gate outside-in**: bloquea handoff si no pasan los `.feature`. |
| 11 | `/code-review` + `/security-hardening` | agent-skills | review report | Quality gates de Google-style. |
| 12 | `/traceability-matrix` *(nuevo BDD)* | propio | matriz AC→test→código→commit | Audit trail para compliance. |

> **Aclaración**: son 12 pasos en el workflow completo, no 11 como decía la versión previa. La numeración anterior era incorrecta porque omitía `/domain-model`.

### 13.7 Por qué este orden — y la relación N:N entre escenarios e issues

**Decisión: `/to-scenarios` va antes de `/to-issues`**, no al revés. Las razones:

1. **Niveles de abstracción distintos.** Un escenario Gherkin es un contrato con el negocio — debe ser legible para PO/QA no técnicos. Un issue ya tiene jerga técnica. Si invertimos el orden, los escenarios heredan acoplamiento técnico y dejan de ser contrato.

2. **Trazabilidad N:N saludable.** Un escenario end-to-end suele cruzar **varios** vertical slices (toca DB + API + UI). Si hacemos issues primero, caemos en "1 escenario = 1 issue" y perdemos la perspectiva del usuario.

3. **Independencia.** Si cambia la descomposición técnica (refactor de slices, migración a microservicios), los escenarios no se tocan porque el contrato de negocio no cambió. Si los escenarios derivan de issues, cada refactor rompe el audit trail.

4. **Es el patrón validado en 2025-2026.** Outside-In TDD ortodoxo (Adzic, Uncle Bob, ATDD canónico), implementado por `swingerman/atdd` y asumido por los papers TDAD.

**Relación bidireccional explícita:**

```
scenarios/login-recovery.feature
  ├─ Scenario: User recovers password via email     ← id: scn-001
  ├─ Scenario: User recovers password via SMS       ← id: scn-002
  └─ Scenario: User exceeds recovery attempts       ← id: scn-003

issues/
  ├─ 001-add-recovery-endpoint.md         scenarios: [scn-001, scn-002, scn-003]
  ├─ 002-email-template-service.md        scenarios: [scn-001]
  ├─ 003-sms-gateway-integration.md       scenarios: [scn-002]
  └─ 004-rate-limiter-on-recovery.md      scenarios: [scn-003]
```

Esta relación N:N se hace cumplir vía:
- **Frontmatter obligatorio** en cada issue (`scenarios: [...]`).
- **Validación en `/run-acceptance`**: cada escenario debe tener al menos un issue que lo satisfaga (cobertura inversa).
- **Generación en `/traceability-matrix`**: produce la matriz cruzada AC ↔ scenario ↔ issue ↔ commit.

### 13.8 Excepción documentada: features muy grandes

Hay un caso donde **invertir el orden tiene mérito**: features muy grandes donde escribir todos los escenarios upfront se vuelve abrumador. Estrategia híbrida válida:

1. `/to-issues` primero para identificar los slices principales.
2. `/to-scenarios` por slice (escenarios focalizados al alcance).

**Costo de esta inversión**: pierdes pureza del Outside-In porque ya piensas técnicamente al redactar los escenarios, y el audit trail se debilita. Para entornos enterprise/regulados (tu caso Simetrik), el costo es alto y **no se recomienda salvo features excepcionalmente grandes** (estimación >2 sprints). Para features típicas, mantener el orden canónico.

### 13.9 Dependencias entre artefactos (visualización)

```
/constitution → constitution.md ─────────────────────────────────┐
                                                                 │
/grill-me → conversación resuelta                                │
                  │                                              │
                  ▼                                              │
/domain-model → CONTEXT.md + ADRs ◄────────────────────┐         │
                  │                                    │         │
                  ▼                                    │         │
/specify → specs/<feature>.md ─────────────────┐       │         │
                  │                            │       │         │
                  ▼                            │       │         │
/clarify → spec enriquecida ─────────────────┐ │       │         │
                                             ▼ ▼       │         │
/to-scenarios → features/<feature>.feature ◄─┴─┴───────┘         │
                  │                                              │
                  ▼                                              │
/to-issues → issues/*.md ─────────┐                              │
                  │               │                              │
                  ▼               │                              │
/plan → plan técnico              │                              │
                  │               │                              │
                  ▼               ▼                              │
/tdd → tests + código ◄───────────┘                              │
                  │                                              │
                  ▼                                              │
/run-acceptance → reporte (todos los .feature deben pasar) ◄─────┤
                  │                                              │
                  ▼                                              │
/code-review + /security-hardening ◄─────────────────────────────┘
                  │
                  ▼
/traceability-matrix → audit trail
```

### 13.10 Cuándo NO usar BDD (importante)

BDD outside-in tiene overhead. **No lo apliques cuando:**

- El componente es **infraestructura interna** sin stakeholder de negocio (CLIs, migraciones, scripts de build).
- El dominio **cambia diariamente** durante exploración (prototipos `/prototype`).
- **No hay** un humano que lea y mantenga los `.feature` (sin stakeholder, Gherkin es solo documentación de tests cara).
- Para utilities pequeñas, **property-based testing** (fast-check en TS, Hypothesis en Python) suele dar mejor cobertura por costo.

**Sí aplícalo cuando:**

- Hay criterios de aceptación de producto explícitos.
- El componente vive en una frontera regulada (datos sensibles, transacciones, decisiones automatizadas).
- Hay flujos AFK largos donde el costo de "construir lo equivocado" supera el overhead de BDD.
- Necesitas evidencia auditable de qué se entregó vs qué se pidió.

### 13.11 Roadmap de adopción BDD (4 semanas)

| Semana | Objetivo |
|---|---|
| **1** | Setup técnico: instalar `playwright-bdd` (TS) y `pytest-bdd` (Python). Configurar CI para correr escenarios. |
| **2** | Escribir 3-5 `.feature` files manuales para un módulo piloto. Validar que cubren AC reales. |
| **3** | Crear skill `/to-scenarios`. Probar generación automática vs los `.feature` manuales. Iterar. |
| **4** | Activar `/run-acceptance` como gate de merge. Medir tasa de reintentos AFK pre/post. |

### 13.12 Veredicto

**Sí, vale la pena añadir BDD outside-in al Harness**, pero como capa selectiva, no universal. La combinación que mejor encaja con tu contexto Simetrik:

> **Spec-Kit (intent) + BDD outside-in (aceptación) + AI Hero `/tdd` (correctness) + agent-skills review + Evalite (eval LLM)**

Esta arquitectura cubre el gap que AI Hero deja abierto, justifica el overhead en flujos AFK costosos, y produce los artefactos auditables que enterprise/regulado requiere.

---

## 14. Estrategia Day Shift / Night Shift (Ralph)

### 14.1 ¿Qué es Ralph realmente?

**Ralph** es una técnica de loop autónomo donde un agente de codificación (típicamente Claude Code) ejecuta iterativamente sobre un PRD o lista de tareas hasta completarla. La forma canónica original es un loop bash:

```bash
while :; do cat PROMPT.md | claude -p; done
```

**Atribución correcta**: la técnica la inventó **Geoffrey Huntley** ([ghuntley.com/ralph](https://ghuntley.com/ralph/)), no Matt Pocock. Pocock la popularizó en AI Hero (workshop "Day 5: Ralph") como parte del shift mental Day/Night. El nombre es doble homenaje a (a) **Ralph Wiggum** de Los Simpson — ignorancia, persistencia y optimismo — y (b) jerga ochentera para "vomitar" output sin parar.

### 14.2 Decisión de arquitectura: **Ralph local-first**

Para el Harness Simetrik, Ralph corre **localmente en la máquina del developer**, no en infraestructura remota (GitHub Actions, servidores). Esto es exactamente como Matt Pocock lo enseña en AI Hero: un script `.sh` que usa `gh` CLI para leer issues de GitHub como cola de trabajo, procesa una por una, abre PRs.

**Por qué local-first inicialmente:**

- **Cero infraestructura adicional** — un `.sh` y `gh` CLI ya instalados son suficientes.
- **Control visual y debugging directo** — ves el output en tu terminal, puedes pausar con Ctrl+C.
- **Iteración rápida del propio script** — modificas el `.sh` y relanzas sin pipeline.
- **Sin permisos de organización** — no necesitas configurar secrets en GitHub Actions ni runners self-hosted.
- **El recorte AFK de Anthropic aplica igual** — el costo está en los tokens API, no en dónde corre el script. No hay ahorro real al ejecutarlo remoto.

**Trade-offs aceptados** (mitigables después):

- La máquina del developer debe estar encendida y con red.
- El proceso muere si se duerme el laptop (usar `caffeinate` en macOS o `systemd-inhibit` en Linux).
- No hay multi-developer queueing nativo (cada developer tiene su propio loop local).

### 14.3 Tres opciones técnicas para implementar Ralph

| Opción | Forma | Uso recomendado en el Harness |
|---|---|---|
| **A. `.sh` local + `gh` CLI** | `while`/`for` en bash que lee issues con label `ralph-ready` | **✅ Elección inicial.** Lo que hace Pocock. Simple, observable, debuggeable. |
| **B. Plugin oficial `ralph-wiggum`** | Stop hook que reinyecta prompt en la misma sesión | Útil cuando ya estás dentro de Claude Code interactivo y quieres autonomía. Complementa A, no la reemplaza. |
| **C. Loop bash crudo original** | `while :; do cat PROMPT.md \| claude -p; done` | Solo para experimentos puntuales. No usar en producción. |

**La opción A es nuestra base.** El plugin (B) puede sumarse después para tareas interactivas largas. La opción C queda como referencia histórica de Geoffrey Huntley.

### 14.4 Script de referencia: `ralph-local.sh`

Estructura mínima del script que el Harness asume:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ralph-local.sh — Ralph local con GitHub Issues como cola
# Requisitos: gh CLI autenticado, claude CLI, jq, Docker (sandbox)

LABEL="ralph-ready"
MAX_ITERATIONS_PER_ISSUE=30
TOKEN_BUDGET_REMAINING=$(cat .planning/budget.txt)
LOG_DIR=".planning/ralph-sessions"
mkdir -p "$LOG_DIR"

while :; do
  # 1. Buscar siguiente issue con label ralph-ready
  ISSUE_JSON=$(gh issue list \
    --label "$LABEL" \
    --state open \
    --limit 1 \
    --json number,title,body,labels)

  ISSUE_NUMBER=$(echo "$ISSUE_JSON" | jq -r '.[0].number // empty')

  if [ -z "$ISSUE_NUMBER" ]; then
    echo "No hay issues '$LABEL'. Fin del loop."
    break
  fi

  # 2. Validar presupuesto antes de empezar
  ESTIMATED=$(echo "$ISSUE_JSON" | jq -r '.[0].body' | grep -oP 'estimated-tokens:\s*\K\d+' || echo 50000)
  if [ "$ESTIMATED" -gt "$TOKEN_BUDGET_REMAINING" ]; then
    echo "Issue #$ISSUE_NUMBER excede presupuesto. Saltando."
    gh issue edit "$ISSUE_NUMBER" --remove-label "$LABEL" --add-label "budget-exceeded"
    continue
  fi

  # 3. Branch dedicada
  BRANCH="agent/issue-$ISSUE_NUMBER"
  git checkout -b "$BRANCH" main

  # 4. Ejecutar Claude Code dentro de sandbox Docker
  SESSION_LOG="$LOG_DIR/issue-$ISSUE_NUMBER-$(date +%Y%m%d-%H%M%S).log"
  docker run --rm \
    -v "$(pwd):/workspace" \
    -w /workspace \
    -e ANTHROPIC_API_KEY \
    claude-sandbox:latest \
    claude -p \
      --max-iterations "$MAX_ITERATIONS_PER_ISSUE" \
      --system-prompt "$(cat .claude/AGENTS.md)" \
      "Implementa el issue #$ISSUE_NUMBER siguiendo /tdd. Cuando todos los .feature scenarios pasen vía /run-acceptance, abre PR y marca el issue como completed." \
      2>&1 | tee "$SESSION_LOG"

  # 5. Verificar resultado
  if /run-acceptance --issue "$ISSUE_NUMBER" --gate; then
    gh pr create --base main --head "$BRANCH" \
      --title "Closes #$ISSUE_NUMBER" \
      --body "Generado por Ralph local. Sesión: $SESSION_LOG"
    gh issue edit "$ISSUE_NUMBER" --remove-label "$LABEL" --add-label "ralph-done"
  else
    gh issue edit "$ISSUE_NUMBER" --remove-label "$LABEL" --add-label "ralph-blocked"
    gh issue comment "$ISSUE_NUMBER" --body "Ralph no pudo cerrar el gate. Ver $SESSION_LOG"
  fi

  # 6. Actualizar presupuesto
  CONSUMED=$(grep -oP 'tokens_used:\s*\K\d+' "$SESSION_LOG" | tail -1)
  TOKEN_BUDGET_REMAINING=$((TOKEN_BUDGET_REMAINING - CONSUMED))
  echo "$TOKEN_BUDGET_REMAINING" > .planning/budget.txt

  # 7. Anti-suspensión (macOS — adaptar a Linux con systemd-inhibit)
  # Lanzar el script desde inicio con: caffeinate -i ./ralph-local.sh
done

echo "Ralph local finalizado. Presupuesto restante: $TOKEN_BUDGET_REMAINING tokens."
```

**Notas operativas:**

- El sandbox Docker (`claude-sandbox:latest`) es una imagen propia que el Harness debe construir. Aísla el filesystem del developer.
- El script usa `gh` CLI nativo de GitHub — autenticación una sola vez con `gh auth login`.
- `caffeinate -i ./ralph-local.sh` en macOS evita que el sistema duerma durante la ejecución.
- El presupuesto vive en `.planning/budget.txt` versionable (gitignored) para no perderlo entre sesiones.

### 14.5 Day Shift vs Night Shift en nuestro workflow

El workflow de 12 pasos que diseñamos en la sección 13.6 se divide naturalmente en dos turnos. **Cada paso se etiqueta como HITL (Human-In-The-Loop) o AFK (Away-From-Keyboard)**:

| # | Paso | Turno | Por qué |
|---|---|---|---|
| 1 | `/constitution` | **Day (HITL)** | Decisión de gobierno corporativo. Nunca AFK. |
| 2 | `/grill-me` | **Day (HITL)** | Requiere humano respondiendo el interrogatorio. |
| 3 | `/domain-model` | **Day (HITL)** | El lenguaje ubicuo lo aprueba el humano. |
| 4 | `/specify` | **Day (HITL)** | Captura de intent — humano valida. |
| 5 | `/clarify` | **Day (HITL)** | Resolución de ambigüedad requiere humano. |
| 6 | `/to-scenarios` | **Day (HITL)** | **Crítico**: los `.feature` aprobados son contrato. Romper esto destruye trazabilidad. |
| 7 | `/to-issues` | **Híbrido** | Generación AFK + revisión Day antes de etiquetar. |
| 8 | `/plan` | **Day (HITL)** | Plan técnico revisado por humano. |
| 9 | `/tdd` | **Night (AFK / Ralph)** | Implementación red-green-refactor por slice. **Este es el corazón del Night Shift.** |
| 10 | `/run-acceptance` | **Night (AFK)** | Gate ejecutable: Ralph termina cuando todos los `.feature` pasan. |
| 11 | `/code-review` + `/security-hardening` | **Night (AFK) → Day (HITL final)** | Review automatizado AFK, aprobación final del humano al día siguiente. |
| 12 | `/traceability-matrix` | **Night (AFK)** | Generación automática del audit trail. |

### 14.6 Etiquetado de issues: GitHub Labels nativos

Como Ralph corre local y consume issues vía `gh` CLI, usamos **labels nativos de GitHub Issues** (no YAML custom) para que el filtrado funcione sin parsers adicionales. El skill `/to-issues` aplica estos labels automáticamente al crear cada issue:

| Label | Propósito | Valor |
|---|---|---|
| `ralph-ready` | Gate principal: Ralph solo procesa issues con este label | Aplicar manualmente por humano al final del Day Shift |
| `shift:afk` / `shift:hitl` / `shift:hybrid` | Clasificación del tipo de trabajo | Aplicado por `/to-issues` según contenido |
| `scenarios:scn-001,scn-002` | IDs de escenarios Gherkin que cubre | Aplicado por `/to-issues` |
| `budget:50k` | Presupuesto estimado en tokens (50k, 100k, 200k) | Aplicado por `/to-issues` con LLM heurística |
| `ralph-done` | Aplicado por el script al cerrar PR exitoso | Automático |
| `ralph-blocked` | Aplicado si Ralph no pudo cerrar el gate | Automático |
| `budget-exceeded` | Aplicado si el issue excede presupuesto restante | Automático |
| `require-human-review` | Aunque pase el gate, requiere review humano para merge | Aplicar a issues sensibles |

**El cuerpo del issue (body Markdown) sí incluye metadata estructurada** que el agente lee, pero los **labels son la única fuente de verdad para el filtrado**:

```markdown
## Issue 001 — Endpoint de recuperación de password

**Scenarios cubiertos:** scn-001, scn-002, scn-003 (ver `features/password-recovery.feature`)

**Vertical slice:** API endpoint + service layer + email integration

**Acceptance:** todos los scenarios marcados `@release` deben pasar.

**Estimación tokens:** ~50000 (1 ciclo /tdd completo + /run-acceptance)

**Constraints:**
- Usar el ubiquitous language de CONTEXT.md
- Respetar constitution.md sección "data-handling"
- Rate limit: max 5 intentos por usuario/hora (ver scn-003)
```

**Reglas de filtrado del `.sh` Ralph:**

- Procesa solo issues con label `ralph-ready` AND `shift:afk` (o `shift:hybrid`).
- Lee `budget:NNk` y aborta si excede el saldo restante.
- Para `shift:hybrid` o `require-human-review`, abre PR como **draft** (no auto-merge).
- Salta issues sin `scenarios:` (no hay gate objetivo → no entra al loop).

### 14.7 BDD outside-in resuelve el problema crítico de Ralph

El **mayor riesgo conocido** de Ralph es el "martillar indefinidamente" tareas imposibles. Sin un criterio objetivo de salida, el agente consume tokens en loops degenerados. **Nuestro diseño BDD outside-in resuelve esto estructuralmente**:

```
┌────────────────────────────────────────────────────────────┐
│ Ralph entra al loop con un issue marcado ralph-ready       │
│                                                            │
│   ┌────────────────────────────────────────────────────┐   │
│   │ Itera red-green-refactor en /tdd                   │   │
│   │   │                                                │   │
│   │   ▼                                                │   │
│   │ ¿Pasan los .feature scenarios asociados al issue?  │   │
│   │   │                                                │   │
│   │   ├─ Sí  → Marca issue completed, sale del loop    │   │
│   │   └─ No  → Otra iteración                          │   │
│   └────────────────────────────────────────────────────┘   │
│                                                            │
│ Escape hatches:                                            │
│   • --max-iterations alcanzado                             │
│   • estimated-tokens excedido                              │
│   • Test/build/lint command no encontrado                  │
│   • git-guardrails bloquea operación                       │
└────────────────────────────────────────────────────────────┘
```

Sin BDD, Ralph no sabe cuándo parar. Con BDD, los escenarios Gherkin son su `definition of done` objetivo.

### 14.8 Economía: viabilidad post-recorte AFK (15 jun 2026)

El cambio de pricing de Anthropic impacta directamente a Ralph. Análisis publicados reportan:

- **Sonnet en loop continuo**: ~$10.42/hora medido en burn rate de 24h.
- **Aumento efectivo**: 12x a 175x según carga (Community Note a Lydia Hallie, Anthropic).
- **Pro ($20/mes)**: créditos AFK dedicados se agotan en horas de Ralph continuo.
- **Max 20x ($200/mes)**: viable para Ralph nocturno selectivo, no continuo.

**Estrategia de costo recomendada para el Harness:**

1. **Presupuesto mensual de AFK por proyecto**: define un techo en `constitution.md`.
2. **Cada issue declara `estimated-tokens`** en su frontmatter; Ralph aborta si excede.
3. **Reserva AFK para slices con BDD definido**: sin `.feature` no hay AFK (sin gate objetivo, el costo se dispara).
4. **Considera Codex CLI con `/goal`** como alternativa para loops largos no críticos. Apache 2.0, loop nativo, sin recorte equivalente. Recomendación común en 2026: Claude Code skills para playbook diario + Codex `/goal` para loops autónomos largos.
5. **Monitoreo de burn rate**: dashboard que muestre tokens consumidos por Ralph vs. tokens completados (escenarios pasados).

### 14.9 Guardrails locales obligatorios para Night Shift

Ralph corriendo en **tu propia máquina** sin supervisión requiere defensa en profundidad. El riesgo es **más alto que en remoto** porque el agente puede tocar archivos del developer fuera del repo si no está sandboxed:

| Guardrail | Herramienta | Función | Por qué importa más en local |
|---|---|---|---|
| **Sandbox Docker obligatorio** | Imagen `claude-sandbox` propia + `-v $(pwd):/workspace` | Aísla el FS del developer, restringe red | Sin esto, el agente puede leer `~/.ssh`, `~/.aws`, etc. |
| **Git protection** | `git-guardrails-claude-code` (AI Hero) | Bloquea `push`, `reset --hard`, `clean`, `branch -D` | En local puede destruir tu working copy |
| **Branch dedicada** | Workflow Git: `agent/issue-NNN` | Ralph nunca toca `main` ni la branch activa del developer | Evita conflictos con tu trabajo en paralelo |
| **Escape hatch** | `--max-iterations N` (sin `=`, ver bug #18646) | Tope duro de iteraciones | Evita "martillar" infinitamente |
| **Presupuesto de tokens** | Label `budget:NNk` + `.planning/budget.txt` | Aborta si excede saldo restante | El recorte AFK lo hace crítico |
| **Aprobación humana de merge** | PR como `draft` cuando `require-human-review` | Day Shift cierra el ciclo | Compliance enterprise |
| **Audit log** | `.planning/ralph-sessions/issue-NNN-*.log` | Histórico de cada sesión | Trazabilidad post-mortem |
| **Anti-suspensión** | `caffeinate -i ./ralph-local.sh` (macOS) o `systemd-inhibit` (Linux) | Evita que el sistema duerma | Si se duerme, Ralph muere a mitad de ciclo |
| **Notificación de fin** | `osascript -e 'display notification ...'` (macOS) o `notify-send` (Linux) | Avisa al developer cuando termina | Para revisar PRs al despertar |

### 14.10 Workflow operativo diario sugerido (local)

**Día (Day Shift — humano, en su computadora):**

- **Mañana**: el developer abre los PRs en `draft` que Ralph generó durante la noche. Revisa logs en `.planning/ralph-sessions/`.
- Aprueba/rechaza con `/code-review` final. Si rechaza, comenta el PR; Ralph no reabre — el humano decide si re-etiqueta.
- Sesiones de `/grill-me`, `/specify`, `/clarify`, `/to-scenarios` para nuevas features (Claude Code interactivo).
- Refinamiento de `.feature` files con stakeholders de producto.
- **Final del día**: ejecuta `/to-issues` para crear issues en GitHub vía `gh`, los marca con label `ralph-ready` los que están listos, ajusta `budget:NNk`.
- **Antes de irse**: lanza `caffeinate -i ./ralph-local.sh > .planning/ralph-tonight.log 2>&1 &` (macOS) y cierra el laptop con tapa abierta o configura el screen lock para que no suspenda.

**Noche (Night Shift — Ralph corriendo en la máquina del developer):**

- El `.sh` itera leyendo issues con label `ralph-ready` vía `gh issue list`.
- Por cada issue: levanta sandbox Docker, ejecuta `/tdd` iterativamente, corre `/run-acceptance`, si pasa → commit + `gh pr create --draft`.
- Si falla: aplica label `ralph-blocked`, comenta el issue con link al log de sesión.
- `/code-review` y `/security-hardening` automáticos antes de abrir el PR.
- `/traceability-matrix` se regenera al final del loop.
- Cuando no hay más issues con `ralph-ready`, el script termina y dispara `notify-send`/`osascript` para avisar al developer.

**Multi-developer** (a futuro, no inicial):

- Cada developer corre su propio `ralph-local.sh` apuntando a issues con un label personal (`ralph-yei`, `ralph-juan`, etc.) para evitar que dos máquinas tomen el mismo issue.
- Cuando crezca, migrar a runner self-hosted en una VM compartida (paso natural sin cambiar el `.sh`).

### 14.11 Paralelización de Ralph: tres ejes posibles

Ralph clásico es **secuencial**: lee un issue, lo procesa de principio a fin, abre PR, siguiente issue. Para una noche típica de 8 horas y un tiempo promedio de 30-90 minutos por issue, eso significa **5 a 15 issues procesadas**. Si tu backlog crece más rápido que eso, hay tres ejes de paralelización viables.

#### 14.11.1 Eje 1 — Múltiples procesos en la misma máquina (paralelismo horizontal)

Lanzar N copias del `.sh` en paralelo, cada una procesando un issue distinto.

**Patrón:**

```bash
# Lanzar 3 workers
for worker_id in 1 2 3; do
  caffeinate -i ./ralph-local.sh --worker-id "$worker_id" \
    > ".planning/ralph-tonight-worker-$worker_id.log" 2>&1 &
done
wait
```

**Requisitos críticos para que funcione sin pisarse:**

| Requisito | Solución |
|---|---|
| Cada worker en su propio working directory | **Git worktrees** (`git worktree add ../repo-w1 main`) |
| No tomar el mismo issue dos veces | **Lock vía label** `ralph-in-progress-w1`, `ralph-in-progress-w2`, etc. |
| Sandbox Docker independiente por worker | `--name claude-sandbox-w$WORKER_ID` |
| Presupuesto compartido sin race condition | `flock` sobre `.planning/budget.txt` antes de escribir |
| Logs separados | `.planning/ralph-sessions/issue-NNN-worker-N-*.log` |

**Pseudocódigo del filtro de issues con locking atómico:**

```bash
# Atomic claim: aplica el lock label y verifica que solo este worker lo tomó
gh issue edit "$ISSUE_NUMBER" --add-label "ralph-in-progress-w$WORKER_ID"
ACTUAL_LABELS=$(gh issue view "$ISSUE_NUMBER" --json labels --jq '.labels[].name')
LOCK_COUNT=$(echo "$ACTUAL_LABELS" | grep -c "^ralph-in-progress-")

if [ "$LOCK_COUNT" -gt 1 ]; then
  # Race condition: otro worker llegó primero, soltar y seguir
  gh issue edit "$ISSUE_NUMBER" --remove-label "ralph-in-progress-w$WORKER_ID"
  continue
fi
# Si llegamos aquí, este worker tiene el issue exclusivamente
```

**Límite práctico**: 2-3 workers en una máquina local típica (laptop 16GB RAM, M-series Mac). Más allá saturas CPU, RAM, IO de Docker, y conexión a Anthropic.

#### 14.11.2 Eje 2 — Git worktrees (paralelismo de filesystem)

**Esto no es opcional si paralelizas el Eje 1.** Sin worktrees, dos workers en el mismo working copy se pisan a nivel de archivo en milisegundos.

```bash
# Setup inicial (una vez)
git worktree add ../repo-worker-1 main
git worktree add ../repo-worker-2 main
git worktree add ../repo-worker-3 main

# El .sh recibe --worktree-path y hace cd ahí antes de empezar
./ralph-local.sh --worker-id 1 --worktree-path ../repo-worker-1 &
./ralph-local.sh --worker-id 2 --worktree-path ../repo-worker-2 &
./ralph-local.sh --worker-id 3 --worktree-path ../repo-worker-3 &
```

**Por qué worktrees y no clones**: comparten el `.git/` real, ahorran disco, y los branches creados por un worker son visibles desde los otros (importante para revisar PRs cruzados).

**Trampa común**: cada worktree comparte `.planning/` solo si lo configuras explícitamente (symlink o script de sync). Lo más limpio es mantener `.planning/` central en el worktree original y que los workers escriban ahí con `flock`.

#### 14.11.3 Eje 3 — Sub-agentes intra-issue (paralelismo vertical)

En lugar de paralelizar issues completas, **paralelizas el trabajo dentro de un mismo issue** usando sub-agentes con contexto fresco. Este es el patrón de GSD (`gsd-executor`) y Superpowers (`subagent-driven-development`).

**Ejemplo concreto** dentro de un issue de "endpoint de password recovery":

```
Orquestador (sesión principal)
  ├─ Sub-agente A: implementa controller + tests unitarios
  ├─ Sub-agente B: implementa service layer + tests
  ├─ Sub-agente C: implementa integración con email gateway
  └─ Espera a los tres, hace merge interno, corre /run-acceptance
```

**Ventaja sobre el Eje 1**: cada sub-agente arranca con contexto fresco (no acumula degradación), y todos comparten el mismo `.feature` como gate. **Limitación**: solo aplica cuando un issue tiene sub-tareas independientes — para issues atómicos no aporta nada.

**Combinable con Eje 1**: workers paralelos, donde cada worker internamente usa sub-agentes para sus tareas. El factor de paralelización efectivo se multiplica (N workers × M sub-agentes), pero el costo de tokens también.

#### 14.11.4 ¿Es necesario paralelizar?

**Respuesta corta: depende del ratio backlog vs. presupuesto AFK.** Tabla de decisión:

| Situación | Recomendación |
|---|---|
| Backlog < 5 issues `ralph-ready` por noche | **Secuencial.** Paralelizar no ayuda (corres rápido pero acabas igual). |
| Backlog 5-15 issues, tiempo promedio 30-60 min | **Secuencial inicial**, paralelizar (2 workers) si después de 2 semanas sigues sin vaciar el backlog. |
| Backlog > 15 issues, presupuesto AFK suficiente | **Paralelizar 2-3 workers** + git worktrees + locking. |
| Issues caros (>2h cada uno) | **Sub-agentes (Eje 3)** dentro del issue, no paralelizar issues completas. |
| Issues con dependencias cruzadas frecuentes | **Secuencial** o paralelizar solo por dominio (`shift:afk + domain:backend`). |
| Presupuesto AFK ajustado post-recorte Anthropic | **Secuencial** o usar Codex `/goal` como worker barato para issues no-críticos. |

#### 14.11.5 Riesgos específicos de paralelizar

| Riesgo | Mitigación |
|---|---|
| **Doble pick de issue** (race condition) | Lock label + verificación post-aplicación (ver pseudocódigo arriba) |
| **Conflictos de merge** entre PRs paralelos | Particionar por dominio (`domain:backend`, `domain:frontend`); evitar issues que tocan los mismos archivos en paralelo |
| **Burn rate de tokens N veces más rápido** | Presupuesto compartido con `flock`; abortar workers cuando el global se agota |
| **Debugging exponencialmente más difícil** | Logs separados por worker + tags en cada PR identificando worker-id |
| **Saturación de la API de Anthropic** | Rate limits oficiales: ~50 req/min en Tier 2. Paralelizar > 3 workers puede causar 429s. |
| **CPU/RAM/IO local** | Monitorear con `htop`/`Activity Monitor`; bajar de 3 a 2 workers si la máquina se calienta |
| **Logs entrelazados** | Cada worker escribe a su propio archivo, jamás a stdout compartido |

#### 14.11.6 Patrón recomendado para Simetrik

**Fase de adopción inicial (mes 1-2):**

- 1 worker secuencial.
- Mide: issues completadas por noche, tasa de fallos, tokens consumidos por issue.
- Documenta tiempos reales en `.planning/metrics.csv`.

**Fase de optimización (mes 3+, solo si los datos lo justifican):**

- 2 workers + git worktrees + locking de labels.
- Particionado por dominio: worker A para `domain:backend`, worker B para `domain:frontend` (reduce conflictos de merge a casi cero).
- Sub-agentes (Eje 3) dentro de issues grandes detectados manualmente.

**Anti-patrón a evitar:**

- 5+ workers en una sola máquina local — saturas hardware y API.
- Paralelizar sin worktrees — corrupción de working copy garantizada.
- Paralelizar sin `.feature` definidos — multiplicas el burn rate sin gate objetivo.
- Asumir que 2x workers = 2x velocidad — la realidad es 1.4x-1.7x por la coordinación y los conflictos.

### 14.12 Veredicto sobre Ralph en el Harness (local-first)

**Sí, Ralph entra al Harness pero con restricciones explícitas:**

1. **Implementación local con `.sh` + `gh` CLI** — estilo Matt Pocock, no infraestructura remota.
2. **Solo sobre issues con BDD definido** — sin `.feature` no hay Ralph (el gate objetivo es no-negociable).
3. **Sandbox Docker + git-guardrails obligatorios** — el riesgo es mayor en local que en remoto.
4. **Labels nativos de GitHub Issues** (`ralph-ready`, `shift:afk`, `budget:NNk`) — sin parsers custom.
5. **Presupuesto de tokens en `.planning/budget.txt`** — control post-recorte AFK.
6. **PRs siempre `draft`** cuando require-human-review, merge humano en el Day Shift.
7. **Codex CLI `/goal` como plan B** para loops largos no críticos donde el costo de Claude AFK sea prohibitivo.
8. **Anti-suspensión obligatorio** (`caffeinate` en macOS, `systemd-inhibit` en Linux) — si la máquina duerme, Ralph muere.

**Path de evolución:**

- **Hoy**: `.sh` local en la máquina del developer.
- **3-6 meses**: VM dedicada o self-hosted runner cuando el equipo crezca (mismo `.sh`, distinta máquina).
- **6-12 meses**: GitHub Actions con `workflow_dispatch` si el equipo necesita queueing multi-developer real.

El gap original que detectaste (AI Hero no garantiza alineación con expectativas) se cierra completamente con esta arquitectura: **el contrato con producto vive en los `.feature` (Day Shift), la implementación corre AFK con Ralph local (Night Shift), y el gate es objetivo (Cucumber/Behave runner). Eso es exactamente lo que Matt Pocock no resuelve por sí solo** — y el local-first te permite empezar mañana sin pedir permisos de infraestructura.

---

## 15. Capa transversal: reglas de código y arquitectura

### 15.1 El gap detectado

El Harness diseñado hasta aquí asume implícitamente que el agente conoce las reglas técnicas del proyecto (arquitectura hexagonal, naming conventions, test coverage mínimo, complejidad ciclomática máxima, dependencias permitidas). En la práctica, **el agente no las conoce salvo que estén explícitas en algún artefacto persistente**. Sin esta capa, el código generado por Ralph cumple los `.feature` pero viola la arquitectura del proyecto, y el `/code-review` termina rechazando trabajo nocturno por razones que pudieron prevenirse.

Esta capa es **transversal**: no es un paso del workflow, es una **constraint que atraviesa todos los pasos**.

### 15.2 Dónde se ubica en el Harness

Las reglas técnicas se distribuyen en cuatro niveles, cada uno con propósito distinto. La regla de oro: **lo más restrictivo siempre arriba**.

| Nivel | Artefacto | Contiene | Quién lo enforce |
|---|---|---|---|
| **1. Constitucional** | `docs/constitution.md` (Spec-Kit) | Principios inviolables: "arquitectura hexagonal obligatoria", "no acoplar dominio a infraestructura", "coverage ≥ 80%" | Humano en `/code-review`; auditable en `traceability-matrix` |
| **2. Operacional** | `AGENTS.md` (AI Hero) | Reglas que el agente lee al inicio de cada sesión: convenciones de naming, estructura de carpetas, patrones permitidos | El agente al planificar; bloqueante en `/tdd` |
| **3. Sintáctico** | `.eslintrc`, `pyproject.toml` (ruff, black), `tsconfig`, `commitlint.config` | Sintaxis, formato, imports, complejidad ciclomática | Tooling automático en `/setup-pre-commit` |
| **4. Runtime** | Hooks (`git-guardrails`, husky, pre-commit) | Validación al commit/push | Hook bloquea operación si falla |

### 15.3 Qué cubre cada nivel

**Nivel 1 — Constitución (qué NO se negocia):**

- Estilo arquitectónico (hexagonal / clean / DDD layered).
- Boundary entre dominio e infraestructura.
- Coverage mínimo por capa (típicamente: dominio 90%, aplicación 80%, infra 60%).
- Dependencias prohibidas (ej: dominio nunca importa de infrastructure).
- SLOs de calidad: zero linter errors, zero secrets en commits, zero deps con CVE críticas.

**Nivel 2 — Operacional (cómo se hace):**

- Convenciones de naming (Pascal/camel/snake, sufijos `*Service`, `*Repository`, etc.).
- Estructura de carpetas por bounded context.
- Patrones aceptados (Repository, Factory, Strategy) y prohibidos (Singleton mutable, God objects).
- Estándares de logging y observabilidad (qué se loggea, formato, niveles).
- Convenciones de mensajes de commit (Conventional Commits).

**Nivel 3 — Sintáctico (qué la máquina valida):**

- Linters: `eslint` (TS), `ruff` (Python), `golangci-lint`, etc.
- Formatters: `prettier`, `black`, `gofmt`.
- Complejidad ciclomática máxima por función (típicamente 10-15).
- Longitud máxima de función/archivo.
- Imports ordenados y sin no-usados.

**Nivel 4 — Runtime (qué bloquea la acción):**

- Pre-commit hooks que corren linters, formatters y tests rápidos.
- `git-guardrails-claude-code` bloquea operaciones git destructivas (`reset --hard`, `push --force`).
- Pre-push hook que corre `/run-acceptance` light (escenarios marcados `@smoke`).

### 15.4 Cómo el agente consulta esta capa

El agente NO lee los 4 niveles en cada turno (sería desperdicio de tokens). Aplica **divulgación progresiva**:

- **Sesión inicial**: lee solo `AGENTS.md` (índice ligero que apunta a otros docs).
- **Cuando va a escribir tests**: lee `docs/testing-standards.md`.
- **Cuando toca infraestructura**: lee `docs/architecture-rules.md`.
- **Antes de commit**: pre-commit hooks le devuelven errores de tooling para que corrija.

Esto es el patrón **AGENTS.md jerárquico** de AI Hero (ver sección 3.2). Mantiene la "Zona Inteligente" del agente sin saturar contexto.

### 15.5 Integración con el workflow existente

| Paso del workflow | Cómo interactúa con la capa de reglas |
|---|---|
| 1. `/constitution` | **Crea** Nivel 1 (constitution.md). |
| 3. `/domain-model` | Alimenta Nivel 2 (AGENTS.md) con vocabulario y estructura por bounded context. |
| 7. `/to-issues` | Cada issue marca `architecture-impact: [bounded-context-1, bounded-context-2]` para que el agente sepa qué reglas aplican. |
| 9. `/tdd` | Lee Nivel 2 al planificar; Nivel 3 le devuelve feedback automático en cada save. |
| 10. `/run-acceptance` | Verifica Nivel 1 (coverage por capa, deps prohibidas) además de los `.feature`. |
| 11. `/code-review` | Audita Nivel 1 manualmente; Nivel 3 ya pasó en local. |
| 12. `/traceability-matrix` | Reporta violaciones de Nivel 1 como hallazgos auditables. |

### 15.6 Tooling concreto recomendado por stack

**TypeScript / Node:**
- Linter: `eslint` + `@typescript-eslint` + `eslint-plugin-boundaries` (enforce capas hexagonales).
- Formatter: `prettier`.
- Coverage: `c8` o `vitest --coverage` con thresholds en `vitest.config.ts`.
- Complejidad: `eslint-plugin-sonarjs`.
- Arquitectura: `dependency-cruiser` o `madge` para validar grafo de dependencias.

**Python:**
- Linter: `ruff` (reemplaza flake8 + isort + más).
- Formatter: `black` o `ruff format`.
- Coverage: `pytest-cov` con thresholds en `pyproject.toml`.
- Complejidad: `ruff` con `C901` activado.
- Arquitectura: `import-linter` para validar capas.

**Transversal:**
- Pre-commit: `pre-commit` framework (Python, pero funciona para JS también).
- Secret scanning: `gitleaks` o `trufflehog`.
- Deps con CVE: `npm audit` / `pip-audit` / `safety`.
- Commits: `commitlint` + `husky`.

### 15.7 Veredicto

Esta capa **no añade pasos al workflow**, pero es la diferencia entre "el agente generó código que funciona" y "el agente generó código que pertenece al proyecto". Sin ella, Ralph rompe la arquitectura sistemáticamente y el Day Shift se consume en rejecciones evitables.

**Para Simetrik (TS + Python + enterprise)**: definir Nivel 1 una sola vez en `constitution.md` (1-2 sesiones de equipo), generar Nivel 2 desde `/domain-model`, configurar Nivel 3 con tooling estándar, activar Nivel 4 con `git-guardrails` + `pre-commit`. **Setup inicial ~2-3 días**; ROI desde el primer ciclo Ralph.

### 15.8 Base del Nivel 2: adopción del `AGENTS.md` de Belong A2A

Existe ya una implementación de alta calidad del Nivel 2 en `/Users/equipo/Downloads/Belong2/docs/engineering/`: un `AGENTS.md` índice + 11 archivos topicales con **55 reglas numeradas (§1-§55)**. **Recomendación: adoptarlo como base del Harness Simetrik, no construir uno desde cero.**

#### 15.8.1 Calidad de la base

| Aspecto | Evaluación |
|---|---|
| Estructura jerárquica con divulgación progresiva | Mejor implementación práctica del patrón AI Hero vista hasta ahora |
| Numeración `§N` estable y citable en PR reviews | Patrón único que ningún framework de los 6 analizados implementa |
| Cobertura conceptual | Nivel 1 (filosofía + hexagonal) + Nivel 2 (estilo + domain + stack + async) completos |
| Patrones modernos | Result types con `code`, expand-then-contract migrations, tenancy enforcement, AbortSignal compuesto, bounded concurrency |
| Calidad de ejemplos | Cada regla incluye Good/Bad con código real del dominio |

#### 15.8.2 Estructura existente que se preserva íntegra

```
docs/engineering/
├── AGENTS.md                     # índice con "When to read" por archivo
├── 01-philosophy.md              # §1, §2, §30, §31, §35 — qué construir, qué omitir
├── 02-architecture.md            # §3, §37, §24, §14, §23 — hexagonal layer-first
├── 03-typescript-style.md        # §5-§10, §33 — no any/as/!, mutabilidad, operadores
├── 04-input-boundaries.md        # §4, §34 — Zod en perímetro + env vars
├── 05-domain-modeling.md         # §22, §32, §36, §11, §20, §21, §19 — Result+code
├── 06-commands-and-security.md   # §27, §12, §28, §13 — authZ en use case
├── 07-infrastructure.md          # §15-§18 — transacciones cortas + outbox + idempotencia
├── 08-testability.md             # §25, §26, §29 — clock+id injectables
├── 09-stack-conventions.md       # §38-§44 — Hono/Drizzle/Zod placement
├── 10-cross-cutting.md           # §45-§49 — tenantId, idempotency, pagination, versioning, migrations
└── 11-async-and-runtime.md       # §50-§55 — event loop, AbortSignal, p-limit, streaming
```

#### 15.8.3 Gaps detectados respecto al Harness completo

Cinco áreas que el `AGENTS.md` de Belong no cubre y que el Harness Simetrik necesita:

| # | Gap | Severidad | Razón |
|---|---|---|---|
| G1 | Solo cubre TypeScript | Alta | Stack Simetrik incluye Python/Backend; faltan gemelos para `mypy strict`, `Any`, `cast()`, `assert x is not None`, etc. |
| G2 | Sin reglas de BDD/Gherkin | Alta | El Harness depende de `.feature` files como gate AFK (sección 13); faltan reglas sobre cómo se escriben, dónde viven, quién los modifica |
| G3 | Sin reglas de Ralph/AFK | Alta | Faltan reglas operativas: cuándo `require-human-review`, cómo se marca `ralph-ready`, qué hace el agente si excede `max-iterations` |
| G4 | Sin caracterización brownfield | Media | No hay regla "antes de tocar legacy sin tests, escribe tests de caracterización" (sección 16 del Harness) |
| G5 | Sin observabilidad/security/SLOs formales | Media | Faltan: logging estructurado canónico, secret scanning, CVE de deps, métricas/SLOs como gate adicional |

#### 15.8.4 Plan de adopción y ampliación

**Fase A — Portabilidad inmediata (1-2 días):**

1. Copiar la estructura completa al repo del Harness Simetrik.
2. Renombrar contexto en `AGENTS.md` y los 11 archivos: "Belong A2A Marketplace" → "Simetrik".
3. Ajustar el vocabulario del PRD (§22) al dominio Simetrik (pagos, conciliación, etc.) sin tocar los §N de las reglas.
4. Mantener todos los §1-§55 con numeración estable.

**Fase B — Gemelos Python (3-5 días):**

Para cada regla TS que aplique, crear su equivalente Python. La numeración se preserva con sufijo `-py`:

| Regla TS | Gemelo Python |
|---|---|
| §5 No `any` | §5-py No `Any` — usar `object` + narrowing, o `Protocol` |
| §6 No `as` casts | §6-py No `cast()` ni `# type: ignore` salvo en boundary documentado |
| §7 No `!` non-null | §7-py No `assert x is not None` para lógica — usar `Optional` + early return |
| §15 `Promise.all` intencional | §15-py `asyncio.gather` intencional; usar `async for` para transacciones |
| §52 AbortSignal + timeout | §52-py `asyncio.timeout()` + `CancelledError` en cada I/O |
| §53 Bounded concurrency con `p-limit` | §53-py Bounded concurrency con `asyncio.Semaphore` |
| §3 Hexagonal layer-first | §3 aplica idénticamente; carpetas `domain/`, `application/`, `infrastructure/`, `entrypoints/` |
| §11 Integers para money/percent | §11 aplica idénticamente; usar `int` no `Decimal` para `priceCents` |
| §19 Result types con `code` | §19-py `dataclass` con `Literal["code"]` o `Result[T, E]` tipo Rust |

**Tooling Python equivalente:**

- Linter: `ruff` con `--select ALL --ignore ...` configurado.
- Type checking: `mypy --strict` o `pyright strict`.
- Formatter: `ruff format` (reemplaza black).
- Arquitectura: `import-linter` con contratos por capa.
- Async: `pytest-asyncio` + `anyio` para tests.
- HTTP: `httpx` con `timeout` y `event_hooks` para AbortSignal equivalente.
- Persistencia: `sqlalchemy 2.x async` o `asyncpg`.

**Fase C — Archivos nuevos para los gaps G2-G5 (1 semana):**

Cinco archivos nuevos que extienden la numeración:

```
docs/engineering/
├── 12-bdd-and-acceptance.md      # §56-§62 — BDD outside-in (gap G2)
├── 13-ralph-and-afk.md           # §63-§70 — operación Night Shift (gap G3)
├── 14-brownfield.md              # §71-§76 — código legacy (gap G4)
├── 15-observability.md           # §77-§83 — logging, métricas, SLOs (gap G5)
└── 16-security-supply-chain.md   # §84-§90 — secrets, CVE, SAST (gap G5)
```

**Contenido propuesto de cada archivo nuevo:**

*12-bdd-and-acceptance.md*
- §56 `.feature` files viven en `features/` por bounded context, no en `tests/`.
- §57 Escenarios redactados en lenguaje ubicuo de `CONTEXT.md` (no jerga técnica).
- §58 Aprobación humana antes de commit; el agente solo lee feature files una vez aprobados.
- §59 Cada escenario tiene un ID estable `scn-NNN` referenciable desde issues.
- §60 Escenarios marcados `@release` son gate de merge; `@smoke` son gate de pre-push.
- §61 Step definitions viven en `application/` (no en `infrastructure/`), reutilizables entre Cucumber y tests unitarios.
- §62 Living documentation: feature files versionados son evidencia auditable.

*13-ralph-and-afk.md*
- §63 Issues con `ralph-ready` deben tener al menos un `scn-NNN` asociado (sin gate BDD, no AFK).
- §64 `require-human-review` obligatorio para issues que tocan dominios sensibles (auth, pagos, datos personales).
- §65 `max-iterations` por defecto 30; reducir a 10-15 para issues brownfield.
- §66 Si excede `max-iterations`, aplicar label `ralph-blocked` con explicación, **nunca** force-push.
- §67 PRs generados AFK siempre `draft`; el merge lo hace humano en Day Shift.
- §68 Ralph respeta `git-guardrails`: bloquea `push`, `reset --hard`, `clean`, `branch -D`.
- §69 Cada sesión Ralph escribe log estructurado en `.planning/ralph-sessions/issue-NNN-*.log`.
- §70 Si la API de Anthropic devuelve 429 (rate limit), reintentar con backoff exponencial, no en paralelo.

*14-brownfield.md*
- §71 Antes de modificar código legacy sin tests, ejecutar `/characterization-tests`.
- §72 Tests de caracterización **NO arreglan bugs** — documentan el comportamiento actual exactamente.
- §73 `/impact-analysis` obligatorio cuando el cambio toca >3 archivos o cruza bounded contexts.
- §74 Strangler pattern para reemplazos: build new alongside old, route incrementally, kill old.
- §75 Branches brownfield con prefix `agent/legacy/<issue-NNN>` para distinguir en review.
- §76 No refactorizar y cambiar funcionalidad en el mismo PR; separar siempre.

*15-observability.md*
- §77 Log estructurado JSON con campos canónicos: `timestamp`, `level`, `requestId`, `tenantId`, `userId`, `event`, `details`.
- §78 Eventos del log usan `dot.notation` (ej: `quote.accepted`, `payment.failed`), nunca strings libres.
- §79 Nunca loggear PII en `details`; usar IDs y referencias.
- §80 Cada use case emite al menos un evento estructurado al cierre (ok o error).
- §81 SLOs declarados en `docs/slos.md`: latencia p95, error rate, disponibilidad por endpoint público.
- §82 Métricas via OpenTelemetry; el adapter `MetricsPort` aísla el vendor.
- §83 Ralph aborta si las métricas de un PR degradan SLO declarado (gate adicional al BDD).

*16-security-supply-chain.md*
- §84 Secret scanning con `gitleaks` o `trufflehog` en pre-commit hook.
- §85 `npm audit` / `pip-audit` en CI; bloquear merge si hay CVE críticas sin justificación.
- §86 SAST con `semgrep` (rulesets OWASP) en CI para PRs que tocan auth, crypto o I/O externo.
- §87 Threat modeling obligatorio para features que cruzan trust boundary (nuevo endpoint público, nueva integración externa).
- §88 Rotación de secretos automatizada vía vault (Doppler, AWS Secrets Manager, Vault).
- §89 SBOM (Software Bill of Materials) generado en cada release.
- §90 Pen-test review trimestral para componentes en frontera (handled fuera del Harness, documentado aquí).

#### 15.8.5 Integración con el workflow del Harness

Cada paso del workflow (sección 13.6) referencia explícitamente los §N que aplica:

| Paso workflow | §N que aplica |
|---|---|
| `/constitution` | Base: §1, §2 (filosofía); §3 (arquitectura); §22 (vocabulario PRD) |
| `/domain-model` | §22, §32, §36 (naming y closed values) |
| `/specify` | §1 (validated business needs); §22 (PRD vocabulary) |
| `/to-scenarios` | §56-§62 (BDD nuevos) |
| `/to-issues` | §30, §31 (vertical slices, omit before mocking); §63 (ralph-ready) |
| `/tdd` | §25, §26, §29 (testability); §19 (Result types) |
| `/run-acceptance` | §57-§60 (gate BDD) + §83 (SLO gate) |
| `/code-review` | Audit completo de §1-§90 con énfasis en §35 (PR boring to review) |
| `/security-hardening` | §27, §28 + §84-§90 |
| `/traceability-matrix` | Reporta violaciones §N como hallazgos auditables |
| Ralph local | §63-§70 obligatorios |

#### 15.8.6 Beneficios concretos de adoptar Belong como base

1. **Ahorro de 2-3 semanas de redacción** — el corpus base ya existe y está validado.
2. **Numeración `§N` ya estable** — referencias inmediatas en PRs nuevos del agente.
3. **Calidad ingenieril probada** — los patrones (Result types, hexagonal, outbox) son state-of-the-art 2026.
4. **Documentación con divulgación progresiva** — el agente no quema tokens leyendo reglas irrelevantes.
5. **Foundation para los gaps** — añadir §56+ sobre una base sólida es más rápido que escribir todo.

#### 15.8.7 Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Belong está orientado a marketplace A2A; vocabulario distinto a Simetrik | Cambiar §22 al PRD Simetrik; el resto de reglas son neutrales al dominio |
| Belong asume Hono/Drizzle/Zod; Simetrik puede usar otros frameworks | §38-§44 son específicas del stack; documentar gemelos para el stack de Simetrik si difiere |
| Mantenimiento sincronizado si Belong evoluciona | No es necesario — al adoptar, el `AGENTS.md` de Simetrik se vuelve fork independiente |
| Curva de aprendizaje del equipo | Cada `*.md` se lee en 5-10 min; documentación es referenciada solo cuando aplica (divulgación progresiva) |
| 55 reglas pueden sentirse abrumadoras | El `AGENTS.md` índice + "When to read" por archivo lo resuelve estructuralmente |

#### 15.8.8 Veredicto

**Adoptar `AGENTS.md` de Belong como base del Nivel 2 del Harness Simetrik, ampliándolo en lugar de empezar desde cero.** Es la mejor implementación práctica del patrón AI Hero disponible, ya cubre los Niveles 1 y 2 completos, y solo requiere añadir 5 archivos (G2-G5) + gemelos Python para alinearse al 100% con el Harness diseñado.

**ROI esperado**: 2-3 semanas de redacción ahorradas, calidad inmediata, y un Nivel 2 que el equipo puede empezar a citar en PRs desde el día 1.

#### 15.8.9 Estructura final del framework Stormhelm

El conjunto de reglas está organizado en **dos niveles**: `core/` para reglas neutras al stack y `capabilities/<stack>/` para reglas específicas de un stack. El `/setup` selecciona las capabilities activas por proyecto y genera un `AGENTS.md` personalizado.

```
docs/engineering/
├── AGENTS.md                                       # índice maestro (template)
├── core/                                           # neutro al stack — siempre activo
│   ├── 01-philosophy.md                            # §1, §2, §30, §31, §35
│   ├── 02-architecture.md                          # §3, §37, §24, §14, §23
│   ├── 04-input-boundaries.md                      # §4, §34
│   ├── 05-domain-modeling.md                       # §11, §19-§22, §32, §36
│   ├── 06-commands-and-security.md                 # §12-§13, §27-§28
│   ├── 07-infrastructure.md                        # §15-§18
│   ├── 08-testability.md                           # §25-§26, §29
│   ├── 10-cross-cutting.md                         # §45-§49
│   ├── 12-bdd-and-acceptance.md                    # §56-§62
│   ├── 13-ralph-and-afk.md                         # §63-§70
│   ├── 14-brownfield.md                            # §71-§76
│   ├── 15-observability.md                         # §77-§83
│   └── 16-security-supply-chain.md                 # §84-§90
└── capabilities/                                   # opt-in por proyecto
    ├── typescript/                                 # TS baseline (cualquier framework TS)
    │   ├── 03-style.md                             # §5-§10, §33
    │   └── 11-async.md                             # §50-§55
    └── typescript-hono/                            # TS + Hono/Drizzle/Zod stack
        └── 09-stack-conventions.md                 # §38-§44
```

#### 15.8.10 Archivos entregables del framework

Todos los archivos están redactados, neutralizados (sin referencias a marketplaces específicos) y siguen el patrón de divulgación progresiva (Scope + When to read + Rules + ejemplos Good/Bad).

**Documento raíz:**

| Archivo | Propósito |
|---|---|
| [`README.md`](README.md) | Manifiesto del framework Stormhelm: qué es, qué resuelve, workflow, estructura, capabilities roadmap, créditos |

**Índice y reglas:**

| Archivo | Reglas | Capa |
|---|---|---|
| [`docs/engineering/AGENTS.md`](docs/engineering/AGENTS.md) | índice §1-§90 | Template (personalizado por `/setup`) |
| [`docs/engineering/core/01-philosophy.md`](docs/engineering/core/01-philosophy.md) | §1, §2, §30, §31, §35 | Core |
| [`docs/engineering/core/02-architecture.md`](docs/engineering/core/02-architecture.md) | §3, §37, §24, §14, §23 | Core |
| [`docs/engineering/core/04-input-boundaries.md`](docs/engineering/core/04-input-boundaries.md) | §4, §34 | Core |
| [`docs/engineering/core/05-domain-modeling.md`](docs/engineering/core/05-domain-modeling.md) | §11, §19-§22, §32, §36 | Core |
| [`docs/engineering/core/06-commands-and-security.md`](docs/engineering/core/06-commands-and-security.md) | §12-§13, §27-§28 | Core |
| [`docs/engineering/core/07-infrastructure.md`](docs/engineering/core/07-infrastructure.md) | §15-§18 | Core |
| [`docs/engineering/core/08-testability.md`](docs/engineering/core/08-testability.md) | §25-§26, §29 | Core |
| [`docs/engineering/core/10-cross-cutting.md`](docs/engineering/core/10-cross-cutting.md) | §45-§49 | Core |
| [`docs/engineering/core/12-bdd-and-acceptance.md`](docs/engineering/core/12-bdd-and-acceptance.md) | §56-§62 | Core |
| [`docs/engineering/core/13-ralph-and-afk.md`](docs/engineering/core/13-ralph-and-afk.md) | §63-§70 | Core |
| [`docs/engineering/core/14-brownfield.md`](docs/engineering/core/14-brownfield.md) | §71-§76 | Core |
| [`docs/engineering/core/15-observability.md`](docs/engineering/core/15-observability.md) | §77-§83 | Core |
| [`docs/engineering/core/16-security-supply-chain.md`](docs/engineering/core/16-security-supply-chain.md) | §84-§90 | Core |
| [`docs/engineering/capabilities/typescript/03-style.md`](docs/engineering/capabilities/typescript/03-style.md) | §5-§10, §33 | Capability TS |
| [`docs/engineering/capabilities/typescript/11-async.md`](docs/engineering/capabilities/typescript/11-async.md) | §50-§55 | Capability TS |
| [`docs/engineering/capabilities/typescript-hono/09-stack-conventions.md`](docs/engineering/capabilities/typescript-hono/09-stack-conventions.md) | §38-§44 | Capability TS+Hono |

**Skills:**

| Skill | Propósito |
|---|---|
| [`skills/setup/SKILL.md`](skills/setup/SKILL.md) | Wizard interactivo que personaliza Stormhelm por proyecto: pregunta stack, framework, persistencia, deployment, Ralph, compliance; genera AGENTS.md, templates, hooks |
| [`skills/onboard/SKILL.md`](skills/onboard/SKILL.md) | Orientación para developers: modo full tour (primera vez), modo proyecto nuevo (conoce Stormhelm), modo cheat sheet (refresher) |

**Skills documentadas en el flujo (pendientes de implementar como SKILL.md):**

`/constitution`, `/grill-me`, `/domain-model`, `/specify`, `/clarify`, `/to-scenarios`, `/to-issues`, `/plan`, `/tdd`, `/run-acceptance`, `/code-review`, `/security-hardening`, `/traceability-matrix`, `/handoff`, `/grill-with-docs`, `/characterization-tests`, `/impact-analysis`, `/strangler-plan`, `/diagnose`, `/triage`, `/prototype`, `/improve-codebase-architecture`.

#### 15.8.11 Patrón seguido en cada archivo de reglas

- **Header**: `Scope` (qué cubre el archivo) + `When to read` (cuándo cargarlo, divulgación progresiva).
- `Rules in this file` listadas al inicio para skim rápido.
- Cross-references a `AGENTS.md` y archivos relacionados.
- Cada regla con: numeración estable `§N`, título corto, párrafo de justificación, ejemplos `Good`/`Bad` con código real, sección `Why`, reglas de enforcement cuando aplica.

#### 15.8.12 Numeración global y extensibilidad

**§1 – §90** en las capabilities shipped (core + typescript + typescript-hono). Cuando se añadan capabilities nuevas (Python, Go, etc.):

- Los `§N` existentes **no se renumeran nunca**.
- Twins de TS para Python llevan sufijo `-py` (`§5-py`, `§52-py`).
- Reglas nuevas específicas a un stack toman los próximos números disponibles.
- El `AGENTS.md` personalizado por `/setup` lista solo los `§N` activos para el proyecto.

#### 15.8.13 Próximos pasos sugeridos

1. Clonar Stormhelm al repositorio del proyecto piloto.
2. Ejecutar `/setup` y responder el wizard.
3. Ejecutar `/onboard` para que el equipo aprenda el workflow.
4. Editar `docs/CONTEXT.md` con la terminología del dominio real.
5. Ejecutar `/constitution` para formalizar principios del proyecto.
6. Primer ciclo: `/grill-me` → `/to-scenarios` → `/to-issues` → `/tdd` en un slice pequeño.
7. Cuando el equipo esté cómodo: activar Ralph con un issue marcado `ralph-ready`.
8. Iterar: medir velocidad y calidad en `.planning/metrics.csv`, ajustar.

---

## 16. Flujo brownfield: trabajo sobre código legacy

### 16.1 El gap detectado

El workflow de 12 pasos diseñado en la sección 13.6 asume **greenfield**: empezás con una spec vacía, generás scenarios, descomponés en issues, implementás. Pero la realidad de Simetrik es que **el ~80% del trabajo es brownfield**: tocar código que ya existe, modificarlo sin romper, migrar gradualmente.

Sin un flujo brownfield explícito, lo que pasa es:
- El agente desconoce las convenciones implícitas del código actual y reescribe.
- Los `.feature` no capturan el comportamiento existente (no documentado).
- Ralph rompe regressions porque no hay tests de caracterización.
- El `/code-review` rechaza por "no respeta el estilo del módulo" sin que esto esté escrito.

### 16.2 Diferencias clave vs el flujo greenfield

| Dimensión | Greenfield (flujo base) | Brownfield (este flujo) |
|---|---|---|
| Punto de partida | Spec vacía | Código existente que define el comportamiento de facto |
| Source of truth | `specs/<feature>.md` | El código mismo + lo que se observa en producción |
| Tests | Se escriben primero (TDD red-green) | Primero **tests de caracterización** (capturan comportamiento actual), luego refactor |
| Riesgo principal | Construir lo equivocado | Romper lo que ya funciona |
| Velocidad esperada | Alta (Ralph paraleliza bien) | Baja (cada cambio requiere análisis de impacto) |

### 16.3 Skills relevantes que ya tenemos

Algunos skills del Harness aplican directamente al brownfield; no hay que inventarlos:

| Skill | Origen | Función en brownfield |
|---|---|---|
| `/grill-with-docs` | AI Hero | Interroga el código y docs existentes, no solo al humano. Punto de entrada brownfield. |
| `/domain-model` | AI Hero | Refina `CONTEXT.md` con la terminología real del código actual, no la "ideal". |
| `/improve-codebase-architecture` | AI Hero | Identifica "deepening opportunities" — refactor hacia módulos más profundos. |
| `/diagnose` | AI Hero | Loop disciplinado de debugging para entender por qué algo se comporta así. |
| `/prototype` | AI Hero | Construye apps de terminal desechables para validar comportamiento existente. |

### 16.4 Ubicación en el workflow: sub-flujo previo al main

El flujo brownfield **no reemplaza** el flujo de 12 pasos. Lo **antecede**. Se inserta entre los pasos 2 (`/grill-me`) y 4 (`/specify`):

```
Workflow greenfield (12 pasos):
  /constitution → /grill-me → /domain-model → /specify → ... → /traceability-matrix

Workflow brownfield (16 pasos):
  /constitution → /grill-me → [SUB-FLUJO BROWNFIELD] → /specify → ... → /traceability-matrix
                                      ▲
                                      │
                          5 pasos extra antes de la spec
```

Los 5 pasos extra del sub-flujo brownfield:

| # | Paso | Origen | Propósito |
|---|---|---|---|
| B1 | `/grill-with-docs` | AI Hero | Interrogar código actual + docs antes que al humano. Captura comportamiento implícito. |
| B2 | **Tests de caracterización** | nuevo skill `/characterization-tests` | Escribir tests que documenten el comportamiento **actual** (no el deseado). Red mínima de seguridad antes de tocar nada. |
| B3 | `/domain-model` | AI Hero | Refinar `CONTEXT.md` con la terminología real (no la aspiracional). Detectar deuda lingüística. |
| B4 | **Análisis de impacto** | nuevo skill `/impact-analysis` | Mapear qué módulos toca el cambio propuesto, qué tests existentes pueden romperse, qué consumers externos hay. |
| B5 | **Decisión: strangler vs in-place** | manual (humano) | ¿Reemplazás gradualmente (strangler pattern) o modificás en sitio? Decisión arquitectónica que el humano toma. |

Después del paso B5, **el flujo continúa con `/specify` normalmente** — pero la spec ya tiene el contexto del código actual y la decisión de migración.

### 16.5 Tres skills nuevos a añadir

**Skill B2 — `/characterization-tests`**
- Input: módulo o función legacy.
- Output: suite de tests que pasan con el comportamiento actual, incluso si es buggy.
- Regla clave: **NO arreglar bugs durante caracterización**. Los tests documentan lo que hay, no lo que debería ser.
- Útil cuando: el código no tiene tests o son obsoletos.

**Skill B4 — `/impact-analysis`**
- Input: spec del cambio + codebase actual.
- Output: reporte estructurado con módulos afectados, tests existentes en riesgo, consumers externos (APIs, eventos), dependencias inversas.
- Herramientas auxiliares: `dependency-cruiser` (TS), `import-linter` (Python), `git log` para detectar quién tocó el código recientemente.

**Skill B5 — `/strangler-plan`** *(opcional, solo si la decisión es strangler)*
- Input: módulo legacy a reemplazar.
- Output: plan de migración por fases con feature flags, ruteo gradual, validación side-by-side, deprecación final.
- Patrón: build the new alongside the old, route incrementally, kill the old.

### 16.6 Ralph en brownfield: más cuidadoso

Ralph en código legacy es **más peligroso** que en greenfield porque puede romper consumers no documentados. Reglas extra:

- **Issues brownfield siempre requieren `require-human-review: true`** — no auto-merge.
- **`max-iterations` reducido** (10-15 en vez de 30) — si el agente itera mucho, probablemente está perdido en el contexto legacy.
- **Caracterización es pre-requisito**: sin tests de caracterización, Ralph rechaza el issue automáticamente (skill `/run-acceptance` lo verifica).
- **Branches con prefix `agent/legacy/`** para distinguir en revisión.

### 16.7 Cuándo aplicar el sub-flujo brownfield

| Situación | Sub-flujo brownfield |
|---|---|
| Feature nueva, módulo nuevo | **No.** Flujo greenfield base (12 pasos). |
| Feature nueva, módulo existente con buena cobertura de tests | **Parcial.** Solo `/impact-analysis` (paso B4). |
| Feature nueva, módulo existente sin tests | **Completo.** Los 5 pasos B1-B5. |
| Bug fix en código legacy sin tests | **Completo + obligatorio**. La caracterización captura el bug antes de arreglarlo. |
| Refactor sin cambio de comportamiento | **Solo B1, B2, B3.** Caracterización es la red de seguridad; no hay `/specify` porque no hay cambio funcional. |
| Migración tecnológica (ej: Express → Fastify) | **Completo + strangler**. Sub-flujo entero incluyendo B5. |

### 16.8 Veredicto

El flujo brownfield **no reemplaza el workflow base**, lo **extiende** con 5 pasos previos cuando se aplica. La diferencia es la **disciplina de no tocar código sin caracterizarlo primero**, y la conciencia explícita del riesgo de regresión.

**Para Simetrik**: probablemente el 80% de issues van a ser brownfield. **Implementar `/characterization-tests` y `/impact-analysis` es prioridad alta** — `/strangler-plan` puede esperar hasta tener la primera migración real.

---

## 17. Bug handling: adopción dirigida + gaps reales

### 17.1 El gap detectado

Hasta este punto, todo el workflow de Stormhelm estaba sesgado hacia **features nuevas** (greenfield). Aunque `core/14-brownfield.md` cubría modificaciones a código legacy y `core/13-ralph-and-afk.md` mencionaba un skill `/diagnose` de pasada, **no había un ciclo de vida completo para bug fixing**: reproducción → análisis → diagnóstico → fix → regression test → postmortem.

Antes de inventar la solución, decisión correcta: **auditar qué tenían los 6 frameworks**.

### 17.2 Auditoría: bug handling en los 6 frameworks

Tabla de cobertura por 7 dimensiones del bug-handling:

| Dim | AI Hero | GSD | Superpowers | BMAD | Spec-Kit | agent-skills |
|---|---|---|---|---|---|---|
| A. Workflow bug específico | Sí (triage/diagnose/tdd) | No | Sí (systematic-debugging) | Parcial (Quick Flow) | No | **Sí (6 pasos)** |
| B. Reproducción mandatoria | Sí | No | Sí (Phase 1 obligatoria) | No | No | Sí (Step 1) |
| C. Root cause analysis estricto | Sí | No | **Sí (más estricto)** | No | No | Sí (Step 4) |
| D. Análisis de código bug-specific | Sí | Genérico | Sí (boundary logging) | Parcial | No | Sí (layered search) |
| E. Regression test fails-first | Sí | No | **Sí (verification-before-completion)** | No | No | Sí (Step 5 Guard) |
| F. Postmortem estructurado | No | No | No | No | No | **No (gap universal)** |
| G. Bisect / log integration | Bisect | No | No | No | No | Bisect |

**Hallazgo clave**: Spec-Kit oficialmente admite el gap — issue #442 abierto pidiendo `/diagnose` + `/fix` + `/iterate` con sus propios maintainers reconociendo que el framework es solo features.

### 17.3 Decisión de diseño: no sobrecomplejizar

La tentación inicial fue crear 6 skills nuevos (`/reproduce`, `/analyze-code`, `/diagnose`, `/regression-test`, `/postmortem`, `/severity-triage`, `/find-similar-patterns`). Eso habría inflado el framework sin justificación.

**Decisión correcta**: adoptar lo que ya existe + crear solo lo que verdaderamente falta. Resultado:

- **1 skill nuevo** (`/debug`) que combina lo mejor de 3 frameworks.
- **1 archivo de reglas** (`core/17-bug-handling.md`) con §91-§96 + matriz P0/P1/P2.
- **1 template** (`docs/postmortems/TEMPLATE.md`) referenciado por §95.

### 17.4 Composición del skill `/debug`

El skill `/debug` no es invención de Stormhelm — es **composición inteligente con atribución honesta**:

| Componente | Origen | Modificación |
|---|---|---|
| **Estructura de 6 pasos** | `debugging-and-error-recovery` (addyosmani) | Adoptada tal cual |
| **Step 1 — Reproduce (mandatorio)** | Phase 1 de `systematic-debugging` (Superpowers) + Step 1 (addyosmani) | Combinado: sub-árbol de investigación por tipo de bug |
| **Step 2 — Localize por capa** | Step 2 (addyosmani) | Adoptado |
| **Step 2b — Scan similar patterns** | Extensión propia | Único añadido original |
| **Step 4 — Fix root cause (regla estricta)** | `systematic-debugging` (Superpowers) | Preserva el wording: *"Symptom fixes are failure"* |
| **Step 5 — Guard fails-first** | `verification-before-completion` (Superpowers) | Adopta el ciclo Write→Pass→Revert→Fail→Restore→Pass exacto |
| **Bisect harness** | `diagnose` (Pocock) + Step Bisect (addyosmani) | Combinado: script reproducible + bisect run automatizado |

### 17.5 Las 6 nuevas reglas §91-§96

| # | Regla | Origen |
|---|---|---|
| **§91** | Reproduce before diagnose | Superpowers + addyosmani |
| **§92** | Regression test fails-first | Superpowers (`verification-before-completion`) |
| **§93** | Root cause over symptom; symptom fixes are failure | Superpowers (`systematic-debugging`) |
| **§94** | One bug, one PR (extensión de §76) | Composición |
| **§95** | Postmortem mandatory for P0 and user-facing P1 bugs | **Gap real** — ningún framework lo tenía |
| **§96** | Bisect when introduction is unclear | addyosmani + Pocock |

### 17.6 Matriz de severity (única en el ecosistema)

Ningún framework de los 6 distinguía P0/P1/P2 con SLAs explícitas. Stormhelm añade esto como tabla en `core/17-bug-handling.md`:

| Severity | Definición | Workflow | Postmortem |
|---|---|---|---|
| **P0** | Incidente producción: data loss, security breach, outage | Hotfix flow + reproducción en paralelo si necesario | Obligatorio en 5 días hábiles |
| **P1** | Bug afectando usuarios en producción, no catastrófico | Workflow `/debug` completo (6 pasos) | Obligatorio en 10 días hábiles si user-facing |
| **P2** | Bug interno o cosmético | `/debug` sin fast track | Opcional |

Los issues llevan label nativo GitHub: `severity:p0`, `severity:p1`, `severity:p2`.

### 17.7 Template de postmortem

`docs/postmortems/TEMPLATE.md` incluye:

- **Metadata** (fechas, severidad, duración, autores, reviewers).
- **Summary** (un párrafo legible para no-técnicos).
- **Impact** cuantificado (usuarios, requests, integridad, financiero, compliance).
- **Timeline** evento por evento desde primer síntoma hasta all-clear.
- **Root cause** mecánico (refiere a §93).
- **Contributing factors** (código + proceso + tooling + observabilidad + training).
- **Detection** (cómo, tiempo a detección, alertas que no dispararon).
- **Response** (composición, coordinación, escalamientos).
- **Recovery** (mitigación, fix, cleanup, comunicación).
- **What went well / What went badly** (mínimo 3 cada uno).
- **Lessons learned** (insights a nivel de patrón, no solo bug).
- **Action items** (concretos, asignados, con fecha, como issues separados).
- **Related artifacts** (regression test, bisect log, PRs).
- **Signoff** (autores + reviewer externo + retention de 7 años).
- **Blameless principle** explícito al inicio y al final del documento.

### 17.8 Entregables

Tres archivos nuevos en el framework:

| Archivo | Contenido |
|---|---|
| [`docs/engineering/core/17-bug-handling.md`](docs/engineering/core/17-bug-handling.md) | §91-§96 + matriz P0/P1/P2 + atribuciones honestas |
| [`skills/debug/SKILL.md`](skills/debug/SKILL.md) | Skill único `/debug` con 6 pasos + bisect harness |
| [`docs/postmortems/TEMPLATE.md`](docs/postmortems/TEMPLATE.md) | Template estructurado de postmortem con blameless principle |

### 17.9 Veredicto

La adición de bug handling a Stormhelm **no añadió 6 skills**. Añadió **1 skill, 6 reglas, 1 template**. La filosofía del framework — *composición inteligente sobre proliferación de skills* — se preservó.

Esta sección también establece un precedente claro para extensiones futuras: **antes de inventar, auditar lo que ya existe; adoptar lo bueno con atribución honesta; crear solo lo que verdaderamente falta**.

---

## 18. Improvements: 5 categorías, 1 skill, 0 sobreingeniería

### 18.1 El gap detectado

Después de cubrir features (sec. 13), bugs (sec. 17) y brownfield (sec. 16), quedaba un vacío: **mejoras que no son features nuevas ni bugs**. Esta categoría se desagrega en al menos 5 tipos distintos, cada uno con cadencia y validación diferente:

- A. Refactor sin behavior change
- B. Performance optimization
- C. Tech debt reduction
- D. Security hardening proactivo
- E. Dependency upgrades

### 18.2 Auditoría: improvements en los 6 frameworks

Antes de proponer nada, audité los 6 frameworks específicamente sobre estas 5 categorías:

| Framework | A. Refactor | B. Performance | C. Tech debt | D. Security proactivo | E. Dep upgrades |
|---|---|---|---|---|---|
| AI Hero | Medio (`improve-codebase-architecture`) | Ausente | Medio | Ausente | Ausente |
| GSD | Bajo | Ausente | **Alto** (`audit-milestone` + `chore.yml`) | **Alto** (`secure-phase` + STRIDE) | Bajo |
| Superpowers | Bajo (solo R en TDD) | Ausente | Ausente | Ausente | Ausente |
| BMAD | Bajo | Ausente | Bajo | Ausente | Bajo |
| Spec-Kit | Filosófico | Filosófico | Filosófico | Filosófico | N/A |
| **agent-skills** | **Alto** (`code-simplification`) | **Alto** (`performance-optimization`) | Medio | Medio-Alto | Bajo |

**Hallazgo clave**: **addyosmani es la base sólida** (4 de 5 categorías cubiertas con sustancia), **GSD aporta el rigor en tech debt y security**, y **dependency upgrades es gap universal** — ningún framework lo trata seriamente.

### 18.3 Decisión de diseño: aún más minimalista que en bugs

Para bug handling diseñé 1 skill + 1 archivo + 1 template. Para improvements, la decisión correcta es **más minimalista todavía**: **1 archivo de reglas + 1 skill + 0 templates**.

**Por qué solo `/optimize` como skill:**

- **Performance optimization (B)** tiene un ciclo único — MEASURE → IDENTIFY → FIX → VERIFY → GUARD con baseline obligatorio — que no encaja en ningún otro workflow. Justifica skill propio.
- **Refactor (A)** ya tiene `/improve-codebase-architecture` de AI Hero referenciado. No necesita skill nuevo.
- **Tech debt (C)** son features con label `improvement:tech-debt` y rubric ICE. No necesita skill.
- **Security hardening (D)** se cubre con §87 (threat modeling) + §101 que extiende. No necesita skill.
- **Dependency upgrades (E)** se cubre con un **runbook embedded** en el archivo de reglas (§100A automated, §100B major). No necesita skill ejecutable — es operacional.

### 18.4 Las 6 nuevas reglas §97-§102

| # | Regla | Categoría | Origen |
|---|---|---|---|
| **§97** | Baseline before optimizing; no perf work without measurement | B | `performance-optimization` (addyosmani) |
| **§98** | One improvement, one PR (extensión de §94) | Todas | Composición de §76 + §94 |
| **§99** | Tech debt items are features with explicit ICE rubric | C | Composición de GSD `audit-milestone` + ICE (industria) |
| **§100** | Dependency upgrades: minor/patch automated, major requires impact analysis + runbook | E | Original (gap real) + Renovate/Dependabot patterns |
| **§101** | Security hardening proactivo requires STRIDE threat model before code | D | GSD `secure-phase` + addyosmani `security-and-hardening` |
| **§102** | Refactor without behavior change: existing tests must pass unmodified | A | `code-simplification` (addyosmani) |

### 18.5 Composición del skill `/optimize`

El skill `/optimize` no es invención de Stormhelm — es **composición inteligente con atribución honesta**:

| Componente | Origen |
|---|---|
| **5 pasos MEASURE → IDENTIFY → FIX → VERIFY → GUARD** | `performance-optimization` (addyosmani) |
| **Sub-árbol de investigación por tipo de bottleneck** (CPU / I/O / GC / serialization / concurrency / network) | addyosmani |
| **Bisect harness para regresiones recientes** | `diagnose` (Pocock), reutilizando lo de `/debug` |
| **Perf budget en CI** | industria, codificado por addyosmani `performance-checklist.md` |
| **Integración con SLO §83** | Original de Stormhelm (Ralph SLO gate) |

### 18.6 Runbook embebido para dependency upgrades

`core/18-improvements.md` incluye dos workflows en línea para §100:

**Workflow A — Minor/patch (automated):**
- Renovate o Dependabot diario.
- Auto-merge si CI verde + sin CVE + lockfile-only.
- Digest semanal de lo merged.
- Config sample de Renovate incluida en el archivo.

**Workflow B — Major (manual con rigor):**
- 10 pasos: impact analysis → upgrade guide → ADR → branch dedicada → codemods → manual edits → `/run-acceptance` full → benchmark §97 → staging soak 24h → rollback plan.

Esto reemplaza un skill `/dependency-upgrade` que iba a construirse. La diferencia: como skill ejecutable, hubiera sido difícil mantener al día con los cambios de Renovate/Dependabot. Como runbook documentado, evoluciona junto con las herramientas externas sin recompilar el framework.

### 18.7 Tabla de validation gates por tipo de improvement

| Improvement kind | Baseline? | Tests modificados? | Acceptance suite | Extra gate |
|---|---|---|---|---|
| Refactor (§102) | No | **No (prohibido)** | Full `@release` | Mutation testing para high-risk |
| Performance (§97) | **Sí — medido antes** | No (salvo añadir bench tests) | Full `@release` + `@smoke` | After-measurement debe ganar |
| Tech debt (§99) | No | Solo si existing tests estaban mal | Full `@release` | Linked to origin issue |
| Security hardening (§101) | No | Solo si añade security tests | Full `@release` + `@smoke` | STRIDE row updated |
| Dep upgrade — minor/patch (§100A) | No | No | `@smoke` | CI green + no new CVE |
| Dep upgrade — major (§100B) | **Sí (perf puede shift)** | Solo si API renamed | Full `@release` | ADR + 24h staging soak |

### 18.8 Entregables

Dos archivos nuevos en el framework:

| Archivo | Contenido |
|---|---|
| [`docs/engineering/core/18-improvements.md`](docs/engineering/core/18-improvements.md) | §97-§102 + 5-kinds matrix + runbooks embedded para tech debt y dep upgrades + atribuciones honestas |
| [`skills/optimize/SKILL.md`](skills/optimize/SKILL.md) | Skill único `/optimize` con 5 pasos + bisect harness reutilizado |

### 18.9 Veredicto

**1 archivo, 1 skill, 0 templates** — la implementación más minimalista posible que cumple con cubrir las 5 categorías sin proliferación. La filosofía de Stormhelm — *composición inteligente sobre proliferación de skills* — se preserva y se refuerza:

- Lo que ya existe en otros frameworks se adopta con atribución.
- Lo que falta y justifica skill propio: solo `/optimize` (1).
- Lo que falta pero NO justifica skill: dependency upgrades como runbook embebido.

Resumen acumulado del framework Stormhelm:

- **102 reglas** (§1-§102).
- **5 skills nuevos** propios (`/setup`, `/onboard`, `/debug`, `/optimize`) + integración con skills de otros frameworks por atribución (`/grill-me`, `/to-scenarios`, `/tdd`, `/improve-codebase-architecture`, etc.).
- **18 archivos de reglas** (`core/` + `capabilities/`).
- **2 templates** (`docs/postmortems/TEMPLATE.md`, `docs/engineering/AGENTS.md` como template).

Total: **27 archivos del framework**, todo neutro al proyecto, todo adoptable vía `/setup`.

---

## 19. Validación cruzada y absorción de patrones operacionales

### 19.1 Contexto

Más allá de los 6 frameworks open-source auditados, existe un harness predecesor de tipo SDLC end-to-end que cubrió un terreno distinto al de Stormhelm: orquestación monolítica con Agent Teams, integración con tooling enterprise, y visualización en tiempo real del estado del pipeline. Esa exploración previa fue de "fuerza bruta" intencional — buscaba demostrar viabilidad operacional rápido, no abstracción reusable.

La revisión de ese trabajo destapó **6 patrones operacionales únicos** que ninguno de los 6 frameworks auditados tenía y que valía la pena absorber a Stormhelm con adaptaciones para mantener neutralidad de stack.

### 19.2 Patrones absorbidos

Cuatro de los seis se integraron a Stormhelm en esta iteración. Los otros dos quedaron documentados como referencia.

| # | Patrón | Origen conceptual | Integración en Stormhelm |
|---|---|---|---|
| 1 | **Pipeline state + visualización** | Script Python + extensión VS Code | **No absorbido**. Es operacional, no filosófico. Queda como capability opcional futura para entornos donde el equipo lo quiera. |
| 2 | **Module contracts** (api/openapi/mocks/arch) | `contracts/{module}/` con 4 artefactos | **Absorbido como §103** en `core/12-bdd-and-acceptance.md`. Complementa los `.feature` files sin reemplazarlos. |
| 3 | **Visual acceptance gate** con responsive + dark mode + accessibility + console clean | Chrome QA workflow vía MCP | **Absorbido como §104** en `core/12-bdd-and-acceptance.md`. Gate adicional para features con UI. |
| 4 | **API contract fuzz testing** con Schemathesis | Schemathesis run post-Docker | **Absorbido como §105** en `core/12-bdd-and-acceptance.md`. Gate adicional para endpoints públicos. |
| 5 | **Stub detection mecánico** antes de QA | grep + build check | **Absorbido como §106** en `core/12-bdd-and-acceptance.md`. Bloqueo mecánico en CI; sin excepciones humanas salvo `// @stub` marker explícito. |
| 6 | **Agent Teams para paralelización vertical** | Lead en delegate mode + dependency graph + teammates con un solo responsabilidad | **Absorbido como §107** en `core/13-ralph-and-afk.md`. Variación avanzada del Eje 3 (sub-agentes intra-issue) que se activa con label `feature:multi-module`. |

Adicional: la idea de **comando monolítico end-to-end** se materializa como **skill `/feature` nuevo**. Encadena el workflow de 12 pasos con 2 checkpoints humanos (después de `/to-scenarios` y antes de merge). Es **composición de los skills existentes**, no duplicación.

### 19.3 Lo que no se absorbe

Patrones que dejamos fuera por filosofía o por acoplamiento al contexto del que vinieron:

- **Stack hardcoded** (Python+FastAPI+Next.js+shadcn+Docker+PostgreSQL): rompería la promesa de capabilities. Esos son ajustables vía `/setup` por proyecto.
- **Convenciones de branch + idioma + commit format**: muy específicas a una organización. Stormhelm queda neutral.
- **Integración JIRA/MCP Atlassian**: queda como capability futura opcional (`capabilities/jira/`) si hay demanda.
- **Logging conventions específicas** (format args, no extra, no print): son operacionales por proyecto, no de framework.

### 19.4 Numeración actualizada

Tras absorber los 5 patrones como reglas (§103-§107):

- **Numeración total**: §1 – §107 (5 reglas nuevas).
- **Archivos modificados**:
  - `core/12-bdd-and-acceptance.md` añade §103-§106.
  - `core/13-ralph-and-afk.md` añade §107.
- **Skill nuevo**: `/feature` (composición monolítica).
- **Total skills propios**: 5 (`/setup`, `/onboard`, `/debug`, `/optimize`, `/feature`).
- **Total archivos del framework**: 27 (eran 25).

### 19.5 Veredicto

La auditoría cruzada confirmó tres cosas:

1. **Stormhelm cubría conceptualmente más de lo que el predecesor cubría operacionalmente**: BDD outside-in, severity matrix, postmortems, dependency upgrades, reglas numeradas, traceability matrix, brownfield, improvements.
2. **El predecesor cubría operacionalmente cosas que Stormhelm aún no había llegado a articular**: module contracts, visual gate, fuzz testing, stub detection, Agent Teams, comando monolítico.
3. **La filosofía del framework permitió absorber lo bueno sin contaminarse con lo acoplado**: las 5 reglas y el skill nuevo respetan el principio de composición sobre proliferación. No se inventó nada que ya existiera mejor en otro lugar.

Total acumulado del framework Stormhelm tras esta iteración: **107 reglas + 5 skills propios + 18 archivos de reglas + 2 templates = 27 archivos**, todos neutros al proyecto, todos adoptables vía `/setup`.

---

## 20. Hooks y runtime guards: capa defensiva opt-in

### 20.1 Contexto

Hasta esta iteración, Stormhelm mencionaba hooks en reglas dispersas (§68 git-guardrails, §84 secret scanning) pero no tenía **archivo de reglas dedicado** ni **hooks ejecutables propios**. La auditoría de los 6 frameworks reveló que:

- **addyosmani** tiene 4 hooks de alta calidad con tests (`session-start.sh`, `sdd-cache-pre/post.sh`, `simplify-ignore.sh`).
- **GSD** tiene el set más grande (14 hooks profesionales), pero la mayoría acoplados a su stack `.planning/`.
- **Superpowers** tiene 1 hook cross-platform (session-start).
- **AI Hero, BMAD, Spec-Kit**: 0 o 1 hook trivial.

### 20.2 Decisión de diseño minimalista (consistente con bugs e improvements)

Aplicando el mismo principio que en iteraciones previas — **adoptar lo que existe, construir solo gaps reales** — el alcance final fue:

- **1 archivo de reglas** (`core/19-hooks-and-runtime-guards.md`) con **6 reglas §108-§113**.
- **2 hooks ejecutables propios** (3 archivos: pre + post del cache, + monitor): `webfetch-cache-pre.js`, `webfetch-cache-post.js`, `context-monitor.js`.
- **0 templates nuevos**.
- **Decisión consciente de NO implementar** prompt-injection-guard ni read-injection-scanner en esta iteración. Sus reglas (§110, §111) quedan **especificadas pero no implementadas**: adopción cuando el equipo lo justifique.

### 20.3 Las 6 reglas §108-§113

| # | Regla | Implementado? |
|---|---|---|
| §108 | WebFetch caching with HTTP revalidation (no blind TTL) | ✅ Sí (2 hooks) |
| §109 | SessionStart meta-skill injection — adopt only when skill count >15 | 📋 Especificado, deferido |
| §110 | Prompt injection guard on writes (advisory by default) | 📋 Especificado, no implementado |
| §111 | Read injection scanner | 📋 Especificado, no implementado |
| §112 | Agent-aware context monitor — notify the agent, not just the user | ✅ Sí (1 hook) |
| §113 | Hooks are opt-in per project, declared in `.claude/settings.json` | ✅ Sí (regla, no requiere hook) |

### 20.4 Por qué Node.js (no bash) para todos los hooks

Decisión consciente para mantener consistencia:

- **Runtime único**: el equipo solo necesita conocer Node, no Node + bash.
- **Portable real**: Node 18+ funciona idéntico en macOS/Linux/Windows; bash tiene diferencias entre versiones.
- **`fetch` y `crypto` built-in**: sin dependencias externas, ni `jq`, ni `curl`.
- **Testeable**: tests futuros en Vitest/Jest unificados.
- **Más legible**: el manejo de JSON envelope con `JSON.parse` es trivial vs. el `jq` parsing de bash.

### 20.5 Patrón único: `context-monitor` notifica al AGENTE

La mayoría de monitores de context usage de la industria notifican al **usuario** (statusline, badge, popup). El patrón adoptado de GSD invierte esto: **notifica al agente** vía exit 2 + stderr en `PostToolUse`.

Por qué importa:

- El usuario está AFK durante sesiones Ralph largas. No reaccionará a una badge en VS Code.
- El agente sí puede reaccionar: cerrar trabajo, ejecutar `/handoff`, marcar el issue blocked.
- Cambia el modelo operacional de "user notices → user intervenes" a "agent self-regulates".

Honestidad técnica: el hook es **silencioso sin telemetría externa**. No fabrica señales. Requiere que un statusline custom, MCP server, o el Claude Agent SDK escriba `.claude/context-bridge.json` con `tokens_used`/`tokens_max`. Sin esa fuente, el hook no emite nada.

### 20.6 Honestidad sobre el WebFetch cache

El patrón "HTTP 304 revalidation, no TTL ciego" es correcto pero tiene una limitación que el archivo de reglas documenta explícitamente:

- El post-hook necesita los validators (`ETag` / `Last-Modified`) para almacenar el cache, pero Claude Code no expone los response headers del WebFetch real al hook. Por eso el post-hook hace un `HEAD` adicional para capturarlos.
- Si el origen no expone validators → el hook **se niega a cachear** (mejor sin cache que cache mal validado).
- URLs sensibles (auth, tenant-scoped) se excluyen vía `bypass_url_patterns` en `.claude/hooks.config.json`.

### 20.7 Entregables

| Archivo | Propósito |
|---|---|
| [`docs/engineering/core/19-hooks-and-runtime-guards.md`](docs/engineering/core/19-hooks-and-runtime-guards.md) | 6 reglas §108-§113 + brief de hooks Claude Code + configuración recomendada + atribuciones |
| [`hooks/webfetch-cache-pre.js`](hooks/webfetch-cache-pre.js) | PreToolUse(WebFetch) — sirve cache en 304 |
| [`hooks/webfetch-cache-post.js`](hooks/webfetch-cache-post.js) | PostToolUse(WebFetch) — almacena cache con validators |
| [`hooks/context-monitor.js`](hooks/context-monitor.js) | PostToolUse(*) — notifica al agente en <35% / <25% |
| [`hooks/README.md`](hooks/README.md) | Instalación, configuración, telemetría bridge, troubleshooting, guía para escribir nuevos hooks |

### 20.8 Veredicto

**1 archivo, 3 hooks, 0 templates** — el mismo patrón minimalista. La capa defensiva queda lista para crecer cuando el equipo lo justifique:

- Cuando aparezca un incidente real de prompt injection → implementar §110 (especificación ya escrita).
- Cuando un payload sobreviva un `/handoff` → implementar §111.
- Cuando el catálogo de skills supere 15 → implementar §109.

Sin necesitar reescribir reglas. La estructura ya está.

**Estado final acumulado del framework Stormhelm:**

- **113 reglas** (§1-§113).
- **5 skills propios**: `/setup`, `/onboard`, `/debug`, `/optimize`, `/feature`.
- **3 hooks propios**: `webfetch-cache-pre.js`, `webfetch-cache-post.js`, `context-monitor.js`.
- **19 archivos de reglas** (core/ + capabilities/ + AGENTS.md).
- **2 templates** (postmortems/TEMPLATE.md + AGENTS.md template).
- **30 archivos totales** del framework.

---

## 21. Agentes formales: solo `reviewer`, dos especificados deferred

### 21.1 El gap detectado y la evaluación rigurosa

Hasta esta iteración Stormhelm tenía **0 agentes formales** en `.claude/agents/` — decisión consciente bajo la filosofía "main agent + skills + rules + hooks > multi-agente". El gap real, sin embargo, era el **sesgo de confirmación**: pedir al mismo agente que escribió código que lo revise produce predeciblemente falsos negativos.

Se evaluaron 5 candidatos contra 5 tests (caso de uso real, valor único vs skill, justificación de contexto fresco, no duplicar, ROI):

| Candidato | Score | Veredicto |
|---|---|---|
| `reviewer` | 5/5 | ✅ Formalizar ahora |
| `postmortem-writer` | 4/5 | 📋 Documentar para futuro (§115) |
| `security-auditor` | 3/5 | 📋 Documentar para futuro (§116) |
| `qa-engineer` | 0/5 | ❌ Descartar (duplica `/run-acceptance`) |
| `scenario-author` | 0/5 | ❌ Descartar (duplica `/to-scenarios`) |

Resultado: **1 agente formalizado, 2 especificados como deferred, 2 descartados**. Misma disciplina minimalista que en bugs e improvements.

### 21.2 Las 3 nuevas reglas §114-§116

| # | Regla | Estado |
|---|---|---|
| §114 | Independent code review is mandatory before any draft PR opens; the reviewer agent runs read-only and cites §N violations explicitly | ✅ Implementada (agente shipped) |
| §115 | Postmortem-writer agent for production incidents | 📋 Especificada, deferred hasta 3+ postmortems escritos a mano |
| §116 | Security-auditor agent for compliance-driven hardening | 📋 Especificada, deferred hasta proyecto bajo compliance activo o primer pentest con hallazgos |

### 21.3 Diseño del agente `reviewer`

| Atributo | Valor |
|---|---|
| **Path** | `agents/reviewer.md` (raíz del framework, copiado/symlinkeado a `.claude/agents/reviewer.md` por `/setup`) |
| **Tools** | `Read, Grep, Glob, Bash` — Bash limitado a comandos no-mutantes (`git diff`, `git log`, `gh pr view`, `git blame`) |
| **Modo** | Read-only por diseño arquitectónico, no por convención |
| **Contexto** | Fresco por cada invocación — sin memoria de las decisiones del autor |
| **Output** | Reporte estructurado con secciones 🛑/⚠️/💡 + "What the author got right" obligatorio + tabla resumen + recomendación |

### 21.4 Por qué un agente y no un skill

La diferencia es arquitectónica, no de prompting:

| Aspecto | Skill `/code-review` | Agente `reviewer` |
|---|---|---|
| Sesión | Misma sesión que el autor | Sesión separada |
| Contexto | Acumulado (incluye la justificación del autor mientras escribía) | Fresco (solo el diff y las reglas relevantes) |
| Tools | Los del agente principal (incluye Write/Edit) | Restringido a Read/Grep/Glob/Bash no-mutante |
| Sesgo de confirmación | Alto (el autor se "audita" a sí mismo) | Bajo (auditor independiente) |
| Riesgo de "fix mientras review" | Real (puede tocar código) | Imposible (no tiene tools de escritura) |

Pedir al autor de un PR que se haga su propio code review es exactamente el patrón que esta arquitectura evita. El tool-set constraint **es el valor**.

### 21.5 Calibración de severidad — la disciplina crítica

El system prompt del reviewer agent enforce explícitamente:

- **🛑 Blocking**: rule violation que compromete arquitectura, seguridad, auditabilidad o contrato público.
- **⚠️ Should fix**: violación de estilo o calidad que el autor puede documentar como aceptable.
- **💡 Suggestion**: preferencia, no violación.

Inflar ⚠️ → 🛑 destruye credibilidad del gate (boy-who-cried-wolf). Bajar 🛑 → ⚠️ deja pasar código malo. El agent system prompt incluye reglas explícitas para esta calibración y para la sección obligatoria "What the author got right" — un reviewer que solo encuentra errores pierde credibilidad igual que uno que solo aprueba.

### 21.6 Integración en el workflow

| Invoker | Cuándo |
|---|---|
| `/code-review` skill | Invocación directa por humano o por main agent |
| `/feature` Step 12 | Automático antes de `gh pr create --draft` |
| `ralph-local.sh` | Automático después de `/tdd` Green + `/run-acceptance` pass, antes de PR |
| Agent Teams §107 Tasks 8, 9 | El "reviewer" teammate role **es** este agente |

Ralph, específicamente, aplica esta lógica:
- 🛑 Blocking → una iteración extra del `/tdd` para arreglar; si persiste, `ralph-blocked`.
- ⚠️ Should fix → abre PR draft con el reporte; el humano decide.
- Clean o solo 💡 → procede al PR.

El reporte del reviewer **siempre** se adjunta a la descripción del PR.

### 21.7 Por qué los otros dos quedan deferred

| Agente | Por qué deferred |
|---|---|
| `postmortem-writer` (§115) | Valor real pero frecuencia baja al inicio. Sin volumen de incidentes, el agente formal vive sin uso. Trigger: 3+ postmortems escritos a mano en un trimestre. |
| `security-auditor` (§116) | Las reglas §87 + §101 + §84-§90 ya guían al main agent. El agente especializado tiene sentido bajo compliance activo (SOC2, ISO 27001, EU AI Act). Trigger: compliance program activo o primer pentest con hallazgos que debieron prevenirse. |

Ambos están **especificados con frontmatter y tool set** en `core/20-agents.md` — implementar es cuestión de copiar la spec, no diseñar de nuevo.

### 21.8 ¿Y los "roles" de §107 (Agent Teams)?

Los roles mencionados en §107 (`arch-{mod}`, `fe-{mod}`, `devops`, `integrator`, `qa-final`) son **patrones operacionales**, no agentes formales. Son spawn-with-prompt structures dentro de una sesión de paralelización, no agentes con tool-set restringido persistente.

La única excepción es `reviewer` en §107, que **es** este `agents/reviewer.md` — invocado desde dentro de un Agent Team para QA por módulo (Tasks 8 y 9 del task graph de §107).

### 21.9 Entregables

| Archivo | Propósito |
|---|---|
| [`agents/reviewer.md`](agents/reviewer.md) | Agente formal con frontmatter + system prompt completo (~3 páginas de behavior rules) |
| [`docs/engineering/core/20-agents.md`](docs/engineering/core/20-agents.md) | Reglas §114-§116 + criterios de cuándo formalizar un agente vs skill |

### 21.10 Veredicto

**1 agente formal, 2 especificados deferred, 0 templates nuevos.** La filosofía minimalista se preserva al extremo: solo se formaliza lo que pasa los 5 tests rigurosos.

**Estado final del framework Stormhelm tras esta iteración:**

- **116 reglas** (§1-§116).
- **5 skills propios**: `/setup`, `/onboard`, `/debug`, `/optimize`, `/feature`.
- **3 hooks propios** (Node.js, zero deps): `webfetch-cache-pre/post`, `context-monitor`.
- **1 agente formal**: `reviewer`.
- **20 archivos de reglas** (`core/` + `capabilities/` + AGENTS.md).
- **2 templates** (postmortems/TEMPLATE.md + AGENTS.md template).
- **32 archivos totales del framework**.

---

## 22. Anexos — fuentes y enlaces

### 17.1 Repositorios oficiales

- **AI Hero / Skills**: https://github.com/mattpocock/skills
- **AI Hero (course material)**: https://github.com/ai-hero-dev/ai-hero
- **Evalite**: https://github.com/mattpocock/evalite
- **GSD**: https://github.com/gsd-build/get-shit-done
- **GSD v2 (CLI)**: https://github.com/gsd-build/gsd-2
- **Superpowers**: https://github.com/obra/superpowers
- **Superpowers marketplace**: https://github.com/obra/superpowers-marketplace
- **BMAD-METHOD**: https://github.com/bmad-code-org/BMAD-METHOD
- **Spec-Kit**: https://github.com/github/spec-kit
- **agent-skills**: https://github.com/addyosmani/agent-skills

### 17.2 Sitios y documentación

- AI Hero — https://www.aihero.dev/
- AI Hero Skills hub — https://www.aihero.dev/skills
- AGENTS.md guide — https://www.aihero.dev/a-complete-guide-to-agents-md
- GSD — https://gsd.site/
- BMAD docs — https://docs.bmad-method.org/
- BMad Code — https://www.bmadcode.com/
- Spec-Kit docs — https://github.github.com/spec-kit/
- Anthropic Superpowers plugin — https://claude.com/plugins/superpowers

### 17.3 Artículos y análisis comparativos

- The New Stack: *Beating the Rot and Getting Stuff Done* — https://thenewstack.io/beating-the-rot-and-getting-stuff-done/
- Pulumi Blog: *Claude Code orchestration frameworks* — https://www.pulumi.com/blog/claude-code-orchestration-frameworks/
- EveryDev: *Five Claude Code frameworks compared* — https://www.everydev.ai/p/blog-five-claude-code-frameworks-compared-when-to-use-each-when-to-use-none
- Codecentric: *Anatomy of Claude Code workflows* — https://www.codecentric.de/en/knowledge-hub/blog/the-anatomy-of-claude-code-workflows-turning-slash-commands-into-an-ai-development-system
- Medium: *Superpowers, GSD, and gstack: What Each Framework Constrains* — https://medium.com/@tentenco/superpowers-gsd-and-gstack-what-each-claude-code-framework-actually-constrains-12a1560960ad
- GitHub Blog: *Spec-driven development with AI* — https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/
- Microsoft Learn: *Implement SDD using GitHub Spec Kit* — https://learn.microsoft.com/en-us/training/modules/spec-driven-development-github-spec-kit-enterprise-developers/

### 17.4 Ralph y Day/Night Shift (fuentes adicionales)

- Geoffrey Huntley — Ralph original: https://ghuntley.com/ralph/
- AI Hero — Getting started with Ralph: https://www.aihero.dev/getting-started-with-ralph
- AI Hero — Workshop Day 5 Ralph: https://www.aihero.dev/workshops/day-5-ralph-dj2dh
- AI Hero — Tips for coding with Ralph Wiggum: https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum
- Anthropic plugin ralph-wiggum: https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md
- awesome-ralph (snwfdhmp): https://github.com/snwfdhmp/awesome-ralph
- atcyrus — Ralph Wiggum Technique: https://www.atcyrus.com/stories/ralph-wiggum-technique-claude-code-autonomous-loops
- The Register — Ralph Wiggum Claude Loops: https://www.theregister.com/2026/01/27/ralph_wiggum_claude_loops/
- Codersera — Anthropic June 2026 billing change: https://codersera.com/blog/anthropic-june-2026-billing-change-claude-code/
- The New Stack — Anthropic Agent SDK credits: https://thenewstack.io/anthropic-agent-sdk-credits/
- Ralphable — Codex `/goal` as Ralph alternative: https://ralphable.com/blog/codex-goal-command-ralph-loop-openai-built-in-autonomous-coding-agent-2026
- Bug `--max-iterations=N` (issue #18646): https://github.com/anthropics/claude-code/issues/18646
- Session bleed (issue #19082): https://github.com/anthropics/claude-code/issues/19082

### 17.5 BDD + LLM (fuentes adicionales)

- swingerman/atdd — plugin Claude Code para ATDD outside-in: https://github.com/swingerman/atdd
- TDAD paper (Test-Driven Agent Definition): https://arxiv.org/pdf/2603.08806
- Test-Driven Agentic Development: https://arxiv.org/html/2603.17973v1
- Humanizing Work — AI for better BDD: https://www.humanizingwork.com/ai-for-better-bdd/
- Hung Doan — LLMs are making BDD/Gherkin rise again: https://hungdoan.com/2025/04/25/llms-are-making-bdd-gherkin-rise-again/
- LowTouch.ai — Cucumber + AI agents: https://www.lowtouch.ai/revolutionizing-cucumber-test-case-automation-with-ai-agents/
- Gojko Adzic — SDD is BDD taken seriously: https://www.linkedin.com/pulse/spec-driven-development-revenge-waterfall-bdd-taken-gojko-adzic-imquf
- Paul Duvall — ATDD-driven AI development: https://www.paulmduvall.com/atdd-driven-ai-development-how-prompting-and-tests-steer-the-code/
- Coding is like Cooking — TDD with Agentic AI: https://coding-is-like-cooking.info/2026/03/test-driven-development-with-agentic-aiv
- Martin Fowler — SDD tools landscape: https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html
- BMAD TEA (Test Engineering Architecture): https://github.com/bmad-code-org/bmad-method-test-architecture-enterprise
- GSD BDD acceptance criteria proposal: https://github.com/gsd-build/get-shit-done/issues/2634
- playwright-bdd: https://github.com/vitalets/playwright-bdd
- pytest-bdd: https://github.com/pytest-dev/pytest-bdd
- vitest-cucumber: https://github.com/amiceli/vitest-cucumber

### 17.6 Recursos comunitarios

- DeepWiki Spec-Kit — https://deepwiki.com/github/spec-kit
- DeepWiki GSD — https://deepwiki.com/gsd-build/get-shit-done
- DeepWiki BMAD IDE Integration — https://deepwiki.com/bmad-code-org/BMAD-METHOD/10-ide-integration
- Star History mattpocock/skills — https://www.star-history.com/mattpocock/skills/

---

> **Próximos pasos sugeridos:**
>
> 1. Validar el blueprint del Harness híbrido en un proyecto piloto de 2-4 semanas.
> 2. Definir `constitution.md` de Simetrik con guardrails específicos (compliance, security, data handling).
> 3. Construir el primer `CONTEXT.md` con el lenguaje ubicuo del dominio Simetrik.
> 4. Evaluar si Evalite cubre las necesidades de testing LLM o si requiere extensión propia.
> 5. Diseñar el conjunto inicial de 5-7 skills propios de Simetrik que extiendan este Harness.
