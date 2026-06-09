#!/usr/bin/env node
// scripts/sonar-sweep.mjs — [consumer-runtime] post-PR Sonar read-out
// (FOLLOW-UP 65).
//
// The Day Shift's per-PR routine (read the Quality Gate, list open issues
// with rule/file/line, locate duplication per file after a push) was pure
// API mechanics hand-curled 5+ times across two campaigns — including one
// silent all-zeros read from the wrong measures key that cost a
// re-diagnosis. This is the standard read-out tool, NOT a merge gate:
// post-PR analyzer findings are HUMAN CHECKPOINT 2-owned (core/13).
//
// Usage:
//   node scripts/sonar-sweep.mjs <pr-number>            # QG + open issues
//   node scripts/sonar-sweep.mjs <pr-number> --files    # + per-file new
//                                                       #   duplicated lines
//                                                       #   (the clone locator)
// Env:
//   SONARQ_TOKEN     required (the consumer's .env already carries it)
//   SONAR_API_BASE   default https://sonarcloud.io (override for tests /
//                    self-hosted SonarQube)
//
// projectKey is read from sonar-project.properties / .sonarcloud.properties.
// Exit 1 on Quality Gate ERROR (pipeable into the train guard, FU-60);
// exit 0 otherwise. Zero deps (global fetch, node ≥18).

import { readFileSync, existsSync } from 'node:fs';

const pr = process.argv[2];
const filesMode = process.argv.includes('--files');
if (!pr || !/^\d+$/.test(pr)) {
  console.error('Usage: node scripts/sonar-sweep.mjs <pr-number> [--files]');
  process.exit(2);
}
const token = process.env.SONARQ_TOKEN;
if (!token) {
  console.error('❌ SONARQ_TOKEN is not set (the consumer .env should carry it).');
  process.exit(2);
}
const base = (process.env.SONAR_API_BASE || 'https://sonarcloud.io').replace(/\/$/, '');

let projectKey = null;
for (const f of ['sonar-project.properties', '.sonarcloud.properties']) {
  if (!existsSync(f)) continue;
  const m = readFileSync(f, 'utf8').match(/^sonar\.projectKey\s*=\s*(.+)$/m);
  if (m) { projectKey = m[1].trim(); break; }
}
if (!projectKey) {
  console.error('❌ sonar.projectKey not found in sonar-project.properties / .sonarcloud.properties.');
  process.exit(2);
}

async function api(path, params) {
  // Test hook (same pattern as RALPH_WATCH_REPLAY): SONAR_API_FIXTURE_DIR
  // serves responses from <dir>/<path with '/'→'_'>.json — node:test runs
  // sandboxed where localhost sockets hang, and the unit under test is the
  // parsing/exit logic, not HTTP.
  if (process.env.SONAR_API_FIXTURE_DIR) {
    const f = `${process.env.SONAR_API_FIXTURE_DIR}/${path.replace(/\//g, '_')}.json`;
    return JSON.parse(readFileSync(f, 'utf8'));
  }
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// The documented pitfall: new-code measures arrive as `period.value` OR
// `periods[0].value` depending on API/server version — one live sweep read
// all-zeros from the wrong key and cost a re-diagnosis. Read both.
const newCodeValue = (measure) =>
  measure?.period?.value ?? measure?.periods?.[0]?.value ?? measure?.value ?? null;

try {
  // (a) Quality Gate + failing conditions
  const qg = await api('/api/qualitygates/project_status', { projectKey, pullRequest: pr });
  const status = qg.projectStatus?.status ?? 'UNKNOWN';
  console.log(`Quality Gate (PR #${pr}): ${status === 'OK' ? '✅ OK' : `❌ ${status}`}`);
  for (const c of qg.projectStatus?.conditions ?? []) {
    if (c.status === 'OK') continue;
    console.log(`  ❌ ${c.metricKey}: ${c.actualValue} (required ${c.comparator === 'GT' ? '≤' : '≥'} ${c.errorThreshold})`);
  }

  // (b) open issues with rule/file:line/message
  const issues = await api('/api/issues/search', {
    componentKeys: projectKey, pullRequest: pr, resolved: 'false', ps: '100',
  });
  const list = issues.issues ?? [];
  console.log(`\nOpen issues: ${list.length}`);
  for (const i of list) {
    const file = (i.component || '').split(':').pop();
    console.log(`  [${i.severity}] ${i.rule} ${file}:${i.line ?? '?'} — ${i.message}`);
  }

  // (c) --files: per-file new duplicated lines (the clone locator that
  //     found Sonar's exact blocks twice, live)
  if (filesMode) {
    const tree = await api('/api/measures/component_tree', {
      component: projectKey, pullRequest: pr,
      metricKeys: 'new_duplicated_lines', qualifiers: 'FIL', ps: '500',
    });
    console.log('\nNew duplicated lines per file:');
    let any = false;
    for (const comp of tree.components ?? []) {
      const v = Number(newCodeValue((comp.measures ?? [])[0]) ?? 0);
      if (v > 0) { any = true; console.log(`  ${v}\t${comp.path ?? comp.key}`); }
    }
    if (!any) console.log('  (none)');
  }

  process.exit(status === 'ERROR' ? 1 : 0);
} catch (e) {
  console.error(`❌ sonar-sweep failed: ${e.message}`);
  process.exit(2);
}
