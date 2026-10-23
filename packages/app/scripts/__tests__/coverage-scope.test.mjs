// Coverage guard (engineering standards S13.6): `node --test` measures only files a test loads, so this
// test loads every file under the 100 % rule. An untested file then shows up as uncovered and the
// threshold in `yarn test:scripts` fails instead of the file silently escaping the report.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { APP_ROOT, REPO_ROOT } from '../vereino-paths.mjs'

// Must match the --test-coverage-include globs of the test:scripts script in packages/app/package.json.
const COVERED_GLOBS = [
  { cwd: APP_ROOT, glob: 'scripts/vereino-*.mjs' },
  { cwd: APP_ROOT, glob: 'scripts/check-vereino-contracts.mjs' },
  { cwd: REPO_ROOT, glob: 'scripts/verify.mjs' },
  { cwd: REPO_ROOT, glob: 'scripts/setup.mjs' },
  { cwd: REPO_ROOT, glob: 'eslint.vereino.mjs' },
]

test('every file under the 100 % rule is loaded by the test run', async () => {
  const files = COVERED_GLOBS.flatMap(({ cwd, glob }) => fs.globSync(glob, { cwd }).map((file) => path.join(cwd, file)))
  assert.ok(files.length >= 5, `expected the tooling files, found ${String(files.length)}`)
  for (const file of files) await import(pathToFileURL(file).href)
})

test('the coverage globs match the test:scripts script', () => {
  const script = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).scripts['test:scripts']
  const includes = [...script.matchAll(/--test-coverage-include="([^"]+)"/g)].map((match) => match[1])
  assert.deepEqual(includes, [
    'scripts/vereino-*.mjs',
    'scripts/check-vereino-contracts.mjs',
    '../../scripts/verify.mjs',
    '../../scripts/setup.mjs',
    '../../eslint.vereino.mjs',
  ])
})
