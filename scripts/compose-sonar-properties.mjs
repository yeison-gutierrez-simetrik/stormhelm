#!/usr/bin/env node
// scripts/compose-sonar-properties.mjs
//
// Composes a project's `sonar-project.properties` from the YAML frontmatter
// declared by each ACTIVE capability's CAPABILITY.md (PR-Sonar / FW-6).
//
// PROBLEM: without this, every project hand-writes the same classification
// rules in sonar-project.properties so SonarCloud treats acceptance glue
// (e.g. Cucumber `features/**`, `test-support/**`) as tests rather than
// production code with throwaway credentials, and excludes generated code
// (ORM migrations, codegen'd schema files). Each project reinvents the same
// mapping; this derives it from the active capabilities instead.
//
// FIX: each capability declares what it contributes via frontmatter:
//   sonar:
//     test_inclusions: [...]
//     coverage_exclusions: [...]
//     exclusions: [...]
//
// The composer reads active capabilities (from constitution.md C.3, or from
// CLI args), merges contributions, and emits a single sonar-project.properties
// to stdout.
//
// Usage:
//   node scripts/compose-sonar-properties.mjs <capability> [capability ...]
//     > sonar-project.properties
//
//   node scripts/compose-sonar-properties.mjs --check <expected.properties> <capability> ...
//     # Compares composed output against an expected file; exit 1 on diff.
//
// Zero external dependencies. Project-specific keys (projectKey, organization,
// coverage report path) are NOT composed — they are per-project and live as a
// separate header section the user maintains.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const CAPABILITIES_ROOT = 'docs/engineering/capabilities';

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// Tiny YAML-frontmatter parser. Only handles what we declare:
// - top-level scalar (name, description, extends)
// - top-level "sonar:" block with nested lists.
// No external dependency.
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/m);
  if (!m) return {};
  const body = m[1];
  const out = {};
  const lines = body.split('\n');
  let currentKey = null;
  let currentSubKey = null;
  for (const raw of lines) {
    if (raw.match(/^\s*#/)) continue; // YAML comment
    if (raw.match(/^[a-z_]/)) {
      // top-level key
      const m1 = raw.match(/^([a-z_]+):\s*(.*)$/);
      if (!m1) continue;
      currentKey = m1[1];
      const val = m1[2].trim();
      if (val === '') {
        out[currentKey] = {};
      } else {
        out[currentKey] = val;
        currentKey = null;
      }
      currentSubKey = null;
    } else if (raw.match(/^\s\s[a-z_]/)) {
      // nested sub-key under a block
      const m2 = raw.match(/^\s\s([a-z_]+):\s*(.*)$/);
      if (!m2 || !currentKey) continue;
      currentSubKey = m2[1];
      const val = m2[2].trim();
      if (val === '') {
        out[currentKey][currentSubKey] = [];
      } else {
        out[currentKey][currentSubKey] = val;
      }
    } else if (raw.match(/^\s\s\s\s-\s/)) {
      // list item under a sub-key
      const m3 = raw.match(/^\s\s\s\s-\s+(.*)$/);
      if (!m3 || !currentKey || !currentSubKey) continue;
      let v = m3[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!Array.isArray(out[currentKey][currentSubKey])) {
        out[currentKey][currentSubKey] = [];
      }
      out[currentKey][currentSubKey].push(v);
    }
  }
  return out;
}

function loadCapability(name) {
  const path = join(CAPABILITIES_ROOT, name, 'CAPABILITY.md');
  if (!existsSync(path)) fail(`capability '${name}' not found at ${path}`);
  const text = readFileSync(path, 'utf8');
  const fm = parseFrontmatter(text);
  return { name, path, frontmatter: fm };
}

function collectActive(roots) {
  // Topological resolution of `extends:` chains.
  const seen = new Set();
  const order = [];
  function visit(n) {
    if (seen.has(n)) return;
    seen.add(n);
    const cap = loadCapability(n);
    const parent = cap.frontmatter.extends;
    if (parent) visit(parent);
    order.push(cap);
  }
  for (const r of roots) visit(r);
  return order;
}

// Framework-vendored directories every consumer copies in via adoption + /setup:
// the consumer-runtime scripts/ and the whole .claude/ tree (skills, agents, hooks).
// These are framework infra, NOT product code — exclude them so a consumer's
// SonarCloud gate (especially Automatic Analysis, which ignores `sonar.sources=src`
// and scans the whole repo) doesn't flag framework code (execSync/RegExp/createHash
// hotspots in the shipped scripts + hooks) as product defects. Standing exclusion for
// every project, not capability-derived. See FOLLOW-UP 10.
const VENDORED_EXCLUSIONS = ['scripts/**', '.claude/**'];

function merge(caps) {
  const out = { test_inclusions: [], coverage_exclusions: [], exclusions: [...VENDORED_EXCLUSIONS] };
  for (const c of caps) {
    const s = c.frontmatter.sonar || {};
    for (const k of ['test_inclusions', 'coverage_exclusions', 'exclusions']) {
      const v = s[k];
      if (Array.isArray(v)) for (const item of v) if (!out[k].includes(item)) out[k].push(item);
    }
  }
  return out;
}

function emit(merged, capNames) {
  const lines = [
    '# sonar-project.properties — composed from active capabilities',
    `# Active capabilities (resolved with extends): ${capNames.join(' → ')}`,
    `# Generated by scripts/compose-sonar-properties.mjs (PR-Sonar).`,
    '# Do NOT edit by hand. Re-compose by re-running the script.',
    '#',
    '# Per-project keys (NOT composed; maintain in a project header above this section):',
    '#   sonar.projectKey=...',
    '#   sonar.organization=...',
    '#   sonar.javascript.lcov.reportPaths=coverage/lcov.info',
    '',
    'sonar.sources=src',
    '',
  ];
  if (merged.test_inclusions.length) {
    // Cucumber-style features/ goes into sonar.tests directly (it's a separate root).
    const featuresPath = merged.test_inclusions.find((x) => x.startsWith('features/'));
    const sonarTests = featuresPath ? 'src,features' : 'src';
    lines.push(`sonar.tests=${sonarTests}`);
    lines.push(`sonar.test.inclusions=${merged.test_inclusions.join(',')}`);
  }
  if (merged.coverage_exclusions.length) {
    lines.push(`sonar.coverage.exclusions=${merged.coverage_exclusions.join(',')}`);
  }
  if (merged.exclusions.length) {
    lines.push('# Includes framework-vendored dirs (scripts/**, .claude/**) so SonarCloud');
    lines.push('# does not flag copied framework infra as product defects (whole-repo Automatic');
    lines.push('# Analysis ignores sonar.sources). Plus any active capability exclusions.');
    lines.push(`sonar.exclusions=${merged.exclusions.join(',')}`);
  }
  return lines.join('\n') + '\n';
}

// --- CLI -------------------------------------------------------------------
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage:');
  console.error('  node scripts/compose-sonar-properties.mjs <capability> [capability ...]');
  console.error('  node scripts/compose-sonar-properties.mjs --check <expected.properties> <capability> ...');
  process.exit(2);
}

let checkMode = false;
let expectedPath = null;
if (args[0] === '--check') {
  checkMode = true;
  expectedPath = args[1];
  if (!expectedPath || !existsSync(expectedPath)) fail(`--check requires an existing expected file path`);
  args.splice(0, 2);
}

const caps = collectActive(args);
const merged = merge(caps);
const composed = emit(merged, caps.map((c) => c.name));

if (checkMode) {
  const expected = readFileSync(expectedPath, 'utf8');
  // Compare line-by-line ignoring leading comment block.
  const stripComments = (s) => s.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
  if (stripComments(composed) === stripComments(expected)) {
    console.log(`✅ Composed sonar.properties matches ${expectedPath} (modulo comments).`);
    process.exit(0);
  } else {
    console.error(`❌ Composed sonar.properties differs from ${expectedPath}.`);
    console.error('--- composed (without comments) ---');
    console.error(stripComments(composed));
    console.error('--- expected (without comments) ---');
    console.error(stripComments(expected));
    process.exit(1);
  }
} else {
  process.stdout.write(composed);
}
