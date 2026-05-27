# 12 — Package Management (TypeScript)

**Scope.** Install-time and lockfile-level hygiene for the npm ecosystem. These rules harden the project against supply-chain attacks, phantom dependencies, and non-reproducible installs.

**When to read.** Adding, upgrading, or removing a dependency; reviewing a PR that changes `package.json` or the lockfile; configuring CI install; preparing a release.

**Rules in this file.** §117, §118, §119, §120, §121

> See `../../AGENTS.md` for the full rule index. Related: `../../core/16-security-supply-chain.md` (CI audit, SBOM, secrets), `../../core/13-ralph-and-afk.md` (`introduces-capability` label gates first-time deps from AFK), `../../core/18-improvements.md` (dep upgrades treated as their own improvement kind).

---

## §117. Use `pnpm` as the package manager; commit `pnpm-lock.yaml`

`pnpm` is the default for any TypeScript project. The lockfile (`pnpm-lock.yaml`) is committed and is part of the reviewable diff on every PR that touches dependencies.

### Why

- **Phantom-dependency prevention.** `pnpm`'s isolated `node_modules` layout means code can only import packages declared in its own `package.json`. With npm/yarn-classic's hoisted layout, a transitive dep silently becomes importable and the project starts depending on something it never declared.
- **Reproducibility.** `pnpm-lock.yaml` pins the full resolved tree including integrity hashes. Two installs of the same lockfile produce byte-identical `node_modules`.
- **Disk and time.** Global content-addressable store with hard links — orders of magnitude less disk for monorepos and faster cold installs in CI.

`pnpm` is **not** automatically more secure against malicious packages than npm; lifecycle scripts still run unless explicitly blocked (see §118). Use `pnpm` for correctness; combine with §118-§121 for security.

### Good

```bash
# Install
pnpm install
pnpm add hono
pnpm add -D vitest

# Commit
git add package.json pnpm-lock.yaml
```

### Bad

```bash
# Mixing managers — produces conflicting lockfiles
npm install some-package
pnpm install some-other
```

```bash
# Lockfile not committed
echo "pnpm-lock.yaml" >> .gitignore
```

### Enforcement

Pin the manager in `package.json` so a contributor on the wrong tool fails fast:

```json
{
  "packageManager": "pnpm@9.0.0",
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

CI must reject PRs that introduce `package-lock.json` or `yarn.lock`.

---

## §118. Lifecycle scripts are blocked by default; opt-in via an explicit allowlist

`postinstall`, `preinstall`, and `install` scripts are the primary vector for supply-chain attacks (the package executes arbitrary code on your machine the moment it lands). Block them globally; allow them only for the small set of packages that genuinely need them.

### Why

- The majority of dependencies do not need lifecycle scripts. The minority that do (`esbuild`, `puppeteer`, native binaries) are identifiable and stable.
- Most malicious-package incidents involve a postinstall script in a freshly-published transitive dep. An allowlist reduces the attack surface to zero for everything not on it.
- The allowlist is a reviewable list in `package.json` — adding to it is an explicit decision, not a silent default.

### Good

```json
// package.json
{
  "pnpm": {
    "onlyBuiltDependencies": [
      "esbuild",
      "@swc/core",
      "better-sqlite3"
    ]
  }
}
```

```bash
# Global default
pnpm config set side-effects-cache false
pnpm config set enable-pre-post-scripts false
```

### Bad

```bash
# Everything runs whatever it wants
pnpm install
# silently executes postinstall for every transitive dep
```

### Enforcement

- A PR that grows `onlyBuiltDependencies` must justify each addition in the PR body. The reviewer agent (§114) flags additions to this list automatically.
- An issue that introduces a dependency with lifecycle scripts is **not** `ralph-ready` (§63) — first-time capability slices need a human to vet the allowlist entry.

---

## §119. CI installs with `--frozen-lockfile`; lockfile drift fails the build

CI must never resolve dependencies fresh. The lockfile is the contract; if it does not match `package.json`, the build fails and a human decides whether the drift is intentional.

### Why

- Resolving fresh in CI means the build can pull a newly-published patch version between two runs. A maintainer pushing a malicious patch hits production within minutes.
- Lockfile drift in a PR is a signal: either a dep was bumped (which needs review) or `package.json` and the lockfile disagree (which is a bug).

### Good

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Install
  run: pnpm install --frozen-lockfile
```

```bash
# Local — same flag for parity with CI
pnpm install --frozen-lockfile
```

### Bad

```yaml
- name: Install
  run: pnpm install  # silently updates the lockfile in CI
```

### Enforcement

A pre-push hook or CI job runs:

```bash
pnpm install --frozen-lockfile --lockfile-only
git diff --exit-code pnpm-lock.yaml
```

If the lockfile changes, the PR cannot merge until the change is committed and reviewed.

---

## §120. Pin direct dependencies conservatively; auto-merge only patch upgrades

Direct dependencies use `^` (caret-minor) at most for libraries, and exact pins (no range) for runtime-critical or security-sensitive packages. Renovate / Dependabot may auto-merge **patch** upgrades when CI green; minor and major bumps require human review.

### Why

- A broad range (`*`, `>=1.0.0`) means the resolved version drifts between installs even with the same `package.json`. Combined with §119 this is impossible, but the lockfile only protects today's clone — a fresh `pnpm install` on a new machine resolves whatever satisfies the range.
- Patch upgrades are statistically safe (the registry semver contract says no breaking changes). Minor and major upgrades carry behavioral risk; they belong to the **dependency-upgrade** improvement kind in `core/18-improvements.md`, not to silent automation.

### Good

```json
{
  "dependencies": {
    "hono": "^4.6.0",
    "zod": "^3.23.0",
    "drizzle-orm": "0.36.4"
  }
}
```

```yaml
# renovate.json
{
  "packageRules": [
    { "matchUpdateTypes": ["patch"], "automerge": true, "automergeType": "branch" },
    { "matchUpdateTypes": ["minor", "major"], "automerge": false }
  ]
}
```

### Bad

```json
{
  "dependencies": {
    "hono": "*",
    "zod": ">=3.0.0"
  }
}
```

### Enforcement

Lockfile-lint or a CI check that fails when `package.json` contains a range looser than `^X.Y.Z`.

---

## §121. Verify provenance before release; audit signatures of every dep

Before cutting a release, run `pnpm audit signatures` (or equivalent) to verify every installed package was published by the expected publisher. Combine with `pnpm audit --audit-level=high` for known CVEs.

### Why

- Provenance binds a published artifact to the source commit and the build that produced it. A package without provenance, or with provenance from an unexpected source, is suspect.
- Releases are a natural checkpoint; verifying at release catches what daily CI missed and is required for the SBOM (§89).

### Good

```yaml
# .github/workflows/release.yml (excerpt)
- name: Audit signatures
  run: pnpm audit signatures

- name: Audit CVEs
  run: pnpm audit --audit-level=high

- name: SBOM
  run: pnpm dlx @cyclonedx/cyclonedx-npm --output-file sbom.json
```

### Bad

A release pipeline that runs tests, builds, publishes — and never inspects what is actually inside the artifact.

### Enforcement

The release job blocks on a non-zero exit from `pnpm audit signatures` or from `pnpm audit --audit-level=high`. Exceptions go through the documented CVE-exception process from §85.
