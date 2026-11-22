#!/usr/bin/env node
// Change guard (#520): AGENTS.md tells autonomous runs not to weaken tests, not to add dependencies and not to
// commit secrets, and the merge train merges a green PR without a human look, so a script checks it. The guard
// compares the change with its base (default: the merge base with `origin/main`) and reports each finding as
// `file:line [rule]`:
//
// - blocking: a test file deleted or renamed away; an added skip/only/x-prefixed test; an added `fixme` that is
//   not quarantined (`// quarantine: #<issue>` on the same line or the line above, the issue open and labelled
//   `bug`); a lowered coverage threshold or a new coverage exclusion; a new dependency in any `package.json` or a
//   new package in `yarn.lock`; a secret on a changed line (the `secrets:check` matcher, #511);
// - warning: a change to the agent rules (AGENTS.md, CLAUDE.md, skills, `.github/`, the gate and this guard).
//
// A blocking finding fails the run unless the pull request carries the owner-only label `guard-approved`. Agents
// never add that label and never work around a finding: they stop, explain it in the PR and ask the owner.
// The report is Markdown; in CI it is also appended to the job summary (`GITHUB_STEP_SUMMARY`).
// Usage: node scripts/guard.mjs [--base <rev>] [--pr <number>] [--root <repo-root>]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isAllowed, isCatalogFile, isEnvFile, readAllowlist, scanLine, SKIPPED_FILES } from './check-secrets.mjs'

export const APPROVAL_LABEL = 'guard-approved'
export const QUARANTINE_ISSUE_LABEL = 'bug'
export const DEFAULT_BASE_REF = 'origin/main'

export const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'resolutions']

// Unit tests (`__tests__/`, `*.test.*`, `*.spec.*`, `*.e2e.*`) and the Playwright integration tests.
const TEST_FILE_PATTERN = /(?:^|\/)__tests__\/|\.(?:test|spec|e2e)\.[cm]?[jt]sx?$|(?:^|\/)\.ai\/qa\/tests\//
const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/

