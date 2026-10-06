// Regenerates gherkin-oracle.json — what the REAL Gherkin parser
// (@cucumber/gherkin, the one cucumber-js runs) sees in each fixture of
// feature-status-fixtures.mjs:
//   - statusComments: the lines it parses as `# status:` comments (docstring
//     content and description text are not comments; a comment trailing a tag
//     line is dropped);
//   - release: per @scn tag, whether a `--tags @release` run selects it (pickle
//     tags carry Feature / Rule / Examples tags).
// check-skipped-release-scn.test.mjs compares the zero-dependency reader with
// this golden, so a scanner change that diverges from cucumber's own parser fails
// in CI without installing it there.
//
// Run after changing a fixture (needs @cucumber/gherkin + @cucumber/messages,
// e.g. a scratch `npm i @cucumber/cucumber`):
//   node scripts/__tests__/fixtures/gen-gherkin-oracle.mjs <node_modules dir>

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PARITY, INDEX } from './feature-status-fixtures.mjs';

const nm = process.argv[2];
if (!nm) { console.error('usage: node gen-gherkin-oracle.mjs <node_modules dir>'); process.exit(2); }
const require = createRequire(join(resolve(nm), 'noop.js'));
const { generateMessages } = require('@cucumber/gherkin');
const { IdGenerator, SourceMediaType } = require('@cucumber/messages');
const KEY = /^\s*#+\s*status\s*:/i;

function oracle({ body, eol = '\n' }) {
  const text = body.join(eol) + eol;
  const out = { statusComments: [], release: {} };
  const envs = generateMessages(text, 'f.feature', SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
    { includeGherkinDocument: true, includePickles: true, includeSource: false, newId: IdGenerator.incrementing() });
  for (const e of envs) {
    if (e.parseError) out.parseError = e.parseError.message;
    if (e.gherkinDocument) out.statusComments = e.gherkinDocument.comments.filter((c) => KEY.test(c.text)).map((c) => c.location.line);
    if (e.pickle) {
      const tags = e.pickle.tags.map((t) => t.name);
      for (const t of tags) {
        const m = t.match(/^@scn-(\d+)$/);
        if (m) out.release[`scn-${m[1]}`] = (out.release[`scn-${m[1]}`] ?? false) || tags.includes('@release');
      }
    }
  }
  return out;
}

const golden = {
  parser: `@cucumber/gherkin ${require('@cucumber/gherkin/package.json').version}`,
  parity: Object.fromEntries(PARITY.map((fx) => [fx.name, oracle(fx)])),
  index: Object.fromEntries(INDEX.map((fx) => [fx.name, oracle(fx)])),
};
const target = join(dirname(fileURLToPath(import.meta.url)), 'gherkin-oracle.json');
writeFileSync(target, JSON.stringify(golden, null, 2) + '\n');
console.log(`wrote ${target} (${Object.keys(golden.parity).length} parity + ${Object.keys(golden.index).length} index fixtures, ${golden.parser})`);
