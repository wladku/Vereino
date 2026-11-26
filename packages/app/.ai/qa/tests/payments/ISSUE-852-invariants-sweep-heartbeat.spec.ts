import { randomUUID } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { expect, test } from '@playwright/test'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import { calendarDate, createClub, mercato, mercatoAsync, type Club } from '../_fixtures/club'

// Many-clubs spec *Observability* (issue #852, E22): on the club job sweep the payments invariants heartbeat pings
// once per sweep run, after every club the run enqueued has finished, with the count of failing clubs — instead of
// once per club, where a later clean club cleared the alert of an earlier one.
// - Two clubs, both due: the sweep enqueues both; their runs (the app's worker) finish; the round check, run from the
//   operator command with the heartbeat URL of a local test server, pings `<url>` once with 0 failing clubs.
// - Club B gets a handover numbering gap: the next sweep run finishes both clubs, B's job state records the problem
//   code `payments.invariants.drift` while its next run stays on the nightly schedule, and the round pings
//   `<url>/fail` once with 1 failing club.
test.describe.configure({ timeout: 420_000 })

const JOB = 'payments:verify-invariants'
const HEARTBEAT_VARIABLE = 'VEREINO_OPS_PAYMENTS_INVARIANTS_HEARTBEAT_URL'

type Round = { jobKey: string; clubs: Array<[string, string]>; enqueueFailed: number }
type Sweep = { job: string; enqueued: Array<{ organizationId: string }>; round: Round | null }
type Outcome = { jobKey: string; clubs: number; failing: number; unfinished: number }
type Step = { done: false } | { done: true; outcome: Outcome }
type JobRow = { next_due_at: Date | null; last_error: string | null; last_finished_at: Date | null }

function scopeArgs(club: Club): string[] {
  return ['--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
}

async function jobRow(club: Club): Promise<JobRow | null> {
  return withClient(async (client) => {
    const { rows } = await client.query<JobRow>(
      `select next_due_at, last_error, last_finished_at from foundation_club_jobs
        where organization_id = $1 and job_key = $2`,
      [club.tenant.organizationId, JOB],
    )
    return rows[0] ?? null
  })
}

/** Makes the clubs' check due a minute ago, with no lease. */
async function makeDue(clubs: Club[]) {
  await withClient(async (client) => {
    await client.query(
      `update foundation_club_jobs set next_due_at = now() - interval '1 minute', lease_until = null
        where organization_id = any($1::uuid[]) and job_key = $2`,
      [clubs.map((club) => club.tenant.organizationId), JOB],
    )
  })
}

/** One sweep of the check that returns its round instead of queueing it. */
function sweep(): Sweep {
  const result = mercato(['foundation', 'club-jobs', 'sweep', '--job', JOB, '--round', 'return']) as {
    sweeps: Sweep[]
  } | null
  const first = result?.sweeps.at(0)
  if (!first) throw new Error('[internal] foundation club-jobs sweep printed no sweep')
  return first
}

/** Runs the round check from the operator command, with the heartbeat URL, until the round is done. */
async function settle(round: Round, heartbeatUrl: string): Promise<Outcome> {
  let outcome: Outcome | null = null
  await expect
    .poll(
      async () => {
        const step = (await mercatoAsync(['foundation', 'club-jobs', 'check-round', '--round', JSON.stringify(round)], {
          [HEARTBEAT_VARIABLE]: heartbeatUrl,
        })) as Step
        if (step.done) outcome = step.outcome
        return step.done
      },
      { timeout: 180_000, intervals: [3_000] },
    )
    .toBe(true)
  return outcome as unknown as Outcome
}

/** A local heartbeat monitor that records the path of every ping. */
async function startMonitor(): Promise<{ server: Server; url: string; pings: string[] }> {
  const pings: string[] = []
  const server = createServer((req, res) => {
    pings.push(String(req.url))
    res.writeHead(200).end('OK')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { server, url: `http://127.0.0.1:${String(port)}/hb`, pings }
}

async function dropJobState(clubs: Club[]) {
  await withClient(async (client) => {
    await client.query('delete from foundation_club_jobs where organization_id = any($1::uuid[])', [
      clubs.map((club) => club.tenant.organizationId),
    ])
  })
}

test('ISSUE-852 the invariants heartbeat pings once per sweep run with the count of failing clubs', async ({
  request,
}) => {
  const clubs: Club[] = []
  const monitor = await startMonitor()
  try {
    const a = await createClub(request, 'issue-852-a')
    clubs.push(a)
    const b = await createClub(request, 'issue-852-b')
    clubs.push(b)
    for (const club of clubs) mercato(['payments', 'set-up-club', ...scopeArgs(club)])
    const ours = new Set(clubs.map((club) => club.tenant.organizationId))

    // --- Both clubs clean: one ping, no failing club ---
    await makeDue(clubs)
    const clean = sweep()
    expect(clean.enqueued.filter((row) => ours.has(row.organizationId))).toHaveLength(2)
    expect(clean.round?.clubs.map(([, organizationId]) => organizationId)).toEqual(
      expect.arrayContaining([...ours]),
    )
    const cleanOutcome = await settle(clean.round as Round, monitor.url)
    expect(cleanOutcome).toMatchObject({ jobKey: JOB, failing: 0, unfinished: 0 })
    expect(cleanOutcome.clubs).toBeGreaterThanOrEqual(2)
    expect(monitor.pings).toEqual(['/hb'])
    for (const club of clubs) expect((await jobRow(club))?.last_error).toBeNull()

    // --- Club B with a handover numbering gap: B fails, one `/fail` ping for the run ---
    const month = `${calendarDate().slice(0, 4)}/${calendarDate().slice(5, 7)}`
    await withClient(async (client) => {
      await client.query(
        `insert into payments_cash_handovers
           (id, organization_id, tenant_id, number, collector_person_id, amount, payment_ids, created_at, updated_at)
         values ($1, $2, $3, $4, $5, 0, '{}'::uuid[], now(), now())`,
        [randomUUID(), b.tenant.organizationId, b.tenant.tenantId, `RG/${month}/002`, b.adminPersonId],
      )
    })
    await makeDue(clubs)
    const drift = sweep()
    expect(drift.enqueued.filter((row) => ours.has(row.organizationId))).toHaveLength(2)
    const driftOutcome = await settle(drift.round as Round, monitor.url)
    expect(driftOutcome).toMatchObject({ jobKey: JOB, failing: 1, unfinished: 0 })
    expect(monitor.pings).toEqual(['/hb', '/hb/fail'])

    // B's job state names the problem; its next run stays on the nightly schedule, not a quick retry.
    const bRow = await jobRow(b)
    expect(bRow?.last_error).toBe('payments.invariants.drift')
    const nextLocal = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Warsaw',
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(bRow?.next_due_at as Date)
    expect(nextLocal).toBe('03')
    expect((await jobRow(a))?.last_error).toBeNull()
  } finally {
    monitor.server.close()
    await dropJobState(clubs)
  }
})
