// Unit tests for the capacity seed (many-clubs spec TEST-M09, #633): the import sheet, the `create-club` result line,
// sign-in and role waits, and a whole seed run against a fake API and a fake `yarn mercato` (no network, no process).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  FAMILY_MAPPING,
  SEED_DEFAULTS,
  SEED_PASSWORD,
  newSeedPassword,
  childLastName,
  createClubCli,
  familiesCsv,
  guardianEmail,
  guardianLastName,
  groupName,
  lastJsonLine,
  passwordAndToken,
  personByLastName,
  runSeed,
  seedClub,
  signIn,
  waitForRole,
} from '../vereino-capacity-seed.mjs'
import { createApi } from '../vereino-capacity-lib.mjs'

const NOW = () => new Date('2026-11-25T18:00:00Z')

const reply = (status, body) => ({ status, text: async () => (body === undefined ? '' : JSON.stringify(body)) })

/** A fake app: answers every route the seed calls and records the calls; `overrides` replace answers by key. */
function fakeApp(overrides = {}) {
  const calls = []
  let counter = 0
  const id = (prefix) => `${prefix}-${String((counter += 1))}`
  const fetchImpl = async (url, init) => {
    const { pathname, searchParams } = new URL(url)
    const key = `${init.method} ${pathname}`
    calls.push({ key, url, init })
    if (overrides[key]) return overrides[key](url, init)
    if (key === 'POST /api/auth/login') {
      return reply(200, { token: `tok:${new URLSearchParams(init.body).get('email')}` })
    }
    if (key === 'PUT /api/auth/users') return reply(200, { ok: true })
    if (key === 'GET /api/auth/users') {
      const userId = searchParams.get('id')
      return reply(200, { items: [{ id: userId, roles: ['vereino_coach', 'vereino_member'] }] })
    }
    if (key === 'GET /api/people/persons') return reply(200, { items: [{ id: `p:${searchParams.get('lastName')}` }] })
    if (/^POST \/api\/people\/persons\/[^/]+\/account$/.test(key)) return reply(201, { userId: id('user') })
    if (key === 'POST /api/people/imports') return reply(201, { id: 'imp-1', updatedAt: '2026-11-25T18:00:00.000Z' })
    if (key === 'POST /api/people/imports/imp-1/commit') return reply(200, { ok: true })
    if (key === 'GET /api/activities/occurrences') return reply(200, { items: [{ id: id('occ') }, { id: id('next') }] })
    if (init.method === 'POST') return reply(201, { id: id('rec') })
    return reply(404, { error: 'not found' })
  }
  return { calls, fetchImpl }
}

const createdLine = (slug) =>
  JSON.stringify({
    status: 'created',
    adminUserId: `admin-${slug}`,
    tenantId: `t-${slug}`,
    organizationId: `o-${slug}`,
  })

const fakeSpawn = (stdoutFor = (slug) => `log line\n{"level":"info"}\n${createdLine(slug)}\n`) => {
  const runs = []
  const spawnSyncImpl = (command, args, options) => {
    runs.push({ command, args, options })
    return { stdout: stdoutFor(args[args.indexOf('--slug') + 1]), stderr: '' }
  }
  return { runs, spawnSyncImpl }
}

test('the names and the import sheet follow the people import mapping', () => {
  assert.equal(groupName(0), 'Grupa 1')
  assert.equal(guardianLastName('cap-001', 2), 'Opiekun-cap-001-00002')
  assert.equal(childLastName('cap-001', 2), 'Dziecko-cap-001-00002')
  assert.equal(guardianEmail('cap-001', 2), 'guardian-2@cap-001.capacity.test')
  assert.equal(SEED_DEFAULTS.clubs, 100)
  assert.equal(FAMILY_MAPPING.group, 6)
  const lines = familiesCsv('cap-001', 3, 2).split('\n')
  assert.equal(lines.length, 5)
  assert.equal(lines[4], '')
  assert.equal(
    lines[3],
    'Dziecko2;Dziecko-cap-001-00002;2014-03-12;Anna;Opiekun-cap-001-00002;guardian-2@cap-001.capacity.test;Grupa 1;cap-001-2;1985-05-20',
  )
  assert.equal(lines[0].split(';').length, Object.keys(FAMILY_MAPPING).length)
})

