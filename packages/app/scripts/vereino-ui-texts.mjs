// UI texts of the integration tests, read from the i18n catalogs (lesson `qa-ui-texts-from-catalogs`).
// A test that writes a label as `/^(Sign out|Wyloguj się)$/` breaks on every wording change of that label, also when
// another pull request makes the change; `uiText('activities.club.nav.signOut', { exact: true })` builds the same
// pattern from the catalogs, so the test follows the wording and a renamed or removed key fails `yarn verify`.
// `qa-texts:check` (this file's CLI) keeps it that way: every `uiText('<key>')` of the tests must name a key of both
// catalogs, and no test file may hold more hardcoded bilingual texts than its baseline entry — the baseline only
// shrinks.
// Usage: node scripts/vereino-ui-texts.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { APP_ROOT } from './vereino-paths.mjs'

export const LOCALES = ['en', 'pl']
export const QA_TESTS_DIR = '.ai/qa/tests'
export const BASELINE_FILE = 'scripts/vereino-ui-texts.baseline.json'
const PLACEHOLDER = /\{\{(\w+)\}\}|\{(\w+)\}/g

function listCatalogs(dir, locale, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') listCatalogs(full, locale, found)
    } else if (entry.name === `${locale}.json` && path.basename(dir) === 'i18n') {
      found.push(full)
    }
  }
  return found
}

// The catalogs of one locale, lowest precedence first: the platform packages, the app modules, the app's own catalog.
export function catalogSources(appRoot, locale) {
  const platformDir = path.join(appRoot, 'node_modules', '@open-mercato')
  const modulesDir = path.join(appRoot, 'src', 'modules')
  const appCatalog = path.join(appRoot, 'src', 'i18n', `${locale}.json`)
  return [
    ...(fs.existsSync(platformDir) ? listCatalogs(platformDir, locale) : []),
    ...(fs.existsSync(modulesDir) ? listCatalogs(modulesDir, locale) : []),
    ...(fs.existsSync(appCatalog) ? [appCatalog] : []),
  ]
}

/** @returns {Record<string, Map<string, string>>} every locale's key → text, a later source overriding an earlier one */
export function readCatalogs(appRoot) {
  const catalogs = {}
  for (const locale of LOCALES) {
    const texts = new Map()
    for (const file of catalogSources(appRoot, locale)) {
      for (const [key, value] of Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))) {
        if (typeof value === 'string') texts.set(key, value)
      }
    }
    catalogs[locale] = texts
  }
  return catalogs
}

export function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// One catalog text as a pattern: literal text escaped, a placeholder as its given value or as any text.
export function textPattern(template, params = {}) {
  let pattern = ''
  let last = 0
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1] ?? match[2]
    pattern += escapeRegExp(template.slice(last, match.index))
    pattern += name in params ? escapeRegExp(String(params[name])) : '.+?'
    last = match.index + match[0].length
  }
  return pattern + escapeRegExp(template.slice(last))
}

// The key's text in every locale as one pattern; `exact` anchors it to the whole text.
export function uiTextPattern(catalogs, key, { exact = false, params = {} } = {}) {
  const alternatives = []
  for (const locale of LOCALES) {
    const template = catalogs[locale].get(key)
    if (template === undefined) throw new Error(`uiText: the ${locale} catalog has no key "${key}"`)
    const pattern = textPattern(template, params)
    if (!alternatives.includes(pattern)) alternatives.push(pattern)
  }
  const body = `(?:${alternatives.join('|')})`
  return new RegExp(exact ? `^${body}$` : body)
}

/**
 * @param {string} [appRoot]
 * @returns {(key: string, options?: { exact?: boolean, params?: Record<string, string | number> }) => RegExp}
 */
export function createUiText(appRoot = APP_ROOT) {
  let catalogs
  return (key, options) => {
    catalogs ??= readCatalogs(appRoot)
    return uiTextPattern(catalogs, key, options)
  }
}

