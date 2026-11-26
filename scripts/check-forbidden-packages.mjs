#!/usr/bin/env node
// Forbidden-package guard (ADR-023, ENG-Q-10, #466). `@open-mercato/enterprise` is commercially licensed: the
// scaffold listed it as a production dependency of `packages/app`, and Vereino (MIT then, AGPL-3.0-only since D-035) removed it once
// the platform spike (#448) showed that no installed package imports it. This check keeps it out: it fails when a
// workspace manifest lists a forbidden package, when `yarn.lock` resolves it (also as a transitive dependency), or
// when a source file imports it or registers a module from it (`from: '<package>'` in `src/modules.ts`).
//
// Second rule (DD-E10 of the enterprise package spec): the public core never depends on the private package
// `@vereino/enterprise`. A public source file may reference it only inside an enterprise switch: in
// `packages/app/src/modules.ts` and `packages/app/next.config.ts`, on lines between `// enterprise-switch:start`
// and `// enterprise-switch:end`. The overlaid package (`packages/enterprise/`) and its public CI fixture are
// skipped. The overlay build adds the package to `packages/app/package.json` and `yarn.lock`; `--overlay`
// accepts exactly those lines, every other manifest or lockfile reference still fails.
//
// Usage: node scripts/check-forbidden-packages.mjs [--root <repo-root>] [--overlay]
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

// The private Enterprise package (DD-E10): only the enterprise switches of the public core may reference it.
export const ENTERPRISE_PACKAGE = '@vereino/enterprise'
export const ENTERPRISE_REASON = 'the public core never depends on the private Enterprise package (DD-E10)'
export const ENTERPRISE_SWITCH_FILES = ['packages/app/src/modules.ts', 'packages/app/next.config.ts']
export const ENTERPRISE_SWITCH_START = '// enterprise-switch:start'
export const ENTERPRISE_SWITCH_END = '// enterprise-switch:end'
// The overlaid package itself and the public fixture CI copies into its place (DD-E11).
export const ENTERPRISE_SKIPPED_PATHS = ['packages/enterprise/', 'packages/app/.ai/qa/fixtures/enterprise-overlay/']
// The one manifest the overlay build may extend, and the package's own manifest (present only in that build).
export const ENTERPRISE_OVERLAY_MANIFEST = 'packages/app/package.json'
export const ENTERPRISE_OWN_MANIFEST = 'packages/enterprise/package.json'

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

// The second rule for a manifest: only the overlay build's app manifest may list the package, in `dependencies`.
export function checkEnterpriseManifest(relativePath, manifest, { overlay = false } = {}) {
  if (relativePath === ENTERPRISE_OWN_MANIFEST) return []
  const errors = []
  for (const field of DEPENDENCY_FIELDS) {
    if (!Object.hasOwn(manifest[field] ?? {}, ENTERPRISE_PACKAGE)) continue
    if (overlay && relativePath === ENTERPRISE_OVERLAY_MANIFEST && field === 'dependencies') continue
    errors.push(`${relativePath}: ${field} lists ${ENTERPRISE_PACKAGE} (${ENTERPRISE_REASON})`)
  }
  return errors
}

// The second rule for the lockfile. With `--overlay`, the package's own stanza (every descriptor a
// `workspace:` one) and its dependency line in the `@vereino/app` stanza are accepted; anything else fails.
export function checkEnterpriseLockfile(relativePath, source, { overlay = false } = {}) {
  const errors = []
  const descriptor = new RegExp(`^"?${escapeRegExp(ENTERPRISE_PACKAGE)}@`)
  const dependency = new RegExp(`^\\s+"?${escapeRegExp(ENTERPRISE_PACKAGE)}"?:`)
  let stanza = ''
  source.split('\n').forEach((line, index) => {
    const at = `${relativePath}:${String(index + 1)}`
    if (/^\S/.test(line)) stanza = line
    if (descriptor.test(line)) {
      const descriptors = line.replace(/:$/, '').replaceAll('"', '').split(/,\s*/)
      const workspace = descriptors.every((value) => value.startsWith(`${ENTERPRISE_PACKAGE}@workspace:`))
      if (!(overlay && workspace)) errors.push(`${at}: resolves ${ENTERPRISE_PACKAGE} (${ENTERPRISE_REASON})`)
    } else if (dependency.test(line) && !(overlay && stanza.startsWith('"@vereino/app@workspace:'))) {
      errors.push(`${at}: depends on ${ENTERPRISE_PACKAGE} (${ENTERPRISE_REASON})`)
    }
  })
  return errors
}

