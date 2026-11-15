// The catalog-backed UI texts of the integration tests and `qa-texts:check` (lesson `qa-ui-texts-from-catalogs`).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import ts from 'typescript'
import {
  BASELINE_FILE,
  LOCALES,
  QA_TESTS_DIR,
  catalogSources,
  checkQaTexts,
  createUiText,
  escapeRegExp,
  hardcodedAlternatives,
  qaFiles,
  readBaseline,
  readCatalogs,
  runCli,
  scanSource,
  textPattern,
  uiTextPattern,
} from '../vereino-ui-texts.mjs'

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-ui-texts-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))

function write(root, file, content) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
  fs.writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content))
}

// An app root with catalogs ({ 'relative/i18n/en.json': catalog }), QA test files ({ name: source }) and a baseline.
function writeApp(name, { catalogs = {}, tests = {}, baseline } = {}) {
  const appRoot = path.join(fixtureRoot, name)
  fs.mkdirSync(appRoot, { recursive: true })
  for (const [file, catalog] of Object.entries(catalogs)) write(appRoot, file, catalog)
  for (const [file, source] of Object.entries(tests)) write(appRoot, `${QA_TESTS_DIR}/${file}`, source)
  if (baseline) write(appRoot, BASELINE_FILE, baseline)
  return appRoot
}

const BOTH = {
  'src/modules/people/i18n/en.json': { 'people.save': 'Save', 'people.hello': 'Hello {name}', 'people.count': 3 },
  'src/modules/people/i18n/pl.json': { 'people.save': 'Zapisz', 'people.hello': 'Cześć {name}' },
}

test('the locales and paths', () => {
  assert.deepEqual(LOCALES, ['en', 'pl'])
  assert.equal(QA_TESTS_DIR, '.ai/qa/tests')
  assert.equal(BASELINE_FILE, 'scripts/vereino-ui-texts.baseline.json')
})

test('catalogSources lists the platform, then the modules, then the app catalog, skipping node_modules and dist', () => {
  const appRoot = writeApp('sources', {
    catalogs: {
      'node_modules/@open-mercato/core/src/modules/auth/i18n/en.json': {},
      'node_modules/@open-mercato/core/node_modules/x/i18n/en.json': {},
      'node_modules/@open-mercato/core/dist/modules/auth/i18n/en.json': {},
      'node_modules/@open-mercato/core/src/en.json': {},
      'node_modules/@open-mercato/core/src/modules/auth/i18n/pl.json': {},
      'src/modules/people/i18n/en.json': {},
      'src/i18n/en.json': {},
    },
  })
  const rel = (files) => files.map((file) => path.relative(appRoot, file).split(path.sep).join('/'))
  assert.deepEqual(rel(catalogSources(appRoot, 'en')), [
    'node_modules/@open-mercato/core/src/modules/auth/i18n/en.json',
    'src/modules/people/i18n/en.json',
    'src/i18n/en.json',
  ])
  assert.deepEqual(catalogSources(writeApp('no-sources'), 'en'), [])
})

test('readCatalogs keeps the strings, a later source overriding an earlier one', () => {
  const appRoot = writeApp('read', {
    catalogs: {
      ...BOTH,
      'node_modules/@open-mercato/ui/i18n/en.json': { 'people.save': 'Platform save', 'common.ok': 'OK' },
      'src/i18n/en.json': { 'common.ok': 'Fine' },
    },
  })
  const catalogs = readCatalogs(appRoot)
  assert.equal(catalogs.en.get('people.save'), 'Save')
  assert.equal(catalogs.en.get('common.ok'), 'Fine')
  assert.equal(catalogs.en.has('people.count'), false)
  assert.equal(catalogs.pl.get('people.hello'), 'Cześć {name}')
})

test('escapeRegExp and textPattern', () => {
  assert.equal(escapeRegExp('a.b(c)|d'), 'a\\.b\\(c\\)\\|d')
  assert.equal(textPattern('Plain.'), 'Plain\\.')
  assert.equal(textPattern('Hi {name}, {{count}} new'), 'Hi .+?, .+? new')
  assert.equal(textPattern('Hi {name}, {{count}} new', { name: 'A.B', count: 2 }), 'Hi A\\.B, 2 new')
})

