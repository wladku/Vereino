// Glossary check (navigation spec REQ-N11, DD-N12, TEST-N10; issues #257, #494).
// D-031 §2 makes the mockup's words the application's words. The spec's "Glossary (D-031 §2)" retires terms; this check
// keeps them out of the catalogs while other specs keep adding texts. It reads the Polish and the English catalogs of
// every module and of the application, and knows two kinds of rule:
// - a retired term: a pattern no value of that locale may contain (within the term's key scope);
// - a term pair: a Polish pattern that is wrong where the English value of the same key names a given thing — "zajęcia"
//   where English says "session" (glossary rule 1: one meeting is "termin"), "trener" on the labels of the person who
//   runs a session or an activity (rule 2: "prowadzący").
// Rules 1 and 2 otherwise depend on meaning and are left to the native-reader review.
// A value may keep a matched term only through an entry { key, pattern, reason } of check-glossary.allow.json; an entry
// that no longer matches its value is stale and fails too, so the allow-list never outlives the text it excuses.
// Usage: node scripts/check-glossary.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT } from './vereino-paths.mjs'

export const ALLOW_LIST_FILE = 'scripts/check-glossary.allow.json'

export const LOCALES = ['pl', 'en']

const everyKey = () => true
const navGroup = (key) => key.endsWith('.nav.group')

// The keys that label the person running a session or an activity (glossary rule 2): pickers, columns, "no coach",
// "change coach", and the hand-over choice of a leaving coach. Role, contract and context labels keep "trener".
const RUNS_IT_KEY =
  /(?:\.(?:columns|fields|session|calendar|substitutions|details)\.coach|\.(?:noCoach|needsCoach|changeCoach|changeCoachTitle|chooseCoach|assignCoach|defaultCoach)|\.handOver\.unassigned)$/

// The rules, complete. `scope` decides which keys a rule applies to; `en`, when present, makes it a term pair: the rule
// applies only where the English value of the same key matches it.
export const RETIRED_TERMS = [
  { locale: 'pl', pattern: 'wnios', replacement: 'zgłoszenie', scope: everyKey },
  { locale: 'pl', pattern: 'zdarze', replacement: 'incydent', scope: (key) => key.startsWith('facilities.') },
  { locale: 'pl', pattern: 'stawk\\p{L}* najmu', replacement: 'cennik wynajmu', scope: everyKey },
  { locale: 'pl', pattern: 'zamówieni\\p{L}* grupow', replacement: 'zbiórka zamówień', scope: everyKey },
  { locale: 'pl', pattern: 'niestawieni', replacement: 'nie stawił się', scope: everyKey },
  { locale: 'pl', pattern: 'obiekt', replacement: 'miejsce', scope: (key) => key.startsWith('club_core.places.') },
  { locale: 'pl', pattern: 'składk\\p{L}* i zniżk', replacement: 'Cenniki i zniżki', scope: everyKey },
  { locale: 'pl', pattern: 'harmonogram', replacement: 'Zajęcia', scope: navGroup },
  { locale: 'pl', pattern: '^grupy$', replacement: 'Zajęcia', scope: navGroup },
  { locale: 'pl', pattern: 'wiadomości', replacement: 'Komunikacja', scope: navGroup },
  { locale: 'pl', pattern: 'płatności', replacement: 'Finanse', scope: navGroup },
  { locale: 'pl', pattern: 'obiekty', replacement: 'Obiekt', scope: navGroup },
  {
    locale: 'pl',
    pattern: 'zaję(?:cia|ć|ciach|ciom|ciami)(?!\\p{L})',
    en: '\\bsessions?\\b',
    replacement: 'termin',
    scope: everyKey,
  },
  {
    locale: 'pl',
    pattern: 'trener',
    en: '\\bcoach|\\bunassigned\\b',
    replacement: 'prowadzący',
    scope: (key) => RUNS_IT_KEY.test(key),
  },
  { locale: 'en', pattern: 'sparring', replacement: 'friendly', scope: everyKey },
  { locale: 'en', pattern: 'schedule', replacement: 'Classes', scope: navGroup },
  { locale: 'en', pattern: '^groups$', replacement: 'Classes', scope: navGroup },
  { locale: 'en', pattern: 'messages', replacement: 'Communication', scope: navGroup },
  { locale: 'en', pattern: 'payments', replacement: 'Finance', scope: navGroup },
  { locale: 'en', pattern: 'facilities', replacement: 'Facility', scope: navGroup },
]

