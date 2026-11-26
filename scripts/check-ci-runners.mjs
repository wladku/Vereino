#!/usr/bin/env node
// Runner guard for the GitHub workflows (#834, `docs/ops/ci-runners.md`).
//
//   node scripts/check-ci-runners.mjs [--root <repo-root>]
//
// The factory server's self-hosted runners (label `vereino-ci`) may run only trusted code: a `push` (only people with
// write access push to this repository) or a `pull_request` whose head branch is in this repository. A fork PR or a
// `pull_request_target`/`workflow_run` workflow must never reach them. So for every workflow in `.github/workflows/`:
//   - every `runs-on` is `ubuntu-latest`, or, in SELF_HOSTED_WORKFLOW only, exactly SELF_HOSTED_RUNS_ON: an allow-list
//     of the trusted events behind the repository variable `CI_SELF_HOSTED`;
//   - every job of SELF_HOSTED_JOBS uses SELF_HOSTED_RUNS_ON, so the set of jobs that move stays the documented one;
//   - no other line names `self-hosted` or `vereino-ci` (a matrix, an `env` or a second expression could route a job
//     there behind this guard's back).
// And for the runner setup SETUP_SCRIPT, which can build several runner instances (one per repository) on one machine,
// every line of SETUP_ISOLATION is still there: the home and work directories of an instance's user stay closed to the
// other instances, each slot sees no other home, and the audits that warn about an open home or a shared subordinate
// ID range still run.
// Exits 0 when every workflow and the setup script pass, 1 listing each problem.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const WORKFLOWS_DIR = '.github/workflows'
export const HOSTED_RUNS_ON = 'ubuntu-latest'
export const SELF_HOSTED_WORKFLOW = '.github/workflows/ci.yml'
export const SELF_HOSTED_JOBS = ['gate', 'integration-shard', 'browser-smoke', 'image-smoke', 'perf']
export const SELF_HOSTED_RUNS_ON =
  "${{ vars.CI_SELF_HOSTED == 'true' && (github.event_name == 'push' || (github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository)) && fromJSON('[\"self-hosted\",\"vereino-ci\"]') || 'ubuntu-latest' }}"

export const SETUP_SCRIPT = 'scripts/ci-runner-setup.sh'
/** The lines of SETUP_SCRIPT that keep runner instances apart, each with what it guarantees. */
export const SETUP_ISOLATION = [
  { line: 'chmod 0750 "$home"', why: "the instance user's home (and its runners' work directories) is closed to others" },
  { line: 'install -d -m 0700 -o "$CI_USER" -g "$CI_USER" "$RUN_DIR"', why: 'the JIT configurations are readable by their instance only' },
  { line: 'chmod 0700 "$(dirname "$TOKEN_FILE")"', why: 'the GitHub token directory is root only' },
  { line: 'ProtectHome=tmpfs', why: 'a slot sees no other home' },
  { line: 'BindPaths=$home', why: "a slot sees its own instance's home only" },
  { line: '[ "$uid" -ge 1000 ] || [[ "$home" == "$HOMES_DIR"/* ]] || continue', why: 'the home audit covers the other instances' },
  { line: '  audit_homes\n  audit_subids\n', why: 'install and status audit homes and subordinate ID ranges' },
  { line: 'start="${SUBID_START:-$(next_subid_start /etc/subuid /etc/subgid)}"', why: 'every instance gets its own subordinate IDs' },
]

const SELF_HOSTED_MARKER = /self-hosted|vereino-ci/

/**
 * The `runs-on` lines of a workflow with the job each belongs to (the last two-space key under `jobs:`; null when the
 * line is not inside a job). A `runs-on` that is not a job's direct key (wrong indent) is still returned, so it is
 * checked like any other.
 * @param {string} source
 * @returns {{ job: string | null, line: number, value: string }[]}
 */
export function parseRunsOn(source) {
  const entries = []
  let inJobs = false
  let job = null
  source.split(/\r?\n/).forEach((raw, index) => {
    const runsOn = /^(\s*)runs-on:\s*(.*?)\s*$/.exec(raw)
    if (runsOn) {
      if (runsOn[1] === '') inJobs = false
      entries.push({ job: inJobs ? job : null, line: index + 1, value: runsOn[2] })
      return
    }
    if (/^\S/.test(raw) && !raw.startsWith('#')) {
      inJobs = /^jobs:\s*$/.test(raw)
      job = null
      return
    }
    const jobMatch = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(raw)
    if (inJobs && jobMatch) job = jobMatch[1]
  })
  return entries
}

