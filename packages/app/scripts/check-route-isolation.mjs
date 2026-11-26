// Cross-club isolation inventory check (#628, E22-S02; D-034 "one production instance serves many clubs").
// Every route under src/modules/<id>/api of a Vereino module (vereino-modules.json) and every HTTP method it exports
// must have at least one probe in the route inventory that the integration test ISSUE-628 runs against two clubs.
// A route or a method missing from the inventory fails, so isolation coverage cannot rot; an inventory entry without
// a route fails too, so the inventory cannot drift. Each probe is checked for shape: a probe that addresses the other
// club (`foreign-id`, `foreign-ref`, `public`) must name at least one `$B:` reference, every `[param]` of the route
// must be bound, and an exemption or a non-default expected status must say why. A `library` probe (training outlines
// spec phase 4, #685) addresses the shared outline library, which shows club A what club B published on purpose: it
// must say why, may expect a 2xx, and the guard checks it for 5xx and for any club B data beyond the published entry.
// Usage: node scripts/check-route-isolation.mjs [--json]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT, readVereinoModuleIds } from './vereino-paths.mjs'

export const INVENTORY_DIR = '.ai/qa/tests/_fixtures/isolation/inventory'
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
export const PROBE_KINDS = ['read', 'foreign-id', 'foreign-ref', 'public', 'exempt', 'library']
const FOREIGN_KINDS = new Set(['foreign-id', 'foreign-ref', 'public'])
const PROBE_KEYS = new Set(['probe', 'why', 'params', 'query', 'body', 'headers', 'expect', 'roles', 'stable'])
const REFERENCE = /^\$(A|B):[a-zA-Z][a-zA-Z0-9]*$/

/** The HTTP methods a route module exports, read from its source (functions, constants and destructured exports). */
export function exportedMethods(source) {
  const found = new Set()
  const pick = (name) => {
    const trimmed = name.trim()
    const alias = /\bas\s+(\w+)$/.exec(trimmed)
    const exported = alias ? alias[1] : trimmed
    if (HTTP_METHODS.includes(exported)) found.add(exported)
  }
  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)) pick(match[1])
  for (const match of source.matchAll(/^export\s+const\s+(\w+)\s*[:=]/gm)) pick(match[1])
  for (const match of source.matchAll(/^export\s+(?:const\s+)?\{([^}]*)\}/gm)) {
    for (const name of match[1].split(',')) pick(name.split(':').at(-1))
  }
  return HTTP_METHODS.filter((method) => found.has(method))
}

function walkRouteFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') walkRouteFiles(full, found)
    } else if (entry.name === 'route.ts') found.push(full)
  }
  return found
}

/** Every Vereino API route as `{ url, file, methods }`, the URL as the app serves it (`/api/<module>/<path>`). */
export function listRoutes({ appRoot = APP_ROOT, moduleIds = readVereinoModuleIds(appRoot) } = {}) {
  const routes = []
  for (const moduleId of moduleIds) {
    const apiDir = path.join(appRoot, 'src', 'modules', moduleId, 'api')
    if (!fs.existsSync(apiDir)) continue
    for (const file of walkRouteFiles(apiDir)) {
      const relative = path.relative(apiDir, path.dirname(file)).split(path.sep).join('/')
      routes.push({
        url: `/api/${moduleId}${relative ? `/${relative}` : ''}`,
        file: path.relative(appRoot, file).split(path.sep).join('/'),
        methods: exportedMethods(fs.readFileSync(file, 'utf8')),
      })
    }
  }
  return routes.sort((left, right) => left.url.localeCompare(right.url))
}

/** The `$A:`/`$B:` references anywhere inside a value. */
export function referencesIn(value, found = []) {
  if (typeof value === 'string') {
    if (REFERENCE.test(value)) found.push(value)
  } else if (Array.isArray(value)) {
    for (const item of value) referencesIn(item, found)
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) referencesIn(item, found)
  }
  return found
}

const routeParams = (url) => [...url.matchAll(/\[(\w+)\]/g)].map((match) => match[1])
const hasWhy = (probe) => typeof probe.why === 'string' && probe.why.trim().length > 0

