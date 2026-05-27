# Solution Architecture Document — {{scope}}

<!-- DERIVED — DO NOT EDIT BY HAND. Rerun /sad to refresh. -->

- **Scope:** {{feature-slug | bounded-context | system}}
- **Generated:** {{YYYY-MM-DD}}
- **Generated from spec status:** {{Clarified | Released}}
- **Source artifacts:** see footer

---

## 1. Context & constraints

> Quoted from `docs/specs/{{feature-slug}}.md` § "Why"

{{quote_spec_why}}

**Constitutional constraints**: {{constitution C.N references with one-line summary each}}.

**Compliance frameworks active**: {{from /setup, e.g., SOC2 + GDPR}}.

---

## 2. Quality Attributes (prioritized)

Order is authoritative. When two QAs conflict in implementation, the higher-priority one wins.

| Rank | QA | NFR source | Trade-off rule |
|---|---|---|---|
| QA.1 | {{e.g., Availability}} | NFR-{{n}} | {{when this and QA.2 conflict, this wins by accepting…}} |
| QA.2 | {{e.g., Latency}} | NFR-{{n}} | {{…}} |
| QA.3 | {{…}} | {{…}} | {{…}} |

_Recorded via `/sad` Step 2 on {{YYYY-MM-DD}}._

---

## 3. Decisions (ADRs in scope)

In chronological order. Status as of generation: ✅ accepted, ⚠️ superseded, ❌ rejected.

- ✅ **ADR-{{NNNN}}** — {{slug}} — _one-line summary_ — [`docs/adr/{{NNNN}}-{{slug}}.md`]
- {{…}}

---

## 4. Vocabulary delta

Terms newly introduced or refined for this scope. Full glossary in `docs/CONTEXT.md`.

- **{{Term}}** — {{definition from CONTEXT.md}}
  - _Avoid_: {{deprecated wording}}
- {{…}}

---

## 5. Component map

Assembled from `/plan` files in `.planning/plans/{{feature-slug}}/`.

### Entrypoints
- {{HTTP route / CLI command / event consumer}}: {{purpose}}

### Application layer
- {{use case}}: {{ports it depends on}}

### Domain
- {{aggregate / value object / state machine}}: {{invariants}}

### Outbound adapters
- {{port → adapter binding}}: {{external service}}

### External services consumed
- {{service}}: {{purpose, SLA assumption, fallback behavior}}

### Persistence
- {{table / collection}}: {{tenant scoping per §45}}

---

## 6. Threat model summary

- **Source**: `docs/threat-models/{{slug}}.md` (generated {{YYYY-MM-DD}} by `/security-hardening`).
- **Top findings**:
  1. {{finding + mitigation status}}
  2. {{…}}
  3. {{…}}

_If no threat model exists for this scope, state explicitly: `(no threat model — see §87 trigger conditions)`._

---

## 7. Evidence

### Prototypes
- **`{{date}}-{{slug}}-prototype.md`** — Question: {{q}}. Outcome: {{a}}. Confidence: {{H/M/L}}.

### Performance baselines
- **`docs/perf-baselines/{{slug}}.md`** — Current p95: {{n}}ms. Target: {{n}}ms. Status: {{met | gap}}.

---

## 8. Operational concerns

- **Logging**: {{rules cited from §77-§80; per-feature notes}}
- **Metrics**: {{rules cited from §81-§82; per-feature notes}}
- **SLOs**: {{from `docs/slos.md`}}
- **Deployment**: {{from §15-§18 + project-specific}}

---

## 9. Open questions

Copied from `.planning/grilling/{{slug}}-open-questions.md`. Status as of {{YYYY-MM-DD}}.

- **OQ-{{n}}**: {{question}}
  - Who decides: {{role}}
  - Default if unresolved: {{default}}
  - Status: {{open | resolved on YYYY-MM-DD by ADR-{{NNNN}}}}

---

## 10. Risks

Derived from threat-model findings (§6), prototype "neither variant won" outcomes (§7), and out-of-scope items in the spec.

| Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|
| {{…}} | L/M/H | L/M/H | {{strategy}} | {{role}} |

---

## Source artifacts

- Spec: `docs/specs/{{feature-slug}}.md`
- Constitution: `docs/constitution.md`
- Context: `docs/CONTEXT.md`
- ADRs: {{list of `docs/adr/{{NNNN}}-{{slug}}.md`}}
- Threat model: `docs/threat-models/{{slug}}.md` (if applicable)
- Prototypes: {{list of `docs/prototypes/{{date}}-{{slug}}.md`}}
- Plans: `.planning/plans/{{feature-slug}}/*.md`
- Open questions: `.planning/grilling/{{slug}}-open-questions.md`

<!-- /sad generated on {{YYYY-MM-DD}} from the above artifacts. -->