/**
 * @param {string} file the workflow path relative to the repository root
 * @param {string} source the workflow text
 * @returns {string[]} the problems found
 */
export function checkWorkflow(file, source) {
  const errors = []
  const selfHostedAllowed = file === SELF_HOSTED_WORKFLOW
  const entries = parseRunsOn(source)
  const runsOnLines = new Set(entries.map((entry) => entry.line))
  for (const { job, line, value } of entries) {
    if (value === HOSTED_RUNS_ON) continue
    if (selfHostedAllowed && value === SELF_HOSTED_RUNS_ON) continue
    const where = `${file}:${String(line)}${job ? ` (job ${job})` : ''}`
    errors.push(
      selfHostedAllowed
        ? `${where}: runs-on must be ${HOSTED_RUNS_ON} or the self-hosted expression of scripts/check-ci-runners.mjs`
        : `${where}: runs-on must be ${HOSTED_RUNS_ON} (only ${SELF_HOSTED_WORKFLOW} may use self-hosted runners)`,
    )
  }
  source.split(/\r?\n/).forEach((raw, index) => {
    const code = raw.trimStart().startsWith('#') ? '' : raw
    if (SELF_HOSTED_MARKER.test(code) && !runsOnLines.has(index + 1)) {
      errors.push(`${file}:${String(index + 1)}: names a self-hosted runner outside runs-on`)
    }
  })
  if (selfHostedAllowed) {
    for (const name of SELF_HOSTED_JOBS) {
      const entry = entries.find((candidate) => candidate.job === name)
      if (!entry) errors.push(`${file}: job ${name} has no runs-on`)
      else if (entry.value !== SELF_HOSTED_RUNS_ON) {
        errors.push(`${file}:${String(entry.line)} (job ${name}): must use the self-hosted expression`)
      }
    }
  }
  return errors
}

/**
 * @param {string} source the text of SETUP_SCRIPT
 * @returns {string[]} the problems found
 */
export function checkSetupScript(source) {
  return SETUP_ISOLATION.filter(({ line }) => !source.includes(line)).map(
    ({ line, why }) => `${SETUP_SCRIPT}: missing \`${line.trim().replace(/\n\s*/g, '; ')}\` (${why})`,
  )
}

/**
 * @param {string} rootDir
 * @returns {{ files: number, errors: string[] }}
 */
export function checkRepository(rootDir) {
  const dir = path.join(rootDir, WORKFLOWS_DIR)
  if (!fs.existsSync(dir)) return { files: 0, errors: [`${WORKFLOWS_DIR}: directory not found`] }
  const files = fs
    .readdirSync(dir)
    .filter((name) => /\.ya?ml$/.test(name))
    .sort()
    .map((name) => `${WORKFLOWS_DIR}/${name}`)
  const errors = files.flatMap((file) => checkWorkflow(file, fs.readFileSync(path.join(rootDir, file), 'utf8')))
  if (!files.includes(SELF_HOSTED_WORKFLOW)) errors.push(`${SELF_HOSTED_WORKFLOW}: file not found`)
  const setup = path.join(rootDir, SETUP_SCRIPT)
  if (fs.existsSync(setup)) errors.push(...checkSetupScript(fs.readFileSync(setup, 'utf8')))
  else errors.push(`${SETUP_SCRIPT}: file not found`)
  return { files: files.length, errors }
}

/**
 * @param {{ argv?: string[], cwd?: string, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number}
 */
export function runCli({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  log = (line) => console.log(line),
  error = (line) => console.error(line),
} = {}) {
  const rootIndex = argv.indexOf('--root')
  const rootDir = rootIndex >= 0 && argv[rootIndex + 1] ? path.resolve(argv[rootIndex + 1]) : cwd
  const { files, errors } = checkRepository(rootDir)
  if (errors.length === 0) {
    log(`ci-runners:check: ${String(files)} workflow(s); self-hosted runners only for trusted events in ci.yml; runner instances isolated`)
    return 0
  }
  for (const message of errors) error(message)
  error(`ci-runners:check: ${String(errors.length)} problem(s)`)
  return 1
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli()
}
