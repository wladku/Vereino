import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, readNotifications, zoneInstant } from '../_fixtures/activities'
import { familyFor } from '../_fixtures/attendance'
import { calendarDate, call, createClub } from '../_fixtures/club'
import {
  addPart,
  cancelClubEvent,
  clubEventId,
  createClubEvent,
  examplePlaces,
  partIds,
  readClubEvent,
  updateClubEvent,
  type ClubEventRecord,
} from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// Club events spec TEST-T01 and TEST-T16 for the club-event routes (REQ-T01, DD-T06, Q-T18; #376): Wojtek, coordinator
// of "Akademia piłkarska", creates "GWIAZDA CUP 2026" for his section (the slug proposed from the name); a whole-club
// event or one for another section answers 403 `scope_denied`; a duplicate slug 409 `club_event_slug_taken`; he edits
// the description with the lock token; he reads the administrator's whole-club event (`mayManage: false`) but cannot
// change it; a coach reads no club event. Cancelling with a reason cancels the planned future part sessions
// (`cancelledSessions`), after which an update and a new part answer 409 `club_event_cancelled`. Another club's
// administrator gets 404 for every route on the event and an empty list. The second test (#605) cancels a whole-club
// event with a Żaki part and a pool part and counts the session notices per recipient: each family of a part's group
// is told once per part, nobody twice for one part.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-T01 a coordinator creates, edits and cancels the club event of his section only; another club sees nothing', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t01')
  const other = await createClub(request, 'test-t01-other')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const orlik = await createGroup(request, admin, { sectionId: academy, name: 'Orlik młodszy', kind: 'team' })
    const { hall } = await examplePlaces(request, club)
    const wojtek = await signedInStaff(request, club, {
      firstName: 'Wojtek',
      lastName: 'Malinowski',
      role: 'coordinator',
      sectionId: academy,
    })
    const piotr = await signedInStaff(request, club, { firstName: 'Piotr', lastName: 'Trener', role: 'coach' })
    await addMembership(request, admin, {
      groupId: orlik,
      personId: piotr.personId,
      role: 'coach',
      validFrom: '2020-01-01',
    })

    // --- Create for the own section; the slug is proposed from the name ---
    const created = await createClubEvent(request, wojtek.token, {
      name: 'GWIAZDA CUP 2026',
      sectionId: academy,
      placeId: hall,
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 48 * 60,
    })
    expect(created.status, JSON.stringify(created.body)).toBe(201)
    expect(created.body).toMatchObject({ publicSlug: 'gwiazda-cup-2026', actingRole: 'coordinator' })
    const eventId = String(created.body?.id)

    // --- Whole club and another section: 403 scope_denied ---
    for (const sectionId of [null, fitness]) {
      const refused = await createClubEvent(request, wojtek.token, {
        name: 'Turniej obcy',
        publicSlug: `turniej-obcy-${sectionId ? 'f' : 'k'}`,
        sectionId,
        placeId: hall,
      })
      expect(refused.status, JSON.stringify(refused.body)).toBe(403)
      expect(refused.body?.code).toBe('scope_denied')
    }

    // --- A duplicate slug: 409 club_event_slug_taken; the administrator's whole-club event ---
    const duplicate = await createClubEvent(request, admin, {
      name: 'Gwiazda Cup 2026',
      sectionId: null,
      placeId: hall,
    })
    expect(duplicate.status, JSON.stringify(duplicate.body)).toBe(409)
    expect(duplicate.body?.code).toBe('club_event_slug_taken')
    const wholeClubId = await clubEventId(request, admin, {
      name: 'Festyn klubowy',
      sectionId: null,
      placeId: hall,
      isPublic: true,
    })

    // --- Wojtek edits the description with the lock token; without it 400 ---
    const record = await readClubEvent(request, wojtek.token, eventId)
    expect(record.status, JSON.stringify(record.body)).toBe(200)
    expect(record.body).toMatchObject({ sectionId: academy, placeExternal: true, partsCount: 0, mayManage: true })
    const noToken = await updateClubEvent(request, wojtek.token, { id: eventId, description: 'Turniej halowy' }, null)
    expect(noToken.status).toBe(400)
    const edited = await updateClubEvent(
      request,
      wojtek.token,
      { id: eventId, description: 'Halowy turniej piłki nożnej' },
      record.body?.updatedAt,
    )
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    expect(edited.body).toMatchObject({ sessionsMoved: 0, notified: 0 })

    // --- Q-T18: the coordinator reads the whole-club event but does not manage it ---
    const wholeClub = await readClubEvent(request, wojtek.token, wholeClubId)
    expect(wholeClub.status, JSON.stringify(wholeClub.body)).toBe(200)
    expect(wholeClub.body).toMatchObject({ sectionId: null, mayManage: false })
    const notHis = await updateClubEvent(
      request,
      wojtek.token,
      { id: wholeClubId, description: 'x' },
      wholeClub.body?.updatedAt,
    )
    expect(notHis.status, JSON.stringify(notHis.body)).toBe(403)
    const list = await call<{ items?: ClubEventRecord[] }>(request, 'GET', '/api/activities/club-events', wojtek.token)
    expect(list.status, JSON.stringify(list.body)).toBe(200)
    expect(list.body?.items?.map((item) => item.id).sort()).toEqual([eventId, wholeClubId].sort())
    // A coach reads no club event (the coach role holds no `activities.view`).
    const coachList = await call<{ items?: unknown[] }>(request, 'GET', '/api/activities/club-events', piotr.token)
    expect(coachList.status, JSON.stringify(coachList.body)).toBe(403)
    expect((await readClubEvent(request, piotr.token, eventId)).status).toBe(403)
    // A coach has no `activities.manage`: the writes are closed to them.
    const coachCreate = await createClubEvent(request, piotr.token, {
      name: 'Moja impreza',
      sectionId: academy,
      placeId: hall,
    })
    expect(coachCreate.status).toBe(403)

    // --- A part, then the cancellation: the planned future part session is cancelled ---
    const today = calendarDate()
    const saturday = nextWeekday(addDays(today, 7), 'SA')
    const part = await addPart(request, wojtek.token, eventId, {
      title: 'Turniej Orlika Młodszego',
      groupId: orlik,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '14:00'),
    })
    expect(part.status, JSON.stringify(part.body)).toBe(201)
    const beforeCancel = await readClubEvent(request, wojtek.token, eventId)
    const shortReason = await cancelClubEvent(request, wojtek.token, eventId, 'x', beforeCancel.body?.updatedAt)
    expect(shortReason.status).toBe(400)
    const cancelled = await cancelClubEvent(
      request,
      wojtek.token,
      eventId,
      'Hala zamknięta',
      beforeCancel.body?.updatedAt,
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelledSessions: 1 })
    const afterCancel = await readClubEvent(request, wojtek.token, eventId)
    expect(afterCancel.body?.status).toBe('cancelled')
    expect(afterCancel.body?.parts.at(0)).toMatchObject({ status: 'cancelled' })
    const lateEdit = await updateClubEvent(
      request,
      wojtek.token,
      { id: eventId, description: 'Po odwołaniu' },
      afterCancel.body?.updatedAt,
    )
    expect(lateEdit.status, JSON.stringify(lateEdit.body)).toBe(409)
    expect(lateEdit.body?.code).toBe('club_event_cancelled')
    const latePart = await addPart(request, wojtek.token, eventId, {
      title: 'Turniej spóźniony',
      groupId: orlik,
      startsAt: zoneInstant(saturday, '15:00'),
      endsAt: zoneInstant(saturday, '16:00'),
    })
    expect(latePart.status, JSON.stringify(latePart.body)).toBe(409)
    expect(latePart.body?.code).toBe('club_event_cancelled')

    // --- TEST-T16: another club's administrator reaches nothing of this club ---
    const foreign = other.adminToken
    expect((await readClubEvent(request, foreign, eventId)).status).toBe(404)
    const foreignList = await call<{ items?: unknown[] }>(request, 'GET', '/api/activities/club-events', foreign)
    expect(foreignList.status).toBe(200)
    expect(foreignList.body?.items).toEqual([])
    const foreignUpdate = await updateClubEvent(
      request,
      foreign,
      { id: wholeClubId, description: 'cudze' },
      wholeClub.body?.updatedAt,
    )
    expect(foreignUpdate.status, JSON.stringify(foreignUpdate.body)).toBe(404)
    expect((await cancelClubEvent(request, foreign, wholeClubId, 'cudze', wholeClub.body?.updatedAt)).status).toBe(404)
    const foreignPart = await addPart(request, foreign, wholeClubId, {
      title: 'Cudza część',
      groupId: null,
      startsAt: zoneInstant(saturday, '09:00'),
      endsAt: zoneInstant(saturday, '10:00'),
    })
    expect(foreignPart.status, JSON.stringify(foreignPart.body)).toBe(404)
    const untouched = await readClubEvent(request, admin, wholeClubId)
    expect(untouched.body).toMatchObject({ status: 'planned', partsCount: 0, description: null })
  } finally {
    await other.cleanup()
    await club.cleanup()
  }
})

