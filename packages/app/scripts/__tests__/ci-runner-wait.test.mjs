// Unit tests for the self-hosted runner wait check `scripts/ci-runner-wait.mjs` (#834).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  DEFAULT_MINUTES,
  DEFAULT_REPO,
  findWaitingJobs,
  parseArgs,
  runCli,
  waitingJobs,
} from '../../../../scripts/ci-runner-wait.mjs'

const NOW = Date.parse('2026-11-26T12:00:00Z')
const minutesAgo = (minutes) => new Date(NOW - minutes * 60000).toISOString()

function job(name, { status = 'queued', labels = ['self-hosted', 'vereino-ci'], waited = 15 } = {}) {
  return { name, status, labels, created_at: minutesAgo(waited), html_url: `https://example.test/${name}` }
}

/** A fake `execFileSync` answering `gh api <endpoint>` from a map of endpoints. */
function fakeRun(responses, calls = []) {
  return (command, args, options) => {
    calls.push({ command, args, options })
    const body = responses[args[1]]
    if (body === undefined) throw new Error(`gh: no fake for ${args[1]}`)
    return JSON.stringify(body)
  }
}

const RUNS = {
  'repos/o/r/actions/runs?status=queued&per_page=100': { workflow_runs: [{ id: 1 }] },
  'repos/o/r/actions/runs?status=in_progress&per_page=100': { workflow_runs: [{ id: 1 }, { id: 2 }] },
  'repos/o/r/actions/runs/1/jobs?filter=latest&per_page=100': {
    jobs: [job('gate'), job('changes', { labels: ['ubuntu-latest'] })],
  },
  'repos/o/r/actions/runs/2/jobs?filter=latest&per_page=100': {
    jobs: [
      job('perf', { waited: 3 }),
      job('image-smoke', { status: 'in_progress' }),
      { ...job('x'), labels: undefined },
    ],
  },
}

test('parseArgs takes the defaults, --repo and --minutes, and refuses anything else', () => {
  assert.deepEqual(parseArgs([]), { repo: DEFAULT_REPO, minutes: DEFAULT_MINUTES })
  assert.deepEqual(parseArgs(['--repo', 'a-b/c.d', '--minutes', '5']), { repo: 'a-b/c.d', minutes: 5 })
  for (const argv of [['--repo'], ['--minutes'], ['--repo', 'no-slash'], ['--minutes', 'x'], ['--other', '1']]) {
    assert.throws(() => parseArgs(argv), /unknown or invalid argument/, argv.join(' '))
  }
})

test('waitingJobs keeps queued vereino-ci jobs that waited at least the threshold', () => {
  const jobs = [
    job('a', { waited: 10 }),
    job('b', { waited: 9 }),
    job('c', { status: 'in_progress' }),
    job('d', { labels: ['ubuntu-latest'] }),
    { ...job('e'), labels: undefined },
  ]
  assert.deepEqual(waitingJobs(jobs, { minutes: 10, now: NOW }), [
    { name: 'a', waitedMinutes: 10, url: 'https://example.test/a' },
  ])
})

test('findWaitingJobs reads queued and running runs once each through gh api', () => {
  const calls = []
  const found = findWaitingJobs({ repo: 'o/r', minutes: 10, run: fakeRun(RUNS, calls), now: () => NOW })
  assert.deepEqual(found, [{ name: 'gate', waitedMinutes: 15, url: 'https://example.test/gate' }])
  assert.equal(calls.length, 4)
  assert.ok(calls.every((call) => call.command === 'gh' && call.args[0] === 'api' && call.options.encoding === 'utf8'))
})

test('runCli exits 0 when nothing waits, 1 listing waiting jobs, 2 when GitHub cannot be read', () => {
  const lines = []
  const errors = []
  const log = (line) => lines.push(line)
  const error = (line) => errors.push(line)
  const quiet = { ...RUNS, 'repos/o/r/actions/runs/1/jobs?filter=latest&per_page=100': { jobs: [] } }
  assert.equal(runCli({ argv: ['--repo', 'o/r'], run: fakeRun(quiet), now: () => NOW, log, error }), 0)
  assert.equal(lines.at(-1), 'ci-runner-wait: no vereino-ci job of o/r has waited 10 min or more')
  assert.equal(runCli({ argv: ['--repo', 'o/r', '--minutes', '2'], run: fakeRun(RUNS), now: () => NOW, log, error }), 1)
  assert.deepEqual(lines.slice(-3), [
    'gate: waiting for a vereino-ci runner for 15 min https://example.test/gate',
    'perf: waiting for a vereino-ci runner for 3 min https://example.test/perf',
    'ci-runner-wait: 2 job(s) waiting; is a vereino-ci runner online? (docs/ops/ci-runners.md)',
  ])
  assert.equal(runCli({ argv: ['--repo', 'x/y'], run: fakeRun(RUNS), log, error }), 2)
  assert.match(errors.at(-1), /^ci-runner-wait: gh: no fake for repos\/x\/y/)
  assert.equal(runCli({ argv: ['--bad'], log, error }), 2)
  const thrower = () => {
    throw 'plain failure'
  }
  assert.equal(runCli({ argv: [], run: thrower, log, error }), 2)
  assert.equal(errors.at(-1), 'ci-runner-wait: plain failure')
  // The default writers print to the console.
  assert.equal(runCli({ argv: ['--repo', 'o/r'], run: fakeRun(quiet), now: () => NOW }), 0)
  assert.equal(runCli({ argv: ['--bad'] }), 2)
})
