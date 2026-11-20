// Coverage guard (engineering standards S13.6): `node --test` measures only files a test loads, so this
// test loads every file under the 100 % rule. An untested file then shows up as uncovered and the
// threshold in `yarn test:scripts` fails instead of the file silently escaping the report.
// The files under the rule come from the `--test-coverage-include` globs and `--test-coverage-exclude` paths of the
// `test:scripts` script itself (lesson `coverage-scope-by-convention`): a new tooling script named by those globs is
// covered without editing any list, so two PRs that each add a script no longer conflict here.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { APP_ROOT, REPO_ROOT } from '../vereino-paths.mjs'

const script = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).scripts['test:scripts']
const flags = (name) => [...script.matchAll(new RegExp(`--${name}="([^"]+)"`, 'g'))].map((match) => match[1])
const INCLUDES = flags('test-coverage-include')
const EXCLUDES = flags('test-coverage-exclude')

// The files one pattern (relative to the app, a glob in its last segment only) names.
function filesOf(pattern) {
  const dir = path.resolve(APP_ROOT, path.dirname(pattern))
  return fs.globSync(path.basename(pattern), { cwd: dir }).map((file) => path.join(dir, file))
}

const excluded = new Set(EXCLUDES.flatMap(filesOf))
const covered = [...new Set(INCLUDES.flatMap(filesOf))].filter((file) => !excluded.has(file)).sort()

test('the tooling conventions are the ones of test:scripts', () => {
  assert.deepEqual(INCLUDES, [
    'scripts/vereino-*.mjs',
    'scripts/check-*.mjs',
    '../../scripts/*.mjs',
    '../../eslint.vereino.mjs',
  ])
})

test('every include and every exclude names a file, so no pattern is stale', () => {
  for (const pattern of [...INCLUDES, ...EXCLUDES]) assert.ok(filesOf(pattern).length > 0, `${pattern} names no file`)
})

test('the gate scripts are under the rule', () => {
  for (const file of [
    path.join(REPO_ROOT, 'scripts', 'verify.mjs'),
    path.join(REPO_ROOT, 'scripts', 'setup.mjs'),
    path.join(REPO_ROOT, 'eslint.vereino.mjs'),
    path.join(APP_ROOT, 'scripts', 'vereino-paths.mjs'),
  ]) {
    assert.ok(covered.includes(file), `${file} is not under the 100 % rule`)
  }
})

test('every file under the 100 % rule is loaded by the test run', async () => {
  for (const file of covered) await import(pathToFileURL(file).href)
})
