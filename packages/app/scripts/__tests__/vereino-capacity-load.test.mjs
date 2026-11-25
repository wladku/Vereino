// Unit tests for the capacity load (many-clubs spec TEST-M09, #633): every evening scenario, the open-model peak with
// its dropped arrivals, the peak CLI report, and the 06:00 burst against a fake database client (no network, no DB).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  BURST_DEFAULTS,
  PEAK_DEFAULTS,
  SCENARIOS,
  main,
  runBurst,
  runBurstCli,
  runPeak,
  runPeakCli,
  runScenario,
} from '../vereino-capacity-load.mjs'

const STATE = {
  baseUrl: 'http://app',
  clubs: [
    {
      slug: 'cap-001',
      adminToken: 'admin',
      coachToken: 'coach',
      occurrences: ['occ-1'],
      guardians: [{ token: 'guardian', childId: 'child-1', occurrenceId: 'occ-1' }],
    },
  ],
}

const ok = (body = null) => ({ status: 200, body, ms: 3 })

/** A fake `call` that records requests and answers `answer(method, path)` (default 200). */
function fakeCall(answer = () => ok()) {
  const calls = []
  const call = async (method, pathName, init) => {
    calls.push({ method, path: pathName, init })
    return answer(method, pathName, init)
  }
  return { calls, call }
}

const EXPECTED = {
  'guardian.calendar': ['GET', '/api/activities/calendar?from=2026-11-25&to=2026-11-25&as=guardian', 'guardian'],
  'guardian.declare': ['POST', '/api/activities/attendance/declare', 'guardian'],
  'guardian.my-charges': ['GET', '/api/payments/my-charges?pageSize=100', 'guardian'],
  'guardian.my-charges-summary': ['GET', '/api/payments/my-charges/summary', 'guardian'],
  'guardian.page-club': ['GET', '/club', null, 'auth_token=guardian'],
  'guardian.page-calendar': ['GET', '/club/calendar', null, 'auth_token=guardian'],
  'coach.attendance-read': ['GET', '/api/activities/occurrences/occ-1/attendance', 'coach'],
  'admin.charges': ['GET', '/api/payments/charges?pageSize=100', 'admin'],
  'admin.dashboard': ['GET', '/api/payments/dashboard', 'admin'],
  'admin.page-charges': ['GET', '/backend/payments/charges', null, 'auth_token=admin'],
}

test('every single-request scenario calls its route as its actor', async () => {
  for (const [name, [method, pathName, token, cookie]] of Object.entries(EXPECTED)) {
    const { calls, call } = fakeCall()
    const samples = await runScenario(name, { call, state: STATE, random: () => 0, today: '2026-11-25' })
    assert.deepEqual(samples, [{ label: name, status: 200, ms: 3 }])
    assert.equal(calls[0].method, method)
    assert.equal(calls[0].path, pathName)
    if (token) assert.equal(calls[0].init.token, token)
    if (cookie) assert.equal(calls[0].init.cookie, cookie)
  }
  assert.equal(
    SCENARIOS.reduce((sum, [, weight]) => sum + weight, 0),
    100,
  )
})

test('the declare scenario reports an absence or withdraws it by the random draw', async () => {
  for (const [draw, declared] of [
    [0.1, 'no'],
    [0.9, 'unknown'],
  ]) {
    const { calls, call } = fakeCall()
    await runScenario('guardian.declare', { call, state: STATE, random: () => draw, today: '2026-11-25' })
    assert.deepEqual(calls[0].init.json, { occurrenceId: 'occ-1', personId: 'child-1', declared })
  }
})

test('the attendance write reads first and stops when the read gives no rows or version', async () => {
  const reads = [
    { status: 500, body: null, ms: 1 },
    ok({ rows: [], occurrence: { updatedAt: 'v1' } }),
    ok({ rows: [{ personId: 'p1' }] }),
  ]
  for (const read of reads) {
    const { calls, call } = fakeCall(() => read)
    const samples = await runScenario('coach.attendance-write', { call, state: STATE, random: () => 0, today: 'd' })
    assert.deepEqual(samples, [{ label: 'coach.attendance-read', status: read.status, ms: read.ms }])
    assert.equal(calls.length, 1)
  }
})

