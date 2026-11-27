#!/usr/bin/env node
// Overlay install of the private Vereino Enterprise package (enterprise package spec DD-E02, DD-E11, DD-E12; #713).
//
// A build that wants Enterprise first puts the package into `packages/enterprise` (the cloud build clones the private
// repository at a pinned tag; the public CI job `enterprise-overlay` copies the fixture
// `packages/app/.ai/qa/fixtures/enterprise-overlay/`), then runs this script, which:
//   1. checks that `packages/enterprise/package.json` is the package `@vereino/enterprise`;
//   2. adds `"@vereino/enterprise": "workspace:*"` to the dependencies of `packages/app/package.json` (the app sees a
//      workspace only when it lists it, `nmHoistingLimits: workspaces`);
//   3. runs `yarn install` without `--immutable` (unless `--no-install`);
//   3a. links `packages/node_modules` to `packages/app/node_modules` (as the runner image does): the package declares
//      its imports as `peerDependencies` only, so Node, TypeScript and the bundler resolve them, walking up from
//      `packages/enterprise/src`, to the app's single copies of React, zod and `@open-mercato/*`;
//   4. compares `yarn.lock` before and after: the only changes allowed are a new `@vereino/enterprise@workspace:` entry
//      and the one dependency line in the `@vereino/app` entry. An added or changed third-party resolution fails: the
//      overlay build must resolve nothing the public CI has not tested;
//   5. with `--ci` only, writes `packages/app/.mercato/enterprise-ci-trust.json`, which adds the committed TEST licence
//      key pair's public key to the trusted list. The gate trusts it only with `VEREINO_CI=true` and warns at every
//      boot (DD-E11); the Dockerfile never passes `--ci`.
// The build then sets `NEXT_PUBLIC_VEREINO_ENTERPRISE=true` for `yarn generate` and `next build`.
//
// Usage: node scripts/enterprise-overlay.mjs [--root <repo-root>] [--ci] [--no-install]
// Exit 0 when the overlay is installed and the lockfile check passes, 1 naming every problem.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ENTERPRISE_PACKAGE = '@vereino/enterprise'
export const ENTERPRISE_DIR = 'packages/enterprise'
export const APP_MANIFEST = 'packages/app/package.json'
export const APP_LOCK_ENTRY_PREFIX = '"@vereino/app@workspace:'
export const ENTERPRISE_LOCK_ENTRY_PREFIX = `"${ENTERPRISE_PACKAGE}@workspace:`
export const TEST_KEY_PAIR = 'packages/app/.ai/qa/fixtures/licence-test-key-pair.json'
export const CI_TRUST_FILE = 'packages/app/.mercato/enterprise-ci-trust.json'
export const PACKAGES_NODE_MODULES = 'packages/node_modules'
export const APP_NODE_MODULES_LINK = 'app/node_modules'

const USAGE = 'Usage: enterprise-overlay.mjs [--root <repo-root>] [--ci] [--no-install]'

export function parseArgs(args) {
  const options = { rootDir: process.cwd(), ci: false, install: true }
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--ci') options.ci = true
    else if (argument === '--no-install') options.install = false
    else if (argument === '--root' && args[index + 1]) options.rootDir = path.resolve(args[(index += 1)])
    else throw new Error(USAGE)
  }
  return options
}

/** Problems with the overlaid package's manifest, or none. */
export function checkEnterpriseManifest(manifest) {
  const problems = []
  if (manifest.name !== ENTERPRISE_PACKAGE) {
    problems.push(`${ENTERPRISE_DIR}/package.json names ${String(manifest.name)}, not ${ENTERPRISE_PACKAGE}`)
  }
  if (manifest.private !== true) problems.push(`${ENTERPRISE_DIR}/package.json must be "private": true`)
  return problems
}

/** The app manifest with `@vereino/enterprise` among its dependencies (sorted), and whether it changed. */
export function patchAppManifest(manifest) {
  const dependencies = manifest.dependencies ?? {}
  if (dependencies[ENTERPRISE_PACKAGE] === 'workspace:*') return { manifest, changed: false }
  const sorted = Object.fromEntries(
    Object.entries({ ...dependencies, [ENTERPRISE_PACKAGE]: 'workspace:*' }).sort(([a], [b]) => a.localeCompare(b)),
  )
  return { manifest: { ...manifest, dependencies: sorted }, changed: true }
}

/** `yarn.lock` as a map from each entry's key line to its body lines (the `__metadata` entry included). */
export function parseLockfile(source) {
  const entries = new Map()
  let key = null
  for (const line of source.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) {
      key = null
    } else if (!line.startsWith(' ')) {
      key = line
      entries.set(key, [])
    } else if (key !== null) {
      entries.get(key).push(line)
    }
  }
  return entries
}

const isEnterpriseDependencyLine = (line) => line.trim().startsWith(`"${ENTERPRISE_PACKAGE}": `)

/**
 * Every change between two lockfiles except the allowed ones: a new `@vereino/enterprise@workspace:` entry and its
 * dependency line in the `@vereino/app` entry. Each problem names the entry.
 */
