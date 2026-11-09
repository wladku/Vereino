import { expect, test } from '@playwright/test'
import { addDays, createEvent, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createStaff, userRoles } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'
import { phoneRental, postRental, rentalPitch, staffCalendar } from '../_fixtures/facilities'
import {
  completeMaintenance,
  listMaintenance,
  makeMaintainer,
  postMaintenance,
  removeMaintainer,
} from '../_fixtures/maintenance'

// Issue #128 (E08-S08), facilities spec REQ-022, DD-36, Q-043, TEST-050: a person with no club role who maintains the
// pitch (not the hall) gets only the derived role `vereino_maintenance_planner`. They read the pitch's calendar with
// the public redaction — no renter, person or group names, no contact data — but with the maintenance details; the
// hall's calendar answers 403 and is not listed. They plan and complete work on the pitch; work on the hall is 403.
// Once the assignment is removed, the role goes and planning on the pitch is 403 too.
test.describe.configure({ timeout: 300_000 })

test('TEST-050 a maintainer reads a redacted calendar of their places and plans only there', async ({ request }) => {
  const club = await createClub(request, 'test-050-maintainer')
  try {
    const admin = club.adminToken
    const setup = await rentalPitch(request, club)
    const hall = await createStructure(request, admin, 'places', { name: 'Hala sportowa', kind: 'hall' })
    const saturday = nextWeekday(addDays(calendarDate(), 7), 'SA')

    // The pitch on Saturday: a rental with the renter's contact data and a group's session.
    const rental = await postRental(
      request,
      admin,
      phoneRental(setup.pitch, setup.neighbours, zoneInstant(saturday, '15:00')),
    )
    expect(rental.status, JSON.stringify(rental.body)).toBe(201)
    const event = await createEvent(request, admin, {
      groupId: setup.zaki,
      type: 'tournament',
      name: 'Turniej Żaków',
      placeId: setup.pitch,
      startsAt: zoneInstant(saturday, '10:00'),
      endsAt: zoneInstant(saturday, '12:00'),
    })
    expect(event.status, JSON.stringify(event.body)).toBe(201)

    const groundsman = await createStaff(request, club, {
      firstName: 'Zenon',
      lastName: 'Gospodarz',
      birthDate: birthDateTurning(50),
    })
    const { assignmentId, token } = await makeMaintainer(request, club, groundsman, setup.pitch)
    const roles = await userRoles(request, club, groundsman.userId)
    expect(roles).toContain('vereino_maintenance_planner')
    expect(roles.filter((role) => ['vereino_coordinator', 'vereino_coach', 'vereino_club_admin'].includes(role))).toEqual(
      [],
    )

    // Plan brushing on the pitch on Saturday morning (before the session).
    const planned = await postMaintenance(request, token, {
      placeId: setup.pitch,
      kind: 'brushing',
      scheduleType: 'one_off',
      startsAt: zoneInstant(saturday, '07:00'),
      endsAt: zoneInstant(saturday, '08:30'),
      notes: 'Szczotkowanie sztucznej trawy',
    })
    expect(planned.status, JSON.stringify(planned.body)).toBe(201)

    // The pitch's calendar: occupancy without names or contacts, the maintenance with its details.
    const window = `from=${encodeURIComponent(zoneInstant(saturday, '00:00'))}&to=${encodeURIComponent(zoneInstant(saturday, '23:59'))}`
    const pitchView = await staffCalendar(request, token, `placeId=${setup.pitch}&${window}`)
    expect(pitchView.status, JSON.stringify(pitchView.body)).toBe(200)
    const text = JSON.stringify(pitchView.body)
    for (const secret of ['KS Sąsiedzi', 'Jan Kontakt', '600 000 001', 'Turniej Żaków']) {
      expect(text, secret).not.toContain(secret)
    }
    const entries = pitchView.body?.entries ?? []
    expect(entries).toContainEqual(expect.objectContaining({ kind: 'rental', label: null, bookedByName: null }))
    expect(entries).toContainEqual(expect.objectContaining({ kind: 'session', label: null, groupId: null }))
    expect(entries).toContainEqual(
      expect.objectContaining({ id: planned.body?.id, kind: 'maintenance', label: 'brushing', bookedByName: 'Zenon Gospodarz' }),
    )
    expect((pitchView.body as { maintenance?: unknown }).maintenance).toEqual({
      redacted: true,
      canPlan: true,
      planPlaceIds: [setup.pitch],
    })

    // The club overview lists the pitch only; the hall's calendar is 403.
    const overview = await staffCalendar(request, token, window)
    expect(overview.status, JSON.stringify(overview.body)).toBe(200)
    expect(overview.body?.places?.map((place) => place.id)).toEqual([setup.pitch])
    const hallView = await staffCalendar(request, token, `placeId=${hall}&${window}`)
    expect(hallView.status, JSON.stringify(hallView.body)).toBe(403)

    // Complete the task on the pitch; work on the hall is 403.
    const tasks = await listMaintenance(request, token)
    expect(tasks.map((task) => task.id)).toEqual([planned.body?.id])
    const done = await completeMaintenance(request, token, String(planned.body?.id), tasks[0]?.updatedAt, { cost: 0 })
    expect(done.status, JSON.stringify(done.body)).toBe(200)
    expect(done.body?.status).toBe('done')
    expect(done.body?.nextTaskId).toBeNull()
    const onHall = await postMaintenance(request, token, {
      placeId: hall,
      kind: 'inspection',
      scheduleType: 'one_off',
      dueDate: addDays(saturday, 14),
    })
    expect(onHall.status, JSON.stringify(onHall.body)).toBe(403)

    // The administrator removes the assignment: the derived role goes, planning on the pitch is 403.
    const removed = await removeMaintainer(request, admin, assignmentId)
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    await expect
      .poll(async () => (await userRoles(request, club, groundsman.userId)).includes('vereino_maintenance_planner'), {
        timeout: 20_000,
      })
      .toBe(false)
    const afterRemoval = await postMaintenance(request, token, {
      placeId: setup.pitch,
      kind: 'brushing',
      scheduleType: 'one_off',
      startsAt: zoneInstant(saturday, '07:00'),
      endsAt: zoneInstant(saturday, '08:00'),
    })
    expect(afterRemoval.status, JSON.stringify(afterRemoval.body)).toBe(403)
  } finally {
    await club.cleanup()
  }
})
