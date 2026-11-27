#!/usr/bin/env node
// Self-hosted runner wait check (#834, `docs/ops/ci-runners.md`).
//
//   node scripts/ci-runner-wait.mjs [--repo <owner/name>] [--minutes <n>] [--label <runner label>]
//
// GitHub never moves a job to another runner: a job for the `vereino-ci` label waits for as long as no such runner is
// online. This check lists the jobs of the repository's queued and running workflow runs that ask for the runner label
// (--label, default `vereino-ci`; another runner instance of scripts/ci-runner-setup.sh has its own) and have been
// queued for longer than --minutes (default 10). The factory alerts job runs it and mails the owner on exit 1.
// It reads GitHub through `gh api` (the caller's login; read access to Actions is enough).
// Exits 0 when no job waits too long, 1 listing each one, 2 when GitHub could not be read.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEFAULT_REPO = 'wladku/Vereino'
export const DEFAULT_MINUTES = 10
export const RUNNER_LABEL = 'vereino-ci'
const LABEL_PATTERN = /^[a-z][a-z0-9-]{0,29}$/

/**
 * @param {string[]} argv
 * @returns {{ repo: string, minutes: number, label: string }}
 */
export function parseArgs(argv) {
  const options = { repo: DEFAULT_REPO, minutes: DEFAULT_MINUTES, label: RUNNER_LABEL }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index + 1]
    if (argv[index] === '--repo' && /^[\w.-]+\/[\w.-]+$/.test(value ?? '')) options.repo = value
    else if (argv[index] === '--minutes' && /^\d+$/.test(value ?? '')) options.minutes = Number(value)
    else if (argv[index] === '--label' && LABEL_PATTERN.test(value ?? '')) options.label = value
    else throw new Error(`unknown or invalid argument: ${argv[index]}`)
    index += 1
  }
  return options
}

/**
 * The jobs that ask for `label` (default RUNNER_LABEL) and have been queued for longer than `minutes` at `now`.
 * @param {{ name: string, status: string, labels?: string[], created_at: string, html_url: string }[]} jobs
 * @param {{ minutes: number, now: number, label?: string }} options
 * @returns {{ name: string, waitedMinutes: number, url: string }[]}
 */
export function waitingJobs(jobs, { minutes, now, label = RUNNER_LABEL }) {
  return jobs
    .filter((job) => job.status === 'queued' && (job.labels ?? []).includes(label))
    .map((job) => ({ name: job.name, waitedMinutes: Math.floor((now - Date.parse(job.created_at)) / 60000), url: job.html_url }))
    .filter((job) => job.waitedMinutes >= minutes)
}

/**
 * @param {{ repo: string, minutes: number, label?: string, run?: typeof execFileSync, now?: () => number }} options
 * @returns {{ name: string, waitedMinutes: number, url: string }[]}
 */
export function findWaitingJobs({ repo, minutes, label = RUNNER_LABEL, run = execFileSync, now = Date.now }) {
  const api = (endpoint) => JSON.parse(run('gh', ['api', endpoint], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  const runIds = new Set()
  for (const status of ['queued', 'in_progress']) {
    for (const run of api(`repos/${repo}/actions/runs?status=${status}&per_page=100`).workflow_runs) runIds.add(run.id)
  }
  const at = now()
  return [...runIds].flatMap((id) =>
    waitingJobs(api(`repos/${repo}/actions/runs/${String(id)}/jobs?filter=latest&per_page=100`).jobs, { minutes, now: at, label }),
  )
}

/**
 * @param {{ argv?: string[], run?: typeof execFileSync, now?: () => number, log?: (line: string) => void, error?: (line: string) => void }} [options]
 * @returns {number}
 */
export function runCli({
  argv = process.argv.slice(2),
  run,
  now,
  log = (line) => console.log(line),
  error = (line) => console.error(line),
} = {}) {
  let waiting
  let options
  try {
    options = parseArgs(argv)
    waiting = findWaitingJobs({ ...options, run, now })
  } catch (failure) {
    error(`ci-runner-wait: ${failure instanceof Error ? failure.message : String(failure)}`)
    return 2
  }
  if (waiting.length === 0) {
    log(`ci-runner-wait: no ${options.label} job of ${options.repo} has waited ${String(options.minutes)} min or more`)
    return 0
  }
  for (const job of waiting) log(`${job.name}: waiting for a ${options.label} runner for ${String(job.waitedMinutes)} min ${job.url}`)
  log(`ci-runner-wait: ${String(waiting.length)} job(s) waiting; is a ${options.label} runner online? (docs/ops/ci-runners.md)`)
  return 1
}

/* node:coverage ignore next 3 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runCli()
}