// Test markers that switch a test off. The `fixme` rule has its own quarantine exception.
export const TEST_RULES = [
  { id: 'test-skip', pattern: /\b(?:test|describe|it|suite)\.skip\s*\(/ },
  { id: 'test-only', pattern: /\.only\s*\(/ },
  { id: 'test-skip', pattern: /(?<![\w$.])x(?:it|describe|test)\s*\(/ },
  { id: 'test-fixme', pattern: /\b(?:test|describe|it)\.fixme\s*\(/ },
]
const QUARANTINE_PATTERN = /\/\/\s*quarantine:\s*#(\d+)/

const COVERAGE_CONFIG_PATTERN = /(?:^|\/)(?:jest\.config\.[cm]?[jt]s|package\.json)$/
const THRESHOLD_PATTERN = /\b(lines|branches|functions|statements)\s*:\s*(\d+(?:\.\d+)?)|--test-coverage-(lines|branches|functions)=(\d+(?:\.\d+)?)/g
const EXCLUDE_FLAG_PATTERN = /--test-coverage-exclude=\\?"?([^"\s\\]+)/g
const NEGATED_GLOB_PATTERN = /(['"`])(![^'"`]+)\1/g
const IGNORE_KEY_PATTERN = /\b(?:coveragePathIgnorePatterns|testPathIgnorePatterns|modulePathIgnorePatterns)\b/
const STRING_LITERAL_PATTERN = /(['"`])([^'"`]+)\1/g

// Rule files: a change is listed for the reviewer, never blocking. Lessons (`.ai/lessons/`) are not rule files.
const AGENT_RULE_PATTERNS = [
  /(?:^|\/)(?:AGENTS|CLAUDE)\.md$/,
  /^\.agents\/skills\//,
  /^\.ai\/skills\//,
  /^\.github\//,
  /^scripts\/verify\.mjs$/,
  /^scripts\/guard\.mjs$/,
]

export function isTestFile(file) {
  return TEST_FILE_PATTERN.test(file)
}

export function isAgentRuleFile(file) {
  return AGENT_RULE_PATTERNS.some((pattern) => pattern.test(file))
}

// `git diff --name-status -z -M` → `[{ status, path, from? }]` (`from` for a rename or copy).
export function parseNameStatus(output) {
  const parts = output.split('\0').filter(Boolean)
  const changes = []
  for (let index = 0; index < parts.length; ) {
    const status = parts[index][0]
    if (status === 'R' || status === 'C') {
      changes.push({ status, from: parts[index + 1], path: parts[index + 2] })
      index += 3
    } else {
      changes.push({ status, path: parts[index + 1] })
      index += 2
    }
  }
  return changes
}

// `git diff --unified=0 --no-prefix` → `Map<path, { added: [{ line, text }], removed: [{ line, text }] }>`.
export function parseDiff(output) {
  const files = new Map()
  let current = null
  let oldLine = 0
  let newLine = 0
  for (const raw of output.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      current = null
    } else if (raw.startsWith('--- ')) {
      continue
    } else if (raw.startsWith('+++ ')) {
      // Git ends the path with a tab when it contains a space.
      const file = raw.slice(4).replace(/\t$/, '')
      current = file === '/dev/null' ? null : { added: [], removed: [] }
      if (current) files.set(file, current)
    } else if (raw.startsWith('@@')) {
      const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
      oldLine = Number(match[1])
      newLine = Number(match[2])
    } else if (current && raw.startsWith('+')) {
      current.added.push({ line: newLine, text: raw.slice(1) })
      newLine += 1
    } else if (current && raw.startsWith('-')) {
      current.removed.push({ line: oldLine, text: raw.slice(1) })
      oldLine += 1
    }
  }
  return files
}

// Rule 1a: a test file that is gone (deleted, or renamed to a path that is not a test file).
export function checkDeletedTests(changes) {
  const findings = []
  for (const change of changes) {
    if (change.status === 'D' && isTestFile(change.path)) {
      findings.push({ rule: 'test-deleted', file: change.path, message: 'test file deleted' })
    }
    if (change.status === 'R' && isTestFile(change.from) && !isTestFile(change.path)) {
      findings.push({ rule: 'test-deleted', file: change.from, message: `test file renamed away to ${change.path}` })
    }
  }
  return findings
}

// The quarantine issue a `fixme` line points at: on that line or on the line above it. `lines` is the new file.
export function quarantineIssue(lines, lineNumber) {
  for (const text of [lines[lineNumber - 1], lines[lineNumber - 2]]) {
    const match = QUARANTINE_PATTERN.exec(text ?? '')
    if (match) return Number(match[1])
  }
  return null
}

// Rule 1b: added test markers. `readLines(file)` gives the new file's lines; `issueOf(n)` gives
// `{ state, labels }` of a tracker issue or `null` when it cannot be read.
export function checkTestMarkers(file, added, { readLines, issueOf }) {
  if (!isTestFile(file) || !SOURCE_FILE_PATTERN.test(file)) return []
  const findings = []
  for (const { line, text } of added) {
    for (const { id, pattern } of TEST_RULES) {
      if (!pattern.test(text)) continue
      if (id === 'test-fixme') {
        const issue = quarantineIssue(readLines(file), line)
        const verdict = issue === null ? null : quarantineVerdict(issue, issueOf(issue))
        if (verdict?.ok) continue
        findings.push({
          rule: id,
          file,
          line,
          message: verdict ? verdict.reason : 'fixme without `// quarantine: #<open bug issue>`',
        })
        continue
      }
      findings.push({ rule: id, file, line, message: text.trim().slice(0, 120) })
    }
  }
  return findings
}

export function quarantineVerdict(number, issue) {
  if (!issue) return { ok: false, reason: `quarantine issue #${String(number)} could not be read` }
  if (issue.state !== 'OPEN') return { ok: false, reason: `quarantine issue #${String(number)} is not open` }
  if (!issue.labels.includes(QUARANTINE_ISSUE_LABEL)) {
    return { ok: false, reason: `quarantine issue #${String(number)} has no \`${QUARANTINE_ISSUE_LABEL}\` label` }
  }
  return { ok: true }
}

function thresholdsOf(entries) {
  const values = new Map()
  for (const { line, text } of entries) {
    for (const match of text.matchAll(THRESHOLD_PATTERN)) {
      const key = match[1] ?? match[3]
      const value = Number(match[2] ?? match[4])
      values.set(key, [...(values.get(key) ?? []), { line, value }])
    }
  }
  return values
}

function exclusionsOf(entries) {
  const values = new Set()
  for (const { text } of entries) {
    for (const match of text.matchAll(EXCLUDE_FLAG_PATTERN)) values.add(match[1])
    for (const match of text.matchAll(NEGATED_GLOB_PATTERN)) values.add(match[2])
    if (IGNORE_KEY_PATTERN.test(text)) {
      for (const match of text.matchAll(STRING_LITERAL_PATTERN)) values.add(match[2])
    }
  }
  return values
}

// Rule 1c: a coverage threshold that went down or disappeared, or a new coverage or test-path exclusion, in a
// Jest config or a `package.json` script (`--test-coverage-*` flags of `node --test`).
export function checkCoverage(file, { added, removed }) {
  if (!COVERAGE_CONFIG_PATTERN.test(file)) return []
  const findings = []
  const before = thresholdsOf(removed)
  const after = thresholdsOf(added)
  for (const [key, old] of before) {
    const highest = Math.max(...old.map((entry) => entry.value))
    const now = after.get(key)
    if (!now) {
      findings.push({ rule: 'coverage-threshold', file, line: old[0].line, message: `\`${key}\` threshold removed (was ${String(highest)})`, oldLine: true })
      continue
    }
    const lowest = now.reduce((min, entry) => (entry.value < min.value ? entry : min))
    if (lowest.value < highest) {
      findings.push({ rule: 'coverage-threshold', file, line: lowest.line, message: `\`${key}\` threshold lowered from ${String(highest)} to ${String(lowest.value)}` })
    }
  }
  const excludedBefore = exclusionsOf(removed)
  for (const { line, text } of added) {
    for (const value of exclusionsOf([{ line, text }])) {
      if (!excludedBefore.has(value)) {
        findings.push({ rule: 'coverage-exclusion', file, line, message: `new exclusion \`${value}\`` })
      }
    }
  }
  return findings
}

// The line a key is declared on inside a JSON text (1-based), for `file:line` output.
export function lineOfKey(text, key) {
  const index = text.split('\n').findIndex((line) => line.includes(`"${key}"`))
  return index + 1
}

// Rule 2a: a new entry in `dependencies`, `devDependencies`, `optionalDependencies` or `resolutions`. A version
// change of an existing entry is not a new dependency.
export function checkPackageJson(file, oldText, newText) {
  const parse = (text) => {
    try {
      return text ? JSON.parse(text) : {}
    } catch {
      return {}
    }
  }
  const before = parse(oldText)
  const after = parse(newText)
  const findings = []
  for (const field of DEPENDENCY_FIELDS) {
    const known = new Set(Object.keys(before[field] ?? {}))
    for (const name of Object.keys(after[field] ?? {})) {
      if (known.has(name)) continue
      findings.push({ rule: 'new-dependency', file, line: lineOfKey(newText, name), message: `\`${name}\` added to \`${field}\`` })
    }
  }
  return findings
}

// The package names of a Yarn Berry lockfile: one per top-level descriptor line (`"name@npm:^1.0.0, …":`).
export function lockPackages(text) {
  const names = new Map()
  text.split('\n').forEach((line, index) => {
    if (/^\s/.test(line) || !line.endsWith(':') || line.startsWith('__metadata')) return
    for (const descriptor of line.slice(0, -1).split(', ')) {
      const clean = descriptor.replace(/^"|"$/g, '')
      const at = clean.indexOf('@', 1)
      const name = at > 0 ? clean.slice(0, at) : clean
      if (name && !names.has(name)) names.set(name, index + 1)
    }
  })
  return names
}

// Rule 2b: a package name that the base `yarn.lock` does not have.
export function checkLockfile(file, oldText, newText) {
  const before = lockPackages(oldText)
  const findings = []
  for (const [name, line] of lockPackages(newText)) {
    if (!before.has(name)) findings.push({ rule: 'new-lock-package', file, line, message: `\`${name}\` is new in the lockfile` })
  }
  return findings
}

// Rule 3: the `secrets:check` matcher on the added lines only, with its allow-list.
export function checkSecretsInDiff(file, added, allowlist) {
  if (SKIPPED_FILES.has(file)) return []
  const options = { envFile: isEnvFile(file), catalogFile: isCatalogFile(file) }
  const findings = []
  for (const { line, text } of added) {
    for (const hit of scanLine(text, options)) {
      if (isAllowed({ path: file, ...hit }, allowlist)) continue
      findings.push({ rule: `secret:${hit.rule}`, file, line, message: 'hard-coded secret or real e-mail address' })
    }
  }
  return findings
}

// Rule 4 (warning): every changed rule file.
export function checkAgentRules(changes) {
  const warnings = []
  for (const change of changes) {
    for (const file of [change.from, change.path]) {
      if (file && isAgentRuleFile(file) && !warnings.some((warning) => warning.file === file)) {
        warnings.push({ rule: 'agent-rules', file, message: 'agent rule file changed; review it' })
      }
    }
  }
  return warnings
}

// Every finding of one change set. `io` gives `diff` / `nameStatus` (git outputs), `readOld(file)` (base text or
// `''`), `readNew(file)` (working tree text or `''`), `issueOf(n)` and `allowlist`.
export function collectFindings(io) {
  const changes = parseNameStatus(io.nameStatus)
  const diff = parseDiff(io.diff)
  const blocking = [...checkDeletedTests(changes)]
  const readLines = (file) => io.readNew(file).split('\n')
  for (const [file, hunks] of diff) {
    blocking.push(...checkTestMarkers(file, hunks.added, { readLines, issueOf: io.issueOf }))
    blocking.push(...checkCoverage(file, hunks))
    blocking.push(...checkSecretsInDiff(file, hunks.added, io.allowlist))
  }
  for (const change of changes) {
    if (change.status === 'D') continue
    const from = change.from ?? change.path
    if (/(?:^|\/)package\.json$/.test(change.path)) {
      blocking.push(...checkPackageJson(change.path, io.readOld(from), io.readNew(change.path)))
    }
    if (/(?:^|\/)yarn\.lock$/.test(change.path)) {
      blocking.push(...checkLockfile(change.path, io.readOld(from), io.readNew(change.path)))
    }
  }
  return { blocking, warnings: checkAgentRules(changes) }
}

function where(finding) {
  if (finding.line === undefined) return finding.file
  return `${finding.file}:${String(finding.line)}${finding.oldLine ? ' (base)' : ''}`
}

// The Markdown report and the exit code.
export function renderReport({ blocking, warnings, approved, base }) {
  const lines = ['## yarn guard', '', `Compared with \`${base}\`.`, '']
  if (blocking.length === 0) {
    lines.push('No blocking findings.')
  } else {
    lines.push(`### Blocking (${String(blocking.length)})`, '')
    for (const finding of blocking) lines.push(`- \`${where(finding)}\` [${finding.rule}] ${finding.message}`)
    lines.push('')
    lines.push(approved
      ? `The pull request carries \`${APPROVAL_LABEL}\`: the owner approved these findings.`
      : `Blocked. Stop, explain each finding in the pull request and ask the owner; only the owner adds \`${APPROVAL_LABEL}\`. Never work around the guard.`)
  }
  if (warnings.length > 0) {
    lines.push('', `### Warnings (${String(warnings.length)}, not blocking)`, '')
    for (const warning of warnings) lines.push(`- \`${where(warning)}\` [${warning.rule}] ${warning.message}`)
  }
  return { markdown: `${lines.join('\n')}\n`, exitCode: blocking.length > 0 && !approved ? 1 : 0 }
}

export function parseArgs(args) {
  const options = { base: undefined, pr: undefined, root: process.cwd() }
  for (let index = 0; index < args.length; index += 2) {
    const [flag, value] = [args[index], args[index + 1]]
    if (value === undefined || !['--base', '--pr', '--root'].includes(flag)) {
      throw new Error('Usage: guard.mjs [--base <rev>] [--pr <number>] [--root <repo-root>]')
    }
    if (flag === '--base') options.base = value
    if (flag === '--pr') options.pr = value
    if (flag === '--root') options.root = path.resolve(value)
  }
  return options
}

export function makeGit(root, exec = execFileSync) {
  return (args) => exec('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
}

// `gh` returns JSON; any failure (no CLI, no auth, unknown issue) is `null`.
export function makeGh(root, exec = execFileSync) {
  return (args) => {
    try {
      return JSON.parse(exec('gh', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
    } catch {
      return null
    }
  }
}

export function issueReader(gh) {
  const cache = new Map()
  return (number) => {
    if (!cache.has(number)) {
      const issue = gh(['issue', 'view', String(number), '--json', 'state,labels'])
      cache.set(number, issue ? { state: issue.state, labels: issue.labels.map((label) => label.name) } : null)
    }
    return cache.get(number)
  }
}

export function prLabels(gh, pr) {
  if (!pr) return []
  const result = gh(['pr', 'view', String(pr), '--json', 'labels'])
  return result ? result.labels.map((label) => label.name) : []
}

export function main({ args, log, logError, env = process.env, exec = execFileSync, exists = fs.existsSync, readFile = fs.readFileSync, appendFile = fs.appendFileSync }) {
  const options = parseArgs(args)
  const git = makeGit(options.root, exec)
  const gh = makeGh(options.root, exec)
  const base = options.base ?? git(['merge-base', DEFAULT_BASE_REF, 'HEAD']).trim()
  const readNew = (file) => {
    const absolute = path.join(options.root, file)
    return exists(absolute) ? readFile(absolute, 'utf8') : ''
  }
  const readOld = (file) => {
    try {
      return git(['show', `${base}:${file}`])
    } catch {
      return ''
    }
  }
  const { blocking, warnings } = collectFindings({
    nameStatus: git(['diff', '--name-status', '-z', '-M', base]),
    diff: git(['diff', '--no-color', '--no-ext-diff', '--no-prefix', '--unified=0', '-M', base]),
    readOld,
    readNew,
    issueOf: issueReader(gh),
    allowlist: readAllowlist(options.root),
  })
  const approved = blocking.length > 0 && prLabels(gh, options.pr).includes(APPROVAL_LABEL)
  const { markdown, exitCode } = renderReport({ blocking, warnings, approved, base })
  ;(exitCode === 0 ? log : logError)(markdown)
  if (env.GITHUB_STEP_SUMMARY) appendFile(env.GITHUB_STEP_SUMMARY, markdown)
  return exitCode
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main({ args: process.argv.slice(2), log: console.log, logError: console.error })
}
