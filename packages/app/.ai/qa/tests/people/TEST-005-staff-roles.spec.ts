import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { apiRequest, getAuthToken } from '@open-mercato/core/helpers/integration/api'
import {
  createRoleFixture,
  createUserFixture,
  deleteUserIfExists,
} from '@open-mercato/core/helpers/integration/authFixtures'
import { createIsolatedTenant } from '../_fixtures/tenant'
import {
  OPTIMISTIC_LOCK_HEADER,
  actionLogs,
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createAccount,
  createClub,
  createPerson,
  expectRoles,
  mercato,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'

// TEST-005 (club spec; issue #38): a staff account gets its `auth` roles from role assignments — coordinator of
// section A (scope `section_ids = [A]`), then coach; an assignment saved before the account is granted with the
// account; ending the assignment revokes the role through `people:sync-role-expiry`; the acting role is recorded.
test.describe.configure({ timeout: 300_000 })

test('TEST-005 role assignments grant and revoke auth roles with the section scope', async ({ request }) => {
  const club = await createClub(request, 'test-005')
  try {
    const sectionA = randomUUID()
    // The assignment is saved before the person has an account.
    const personId = await createPerson(request, club.adminToken, {
      firstName: 'Marta',
      lastName: 'Koordynatorka',
      birthDate: birthDateTurning(33),
    })
    const coordinatorAssignment = await assignRole(request, club.adminToken, {
      personId,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
    })
    const logs = await actionLogs(request, club.adminToken, coordinatorAssignment)
    expect(logs.find((entry) => entry.commandId === 'people.role_assignments.create')?.context?.actingRole).toBe(
      'club_admin',
    )

    // "Create account": the assignment's role comes with the account.
    const email = `marta-${uniqueSuffix()}@example.org`
    const account = await createAccount(request, club.adminToken, personId, email)
    expect(account.status, JSON.stringify(account.body)).toBe(201)
    const userId = String(account.body?.userId)
    club.extraUserIds.push(userId)
    await expectRoles(request, club, userId, ['vereino_coordinator', 'vereino_member'])

    // She signs in and sees only her section's assignments (scope section_ids = [A]).
    const token = await signInAs(request, club, userId, email)
    const otherSection = randomUUID()
    const otherPerson = await createPerson(request, club.adminToken, { firstName: 'Olek', lastName: 'Inny' })
    const otherAssignment = await assignRole(request, club.adminToken, {
      personId: otherPerson,
      role: 'coordinator',
      sectionId: otherSection,
      validFrom: '2020-01-01',
    })
    const visible = await call<{ items?: { id: string; sectionId: string | null }[] }>(
      request,
      'GET',
      '/api/people/role-assignments?pageSize=100',
      token,
    )
    expect(visible.status).toBe(200)
    expect(new Set((visible.body?.items ?? []).map((item) => item.sectionId))).toEqual(new Set([sectionA]))
    expect((visible.body?.items ?? []).map((item) => item.id)).not.toContain(otherAssignment)

    // A later coach assignment adds vereino_coach; the permissions add up.
    await assignRole(request, club.adminToken, { personId, role: 'coach', validFrom: '2020-01-01' })
    await expectRoles(request, club, userId, ['vereino_coach', 'vereino_coordinator', 'vereino_member'])

    // The coordinator assignment ends today; once `valid_to` has passed the daily job revokes the role, and a second
    // run gives the same result.
    const current = await call<{ updatedAt?: string }>(
      request,
      'GET',
      `/api/people/role-assignments/${coordinatorAssignment}`,
      club.adminToken,
    )
    const ended = await call(
      request,
      'POST',
      `/api/people/role-assignments/${coordinatorAssignment}/end`,
      club.adminToken,
      {
        data: { validTo: calendarDate() },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(current.body?.updatedAt) },
      },
    )
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    const args = ['people', 'sync-role-expiry', '--tenant', club.tenant.tenantId, '--org', club.tenant.organizationId]
    mercato([...args, '--today', calendarDate(1)])
    await expectRoles(request, club, userId, ['vereino_coach', 'vereino_member'])
    mercato([...args, '--today', calendarDate(1)])
    await expectRoles(request, club, userId, ['vereino_coach', 'vereino_member'])
  } finally {
    await club.cleanup()
  }
})

test('TEST-005 negative: the platform admin and a look-alike role name get no access to people', async ({
  request,
}) => {
  // The seeded technical administrator (`admin` role, no Vereino feature) → 403 on /api/people/*.
  const adminToken = await getAuthToken(request, 'admin')
  for (const path of ['/api/people/persons', '/api/people/role-assignments']) {
    const response = await apiRequest(request, 'GET', path, { token: adminToken })
    expect(response.status(), path).toBe(403)
  }
  const create = await apiRequest(request, 'POST', '/api/people/persons', {
    token: adminToken,
    data: { firstName: 'Nie', lastName: 'Wolno' },
  })
  expect(create.status()).toBe(403)

  // A user holding a role named exactly `vereino_club_admin`, in a tenant whose role carries no feature, is denied:
  // role names are never checked (DD-06), only features.
  const tenant = await createIsolatedTenant(request, 'test-005-lookalike')
  const superToken = await getAuthToken(request, 'superadmin')
  let userId: string | null = null
  try {
    await createRoleFixture(request, superToken, { name: 'vereino_club_admin', tenantId: tenant.tenantId })
    const email = `lookalike-${uniqueSuffix()}@example.org`
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    userId = await createUserFixture(request, superToken, {
      email,
      password,
      organizationId: tenant.organizationId,
      roles: ['vereino_club_admin'],
    })
    const token = await getAuthToken(request, email, password)
    expect((await apiRequest(request, 'GET', '/api/people/persons', { token })).status()).toBe(403)
    expect((await apiRequest(request, 'POST', '/api/people/role-assignments', { token, data: {} })).status()).toBe(403)
  } finally {
    await deleteUserIfExists(request, superToken, userId)
    await tenant.cleanup()
  }
})
