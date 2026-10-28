import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import { getAuthToken } from '@open-mercato/core/helpers/integration/api'
import { createUserFixture } from '@open-mercato/core/helpers/integration/authFixtures'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  getAssignment,
  getPerson,
  signInAs,
  uniqueSuffix,
} from '../_fixtures/club'

// TEST-F02 (foundation spec, security): the record scope of `people` — an unlinked user sees empty lists and gets 403
// on details (`scopeWhere` fails closed); a coordinator of section A sees A only, in lists and details alike; an
// administrator acting on her own ward is recorded as `guardian` (least-privileged first).
test.describe.configure({ timeout: 300_000 })

type ListBody = { items?: { id: string; sectionId?: string | null; personId?: string }[]; total?: number }

test('TEST-F02 record scope: unlinked user, coordinator of section A, administrator as guardian', async ({
  request,
}) => {
  const club = await createClub(request, 'test-f02')
  try {
    const sectionA = randomUUID()
    const sectionB = randomUUID()
    const coordinator = await createStaff(request, club, {
      firstName: 'Celina',
      lastName: 'Koordynator',
      birthDate: birthDateTurning(35),
    })
    const assignmentA = await assignRole(request, club.adminToken, {
      personId: coordinator.personId,
      role: 'coordinator',
      sectionId: sectionA,
      validFrom: '2020-01-01',
    })
    const otherPersonId = await createPerson(request, club.adminToken, { firstName: 'Bartek', lastName: 'Sekcja' })
    const assignmentB = await assignRole(request, club.adminToken, {
      personId: otherPersonId,
      role: 'coordinator',
      sectionId: sectionB,
      validFrom: '2020-01-01',
    })
    const coordinatorToken = await signInAs(request, club, coordinator.userId, coordinator.email)

    // Coordinator of section A: list and detail agree — A only.
    const list = await call<ListBody>(request, 'GET', '/api/people/role-assignments?pageSize=100', coordinatorToken)
    expect(list.status).toBe(200)
    const ids = (list.body?.items ?? []).map((item) => item.id)
    expect(ids).toContain(assignmentA)
    expect(ids).not.toContain(assignmentB)
    expect((list.body?.items ?? []).every((item) => item.sectionId === sectionA)).toBe(true)
    expect((await getAssignment(request, coordinatorToken, assignmentA)).status).toBe(200)
    const denied = await getAssignment(request, coordinatorToken, assignmentB)
    expect(denied.status).toBe(403)
    expect(denied.body?.code).toBe('scope_denied')
    // The coordinator holds people.view but no person grant over others (phase A1: memberships come with #30).
    expect((await getPerson(request, coordinatorToken, otherPersonId)).status).toBe(403)
    expect((await getPerson(request, coordinatorToken, coordinator.personId)).status).toBe(200)

    // A user without a linked person: the feature passes, the record scope fails closed.
    const email = `unlinked-${uniqueSuffix()}@example.org`
    const password = `Vereino-${uniqueSuffix()}-Aa1!`
    const unlinkedId = await createUserFixture(request, club.superToken, {
      email,
      password,
      organizationId: club.tenant.organizationId,
      roles: ['vereino_coordinator'],
    })
    club.extraUserIds.push(unlinkedId)
    const unlinkedToken = await getAuthToken(request, email, password)
    const persons = await call<ListBody>(request, 'GET', '/api/people/persons', unlinkedToken)
    expect(persons.status).toBe(200)
    expect(persons.body?.items ?? []).toEqual([])
    const assignments = await call<ListBody>(request, 'GET', '/api/people/role-assignments', unlinkedToken)
    expect(assignments.status).toBe(200)
    expect(assignments.body?.items ?? []).toEqual([])
    expect((await getPerson(request, unlinkedToken, otherPersonId)).status).toBe(403)
    expect((await getAssignment(request, unlinkedToken, assignmentA)).status).toBe(403)

    // The administrator is also the guardian of a ward: editing the ward is recorded as `guardian`.
    const wardId = await createPerson(request, club.adminToken, {
      firstName: 'Jaś',
      lastName: 'Podopieczny',
      birthDate: birthDateTurning(9),
    })
    const guardianship = await call(request, 'POST', '/api/people/guardianships', club.adminToken, {
      data: { guardianPersonId: club.adminPersonId, wardPersonId: wardId, validFrom: calendarDate() },
    })
    expect(guardianship.status, JSON.stringify(guardianship.body)).toBe(201)
    const ward = await getPerson(request, club.adminToken, wardId)
    const edited = await call<{ actingRole?: string }>(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: wardId, preferredLocale: 'pl' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(ward.body?.updatedAt) },
    })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    expect(edited.body?.actingRole).toBe('guardian')
    // A person the administrator is not the guardian of is still edited as `club_admin`.
    const other = await getPerson(request, club.adminToken, otherPersonId)
    const asAdmin = await call<{ actingRole?: string }>(request, 'PUT', '/api/people/persons', club.adminToken, {
      data: { id: otherPersonId, preferredLocale: 'en' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(other.body?.updatedAt) },
    })
    expect(asAdmin.body?.actingRole).toBe('club_admin')
  } finally {
    await club.cleanup()
  }
})
