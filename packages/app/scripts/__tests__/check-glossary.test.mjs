// TEST-N10 of the navigation spec — the retired-term check (#257).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  ALLOW_LIST_FILE,
  RETIRED_TERMS,
  applyAllowList,
  catalogFiles,
  checkGlossary,
  findRetiredTerms,
  readAllowList,
  runCli,
} from '../check-glossary.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-glossary-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

// Writes an app root with the given module catalogs ({ moduleId: catalog }), app catalog and allow-list.
function writeApp(name, { modules = {}, app, allowList } = {}) {
  const appRoot = path.join(fixtureRoot, name)
  fs.mkdirSync(path.join(appRoot, 'src', 'modules', 'no_catalog'), { recursive: true })
  for (const [id, catalog] of Object.entries(modules)) {
    fs.mkdirSync(path.join(appRoot, 'src', 'modules', id, 'i18n'), { recursive: true })
    fs.writeFileSync(path.join(appRoot, 'src', 'modules', id, 'i18n', 'pl.json'), JSON.stringify(catalog))
  }
  if (app) {
    fs.mkdirSync(path.join(appRoot, 'src', 'i18n'), { recursive: true })
    fs.writeFileSync(path.join(appRoot, 'src', 'i18n', 'pl.json'), JSON.stringify(app))
  }
  if (allowList) {
    fs.mkdirSync(path.join(appRoot, 'scripts'), { recursive: true })
    fs.writeFileSync(path.join(appRoot, ALLOW_LIST_FILE), JSON.stringify(allowList))
  }
  return appRoot
}

const patterns = (matches) => matches.map((match) => [match.key, match.pattern])

test('the retired list is the one of the spec', () => {
  assert.deepEqual(
    RETIRED_TERMS.map((term) => term.pattern),
    ['wnios', 'zdarze', 'stawk\\p{L}* najmu', 'zamówieni\\p{L}* grupow', 'niestawieni', 'obiekt', 'harmonogram'],
  )
})

test('findRetiredTerms finds every pattern in its scope, case-insensitively', () => {
  const catalog = {
    'facilities.requests.create': 'Złóż WNIOSEK',
    'facilities.records.incident': 'Zgłoś zdarzenie',
    'facilities.rates.title': 'Stawki najmu',
    'payments.orders.title': 'Zamówienia grupowe',
    'facilities.rentals.status.no_show': 'Niestawienie się',
    'club_core.places.title': 'Obiekty',
    'activities.nav.group': 'Harmonogram',
    'facilities.count': { one: 'not a string' },
  }
  assert.deepEqual(patterns(findRetiredTerms('pl.json', catalog)), [
    ['facilities.requests.create', 'wnios'],
    ['facilities.records.incident', 'zdarze'],
    ['facilities.rates.title', 'stawk\\p{L}* najmu'],
    ['payments.orders.title', 'zamówieni\\p{L}* grupow'],
    ['facilities.rentals.status.no_show', 'niestawieni'],
    ['club_core.places.title', 'obiekt'],
    ['activities.nav.group', 'harmonogram'],
  ])
  const [first] = findRetiredTerms('a/pl.json', catalog)
  assert.deepEqual(first, {
    file: 'a/pl.json',
    key: 'facilities.requests.create',
    pattern: 'wnios',
    replacement: 'zgłoszenie',
    value: 'Złóż WNIOSEK',
  })
})

test('findRetiredTerms passes the scoped patterns outside their scope', () => {
  const catalog = {
    'ui.inputs.eventSelect.empty': 'Brak dostępnych zdarzeń',
    'facilities.places.title': 'Obiekty klubu',
    'activities.reports.schedule': 'Harmonogram tygodnia',
    'activities.nav.label': 'Harmonogram',
    'club_core.sections.title': 'Sekcje',
  }
  assert.deepEqual(findRetiredTerms('pl.json', catalog), [])
})

test('applyAllowList excuses an allow-listed match and reports the others and stale entries', () => {
  const matches = [
    { file: 'pl.json', key: 'a.nav.group', pattern: 'harmonogram', replacement: 'Zajęcia', value: 'Harmonogram' },
    { file: 'pl.json', key: 'b.cta', pattern: 'wnios', replacement: 'zgłoszenie', value: 'Złóż wniosek' },
  ]
  const errors = applyAllowList(matches, [
    { key: 'a.nav.group', pattern: 'harmonogram', reason: 'waits for the shared group key' },
    { key: 'b.cta', pattern: 'zdarze', reason: 'wrong pattern' },
  ])
  assert.deepEqual(errors, [
    `pl.json: "b.cta" uses the retired term /wnios/ ("Złóż wniosek"); write "zgłoszenie" or allow-list the key in ${ALLOW_LIST_FILE}`,
    `${ALLOW_LIST_FILE}: the entry "b.cta" /zdarze/ matches no catalog value; remove it`,
  ])
  assert.deepEqual(applyAllowList([], []), [])
})