test('lastJsonLine answers the last JSON line with a status and skips log lines', () => {
  assert.equal(lastJsonLine(undefined), null)
  assert.equal(lastJsonLine('plain\n{not json\n{"level":30}'), null)
  assert.deepEqual(lastJsonLine('{"status":"created","a":1}\r\n{broken\nnext'), { status: 'created', a: 1 })
  assert.deepEqual(lastJsonLine('{"status":"a"}\n{"status":"b"}'), { status: 'b' })
})

test('createClubCli runs create-club and accepts created or exists', () => {
  const { runs, spawnSyncImpl } = fakeSpawn()
  assert.equal(createClubCli('cap-001', 'Europe/Warsaw', spawnSyncImpl).adminUserId, 'admin-cap-001')
  assert.equal(runs[0].command, 'yarn')
  assert.deepEqual(runs[0].args.slice(0, 5), ['mercato', 'club_core', 'create-club', '--slug', 'cap-001'])
  assert.ok(runs[0].args.includes('Europe/Warsaw'))
  const exists = fakeSpawn(() => '{"status":"exists"}')
  assert.equal(createClubCli('cap-002', 'UTC', exists.spawnSyncImpl).status, 'exists')
  const docker = fakeSpawn(() => '{"status":"exists"}')
  createClubCli('cap-003', 'UTC', docker.spawnSyncImpl, 'docker exec vereino-capacity-cli yarn')
  assert.equal(docker.runs[0].command, 'docker')
  assert.deepEqual(docker.runs[0].args.slice(0, 5), ['exec', 'vereino-capacity-cli', 'yarn', 'mercato', 'club_core'])
})

test('createClubCli throws without a result line or for another status', () => {
  const none = fakeSpawn(() => 'boom')
  assert.throws(() => createClubCli('cap-001', 'UTC', none.spawnSyncImpl), /create-club cap-001 failed: $/)
  const failed = fakeSpawn(() => '{"status":"failed"}')
  assert.throws(() => createClubCli('cap-001', 'UTC', failed.spawnSyncImpl), /failed: \{"status":"failed"\}/)
})

test('signIn posts the form and answers the token; a non-200 answer throws', async () => {
  const app = fakeApp({ 'POST /api/auth/login': () => reply(401, { error: 'bad' }) })
  const call = createApi({ baseUrl: 'http://app', fetchImpl: app.fetchImpl })
  await assert.rejects(signIn(call, 'a@b.test', 'x'), /sign in a@b\.test: HTTP 401 \{"error":"bad"\}/)
  const ok = createApi({ baseUrl: 'http://app', fetchImpl: fakeApp().fetchImpl })
  assert.equal(await signIn(ok, 'a@b.test', 'x'), 'tok:a@b.test')
})

test('passwordAndToken sets the seed password and signs in', async () => {
  const app = fakeApp()
  const call = createApi({ baseUrl: 'http://app', fetchImpl: app.fetchImpl })
  assert.equal(await passwordAndToken(call, 'super', 'u1', 'u@b.test'), 'tok:u@b.test')
  assert.deepEqual(JSON.parse(app.calls[0].init.body), { id: 'u1', password: SEED_PASSWORD })
  assert.equal(app.calls[0].init.headers.authorization, 'Bearer super')
})

test('waitForRole polls until the role appears and throws after the last attempt', async () => {
  const answers = [
    reply(500),
    reply(200, { items: [{ id: 'u1' }] }),
    reply(200, { items: [{ id: 'u1', roles: ['r'] }] }),
  ]
  const waits = []
  const call = createApi({ baseUrl: 'http://app', fetchImpl: async () => answers.shift() })
  await waitForRole(call, 'super', 'u1', 'r', { delayMs: 5, wait: async (ms) => waits.push(ms) })
  assert.deepEqual(waits, [5, 5])

  const never = createApi({ baseUrl: 'http://app', fetchImpl: async () => reply(200, { items: [] }) })
  await assert.rejects(
    waitForRole(never, 'super', 'u2', 'r', { attempts: 2, wait: async () => {} }),
    /user u2 never got the role r/,
  )
  await assert.rejects(waitForRole(never, 'super', 'u3', 'r', { attempts: 1, delayMs: 1 }), /never got the role/)
})

