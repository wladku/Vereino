#!/usr/bin/env node
// Lessons live one per file in `.ai/lessons/<slug>.md`; their front matter is the only catalog.
// `.ai/lessons.md` explains how to find and write lessons and holds no rows: a committed index that every
// lesson PR edited broke `lessons:check` after merges (a union merge kept a stale and an updated row, or
// appended a row out of order, and GitHub's merge button conflicted on it anyway). The catalog is printed
// on demand from the records instead, so merging branches that add or edit lessons touches no shared file.
// Usage:
//   check-lessons.mjs [--root <app-root>]                  validate every record (yarn lessons:check)
//   check-lessons.mjs --list [<term>...] [--root <dir>]    print catalog rows matching every term (yarn lessons:list)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const LESSON_AREAS = new Set([
  'architecture',
  'module-data',
  'umes',
  'backend-ui',
  'integration',
  'ai-workflow',
  'debugging',
  'testing',
  'framework-context',
  'spec-pr',
])

const RECORD_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const MODULE_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const TOPIC_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CATALOG_ROW_PATTERN = /^- \[.+]\(lessons\/[^)]+\.md\)/m

export function parseFrontMatter(source, relativePath, errors) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n\n# (.+)\n/)
  if (!match) {
    errors.push(`${relativePath}: expected JSON-valued front matter followed by one H1`)
    return null
  }

  const metadata = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 1) {
      errors.push(`${relativePath}: malformed front matter line ${JSON.stringify(line)}`)
      continue
    }
    const key = line.slice(0, separator)
    try {
      metadata[key] = JSON.parse(line.slice(separator + 1).trim())
    } catch {
      errors.push(`${relativePath}: ${key} must use valid JSON syntax`)
    }
  }

  const expectedKeys = ['title', 'modules', 'areas', 'topics']
  const actualKeys = Object.keys(metadata).sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort())) {
    errors.push(`${relativePath}: front matter keys must be exactly ${expectedKeys.join(', ')}`)
  }
  if (typeof metadata.title !== 'string' || metadata.title.length === 0) {
    errors.push(`${relativePath}: title must be a non-empty string`)
  } else if (metadata.title !== match[2]) {
    errors.push(`${relativePath}: front matter title must match the H1`)
  }

  if (!Array.isArray(metadata.modules) || metadata.modules.length === 0) {
    errors.push(`${relativePath}: modules must contain an owning module/package or platform`)
  } else if (metadata.modules.some((value) => typeof value !== 'string' || !MODULE_PATTERN.test(value))) {
    errors.push(`${relativePath}: modules must use lowercase snake_case tags`)
  }
  if (!Array.isArray(metadata.areas) || metadata.areas.length === 0) {
    errors.push(`${relativePath}: areas must contain at least one standalone router area`)
  } else if (metadata.areas.some((value) => !LESSON_AREAS.has(value))) {
    errors.push(`${relativePath}: areas contain a value outside the standalone router taxonomy`)
  }
  if (!Array.isArray(metadata.topics) || metadata.topics.length < 2 || metadata.topics.length > 6) {
    errors.push(`${relativePath}: topics must contain between two and six important concepts`)
  } else if (metadata.topics.some((value) => typeof value !== 'string' || !TOPIC_PATTERN.test(value))) {
    errors.push(`${relativePath}: topics must use lowercase kebab-case tags`)
  }

  for (const key of ['modules', 'areas', 'topics']) {
    if (Array.isArray(metadata[key]) && new Set(metadata[key]).size !== metadata[key].length) {
      errors.push(`${relativePath}: ${key} must not contain duplicates`)
    }
  }

  return metadata
}

// The valid records in `.ai/lessons/` (all but `_template.md`), sorted by file name, and every error found.
export function readLessonRecords(rootDir) {
  const errors = []
  const lessonsDir = path.join(rootDir, '.ai', 'lessons')
  const fileNames = fs.existsSync(lessonsDir)
    ? fs
        .readdirSync(lessonsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_'))
        .map((entry) => entry.name)
        .sort()
    : []
  const records = []
  const titles = new Set()
  for (const fileName of fileNames) {
    const relativePath = `.ai/lessons/${fileName}`
    const errorCount = errors.length
    if (!RECORD_NAME_PATTERN.test(fileName)) errors.push(`${relativePath}: filename must use kebab-case`)
    const metadata = parseFrontMatter(fs.readFileSync(path.join(lessonsDir, fileName), 'utf8'), relativePath, errors)
    if (errors.length > errorCount) continue
    if (titles.has(metadata.title)) {
      errors.push(`${relativePath}: duplicate lesson title ${JSON.stringify(metadata.title)}`)
      continue
    }
    titles.add(metadata.title)
    records.push({ fileName, metadata })
  }
  return { records, errors }
}

export function formatCatalogRow({ fileName, metadata }) {
  const { title, areas, modules, topics } = metadata
  return `- [${title}](lessons/${fileName}) — area:${areas.join(',')}; module:${modules.join(',')}; topic:${topics.join(',')}`
}

// Catalog rows of the records whose row contains every term (case-insensitive), in file-name order.
export function listLessons(rootDir, terms = []) {
  const needles = terms.map((term) => term.toLowerCase())
  return readLessonRecords(rootDir)
    .records.map(formatCatalogRow)
    .filter((row) => needles.every((needle) => row.toLowerCase().includes(needle)))
}

export function checkLessonsCatalog(rootDir) {
  const guidePath = path.join(rootDir, '.ai', 'lessons.md')
  if (!fs.existsSync(guidePath)) return [`${guidePath}: lessons guide is missing`]

  const { errors } = readLessonRecords(rootDir)
  const guideSource = fs.readFileSync(guidePath, 'utf8')
  if (/\*\*(?:Context|Problem|Rule|Applies to)\*\*:/.test(guideSource)) {
    errors.push('.ai/lessons.md: full lesson prose belongs in .ai/lessons/, not the guide')
  }
  if (CATALOG_ROW_PATTERN.test(guideSource)) {
    errors.push(
      '.ai/lessons.md: must not hold catalog rows (a shared index breaks merges); the front matter of'
        + ' .ai/lessons/*.md is the catalog, printed by `yarn lessons:list`. Keep your record and restore the guide:'
        + ' git checkout origin/main -- .ai/lessons.md',
    )
  }
  return errors
}

const USAGE = 'Usage: check-lessons.mjs [--root <app-root>] | check-lessons.mjs --list [<term>...] [--root <app-root>]'

export function parseArgs(args) {
  const options = { rootDir: process.cwd(), list: false, terms: [] }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--root' && index + 1 < args.length) {
      index += 1
      options.rootDir = path.resolve(args[index])
    } else if (arg === '--list') {
      options.list = true
    } else if (options.list && !arg.startsWith('--')) {
      options.terms.push(arg)
    } else {
      throw new Error(USAGE)
    }
  }
  return options
}

export function main({ args, log, logError }) {
  const { rootDir, list, terms } = parseArgs(args)
  if (list) {
    const rows = listLessons(rootDir, terms)
    for (const row of rows) log(row)
    if (rows.length > 0) return 0
    logError(`No lesson matches ${terms.join(' ')}`)
    return 1
  }
  const errors = checkLessonsCatalog(rootDir)
  if (errors.length > 0) {
    for (const message of errors) logError(`- ${message}`)
    return 1
  }
  log(`Lessons catalog is valid: ${rootDir}`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