test('readAllowList reads the entries and rejects malformed ones', () => {
  assert.deepEqual(readAllowList(writeApp('no-allow-list')), { entries: [], errors: [] })
  const valid = { key: 'a.nav.group', pattern: 'harmonogram', reason: 'r' }
  assert.deepEqual(readAllowList(writeApp('valid-allow-list', { allowList: { entries: [valid] } })), {
    entries: [valid],
    errors: [],
  })
  const malformed = [
    { pattern: 'wnios', reason: 'r' },
    { key: 'k', pattern: 'unknown', reason: 'r' },
    { key: 'k', pattern: 'wnios' },
  ]
  const { errors } = readAllowList(writeApp('malformed-allow-list', { allowList: { entries: malformed } }))
  assert.equal(errors.length, 3)
  assert.match(errors[0], /every entry needs "key", a retired "pattern" and a "reason"/)
  assert.deepEqual(readAllowList(writeApp('no-entries', { allowList: {} })), {
    entries: [],
    errors: [`${ALLOW_LIST_FILE}: "entries" must be an array`],
  })
})

test('catalogFiles lists the module catalogs in order, then the application catalog', () => {
  const appRoot = writeApp('catalogs', { modules: { people: {}, club_core: {} }, app: {} })
  assert.deepEqual(catalogFiles(appRoot), [
    path.join('src', 'modules', 'club_core', 'i18n', 'pl.json'),
    path.join('src', 'modules', 'people', 'i18n', 'pl.json'),
    path.join('src', 'i18n', 'pl.json'),
  ])
  assert.deepEqual(catalogFiles(writeApp('no-app-catalog', { modules: { people: {} } })), [
    path.join('src', 'modules', 'people', 'i18n', 'pl.json'),
  ])
})

test('checkGlossary fails on "Złóż wniosek" outside the allow-list and names the key, the term and the file', () => {
  const appRoot = writeApp('negative', {
    modules: { facilities: { 'facilities.public.cta': 'Złóż wniosek' } },
    app: { 'ui.ok': 'OK' },
  })
  const file = path.join('src', 'modules', 'facilities', 'i18n', 'pl.json')
  assert.deepEqual(checkGlossary({ appRoot }), {
    catalogsChecked: 2,
    errors: [
      `${file}: "facilities.public.cta" uses the retired term /wnios/ ("Złóż wniosek"); write "zgłoszenie" or allow-list the key in ${ALLOW_LIST_FILE}`,
    ],
  })
})

test('checkGlossary passes a clean catalog and an allow-listed retired term', () => {
  const appRoot = writeApp('allowed', {
    modules: { activities: { 'activities.nav.group': 'Harmonogram', 'activities.title': 'Aktywności' } },
    allowList: { entries: [{ key: 'activities.nav.group', pattern: 'harmonogram', reason: 'r' }] },
  })
  assert.deepEqual(checkGlossary({ appRoot }), { catalogsChecked: 1, errors: [] })
})

test('checkGlossary reports a malformed allow-list', () => {
  const appRoot = writeApp('bad-list', { modules: { people: {} }, allowList: { entries: [{ key: 'k' }] } })
  assert.equal(checkGlossary({ appRoot }).errors.length, 2)
})

test('runCli prints each problem and returns the exit code', () => {
  const lines = []
  const problems = []
  const clean = writeApp('cli-clean', { modules: { people: { 'people.title': 'Osoby' } } })
  assert.equal(runCli({ appRoot: clean, log: (line) => lines.push(line), error: (line) => problems.push(line) }), 0)
  assert.deepEqual(lines, ['glossary:check: 1 Polish catalog(s), 0 problem(s)'])
  const dirty = writeApp('cli-dirty', { modules: { facilities: { 'facilities.x': 'Wniosek' } } })
  assert.equal(runCli({ appRoot: dirty, log: (line) => lines.push(line), error: (line) => problems.push(line) }), 1)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^glossary:check: .*"facilities\.x" uses the retired term \/wnios\//)
})

test('runCli defaults to the console', (t) => {
  const log = t.mock.method(console, 'log', () => {})
  const error = t.mock.method(console, 'error', () => {})
  runCli({ appRoot: writeApp('cli-console', { modules: { facilities: { 'facilities.x': 'Wniosek' } } }) })
  assert.equal(log.mock.callCount(), 1)
  assert.equal(error.mock.callCount(), 1)
})

test('the real catalogs pass', () => {
  assert.deepEqual(checkGlossary().errors, [])
})
