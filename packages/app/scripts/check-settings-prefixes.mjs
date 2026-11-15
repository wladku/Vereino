// Settings-page guard (navigation spec REQ-N01, TEST-N02; issue #246).
// The backend shell hides from the main sidebar, and shows the settings sidebar on, every page whose path
// starts with a "settings prefix". The platform builds the prefixes from the pages with
// `pageContext: 'settings'`: the page's own path and, unless the path is a top-level page or ends in
// `settings`, its parent path (`@open-mercato/ui/src/backend/utils/nav.ts` computeSettingsPathPrefixes,
// mirrored by `src/app/(backend)/backend/layout.tsx`). A Vereino settings page next to regular pages under
// one parent path therefore hides those pages from the menu. This check fails when that happens.
// It reads the generated route metadata, so `yarn generate` runs first (it is the first step of `yarn verify`).
// Usage: node scripts/check-settings-prefixes.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT, readVereinoModuleIds } from './vereino-paths.mjs'

export const GENERATED_FILE = '.mercato/generated/backend-route-metadata.generated.ts'

const ENTRY_PATTERN = /moduleId:\s*"([^"]+)",\s*\.\.\.resolvePageRouteMetadata\("([^"]+)",\s*(.*?)\)\s*\n/g
const INLINE_METADATA = /^\((\{.*\}) as any\)$/

// The same rule as the platform's computeSettingsPathPrefixes.
export function settingsPrefixes(routePath) {
  const parts = routePath.split('/')
  const prefixes = [routePath]
  if (parts.length > 3 && parts.at(-1) !== 'settings') prefixes.unshift(parts.slice(0, -1).join('/'))
  return prefixes
}

// Parses the generated metadata into { moduleId, path, pageContext } for the given modules.
export function parseRoutes(source, moduleIds) {
  const routes = []
  const errors = []
  for (const [, moduleId, routePath, metadataSource] of source.matchAll(ENTRY_PATTERN)) {
    if (!moduleIds.includes(moduleId)) continue
    const inline = INLINE_METADATA.exec(metadataSource)
    let metadata = null
    try {
      metadata = inline ? JSON.parse(inline[1]) : null
    } catch {
      metadata = null
    }
    if (!metadata) {
      errors.push(`${moduleId}: cannot read the metadata of ${routePath} from ${GENERATED_FILE}`)
      continue
    }
    routes.push({ moduleId, path: routePath, pageContext: metadata.pageContext ?? 'main' })
  }
  return { routes, errors }
}

// Every non-settings page that starts with a prefix of a settings page is a conflict.
export function findConflicts(routes) {
  const conflicts = []
  for (const settingsPage of routes.filter((route) => route.pageContext === 'settings')) {
    for (const prefix of settingsPrefixes(settingsPage.path)) {
      for (const page of routes) {
        if (page.pageContext === 'settings' || !page.path.startsWith(prefix)) continue
        conflicts.push(
          `${settingsPage.moduleId}: the settings page ${settingsPage.path} makes ${prefix} a settings prefix, so ${page.path} (${page.moduleId}) leaves the main sidebar`,
        )
      }
    }
  }
  return conflicts
}

export function checkSettingsPrefixes({ appRoot = APP_ROOT, moduleIds = readVereinoModuleIds(appRoot) } = {}) {
  const file = path.join(appRoot, GENERATED_FILE)
  if (!fs.existsSync(file)) {
    return { routesChecked: 0, errors: [`${GENERATED_FILE} is missing; run yarn generate first`] }
  }
  const { routes, errors } = parseRoutes(fs.readFileSync(file, 'utf8'), moduleIds)
  if (routes.length === 0 && errors.length === 0) {
    errors.push(`no Vereino route found in ${GENERATED_FILE}; the generated format may have changed`)
  }
  return { routesChecked: routes.length, errors: [...errors, ...findConflicts(routes)] }
}

export function runCli({ appRoot, moduleIds, log = console.log, error = console.error }) {
  const result = checkSettingsPrefixes({ appRoot, moduleIds })
  for (const problem of result.errors) error(`settings-prefixes:check: ${problem}`)
  log(
    `settings-prefixes:check: ${String(result.routesChecked)} Vereino page(s), ${String(result.errors.length)} problem(s)`,
  )
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli({})
}