const SESSION_NOTICE = 'activities.occurrence_cancelled'

test('TEST-T01 cancelling a club event with two parts tells each family of a part group once per part', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t01-notices')
  try {
    const admin = club.adminToken
    // Anna guards Hania (14, no account; Żaki and the pool group) and Kuba (16, own account; Żaki); Piotr guards
    // Stanisław (Żaki); Marek coaches Żaki, Irena the pool group.
    const family = await familyFor(request, club)
    const { hall } = await examplePlaces(request, club)
    const eventId = await clubEventId(request, admin, { name: 'Dzień sportu', sectionId: null, placeId: hall })
    const day = addDays(calendarDate(), 3)
    const zakiPart = await partIds(request, admin, eventId, {
      title: 'Turniej Żaków',
      groupId: family.zaki,
      coachPersonId: family.coach.personId,
      startsAt: zoneInstant(day, '09:00'),
      endsAt: zoneInstant(day, '12:00'),
    })
    const poolPart = await partIds(request, admin, eventId, {
      title: 'Zawody pływackie',
      groupId: family.poolGroup,
      startsAt: zoneInstant(day, '13:00'),
      endsAt: zoneInstant(day, '15:00'),
    })
    const zakiSession = String(zakiPart.occurrenceId)
    const poolSession = String(poolPart.occurrenceId)
    expect(zakiPart.occurrenceId).toBeTruthy()
    expect(poolPart.occurrenceId).toBeTruthy()

    const current = await readClubEvent(request, admin, eventId)
    const cancelled = await cancelClubEvent(request, admin, eventId, 'Burza w prognozie', current.body?.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    // Żaki: Hania, Kuba, Stanisław, Anna, Piotr, Marek (6); the pool group: Hania, Anna, Irena (3).
    expect(cancelled.body).toMatchObject({ status: 'cancelled', cancelledSessions: 2, notified: 9 })

    // The session notices each recipient holds, counted per part session.
    const noticesPerSession = async (token: string) => {
      const counts: Record<string, number> = {}
      for (const notice of await readNotifications(request, token, `&type=${SESSION_NOTICE}`)) {
        const key =
          notice.sourceEntityId === zakiSession ? 'zaki' : notice.sourceEntityId === poolSession ? 'pool' : 'other'
        counts[key] = (counts[key] ?? 0) + 1
      }
      return counts
    }
    const expected: Array<[string, string, Record<string, number>]> = [
      // Anna's family is in both parts: one notice per part, not one per ward (Hania and Kuba are both in Żaki).
      ['Anna (guardian in both parts)', family.guardian.token, { zaki: 1, pool: 1 }],
      ['Kuba (own account, Żaki)', family.elder.token, { zaki: 1 }],
      ['Piotr (guardian, Żaki only)', family.other.guardian.token, { zaki: 1 }],
      ['Marek (coach of Żaki)', family.coach.token, { zaki: 1 }],
      ['Irena (coach of the pool group)', family.instructor.token, { pool: 1 }],
    ]
    for (const [who, token, counts] of expected) {
      await expect
        .poll(() => noticesPerSession(token), { timeout: 60_000, message: `${who} has one notice per part` })
        .toEqual(counts)
    }
    // The administrator who cancelled is not told.
    expect(await noticesPerSession(admin)).toEqual({})
  } finally {
    await club.cleanup()
  }
})
