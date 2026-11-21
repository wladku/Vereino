// Dashboard widget titles come from the catalogs (#484, E20-S05). The platform `DashboardScreen` shows a widget's
// `metadata.title` and `metadata.description` as plain strings unless one of its catalog keys translates them, so a
// widget without the keys shows English text in every locale. `i18n:check-hardcoded --strict` runs this check over the
// Vereino modules and fails, naming the widget file, when a catalog of the widget's module lacks the title or the
// description key.
import fs from 'node:fs'
import path from 'node:path'

const WIDGET_FILE = /^widget\.tsx?$/
const ID_PATTERN = /\bid:\s*(['"`])([^'"`]+)\1/
const DESCRIPTION_PATTERN = /\bdescription:/

// The keys `DashboardScreen` (`resolveWidgetTitle` / `resolveWidgetDescription`) tries, most specific first.
export function widgetCatalogKeys(widgetId, field) {
  const keys = [`${widgetId}.${field}`, `dashboard.widgets.${widgetId}.${field}`]
  const parts = widgetId.split('.')
  if (parts.length > 1) {
    const last = parts.pop()
    keys.unshift(`${parts.join('.')}.widgets.${last}.${field}`)
  }
  return keys
}

export function readWidgetMetadata(source) {
  const id = source.match(ID_PATTERN)?.[2] ?? null
  return { id, hasDescription: DESCRIPTION_PATTERN.test(source) }
}

function listWidgetFiles(moduleRoot) {
  const dashboardRoot = path.join(moduleRoot, 'widgets', 'dashboard')
  if (!fs.existsSync(dashboardRoot)) return []
  const files = []
  for (const entry of fs.readdirSync(dashboardRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const widgetDir = path.join(dashboardRoot, entry.name)
    for (const name of fs.readdirSync(widgetDir)) {
      if (WIDGET_FILE.test(name)) files.push(path.join(widgetDir, name))
    }
  }
  return files.sort()
}

function readCatalogs(moduleRoot) {
  const i18nRoot = path.join(moduleRoot, 'i18n')
  if (!fs.existsSync(i18nRoot)) return []
  return fs
    .readdirSync(i18nRoot)
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .sort()
    .map((name) => ({
      locale: name.slice(0, -'.json'.length),
      keys: JSON.parse(fs.readFileSync(path.join(i18nRoot, name), 'utf8')),
    }))
}

// Returns one finding per widget, field and locale whose catalog key is missing; `file` is relative to `appRoot`.
export function checkWidgetTitles(appRoot, moduleIds) {
  const findings = []
  for (const moduleId of moduleIds) {
    const moduleRoot = path.join(appRoot, 'src', 'modules', moduleId)
    const widgetFiles = listWidgetFiles(moduleRoot)
    if (widgetFiles.length === 0) continue
    const catalogs = readCatalogs(moduleRoot)
    for (const absolutePath of widgetFiles) {
      const file = path.relative(appRoot, absolutePath).split(path.sep).join('/')
      const { id, hasDescription } = readWidgetMetadata(fs.readFileSync(absolutePath, 'utf8'))
      if (!id) {
        findings.push({ file, widgetId: null, field: 'id', locale: null, key: null })
        continue
      }
      if (catalogs.length === 0) {
        findings.push({ file, widgetId: id, field: 'title', locale: null, key: widgetCatalogKeys(id, 'title')[0] })
        continue
      }
      for (const field of hasDescription ? ['title', 'description'] : ['title']) {
        const keys = widgetCatalogKeys(id, field)
        for (const catalog of catalogs) {
          if (keys.some((key) => typeof catalog.keys[key] === 'string' && catalog.keys[key].trim() !== '')) continue
          findings.push({ file, widgetId: id, field, locale: catalog.locale, key: keys[0] })
        }
      }
    }
  }
  return findings
}

export function formatWidgetTitleFinding(finding) {
  if (finding.field === 'id') return `${finding.file} [widget-title] no literal metadata id found`
  if (finding.locale === null) {
    return `${finding.file} [widget-title] widget "${finding.widgetId}" has no i18n catalogs (add "${finding.key}")`
  }
  return `${finding.file} [widget-title] widget "${finding.widgetId}" has no ${finding.field} in i18n/${finding.locale}.json (add "${finding.key}")`
}
