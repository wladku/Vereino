// Capacity load (many-clubs spec TEST-M09, phase 5; #633): the evening peak against the clubs of
// `vereino-capacity-seed.mjs` — guardians declaring and opening their calendar and charges, coaches taking attendance,
// administrators opening the payment views and member pages — at a fixed arrival rate (an open model: a slow answer
// does not slow the arrivals), and the 06:00 burst: every club's scheduled jobs due at once, timed until the sweeps
// drained them. Prints per-route p50/p95/p99 and writes them as JSON next to the state file.
//
// NEVER against a real or dev database: only the disposable capacity stack of `docs/ops/capacity.md`.
//
// Usage (cwd = packages/app):
//   node scripts/vereino-capacity-load.mjs peak --state /tmp/vereino-capacity/state.json --rps 100 --duration 300
//   DATABASE_URL=… node scripts/vereino-capacity-load.mjs burst --timeout 1800
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApi, markdownTable, parseArgs, pickWeighted, sleep, summarize } from './vereino-capacity-lib.mjs'

export const PEAK_DEFAULTS = {
  state: '/tmp/vereino-capacity/state.json',
  rps: 100,
  duration: 300,
  'max-inflight': 400,
  out: '',
}

export const BURST_DEFAULTS = { timeout: 1800, interval: 2, out: '/tmp/vereino-capacity/burst.json' }

const LOCK_HEADER = 'x-om-ext-optimistic-lock-expected-updated-at'

/**
 * The evening mix (weights in %): what a guardian, a coach and an administrator do between 17:00 and 21:00. Each
 * scenario answers its samples (`label`, `status`, `ms`); the attendance write reads the list first for its version.
 */
export const SCENARIOS = [
  ['guardian.calendar', 18],
  ['guardian.declare', 15],
  ['guardian.my-charges', 12],
  ['guardian.my-charges-summary', 5],
  ['guardian.page-club', 8],
  ['guardian.page-calendar', 5],
  ['coach.attendance-read', 12],
  ['coach.attendance-write', 6],
  ['admin.charges', 9],
  ['admin.dashboard', 5],
  ['admin.page-charges', 5],
]

function pick(list, random) {
  return list[Math.floor(random() * list.length)]
}

function sample(label, result) {
  return { label, status: result.status, ms: result.ms }
}

/** Runs one scenario against a random club and actor of the state; answers its samples. */
export async function runScenario(name, { call, state, random = Math.random, today }) {
  const club = pick(state.clubs, random)
  const guardian = pick(club.guardians, random)
  const occurrenceId = pick(club.occurrences, random)
  const week = `from=${today}&to=${today}`
  switch (name) {
    case 'guardian.calendar':
      return [
        sample(name, await call('GET', `/api/activities/calendar?${week}&as=guardian`, { token: guardian.token })),
      ]
    case 'guardian.declare':
      return [
        sample(
          name,
          await call('POST', '/api/activities/attendance/declare', {
            token: guardian.token,
            json: {
              occurrenceId: guardian.occurrenceId,
              personId: guardian.childId,
              declared: random() < 0.8 ? 'yes' : 'no',
            },
          }),
        ),
      ]
    case 'guardian.my-charges':
      return [sample(name, await call('GET', '/api/payments/my-charges?pageSize=100', { token: guardian.token }))]
    case 'guardian.my-charges-summary':
      return [sample(name, await call('GET', '/api/payments/my-charges/summary', { token: guardian.token }))]
    case 'guardian.page-club':
      return [sample(name, await call('GET', '/club', { cookie: `auth_token=${guardian.token}` }))]
    case 'guardian.page-calendar':
      return [sample(name, await call('GET', '/club/calendar', { cookie: `auth_token=${guardian.token}` }))]
    case 'coach.attendance-read':
      return [
        sample(
          name,
          await call('GET', `/api/activities/occurrences/${occurrenceId}/attendance`, { token: club.coachToken }),
        ),
      ]
    case 'coach.attendance-write': {
      const read = await call('GET', `/api/activities/occurrences/${occurrenceId}/attendance`, {
        token: club.coachToken,
      })
      const rows = read.body?.rows ?? []
      const version = read.body?.occurrence?.updatedAt
      if (read.status !== 200 || rows.length === 0 || !version) return [sample('coach.attendance-read', read)]
      const person = pick(rows, random)
      const write = await call('PUT', `/api/activities/occurrences/${occurrenceId}/attendance`, {
        token: club.coachToken,
        headers: { [LOCK_HEADER]: version },
        json: {
          entries: [{ personId: person.personId, actual: random() < 0.85 ? 'present' : 'absent' }],
          complete: false,
        },
      })
      return [sample('coach.attendance-read', read), sample(name, write)]
    }
    case 'admin.charges':
      return [sample(name, await call('GET', '/api/payments/charges?pageSize=100', { token: club.adminToken }))]
    case 'admin.dashboard':
      return [sample(name, await call('GET', '/api/payments/dashboard', { token: club.adminToken }))]
    case 'admin.page-charges':
      return [sample(name, await call('GET', '/backend/payments/charges', { cookie: `auth_token=${club.adminToken}` }))]
    default:
      throw new Error(`unknown scenario ${String(name)}`)
  }
}

