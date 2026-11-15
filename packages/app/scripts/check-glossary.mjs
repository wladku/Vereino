// Retired-term check (navigation spec REQ-N11, DD-N12, TEST-N10; issue #257).
// D-031 §2 makes the mockup's words the application's words. The spec's "Glossary (D-031 §2)" retires five Polish
// terms; this check keeps them out of the Polish catalogs while other specs keep adding texts. It enforces exactly the
// retired list of the spec's business rule "Retired term" — rules 1 and 2 of the glossary depend on meaning and are
// left to the native-reader review.
// A value may keep a retired term only through an entry { key, pattern, reason } of check-glossary.allow.json; an entry
// that no longer matches its value is stale and fails too, so the allow-list never outlives the text it excuses.
// Usage: node scripts/check-glossary.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT } from './vereino-paths.mjs'

export const ALLOW_LIST_FILE = 'scripts/check-glossary.allow.json'

// The retired list, complete. `scope` decides which keys a pattern applies to.
export const RETIRED_TERMS = [
  { pattern: 'wnios', replacement: 'zgłoszenie', scope: () => true },
  { pattern: 'zdarze', replacement: 'incydent', scope: (key) => key.startsWith('facilities.') },
  { pattern: 'stawk\\p{L}* najmu', replacement: 'cennik wynajmu', scope: () => true },
  { pattern: 'zamówieni\\p{L}* grupow', replacement: 'zbiórka zamówień', scope: () => true },
  { pattern: 'niestawieni', replacement: 'nie stawił się', scope: () => true },
  { pattern: 'obiekt', replacement: 'miejsce', scope: (key) => key.startsWith('club_core.places.') },
  { pattern: 'harmonogram', replacement: 'Zajęcia', scope: (key) => key.endsWith('.nav.group') },
]

// The Polish catalogs: every module's and the application's own.
export function catalogFiles(appRoot = APP_ROOT) {
  const modulesDir = path.join(appRoot, 'src', 'modules')
  const moduleCatalogs = fs
    .readdirSync(modulesDir)
    .sort()
    .map((id) => path.join('src', 'modules', id, 'i18n', 'pl.json'))
  return [...moduleCatalogs, path.join('src', 'i18n', 'pl.json')].filter((file) => fs.existsSync(path.join(appRoot, file)))
}

// Every (key, pattern) match of one catalog, in catalog order.
export function findRetiredTerms(file, catalog, terms = RETIRED_TERMS) {
  const matches = []
  for (const [key, value] of Object.entries(catalog)) {
    if (typeof value !== 'string') continue
    for (const term of terms) {
      if (term.scope(key) && new RegExp(term.pattern, 'iu').test(value)) {
        matches.push({ file, key, pattern: term.pattern, replacement: term.replacement, value })
      }
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

// An allow-list entry needs a key, one of the retired patterns and a reason.
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

export function checkGlossary({ appRoot = APP_ROOT } = {}) {
  const files = catalogFiles(appRoot)
  const matches = files.flatMap((file) =>
    findRetiredTerms(file, JSON.parse(fs.readFileSync(path.join(appRoot, file), 'utf8'))),
  )
  const allowList = readAllowList(appRoot)
  return { catalogsChecked: files.length, errors: [...allowList.errors, ...applyAllowList(matches, allowList.entries)] }
}

export function runCli({ appRoot, log = console.log, error = console.error }) {
  const result = checkGlossary({ appRoot })
  for (const problem of result.errors) error(`glossary:check: ${problem}`)
  log(`glossary:check: ${String(result.catalogsChecked)} Polish catalog(s), ${String(result.errors.length)} problem(s)`)
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli({})
}