test('the attendance write sends present or absent with the version it read', async () => {
  for (const [draw, actual] of [
    [0.1, 'present'],
    [0.9, 'absent'],
  ]) {
    const { calls, call } = fakeCall((method) =>
      method === 'GET' ? ok({ rows: [{ personId: 'p1' }], occurrence: { updatedAt: 'v1' } }) : ok(),
    )
    const samples = await runScenario('coach.attendance-write', { call, state: STATE, random: () => draw, today: 'd' })
    assert.deepEqual(
      samples.map((entry) => entry.label),
      ['coach.attendance-read', 'coach.attendance-write'],
    )
    assert.equal(calls[1].method, 'PUT')
    assert.equal(calls[1].init.token, 'coach')
    assert.deepEqual(calls[1].init.headers, { 'x-om-ext-optimistic-lock-expected-updated-at': 'v1' })
    assert.deepEqual(calls[1].init.json, { entries: [{ personId: 'p1', actual }], complete: false })
  }
})

test('an unknown scenario throws', async () => {
  const { call } = fakeCall()
  await assert.rejects(
    runScenario('nope', { call, state: STATE, random: () => 0, today: 'd' }),
    /unknown scenario nope/,
  )
})

test('runPeak paces the arrivals, waits for the lag and counts a failed scenario as status 0', async () => {
  const waits = []
  const { call } = fakeCall((method, pathName) => {
    if (pathName.includes('calendar')) throw new Error('broken')
    return ok()
  })
  // first arrival: guardian.calendar, then club/guardian/session picks; second arrival: admin.page-charges
  const draws = [0, 0, 0, 0, 0.99]
  const result = await runPeak({
    call,
    state: STATE,
    options: { rps: 10, duration: 0.2, 'max-inflight': 10 },
    random: () => draws.shift() ?? 0,
    now: () => 1000,
    wait: async (ms) => waits.push(ms),
    today: 'd',
  })
  assert.deepEqual(waits, [100])
  assert.equal(result.dropped, 0)
  assert.equal(result.elapsedSec, 0)
  assert.deepEqual(result.samples.map((entry) => [entry.label, entry.status]).sort(), [
    ['admin.page-charges', 200],
    ['guardian.calendar', 0],
  ])
  assert.match(result.samples.find((entry) => entry.status === 0).error, /broken/)
})

test('runPeak drops an arrival while max-inflight scenarios still run', async () => {
  const { call } = fakeCall(async () => {
    await new Promise((resolve) => setImmediate(resolve))
    return ok()
  })
  const result = await runPeak({
    call,
    state: STATE,
    options: { rps: 1000, duration: 0.003, 'max-inflight': 1 },
    random: () => 0,
    wait: async () => {},
    today: 'd',
  })
  assert.equal(result.dropped, 2)
  assert.equal(result.samples.length, 1)
  assert.equal(typeof result.elapsedSec, 'number')
})

const fetchOk = async () => ({ status: 200, text: async () => '' })

test('runPeakCli reads the state, writes the report next to it and prints the table', async () => {
  const written = []
  const logs = []
  const deps = {
    fetchImpl: fetchOk,
    readFile: (file) => {
      assert.equal(file, '/tmp/cap/state.json')
      return JSON.stringify(STATE)
    },
    writeFile: (file, text) => written.push({ file, text }),
    log: (line) => logs.push(line),
    random: () => 0,
    now: () => 0,
    wait: async () => {},
    today: '2026-11-25',
  }
  const report = await runPeakCli(['--state', '/tmp/cap/state.json', '--rps', '2', '--duration', '1'], deps)
  assert.equal(report.rps, 2)
  assert.equal(report.clubs, 1)
  assert.equal(report.dropped, 0)
  assert.equal(report.total.count, 2)
  assert.equal(written[0].file, '/tmp/cap/peak-2rps.json')
  assert.deepEqual(JSON.parse(written[0].text), report)
  assert.match(logs[0], /^\| Route \|/)
  assert.equal(logs[1], '[capacity-load] 2 requests, 0 dropped; summary in /tmp/cap/peak-2rps.json')

  await runPeakCli(['--state', '/tmp/cap/state.json', '--rps', '1', '--duration', '1', '--out', '/tmp/o.json'], deps)
  assert.equal(written[1].file, '/tmp/o.json')
})

test('runPeakCli reads and writes real files by default', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-capacity-load-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  t.mock.method(console, 'log', () => {})
  const statePath = path.join(dir, 'state.json')
  fs.writeFileSync(statePath, JSON.stringify(STATE))
  const report = await runPeakCli(['--state', statePath, '--rps', '1000', '--duration', '0.002'], {
    fetchImpl: fetchOk,
  })
  assert.equal(report.total.count, 2)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'peak-1000rps.json'), 'utf8')), report)
  assert.equal(console.log.mock.callCount(), 2)
  assert.equal(PEAK_DEFAULTS.rps, 100)
})