/**
 * Fires scenarios at `rps` per second for `duration` seconds (one every `1000 / rps` ms, whatever the answers take);
 * an arrival while `max-inflight` scenarios still run is counted as `dropped` instead of queued.
 */
export async function runPeak({
  call,
  state,
  options,
  random = Math.random,
  now = () => Date.now(),
  wait = sleep,
  today,
}) {
  const samples = []
  const inflight = new Set()
  const total = Math.round(options.rps * options.duration)
  const interval = 1000 / options.rps
  const started = now()
  let dropped = 0
  for (let index = 0; index < total; index += 1) {
    const due = started + index * interval
    const lag = due - now()
    if (lag > 0) await wait(lag)
    if (inflight.size >= options['max-inflight']) {
      dropped += 1
      continue
    }
    const name = pickWeighted(SCENARIOS, random)
    const task = runScenario(name, { call, state, random, today })
      .then((result) => samples.push(...result))
      .catch((error) => samples.push({ label: name, status: 0, ms: 0, error: String(error) }))
      .finally(() => inflight.delete(task))
    inflight.add(task)
  }
  await Promise.all(inflight)
  const elapsedSec = (now() - started) / 1000
  return { samples, dropped, elapsedSec }
}

/** `peak`: loads the state, runs the evening mix, prints the table and writes the summary JSON. */
export async function runPeakCli(argv, deps = {}) {
  const options = parseArgs(argv, PEAK_DEFAULTS)
  const {
    fetchImpl = fetch,
    readFile = (file) => fs.readFileSync(file, 'utf8'),
    writeFile = (file, text) => fs.writeFileSync(file, text),
    log = console.log,
    random = Math.random,
    now = () => Date.now(),
    wait = sleep,
    today = new Date().toISOString().slice(0, 10),
  } = deps
  const state = JSON.parse(readFile(options.state))
  const call = createApi({ baseUrl: state.baseUrl, fetchImpl })
  const result = await runPeak({ call, state, options, random, now, wait, today })
  const summary = summarize(result.samples, result.elapsedSec)
  const report = {
    rps: options.rps,
    duration: options.duration,
    clubs: state.clubs.length,
    dropped: result.dropped,
    ...summary,
  }
  const out = options.out || path.join(path.dirname(options.state), `peak-${String(options.rps)}rps.json`)
  writeFile(out, `${JSON.stringify(report, null, 2)}\n`)
  log(markdownTable(summary))
  log(`[capacity-load] ${String(result.samples.length)} requests, ${String(result.dropped)} dropped; summary in ${out}`)
  return report
}

/**
 * `burst`: makes every club's scheduled job due now (the 06:00 bunching DD-M05 spreads, here without the spread) and
 * polls `foundation_club_jobs` until no row is due or leased; answers the time it took and the samples.
 */
export async function runBurst({ db, options, now = () => Date.now(), wait = sleep, log = console.log }) {
  const forced = await db.query(
    "update foundation_club_jobs set next_due_at = now(), lease_until = null where next_due_at > now() - interval '1 day'",
  )
  const started = now()
  const samples = []
  for (;;) {
    const { rows } = await db.query(
      `select count(*) filter (where next_due_at <= now()) as due,
              count(*) filter (where lease_until > now()) as leased
       from foundation_club_jobs`,
    )
    const point = { t: Math.round((now() - started) / 1000), due: Number(rows[0].due), leased: Number(rows[0].leased) }
    samples.push(point)
    log(`[capacity-burst] t=${String(point.t)}s due=${String(point.due)} leased=${String(point.leased)}`)
    if (point.due === 0 && point.leased === 0) return { forced: forced.rowCount, drainedSec: point.t, samples }
    if (point.t >= options.timeout) return { forced: forced.rowCount, drainedSec: null, samples }
    await wait(options.interval * 1000)
  }
}

/** `burst` from the command line, with a `pg` client on `DATABASE_URL`. */
export async function runBurstCli(
  argv,
  { env = process.env, createClient, writeFile, log = console.log, wait = sleep } = {},
) {
  const options = parseArgs(argv, BURST_DEFAULTS)
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL of the capacity database is needed')
  const make =
    createClient ??
    (async (url) => {
      const { Client } = await import('pg')
      return new Client({ connectionString: url })
    })
  const db = await make(env.DATABASE_URL)
  await db.connect()
  try {
    const result = await runBurst({ db, options, wait, log })
    ;(writeFile ?? ((file, text) => fs.writeFileSync(file, text)))(options.out, `${JSON.stringify(result, null, 2)}\n`)
    return result
  } finally {
    await db.end()
  }
}

export async function main(argv, deps = {}) {
  const [mode, ...rest] = argv
  if (mode === 'peak') return runPeakCli(rest, deps)
  if (mode === 'burst') return runBurstCli(rest, deps)
  throw new Error('usage: vereino-capacity-load.mjs <peak|burst> [options]')
}

/* node:coverage ignore next 9 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