// The alternatives of a regex literal that is a hardcoded bilingual text — `/^(Save|Zapisz)$/`, `/Save|Zapisz/`,
// `/^Save$|^Zapisz$/` — or null for any other regex: one without alternatives, with regex syntax or with flags.
export function hardcodedAlternatives(literal) {
  const end = literal.lastIndexOf('/')
  if (end < literal.length - 1) return null
  let body = literal
    .slice(1, end)
    .replace(/^\^/, '')
    .replace(/(?<!\\)\$$/, '')
  const group = /^\((?:\?:)?(.*)\)$/.exec(body)
  if (group && !/(?<!\\)[()]/.test(group[1])) body = group[1]
  const alternatives = body.split(/(?<!\\)\|/).map((part) => part.replace(/^\^/, '').replace(/(?<!\\)\$$/, ''))
  if (alternatives.length < 2) return null
  for (const part of alternatives) {
    const plain = part.replace(/\\[^dswbpu]/gi, '')
    if (/[[\]*+?{}()^$.|\\]/.test(plain) || !/\p{L}/u.test(part)) return null
  }
  return alternatives.map((part) => part.replace(/\\(.)/g, '$1'))
}

// The QA test files, relative to the app root with forward slashes.
export function qaFiles(appRoot) {
  const root = path.join(appRoot, QA_TESTS_DIR)
  if (!fs.existsSync(root)) return []
  return fs
    .globSync('**/*.ts', { cwd: root })
    .map((file) => `${QA_TESTS_DIR}/${file.split(path.sep).join('/')}`)
    .sort()
}

// One test file: its hardcoded bilingual texts and the keys its `uiText('<key>')` calls name.
export function scanSource(ts, fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const result = { hardcoded: [], keys: [] }
  const line = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral && hardcodedAlternatives(node.text)) {
      result.hardcoded.push({ line: line(node), text: node.text })
    } else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'uiText' &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      result.keys.push({ line: line(node), key: node.arguments[0].text })
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return result
}

export function readBaseline(appRoot) {
  const file = path.join(appRoot, BASELINE_FILE)
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}
}

export function checkQaTexts({ appRoot = APP_ROOT, ts }) {
  const catalogs = readCatalogs(appRoot)
  const baseline = readBaseline(appRoot)
  const errors = []
  const files = qaFiles(appRoot)
  let hardcoded = 0
  for (const file of files) {
    const scan = scanSource(ts, file, fs.readFileSync(path.join(appRoot, file), 'utf8'))
    for (const { line, key } of scan.keys) {
      for (const locale of LOCALES) {
        if (!catalogs[locale].has(key))
          errors.push(`${file}:${String(line)}: uiText("${key}") — the ${locale} catalog has no such key`)
      }
    }
    const allowed = baseline[file] ?? 0
    const count = scan.hardcoded.length
    hardcoded += count
    if (count > allowed) {
      const first = scan.hardcoded[allowed]
      errors.push(
        `${file}:${String(first.line)}: ${String(count)} hardcoded UI text(s), the baseline allows ${String(allowed)} — write ${first.text} as uiText('<key>') from _fixtures/ui-text`,
      )
    } else if (count < allowed) {
      errors.push(
        `${BASELINE_FILE}: "${file}" has ${String(count)} hardcoded UI text(s) now; lower its entry to ${String(count)}`,
      )
    }
  }
  for (const file of Object.keys(baseline)) {
    if (!files.includes(file)) errors.push(`${BASELINE_FILE}: "${file}" is not a QA test file; remove its entry`)
  }
  return { filesChecked: files.length, hardcoded, errors }
}

export async function runCli({ appRoot, ts, log = console.log, error = console.error }) {
  const result = checkQaTexts({ appRoot, ts: ts ?? (await import('typescript')).default })
  for (const problem of result.errors) error(`qa-texts:check: ${problem}`)
  log(
    `qa-texts:check: ${String(result.filesChecked)} test file(s), ${String(result.hardcoded)} hardcoded UI text(s) left, ${String(result.errors.length)} problem(s)`,
  )
  return result.errors.length > 0 ? 1 : 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCli({})
}
