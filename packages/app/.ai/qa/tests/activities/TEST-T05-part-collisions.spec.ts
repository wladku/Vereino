import { expect, test } from '@playwright/test'
import { addDays, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarDate, call, createClub } from '../_fixtures/club'
import { addPart, clubEventId, examplePlaces, partIds } from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { ORLIK_HOURS, setOpeningHours } from '../_fixtures/facilities'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'

// Club events spec TEST-T05 (REQ-T07, DD-T07, Q-T11; #376): a part at a club place goes through the full check — two
// overlapping parts at a place with capacity 1 answer 409 `occurrence_place_conflict`, a part outside the place's
// opening hours 409 `event_place_closed`, and the place's facility calendar shows the part. At the external hall two
// overlapping parts are both saved (only the coach is checked), while one coach in two overlapping parts answers 409
// `occurrence_coach_conflict` there too.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

test('TEST-T05 parts collide at a club place by place, hours and coach; at an external place only by coach', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t05')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const groups: string[] = []
    for (const name of ['Orlik młodszy', 'Żak młodszy', 'Trampkarz', 'Skrzat']) {
      groups.push(await createGroup(request, admin, { sectionId: academy, name, kind: 'team' }))
    }
    const [g1, g2, g3, g4] = groups as [string, string, string, string]
    const { hall, salka } = await examplePlaces(request, club)
    await setOpeningHours(request, admin, salka, ORLIK_HOURS)
    const coach = await signedInStaff(request, club, { firstName: 'Piotr', lastName: 'Trener', role: 'coach' })
    for (const groupId of [g3, g4]) {
      await addMembership(request, admin, { groupId, personId: coach.personId, role: 'coach', validFrom: '2020-01-01' })
    }
    const tuesday = nextWeekday(addDays(calendarDate(), 7), 'TU')
    const at = (from: string, to: string) => ({
      startsAt: zoneInstant(tuesday, from),
      endsAt: zoneInstant(tuesday, to),
    })

    // --- At the club place: place, capacity and opening hours ---
    const atClub = await clubEventId(request, admin, { name: 'Turniej w salce', sectionId: academy, placeId: salka })
    const first = await partIds(request, admin, atClub, {
      title: 'Część pierwsza',
      groupId: g1,
      ...at('10:00', '12:00'),
    })
    const overlap = await addPart(request, admin, atClub, {
      title: 'Część druga',
      groupId: g2,
      ...at('11:00', '13:00'),
    })
    expect(overlap.status, JSON.stringify(overlap.body)).toBe(409)
    expect(overlap.body?.code).toBe('occurrence_place_conflict')
    expect(overlap.body?.conflicts?.at(0)?.sessions.map((session) => session.id)).toEqual([first.occurrenceId])
    const early = await addPart(request, admin, atClub, {
      title: 'Część poranna',
      groupId: g2,
      ...at('07:00', '07:45'),
    })
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('event_place_closed')
    const range = `from=${encodeURIComponent(zoneInstant(tuesday, '00:00'))}&to=${encodeURIComponent(zoneInstant(addDays(tuesday, 1), '00:00'))}`
    const facility = await call(request, 'GET', `/api/facilities/calendar?${range}&placeId=${salka}`, admin)
    expect(facility.status, JSON.stringify(facility.body)).toBe(200)
    expect(JSON.stringify(facility.body)).toContain(String(first.occurrenceId))

    // --- At the external hall: parallel parts are saved; only the coach collides ---
    const atHall = await clubEventId(request, admin, { name: 'Turniej w hali', sectionId: academy, placeId: hall })
    await partIds(request, admin, atHall, { title: 'Hala – Orlik', groupId: g1, ...at('15:00', '17:00') })
    await partIds(request, admin, atHall, { title: 'Hala – Żak', groupId: g2, ...at('15:00', '17:00') })
    // Outside a club place's hours means nothing at the hall: an external place has no opening hours check.
    await partIds(request, admin, atHall, { title: 'Hala – rano', groupId: g1, ...at('06:00', '07:00') })
    await partIds(request, admin, atHall, {
      title: 'Hala – Trampkarz',
      groupId: g3,
      coachPersonId: coach.personId,
      ...at('18:00', '20:00'),
    })
    const coachTwice = await addPart(request, admin, atHall, {
      title: 'Hala – Skrzat',
      groupId: g4,
      coachPersonId: coach.personId,
      ...at('19:00', '21:00'),
    })
    expect(coachTwice.status, JSON.stringify(coachTwice.body)).toBe(409)
    expect(coachTwice.body?.code).toBe('occurrence_coach_conflict')
  } finally {
    await club.cleanup()
  }
})