// The second rule for a source file: a reference fails unless it sits inside an enterprise switch of an allowed
// file. In those files a nested or unclosed start marker and an end marker without a start fail too.
export function checkEnterpriseSource(relativePath, source) {
  if (ENTERPRISE_SKIPPED_PATHS.some((prefix) => relativePath.startsWith(prefix))) return []
  const switchFile = ENTERPRISE_SWITCH_FILES.includes(relativePath)
  const where = switchFile ? ' outside an enterprise switch' : ''
  const pattern = referencePattern(ENTERPRISE_PACKAGE)
  const errors = []
  let openAt = null
  source.split('\n').forEach((line, index) => {
    const at = `${relativePath}:${String(index + 1)}`
    if (switchFile && line.includes(ENTERPRISE_SWITCH_END)) {
      if (openAt === null) errors.push(`${at}: ${ENTERPRISE_SWITCH_END} without a matching start`)
      openAt = null
    }
    if (openAt === null && pattern.test(line)) {
      errors.push(`${at}: imports ${ENTERPRISE_PACKAGE}${where} (${ENTERPRISE_REASON})`)
    }
    if (switchFile && line.includes(ENTERPRISE_SWITCH_START)) {
      if (openAt !== null) errors.push(`${at}: ${ENTERPRISE_SWITCH_START} inside the switch opened on line ${String(openAt)}`)
      openAt = index + 1
    }
  })
  if (openAt !== null) errors.push(`${relativePath}:${String(openAt)}: ${ENTERPRISE_SWITCH_START} is never closed`)
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

// `overlay`: the tree is the overlay build (DD-E10), so its app manifest and lockfile lines are accepted.
export function checkForbiddenPackages(rootDir, forbidden = FORBIDDEN_PACKAGES, { overlay = false } = {}) {
  const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
  const errors = []
  for (const manifest of listManifests(rootDir)) {
    const content = JSON.parse(read(manifest))
    errors.push(...checkManifest(manifest, content, forbidden), ...checkEnterpriseManifest(manifest, content, { overlay }))
  }
  if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    const lockfile = read('yarn.lock')
    errors.push(...checkLockfile('yarn.lock', lockfile, forbidden), ...checkEnterpriseLockfile('yarn.lock', lockfile, { overlay }))
  }
  for (const folder of SOURCE_ROOTS) {
    for (const file of listSourceFiles(rootDir, folder)) {
      const source = read(file)
      errors.push(...checkSource(file, source, forbidden), ...checkEnterpriseSource(file, source))
    }
  }
  return errors
}

// `[--root <repo-root>] [--overlay]` in any order; the root defaults to the working directory.
export function parseArgs(args) {
  const usage = 'Usage: check-forbidden-packages.mjs [--root <repo-root>] [--overlay]'
  const options = { rootDir: process.cwd(), overlay: false }
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--overlay') options.overlay = true
    else if (args[index] === '--root' && index + 1 < args.length) options.rootDir = path.resolve(args[(index += 1)])
    else throw new Error(usage)
  }
  return options
}

export function main({ args, log, logError }) {
  const { rootDir, overlay } = parseArgs(args)
  const errors = checkForbiddenPackages(rootDir, FORBIDDEN_PACKAGES, { overlay })
  for (const error of errors) logError(`- ${error}`)
  if (errors.length > 0) return 1
  log(`No forbidden package is installed or imported: ${Object.keys(FORBIDDEN_PACKAGES).join(', ')}`)
  log(
    `No public file references ${ENTERPRISE_PACKAGE} outside an enterprise switch`
      + (overlay ? ' (overlay build: its app manifest and lockfile lines accepted)' : ''),
  )
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
