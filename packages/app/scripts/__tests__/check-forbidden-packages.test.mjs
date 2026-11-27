// Unit tests for the forbidden-package guard (ADR-023, ENG-Q-10, #466) and its Enterprise rule (DD-E10,
// ENT-TEST-04 of the enterprise package spec).
// Fixture sources build the package names from constants so this file itself never matches the guard.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  ENTERPRISE_PACKAGE,
  ENTERPRISE_REASON,
  ENTERPRISE_SKIPPED_PATHS,
  ENTERPRISE_SWITCH_END,
  ENTERPRISE_SWITCH_FILES,
  ENTERPRISE_SWITCH_START,
  FORBIDDEN_PACKAGES,
  checkEnterpriseLockfile,
  checkEnterpriseManifest,
  checkEnterpriseSource,
  checkForbiddenPackages,
  checkLockfile,
  checkManifest,
  checkSource,
  listManifests,
  listSourceFiles,
  main,
  parseArgs,
  referencePattern,
} from '../../../../scripts/check-forbidden-packages.mjs'

const NAME = Object.keys(FORBIDDEN_PACKAGES)[0]
const REASON = FORBIDDEN_PACKAGES[NAME]
const ENT = ENTERPRISE_PACKAGE
const ENT_REASON = ENTERPRISE_REASON
const START = ENTERPRISE_SWITCH_START
const END = ENTERPRISE_SWITCH_END
const MODULES = 'packages/app/src/modules.ts'

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

test('parseArgs accepts --root <dir> and --overlay in any order', () => {
  assert.deepEqual(parseArgs([]), { rootDir: process.cwd(), overlay: false })
  assert.deepEqual(parseArgs(['--root', 'x']), { rootDir: path.resolve('x'), overlay: false })
  assert.deepEqual(parseArgs(['--overlay']), { rootDir: process.cwd(), overlay: true })
  assert.deepEqual(parseArgs(['--overlay', '--root', 'x']), { rootDir: path.resolve('x'), overlay: true })
  assert.deepEqual(parseArgs(['--root', 'x', '--overlay']), { rootDir: path.resolve('x'), overlay: true })
  assert.throws(() => parseArgs(['--root']), /Usage/)
  assert.throws(() => parseArgs(['--overlay', '--root']), /Usage/)
  assert.throws(() => parseArgs(['--other']), /Usage/)
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
  assert.equal(logs[1], `No public file references ${ENT} outside an enterprise switch`)
})

// DD-E10: the second rule keeps the private Enterprise package out of every public file.
test('the Enterprise rule names the package, its switch files, markers and skipped folders', () => {
  assert.equal(ENT, '@vereino/enterprise')
  assert.match(ENT_REASON, /DD-E10/)
  assert.deepEqual(ENTERPRISE_SWITCH_FILES, [MODULES, 'packages/app/next.config.ts'])
  assert.equal(START, '// enterprise-switch:start')
  assert.equal(END, '// enterprise-switch:end')
  assert.deepEqual(ENTERPRISE_SKIPPED_PATHS, [
    'packages/enterprise/',
    'packages/app/.ai/qa/fixtures/enterprise-overlay/',
  ])
  assert.ok(referencePattern(ENT).test(`import x from '${ENT}/modules/demo'`))
  assert.ok(!referencePattern(ENT).test(`import x from '${ENT}-tools'`))
})

test('checkEnterpriseSource fails a public file importing the package, naming the file and line', () => {
  assert.deepEqual(checkEnterpriseSource('packages/app/src/a.ts', `import x from '@vereino/core'\n`), [])
  assert.deepEqual(
    checkEnterpriseSource(
      'packages/app/src/a.ts',
      `// ${START}\nimport x from '${ENT}'\n// ${END}\nrequire('${ENT}/y')\n`,
    ),
    [
      `packages/app/src/a.ts:2: imports ${ENT} (${ENT_REASON})`,
      `packages/app/src/a.ts:4: imports ${ENT} (${ENT_REASON})`,
    ],
  )
})

