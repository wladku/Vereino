#!/usr/bin/env node
// Forbidden-package guard (ADR-023, ENG-Q-10, #466). `@open-mercato/enterprise` is commercially licensed: the
// scaffold listed it as a production dependency of `packages/app`, and Vereino (MIT then, AGPL-3.0-only since D-035) removed it once
// the platform spike (#448) showed that no installed package imports it. This check keeps it out: it fails when a
// workspace manifest lists a forbidden package, when `yarn.lock` resolves it (also as a transitive dependency), or
// when a source file imports it or registers a module from it (`from: '<package>'` in `src/modules.ts`).
//
// Usage: node scripts/check-forbidden-packages.mjs [--root <repo-root>]
// Exit 0 when nothing references a forbidden package, 1 naming every file (and line) that does.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Package name -> why it may not come back. Removing an entry needs a product-owner licence decision.
export const FORBIDDEN_PACKAGES = {
  '@open-mercato/enterprise': 'commercially licensed; Vereino keeps enterprise modules out (ADR-023, ENG-Q-10)',
}

export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']
// Folders scanned for source files, relative to the repository root. `.ai/` holds docs and other worktrees.
export const SOURCE_ROOTS = ['packages', 'scripts']
export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'])
export const SKIPPED_DIRS = new Set(['node_modules', '.mercato', '.next', 'dist', 'coverage', 'test-results', '.turbo'])

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
}

// Matches `from '<pkg>'`, `from: '<pkg>'`, `import '<pkg>'`, `import('<pkg>')` and `require('<pkg>')`, with or
// without a subpath (`<pkg>/modules/...`).
export function referencePattern(name) {
  const quoted = `['"\`]${escapeRegExp(name)}(?:/[^'"\`]*)?['"\`]`
  return new RegExp(`(?:\\bfrom\\s*:?\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\s*\\(\\s*)${quoted}`)
}

export function checkManifest(relativePath, manifest, forbidden = FORBIDDEN_PACKAGES) {
  const errors = []
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (Object.hasOwn(forbidden, name)) errors.push(`${relativePath}: ${field} lists ${name} (${forbidden[name]})`)
    }
  }
  return errors
}

// Lockfile entries start at column 0 with the descriptor, e.g. `"@open-mercato/enterprise@npm:0.9.0":`.
export function checkLockfile(relativePath, source, forbidden = FORBIDDEN_PACKAGES) {
  const errors = []
  const lines = source.split('\n')
  for (const name of Object.keys(forbidden)) {
    const entry = new RegExp(`^"?${escapeRegExp(name)}@`)
    const index = lines.findIndex((line) => entry.test(line))
    if (index >= 0) errors.push(`${relativePath}:${String(index + 1)}: resolves ${name} (${forbidden[name]})`)
  }
  return errors
}

export function checkSource(relativePath, source, forbidden = FORBIDDEN_PACKAGES) {
  const errors = []
  const lines = source.split('\n')
  for (const name of Object.keys(forbidden)) {
    const pattern = referencePattern(name)
    lines.forEach((line, index) => {
      if (pattern.test(line)) errors.push(`${relativePath}:${String(index + 1)}: imports ${name} (${forbidden[name]})`)
    })
  }
  return errors
}

// Source files under the given folder (repository-relative paths, `/`-separated, sorted).
export function listSourceFiles(rootDir, folder) {
  const files = []
  const walk = (relativeDir) => {
    const absoluteDir = path.join(rootDir, relativeDir)
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = `${relativeDir}/${entry.name}`
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(relativePath)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(relativePath)
      }
    }
  }
  if (fs.existsSync(path.join(rootDir, folder))) walk(folder)
  return files.sort()
}

// The root manifest plus every `packages/<name>/package.json`.
export function listManifests(rootDir) {
  const manifests = ['package.json']
  const packagesDir = path.join(rootDir, 'packages')
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && fs.existsSync(path.join(packagesDir, entry.name, 'package.json'))) {
        manifests.push(`packages/${entry.name}/package.json`)
      }
    }
  }
  return manifests.filter((relativePath) => fs.existsSync(path.join(rootDir, relativePath)))
}

export function checkForbiddenPackages(rootDir, forbidden = FORBIDDEN_PACKAGES) {
  const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
  const errors = []
  for (const manifest of listManifests(rootDir)) errors.push(...checkManifest(manifest, JSON.parse(read(manifest)), forbidden))
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) errors.push(...checkLockfile('yarn.lock', read('yarn.lock'), forbidden))
  for (const folder of SOURCE_ROOTS) {
    for (const file of listSourceFiles(rootDir, folder)) errors.push(...checkSource(file, read(file), forbidden))
  }
  return errors
}

export function parseRoot(args) {
  if (args.length === 0) return process.cwd()
  if (args.length === 2 && args[0] === '--root') return path.resolve(args[1])
  throw new Error('Usage: check-forbidden-packages.mjs [--root <repo-root>]')
}

export function main({ args, log, logError }) {
  const rootDir = parseRoot(args)
  const errors = checkForbiddenPackages(rootDir)
  for (const error of errors) logError(`- ${error}`)
  if (errors.length > 0) return 1
  log(`No forbidden package is installed or imported: ${Object.keys(FORBIDDEN_PACKAGES).join(', ')}`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
