#!/usr/bin/env node
// Spec changelog guard. Every PR used to append a row to the `## Changelog` table at the end of the
// spec it touched, so parallel PRs all edited the same last lines and conflicted with each other
// (2026-11-05: 67 of 70 spec-file conflicts between open PRs were only these rows). Since then each
// change is its own file, `.ai/specs/changelog/<spec-stem>/<YYYY-MM-DD>-<slug>.md`, holding one
// `| date | change |` row. New files never conflict, and `cat` of the folder lists them in date order.
//
// This check keeps the convention: entries are well-formed and belong to an existing spec, every spec
// points to its folder, and no spec table gains a row dated after the cutover.
// Usage: node scripts/check-spec-changelogs.mjs [--root <repo-root>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The last day a row could still be appended to a spec's own Changelog table.
export const CUTOVER_DATE = '2026-11-05'
export const SPEC_FOLDERS = ['.ai/specs', '.ai/specs/implemented', '.ai/specs/archive']
export const CHANGELOG_DIR = '.ai/specs/changelog'

const SPEC_NAME_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const ENTRY_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const ENTRY_ROW_PATTERN = /^\| (\d{4}-\d{2}-\d{2}) \| (.*\S.*) \|$/
const TABLE_ROW_DATE_PATTERN = /^\|\s*(\d{4}-\d{2}-\d{2})\s*\|/

export function isValidDate(value) {
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

// The lines between `## Changelog` and the next level-2 heading, or null when the spec has no such section.
export function changelogSection(source) {
  const lines = source.split('\n')
  const start = lines.findIndex((line) => line.trim() === '## Changelog')
  if (start < 0) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((line) => line.startsWith('## '))
  return end < 0 ? rest : rest.slice(0, end)
}

export function listSpecs(rootDir) {
  const specs = []
  for (const folder of SPEC_FOLDERS) {
    const dir = path.join(rootDir, folder)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && SPEC_NAME_PATTERN.test(entry.name)) {
        specs.push({ stem: entry.name.slice(0, -'.md'.length), relativePath: `${folder}/${entry.name}` })
      }
    }
  }
  return specs.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

export function checkSpec({ stem, relativePath }, source, cutover = CUTOVER_DATE) {
  const errors = []
  const section = changelogSection(source)
  if (!section) return [`${relativePath}: missing the "## Changelog" section`]
  const folder = `${CHANGELOG_DIR}/${stem}/`
  if (!section.some((line) => line.includes(folder))) {
    errors.push(`${relativePath}: the Changelog section must point to \`${folder}\` (see .ai/specs/README.md)`)
  }
  for (const line of section) {
    const date = line.match(TABLE_ROW_DATE_PATTERN)?.[1]
    if (date && date > cutover) {
      errors.push(
        `${relativePath}: Changelog row dated ${date} belongs in ${folder}${date}-<slug>.md`
        + ` (one file per change; the table is frozen after ${cutover})`,
      )
    }
  }
  return errors
}

export function checkEntry(relativePath, fileName, source) {
  const name = fileName.match(ENTRY_NAME_PATTERN)
  if (!name) return [`${relativePath}: file name must be <YYYY-MM-DD>-<kebab-case-slug>.md`]
  if (!isValidDate(name[1])) return [`${relativePath}: ${name[1]} is not a calendar date`]
  const lines = source.replace(/\n$/, '').split('\n')
  const row = lines.length === 1 ? lines[0].match(ENTRY_ROW_PATTERN) : null
  if (!row) return [`${relativePath}: must hold exactly one line "| YYYY-MM-DD | change |"`]
  if (row[1] !== name[1]) return [`${relativePath}: row date ${row[1]} differs from the file name date ${name[1]}`]
  return []
}

export function checkSpecChangelogs(rootDir, { cutover = CUTOVER_DATE } = {}) {
  const errors = []
  const specs = listSpecs(rootDir)
  for (const spec of specs) {
    errors.push(...checkSpec(spec, fs.readFileSync(path.join(rootDir, spec.relativePath), 'utf8'), cutover))
  }

  const stems = new Set(specs.map((spec) => spec.stem))
  const changelogDir = path.join(rootDir, CHANGELOG_DIR)
  const folders = fs.existsSync(changelogDir) ? fs.readdirSync(changelogDir, { withFileTypes: true }) : []
  for (const folder of folders) {
    const relativeFolder = `${CHANGELOG_DIR}/${folder.name}`
    if (!folder.isDirectory()) {
      if (folder.name !== 'README.md') errors.push(`${relativeFolder}: only one folder per spec belongs here`)
      continue
    }
    if (!stems.has(folder.name)) {
      errors.push(`${relativeFolder}/: no spec named ${folder.name}.md in ${SPEC_FOLDERS.join(', ')}`)
    }
    for (const entry of fs.readdirSync(path.join(changelogDir, folder.name), { withFileTypes: true })) {
      const relativePath = `${relativeFolder}/${entry.name}`
      if (!entry.isFile()) {
        errors.push(`${relativePath}: entries are files, not folders`)
        continue
      }
      errors.push(...checkEntry(relativePath, entry.name, fs.readFileSync(path.join(changelogDir, folder.name, entry.name), 'utf8')))
    }
  }
  return errors
}

export function parseRoot(args) {
  if (args.length === 0) return process.cwd()
  if (args.length === 2 && args[0] === '--root') return path.resolve(args[1])
  throw new Error('Usage: check-spec-changelogs.mjs [--root <repo-root>]')
}

export function main({ args, log, logError }) {
  const rootDir = parseRoot(args)
  const errors = checkSpecChangelogs(rootDir)
  for (const error of errors) logError(`- ${error}`)
  if (errors.length > 0) return 1
  log(`Spec changelogs are valid: ${rootDir}`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
