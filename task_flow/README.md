# task_flow

Proyecto en limpio inicializado con **[Stormhelm](../README.md)** — el marco de trabajo asistido por agentes para desarrollo de software.

---

## ¿Qué hay aquí?

Esto es un proyecto vacío con el scaffolding completo de Stormhelm ya instalado y listo para Claude Code. Aún no tiene stack — tú decides la tecnología y el framework se adapta.

```
task_flow/
├── README.md                       ← Estás aquí
├── AGENTS.md                       ← Punto de entrada para agentes
├── .claude/                        ← Configuración Claude Code (auto-detectada)
│   ├── settings.json               ← Permissions + hooks habilitados
│   ├── agents/                     ← Sub-agentes (reviewer)
│   ├── skills/                     ← 28 skills de Stormhelm
│   └── hooks/                      ← context-monitor.js, webfetch-cache-*.js
├── docs/
│   ├── WORKFLOWS-GUIDE.md          ← Cómo se usan los flujos (lectura obligatoria)
│   ├── constitution.md             ← La palabra final del proyecto (override §N rules)
│   ├── CONTEXT.md                  ← Lenguaje ubicuo, contextos, sub-dominios
│   ├── engineering/                ← Las 116 reglas (core + capabilities)
│   ├── specs/                      ← Specs de features (generado por /specify)
│   ├── decisions/                  ← ADRs (generado por /tdd cuando aplica)
│   ├── threat-models/              ← STRIDE models (generado por /security-hardening)
│   ├── perf-baselines/             ← Métricas de performance (generado por /optimize)
│   ├── postmortems/                ← Postmortems de incidentes en producción
│   └── audit/                      ← incidents.md y registros de auditoría
├── features/                       ← .feature files (BDD, generado por /to-scenarios)
├── .planning/                      ← Outputs de skills (audits, traceability, etc.)
├── security/                       ← exceptions.md (vulnerabilidades aceptadas)
├── templates/                      ← ralph-local.sh.tmpl
├── src/                            ← Tu código (vacío)
└── tests/                          ← Tus tests (vacío)
```

**Importante:** los skills, agents y hooks viven dentro de `.claude/`. Claude Code los descubre automáticamente al abrir esta carpeta.

---

## Cómo empezar

### 1. Abre Claude Code en esta carpeta

```bash
cd task_flow
claude
```

Claude Code detectará automáticamente:

- 28 skills disponibles (`/feature`, `/onboard`, `/setup`, `/debug`, `/optimize`, …)
- 1 sub-agente (`reviewer`)
- 3 hooks (context-monitor, webfetch-cache pre/post)

### 2. Onboarding (5 min)

```bash
> /onboard
```

Tour de los 4 flujos principales (feature, bug, improvement, brownfield), los HITLs, y las skills clave.

### 3. Setup específico de tu stack (10 min)

```bash
> /setup
```

`/setup` te pregunta el stack (TS+Hono, Python+FastAPI, otro), ajusta `permissions.allow` en `.claude/settings.json` según tu elección, y crea `templates/ralph-local.sh` desde su template.

### 4. Constitución (15-30 min)

```bash
> /constitution
```

Sesión guiada para llenar `docs/constitution.md` con los tenets, restricciones de stack, decisiones de dominio y SLOs default de tu proyecto.

### 5. Primera feature (1-3 días)

```bash
> /feature "Quiero que los usuarios puedan crear y listar sus tareas"
```

O manual, paso a paso (ver `docs/WORKFLOWS-GUIDE.md` sección 4):

```bash
> /grill-me   →  /clarify  →  /specify  →  /domain-model  →
> /to-scenarios   [HITL #1]   →   /to-issues   →   /plan   →
> /tdd   →   /run-acceptance   →   /security-hardening   →
> /traceability-matrix   →   [HITL #3]   →   merge
```

---

## Documentación clave (en orden de lectura)

1. **`docs/WORKFLOWS-GUIDE.md`** — Cómo se ejecutan los flujos y dónde está el HITL. Lectura obligatoria.
2. **`docs/engineering/AGENTS.md`** — Índice de las 116 reglas (carga progresiva).
3. **`docs/constitution.md`** — Las decisiones específicas de tu proyecto.
4. **`docs/CONTEXT.md`** — Lenguaje ubicuo del dominio.

---

## Anti-patrones rápidos

- **No** edites `docs/engineering/core/*.md` para "personalizar" reglas — usa `docs/constitution.md`.
- **No** brincates HITL #1 (aprobación de `.feature/`) — son tu contrato de aceptación.
- **No** marques una issue como `ralph-ready` si tiene label `introduces-capability:*` — la primera vez que un stack toca tu proyecto debe ser humana.
- **No** uses `/postmortem` para todo error — solo para issues con label `incident:production`.

---

**Status:** scaffolding instalado, listo para `/onboard` → `/setup` → primera feature.
