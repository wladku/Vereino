// Coverage guard (engineering standards S13.6): `node --test` measures only files a test loads, so this
// test loads every source file of the package. An untested file then shows up as uncovered and the
// 100 % threshold of `yarn test` fails instead of the file silently escaping the report.
// Files that Node cannot load with type stripping (.tsx, decorators) need Jest tests in packages/app.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('every source file of the package is loaded by the test run', async () => {
  const files = fs
    .globSync('**/*.ts', { cwd: SRC })
    .filter((file) => !file.split(path.sep).includes('__tests__') && !file.endsWith('.d.ts'))
  assert.ok(files.includes('index.ts'))
  for (const file of files) await import(pathToFileURL(path.join(SRC, file)).href)
})
