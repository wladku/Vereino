// Capacity seed (many-clubs spec TEST-M09, phase 5; #633): fills a running production build with synthetic clubs, the
// way the maintainers create them (`club_core create-club`) and the clubs fill them (the app's own API): per club a
// section, a place, groups, one coach, a people import of participants with their guardians and groups, a weekly
// training per group with today's session open for check-off, a monthly fee per group with this month's charges, and
// a few guardian accounts. Writes the tokens and ids the load script needs to a state file (synthetic users only).
//
// NEVER against a real or dev database: run it only against the disposable capacity stack of `docs/ops/capacity.md`,
// with `RATE_LIMIT_ENABLED=false` while seeding (thousands of sign-ins) and the queue workers running (role sync).
//
// Usage (cwd = packages/app): node scripts/vereino-capacity-seed.mjs --base-url http://127.0.0.1:5101 \
//   --clubs 100 --participants 150 --groups 6 --guardians 10 --state /tmp/vereino-capacity/state.json
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { clubDay, clubSlug, createApi, parseArgs, pool, sleep } from './vereino-capacity-lib.mjs'

export const SEED_DEFAULTS = {
  'base-url': 'http://127.0.0.1:5101',
  clubs: 100,
  from: 1,
  participants: 150,
  groups: 6,
  guardians: 10,
  concurrency: 4,
  'time-zone': 'Europe/Warsaw',
  state: '/tmp/vereino-capacity/state.json',
  'super-email': '',
  'super-password': '',
  // The command that runs the app's CLI, e.g. `docker exec vereino-capacity-cli yarn` for the Docker stack.
  cli: 'yarn',
}

/** Synthetic password of every seeded account (the stack is disposable and private to the test). */
export const SEED_PASSWORD = 'Capacity-Seed-2026-Aa1!'

/** The people import columns of `familiesCsv` (`people/lib/import-mapping.ts`). */
export const FAMILY_MAPPING = {
  'participant.firstName': 0,
  'participant.lastName': 1,
  'participant.birthDate': 2,
  'guardian1.firstName': 3,
  'guardian1.lastName': 4,
  'guardian1.email': 5,
  group: 6,
  'participant.externalId': 7,
  'guardian1.birthDate': 8,
}

export const groupName = (index) => `Grupa ${String(index + 1)}`
// Zero-padded: the people list filters names by prefix, so `…-1` would also find `…-10`.
const pad = (index) => String(index).padStart(5, '0')
export const guardianLastName = (slug, index) => `Opiekun-${slug}-${pad(index)}`
export const childLastName = (slug, index) => `Dziecko-${slug}-${pad(index)}`
export const guardianEmail = (slug, index) => `guardian-${String(index)}@${slug}.capacity.test`

/** The import sheet of one club: participant `i` in group `i % groups`, with guardian `i`. */
export function familiesCsv(slug, participants, groups) {
  const lines = [
    'Imię;Nazwisko;Data urodzenia;Imię opiekuna;Nazwisko opiekuna;E-mail opiekuna;Grupa;Nr;Data urodzenia opiekuna',
  ]
  for (let index = 0; index < participants; index += 1) {
    const birth = `${String(2012 + (index % 8))}-0${String(1 + (index % 9))}-1${String(index % 9)}`
    lines.push(
      [
        `Dziecko${String(index)}`,
        childLastName(slug, index),
        birth,
        'Anna',
        guardianLastName(slug, index),
        guardianEmail(slug, index),
        groupName(index % groups),
        `${slug}-${String(index)}`,
        '1985-05-20',
      ].join(';'),
    )
  }
  return `${lines.join('\n')}\n`
}

/** The JSON line `create-club` printed last (it logs other lines before it). */
export function lastJsonLine(text) {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('{'))
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(lines[index])
      if (parsed && typeof parsed.status === 'string') return parsed
    } catch {
      // a log line, not the result
    }
  }
  return null
}

