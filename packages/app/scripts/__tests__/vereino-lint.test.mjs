// ENG-TEST-03 — module boundaries and framework-free lib/ (engineering standards S4.3, S4.9, ADR-018).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import boundaries from 'eslint-plugin-boundaries'
import { vereinoModuleBoundaryConfigs } from '../../../../eslint.vereino.mjs'
import { readVereinoModuleIds, PLATFORM_MODULE_IDS } from '../vereino-paths.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-lint-'))
const originalCwd = process.cwd()

const files = {
  'src/modules/beta/lib/helper.ts':
    'export type Helper = { id: string }\nexport const helper = (): Helper => ({ id: "x" })\n',
  'src/modules/alpha/lib/pure.ts': 'export const double = (value: number): number => value * 2\n',
  'src/modules/alpha/lib/impure.ts':
    'import { createLogger } from "@open-mercato/shared/lib/logger"\nexport const logger = createLogger\n',
  'src/modules/alpha/commands/runtime-cross.ts':
    'import { helper } from "../../beta/lib/helper"\nexport const value = helper()\n',
  'src/modules/alpha/commands/type-cross.ts':
    'import type { Helper } from "../../beta/lib/helper"\nexport const make = (id: string): Helper => ({ id })\n',
  'src/modules/alpha/commands/own.ts': 'import { double } from "../lib/pure"\nexport const four = double(2)\n',
  'src/modules/alpha/commands/alias.ts':
    'import { helper } from "@/modules/beta/lib/helper"\nexport const value = helper\n',
}

let results
before(async () => {
  for (const [relative, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(fixtureRoot, relative)), { recursive: true })
    fs.writeFileSync(path.join(fixtureRoot, relative), source)
  }
  // eslint-plugin-boundaries classifies element paths relative to the process working directory.
  process.chdir(fixtureRoot)
  const eslint = new ESLint({
    cwd: fixtureRoot,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
      ...vereinoModuleBoundaryConfigs({ boundaries, moduleIds: ['alpha', 'beta'] }),
    ],
  })
  const lintResults = await eslint.lintFiles(['src/**/*.ts'])
  results = Object.fromEntries(
    lintResults.map((result) => [
      path.relative(fixtureRoot, result.filePath).split(path.sep).join('/'),
      result.messages.map((message) => message.ruleId),
    ]),
  )
})

after(() => {
  process.chdir(originalCwd)
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
})

test('ENG-TEST-03 a runtime import from another Vereino module fails', () => {
  assert.deepEqual(results['src/modules/alpha/commands/runtime-cross.ts'], ['boundaries/dependencies'])
})

test('ENG-TEST-03 a type-only import from another Vereino module passes', () => {
  assert.deepEqual(results['src/modules/alpha/commands/type-cross.ts'], [])
})

test('ENG-TEST-03 imports inside the own module pass', () => {
  assert.deepEqual(results['src/modules/alpha/commands/own.ts'], [])
  assert.deepEqual(results['src/modules/alpha/lib/pure.ts'], [])
})

test('ENG-TEST-03 a platform import inside lib/ fails', () => {
  assert.deepEqual(results['src/modules/alpha/lib/impure.ts'], ['no-restricted-imports'])
})

test('ENG-TEST-03 the @/modules alias inside a Vereino module fails', () => {
  assert.ok(results['src/modules/alpha/commands/alias.ts'].includes('no-restricted-imports'))
})

test('vereino-modules.json lists no platform scaffold module', () => {
  const ids = readVereinoModuleIds()
  for (const id of PLATFORM_MODULE_IDS) assert.ok(!ids.includes(id), `${id} must not be listed`)
})
