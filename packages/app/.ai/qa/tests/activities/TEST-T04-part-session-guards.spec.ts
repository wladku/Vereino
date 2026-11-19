import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  deleteActivity,
  getActivity,
  getOccurrence,
  moveOccurrence,
  nextWeekday,
  readNotifications,
  updateActivity,
  zoneInstant,
} from '../_fixtures/activities'
import { memberAccount } from '../_fixtures/attendance'
import {
  OPTIMISTIC_LOCK_HEADER,
  birthDateTurning,
  calendarDate,
  call,
  createClub,
  createPerson,
} from '../_fixtures/club'
import { clubEventId, examplePlaces, partIds } from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// Club events spec TEST-T04 (REQ-T02, REQ-T05, DD-T02, DD-T05, DD-T06; #376): a part session is moved and cancelled
// only by who manages its club event. Piotr, coach of Trampkarz only, gets 403 `club_event_part_managed_by_event` for a
// PATCH and a cancellation of his part session; Wojtek, coordinator of the academy, gets the same on a part of the
// administrator's whole-club event; a coordinator of another section is outside the session's scope (403). Wojtek
// moves the Orlik part of his own event by an hour (200; the participant gets one moved notice) and is refused another
// place (422 `club_event_part_place_fixed`). Piotr still reports his absence on his part. The generic activity edit and
// delete answer 409 `activity_is_club_event_part` with `clubEventId`.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-T04 a coach and a coordinator outside the event cannot move or cancel a part session; the organiser moves it within the event’s place', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t04')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' })
    const trampkarz = await createGroup(request, admin, { sectionId: academy, name: 'Trampkarz', kind: 'team' })
    const { hall, salka } = await examplePlaces(request, club)
    const since = addDays(calendarDate(), -30)
    const wojtek = await signedInStaff(request, club, {
      firstName: 'Wojtek',
      lastName: 'Malinowski',
      role: 'coordinator',
      sectionId: academy,
    })
    const ewa = await signedInStaff(request, club, {
      firstName: 'Ewa',
      lastName: 'Fit',
      role: 'coordinator',
      sectionId: fitness,
    })
    const piotr = await signedInStaff(request, club, { firstName: 'Piotr', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: trampkarz,
      personId: piotr.personId,
      role: 'coach',
      validFrom: since,
    })
    await addMembership(request, admin, { groupId: orlik, personId: wojtek.personId, role: 'coach', validFrom: since })
    const player = await createPerson(request, admin, {
      firstName: 'Iga',
      lastName: 'Gracz',
      birthDate: birthDateTurning(19),
    })
    await addMembership(request, admin, { groupId: orlik, personId: player, role: 'participant', validFrom: since })
    const iga = await memberAccount(request, club, player, 'iga-t04')

    const saturday = nextWeekday(addDays(calendarDate(), 7), 'SA')
    const eventId = await clubEventId(request, wojtek.token, {
      name: 'GWIAZDA CUP 2026',
      sectionId: academy,
      placeId: hall,
    })
    const orlikPart = await partIds(request, wojtek.token, eventId, {
      title: 'Turniej Orlika Młodszego',
      groupId: orlik,
      coachPersonId: wojtek.personId,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '14:00'),
    })
    const trampkarzPart = await partIds(request, wojtek.token, eventId, {
      title: 'Turniej Trampkarza',
      groupId: trampkarz,
      coachPersonId: piotr.personId,
      startsAt: zoneInstant(saturday, '14:30'),
      endsAt: zoneInstant(saturday, '16:30'),
    })
    const wholeClubId = await clubEventId(request, admin, { name: 'Festyn klubowy', sectionId: null, placeId: hall })
    const festynPart = await partIds(request, admin, wholeClubId, {
      title: 'Festyn – Orlik',
      groupId: orlik,
      startsAt: zoneInstant(addDays(saturday, 1), '10:00'),
      endsAt: zoneInstant(addDays(saturday, 1), '11:00'),
    })

    const sessionOf = async (id: string | null) => {
      const read = await getOccurrence(request, admin, String(id))
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      return read.body as { id: string; updatedAt: string }
    }
    const later = { startAt: zoneInstant(saturday, '15:00'), endAt: zoneInstant(saturday, '17:00') }

    // --- Piotr, coach of Trampkarz only: 403 club_event_part_managed_by_event for a move and a cancellation ---
    const trampkarzSession = await sessionOf(trampkarzPart.occurrenceId)
    const piotrMove = await moveOccurrence(request, piotr.token, trampkarzSession.id, later, trampkarzSession.updatedAt)
    expect(piotrMove.status, JSON.stringify(piotrMove.body)).toBe(403)
    expect(piotrMove.body?.code).toBe('club_event_part_managed_by_event')
    const piotrCancel = await cancelOccurrence(
      request,
      piotr.token,
      trampkarzSession.id,
      'Choroba',
      trampkarzSession.updatedAt,
    )
    expect(piotrCancel.status, JSON.stringify(piotrCancel.body)).toBe(403)
    expect(piotrCancel.body?.code).toBe('club_event_part_managed_by_event')
    // Wojtek coordinates the academy, but the whole-club event is the administrator's.
    const festynSession = await sessionOf(festynPart.occurrenceId)
    const notHisEvent = await moveOccurrence(
      request,
      wojtek.token,
      festynSession.id,
      { startAt: zoneInstant(addDays(saturday, 1), '11:00'), endAt: zoneInstant(addDays(saturday, 1), '12:00') },
      festynSession.updatedAt,
    )
    expect(notHisEvent.status, JSON.stringify(notHisEvent.body)).toBe(403)
    expect(notHisEvent.body?.code).toBe('club_event_part_managed_by_event')
    const notHisCancel = await cancelOccurrence(
      request,
      wojtek.token,
      festynSession.id,
      'Deszcz',
      festynSession.updatedAt,
    )
    expect(notHisCancel.status, JSON.stringify(notHisCancel.body)).toBe(403)
    expect(notHisCancel.body?.code).toBe('club_event_part_managed_by_event')
    // A coordinator of another section does not reach the session at all.
    const ewaMove = await moveOccurrence(request, ewa.token, trampkarzSession.id, later, trampkarzSession.updatedAt)
    expect(ewaMove.status, JSON.stringify(ewaMove.body)).toBe(403)

    // --- Wojtek moves his Orlik part by an hour; the participant gets one moved notice ---
    const orlikSession = await sessionOf(orlikPart.occurrenceId)
    const elsewhere = await moveOccurrence(
      request,
      wojtek.token,
      orlikSession.id,
      { placeId: salka },
      orlikSession.updatedAt,
    )
    expect(elsewhere.status, JSON.stringify(elsewhere.body)).toBe(422)
    expect(elsewhere.body?.code).toBe('club_event_part_place_fixed')
    const moved = await moveOccurrence(
      request,
      wojtek.token,
      orlikSession.id,
      { startAt: zoneInstant(saturday, '10:00'), endAt: zoneInstant(saturday, '15:00'), placeId: hall },
      orlikSession.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.actingRole).toBe('coordinator')
    expect((moved.body as { notified?: number }).notified).toBeGreaterThanOrEqual(1)
    await expect
      .poll(
        async () =>
          (
            await readNotifications(
              request,
              iga.token,
              `&type=activities.occurrence_moved&sourceEntityId=${orlikSession.id}`,
            )
          ).length,
        { timeout: 30_000 },
      )
      .toBe(1)

    // --- Piotr reports his absence on his part: the coach keeps that right ---
    const current = await sessionOf(trampkarzPart.occurrenceId)
    const absence = await call(request, 'POST', `/api/activities/occurrences/${current.id}/absence`, piotr.token, {
      data: { reason: 'Choroba' },
      headers: { [OPTIMISTIC_LOCK_HEADER]: current.updatedAt },
    })
    expect(absence.status, JSON.stringify(absence.body)).toBe(200)

    // --- The generic activity edit and delete refuse a part's activity ---
    const activity = await getActivity(request, admin, String(orlikPart.activityId))
    const updatedAt = String((activity.body as { updatedAt?: string }).updatedAt)
    const edit = await updateActivity(
      request,
      wojtek.token,
      { id: String(orlikPart.activityId), name: 'Inny' },
      updatedAt,
    )
    expect(edit.status, JSON.stringify(edit.body)).toBe(409)
    expect(edit.body).toMatchObject({ code: 'activity_is_club_event_part', clubEventId: eventId })
    const removed = await deleteActivity(request, admin, String(orlikPart.activityId), updatedAt)
    expect(removed.status, JSON.stringify(removed.body)).toBe(409)
    expect(removed.body?.code).toBe('activity_is_club_event_part')
  } finally {
    await club.cleanup()
  }
})
