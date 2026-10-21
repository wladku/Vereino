// Machine checks for Vereino module contracts (engineering standards S2.5, S6.7, S7.5):
// - error codes declared in src/modules/<id>/lib/error-codes.ts are unique app-wide,
//   well-formed and never redeclare a reserved platform code;
// - every error code's message key exists in the module's en and pl catalogs;
// - en.json and pl.json of each Vereino module have identical key sets.
// Usage: node scripts/check-vereino-contracts.mjs [--json]
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { APP_ROOT, readVereinoModuleIds } from './vereino-paths.mjs'

export const RESERVED_PLATFORM_CODES = [
  'optimistic_lock_conflict',
  'organization_scope_required',
  'FOREIGN_KEY_VIOLATION',
  'DATABASE_UNAVAILABLE',
]

const CODE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/
const LOCALES = ['en', 'pl']

function flattenKeys(value, prefix = '', keys = new Set()) {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) flattenKeys(child, fullKey, keys)
    else keys.add(fullKey)
  }
  return keys
}

function readCatalog(moduleDir, locale) {
  const file = path.join(moduleDir, 'i18n', `${locale}.json`)
  if (!fs.existsSync(file)) return null
  return flattenKeys(JSON.parse(fs.readFileSync(file, 'utf8')))
}

async function readErrorCodes(moduleDir, appRoot) {
  const file = path.join(moduleDir, 'lib', 'error-codes.ts')
  if (!fs.existsSync(file)) return []
  const loaded = await import(pathToFileURL(file).href)
  if (!Array.isArray(loaded.errorCodes)) {
    throw new Error(`${path.relative(appRoot, file).split(path.sep).join('/')}: must export an array named errorCodes`)
  }
  return loaded.errorCodes
}

export async function checkContracts({ appRoot = APP_ROOT, moduleIds = readVereinoModuleIds(appRoot) } = {}) {
  const errors = []
  const owners = new Map()
  for (const moduleId of moduleIds) {
    const moduleDir = path.join(appRoot, 'src', 'modules', moduleId)
    const catalogs = Object.fromEntries(LOCALES.map((locale) => [locale, readCatalog(moduleDir, locale)]))
    for (const locale of LOCALES) {
      if (!catalogs[locale]) errors.push(`${moduleId}: missing i18n/${locale}.json`)
    }
    if (catalogs.en && catalogs.pl) {
      for (const key of catalogs.en)
        if (!catalogs.pl.has(key)) errors.push(`${moduleId}: key ${key} is in en.json but not in pl.json`)
      for (const key of catalogs.pl)
        if (!catalogs.en.has(key)) errors.push(`${moduleId}: key ${key} is in pl.json but not in en.json`)
    }

    let entries
    try {
      entries = await readErrorCodes(moduleDir, appRoot)
    } catch (error) {
      errors.push(`${moduleId}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    for (const entry of entries) {
      const { code, status, messageKey } = entry ?? {}
      if (typeof code !== 'string' || !CODE_PATTERN.test(code)) {
        errors.push(`${moduleId}: error code ${JSON.stringify(code)} is not lower snake_case`)
        continue
      }
      if (RESERVED_PLATFORM_CODES.includes(code))
        errors.push(`${moduleId}: error code ${code} is reserved by the platform`)
      const owner = owners.get(code)
      if (owner) errors.push(`${moduleId}: error code ${code} is already declared by ${owner}`)
      else owners.set(code, moduleId)
      if (!Number.isInteger(status) || status < 400 || status > 599) {
        errors.push(`${moduleId}: error code ${code} has invalid HTTP status ${JSON.stringify(status)}`)
      }
      if (typeof messageKey !== 'string' || !messageKey.startsWith(`${moduleId}.`)) {
        errors.push(`${moduleId}: error code ${code} needs a messageKey starting with "${moduleId}."`)
        continue
      }
      for (const locale of LOCALES) {
        if (catalogs[locale] && !catalogs[locale].has(messageKey)) {
          errors.push(`${moduleId}: message key ${messageKey} of error code ${code} is missing in ${locale}.json`)
        }
      }
    }
  }
  return { modulesChecked: moduleIds.length, errorCodes: owners.size, errors }
}

export async function runCli({ argv, appRoot, moduleIds, log = console.log, error = console.error }) {
  const result = await checkContracts({ appRoot, moduleIds })
  if (argv.includes('--json')) {
    log(JSON.stringify(result, null, 2))
  } else {
    for (const problem of result.errors) error(`contracts:check: ${problem}`)
    log(
      `contracts:check: ${String(result.modulesChecked)} Vereino module(s), ${String(result.errorCodes)} error code(s), ${String(result.errors.length)} problem(s)`,
    )
  }
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli({ argv: process.argv.slice(2) })
}