/** A fake `pg` client: the update answers `rowCount`, each poll answers the next `[due, leased]`. */
function fakeDb(points) {
  const queries = []
  const db = {
    connected: false,
    ended: false,
    connect: async () => {
      db.connected = true
    },
    end: async () => {
      db.ended = true
    },
    query: async (sql) => {
      queries.push(sql)
      if (sql.startsWith('update')) return { rowCount: 4 }
      const [due, leased] = points.shift()
      return { rows: [{ due: String(due), leased: String(leased) }] }
    },
  }
  return { db, queries }
}

test('runBurst forces the jobs due and polls until they drained', async () => {
  const { db, queries } = fakeDb([
    [4, 0],
    [0, 2],
    [0, 0],
  ])
  const waits = []
  const logs = []
  let clock = 0
  const result = await runBurst({
    db,
    options: { timeout: 60, interval: 2 },
    now: () => (clock += 1000) - 1000,
    wait: async (ms) => waits.push(ms),
    log: (line) => logs.push(line),
  })
  assert.match(queries[0], /^update foundation_club_jobs set next_due_at = now\(\), lease_until = null/)
  assert.deepEqual(result, {
    forced: 4,
    drainedSec: 3,
    samples: [
      { t: 1, due: 4, leased: 0 },
      { t: 2, due: 0, leased: 2 },
      { t: 3, due: 0, leased: 0 },
    ],
  })
  assert.deepEqual(waits, [2000, 2000])
  assert.equal(logs[0], '[capacity-burst] t=1s due=4 leased=0')
})

test('runBurst gives up at the timeout', async (t) => {
  t.mock.method(console, 'log', () => {})
  const { db } = fakeDb([[3, 1]])
  const result = await runBurst({ db, options: { timeout: 0, interval: 1 } })
  assert.deepEqual(result, { forced: 4, drainedSec: null, samples: [{ t: 0, due: 3, leased: 1 }] })
  assert.equal(console.log.mock.callCount(), 1)
})

test('runBurstCli connects, runs the burst, writes the result and closes the client', async () => {
  const { db } = fakeDb([[0, 0]])
  const written = []
  const urls = []
  const result = await runBurstCli(['--out', '/tmp/b.json'], {
    env: { DATABASE_URL: 'postgres://cap' },
    createClient: async (url) => {
      urls.push(url)
      return db
    },
    writeFile: (file, text) => written.push({ file, text }),
    log: () => {},
    wait: async () => {},
  })
  assert.deepEqual(urls, ['postgres://cap'])
  assert.equal(db.connected, true)
  assert.equal(db.ended, true)
  assert.equal(result.drainedSec, 0)
  assert.deepEqual(written, [{ file: '/tmp/b.json', text: `${JSON.stringify(result, null, 2)}\n` }])
  assert.equal(BURST_DEFAULTS.interval, 2)
})

test('runBurstCli writes the result file by default and closes the client after a failure', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-capacity-burst-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  t.mock.method(console, 'log', () => {})
  const out = path.join(dir, 'burst.json')
  const { db } = fakeDb([[0, 0]])
  const result = await runBurstCli(['--out', out], { env: { DATABASE_URL: 'x' }, createClient: async () => db })
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), result)
  assert.equal(console.log.mock.callCount(), 1)

  const failing = fakeDb([])
  await assert.rejects(
    runBurstCli([], { env: { DATABASE_URL: 'x' }, createClient: async () => failing.db, log: () => {} }),
    TypeError,
  )
  assert.equal(failing.db.ended, true)
})

test('runBurstCli needs DATABASE_URL', async () => {
  await assert.rejects(runBurstCli([], { env: {} }), /DATABASE_URL of the capacity database is needed/)
})

test('runBurstCli opens a pg client by default (a missing socket directory fails before any network)', async () => {
  const socketDir = encodeURIComponent('/nonexistent-vereino-capacity-socket')
  const url = `postgres://capacity@localhost/capacity?host=${socketDir}`
  await assert.rejects(runBurstCli([], { env: { DATABASE_URL: url } }), /ENOENT|connect/)
})

test('main dispatches peak and burst and prints the usage otherwise', async () => {
  const { db } = fakeDb([[0, 0]])
  const burst = await main(['burst'], {
    env: { DATABASE_URL: 'x' },
    createClient: async () => db,
    writeFile: () => {},
    log: () => {},
  })
  assert.equal(burst.forced, 4)
  const peak = await main(['peak', '--rps', '1', '--duration', '1', '--out', '/tmp/p.json'], {
    fetchImpl: fetchOk,
    readFile: () => JSON.stringify(STATE),
    writeFile: () => {},
    log: () => {},
    now: () => 0,
    wait: async () => {},
  })
  assert.equal(peak.total.count, 1)
  await assert.rejects(main([]), /usage: vereino-capacity-load\.mjs <peak\|burst> \[options\]/)
})
