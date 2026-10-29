import { expect, test } from '@playwright/test'
import {
  OPTIMISTIC_LOCK_HEADER,
  assignRole,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
  createStaff,
  expectRoles,
  signInAs,
} from '../_fixtures/club'
import { create, getOne, list, update } from '../_fixtures/club-structure'

// TEST-032 (club spec; issue #25 — coordinator part; the 409 rules for sections with groups wait for `groups`):
// one person coordinates two sections and the `section_ids` scope covers both; the section list carries the
// coordinators (the `people` enricher) and warns about an active section without one, which still works.
test.describe.configure({ timeout: 300_000 })

test('TEST-032 one coordinator of two sections; "no coordinator" warning; ending an assignment', async ({
  request,
}) => {
  const club = await createClub(request, 'test-032')
  try {
    const token = club.adminToken
    const academy = await create(request, token, 'sections', { name: 'Akademia piłkarska' })
    const pool = await create(request, token, 'sections', { name: 'Basen' })
    const chess = await create(request, token, 'sections', { name: 'Szachy' })
    const archived = await create(request, token, 'sections', { name: 'Cheerleader', isActive: false })

    const marek = await createStaff(request, club, {
      firstName: 'Marek',
      lastName: 'Koordynator',
      birthDate: birthDateTurning(41),
    })
    await assignRole(request, token, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: academy,
      validFrom: '2020-01-01',
    })
    const poolAssignment = await assignRole(request, token, {
      personId: marek.personId,
      role: 'coordinator',
      sectionId: pool,
      validFrom: '2020-01-01',
    })
    // A coordinator who starts next month is listed but does not clear the warning yet.
    const ewa = await createPerson(request, token, { firstName: 'Ewa', lastName: 'Przyszła' })
    await assignRole(request, token, {
      personId: ewa,
      role: 'coordinator',
      sectionId: chess,
      validFrom: calendarDate(40),
    })

    const adminList = await list(request, token, 'sections')
    expect(adminList.status).toBe(200)
    const byId = new Map(adminList.items.map((item) => [item.id, item]))
    expect(byId.get(academy)?._people).toMatchObject({
      coordinatorMissing: false,
      coordinators: [{ personId: marek.personId, lastName: 'Koordynator', active: true }],
    })
    expect(byId.get(pool)?._people?.coordinatorMissing).toBe(false)
    expect(byId.get(chess)?._people).toMatchObject({
      coordinatorMissing: true,
      coordinators: [{ personId: ewa, lastName: 'Przyszła', active: false }],
    })
    // An inactive section is not flagged; a flagged section still works (it can be edited).
    expect(byId.get(archived)?._people).toMatchObject({ coordinatorMissing: false, coordinators: [] })
    const chessRow = byId.get(chess)
    const edited = await update(
      request,
      token,
      'sections',
      { id: chess, description: 'Bez koordynatora' },
      chessRow?.updatedAt,
    )
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)

    // Marek's scope `section_ids` covers both of his sections and nothing else.
    await expectRoles(request, club, marek.userId, ['vereino_coordinator', 'vereino_member'])
    const marekToken = await signInAs(request, club, marek.userId, marek.email)
    const scoped = await list(request, marekToken, 'sections')
    expect(scoped.status).toBe(200)
    expect(new Set(scoped.items.map((item) => item.id))).toEqual(new Set([academy, pool]))
    // A coordinator reads but does not manage sections, and lists no places or institutions.
    const academyRow = scoped.items.find((item) => item.id === academy)
    const denied = await update(
      request,
      marekToken,
      'sections',
      { id: academy, name: 'Akademia' },
      academyRow?.updatedAt,
    )
    expect(denied.status).toBe(403)
    expect((await list(request, marekToken, 'places')).items).toEqual([])
    expect((await list(request, marekToken, 'institutions')).items).toEqual([])

    // Ending the pool assignment yesterday: the pool is flagged and leaves Marek's scope.
    const assignment = await call<{ updatedAt?: string }>(
      request,
      'GET',
      `/api/people/role-assignments/${poolAssignment}`,
      token,
    )
    const ended = await call(request, 'POST', `/api/people/role-assignments/${poolAssignment}/end`, token, {
      data: { validTo: calendarDate(-1) },
      headers: { [OPTIMISTIC_LOCK_HEADER]: String(assignment.body?.updatedAt) },
    })
    expect(ended.status, JSON.stringify(ended.body)).toBe(200)
    expect((await getOne(request, token, 'sections', pool))?._people).toMatchObject({
      coordinatorMissing: true,
      coordinators: [],
    })
    const narrowed = await list(request, marekToken, 'sections')
    expect(narrowed.items.map((item) => item.id)).toEqual([academy])
  } finally {
    await club.cleanup()
  }
})
