import { expect, test } from '@playwright/test'
import { addDays, getOccurrence, nextWeekday, readNotifications, zoneInstant } from '../_fixtures/activities'
import { memberAccount } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, createClub, createPerson } from '../_fixtures/club'
import {
  cancelOpenPart,
  clubEventId,
  deletePart,
  examplePlaces,
  partIds,
  readClubEvent,
  updateClubEvent,
} from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup } from '../_fixtures/groups'

// Club events spec TEST-T06 (REQ-T05, DD-T04, DD-T05; #376): an event at the external hall with two future parts, a
// past part and an open part. Changing its place to a club place answers 422 `club_event_open_part_needs_external_place`
// while the open part is live; once it is cancelled, a change to a club place where one part collides answers 409 and
// moves nothing; once the slot is freed, the change moves the two future sessions (the past one keeps the hall) and the
// participant of a moved part gets one moved notice.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-T06 a change of the event’s place moves only the planned future part sessions, after the open-part rule and the collision check', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t06')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const [g1, g2, g3] = [
      await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' }),
      await createGroup(request, admin, { sectionId: academy, name: 'Żak młodszy', kind: 'team' }),
      await createGroup(request, admin, { sectionId: academy, name: 'Trampkarz', kind: 'team' }),
    ]
    const { hall, salka } = await examplePlaces(request, club)
    const player = await createPerson(request, admin, {
      firstName: 'Iga',
      lastName: 'Gracz',
      birthDate: birthDateTurning(19),
    })
    await addMembership(request, admin, { groupId: g1, personId: player, role: 'participant', validFrom: '2020-01-01' })
    const iga = await memberAccount(request, club, player, 'iga-t06')

    const today = calendarDate()
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const sunday = addDays(saturday, 1)
    const eventId = await clubEventId(request, admin, { name: 'GWIAZDA CUP 2026', sectionId: academy, placeId: hall })
    const future1 = await partIds(request, admin, eventId, {
      title: 'Turniej Orlika',
      groupId: g1,
      startsAt: zoneInstant(saturday, '10:00'),
      endsAt: zoneInstant(saturday, '12:00'),
    })
    const future2 = await partIds(request, admin, eventId, {
      title: 'Turniej Żaka',
      groupId: g2,
      startsAt: zoneInstant(sunday, '10:00'),
      endsAt: zoneInstant(sunday, '12:00'),
    })
    const past = await partIds(request, admin, eventId, {
      title: 'Turniej wczorajszy',
      groupId: g2,
      startsAt: zoneInstant(addDays(today, -1), '10:00'),
      endsAt: zoneInstant(addDays(today, -1), '12:00'),
    })
    const open = await partIds(request, admin, eventId, {
      title: 'Turniej Drużyn – Seniorzy (16+)',
      groupId: null,
      startsAt: zoneInstant(addDays(saturday, 7), '08:30'),
      endsAt: zoneInstant(addDays(saturday, 7), '14:00'),
    })

    // --- An open part blocks a club place ---
    let record = await readClubEvent(request, admin, eventId)
    const blocked = await updateClubEvent(request, admin, { id: eventId, placeId: salka }, record.body?.updatedAt)
    expect(blocked.status, JSON.stringify(blocked.body)).toBe(422)
    expect(blocked.body?.code).toBe('club_event_open_part_needs_external_place')
    const openView = record.body?.parts.find((part) => part.id === open.id)
    const cancelledOpen = await cancelOpenPart(request, admin, eventId, open.id, 'Brak drużyn', openView?.updatedAt)
    expect(cancelledOpen.status, JSON.stringify(cancelledOpen.body)).toBe(200)
    expect(cancelledOpen.body?.status).toBe('cancelled')

    // --- A colliding change saves nothing ---
    const other = await clubEventId(request, admin, { name: 'Sparing w salce', sectionId: academy, placeId: salka })
    const blocker = await partIds(request, admin, other, {
      title: 'Trampkarz w salce',
      groupId: g3,
      startsAt: zoneInstant(saturday, '11:00'),
      endsAt: zoneInstant(saturday, '13:00'),
    })
    record = await readClubEvent(request, admin, eventId)
    const collides = await updateClubEvent(request, admin, { id: eventId, placeId: salka }, record.body?.updatedAt)
    expect(collides.status, JSON.stringify(collides.body)).toBe(409)
    expect(collides.body?.code).toBe('occurrence_place_conflict')
    expect(collides.body?.conflicts?.map((conflict) => conflict.key)).toEqual([future1.occurrenceId])
    const stillHall = await getOccurrence(request, admin, String(future1.occurrenceId))
    expect(stillHall.body).toMatchObject({ placeId: hall })
    expect((await readClubEvent(request, admin, eventId)).body?.placeId).toBe(hall)

    // --- Free the slot; the change moves the two future sessions only ---
    const otherRecord = await readClubEvent(request, admin, other)
    const removed = await deletePart(
      request,
      admin,
      other,
      blocker.id,
      otherRecord.body?.parts.find((part) => part.id === blocker.id)?.updatedAt,
    )
    expect(removed.status, JSON.stringify(removed.body)).toBe(200)
    record = await readClubEvent(request, admin, eventId)
    const moved = await updateClubEvent(request, admin, { id: eventId, placeId: salka }, record.body?.updatedAt)
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.sessionsMoved).toBe(2)
    expect(moved.body?.notified).toBeGreaterThanOrEqual(1)
    for (const id of [future1.occurrenceId, future2.occurrenceId]) {
      expect((await getOccurrence(request, admin, String(id))).body).toMatchObject({ placeId: salka })
    }
    expect((await getOccurrence(request, admin, String(past.occurrenceId))).body).toMatchObject({ placeId: hall })
    expect((await readClubEvent(request, admin, eventId)).body).toMatchObject({ placeId: salka, placeExternal: false })
    await expect
      .poll(
        async () =>
          (
            await readNotifications(
              request,
              iga.token,
              `&type=activities.occurrence_moved&sourceEntityId=${String(future1.occurrenceId)}`,
            )
          ).length,
        { timeout: 30_000 },
      )
      .toBe(1)
  } finally {
    await club.cleanup()
  }
})
