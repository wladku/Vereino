#!/usr/bin/env node
// Spec Open Questions guard (PS-TEST-01, `.ai/specs/2026-11-24-phase-level-story-start.md`).
// A story may start while its spec is Draft once the decision session labels it `phase-ready`, so the
// *Blocking?* column of a spec's Open Questions table must say which phases a question blocks:
// `no`, `phase N`, or `phases N, M`. Free text such as "yes" or "yes — phase 4" cannot tell the
// decision session which story an answer unblocks.
//
// Specs dated before RULE_START_DATE keep their free text; every newer spec in `.ai/specs`,
// `implemented/` or `archive/` must use the values above, and each phase it names must exist as a
// `### Phase N` heading in the spec.
// Usage: node scripts/check-spec-questions.mjs [--root <repo-root>]
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The first spec date (from the file name) the rule applies to.
export const RULE_START_DATE = '2026-11-27'
export const SPEC_FOLDERS = ['.ai/specs', '.ai/specs/implemented', '.ai/specs/archive']

const SPEC_NAME_PATTERN = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/
const BLOCKING_VALUE_PATTERN = /^(?:no|phase (\d+)|phases (\d+(?:, \d+)+))$/
const PHASE_HEADING_PATTERN = /^###\s+Phase\s+(\d+)\b/
const SEPARATOR_CELL_PATTERN = /^:?-+:?$/

// The cells of a markdown table row, or null when the line is not a table row.
export function tableCells(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|') || trimmed.length < 2) return null
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
}

// The phase numbers a *Blocking?* value names ([] for `no`), or null when the value is not allowed.
export function parseBlockingValue(value) {
  const match = value.match(BLOCKING_VALUE_PATTERN)
  if (!match) return null
  if (match[1]) return [Number(match[1])]
  if (match[2]) return match[2].split(', ').map(Number)
  return []
}

export function phaseNumbers(source) {
  const phases = new Set()
  for (const line of source.split('\n')) {
    const match = line.match(PHASE_HEADING_PATTERN)
    if (match) phases.add(Number(match[1]))
  }
  return phases
}

// Every data row of every table whose header has a `Blocking?` cell: { lineNumber, id, value }.
export function blockingRows(source) {
  const rows = []
  const lines = source.split('\n')
  let column = -1
  for (let index = 0; index < lines.length; index += 1) {
    const cells = tableCells(lines[index])
    if (!cells) {
      column = -1
      continue
    }
    const header = cells.indexOf('Blocking?')
    if (header >= 0) {
      column = header
      continue
    }
    if (column < 0 || cells.every((cell) => SEPARATOR_CELL_PATTERN.test(cell))) continue
    rows.push({ lineNumber: index + 1, id: cells[0], value: cells[column] ?? '' })
  }
  return rows
}

export function checkSpec(relativePath, source) {
  const errors = []
  const phases = phaseNumbers(source)
  for (const row of blockingRows(source)) {
    const where = `${relativePath}:${row.lineNumber} (${row.id})`
    const named = parseBlockingValue(row.value)
    if (!named) {
      errors.push(`${where}: Blocking? must be \`no\`, \`phase N\` or \`phases N, M\`, not "${row.value}"`)
      continue
    }
    for (const phase of named) {
      if (!phases.has(phase)) errors.push(`${where}: Blocking? names phase ${phase}, but the spec has no "### Phase ${phase}" heading`)
    }
  }
  return errors
}

export function listSpecs(rootDir, startDate = RULE_START_DATE) {
  const specs = []
  for (const folder of SPEC_FOLDERS) {
    const dir = path.join(rootDir, folder)
    if (!fs.existsSync(dir)) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const date = entry.isFile() ? entry.name.match(SPEC_NAME_PATTERN)?.[1] : undefined
      if (date && date >= startDate) specs.push(`${folder}/${entry.name}`)
    }
  }
  return specs.sort()
}

export function checkSpecQuestions(rootDir, { startDate = RULE_START_DATE } = {}) {
  return listSpecs(rootDir, startDate).flatMap((relativePath) =>
    checkSpec(relativePath, fs.readFileSync(path.join(rootDir, relativePath), 'utf8')),
  )
}

export function parseRoot(args) {
  if (args.length === 0) return process.cwd()
  if (args.length === 2 && args[0] === '--root') return path.resolve(args[1])
  throw new Error('Usage: check-spec-questions.mjs [--root <repo-root>]')
}

export function main({ args, log, logError }) {
  const rootDir = parseRoot(args)
  const errors = checkSpecQuestions(rootDir)
  for (const error of errors) logError(`- ${error}`)
  if (errors.length > 0) return 1
  log(`Spec Open Questions are valid: ${rootDir}`)
  return 0
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
