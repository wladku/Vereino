// `di-commands:check`: no module's di.ts reaches a file that registers commands (lesson `di-reaches-no-command-file`).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  checkDiCommands,
  commandFilesReachedFrom,
  registersCommands,
  resolveImport,
  runCli,
  runtimeSpecifiers,
} from '../vereino-di-commands.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-di-commands-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

// An app root with the given files under src/ ({ 'modules/x/di.ts': source }).
function writeApp(name, files) {
  const appRoot = path.join(fixtureRoot, name)
  for (const [file, source] of Object.entries(files)) {
    const full = path.join(appRoot, 'src', file)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, source)
  }
  return appRoot
}

const COMMAND =
  "import { registerCommand } from '@open-mercato/shared/lib/commands'\nregisterCommand({ id: 'x.create' })\nexport const helper = 1\n"

test('runtimeSpecifiers keeps runtime imports and re-exports, drops type-only ones', () => {
  const source = [
    "import fs from 'node:fs'",
    "import { a, type B } from './a'",
    "import { type C, type D } from './types'",
    "import type { E } from './e'",
    "export { f } from './f'",
    "export type { G } from './g'",
    "import './side-effect'",
    "import {} from './empty'",
  ].join('\n')
  assert.deepEqual(runtimeSpecifiers(source), ['node:fs', './a', './f', './side-effect'])
})

test('resolveImport follows relative and @/ imports to existing files only', () => {
  const appRoot = writeApp('resolve', {
    'modules/x/di.ts': '',
    'modules/x/lib/a.ts': '',
    'modules/x/view.tsx': '',
    'modules/foundation/index.ts': '',
  })
  const src = path.join(appRoot, 'src')
  const di = path.join(src, 'modules/x/di.ts')
  assert.equal(resolveImport(src, di, './lib/a'), path.join(src, 'modules/x/lib/a.ts'))
  assert.equal(resolveImport(src, di, './view'), path.join(src, 'modules/x/view.tsx'))
  assert.equal(resolveImport(src, di, '@/modules/foundation'), path.join(src, 'modules/foundation/index.ts'))
  assert.equal(resolveImport(src, di, './missing'), null)
  assert.equal(resolveImport(src, di, '@open-mercato/shared/lib/commands'), null)
})

test('registersCommands needs both a commands/ path and a registerCommand call', () => {
  assert.equal(registersCommands('/m/x/commands/a.ts', COMMAND), true)
  assert.equal(registersCommands('/m/x/commands/shared.ts', 'export const a = 1'), false)
  assert.equal(registersCommands('/m/x/lib/a.ts', COMMAND), false)
})

test('commandFilesReachedFrom returns each reachable command file with its chain, once', () => {
  const appRoot = writeApp('reach', {
    'modules/x/di.ts': "import { s } from './services/s'\nimport { t } from './services/t'\n",
    'modules/x/services/s.ts': "import { helper } from '../commands/a'\nimport { t } from './t'\n",
    'modules/x/services/t.ts': "import type { H } from '../commands/b'\nimport { u } from '../commands/shared'\n",
    'modules/x/commands/a.ts': COMMAND,
    'modules/x/commands/b.ts': COMMAND,
    'modules/x/commands/shared.ts': 'export const u = 1',
  })
  const src = path.join(appRoot, 'src')
  const chains = commandFilesReachedFrom(src, path.join(src, 'modules/x/di.ts'))
  assert.deepEqual(
    chains.map((chain) => chain.map((file) => path.relative(src, file).split(path.sep).join('/'))),
    [['modules/x/di.ts', 'modules/x/services/s.ts', 'modules/x/commands/a.ts']],
  )
})

test('checkDiCommands reports a di.ts that reaches a command file and skips modules without one', () => {
  const appRoot = writeApp('check', {
    'modules/bad/di.ts': "export { helper } from './commands/a'\n",
    'modules/bad/commands/a.ts': COMMAND,
    'modules/good/di.ts': "import { x } from './lib/x'\n",
    'modules/good/lib/x.ts': 'export const x = 1',
  })
  const result = checkDiCommands({ appRoot, moduleIds: ['bad', 'good', 'no_di'] })
  assert.equal(result.checked, 2)
  assert.deepEqual(result.errors, [
    'src/modules/bad/commands/a.ts registers commands and is reached from src/modules/bad/di.ts: src/modules/bad/di.ts -> src/modules/bad/commands/a.ts; take the helper from lib/ or data/ instead',
  ])
})

test('runCli prints each problem and returns the exit code', () => {
  const lines = []
  const problems = []
  const io = { log: (line) => lines.push(line), error: (line) => problems.push(line) }
  const clean = writeApp('cli-clean', { 'modules/foundation/di.ts': '' })
  fs.writeFileSync(path.join(clean, 'vereino-modules.json'), JSON.stringify({ modules: ['foundation'] }))
  assert.equal(runCli({ appRoot: clean, ...io }), 0)
  const dirty = writeApp('cli-dirty', {
    'modules/foundation/di.ts': "import { helper } from './commands/a'\n",
    'modules/foundation/commands/a.ts': COMMAND,
  })
  fs.writeFileSync(path.join(dirty, 'vereino-modules.json'), JSON.stringify({ modules: ['foundation'] }))
  assert.equal(runCli({ appRoot: dirty, ...io }), 1)
  assert.deepEqual(lines, [
    'di-commands:check: 1 di.ts file(s), 0 problem(s)',
    'di-commands:check: 1 di.ts file(s), 1 problem(s)',
  ])
  assert.equal(problems.length, 1)
})

test('runCli defaults to the console', (t) => {
  const log = t.mock.method(console, 'log', () => {})
  const error = t.mock.method(console, 'error', () => {})
  const appRoot = writeApp('cli-console', {
    'modules/foundation/di.ts': "import { helper } from './commands/a'\n",
    'modules/foundation/commands/a.ts': COMMAND,
  })
  fs.writeFileSync(path.join(appRoot, 'vereino-modules.json'), JSON.stringify({ modules: ['foundation'] }))
  runCli({ appRoot })
  assert.equal(log.mock.callCount(), 1)
  assert.equal(error.mock.callCount(), 1)
})

test('the real modules pass', () => {
  assert.deepEqual(checkDiCommands().errors, [])
})