test('personByLastName answers the first id and throws for none', async () => {
  const app = fakeApp()
  const call = createApi({ baseUrl: 'http://app', fetchImpl: app.fetchImpl })
  assert.equal(await personByLastName(call, 't', 'Kowal ski'), 'p:Kowal ski')
  assert.match(app.calls[0].url, /lastName=Kowal%20ski&pageSize=5$/)
  const empty = createApi({ baseUrl: 'http://app', fetchImpl: async () => reply(200, { items: [] }) })
  await assert.rejects(personByLastName(empty, 't', 'X'), /no person X/)
  const nobody = createApi({ baseUrl: 'http://app', fetchImpl: async () => reply(200) })
  await assert.rejects(personByLastName(nobody, 't', 'Y'), /no person Y/)
})

test('seedClub creates the club, its records and the signed-in guardians', async () => {
  const app = fakeApp()
  const { spawnSyncImpl } = fakeSpawn()
  const logs = []
  const call = createApi({ baseUrl: 'http://app', fetchImpl: app.fetchImpl })
  const options = { ...SEED_DEFAULTS, groups: 2, participants: 3, guardians: 5 }
  const club = await seedClub(
    { call, options, superToken: 'super', now: NOW, spawnSyncImpl, log: (l) => logs.push(l) },
    7,
  )
  assert.equal(club.slug, 'cap-007')
  assert.equal(club.tenantId, 't-cap-007')
  assert.equal(club.organizationId, 'o-cap-007')
  assert.equal(club.adminToken, 'tok:admin@cap-007.capacity.test')
  assert.equal(club.coachToken, 'tok:coach@cap-007.capacity.test')
  assert.equal(club.occurrences.length, 2)
  assert.equal(club.guardians.length, 3)
  const { occurrenceId, ...guardian } = club.guardians[1]
  assert.deepEqual(guardian, { token: 'tok:guardian-1@cap-007.capacity.test', childId: 'p:Dziecko-cap-007-00001' })
  // Guardians declare for next week's session of their group (today's has started, its declarations are closed).
  assert.match(occurrenceId, /^next-/)
  assert.deepEqual(logs, ['[capacity-seed] cap-007 seeded'])
  const activity = app.calls.find((entry) => entry.key === 'POST /api/activities/activities')
  assert.match(JSON.parse(activity.init.body).recurrenceRule, /^FREQ=WEEKLY;BYDAY=WE;UNTIL=20270630$/)
  const commit = app.calls.find((entry) => entry.key === 'POST /api/people/imports/imp-1/commit')
  assert.equal(commit.init.headers['x-om-ext-optimistic-lock-expected-updated-at'], '2026-11-25T18:00:00.000Z')
  const charges = app.calls.find((entry) => entry.key === 'POST /api/payments/charges/generate')
  assert.deepEqual(JSON.parse(charges.init.body), { period: '2026-11' })
})

test('seedClub stops on a refused step', async () => {
  const app = fakeApp({ 'POST /api/club_core/sections': () => reply(422, { error: 'invalid' }) })
  const call = createApi({ baseUrl: 'http://app', fetchImpl: app.fetchImpl })
  const ctx = { call, options: SEED_DEFAULTS, superToken: 's', now: NOW, spawnSyncImpl: fakeSpawn().spawnSyncImpl }
  await assert.rejects(seedClub({ ...ctx, log: () => {} }, 1), /cap-001 section: HTTP 422/)
})

