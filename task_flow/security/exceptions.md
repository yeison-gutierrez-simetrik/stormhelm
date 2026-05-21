# security/exceptions.md — task_flow

> **Propósito:** registro auditable de excepciones a hallazgos de seguridad (CVEs, findings de SAST, etc.) que el equipo decide aceptar conscientemente.
>
> **Política:** toda excepción tiene fecha de expiración. Tras expirar, `/security-hardening` la trata como nueva y bloquea el merge hasta renovación o resolución.

---

## Formato de entrada

```markdown
### EXC-NNNN — <título corto>

- **Tipo:** CVE / SAST finding / dep-deprecated / otro
- **Identificador:** CVE-YYYY-NNNNN / regla semgrep / archivo:línea
- **Severidad original:** critical / high / medium
- **Severidad efectiva:** (justifica reducción si aplica)
- **Aceptada por:** nombre + rol
- **Fecha de aceptación:** YYYY-MM-DD
- **Fecha de expiración:** YYYY-MM-DD (max 90 días renovables)
- **Justificación:** por qué es seguro aceptar esto en nuestro contexto.
- **Mitigación compensatoria:** qué control adicional reduce el riesgo.
- **Plan de remediación:** cómo y cuándo se eliminará la excepción.
- **ADR:** docs/decisions/NNNN-*.md (si aplica)
```

---

## Excepciones activas

*(Vacío — añade entradas usando el formato de arriba.)*

---

## Excepciones expiradas (histórico)

*(Vacío.)*
