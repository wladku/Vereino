#!/usr/bin/env node
// Licence check (engineering standards S16.4, ENG-12). Lists the licence of every installed production
// dependency of every workspace and fails when one is outside the allowlist (S16.1), unless the package is
// a recorded exception with a reason. It runs in the weekly security workflow (`.github/workflows/security.yml`),
// not in the gate.
//
// No new dependency: the check walks the installed `node_modules` trees (nodeLinker `node-modules`,
// `nmHoistingLimits: workspaces`) starting from each workspace's `dependencies` and `optionalDependencies`,
// following the same lookup Node uses (the package's own `node_modules`, then each parent directory's).
// Development dependencies are not shipped, so they are not checked.
//
// Usage: node scripts/check-licenses.mjs [--root <repo-root>]
// Exit 0 when every package is allowed, 1 naming each package and its licence otherwise.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// S16.1: MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, BlueOak-1.0.0; MPL-2.0 for unmodified use.
export const ALLOWED_LICENSES = [
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'CC0-1.0',
  'BlueOak-1.0.0',
  'MPL-2.0',
]

// Packages allowed despite their licence (S16.4), each with the licence it declared when the exception was
// recorded and the reason. The exception holds only while the package still declares that licence, so a
// licence change fails the check again. A name ending in `*` matches every package with that prefix (the
// platform variants of one native binary); a name matches every version. Adding an entry needs product-owner
// approval (S16.1, `AGENTS.md` -> Ask First); the review of the pull request that adds it records it.
export const LICENSE_EXCEPTIONS = {
  '@newrelic/security-agent': {
    license: 'New Relic Software License v1.0',
    reason: 'Proprietary; a dependency of `newrelic` (Apache-2.0), which the platform scaffold lists in'
      + ' packages/app. Loaded only when the New Relic agent is configured. ENG-Q-10 (#466) removed only'
      + ' @open-mercato/enterprise; removing `newrelic` needs its own owner decision.',
  },
  '@img/sharp-libvips-*': {
    license: 'LGPL-3.0-or-later',
    reason: 'Prebuilt libvips binary of `sharp` (Next.js image optimisation), used unmodified and dynamically linked.',
  },
  '@sesamecare-oss/redlock': {
    license: 'UNLICENSED',
    reason: 'The manifest says UNLICENSED, but the shipped LICENSE.md is MIT (dependency of @hocuspocus/extension-redis).',
  },
  argparse: { license: 'Python-2.0', reason: 'Permissive (PSF licence); dependency of js-yaml.' },
  'caniuse-lite': { license: 'CC-BY-4.0', reason: 'Browser support data used at build time (browserslist).' },
  duck: { license: 'BSD', reason: 'The shipped LICENSE is the BSD-2-Clause text (dependency of mammoth).' },
  'fast-sha256': { license: 'Unlicense', reason: 'Public-domain dedication.' },
  nodemailer: { license: 'MIT-0', reason: 'MIT without the attribution clause.' },
  pako: { license: '(MIT AND Zlib)', reason: 'Zlib is permissive.' },
  'postal-mime': { license: 'MIT-0', reason: 'MIT without the attribution clause.' },
  tweetnacl: { license: 'Unlicense', reason: 'Public-domain dedication.' },
}

// The exception recorded for the package, or null: an exact name first, then the longest matching `prefix*`.
export function exceptionFor(name, exceptions = LICENSE_EXCEPTIONS) {
  if (Object.hasOwn(exceptions, name)) return exceptions[name]
  const prefixes = Object.keys(exceptions)
    .filter((key) => key.endsWith('*') && name.startsWith(key.slice(0, -1)))
    .sort((a, b) => b.length - a.length)
  return prefixes.length > 0 ? exceptions[prefixes[0]] : null
}

// Splits an SPDX expression into identifiers, `AND`, `OR`, `WITH` and parentheses.
export function tokenize(expression) {
  return expression.replace(/([()])/g, ' $1 ').trim().split(/\s+/).filter(Boolean)
}

// True when the SPDX expression is satisfied by the allowlist: `OR` needs one allowed side, `AND` both.
// `<id> WITH <exception>` is judged by `<id>` (an exception only adds permissions). Anything that does not
// parse as an expression — `SEE LICENSE IN …`, `UNLICENSED`, free text — is not allowed.
export function isAllowedExpression(expression, allowed = ALLOWED_LICENSES) {
  const tokens = tokenize(expression)
  let position = 0
  const fail = () => {
    throw new Error('not an SPDX expression')
  }
  const primary = () => {
    const token = tokens[position++]
    if (token === '(') {
      const value = orExpression()
      if (tokens[position++] !== ')') fail()
      return value
    }
    if (token === undefined || ['AND', 'OR', 'WITH', ')'].includes(token)) fail()
    if (tokens[position] === 'WITH') {
      position += 1
      if (tokens[position++] === undefined) fail()
    }
    return allowed.includes(token.replace(/\+$/, ''))
  }
  const andExpression = () => {
    let value = primary()
    while (tokens[position] === 'AND') {
      position += 1
      value = primary() && value
    }
    return value
  }
  const orExpression = () => {
    let value = andExpression()
    while (tokens[position] === 'OR') {
      position += 1
      value = andExpression() || value
    }
    return value
  }
  try {
    const value = orExpression()
    return position === tokens.length && value
  } catch {
    return false
  }
}

