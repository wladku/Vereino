// Unit tests for the forbidden-package guard (ADR-023, ENG-Q-10, #466).
// Fixture sources build the package name from a constant so this file itself never matches the guard.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  FORBIDDEN_PACKAGES,
  checkForbiddenPackages,
  checkLockfile,
  checkManifest,
  checkSource,
  listManifests,
  listSourceFiles,
  main,
  parseRoot,
  referencePattern,
} from '../../../../scripts/check-forbidden-packages.mjs'

const NAME = Object.keys(FORBIDDEN_PACKAGES)[0]
const REASON = FORBIDDEN_PACKAGES[NAME]

// A throwaway repository root holding the given files (relative path -> content).
function makeRepo(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forbidden-packages-'))
  for (const [relativePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true })
    fs.writeFileSync(path.join(root, relativePath), content)
  }
  return root
}

test('the enterprise package is forbidden with its reason', () => {
  assert.equal(NAME, '@open-mercato/enterprise')
  assert.match(REASON, /ADR-023/)
})

test('referencePattern matches imports, requires, dynamic imports and module registrations', () => {
  const pattern = referencePattern(NAME)
  for (const line of [
    `import { defineAgent } from '${NAME}/modules/agent_orchestrator/lib/sdk/defineAgent'`,
    `export * from "${NAME}"`,
    `import '${NAME}/styles.css'`,
    `const mod = await import('${NAME}/x')`,
    `const mod = require(\`${NAME}\`)`,
    `  enabledModules.push({ id: 'sso', from: '${NAME}' })`,
  ]) {
    assert.ok(pattern.test(line), line)
  }
  for (const line of [
    `// ${NAME} is commercial`,
    `'${NAME}': { license: 'x' },`,
    `import x from '${NAME}-free'`,
    `import x from '@open-mercato/core'`,
  ]) {
    assert.ok(!pattern.test(line), line)
  }
})

test('checkManifest names every dependency field that lists a forbidden package', () => {
  assert.deepEqual(checkManifest('package.json', {}), [])
  assert.deepEqual(
    checkManifest('packages/app/package.json', {
      dependencies: { [NAME]: '0.9.0', '@open-mercato/core': '0.9.0' },
      devDependencies: { [NAME]: '0.9.0' },
    }),
    [
      `packages/app/package.json: dependencies lists ${NAME} (${REASON})`,
      `packages/app/package.json: devDependencies lists ${NAME} (${REASON})`,
    ],
  )
})

test('checkLockfile reports the first line resolving a forbidden package', () => {
  assert.deepEqual(checkLockfile('yarn.lock', '"@open-mercato/core@npm:0.9.0":\n  version: 0.9.0\n'), [])
  assert.deepEqual(
    checkLockfile('yarn.lock', `# header\n\n"${NAME}@npm:0.9.0":\n  version: 0.9.0\n"${NAME}@npm:1.0.0":\n`),
    [`yarn.lock:3: resolves ${NAME} (${REASON})`],
  )
  assert.deepEqual(checkLockfile('yarn.lock', `${NAME}@^0.9.0:\n  version: 0.9.0\n`), [
    `yarn.lock:1: resolves ${NAME} (${REASON})`,
  ])
})

test('checkSource names the file and line of each import', () => {
  assert.deepEqual(checkSource('src/a.ts', `import x from '@open-mercato/core'\n`), [])
  assert.deepEqual(checkSource('src/a.ts', `// ok\nimport x from '${NAME}/y'\nrequire('${NAME}')\n`), [
    `src/a.ts:2: imports ${NAME} (${REASON})`,
    `src/a.ts:3: imports ${NAME} (${REASON})`,
  ])
})

