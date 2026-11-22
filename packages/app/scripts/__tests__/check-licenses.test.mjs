// Unit tests for the licence check (engineering standards S16.4, ENG-TEST-18): the fixture with a GPL package
// fails naming the package and its licence; allowed licences and recorded exceptions pass.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  ALLOWED_LICENSES,
  LICENSE_EXCEPTIONS,
  checkLicenses,
  collectPackages,
  exceptionFor,
  findViolations,
  isAllowedExpression,
  licenseOf,
  listWorkspaces,
  main,
  parseRoot,
  readManifest,
  resolvePackage,
  tokenize,
} from '../../../../scripts/check-licenses.mjs'

// A throwaway repository root: `files` maps a relative path to a manifest object (written as package.json
// content) or a string.
function makeRepo(files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'licenses-check-')))
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

// The licence fixture: one workspace depending on an MIT package, whose dependency is GPL-3.0.
function gplFixture() {
  return makeRepo({
    'package.json': { name: 'fixture', private: true, workspaces: ['packages/*'] },
    'packages/app/package.json': { name: '@fixture/app', dependencies: { 'left-pad': '1.0.0' } },
    'packages/app/node_modules/left-pad/package.json': {
      name: 'left-pad',
      version: '1.0.0',
      license: 'MIT',
      dependencies: { 'gpl-lib': '2.0.0' },
    },
    'packages/app/node_modules/gpl-lib/package.json': { name: 'gpl-lib', version: '2.0.0', license: 'GPL-3.0-only' },
  })
}

function capture() {
  const out = { log: [], error: [] }
  return { out, sinks: { log: (line) => out.log.push(line), error: (line) => out.error.push(line) } }
}

test('tokenize splits identifiers, operators and parentheses', () => {
  assert.deepEqual(tokenize('(MIT OR Apache-2.0)'), ['(', 'MIT', 'OR', 'Apache-2.0', ')'])
  assert.deepEqual(tokenize('  '), [])
})

test('isAllowedExpression evaluates SPDX expressions against the allowlist', () => {
  assert.equal(isAllowedExpression('MIT'), true)
  assert.equal(isAllowedExpression('GPL-3.0-only'), false)
  assert.equal(isAllowedExpression('(MIT OR GPL-3.0-only)'), true)
  assert.equal(isAllowedExpression('GPL-3.0-only OR MIT'), true)
  assert.equal(isAllowedExpression('MIT AND GPL-3.0-only'), false)
  assert.equal(isAllowedExpression('(MIT AND ISC) OR GPL-2.0'), true)
  assert.equal(isAllowedExpression('Apache-2.0 WITH LLVM-exception'), true)
  assert.equal(isAllowedExpression('Apache-2.0+'), true)
  assert.equal(isAllowedExpression('Zlib', ['Zlib']), true)
})

test('isAllowedExpression rejects text that is not an SPDX expression', () => {
  for (const expression of ['SEE LICENSE IN LICENSE.md', '', '(MIT', 'MIT OR', 'MIT WITH', ')', 'MIT )', 'AND MIT']) {
    assert.equal(isAllowedExpression(expression), false, expression)
  }
})

test('licenseOf reads the license field, its object form and the legacy licenses array', () => {
  assert.equal(licenseOf({ license: ' MIT ' }), 'MIT')
  assert.equal(licenseOf({ license: { type: 'ISC' } }), 'ISC')
  assert.equal(licenseOf({ license: '  ', licenses: ['BSD-2-Clause'] }), 'BSD-2-Clause')
  assert.equal(licenseOf({ license: {}, licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] }), '(MIT OR Apache-2.0)')
  assert.equal(licenseOf({ licenses: [null, {}] }), null)
  assert.equal(licenseOf({ licenses: [] }), null)
  assert.equal(licenseOf({}), null)
})