/** Runs `yarn mercato club_core create-club` for the club and answers its result line. */
export function createClubCli(slug, timeZone, spawnSyncImpl = spawnSync, cli = 'yarn') {
  const [command, ...prefix] = cli.split(' ').filter(Boolean)
  const run = spawnSyncImpl(
    command,
    [
      ...prefix,
      'mercato',
      'club_core',
      'create-club',
      '--slug',
      slug,
      '--name',
      `Klub ${slug}`,
      '--admin-email',
      `admin@${slug}.capacity.test`,
      '--admin-first-name',
      'Admin',
      '--admin-last-name',
      slug,
      '--timezone',
      timeZone,
      '--locale',
      'pl',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
  const result = lastJsonLine(run.stdout)
  if (!result || (result.status !== 'created' && result.status !== 'exists')) {
    throw new Error(`create-club ${slug} failed: ${result ? JSON.stringify(result) : String(run.stderr).slice(-500)}`)
  }
  return result
}

function expectStatus(result, wanted, what) {
  if (!wanted.includes(result.status)) {
    throw new Error(`${what}: HTTP ${String(result.status)} ${JSON.stringify(result.body).slice(0, 300)}`)
  }
  return result.body
}

/** Signs in with e-mail and password (form-encoded, as the login page does) and answers the token. */
export async function signIn(call, email, password) {
  const form = new URLSearchParams({ email, password })
  const result = await call('POST', '/api/auth/login', {
    form: form.toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })
  return String(expectStatus(result, [200], `sign in ${email}`).token)
}

/** Sets the seeded password on a user (as the invitation link would) and signs in. */
export async function passwordAndToken(call, superToken, userId, email) {
  expectStatus(
    await call('PUT', '/api/auth/users', { token: superToken, json: { id: userId, password: SEED_PASSWORD } }),
    [200],
    `set password ${email}`,
  )
  return signIn(call, email, SEED_PASSWORD)
}

/** Waits until the role sync gave the user `role` (the queue workers run it). */
export async function waitForRole(
  call,
  superToken,
  userId,
  role,
  { attempts = 60, delayMs = 1000, wait = sleep } = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await call('GET', `/api/auth/users?id=${userId}`, { token: superToken })
    const user = (result.body?.items ?? []).find((item) => item.id === userId)
    if ((user?.roles ?? []).includes(role)) return
    await wait(delayMs)
  }
  throw new Error(`user ${userId} never got the role ${role}`)
}

/** The id of the one person with `lastName` in the club. */
export async function personByLastName(call, token, lastName) {
  const body = expectStatus(
    await call('GET', `/api/people/persons?lastName=${encodeURIComponent(lastName)}&pageSize=5`, { token }),
    [200],
    `find ${lastName}`,
  )
  const id = body?.items?.[0]?.id
  if (!id) throw new Error(`no person ${lastName}`)
  return String(id)
}

/** Seeds one club (see the header) and answers its state entry. */
export async function seedClub(ctx, index) {
  const { call, options, superToken, now, spawnSyncImpl, log } = ctx
  const slug = clubSlug(index)
  const created = createClubCli(slug, options['time-zone'], spawnSyncImpl, options.cli)
  const today = clubDay(now(), options['time-zone'])
  const adminToken = await passwordAndToken(call, superToken, created.adminUserId, `admin@${slug}.capacity.test`)
  const post = async (pathName, json, what) =>
    expectStatus(await call('POST', pathName, { token: adminToken, json }), [200, 201], `${slug} ${what}`)

  const section = await post('/api/club_core/sections', { name: 'Piłka nożna' }, 'section')
  const place = await post('/api/club_core/places', { name: 'Boisko', kind: 'pitch', capacityGroups: 2 }, 'place')
  const groups = []
  for (let group = 0; group < options.groups; group += 1) {
    const created = await post(
      '/api/groups/groups',
      { sectionId: section.id, name: groupName(group), kind: 'team' },
      'group',
    )
    groups.push(String(created.id))
  }

  const coach = await post(
    '/api/people/persons',
    { firstName: 'Trener', lastName: `Trener-${slug}`, birthDate: '1985-04-12' },
    'coach',
  )
  const coachEmail = `coach@${slug}.capacity.test`
  const coachAccount = await post(`/api/people/persons/${coach.id}/account`, { email: coachEmail }, 'coach account')
  await post('/api/people/role-assignments', { personId: coach.id, role: 'coach', validFrom: today.date }, 'coach role')
  for (const groupId of groups) {
    await post(
      '/api/groups/memberships',
      { groupId, personId: coach.id, role: 'coach', validFrom: today.date },
      'coach membership',
    )
  }

  const form = new FormData()
  form.append(
    'file',
    new Blob([familiesCsv(slug, options.participants, options.groups)], { type: 'text/csv' }),
    'f.csv',
  )
  form.append('mapping', JSON.stringify(FAMILY_MAPPING))
  const preview = expectStatus(
    await call('POST', '/api/people/imports', { token: adminToken, form }),
    [201],
    `${slug} import`,
  )
  expectStatus(
    await call('POST', `/api/people/imports/${preview.id}/commit`, {
      token: adminToken,
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': preview.updatedAt },
    }),
    [200],
    `${slug} import commit`,
  )

  // One weekly training per group; today's session started in the small hours, so its check-off is open.
  const occurrences = []
  for (let group = 0; group < groups.length; group += 1) {
    const activity = await post(
      '/api/activities/activities',
      {
        groupId: groups[group],
        name: `Trening ${groupName(group)}`,
        type: 'training',
        placeId: place.id,
        coachPersonId: coach.id,
        recurrenceRule: `FREQ=WEEKLY;BYDAY=${today.weekday};UNTIL=20270630`,
        startsOn: today.date,
        startTime: `0${String(group % 10)}:00`,
        endTime: `0${String(group % 10)}:45`,
      },
      'activity',
    )
    const sessions = expectStatus(
      await call(
        'GET',
        `/api/activities/occurrences?pageSize=1&sortField=occurrenceDate&sortDir=asc&activityId=${activity.id}`,
        { token: adminToken },
      ),
      [200],
      `${slug} sessions`,
    )
    occurrences.push(String(sessions.items[0].id))
  }

  for (const groupId of groups) {
    await post(
      '/api/payments/fees',
      {
        name: `Składka ${groupId.slice(0, 4)}`,
        groupId,
        period: 'monthly',
        amount: 15000,
        dueDay: 28,
        validFrom: `${today.date.slice(0, 8)}01`,
      },
      'fee',
    )
  }
  await post('/api/payments/charges/generate', { period: today.date.slice(0, 7) }, 'charges')

  const guardians = []
  for (let guardian = 0; guardian < Math.min(options.guardians, options.participants); guardian += 1) {
    const personId = await personByLastName(call, adminToken, guardianLastName(slug, guardian))
    const childId = await personByLastName(call, adminToken, childLastName(slug, guardian))
    const email = guardianEmail(slug, guardian)
    const account = await post(`/api/people/persons/${personId}/account`, { email }, 'guardian account')
    guardians.push({
      userId: String(account.userId),
      email,
      childId,
      occurrenceId: occurrences[guardian % groups.length],
    })
  }

  await waitForRole(call, superToken, String(coachAccount.userId), 'vereino_coach')
  const coachToken = await passwordAndToken(call, superToken, String(coachAccount.userId), coachEmail)
  const signedIn = []
  for (const guardian of guardians) {
    await waitForRole(call, superToken, guardian.userId, 'vereino_member')
    const token = await passwordAndToken(call, superToken, guardian.userId, guardian.email)
    signedIn.push({ token, childId: guardian.childId, occurrenceId: guardian.occurrenceId })
  }
  log(`[capacity-seed] ${slug} seeded`)
  return {
    slug,
    tenantId: created.tenantId,
    organizationId: created.organizationId,
    adminToken,
    coachToken,
    occurrences,
    guardians: signedIn,
  }
}

/** Seeds `--clubs` clubs from `--from`, `--concurrency` at a time, and writes the state file. */
export async function runSeed({ argv, env = process.env, deps = {} }) {
  const options = parseArgs(argv, SEED_DEFAULTS)
  const {
    fetchImpl = fetch,
    spawnSyncImpl = spawnSync,
    now = () => new Date(),
    log = console.log,
    writeFile = (file, text) => {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, text, { mode: 0o600 })
    },
  } = deps
  const call = createApi({ baseUrl: options['base-url'], fetchImpl, retries: 2 })
  const superEmail = options['super-email'] || env.OM_INIT_SUPERADMIN_EMAIL
  const superPassword = options['super-password'] || env.OM_INIT_SUPERADMIN_PASSWORD
  if (!superEmail || !superPassword) throw new Error('the superadmin e-mail and password are needed')
  const superToken = await signIn(call, superEmail, superPassword)
  const indexes = Array.from({ length: options.clubs }, (_, offset) => options.from + offset)
  const started = Date.now()
  // One club that fails is reported and left out of the state; the others go on.
  const failed = []
  const results = await pool(indexes, options.concurrency, (index) =>
    seedClub({ call, options, superToken, now, spawnSyncImpl, log }, index).catch((error) => {
      failed.push({ slug: clubSlug(index), error: error.message })
      log(`[capacity-seed] ${clubSlug(index)} failed: ${failed[failed.length - 1].error}`)
      return null
    }),
  )
  const clubs = results.filter(Boolean)
  const state = { baseUrl: options['base-url'], seededAt: now().toISOString(), clubs, failed }
  writeFile(options.state, `${JSON.stringify(state, null, 2)}\n`)
  const seconds = String(Math.round((Date.now() - started) / 1000))
  log(`[capacity-seed] ${String(clubs.length)} clubs in ${seconds} s, ${String(failed.length)} failed`)
  return state
}

/* node:coverage ignore next 9 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await runSeed({ argv: process.argv.slice(2) })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
