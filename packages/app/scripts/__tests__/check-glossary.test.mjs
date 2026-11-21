// TEST-N10 of the navigation spec — the glossary check (#257; Polish and English catalogs and term pairs: #494).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import {
  ALLOW_LIST_FILE,
  LOCALES,
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

// Writes an app root with the given Polish and English module catalogs ({ moduleId: catalog }), app catalog and
// allow-list.
function writeApp(name, { modules = {}, enModules = {}, app, allowList } = {}) {
  const appRoot = path.join(fixtureRoot, name)
  fs.mkdirSync(path.join(appRoot, 'src', 'modules', 'no_catalog'), { recursive: true })
  for (const [locale, catalogs] of [
    ['pl', modules],
    ['en', enModules],
  ]) {
    for (const [id, catalog] of Object.entries(catalogs)) {
      fs.mkdirSync(path.join(appRoot, 'src', 'modules', id, 'i18n'), { recursive: true })
      fs.writeFileSync(path.join(appRoot, 'src', 'modules', id, 'i18n', `${locale}.json`), JSON.stringify(catalog))
    }
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

const SESSION_PAIR = 'zaję(?:cia|ć|ciach|ciom|ciami)(?!\\p{L})'

test('the rules are the ones of the spec, per locale', () => {
  assert.deepEqual(LOCALES, ['pl', 'en'])
  const byLocale = (locale) => RETIRED_TERMS.filter((term) => term.locale === locale).map((term) => term.pattern)
  assert.deepEqual(byLocale('pl'), [
    'wnios',
    'zdarze',
    'stawk\\p{L}* najmu',
    'zamówieni\\p{L}* grupow',
    'niestawieni',
    'obiekt',
    'składk\\p{L}* i zniżk',
    'harmonogram',
    '^grupy$',
    'wiadomości',
    'płatności',
    'obiekty',
    SESSION_PAIR,
    'trener',
  ])
  assert.deepEqual(byLocale('en'), ['sparring', 'schedule', '^groups$', 'messages', 'payments', 'facilities'])
  assert.equal(RETIRED_TERMS.length, 20)
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
  const polish = RETIRED_TERMS.filter((term) => term.locale === 'pl')
  assert.deepEqual(patterns(findRetiredTerms('pl.json', catalog, polish)), [
    ['facilities.requests.create', 'wnios'],
    ['facilities.records.incident', 'zdarze'],
    ['facilities.rates.title', 'stawk\\p{L}* najmu'],
    ['payments.orders.title', 'zamówieni\\p{L}* grupow'],
    ['facilities.rentals.status.no_show', 'niestawieni'],
    ['club_core.places.title', 'obiekt'],
    ['activities.nav.group', 'harmonogram'],
  ])
  const [first] = findRetiredTerms('a/pl.json', catalog, polish)
  assert.deepEqual(first, {
    file: 'a/pl.json',
    key: 'facilities.requests.create',
    pattern: 'wnios',
    replacement: 'zgłoszenie',
    value: 'Złóż WNIOSEK',
  })
})

test('findRetiredTerms finds the menu group names the mockup retired, in both locales', () => {
  const polish = RETIRED_TERMS.filter((term) => term.locale === 'pl')
  const english = RETIRED_TERMS.filter((term) => term.locale === 'en')
  assert.deepEqual(
    patterns(
      findRetiredTerms(
        'pl.json',
        {
          'groups.nav.group': 'Grupy',
          'communication.nav.group': 'Wiadomości',
          'payments.nav.group': 'Płatności',
          'facilities.nav.group': 'Obiekty',
          'club_core.publication.blocks.prices.help': 'Składki i zniżki; widoczne później.',
          'groups.club.nav.groups': 'Grupy',
          'payments.club.nav.payments': 'Płatności',
        },
        polish,
      ),
    ),
    [
      ['groups.nav.group', '^grupy$'],
      ['communication.nav.group', 'wiadomości'],
      ['payments.nav.group', 'płatności'],
      ['facilities.nav.group', 'obiekty'],
      ['club_core.publication.blocks.prices.help', 'składk\\p{L}* i zniżk'],
    ],
  )
  assert.deepEqual(
    patterns(
      findRetiredTerms(
        'en.json',
        {
          'activities.nav.group': 'Schedule',
          'groups.nav.group': 'Groups',
          'communication.nav.group': 'Messages',
          'payments.nav.group': 'Payments',
          'facilities.nav.group': 'Facilities',
          'club_core.public.events.type.sparring': 'Sparring',
          'groups.club.nav.groups': 'Groups',
          'facilities.places.title': 'Facilities',
        },
        english,
      ),
    ),
    [
      ['activities.nav.group', 'schedule'],
      ['groups.nav.group', '^groups$'],
      ['communication.nav.group', 'messages'],
      ['payments.nav.group', 'payments'],
      ['facilities.nav.group', 'facilities'],
      ['club_core.public.events.type.sparring', 'sparring'],
    ],
  )
  assert.deepEqual(
    findRetiredTerms('pl.json', { 'groups.nav.group': 'Zajęcia', 'facilities.nav.group': 'Obiekt' }, polish),
    [],
  )
})

test('findRetiredTerms applies a term pair only where the English value of the key names the thing', () => {
  const polish = RETIRED_TERMS.filter((term) => term.locale === 'pl')
  const catalog = {
    'activities.club.edit.title': 'Edycja zajęć',
    'activities.club.edit.saved': 'Zajęcia zapisane.',
    'activities.types.classes': 'Zajęcia',
    'activities.substitutions.busy': 'Zajęty: {session}',
    'groups.kind.help': 'grupa zajęciowa',
    'activities.clubEvents.part.columns.coach': 'Trener',
    'activities.clubEvents.part.changeCoach': 'Zmień trenera',
    'people.leaving.handOver.unassigned': 'Zostaw bez trenera',
    'people.roles.role.coach': 'Trener',
    'activities.club.nav.contextCoach': 'jako trener',
    'activities.fields.coach': 'Trener',
    'activities.missing.english.coach': 'Trener',
  }
  const english = {
    'activities.club.edit.title': 'Edit session',
    'activities.club.edit.saved': 'Session saved.',
    'activities.types.classes': 'Classes',
    'activities.substitutions.busy': 'Busy: {session}',
    'groups.kind.help': 'a class group (sessions)',
    'activities.clubEvents.part.columns.coach': 'Coach',
    'activities.clubEvents.part.changeCoach': 'Change coach',
    'people.leaving.handOver.unassigned': 'Leave unassigned',
    'people.roles.role.coach': 'Coach',
    'activities.club.nav.contextCoach': 'as coach',
    'activities.fields.coach': { one: 'not a string' },
  }
  assert.deepEqual(patterns(findRetiredTerms('pl.json', catalog, polish, english)), [
    ['activities.club.edit.title', SESSION_PAIR],
    ['activities.club.edit.saved', SESSION_PAIR],
    ['activities.clubEvents.part.columns.coach', 'trener'],
    ['activities.clubEvents.part.changeCoach', 'trener'],
    ['people.leaving.handOver.unassigned', 'trener'],
  ])
  // Without the English catalog no pair applies.
  assert.deepEqual(findRetiredTerms('pl.json', catalog, polish), [])
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
  assert.deepEqual(findRetiredTerms('pl.json', { 'payments.title': 'Płatności', 'groups.title': 'Grupy' }), [])
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

test('catalogFiles lists the module catalogs of a locale in order, then the application catalog', () => {
  const appRoot = writeApp('catalogs', { modules: { people: {}, club_core: {} }, enModules: { people: {} }, app: {} })
  assert.deepEqual(catalogFiles(appRoot), [
    path.join('src', 'modules', 'club_core', 'i18n', 'pl.json'),
    path.join('src', 'modules', 'people', 'i18n', 'pl.json'),
    path.join('src', 'i18n', 'pl.json'),
  ])
  assert.deepEqual(catalogFiles(appRoot, 'en'), [path.join('src', 'modules', 'people', 'i18n', 'en.json')])
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

test('checkGlossary fails on every case of #494 and names the key: retired English terms and violated pairs', () => {
  const appRoot = writeApp('negative-494', {
    modules: {
      activities: {
        'activities.club.edit.title': 'Edycja zajęć',
        'activities.clubEvents.part.columns.coach': 'Trener',
        'activities.clubEvents.part.changeCoach': 'Zmień trenera',
      },
      people: { 'people.leaving.handOver.unassigned': 'Zostaw bez trenera' },
      club_core: { 'club_core.publication.blocks.prices.help': 'Składki i zniżki; widoczne później.' },
    },
    enModules: {
      activities: {
        'activities.club.edit.title': 'Edit session',
        'activities.clubEvents.part.columns.coach': 'Coach',
        'activities.clubEvents.part.changeCoach': 'Change coach',
      },
      people: { 'people.leaving.handOver.unassigned': 'Leave unassigned' },
      club_core: { 'club_core.public.events.type.sparring': 'Sparring' },
    },
  })
  const result = checkGlossary({ appRoot })
  assert.equal(result.catalogsChecked, 6)
  const keys = result.errors.map((error) => error.match(/"([^"]+)" uses/)[1])
  assert.deepEqual(keys, [
    'activities.club.edit.title',
    'activities.clubEvents.part.columns.coach',
    'activities.clubEvents.part.changeCoach',
    'club_core.publication.blocks.prices.help',
    'people.leaving.handOver.unassigned',
    'club_core.public.events.type.sparring',
  ])
  assert.equal(
    result.errors[5],
    `${path.join('src', 'modules', 'club_core', 'i18n', 'en.json')}: "club_core.public.events.type.sparring" uses the retired term /sparring/ ("Sparring"); write "friendly" or allow-list the key in ${ALLOW_LIST_FILE}`,
  )
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
  assert.deepEqual(lines, ['glossary:check: 1 Polish and English catalog(s), 0 problem(s)'])
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
