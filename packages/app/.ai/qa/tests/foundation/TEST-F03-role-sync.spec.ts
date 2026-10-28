import { expect, test } from '@playwright/test'
import { createRoleFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import { withClient } from '@open-mercato/core/helpers/integration/dbFixtures'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  bootstrapAdmin,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  expectRoles,
  mercato,
  mercatoAsync,
  userRoles,
  uniqueSuffix,
  type Club,
} from '../_fixtures/club'

// TEST-F03 (foundation spec): role seeding and `auth` role sync — seedRoles twice, an assignment granted then
// revoked, the daily `people:sync-role-expiry` job (twice, then on the next day), roles outside `vereino_*` kept,
// `vereino_payer` on the 18th birthday, a future assignment on its first day, a job racing an assignment change,
// and a failed `auth.users.update` retried by the next run.
test.describe.configure({ timeout: 300_000 })

type JobResult = { counts?: { processed: number; updated: number; unchanged: number; failed: number; skipped: number } }

function runJob(club: Club, today?: string): JobResult {
  const args = ['people', 'sync-role-expiry', '--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
  return mercato(today ? [...args, '--today', today] : args) ?? {}
}

async function vereinoRoleCounts(tenantId: string): Promise<Record<string, number>> {
  return withClient(async (client) => {
    const { rows } = await client.query<{ name: string; count: string }>(
      `select name, count(*) as count from roles where tenant_id = $1 and name like 'vereino\\_%' and deleted_at is null group by name`,
      [tenantId],
    )
    return Object.fromEntries(rows.map((row) => [row.name, Number(row.count)]))
  })
}

async function renameRole(tenantId: string, from: string, to: string): Promise<void> {
  await withClient(async (client) => {
    await client.query('update roles set name = $3 where tenant_id = $1 and name = $2', [tenantId, from, to])
  })
}

test('TEST-F03 role seeding, sync, expiry job, payer birthday, future start and retry', async ({ request }) => {
  const club = await createClub(request, 'test-f03')
  const tenantRole = await userRoles(request, club, club.adminUserId)
  try {
    // seedRoles runs on every bootstrap (from people's setup); a second run creates no duplicates.
    bootstrapAdmin(club.tenant, club.adminUserId)
    expect(await vereinoRoleCounts(club.tenant.tenantId)).toEqual({
      vereino_club_admin: 1,
      vereino_coach: 1,
      vereino_coordinator: 1,
      vereino_member: 1,
      vereino_payer: 1,
    })

    // A staff member who also holds a platform role outside `vereino_*`, which no sync may remove. (A tenant created
    // through the API refuses a custom role named `admin`; any role outside the `vereino_` prefix takes its place.)
    const staff = await createStaff(request, club, {
      firstName: 'Stefan',
      lastName: 'Trener',
      birthDate: birthDateTurning(30),
    })
    await expectRoles(request, club, staff.userId, ['vereino_member'])
    const platformRole = `platform-admin-${uniqueSuffix()}`
    await createRoleFixture(request, club.superToken, { name: platformRole, tenantId: club.tenant.tenantId })
    const grantAdmin = await call(request, 'PUT', '/api/auth/users', club.superToken, {
      data: { id: staff.userId, roles: [platformRole, 'vereino_member'] },
    })
    expect(grantAdmin.status, JSON.stringify(grantAdmin.body)).toBe(200)

    // Coordinator from the past with no end, coach later: both granted by the subscriber.
    const coordinatorId = await assignRole(request, club.adminToken, {
      personId: staff.personId,
      role: 'coordinator',
      sectionId: '11111111-1111-4111-8111-111111111111',
      validFrom: '2020-01-01',
    })
    await expectRoles(request, club, staff.userId, [platformRole, 'vereino_coordinator', 'vereino_member'])
    await assignRole(request, club.adminToken, { personId: staff.personId, role: 'coach', validFrom: '2020-01-01' })
    await expectRoles(request, club, staff.userId, [
      platformRole,
      'vereino_coach',
      'vereino_coordinator',
      'vereino_member',
    ])

    // The coordinator assignment ends today: still held today; the job on the next day revokes it, twice = once.
    const coordinator = await call<{ updatedAt?: string }>(
      request,
      'GET',
      `/api/people/role-assignments/${coordinatorId}`,
      club.adminToken,
    )
    const ended = await call(request, 'POST', `/api/people/role-assignments/${coordinatorId}/end`, club.adminToken, {
      data: { validTo: calendarDate() },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(coordinator.body?.updatedAt) },
    })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    await expectRoles(request, club, staff.userId, [
      platformRole,
      'vereino_coach',
      'vereino_coordinator',
      'vereino_member',
    ])
    const firstRun = runJob(club)
    expect(firstRun.counts?.failed).toBe(0)
    expect(firstRun.counts?.updated).toBe(0)
    const tomorrow = calendarDate(1)
    const nextDay = runJob(club, tomorrow)
    expect(nextDay.counts?.updated).toBeGreaterThanOrEqual(1)
    await expectRoles(request, club, staff.userId, [platformRole, 'vereino_coach', 'vereino_member'])
    const repeat = runJob(club, tomorrow)
    expect(repeat.counts?.updated).toBe(0)
    expect(repeat.counts?.failed).toBe(0)
    await expectRoles(request, club, staff.userId, [platformRole, 'vereino_coach', 'vereino_member'])
    // The administrator keeps her platform role on every sync.
    expect(await userRoles(request, club, club.adminUserId)).toEqual(tenantRole)

    // A guardian who turns 18 tomorrow, with an account, and an assignment that starts tomorrow.
    const guardian = await createStaff(request, club, {
      firstName: 'Gosia',
      lastName: 'Opiekunka',
      birthDate: birthDateTurning(18, 1),
    })
    const wardId = await createPerson(request, club.adminToken, { firstName: 'Mały', lastName: 'Podopieczny' })
    const guardianship = await call(request, 'POST', '/api/people/guardianships', club.adminToken, {
      data: { guardianPersonId: guardian.personId, wardPersonId: wardId, validFrom: '2024-01-01' },
    })
    expect(guardianship.status).toBe(201)
    await assignRole(request, club.adminToken, { personId: guardian.personId, role: 'coach', validFrom: tomorrow })
    await expectRoles(request, club, guardian.userId, ['vereino_member'])

    // The payer role is missing from the tenant: the update fails and the job counts it; the next run retries it.
    await renameRole(club.tenant.tenantId, 'vereino_payer', 'vereino_payer_disabled')
    try {
      const failed = runJob(club, tomorrow)
      expect(failed.counts?.failed).toBe(1)
    } finally {
      await renameRole(club.tenant.tenantId, 'vereino_payer_disabled', 'vereino_payer')
    }
    const retried = runJob(club, tomorrow)
    expect(retried.counts?.failed).toBe(0)
    await expectRoles(request, club, guardian.userId, ['vereino_coach', 'vereino_member', 'vereino_payer'])

    // A job racing an assignment change ends in the desired set.
    const race = mercatoAsync([
      'people',
      'sync-role-expiry',
      '--tenant',
      club.tenant.tenantId,
      '--org',
      club.tenant.organizationId,
    ])
    await assignRole(request, club.adminToken, {
      personId: staff.personId,
      role: 'coordinator',
      sectionId: '22222222-2222-4222-8222-222222222222',
      validFrom: '2020-01-01',
    })
    await race
    runJob(club)
    await expectRoles(request, club, staff.userId, [
      platformRole,
      'vereino_coach',
      'vereino_coordinator',
      'vereino_member',
    ])
  } finally {
    await club.cleanup()
  }
})
