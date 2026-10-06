// Shared test helper (not a test file): stage the shipped cucumber.mjs template the
// way /setup installs it — cucumber.mjs at the consumer root, importing
// ./scripts/parse-feature-status.mjs beside it — then load it in a child process,
// exactly as cucumber-js would, and report what it produced.
//
// Used by ralph-tooling.test.mjs (FU-50/FU-134/FU-135 config tests) and
// check-skipped-release-scn.test.mjs (lint ⇆ config parity), so a change to how
// the config is loaded is made once.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = join(here, '..', '..', 'templates', 'cucumber.mjs.tmpl');
const PARSER = join(here, '..', 'parse-feature-status.mjs');

// `env` overrides the child's environment. CUCUMBER_IMPLEMENTED_ONLY is cleared
// unless a test sets it: an exported flag in the runner's env must not turn a
// "local" load into a CI one.
export function loadCucumberConfig(dir, env = {}) {
  copyFileSync(TEMPLATE, join(dir, 'cucumber.mjs'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  copyFileSync(PARSER, join(dir, 'scripts', 'parse-feature-status.mjs'));
  const r = spawnSync('node', ['-e', `
    import(${JSON.stringify(pathToFileURL(join(dir, 'cucumber.mjs')).href)})
      .then((m) => console.log(JSON.stringify(m.default.paths)));
  `], { cwd: dir, encoding: 'utf8', env: { ...process.env, CUCUMBER_IMPLEMENTED_ONLY: '', ...env } });
  // A config that throws at load (fail-closed) exits non-zero with no paths.
  return { status: r.status, stderr: r.stderr, paths: r.status === 0 ? JSON.parse(r.stdout.trim()) : null };
}
