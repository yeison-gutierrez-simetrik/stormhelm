# 12 — Package Management (Python)

**Scope.** Install-time and lockfile-level hygiene for the Python ecosystem. These rules harden the project against supply-chain attacks, phantom dependencies, and non-reproducible installs.

**When to read.** Adding, upgrading, or removing a dependency; reviewing a PR that changes `pyproject.toml` or the lockfile; configuring CI install; preparing a release.

**Rules in this file.** §117-py, §118-py, §119-py, §120-py, §121-py

> See `../../AGENTS.md` for the full rule index. Related: `../../core/16-security-supply-chain.md` (CI audit, SBOM, secrets), `../../core/13-ralph-and-afk.md` (`introduces-capability` label gates first-time deps from AFK), `../../core/18-improvements.md` (dep upgrades treated as their own improvement kind).

---

## §117-py. Use `uv` as the package manager; commit `uv.lock`

`uv` is the default for any Python project. The lockfile (`uv.lock`) is committed and is part of the reviewable diff on every PR that touches dependencies.

### Why

- **Speed.** `uv` resolves and installs orders of magnitude faster than pip / poetry. CI cold installs go from minutes to seconds, which removes the temptation to skip `--frozen` in PR checks.
- **Reproducibility.** `uv.lock` pins the full resolved tree including hashes. Two installs of the same lockfile produce byte-identical environments.
- **PEP-standard.** `uv` uses `pyproject.toml` exclusively; no `setup.py`, no `setup.cfg`, no `requirements.txt` for source dependencies (lock-derived `requirements.txt` may be exported for legacy consumers).
- **One tool.** `uv` covers Python version installation, virtualenv creation, dependency resolution, and script-mode execution — replacing the `pyenv` + `pip` + `virtualenv` + `pip-tools` stack with a single binary.

`uv` is **not** automatically more secure against malicious packages than pip; build-time hooks (`setup.py`, PEP 517 backends) still execute unless explicitly disabled (see §118-py). Use `uv` for correctness; combine with §118-py–§121-py for security.

### Acceptable alternatives

If your organization standardizes on `poetry` or `pdm`, the same rules apply: commit the lockfile (`poetry.lock` / `pdm.lock`), use `--frozen` / `--locked` in CI, restrict build hooks, audit before release. Do **not** mix tools in the same repository.

### Good

```bash
# Install
uv sync                          # create venv + install from lockfile
uv add httpx                     # add dependency
uv add --dev pytest pytest-cov   # add dev dependency
uv remove old-package            # remove

# Commit
git add pyproject.toml uv.lock
```

### Bad

```bash
# Mixing managers — produces conflicting lockfiles
pip install some-package
uv add some-other-package

# Lockfile not committed
echo "uv.lock" >> .gitignore
```

### Enforcement

Pin Python and `uv` in `pyproject.toml` so a contributor on the wrong tool fails fast:

```toml
[project]
name = "myproject"
version = "0.1.0"
requires-python = ">=3.12,<3.13"

[tool.uv]
required-version = ">=0.5.0"
```

CI must reject PRs that introduce `Pipfile`, `Pipfile.lock`, `poetry.lock`, `requirements.txt` (as a source), or `setup.py`.

---

## §118-py. Build hooks are blocked by default; PEP 517 / PEP 660 only

Python packages can execute arbitrary code at install time via `setup.py`, PEP 517 build backends, or pre/post hooks in a build backend. This is the equivalent of npm's lifecycle scripts — historically the primary vector for supply-chain attacks (the package executes code on your machine the moment it lands).

Modern best practice: use **wheels only** in production installs, and limit the set of packages allowed to build from source.

### Why

- The vast majority of dependencies publish prebuilt wheels for the platforms you target (linux/x86_64, linux/arm64, macOS, Windows). When `uv` / `pip` finds a wheel, **no build code runs.**
- The packages that publish only sdists (source distributions) execute their build backend on install. That backend can run arbitrary code, including malicious post-install steps in packages whose `setup.py` was hijacked.
- A `--only-binary :all:` install rejects any package that would require source build, surfacing the decision to the developer.

### Good

```bash
# Lockfile install — wheel-only, no build code
uv sync --frozen --only-binary :all:
```

```toml
# pyproject.toml — explicit allowlist for packages that *must* build from source
[tool.uv]
no-build-package = ["*"]                       # default: forbid source builds
build-package = ["psycopg-c", "asyncpg"]       # allowlist for packages with required C ext
```

### Bad

```bash
# Everything builds whatever it wants from source
pip install -r requirements.txt
# silently executes setup.py for every dependency without a published wheel
```

### Enforcement

- CI installs with `--only-binary :all:` and an explicit allowlist for the small set of packages that require source build (typically C-extension libraries: `psycopg`, `numpy` on uncommon platforms, `cryptography` on older Linux distros).
- A PR that grows `build-package` must justify each addition in the PR body. The reviewer agent (§114) flags additions automatically.
- An issue that introduces a dependency requiring source build is **not** `ralph-ready` (§63) — first-time capability slices need a human to vet the build step.