test('listSourceFiles walks source extensions only and skips build and dependency folders', () => {
  const root = makeRepo({
    'packages/app/src/a.ts': '',
    'packages/app/src/b/c.tsx': '',
    'packages/app/src/readme.md': '',
    'packages/app/node_modules/x/index.js': '',
    'packages/app/.mercato/generated/x.ts': '',
    'packages/app/.next/x.js': '',
    'scripts/s.mjs': '',
  })
  fs.symlinkSync(path.join(root, 'scripts/s.mjs'), path.join(root, 'packages/app/src/link.ts'))
  assert.deepEqual(listSourceFiles(root, 'packages'), ['packages/app/src/a.ts', 'packages/app/src/b/c.tsx'])
  assert.deepEqual(listSourceFiles(root, 'scripts'), ['scripts/s.mjs'])
  assert.deepEqual(listSourceFiles(root, 'missing'), [])
})

test('listManifests finds the root and workspace manifests that exist', () => {
  const root = makeRepo({ 'packages/b/package.json': '{}', 'packages/a/package.json': '{}', 'packages/c/x.txt': '' })
  fs.writeFileSync(path.join(root, 'packages/file'), '')
  assert.deepEqual(listManifests(root), ['packages/a/package.json', 'packages/b/package.json'])
  fs.writeFileSync(path.join(root, 'package.json'), '{}')
  assert.deepEqual(listManifests(root), ['package.json', 'packages/a/package.json', 'packages/b/package.json'])
  assert.deepEqual(listManifests(makeRepo({ 'package.json': '{}' })), ['package.json'])
})

test('checkForbiddenPackages passes a clean repository and fails a reintroduced package', () => {
  const clean = makeRepo({
    'package.json': '{"workspaces":["packages/*"]}',
    'packages/app/package.json': '{"dependencies":{"@open-mercato/core":"0.9.0"}}',
    'packages/app/src/modules.ts': `enabledModules.push({ id: 'auth', from: '@open-mercato/core' })\n`,
    'yarn.lock': '"@open-mercato/core@npm:0.9.0":\n',
  })
  assert.deepEqual(checkForbiddenPackages(clean), [])
  assert.deepEqual(checkForbiddenPackages(makeRepo({ 'package.json': '{}' })), [])

  const dirty = makeRepo({
    'package.json': '{}',
    'packages/app/package.json': `{"dependencies":{"${NAME}":"0.9.0"}}`,
    'packages/app/src/modules/x/agents.ts': `import { defineAgent } from '${NAME}/modules/agent_orchestrator'\n`,
    'scripts/tool.mjs': `await import('${NAME}')\n`,
    'yarn.lock': `"${NAME}@npm:0.9.0":\n`,
  })
  assert.deepEqual(checkForbiddenPackages(dirty), [
    `packages/app/package.json: dependencies lists ${NAME} (${REASON})`,
    `yarn.lock:1: resolves ${NAME} (${REASON})`,
    `packages/app/src/modules/x/agents.ts:1: imports ${NAME} (${REASON})`,
    `scripts/tool.mjs:1: imports ${NAME} (${REASON})`,
  ])
})

test('parseRoot accepts no arguments or --root <dir>', () => {
  assert.equal(parseRoot([]), process.cwd())
  assert.equal(parseRoot(['--root', 'x']), path.resolve('x'))
  assert.throws(() => parseRoot(['--root']), /Usage/)
})

test('main exits 1 naming the importing file, 0 when nothing references the package', () => {
  const logs = []
  const errors = []
  const io = { log: (line) => logs.push(line), logError: (line) => errors.push(line) }
  const dirty = makeRepo({ 'package.json': '{}', 'packages/app/src/a.ts': `export * from '${NAME}'\n` })
  assert.equal(main({ args: ['--root', dirty], ...io }), 1)
  assert.deepEqual(errors, [`- packages/app/src/a.ts:1: imports ${NAME} (${REASON})`])
  assert.equal(main({ args: ['--root', makeRepo({ 'package.json': '{}' })], ...io }), 0)
  assert.match(logs[0], /No forbidden package/)
})

test('the repository itself neither installs nor imports a forbidden package', () => {
  assert.deepEqual(checkForbiddenPackages(path.resolve(import.meta.dirname, '../../../..')), [])
})