export function lockfileProblems(before, after) {
  const old = parseLockfile(before)
  const next = parseLockfile(after)
  const problems = []
  for (const [key, lines] of next) {
    if (key.startsWith(ENTERPRISE_LOCK_ENTRY_PREFIX)) continue
    if (!old.has(key)) {
      problems.push(`added resolution ${key}`)
      continue
    }
    const previous = old.get(key)
    const kept = key.startsWith(APP_LOCK_ENTRY_PREFIX) ? lines.filter((line) => !isEnterpriseDependencyLine(line)) : lines
    if (kept.join('\n') !== previous.join('\n')) problems.push(`changed resolution ${key}`)
  }
  for (const key of old.keys()) {
    if (!next.has(key) && !key.startsWith(ENTERPRISE_LOCK_ENTRY_PREFIX)) problems.push(`removed resolution ${key}`)
  }
  return problems
}

/**
 * Links `packages/node_modules` to the app's `node_modules` unless it already is that link; a real directory or another
 * link there is a problem (returned), never replaced.
 */
export function linkPackagesNodeModules(rootDir, platform = process.platform) {
  const link = path.join(rootDir, PACKAGES_NODE_MODULES)
  const existing = fs.lstatSync(link, { throwIfNoEntry: false })
  if (existing) {
    const linked = existing.isSymbolicLink() && path.resolve(path.dirname(link), fs.readlinkSync(link)) === path.join(rootDir, 'packages', APP_NODE_MODULES_LINK)
    return linked ? null : `${PACKAGES_NODE_MODULES} exists and is not a link to packages/${APP_NODE_MODULES_LINK}`
  }
  fs.symlinkSync(APP_NODE_MODULES_LINK, link, platform === 'win32' ? 'junction' : 'dir')
  return null
}

/** The `--ci` trust file: the committed test key pair's kid and public key, never its private half. */
export function ciTrustFile(keyPair) {
  return `${JSON.stringify({ [keyPair.kid]: keyPair.publicKeyPem }, null, 2)}\n`
}

export function runYarnInstall({ rootDir, spawnSyncImpl = spawnSync, platform = process.platform }) {
  const result = spawnSyncImpl('yarn', ['install', '--no-immutable'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: platform === 'win32',
    env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
  })
  return result.status ?? 1
}

export function overlay({ rootDir, ci, install }, { log, logError, runInstall = runYarnInstall }) {
  const file = (relativePath) => path.join(rootDir, relativePath)
  const readJson = (relativePath) => JSON.parse(fs.readFileSync(file(relativePath), 'utf8'))
  const fail = (problems) => {
    for (const problem of problems) logError(`- ${problem}`)
    return 1
  }
  if (!fs.existsSync(file(`${ENTERPRISE_DIR}/package.json`))) {
    return fail([`${ENTERPRISE_DIR}/package.json is missing: put the Enterprise package there first`])
  }
  const manifestProblems = checkEnterpriseManifest(readJson(`${ENTERPRISE_DIR}/package.json`))
  if (manifestProblems.length > 0) return fail(manifestProblems)
  const patched = patchAppManifest(readJson(APP_MANIFEST))
  if (patched.changed) fs.writeFileSync(file(APP_MANIFEST), `${JSON.stringify(patched.manifest, null, 2)}\n`)
  log(`${patched.changed ? 'added' : 'kept'} ${ENTERPRISE_PACKAGE} in ${APP_MANIFEST}`)
  if (install) {
    const before = fs.readFileSync(file('yarn.lock'), 'utf8')
    if (runInstall({ rootDir }) !== 0) return fail(['yarn install failed'])
    const problems = lockfileProblems(before, fs.readFileSync(file('yarn.lock'), 'utf8'))
    if (problems.length > 0) {
      return fail([
        `the overlay changed third-party resolutions in yarn.lock; ${ENTERPRISE_PACKAGE} may only use what the public lockfile resolves (peer + dev dependencies with the app's ranges):`,
        ...problems,
      ])
    }
    log('yarn.lock: only the Enterprise workspace entry and its app dependency line were added')
  }
  const linkProblem = linkPackagesNodeModules(rootDir)
  if (linkProblem) return fail([linkProblem])
  log(`${PACKAGES_NODE_MODULES} -> packages/${APP_NODE_MODULES_LINK}`)
  if (ci) {
    fs.mkdirSync(path.dirname(file(CI_TRUST_FILE)), { recursive: true })
    fs.writeFileSync(file(CI_TRUST_FILE), ciTrustFile(readJson(TEST_KEY_PAIR)))
    log(`wrote ${CI_TRUST_FILE}: the TEST licence kid is trusted when VEREINO_CI=true (CI only)`)
  }
  log('Enterprise overlay installed; build with NEXT_PUBLIC_VEREINO_ENTERPRISE=true')
  return 0
}

export function main({ args, log, logError, runInstall }) {
  return overlay(parseArgs(args), { log, logError, runInstall })
}

/* node:coverage ignore next 9 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
