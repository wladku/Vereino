// TEST-N02 of the navigation spec — the settings-page guard (#246).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  GENERATED_FILE,
  checkSettingsPrefixes,
  findConflicts,
  parseRoutes,
  runCli,
  settingsPrefixes,
} from '../check-settings-prefixes.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-settings-prefixes-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

const inlineEntry = (moduleId, routePath, metadata) =>
  `  {\n    moduleId: "${moduleId}",\n    ...resolvePageRouteMetadata("${routePath}", (${JSON.stringify(metadata)} as any))\n  },\n`
const importedEntry = (moduleId, routePath) =>
  `  {\n    moduleId: "${moduleId}",\n    ...resolvePageRouteMetadata("${routePath}", (((BMManifest1 as any).metadata) as any))\n  },\n`

function writeGenerated(name, entries) {
  const appRoot = path.join(fixtureRoot, name)
  fs.mkdirSync(path.join(appRoot, path.dirname(GENERATED_FILE)), { recursive: true })
  fs.writeFileSync(path.join(appRoot, GENERATED_FILE), `export const backendRouteMetadata = [\n${entries.join('')}]\n`)
  return appRoot
}

const settings = { pageTitle: 'Settings', pageContext: 'settings' }
const regular = { pageTitle: 'List' }

test('settingsPrefixes follows the platform rule', () => {
  assert.deepEqual(settingsPrefixes('/backend/club/publication'), ['/backend/club', '/backend/club/publication'])
  assert.deepEqual(settingsPrefixes('/backend/club/settings'), ['/backend/club/settings'])
  assert.deepEqual(settingsPrefixes('/backend/club'), ['/backend/club'])
})

test('parseRoutes reads the inline metadata of the given modules only', () => {
  const source = [
    inlineEntry('club_core', '/backend/club/sections', regular),
    inlineEntry('club_core', '/backend/club/settings', settings),
    inlineEntry('club_core', '/backend/club/main', { pageContext: 'main' }),
    importedEntry('auth', '/backend/roles'),
  ].join('')
  assert.deepEqual(parseRoutes(source, ['club_core']), {
    routes: [
      { moduleId: 'club_core', path: '/backend/club/sections', pageContext: 'main' },
      { moduleId: 'club_core', path: '/backend/club/settings', pageContext: 'settings' },
      { moduleId: 'club_core', path: '/backend/club/main', pageContext: 'main' },
    ],
    errors: [],
  })
})

test('parseRoutes fails closed on a Vereino entry it cannot read', () => {
  const source =
    importedEntry('club_core', '/backend/club/imported') +
    `  {\n    moduleId: "club_core",\n    ...resolvePageRouteMetadata("/backend/club/broken", ({not json} as any))\n  },\n`
  assert.deepEqual(parseRoutes(source, ['club_core']), {
    routes: [],
    errors: [
      `club_core: cannot read the metadata of /backend/club/imported from ${GENERATED_FILE}`,
      `club_core: cannot read the metadata of /backend/club/broken from ${GENERATED_FILE}`,
    ],
  })
})

test('a settings page beside a regular page under one parent fails and names both pages', () => {
  const conflicts = findConflicts([
    { moduleId: 'club_core', path: '/backend/club/publication', pageContext: 'settings' },
    { moduleId: 'club_core', path: '/backend/club/settings', pageContext: 'settings' },
    { moduleId: 'club_core', path: '/backend/club/places', pageContext: 'main' },
  ])
  assert.deepEqual(conflicts, [
    'club_core: the settings page /backend/club/publication makes /backend/club a settings prefix, so /backend/club/places (club_core) leaves the main sidebar',
  ])
})

test('a settings page alone and a path ending in settings pass', () => {
  assert.deepEqual(
    findConflicts([
      { moduleId: 'a', path: '/backend/alone/config', pageContext: 'settings' },
      { moduleId: 'b', path: '/backend/club/settings', pageContext: 'settings' },
      { moduleId: 'b', path: '/backend/club/places', pageContext: 'main' },
    ]),
    [],
  )
})

test('a regular page under the settings page itself fails', () => {
  assert.equal(
    findConflicts([
      { moduleId: 'b', path: '/backend/club/settings', pageContext: 'settings' },
      { moduleId: 'b', path: '/backend/club/settings/extra', pageContext: 'main' },
    ]).length,
    1,
  )
})

test('checkSettingsPrefixes reads the generated file of the app', () => {
  const clean = writeGenerated('clean', [
    inlineEntry('club_core', '/backend/club/places', regular),
    inlineEntry('club_core', '/backend/club/settings', settings),
  ])
  assert.deepEqual(checkSettingsPrefixes({ appRoot: clean, moduleIds: ['club_core'] }), {
    routesChecked: 2,
    errors: [],
  })

  const broken = writeGenerated('broken', [
    inlineEntry('club_core', '/backend/club/places', regular),
    inlineEntry('club_core', '/backend/club/publication', settings),
  ])
  assert.equal(checkSettingsPrefixes({ appRoot: broken, moduleIds: ['club_core'] }).errors.length, 1)
})

test('checkSettingsPrefixes reports a missing file and a file without Vereino routes', () => {
  assert.deepEqual(checkSettingsPrefixes({ appRoot: path.join(fixtureRoot, 'none'), moduleIds: ['club_core'] }), {
    routesChecked: 0,
    errors: [`${GENERATED_FILE} is missing; run yarn generate first`],
  })
  const empty = writeGenerated('empty', [importedEntry('auth', '/backend/roles')])
  assert.deepEqual(checkSettingsPrefixes({ appRoot: empty, moduleIds: ['club_core'] }), {
    routesChecked: 0,
    errors: [`no Vereino route found in ${GENERATED_FILE}; the generated format may have changed`],
  })
})

test('runCli prints the problems and returns the exit code', () => {
  const lines = []
  const problems = []
  const io = { log: (line) => lines.push(line), error: (line) => problems.push(line) }
  const clean = writeGenerated('cli-clean', [inlineEntry('club_core', '/backend/club/places', regular)])
  assert.equal(runCli({ appRoot: clean, moduleIds: ['club_core'], ...io }), 0)
  assert.deepEqual(lines, ['settings-prefixes:check: 1 Vereino page(s), 0 problem(s)'])

  assert.equal(runCli({ appRoot: path.join(fixtureRoot, 'none'), moduleIds: ['club_core'], ...io }), 1)
  assert.deepEqual(problems, [`settings-prefixes:check: ${GENERATED_FILE} is missing; run yarn generate first`])
})

test('the repository default reads vereino-modules.json and the real generated file', () => {
  const lines = []
  runCli({ log: (line) => lines.push(line), error: () => {} })
  assert.match(lines[0], /^settings-prefixes:check: \d+ Vereino page\(s\)/)
})
