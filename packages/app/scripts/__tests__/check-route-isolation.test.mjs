// #628 (E22-S02) — the cross-club isolation inventory check: every Vereino route and method has a valid probe.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  INVENTORY_DIR,
  checkInventory,
  exportedMethods,
  listRoutes,
  probeProblems,
  readInventory,
  referencesIn,
  runCli,
} from '../check-route-isolation.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-route-isolation-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function writeFile(relative, content) {
  const file = path.join(fixtureRoot, relative)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content)
}

writeFile('src/modules/alpha/api/route.ts', 'export async function GET() {}\n')
writeFile('src/modules/alpha/api/items/[id]/route.ts', 'export async function GET() {}\nexport function DELETE() {}\n')
writeFile('src/modules/alpha/api/items/route.ts', 'export const { metadata, GET, POST } = makeCrudRoute({})\n')
writeFile('src/modules/alpha/api/items/__tests__/route.ts', 'export async function GET() {}\n')
writeFile('src/modules/alpha/api/shared.ts', 'export async function GET() {}\n')
writeFile('src/modules/beta/data/entities.ts', 'export const x = 1\n')

test('exportedMethods reads functions, constants, destructured and re-exported methods', () => {
  const source = [
    'export const metadata = {}',
    'export async function GET() {}',
    'export function PUT() {}',
    'export const POST = handler',
    'export const { metadata: meta, DELETE } = crud',
    'export { handler as PATCH, other } from "./x"',
    'export const openApi: Doc = {}',
  ].join('\n')
  assert.deepEqual(exportedMethods(source), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  assert.deepEqual(exportedMethods('export const helper = 1\n'), [])
})

test('listRoutes maps route files to served URLs and skips __tests__, helpers and modules without api', () => {
  assert.deepEqual(listRoutes({ appRoot: fixtureRoot, moduleIds: ['alpha', 'beta'] }), [
    { url: '/api/alpha', file: 'src/modules/alpha/api/route.ts', methods: ['GET'] },
    { url: '/api/alpha/items', file: 'src/modules/alpha/api/items/route.ts', methods: ['GET', 'POST'] },
    { url: '/api/alpha/items/[id]', file: 'src/modules/alpha/api/items/[id]/route.ts', methods: ['GET', 'DELETE'] },
  ])
})

test('listRoutes defaults to the repository modules', () => {
  const routes = listRoutes()
  assert.ok(routes.length > 0)
  assert.ok(routes.every((route) => route.url.startsWith('/api/')))
})

test('referencesIn finds whole-string references in nested values', () => {
  assert.deepEqual(referencesIn({ a: '$A:group', b: ['$B:person', 'x $B:no', 3], c: { d: '$B:id1' }, e: null }), [
    '$A:group',
    '$B:person',
    '$B:id1',
  ])
})

test('probeProblems accepts valid probes', () => {
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'read' }), [])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'read', stable: false, why: 'clock' }), [])
  assert.deepEqual(probeProblems('/api/a', 'POST', { probe: 'exempt', why: 'creates only' }), [])
  assert.deepEqual(
    probeProblems('/api/a/[id]', 'GET', { probe: 'foreign-id', params: { id: '$B:thing' }, expect: [403], why: 'x' }),
    [],
  )
  assert.deepEqual(probeProblems('/api/a', 'POST', { probe: 'foreign-ref', body: { personId: '$B:person' } }), [])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'library', why: 'shared on purpose' }), [])
  assert.deepEqual(
    probeProblems('/api/a/[id]', 'POST', {
      probe: 'library',
      params: { id: '$B:libraryEntry' },
      expect: [201],
      why: 'a copy of a shared entry',
    }),
    [],
  )
})

test('probeProblems reports every malformed probe', () => {
  assert.deepEqual(probeProblems('/api/a', 'GET', null), ['GET /api/a: a probe must be an object'])
  assert.deepEqual(probeProblems('/api/a', 'GET', []), ['GET /api/a: a probe must be an object'])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'guess' }), [
    'GET /api/a: unknown probe kind "guess" (one of read, foreign-id, foreign-ref, public, exempt, library)',
  ])
  assert.deepEqual(probeProblems('/api/a', 'POST', { probe: 'exempt', why: ' ', extra: 1 }), [
    'POST /api/a: unknown key "extra"',
    'POST /api/a: an exempt probe must say why',
  ])
  assert.deepEqual(probeProblems('/api/a/[id]', 'GET', { probe: 'foreign-id', params: { other: '$A:x' } }), [
    'GET /api/a/[id]: the route parameter [id] is not bound',
    'GET /api/a/[id]: params names [other], which the route lacks',
    'GET /api/a/[id]: a foreign-id probe must name at least one $B: reference',
  ])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'public', expect: [200] }), [
    'GET /api/a: a public probe must name at least one $B: reference',
    'GET /api/a: expect must list 4xx statuses',
    'GET /api/a: a non-default expect must say why',
  ])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'read', expect: [] }), [
    'GET /api/a: expect must list 4xx statuses',
    'GET /api/a: a non-default expect must say why',
  ])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'read', expect: 404, why: 'x' }), [
    'GET /api/a: expect must list 4xx statuses',
  ])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'read', stable: false }), [
    'GET /api/a: an unstable read must say why',
  ])
  assert.deepEqual(probeProblems('/api/a', 'GET', { probe: 'library', expect: [500] }), [
    'GET /api/a: a library probe must say why',
    'GET /api/a: expect must list 2xx–4xx statuses',
    'GET /api/a: a non-default expect must say why',
  ])
})