test('runSeed signs in the superadmin, seeds the clubs and writes the state', async () => {
  const app = fakeApp()
  const { runs, spawnSyncImpl } = fakeSpawn()
  const logs = []
  const written = []
  const state = await runSeed({
    argv: [
      '--clubs',
      '2',
      '--from',
      '3',
      '--participants',
      '1',
      '--groups',
      '1',
      '--guardians',
      '1',
      '--state',
      's.json',
    ],
    env: { OM_INIT_SUPERADMIN_EMAIL: 'root@test', OM_INIT_SUPERADMIN_PASSWORD: 'pw' },
    deps: {
      fetchImpl: app.fetchImpl,
      spawnSyncImpl,
      now: NOW,
      log: (line) => logs.push(line),
      writeFile: (file, text) => written.push({ file, text }),
    },
  })
  assert.deepEqual(
    state.clubs.map((club) => club.slug),
    ['cap-003', 'cap-004'],
  )
  assert.equal(state.seededAt, '2026-11-25T18:00:00.000Z')
  assert.equal(state.baseUrl, SEED_DEFAULTS['base-url'])
  assert.equal(runs.length, 2)
  assert.equal(app.calls[0].init.body, 'email=root%40test&password=pw')
  assert.equal(written[0].file, 's.json')
  assert.deepEqual(JSON.parse(written[0].text), state)
  assert.match(logs.at(-1), /^\[capacity-seed\] 2 clubs in \d+ s, 0 failed$/)
  assert.deepEqual(state.failed, [])
})

test('runSeed reports a club that fails and seeds the others', async () => {
  const app = fakeApp()
  const failing = fakeSpawn((slug) => (slug === 'cap-001' ? 'boom' : `${createdLine(slug)}\n`))
  const logs = []
  const state = await runSeed({
    argv: ['--clubs', '2', '--participants', '1', '--groups', '1', '--guardians', '1', '--state', 's.json'],
    env: { OM_INIT_SUPERADMIN_EMAIL: 'root@test', OM_INIT_SUPERADMIN_PASSWORD: 'pw' },
    deps: {
      fetchImpl: app.fetchImpl,
      spawnSyncImpl: failing.spawnSyncImpl,
      now: NOW,
      log: (line) => logs.push(line),
      writeFile: () => {},
    },
  })
  assert.deepEqual(
    state.clubs.map((club) => club.slug),
    ['cap-002'],
  )
  assert.deepEqual(state.failed, [{ slug: 'cap-001', error: 'create-club cap-001 failed: ' }])
  assert.ok(logs.includes('[capacity-seed] cap-001 failed: create-club cap-001 failed: '))
  assert.match(logs.at(-1), /1 clubs in \d+ s, 1 failed$/)
})

test('runSeed takes the superadmin from the options and writes the state file by default', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vereino-capacity-seed-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  t.mock.method(console, 'log', () => {})
  const app = fakeApp()
  const file = path.join(dir, 'nested', 'state.json')
  const argv = ['--clubs', '1', '--participants', '1', '--groups', '1', '--guardians', '0', '--state', file]
  const state = await runSeed({
    argv: [...argv, '--super-email', 'opt@test', '--super-password', 'opt'],
    env: {},
    deps: { fetchImpl: app.fetchImpl, spawnSyncImpl: fakeSpawn().spawnSyncImpl },
  })
  assert.equal(app.calls[0].init.body, 'email=opt%40test&password=opt')
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), state)
  assert.equal(fs.statSync(file).mode & 0o777, 0o600)
  assert.equal(console.log.mock.callCount(), 2)
})

test('runSeed needs the superadmin e-mail and password', async () => {
  await assert.rejects(runSeed({ argv: [], env: {} }), /the superadmin e-mail and password are needed/)
  await assert.rejects(
    runSeed({ argv: [], env: { OM_INIT_SUPERADMIN_EMAIL: 'root@test' } }),
    /the superadmin e-mail and password are needed/,
  )
})

test('the seed password is random per run and meets the password policy', () => {
  assert.equal(newSeedPassword(Buffer.from([1, 2, 3])), 'Capacity-AQID-Aa1!')
  assert.match(SEED_PASSWORD, /^Capacity-[A-Za-z0-9_-]{16}-Aa1!$/)
})