test('listWorkspaces returns the root and each workspace with a manifest', () => {
  const root = makeRepo({
    'package.json': { name: 'r', workspaces: ['packages/*', 'missing/*', 'tools/cli', 'tools/none'] },
    'packages/b/package.json': { name: 'b' },
    'packages/a/package.json': { name: 'a' },
    'packages/no-manifest/README.md': '',
    'packages/file.txt': '',
    'tools/cli/package.json': { name: 'cli' },
  })
  assert.deepEqual(listWorkspaces(root), [
    root,
    path.join(root, 'packages/a'),
    path.join(root, 'packages/b'),
    path.join(root, 'tools/cli'),
  ])
  const objectForm = makeRepo({
    'package.json': { workspaces: { packages: ['lib'] } },
    'lib/package.json': { name: 'lib' },
  })
  assert.deepEqual(listWorkspaces(objectForm), [objectForm, path.join(objectForm, 'lib')])
  const bare = makeRepo({ 'package.json': {} })
  assert.deepEqual(listWorkspaces(bare), [bare])
})

test('readManifest parses package.json', () => {
  const root = makeRepo({ 'package.json': { name: 'r' } })
  assert.equal(readManifest(root).name, 'r')
})

test('resolvePackage looks in node_modules of the directory, then of each parent', () => {
  const root = makeRepo({
    'node_modules/top/package.json': { name: 'top' },
    'packages/app/node_modules/own/package.json': { name: 'own' },
  })
  const app = path.join(root, 'packages/app')
  assert.equal(resolvePackage('own', app, root), path.join(app, 'node_modules/own'))
  assert.equal(resolvePackage('top', app, root), path.join(root, 'node_modules/top'))
  assert.equal(resolvePackage('absent', app, root), null)
  // A root that is not an ancestor: the lookup stops at the file-system root.
  assert.equal(resolvePackage('licenses-check-absent-package', app, path.join(root, 'elsewhere')), null)
})

test('collectPackages walks production dependencies once per installed copy, skipping workspaces', () => {
  const root = makeRepo({
    'package.json': { workspaces: ['packages/*'], dependencies: { 'root-missing': '1' } },
    'packages/app/package.json': {
      name: '@x/app',
      dependencies: { '@x/core': 'workspace:*', dup: '1', dep: '1', missing: '1' },
      optionalDependencies: { 'optional-missing': '1', 'optional-here': '1' },
      devDependencies: { 'dev-only': '1' },
    },
    'packages/core/package.json': { name: '@x/core', dependencies: { dep: '1' } },
    'packages/app/node_modules/dep/package.json': {
      name: 'dep',
      version: '2.0.0',
      license: 'MIT',
      dependencies: { dup: '1' },
    },
    'packages/app/node_modules/dep/node_modules/dup/package.json': { name: 'dup', version: '1.0.0', license: 'ISC' },
    'packages/app/node_modules/dup/package.json': { name: 'dup', version: '3.0.0', license: 'ISC' },
    'packages/app/node_modules/optional-here/package.json': { version: '1.0.0', license: 'MIT' },
    'packages/app/node_modules/dev-only/package.json': { name: 'dev-only', license: 'GPL-3.0-only' },
    'packages/core/node_modules/dep/package.json': { name: 'dep', version: '2.0.0', license: 'MIT' },
  })
  fs.mkdirSync(path.join(root, 'packages/app/node_modules/@x'))
  fs.symlinkSync(path.join(root, 'packages/core'), path.join(root, 'packages/app/node_modules/@x/core'))
  const { packages, missing } = collectPackages(root)
  assert.deepEqual(
    packages.map(({ name, version, license }) => `${name}@${version}:${license}`),
    [
      'dep@2.0.0:MIT',
      'dep@2.0.0:MIT',
      'dup@1.0.0:ISC',
      'dup@3.0.0:ISC',
      'packages/app/node_modules/optional-here@1.0.0:MIT',
    ],
  )
  assert.deepEqual(missing, [
    { name: 'root-missing', requiredBy: '(repository root)' },
    { name: 'missing', requiredBy: '@x/app' },
  ])
})

test('exceptionFor matches an exact name first, then the longest prefix pattern', () => {
  const exceptions = {
    pkg: { license: 'A', reason: 'exact' },
    '@img/*': { license: 'B', reason: 'short' },
    '@img/sharp-*': { license: 'C', reason: 'long' },
  }
  assert.equal(exceptionFor('pkg', exceptions).reason, 'exact')
  assert.equal(exceptionFor('@img/sharp-libvips-linux-x64', exceptions).reason, 'long')
  assert.equal(exceptionFor('@img/other', exceptions).reason, 'short')
  assert.equal(exceptionFor('pkg-2', exceptions), null)
  assert.equal(exceptionFor('tweetnacl'), LICENSE_EXCEPTIONS.tweetnacl)
  // The commercial enterprise package was removed (ENG-Q-10, #466) and has no exception any more.
  assert.equal(exceptionFor('@open-mercato/enterprise'), null)
})