test('checkEnterpriseSource accepts a modules.ts or next.config.ts line inside the markers and fails one outside', () => {
  const inside = [
    `import { x } from '@open-mercato/core'`,
    `  ${START}`,
    `  enabledModules.push({ id: 'enterprise_demo', from: '${ENT}' })`,
    `  const extra = await import('${ENT}/modules')`,
    `  ${END}`,
    '',
  ].join('\n')
  assert.deepEqual(checkEnterpriseSource(MODULES, inside), [])
  assert.deepEqual(checkEnterpriseSource('packages/app/next.config.ts', inside), [])
  const outside = `${START}\n${END}\nenabledModules.push({ id: 'enterprise_demo', from: '${ENT}' })\n`
  assert.deepEqual(checkEnterpriseSource(MODULES, outside), [
    `${MODULES}:3: imports ${ENT} outside an enterprise switch (${ENT_REASON})`,
  ])
  // The marker lines themselves are outside the switch.
  assert.deepEqual(checkEnterpriseSource(MODULES, `import '${ENT}' ${START}\n${END} import '${ENT}'\n`), [
    `${MODULES}:1: imports ${ENT} outside an enterprise switch (${ENT_REASON})`,
    `${MODULES}:2: imports ${ENT} outside an enterprise switch (${ENT_REASON})`,
  ])
})

test('checkEnterpriseSource fails an unclosed, nested or stray marker in a switch file', () => {
  assert.deepEqual(checkEnterpriseSource(MODULES, `// x\n${START}\nimport '${ENT}'\n`), [
    `${MODULES}:2: ${START} is never closed`,
  ])
  assert.deepEqual(checkEnterpriseSource(MODULES, `${END}\n`), [`${MODULES}:1: ${END} without a matching start`])
  assert.deepEqual(checkEnterpriseSource(MODULES, `${START}\n${START}\n${END}\n`), [
    `${MODULES}:2: ${START} inside the switch opened on line 1`,
  ])
  // Markers mean nothing outside the switch files.
  assert.deepEqual(checkEnterpriseSource('packages/app/src/a.ts', `${START}\n${END}\n${END}\n`), [])
})

test('checkEnterpriseSource skips the overlaid package and its public fixture', () => {
  const source = `import x from '${ENT}'\n`
  assert.deepEqual(checkEnterpriseSource('packages/enterprise/src/modules/demo/index.ts', source), [])
  assert.deepEqual(
    checkEnterpriseSource('packages/app/.ai/qa/fixtures/enterprise-overlay/src/modules/demo/index.ts', source),
    [],
  )
  assert.equal(checkEnterpriseSource('packages/enterprise-tools/a.ts', source).length, 1)
})

test('checkEnterpriseManifest accepts the app dependency only with --overlay and skips the package manifest', () => {
  const app = { dependencies: { [ENT]: 'workspace:*', '@vereino/core': 'workspace:*' } }
  assert.deepEqual(checkEnterpriseManifest('packages/app/package.json', app), [
    `packages/app/package.json: dependencies lists ${ENT} (${ENT_REASON})`,
  ])
  assert.deepEqual(checkEnterpriseManifest('packages/app/package.json', app, { overlay: true }), [])
  assert.deepEqual(
    checkEnterpriseManifest(
      'packages/app/package.json',
      { devDependencies: { [ENT]: 'workspace:*' } },
      { overlay: true },
    ),
    [`packages/app/package.json: devDependencies lists ${ENT} (${ENT_REASON})`],
  )
  assert.deepEqual(checkEnterpriseManifest('packages/ui/package.json', app, { overlay: true }), [
    `packages/ui/package.json: dependencies lists ${ENT} (${ENT_REASON})`,
  ])
  assert.deepEqual(checkEnterpriseManifest('package.json', {}), [])
  assert.deepEqual(
    checkEnterpriseManifest('packages/enterprise/package.json', { name: ENT, dependencies: { [ENT]: '*' } }),
    [],
  )
})

