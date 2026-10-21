// Single source of the Vereino-owned paths of this app (engineering standards S3.1).
// Everything else in packages/app is platform-owned scaffold and is not formatted or strictly linted.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const REPO_ROOT = path.resolve(APP_ROOT, '..', '..')

// Scaffold modules that ship with the platform template and are never Vereino-owned.
export const PLATFORM_MODULE_IDS = ['example', 'example_customers_sync', 'ratelimit_probe', 'agent_examples']

const MODULE_ID_PATTERN = /^[a-z][a-z0-9_]*$/

export function readVereinoModuleIds(appRoot = APP_ROOT) {
  const raw = JSON.parse(fs.readFileSync(path.join(appRoot, 'vereino-modules.json'), 'utf8'))
  const ids = raw.modules
  if (!Array.isArray(ids)) throw new Error('[internal] vereino-modules.json: "modules" must be an array')
  for (const id of ids) {
    if (typeof id !== 'string' || !MODULE_ID_PATTERN.test(id)) {
      throw new Error(`[internal] vereino-modules.json: invalid module id ${JSON.stringify(id)}`)
    }
    if (PLATFORM_MODULE_IDS.includes(id)) {
      throw new Error(`[internal] vereino-modules.json: ${id} is a platform scaffold module`)
    }
  }
  return ids
}

// Globs relative to packages/app for Vereino-owned app code.
export function vereinoAppGlobs(moduleIds = readVereinoModuleIds()) {
  return [...moduleIds.map((id) => `src/modules/${id}/**`), '.ai/qa/tests/**']
}

// Platform-owned files that live inside otherwise Vereino-owned folders.
export const PLATFORM_FILES_IN_VEREINO_PATHS = ['.ai/qa/tests/playwright.config.ts']