test('findViolations keeps disallowed licences that are not recorded exceptions with the same licence', () => {
  const packages = [
    { name: 'ok', license: 'MIT' },
    { name: 'gpl', license: 'GPL-3.0-only' },
    { name: 'none', license: null },
    { name: 'excepted', license: 'Unlicense' },
    { name: 'changed', license: 'GPL-3.0-only' },
  ]
  const exceptions = {
    excepted: { license: 'Unlicense', reason: 'public domain' },
    changed: { license: 'MIT-0', reason: 'was MIT-0 when recorded' },
  }
  assert.deepEqual(
    findViolations(packages, { exceptions }).map((pkg) => pkg.name),
    ['gpl', 'none', 'changed'],
  )
  assert.deepEqual(findViolations([{ name: 'x', license: 'Zlib' }], { allowed: ['Zlib'], exceptions: {} }), [])
  assert.deepEqual(
    findViolations([{ name: '@open-mercato/enterprise', license: 'SEE LICENSE IN LICENSE.md' }]).map((pkg) => pkg.name),
    ['@open-mercato/enterprise'],
  )
})

test('every recorded exception has a licence the allowlist rejects and a reason', () => {
  for (const [name, { license, reason }] of Object.entries(LICENSE_EXCEPTIONS)) {
    assert.equal(isAllowedExpression(license, ALLOWED_LICENSES), false, name)
    assert.ok(reason.length > 10, name)
  }
})

test('checkLicenses fails the GPL fixture, naming the package', () => {
  const { packages, violations, missing } = checkLicenses(gplFixture())
  assert.deepEqual(
    packages.map((pkg) => pkg.name),
    ['gpl-lib', 'left-pad'],
  )
  assert.deepEqual(
    violations.map((pkg) => `${pkg.name}:${pkg.license}`),
    ['gpl-lib:GPL-3.0-only'],
  )
  assert.deepEqual(missing, [])
})

test('parseRoot reads --root or falls back to the default', () => {
  assert.equal(parseRoot([], '/repo'), '/repo')
  assert.equal(parseRoot(['--root', 'fixture']), path.resolve('fixture'))
  assert.throws(() => parseRoot(['--root'], '/repo'), /--root needs a directory/)
})

test('main exits 1 on the GPL fixture naming the package and its licence', () => {
  const root = gplFixture()
  const { out, sinks } = capture()
  assert.equal(main(['--root', root], sinks), 1)
  assert.match(out.error[0], /gpl-lib@2\.0\.0 has licence "GPL-3\.0-only", which is not allowed/)
  assert.match(out.error[0], /packages\/app\/node_modules\/gpl-lib/)
  assert.match(out.error.at(-1), /1 package\(s\) with a disallowed licence, 0 missing/)
  assert.deepEqual(out.log, [])
})

test('main reports packages without a licence and missing dependencies', () => {
  const root = makeRepo({
    'package.json': { name: 'r', dependencies: { bare: '1', gone: '1' } },
    'node_modules/bare/package.json': { name: 'bare', version: '1.0.0' },
  })
  const { out, sinks } = capture()
  assert.equal(main(['--root', root], sinks), 1)
  assert.match(out.error[0], /gone \(required by r\) is not installed/)
  assert.match(out.error[1], /bare@1\.0\.0 has licence "none declared"/)
})

test('main exits 0 when every licence is allowed', () => {
  const root = makeRepo({
    'package.json': { name: 'r', dependencies: { fine: '1' } },
    'node_modules/fine/package.json': { name: 'fine', version: '1.0.0', license: '(MIT OR Apache-2.0)' },
  })
  const { out, sinks } = capture()
  assert.equal(main(['--root', root], sinks), 0)
  assert.deepEqual(out.log, ['licenses:check: 1 production packages, every licence allowed.'])
  assert.deepEqual(out.error, [])
})

test('main exits 1 on a bad --root argument', () => {
  const { out, sinks } = capture()
  assert.equal(main(['--root'], sinks), 1)
  assert.deepEqual(out.error, ['licenses:check: --root needs a directory'])
})