test('uiTextPattern joins the locales, anchors on exact and refuses an unknown key', () => {
  const catalogs = {
    en: new Map([
      ['k.save', 'Save'],
      ['k.same', 'OK'],
      ['k.en_only', 'Only'],
    ]),
    pl: new Map([
      ['k.save', 'Zapisz'],
      ['k.same', 'OK'],
    ]),
  }
  assert.deepEqual(uiTextPattern(catalogs, 'k.save'), /(?:Save|Zapisz)/)
  assert.deepEqual(uiTextPattern(catalogs, 'k.save', { exact: true }), /^(?:Save|Zapisz)$/)
  assert.deepEqual(uiTextPattern(catalogs, 'k.same', {}), /(?:OK)/)
  assert.throws(() => uiTextPattern(catalogs, 'k.en_only'), /the pl catalog has no key "k.en_only"/)
  assert.throws(() => uiTextPattern(catalogs, 'k.none'), /the en catalog has no key "k.none"/)
})

test('createUiText reads the catalogs once, on first use', () => {
  const appRoot = writeApp('create', { catalogs: BOTH })
  const uiText = createUiText(appRoot)
  assert.deepEqual(uiText('people.hello', { params: { name: 'Ala' } }), /(?:Hello Ala|Cześć Ala)/)
  fs.rmSync(path.join(appRoot, 'src'), { recursive: true })
  assert.deepEqual(uiText('people.save', { exact: true }), /^(?:Save|Zapisz)$/)
  assert.ok(createUiText()('common.save').test('Zapisz'))
})

test('hardcodedAlternatives recognises the bilingual text literals only', () => {
  assert.deepEqual(hardcodedAlternatives('/^(Save|Zapisz)$/'), ['Save', 'Zapisz'])
  assert.deepEqual(hardcodedAlternatives('/(?:Save|Zapisz)/'), ['Save', 'Zapisz'])
  assert.deepEqual(hardcodedAlternatives('/^Save$|^Zapisz$/'), ['Save', 'Zapisz'])
  assert.deepEqual(hardcodedAlternatives('/Saved\\. Done|Zapisano\\./'), ['Saved. Done', 'Zapisano.'])
  assert.deepEqual(hardcodedAlternatives('/^(Save \\(draft\\)|Zapisz)$/'), ['Save (draft)', 'Zapisz'])
  assert.equal(hardcodedAlternatives('/^(Save|Zapisz)$/i'), null)
  assert.equal(hardcodedAlternatives('/^(a(b)|c)$/'), null)
  assert.equal(hardcodedAlternatives('/^Save$/'), null)
  assert.equal(hardcodedAlternatives('/Save.*|Zapisz/'), null)
  assert.equal(hardcodedAlternatives('/\\d+ items|\\d+ pozycji/'), null)
  assert.equal(hardcodedAlternatives('/12|34/'), null)
})

test('qaFiles lists the QA test files with forward slashes', () => {
  const appRoot = writeApp('files', { tests: { 'b/two.spec.ts': '', 'a.ts': '', 'notes.md': '' } })
  assert.deepEqual(qaFiles(appRoot), [`${QA_TESTS_DIR}/a.ts`, `${QA_TESTS_DIR}/b/two.spec.ts`])
  assert.deepEqual(qaFiles(writeApp('no-tests')), [])
})

test('scanSource finds the hardcoded texts and the uiText keys', () => {
  const source = [
    'const a = /^(Save|Zapisz)$/',
    'const b = /^\\d+$/',
    "const c = uiText('people.save', { exact: true })",
    'const d = uiText()',
    "const e = other('people.x')",
    'const f = uiText(key)',
    "const g = helpers.uiText('people.y')",
    'const h = uiText(`people.z`)',
  ].join('\n')
  assert.deepEqual(scanSource(ts, 'x.ts', source), {
    hardcoded: [{ line: 1, text: '/^(Save|Zapisz)$/' }],
    keys: [
      { line: 3, key: 'people.save' },
      { line: 8, key: 'people.z' },
    ],
  })
})