/** The shape problems of one probe of `url` `method` (an empty list when it is valid). */
export function probeProblems(url, method, probe) {
  const label = `${method} ${url}`
  if (probe === null || typeof probe !== 'object' || Array.isArray(probe)) return [`${label}: a probe must be an object`]
  if (!PROBE_KINDS.includes(probe.probe)) {
    return [`${label}: unknown probe kind ${JSON.stringify(probe.probe)} (one of ${PROBE_KINDS.join(', ')})`]
  }
  const problems = []
  for (const key of Object.keys(probe)) if (!PROBE_KEYS.has(key)) problems.push(`${label}: unknown key "${key}"`)
  if (probe.probe === 'exempt') {
    if (!hasWhy(probe)) problems.push(`${label}: an exempt probe must say why`)
    return problems
  }
  if (probe.probe === 'library' && !hasWhy(probe)) problems.push(`${label}: a library probe must say why`)
  const params = probe.params ?? {}
  for (const name of routeParams(url)) {
    if (typeof params[name] !== 'string') problems.push(`${label}: the route parameter [${name}] is not bound`)
  }
  for (const name of Object.keys(params)) {
    if (!routeParams(url).includes(name)) problems.push(`${label}: params names [${name}], which the route lacks`)
  }
  const references = referencesIn([probe.params, probe.query, probe.body, probe.headers])
  if (FOREIGN_KINDS.has(probe.probe) && !references.some((reference) => reference.startsWith('$B:'))) {
    problems.push(`${label}: a ${probe.probe} probe must name at least one $B: reference`)
  }
  if (probe.expect !== undefined) {
    // A library probe reads what another club shared on purpose, so it may expect a success.
    const lowest = probe.probe === 'library' ? 200 : 400
    const valid =
      Array.isArray(probe.expect) &&
      probe.expect.length > 0 &&
      probe.expect.every((status) => Number.isInteger(status) && status >= lowest && status <= 499)
    if (!valid) problems.push(`${label}: expect must list ${lowest === 200 ? '2xx–4xx' : '4xx'} statuses`)
    if (!hasWhy(probe)) problems.push(`${label}: a non-default expect must say why`)
  }
  if (probe.stable === false && !hasWhy(probe)) problems.push(`${label}: an unstable read must say why`)
  return problems
}

/** Compares the routes with the inventory; returns the problems and the number of probes. */
export function checkInventory({ routes, inventory }) {
  const errors = [...(inventory.errors ?? [])]
  const entries = inventory.routes
  let probes = 0
  const known = new Map(routes.map((route) => [route.url, route]))
  for (const route of routes) {
    const entry = entries[route.url]
    if (!entry) {
      errors.push(`${route.url} (${route.file}) is not in the inventory`)
      continue
    }
    for (const method of route.methods) {
      if (!entry[method]) errors.push(`${method} ${route.url} is not in the inventory`)
    }
  }
  for (const [url, entry] of Object.entries(entries)) {
    const route = known.get(url)
    if (!route) {
      errors.push(`${url} is in the inventory but no route serves it`)
      continue
    }
    for (const [method, value] of Object.entries(entry)) {
      if (!route.methods.includes(method)) {
        errors.push(`${method} ${url} is in the inventory but the route does not export it`)
        continue
      }
      const list = Array.isArray(value) ? value : [value]
      if (list.length === 0) errors.push(`${method} ${url}: the probe list is empty`)
      for (const probe of list) {
        probes += 1
        errors.push(...probeProblems(url, method, probe))
      }
    }
  }
  return { routesChecked: routes.length, probes, errors }
}

/**
 * The inventory: one JSON file per module in INVENTORY_DIR (`{ "routes": { "<url>": { "<METHOD>": probe | probe[] } } }`),
 * merged into one `routes` object. A URL listed by two files is a problem.
 */
export function readInventory(appRoot = APP_ROOT) {
  const dir = path.join(appRoot, INVENTORY_DIR)
  const routes = {}
  const errors = []
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort() : []
  for (const name of files) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
    const entries = parsed?.routes
    if (entries === null || typeof entries !== 'object' || Array.isArray(entries)) {
      errors.push(`${name}: needs a "routes" object`)
      continue
    }
    for (const [url, entry] of Object.entries(entries)) {
      if (url in routes) errors.push(`${name}: ${url} is already listed by another inventory file`)
      else routes[url] = entry
    }
  }
  return { routes, errors }
}

export function runCli({ argv, appRoot, moduleIds, log = console.log, error = console.error }) {
  const result = checkInventory({ routes: listRoutes({ appRoot, moduleIds }), inventory: readInventory(appRoot) })
  if (argv.includes('--json')) {
    log(JSON.stringify(result, null, 2))
  } else {
    for (const problem of result.errors) error(`route-isolation:check: ${problem}`)
    log(
      `route-isolation:check: ${String(result.routesChecked)} route(s), ${String(result.probes)} probe(s), ${String(result.errors.length)} problem(s)`,
    )
  }
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli({ argv: process.argv.slice(2) })
}