// The licence a manifest declares, as one expression: the `license` string or object, or the legacy
// `licenses` array (alternatives, joined with OR). `null` when it declares none.
export function licenseOf(manifest) {
  const { license, licenses } = manifest
  if (typeof license === 'string' && license.trim()) return license.trim()
  if (license && typeof license.type === 'string') return license.type
  if (Array.isArray(licenses) && licenses.length > 0) {
    const types = licenses.map((entry) => (typeof entry === 'string' ? entry : entry?.type)).filter(Boolean)
    if (types.length > 0) return types.length === 1 ? types[0] : `(${types.join(' OR ')})`
  }
  return null
}

export function readManifest(packageDir) {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'))
}

// The workspace directories of the repository: the root plus each match of its `workspaces` patterns.
// Patterns are plain paths or `<dir>/*`, the only shapes Yarn workspaces here use.
export function listWorkspaces(rootDir) {
  const manifest = readManifest(rootDir)
  const patterns = Array.isArray(manifest.workspaces) ? manifest.workspaces : manifest.workspaces?.packages ?? []
  const dirs = [rootDir]
  for (const pattern of patterns) {
    const candidates = pattern.endsWith('/*')
      ? (fs.existsSync(path.join(rootDir, pattern.slice(0, -2)))
          ? fs
              .readdirSync(path.join(rootDir, pattern.slice(0, -2)), { withFileTypes: true })
              .filter((entry) => entry.isDirectory())
              .map((entry) => path.join(rootDir, pattern.slice(0, -2), entry.name))
          : [])
      : [path.join(rootDir, pattern)]
    for (const dir of candidates.sort()) {
      if (fs.existsSync(path.join(dir, 'package.json'))) dirs.push(dir)
    }
  }
  return dirs
}

// Node's lookup: `<dir>/node_modules/<name>`, then the same in every parent directory up to the root.
export function resolvePackage(name, fromDir, rootDir) {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    if (dir === rootDir || path.dirname(dir) === dir) return null
    dir = path.dirname(dir)
  }
}

function productionDependencies(manifest) {
  return [
    ...Object.keys(manifest.dependencies ?? {}).map((name) => ({ name, optional: false })),
    ...Object.keys(manifest.optionalDependencies ?? {}).map((name) => ({ name, optional: true })),
  ]
}

// Every installed production package reachable from the workspaces, once per installed copy:
// `{ name, version, license, dir }`. Workspace packages are walked through but not listed (they are this
// repository's own code, MIT). A non-optional dependency that is not installed is reported in `missing`.
export function collectPackages(rootDir) {
  const workspaces = listWorkspaces(rootDir)
  const workspaceDirs = new Set(workspaces.map((dir) => fs.realpathSync(dir)))
  const packages = []
  const missing = []
  const seen = new Set()
  const queue = [...workspaces]
  while (queue.length > 0) {
    const dir = queue.shift()
    const realDir = fs.realpathSync(dir)
    if (seen.has(realDir)) continue
    seen.add(realDir)
    const manifest = readManifest(dir)
    const name = manifest.name ?? path.relative(rootDir, dir)
    if (!workspaceDirs.has(realDir)) packages.push({ name, version: manifest.version, license: licenseOf(manifest), dir })
    for (const dependency of productionDependencies(manifest)) {
      const found = resolvePackage(dependency.name, dir, rootDir)
      if (found) queue.push(found)
      else if (!dependency.optional) missing.push({ name: dependency.name, requiredBy: name || '(repository root)' })
    }
  }
  packages.sort((a, b) => a.name.localeCompare(b.name) || String(a.version).localeCompare(String(b.version)))
  return { packages, missing }
}

// The packages whose licence is not allowed and that are not recorded exceptions.
export function findViolations(packages, { allowed = ALLOWED_LICENSES, exceptions = LICENSE_EXCEPTIONS } = {}) {
  return packages.filter((pkg) => {
    if (pkg.license && isAllowedExpression(pkg.license, allowed)) return false
    return exceptionFor(pkg.name, exceptions)?.license !== pkg.license
  })
}

export function checkLicenses(rootDir, options = {}) {
  const { packages, missing } = collectPackages(rootDir)
  return { packages, missing, violations: findViolations(packages, options) }
}

export function parseRoot(argv, defaultRoot) {
  const index = argv.indexOf('--root')
  if (index < 0) return defaultRoot
  const value = argv[index + 1]
  if (!value) throw new Error('--root needs a directory')
  return path.resolve(value)
}

export function main(argv, { log, error }) {
  let rootDir
  try {
    rootDir = parseRoot(argv, path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'))
  } catch (parseError) {
    error(`licenses:check: ${parseError.message}`)
    return 1
  }
  const { packages, missing, violations } = checkLicenses(rootDir)
  for (const { name, requiredBy } of missing) {
    error(`licenses:check: ${name} (required by ${requiredBy}) is not installed; run \`yarn install\` first`)
  }
  for (const { name, version, license, dir } of violations) {
    error(
      `licenses:check: ${name}@${version} has licence "${license ?? 'none declared'}", which is not allowed`
      + ` (${path.relative(rootDir, dir)})`,
    )
  }
  if (missing.length > 0 || violations.length > 0) {
    error(
      `licenses:check: ${violations.length} package(s) with a disallowed licence, ${missing.length} missing.`
      + ' Allowed: ' + ALLOWED_LICENSES.join(', ') + '. Replace the package or record an exception with a reason'
      + ' (LICENSE_EXCEPTIONS in scripts/check-licenses.mjs, approved by the product owner).',
    )
    return 1
  }
  log(`licenses:check: ${packages.length} production packages, every licence allowed.`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), { log: console.log, error: console.error })
}