test('readBaseline reads the file or nothing', () => {
  assert.deepEqual(readBaseline(writeApp('no-baseline')), {})
  assert.deepEqual(readBaseline(writeApp('baseline', { baseline: { 'x.ts': 2 } })), { 'x.ts': 2 })
})

test('checkQaTexts passes a clean app', () => {
  const appRoot = writeApp('clean', {
    catalogs: BOTH,
    tests: { 'a.spec.ts': "uiText('people.save')\nconst old = /Save|Zapisz/" },
    baseline: { [`${QA_TESTS_DIR}/a.spec.ts`]: 1 },
  })
  assert.deepEqual(checkQaTexts({ appRoot, ts }), { filesChecked: 1, hardcoded: 1, errors: [] })
})

test('checkQaTexts reports unknown keys, texts above or below the baseline and stale entries', () => {
  const appRoot = writeApp('dirty', {
    catalogs: { ...BOTH, 'src/modules/people/i18n/en.json': { 'people.save': 'Save', 'people.en_only': 'Only' } },
    tests: {
      'new.spec.ts': "uiText('people.en_only')\nuiText('people.none')\nconst a = /A|Ą/\nconst b = /B|Ć/",
      'old.spec.ts': 'const a = /A|Ą/',
      'clean.spec.ts': '',
    },
    baseline: {
      [`${QA_TESTS_DIR}/new.spec.ts`]: 1,
      [`${QA_TESTS_DIR}/old.spec.ts`]: 3,
      [`${QA_TESTS_DIR}/gone.spec.ts`]: 1,
    },
  })
  const result = checkQaTexts({ appRoot, ts })
  assert.equal(result.filesChecked, 3)
  assert.equal(result.hardcoded, 3)
  assert.deepEqual(result.errors, [
    `${QA_TESTS_DIR}/new.spec.ts:1: uiText("people.en_only") — the pl catalog has no such key`,
    `${QA_TESTS_DIR}/new.spec.ts:2: uiText("people.none") — the en catalog has no such key`,
    `${QA_TESTS_DIR}/new.spec.ts:2: uiText("people.none") — the pl catalog has no such key`,
    `${QA_TESTS_DIR}/new.spec.ts:4: 2 hardcoded UI text(s), the baseline allows 1 — write /B|Ć/ as uiText('<key>') from _fixtures/ui-text`,
    `${BASELINE_FILE}: "${QA_TESTS_DIR}/old.spec.ts" has 1 hardcoded UI text(s) now; lower its entry to 1`,
    `${BASELINE_FILE}: "${QA_TESTS_DIR}/gone.spec.ts" is not a QA test file; remove its entry`,
  ])
})

test('runCli prints each problem and returns the exit code', async () => {
  const lines = []
  const problems = []
  const io = { log: (line) => lines.push(line), error: (line) => problems.push(line) }
  const clean = writeApp('cli-clean', { catalogs: BOTH, tests: { 'a.spec.ts': "uiText('people.save')" } })
  assert.equal(await runCli({ appRoot: clean, ts, ...io }), 0)
  const dirty = writeApp('cli-dirty', { catalogs: BOTH, tests: { 'a.spec.ts': 'const a = /Save|Zapisz/' } })
  assert.equal(await runCli({ appRoot: dirty, ...io }), 1)
  assert.deepEqual(lines, [
    'qa-texts:check: 1 test file(s), 0 hardcoded UI text(s) left, 0 problem(s)',
    'qa-texts:check: 1 test file(s), 1 hardcoded UI text(s) left, 1 problem(s)',
  ])
  assert.equal(problems.length, 1)
})

test('runCli defaults to the console', async (t) => {
  const log = t.mock.method(console, 'log', () => {})
  const error = t.mock.method(console, 'error', () => {})
  await runCli({
    appRoot: writeApp('cli-console', { catalogs: BOTH, tests: { 'a.spec.ts': 'const a = /Save|Zapisz/' } }),
    ts,
  })
  assert.equal(log.mock.callCount(), 1)
  assert.equal(error.mock.callCount(), 1)
})

test('the real QA tests pass', () => {
  assert.deepEqual(checkQaTexts({ ts }).errors, [])
})
