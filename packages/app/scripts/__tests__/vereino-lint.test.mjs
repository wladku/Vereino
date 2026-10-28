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
  // TEST-F14 (foundation spec REQ-F16): the ORM only in the persistence layers; foundation helpers by their public entry.
  'src/modules/foundation/index.ts': 'export const helper = (): number => 1\n',
  'src/modules/foundation/services/internal.ts': 'export const internal = (): number => 2\n',
  'src/modules/alpha/api/things/route.ts':
    'import { LockMode } from "@mikro-orm/core"\nexport const mode = LockMode.NONE\n',
  'src/modules/alpha/api/things/typed-route.ts':
    'import type { EntityManager } from "@mikro-orm/postgresql"\nexport type Em = EntityManager\n',
  'src/modules/alpha/subscribers/orm.ts':
    'import { LockMode } from "@mikro-orm/core"\nexport const mode = LockMode.NONE\n',
  'src/modules/alpha/commands/orm.ts':
    'import { LockMode } from "@mikro-orm/core"\nexport const mode = LockMode.NONE\n',
  'src/modules/alpha/services/orm.ts':
    'import { LockMode } from "@mikro-orm/core"\nexport const mode = LockMode.NONE\n',
  'src/modules/alpha/data/entities.ts':
    'import { LockMode } from "@mikro-orm/core"\nexport const mode = LockMode.NONE\n',
  'src/modules/alpha/setup.ts': 'import { LockMode } from "@mikro-orm/core"\nexport const mode = LockMode.NONE\n',
  'src/modules/alpha/commands/foundation-public.ts':
    'import { helper } from "../../foundation/index"\nexport const value = helper()\n',
  'src/modules/alpha/commands/foundation-alias.ts':
    'import { helper } from "@/modules/foundation"\nexport const value = helper\n',
  'src/modules/alpha/commands/foundation-internal.ts':
    'import { internal } from "../../foundation/services/internal"\nexport const value = internal()\n',
  'src/modules/alpha/commands/foundation-deep-alias.ts':
    'import { internal } from "@/modules/foundation/services/internal"\nexport const value = internal\n',
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
      ...vereinoModuleBoundaryConfigs({ boundaries, moduleIds: ['alpha', 'beta', 'foundation'] }),
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

test('TEST-F14 a route handler importing @mikro-orm/* is reported, also as a type import', () => {
  assert.deepEqual(results['src/modules/alpha/api/things/route.ts'], ['no-restricted-imports'])
  assert.deepEqual(results['src/modules/alpha/api/things/typed-route.ts'], ['no-restricted-imports'])
  assert.deepEqual(results['src/modules/alpha/subscribers/orm.ts'], ['no-restricted-imports'])
})

test('TEST-F14 a command, a services/ file, data/entities.ts and setup.ts may import @mikro-orm/*', () => {
  assert.deepEqual(results['src/modules/alpha/commands/orm.ts'], [])
  assert.deepEqual(results['src/modules/alpha/services/orm.ts'], [])
  assert.deepEqual(results['src/modules/alpha/data/entities.ts'], [])
  assert.deepEqual(results['src/modules/alpha/setup.ts'], [])
})

test('TEST-F14 the foundation public entry may be imported by value; its internals may not', () => {
  assert.deepEqual(results['src/modules/alpha/commands/foundation-public.ts'], [])
  assert.deepEqual(results['src/modules/alpha/commands/foundation-alias.ts'], [])
  assert.deepEqual(results['src/modules/alpha/commands/foundation-internal.ts'], ['boundaries/dependencies'])
  assert.ok(results['src/modules/alpha/commands/foundation-deep-alias.ts'].includes('no-restricted-imports'))
})

test('vereino-modules.json lists no platform scaffold module', () => {
  const ids = readVereinoModuleIds()
  for (const id of PLATFORM_MODULE_IDS) assert.ok(!ids.includes(id), `${id} must not be listed`)
})