---

## §119-py. CI installs with `--frozen`; lockfile drift fails the build

CI must never resolve dependencies fresh. The lockfile is the contract; if it does not match `pyproject.toml`, the build fails and a human decides whether the drift is intentional.

### Why

- Resolving fresh in CI means the build can pull a newly-published patch version between two runs. A maintainer pushing a malicious patch hits production within minutes.
- Lockfile drift in a PR is a signal: either a dep was bumped (which needs review) or `pyproject.toml` and the lockfile disagree (which is a bug).

### Good

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Install Python
  uses: actions/setup-python@v5
  with:
    python-version: "3.12"

- name: Install uv
  run: pip install uv==0.5.*

- name: Install dependencies
  run: uv sync --frozen --only-binary :all:
```

```bash
# Local — same flags for parity with CI
uv sync --frozen
```

### Bad

```yaml
- name: Install
  run: |
    pip install -r requirements.txt  # ❌ resolves anything matching version specifiers
```

### Enforcement

A pre-push hook or CI job runs:

```bash
uv lock --check
# fails non-zero if uv.lock would change given current pyproject.toml
```

If the lockfile changes, the PR cannot merge until the change is committed and reviewed.

---

## §120-py. Pin direct dependencies conservatively; auto-merge only patch upgrades

Direct dependencies use compatible-release (`~=X.Y`) at most for libraries, and exact pins (`==X.Y.Z`) for runtime-critical or security-sensitive packages. Renovate / Dependabot may auto-merge **patch** upgrades when CI green; minor and major bumps require human review.

### Why

- A broad range (`>=1.0`, `*`) means the resolved version drifts between installs even with the same `pyproject.toml`. Combined with §119-py this is impossible day-to-day, but the lockfile only protects today's clone — a fresh `uv sync` (no `--frozen`) on a new machine resolves whatever satisfies the range.
- Patch upgrades are statistically safe (PEP 440 semver contract). Minor and major upgrades carry behavioral risk; they belong to the **dependency-upgrade** improvement kind in `core/18-improvements.md`, not to silent automation.

### Good

```toml
# pyproject.toml
[project]
dependencies = [
    "fastapi~=0.115",        # compatible release, allows 0.115.x
    "pydantic~=2.9",         # compatible release
    "asyncpg==0.30.0",       # exact pin for runtime-critical driver
    "cryptography==43.0.3",  # exact pin for security-sensitive
]

[dependency-groups]
dev = [
    "pytest~=8.3",
    "pytest-asyncio~=0.24",
    "ruff~=0.7",
    "pyright~=1.1",
]
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

```toml
[project]
dependencies = [
    "fastapi",          # ❌ no constraint at all
    "pydantic>=2.0",    # ❌ allows 2.x and 3.x
    "asyncpg>=0.25",    # ❌ allows breaking minor bumps
]
```

### Enforcement

A CI check that fails when `pyproject.toml` contains a range looser than `~=X.Y` or an unbounded specifier.

---

## §121-py. Verify provenance before release; audit signatures of every dep

Before cutting a release, run `pip-audit` (or equivalent) for CVE detection, and verify provenance for all wheels via [Sigstore](https://www.sigstore.dev/) for packages that publish to PyPI with attestations.

### Why

- Provenance binds a published artifact to the source commit and the build that produced it. A package without provenance, or with provenance from an unexpected source, is suspect.
- Releases are a natural checkpoint; verifying at release catches what daily CI missed and is required for the SBOM (§89).
- PyPI ships `attestations` for packages built with [PEP 740](https://peps.python.org/pep-0740/) — verifying them confirms the wheel matches the published source commit.

### Good

```yaml
# .github/workflows/release.yml (excerpt)
- name: Audit CVEs
  run: |
    uv pip compile pyproject.toml -o /tmp/requirements.txt
    uv run pip-audit -r /tmp/requirements.txt --strict

- name: Verify Sigstore attestations
  run: |
    # For every wheel in the lockfile that has PEP 740 attestations:
    uv run python scripts/verify_attestations.py

- name: Generate SBOM
  run: |
    uv run pip-audit -r /tmp/requirements.txt --format=cyclonedx-json > sbom.json
```

### Bad

A release pipeline that runs tests, builds the wheel, publishes — and never inspects what is actually inside the artifact.

### Enforcement

The release job blocks on a non-zero exit from `pip-audit --strict`. Exceptions go through the documented CVE-exception process from §85.

### Tooling note

The Python ecosystem's audit story is still maturing relative to npm. As of 2026, `pip-audit` (PyPA) is the canonical CVE checker; `sigstore-python` verifies attestations; `cyclonedx-py` produces SBOMs. Track the [Sigstore for PyPI](https://blog.pypi.org/posts/2024-11-14-pypi-now-supports-digital-attestations/) rollout — coverage of attested packages on PyPI grows monthly, and the rule will tighten as coverage approaches 100%.
