import { expect, test } from '@playwright/test'
import { addDays } from '../_fixtures/activities'
import { declare, ensureDefaultPolicies, firstSession, weeklySeries } from '../_fixtures/attendance'
import { actionLogs, birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'

// AC-F02 of the foundation spec, the declaration part (#583): an administrator who is also the guardian of a ward
// declares the ward's absence from a session. Least-privileged first, the grant the declaration is made under is
// `guardian`: the response and the audit entry of `activities.attendance.declare` carry `actingRole: 'guardian'`, and
// the declaration is the family's (`source: 'app'`), not a staff one. The same administrator declaring for a child
// she is not the guardian of still acts as `club_admin` (`source: 'staff'`). TEST-F02-record-scope proves the rule
// through a ward edit; TEST-009/TEST-011 prove `guardian` only for ordinary guardians.
test.describe.configure({ timeout: 300_000 })

test('TEST-F02-admin-guardian an administrator declares her own ward absent as guardian, another child as club_admin', async ({
  request,
}) => {
  const club = await createClub(request, 'test-f02-admin-guardian')
  try {
    const admin = club.adminToken
    await ensureDefaultPolicies(request, club)
    const section = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const pitch = await createStructure(request, admin, 'places', { name: 'Boisko A', kind: 'pitch' })
    const zaki = await createGroup(request, admin, { sectionId: section, name: 'Żaki', kind: 'team' })

    const wardId = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Podopieczny',
      birthDate: birthDateTurning(9),
    })
    const otherChildId = await createPerson(request, admin, {
      firstName: 'Staś',
      lastName: 'Sąsiad',
      birthDate: birthDateTurning(9),
    })
    const since = addDays(calendarDate(), -30)
    await createGuardianship(request, admin, {
      guardianPersonId: club.adminPersonId,
      wardPersonId: wardId,
      isPrimaryPayer: true,
      consents: { regulations: true },
      validFrom: since,
    })
    for (const personId of [wardId, otherChildId]) {
      await addMembership(request, admin, { groupId: zaki, personId, role: 'participant', validFrom: since })
    }
    const training = await weeklySeries(request, club, admin, {
      groupId: zaki,
      placeId: pitch,
      name: 'Trening Żaków',
      type: 'training',
      weekday: 'TU',
      start: '17:00',
      end: '18:30',
    })
    const session = firstSession(training.sessions)

    // Her own ward: the declaration is made as `guardian`, a family declaration.
    const asGuardian = await declare(request, admin, { occurrenceId: session.id, personId: wardId, declared: 'no' })
    expect(asGuardian.status, JSON.stringify(asGuardian.body)).toBe(201)
    expect(asGuardian.body).toMatchObject({
      personId: wardId,
      declared: 'no',
      declarationStatus: 'final',
      declaredByPersonId: club.adminPersonId,
      source: 'app',
      actingRole: 'guardian',
      created: true,
    })
    const wardLogs = await actionLogs(request, admin, String(asGuardian.body?.id))
    const wardDeclaration = wardLogs.find((entry) => entry.commandId === 'activities.attendance.declare')
    expect(wardDeclaration, JSON.stringify(wardLogs)).toBeTruthy()
    expect(wardDeclaration?.context?.actingRole).toBe('guardian')

    // A child she is not the guardian of: the administrator's own grant, a staff declaration.
    const asAdmin = await declare(request, admin, { occurrenceId: session.id, personId: otherChildId, declared: 'no' })
    expect(asAdmin.status, JSON.stringify(asAdmin.body)).toBe(201)
    expect(asAdmin.body).toMatchObject({
      personId: otherChildId,
      declared: 'no',
      declaredByPersonId: club.adminPersonId,
      source: 'staff',
      actingRole: 'club_admin',
    })
    const otherLogs = await actionLogs(request, admin, String(asAdmin.body?.id))
    const otherDeclaration = otherLogs.find((entry) => entry.commandId === 'activities.attendance.declare')
    expect(otherDeclaration?.context?.actingRole).toBe('club_admin')
  } finally {
    await club.cleanup()
  }
})