// The catalogs of one locale: every module's and the application's own.
export function catalogFiles(appRoot = APP_ROOT, locale = 'pl') {
  const modulesDir = path.join(appRoot, 'src', 'modules')
  const moduleCatalogs = fs
    .readdirSync(modulesDir)
    .sort()
    .map((id) => path.join('src', 'modules', id, 'i18n', `${locale}.json`))
  return [...moduleCatalogs, path.join('src', 'i18n', `${locale}.json`)].filter((file) =>
    fs.existsSync(path.join(appRoot, file)),
  )
}

// Every (key, pattern) match of one catalog, in catalog order. `english` is the English catalog beside a Polish one;
// a term pair applies only where its English value matches.
export function findRetiredTerms(file, catalog, terms = RETIRED_TERMS, english = {}) {
  const matches = []
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string') continue
    for (const term of terms) {
      if (!term.scope(key) || !new RegExp(term.pattern, 'iu').test(value)) continue
      if (term.en && !(typeof english[key] === 'string' && new RegExp(term.en, 'iu').test(english[key]))) continue
      matches.push({ file, key, pattern: term.pattern, replacement: term.replacement, value })
    }
  }
  return matches
}

// Splits the matches into allow-listed and offending ones and reports allow-list entries that match nothing.
export function applyAllowList(matches, allowList) {
  const allowed = (match) => allowList.some((entry) => entry.key === match.key && entry.pattern === match.pattern)
  const errors = matches
    .filter((match) => !allowed(match))
    .map(
      (match) =>
        `${match.file}: "${match.key}" uses the retired term /${match.pattern}/ ("${match.value}"); write "${match.replacement}" or allow-list the key in ${ALLOW_LIST_FILE}`,
    )
  for (const entry of allowList) {
    if (!matches.some((match) => match.key === entry.key && match.pattern === entry.pattern)) {
      errors.push(`${ALLOW_LIST_FILE}: the entry "${entry.key}" /${entry.pattern}/ matches no catalog value; remove it`)
    }
  }
  return errors
}

// An allow-list entry needs a key, one of the rule patterns and a reason.
export function readAllowList(appRoot = APP_ROOT) {
  const file = path.join(appRoot, ALLOW_LIST_FILE)
  if (!fs.existsSync(file)) return { entries: [], errors: [] }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  const entries = Array.isArray(parsed.entries) ? parsed.entries : []
  const errors = []
  if (!Array.isArray(parsed.entries)) errors.push(`${ALLOW_LIST_FILE}: "entries" must be an array`)
  for (const entry of entries) {
    const known = RETIRED_TERMS.some((term) => term.pattern === entry.pattern)
    if (!entry.key || !known || !entry.reason) {
      errors.push(`${ALLOW_LIST_FILE}: every entry needs "key", a retired "pattern" and a "reason" (${JSON.stringify(entry)})`)
    }
  }
  return { entries, errors }
}

const readCatalog = (appRoot, file) => JSON.parse(fs.readFileSync(path.join(appRoot, file), 'utf8'))

// The English catalog beside a Polish one (`…/pl.json` → `…/en.json`), or none.
function englishBeside(appRoot, file) {
  const english = path.join(path.dirname(file), 'en.json')
  return fs.existsSync(path.join(appRoot, english)) ? readCatalog(appRoot, english) : {}
}

export function checkGlossary({ appRoot = APP_ROOT } = {}) {
  const matches = []
  let catalogsChecked = 0
  for (const locale of LOCALES) {
    const terms = RETIRED_TERMS.filter((term) => term.locale === locale)
    for (const file of catalogFiles(appRoot, locale)) {
      catalogsChecked += 1
      const english = locale === 'pl' ? englishBeside(appRoot, file) : {}
      matches.push(...findRetiredTerms(file, readCatalog(appRoot, file), terms, english))
    }
  }
  const allowList = readAllowList(appRoot)
  return { catalogsChecked, errors: [...allowList.errors, ...applyAllowList(matches, allowList.entries)] }
}

export function runCli({ appRoot, log = console.log, error = console.error }) {
  const result = checkGlossary({ appRoot })
  for (const problem of result.errors) error(`glossary:check: ${problem}`)
  log(`glossary:check: ${String(result.catalogsChecked)} Polish and English catalog(s), ${String(result.errors.length)} problem(s)`)
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli({})
}