test('checkEnterpriseLockfile accepts the workspace stanza and app line only with --overlay', () => {
  const overlayLock = [
    '# header',
    '',
    '"@vereino/app@workspace:packages/app":',
    '  version: 0.0.0-use.local',
    '  dependencies:',
    `    "${ENT}": "workspace:*"`,
    '',
    `"${ENT}@workspace:*, ${ENT}@workspace:packages/enterprise":`,
    '  version: 0.0.0-use.local',
    `  resolution: "${ENT}@workspace:packages/enterprise"`,
    '',
  ].join('\n')
  assert.deepEqual(checkEnterpriseLockfile('yarn.lock', overlayLock, { overlay: true }), [])
  assert.deepEqual(checkEnterpriseLockfile('yarn.lock', overlayLock), [
    `yarn.lock:6: depends on ${ENT} (${ENT_REASON})`,
    `yarn.lock:8: resolves ${ENT} (${ENT_REASON})`,
  ])
  const strayLock = [
    '"@vereino/ui@workspace:packages/ui":',
    '  dependencies:',
    `    ${ENT}: "workspace:*"`,
    `"${ENT}@npm:1.0.0":`,
    `"${ENT}@workspace:*, ${ENT}@npm:1.0.0":`,
    '"@vereino/core@workspace:packages/core":',
  ].join('\n')
  assert.deepEqual(checkEnterpriseLockfile('yarn.lock', strayLock, { overlay: true }), [
    `yarn.lock:3: depends on ${ENT} (${ENT_REASON})`,
    `yarn.lock:4: resolves ${ENT} (${ENT_REASON})`,
    `yarn.lock:5: resolves ${ENT} (${ENT_REASON})`,
  ])
  assert.deepEqual(checkEnterpriseLockfile('yarn.lock', '"@vereino/core@workspace:packages/core":\n'), [])
})

// ENT-TEST-04: a fixture overlay tree passes with --overlay and fails without it; a public import fails always.
test('checkForbiddenPackages and main check an overlay tree with and without --overlay', () => {
  const overlay = makeRepo({
    'package.json': '{"workspaces":["packages/*"]}',
    'packages/app/package.json': `{"dependencies":{"${ENT}":"workspace:*"}}`,
    'packages/enterprise/package.json': `{"name":"${ENT}","dependencies":{"@vereino/core":"workspace:*"}}`,
    'packages/enterprise/src/index.ts': `export * from '${ENT}/modules'\n`,
    'packages/app/.ai/qa/fixtures/enterprise-overlay/src/index.ts': `export * from '${ENT}/modules'\n`,
    [MODULES]: `${START}\nenabledModules.push({ id: 'enterprise_demo', from: '${ENT}' })\n${END}\n`,
    'packages/app/next.config.ts': `${START}\nconst pkgs = [require.resolve('${ENT}')]\n${END}\n`,
    'yarn.lock': `"@vereino/app@workspace:packages/app":\n  dependencies:\n    "${ENT}": "workspace:*"\n"${ENT}@workspace:packages/enterprise":\n`,
  })
  assert.deepEqual(checkForbiddenPackages(overlay, FORBIDDEN_PACKAGES, { overlay: true }), [])
  assert.deepEqual(checkForbiddenPackages(overlay), [
    `packages/app/package.json: dependencies lists ${ENT} (${ENT_REASON})`,
    `yarn.lock:3: depends on ${ENT} (${ENT_REASON})`,
    `yarn.lock:4: resolves ${ENT} (${ENT_REASON})`,
  ])

  const logs = []
  const errors = []
  const io = { log: (line) => logs.push(line), logError: (line) => errors.push(line) }
  assert.equal(main({ args: ['--overlay', '--root', overlay], ...io }), 0)
  assert.match(logs[1], /overlay build/)
  fs.writeFileSync(path.join(overlay, 'packages/app/src/page.tsx'), `import x from '${ENT}'\n`)
  assert.equal(main({ args: ['--root', overlay, '--overlay'], ...io }), 1)
  assert.deepEqual(errors, [`- packages/app/src/page.tsx:1: imports ${ENT} (${ENT_REASON})`])
})

test('the repository itself neither installs nor imports a forbidden package', () => {
  assert.deepEqual(checkForbiddenPackages(path.resolve(import.meta.dirname, '../../../..')), [])
})