const routes = [
  { url: '/api/alpha', file: 'src/modules/alpha/api/route.ts', methods: ['GET'] },
  { url: '/api/alpha/items', file: 'src/modules/alpha/api/items/route.ts', methods: ['GET', 'POST'] },
  { url: '/api/alpha/missing', file: 'src/modules/alpha/api/missing/route.ts', methods: ['GET'] },
]

test('checkInventory reports missing and stale routes and methods and counts the probes', () => {
  const result = checkInventory({
    routes,
    inventory: {
      errors: ['beta.json: needs a "routes" object'],
      routes: {
        '/api/alpha': {
          GET: [{ probe: 'read' }, { probe: 'read', query: { groupId: '$B:group' } }],
          PUT: { probe: 'read' },
        },
        '/api/alpha/items': { GET: [], POST: { probe: 'exempt' } },
        '/api/alpha/gone': { GET: { probe: 'read' } },
      },
    },
  })
  assert.deepEqual(result, {
    routesChecked: 3,
    probes: 3,
    errors: [
      'beta.json: needs a "routes" object',
      '/api/alpha/missing (src/modules/alpha/api/missing/route.ts) is not in the inventory',
      'PUT /api/alpha is in the inventory but the route does not export it',
      'GET /api/alpha/items: the probe list is empty',
      'POST /api/alpha/items: an exempt probe must say why',
      '/api/alpha/gone is in the inventory but no route serves it',
    ],
  })
  assert.deepEqual(
    checkInventory({
      routes: routes.slice(1, 2),
      inventory: { routes: { '/api/alpha/items': { GET: { probe: 'read' } } } },
    }).errors,
    ['POST /api/alpha/items is not in the inventory'],
  )
})

test('readInventory merges the module files and reports duplicates and malformed files', () => {
  assert.deepEqual(readInventory(path.join(fixtureRoot, 'nowhere')), { routes: {}, errors: [] })
  writeFile(`${INVENTORY_DIR}/alpha.json`, JSON.stringify({ routes: { '/api/alpha': { GET: { probe: 'read' } } } }))
  writeFile(
    `${INVENTORY_DIR}/alpha-more.json`,
    JSON.stringify({ routes: { '/api/alpha': { GET: { probe: 'read' } } } }),
  )
  writeFile(`${INVENTORY_DIR}/beta.json`, JSON.stringify({ routes: [] }))
  writeFile(`${INVENTORY_DIR}/gamma.json`, 'null')
  writeFile(`${INVENTORY_DIR}/notes.txt`, 'ignored')
  assert.deepEqual(readInventory(fixtureRoot), {
    routes: { '/api/alpha': { GET: { probe: 'read' } } },
    errors: [
      'alpha.json: /api/alpha is already listed by another inventory file',
      'beta.json: needs a "routes" object',
      'gamma.json: needs a "routes" object',
    ],
  })
})

test('readInventory defaults to the repository inventory', () => {
  assert.equal(typeof readInventory().routes, 'object')
})

test('runCli prints the problems and a summary and returns 1 when problems exist', () => {
  const lines = []
  const problems = []
  const code = runCli({
    argv: [],
    appRoot: fixtureRoot,
    moduleIds: ['alpha'],
    log: (line) => lines.push(line),
    error: (line) => problems.push(line),
  })
  assert.equal(code, 1)
  assert.ok(problems.every((line) => line.startsWith('route-isolation:check: ')))
  assert.ok(
    problems.includes(
      'route-isolation:check: /api/alpha/items (src/modules/alpha/api/items/route.ts) is not in the inventory',
    ),
  )
  assert.deepEqual(lines, [`route-isolation:check: 3 route(s), 1 probe(s), ${String(problems.length)} problem(s)`])
})

test('runCli prints JSON with --json and returns 0 when clean', () => {
  const clean = fs.mkdtempSync(path.join(fixtureRoot, 'clean-'))
  fs.mkdirSync(path.join(clean, INVENTORY_DIR), { recursive: true })
  fs.writeFileSync(path.join(clean, INVENTORY_DIR, 'none.json'), JSON.stringify({ routes: {} }))
  const lines = []
  assert.equal(runCli({ argv: ['--json'], appRoot: clean, moduleIds: [], log: (line) => lines.push(line) }), 0)
  assert.deepEqual(JSON.parse(lines[0]), { routesChecked: 0, probes: 0, errors: [] })
})

test('runCli uses the console by default', () => {
  const clean = fs.mkdtempSync(path.join(fixtureRoot, 'console-'))
  const original = console.log
  const originalError = console.error
  const lines = []
  console.log = (line) => lines.push(line)
  console.error = (line) => lines.push(line)
  try {
    assert.equal(runCli({ argv: [], appRoot: clean, moduleIds: [] }), 0)
  } finally {
    console.log = original
    console.error = originalError
  }
  assert.deepEqual(lines, ['route-isolation:check: 0 route(s), 0 probe(s), 0 problem(s)'])
})
