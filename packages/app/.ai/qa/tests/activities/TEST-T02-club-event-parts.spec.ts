import { expect, test } from '@playwright/test'
import { addDays, getActivity, getOccurrence, nextWeekday, zoneInstant } from '../_fixtures/activities'
import { calendarItems, declare, memberAccount, readCalendarItem } from '../_fixtures/attendance'
import { birthDateTurning, calendarDate, call, createClub, createPerson } from '../_fixtures/club'
import { addPart, clubEventId, examplePlaces, partIds, readClubEvent } from '../_fixtures/club-events'
import { create as createStructure } from '../_fixtures/club-structure'
import { addMembership, createGroup, signedInStaff } from '../_fixtures/groups'
import { createGuardianship } from '../_fixtures/people'

// Club events spec TEST-T02 and the API half of TEST-T03 (REQ-T02, REQ-T03, REQ-T04, DD-T01…DD-T04; #376): Wojtek adds
// the nine parts of the "GWIAZDA CUP 2026" poster at the external hall — eight with the academy's groups, the seniors
// open. Each of the eight is a one-off activity with `clubEventId`, no rule, the title as its name, the visiting teams
// as its invited teams, not away, with one session at the hall; the open part keeps its own times and has no session.
// A group of another section answers 422 `club_event_part_outside_section`, a match for a class group 422
// `activity_type_requires_team`, the 41st part 422 `club_event_parts_limit`. Kasia, guardian of Jaś (Orlik młodszy),
// sees only the Orlik młodszy part in her calendar, named with the club event (`publicPath` null while not public),
// and declares for Jaś; Ola of another group sees none; a coach of a part's group reads it without Edit and Cancel.
test.describe.configure({ timeout: 600_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

const EVENT = 'GWIAZDA CUP 2026'

test('TEST-T02 the nine parts of the poster become eight group sessions at the hall and one open part; Kasia sees only her child’s part', async ({
  request,
}) => {
  const club = await createClub(request, 'test-t02')
  try {
    const admin = club.adminToken
    const academy = await createStructure(request, admin, 'sections', { name: 'Akademia piłkarska' })
    const fitness = await createStructure(request, admin, 'sections', { name: 'Ogólnorozwojowe' })
    const names = [
      'Orlik młodszy',
      'Żak młodszy',
      'Trampkarz',
      'Żak starszy',
      'Kids',
      'Skrzat',
      'Młodzik starszy',
      'Orlik starszy',
    ] as const
    const groups: Record<string, string> = {}
    for (const name of names)
      groups[name] = await createGroup(request, admin, { sectionId: academy, name, kind: 'team' })
    const gymnastics = await createGroup(request, admin, {
      sectionId: academy,
      name: 'Gimnastyka',
      kind: 'class_group',
    })
    const foreignGroup = await createGroup(request, admin, { sectionId: fitness, name: 'Fitness', kind: 'team' })
    const { hall } = await examplePlaces(request, club)
    const teams: string[] = []
    for (const [name, clubName] of [
      ['Wisła Liszki', 'Wisła Liszki'],
      ['Orzeł Kryspinów', 'Orzeł Kryspinów'],
      ['CIS Czernichów', 'CIS Czernichów'],
    ] as const) {
      const team = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', admin, {
        data: { name, clubName },
      })
      expect(team.status, JSON.stringify(team.body)).toBe(201)
      teams.push(String(team.body?.id))
    }
    const wojtek = await signedInStaff(request, club, {
      firstName: 'Wojtek',
      lastName: 'Malinowski',
      role: 'coordinator',
      sectionId: academy,
    })
    const marek = await signedInStaff(request, club, { firstName: 'Marek', lastName: 'Trener', role: 'coach' })
    const since = addDays(calendarDate(), -30)
    await addMembership(request, admin, {
      groupId: groups['Orlik młodszy'],
      personId: wojtek.personId,
      role: 'coach',
      validFrom: since,
    })
    await addMembership(request, admin, {
      groupId: groups['Trampkarz'],
      personId: marek.personId,
      role: 'coach',
      validFrom: since,
    })
    const jas = await createPerson(request, admin, {
      firstName: 'Jaś',
      lastName: 'Nowak',
      birthDate: birthDateTurning(9),
    })
    const kasiaPerson = await createPerson(request, admin, {
      firstName: 'Kasia',
      lastName: 'Nowak',
      birthDate: birthDateTurning(38),
    })
    await createGuardianship(request, admin, { guardianPersonId: kasiaPerson, wardPersonId: jas, validFrom: since })
    await addMembership(request, admin, {
      groupId: groups['Orlik młodszy'],
      personId: jas,
      role: 'participant',
      validFrom: since,
    })
    const olaPerson = await createPerson(request, admin, {
      firstName: 'Ola',
      lastName: 'Fit',
      birthDate: birthDateTurning(25),
    })
    await addMembership(request, admin, {
      groupId: foreignGroup,
      personId: olaPerson,
      role: 'participant',
      validFrom: since,
    })
    const kasia = await memberAccount(request, club, kasiaPerson, 'kasia-t02')
    const ola = await memberAccount(request, club, olaPerson, 'ola-t02')

    const eventId = await clubEventId(request, wojtek.token, {
      name: EVENT,
      sectionId: academy,
      placeId: hall,
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 48 * 60,
    })

    // --- The poster's days, moved into the future with their weekdays ---
    const sat1 = nextWeekday(addDays(calendarDate(), 7), 'SA')
    const sun1 = addDays(sat1, 1)
    const sat2 = addDays(sat1, 7)
    const sun2 = addDays(sat1, 8)
    const poster: Array<{ title: string; group: string | null; day: string; from: string; to: string; type?: string }> =
      [
        { title: 'Turniej Orlika Młodszego', group: 'Orlik młodszy', day: sat1, from: '09:00', to: '14:00' },
        { title: 'Turniej Żaka Młodszego', group: 'Żak młodszy', day: sat1, from: '14:30', to: '16:30' },
        { title: 'Turniej Trampkarza', group: 'Trampkarz', day: sun1, from: '09:00', to: '11:00' },
        { title: 'Turniej Żaka Starszego', group: 'Żak starszy', day: sun1, from: '11:30', to: '13:30' },
        { title: 'Mecz Kids', group: 'Kids', day: sun1, from: '14:00', to: '15:00', type: 'other' },
        { title: 'Turniej Skrzata', group: 'Skrzat', day: sun1, from: '15:00', to: '16:30' },
        { title: 'Turniej Drużyn – Seniorzy (16+)', group: null, day: sat2, from: '08:30', to: '14:00' },
        { title: 'Turniej Młodzika Starszego', group: 'Młodzik starszy', day: sun2, from: '09:00', to: '12:30' },
        { title: 'Turniej Orlika Starszego', group: 'Orlik starszy', day: sun2, from: '13:00', to: '15:00' },
      ]
    const created: Record<string, { id: string; activityId: string | null; occurrenceId: string | null }> = {}
    for (const entry of poster) {
      created[entry.title] = await partIds(request, wojtek.token, eventId, {
        title: entry.title,
        categoryLabel: entry.group ?? 'Seniorzy (16+)',
        type: entry.type ?? 'tournament',
        groupId: entry.group ? groups[entry.group] : null,
        startsAt: zoneInstant(entry.day, entry.from),
        endsAt: zoneInstant(entry.day, entry.to),
        ...(entry.group === 'Orlik młodszy' ? { coachPersonId: wojtek.personId, visitingTeamIds: teams } : {}),
      })
    }

    // --- Eight activities with clubEventId and one session each at the hall; the open part has none ---
    const orlik = created['Turniej Orlika Młodszego'] as { id: string; activityId: string; occurrenceId: string }
    const activity = await getActivity(request, admin, orlik.activityId)
    expect(activity.status, JSON.stringify(activity.body)).toBe(200)
    expect(activity.body).toMatchObject({
      clubEventId: eventId,
      recurrenceRule: null,
      name: 'Turniej Orlika Młodszego',
      type: 'tournament',
      invitedExternalTeamIds: teams,
      isAway: false,
      placeId: hall,
      gatheringMinutesBefore: 30,
      confirmByMinutesBefore: 48 * 60,
    })
    const session = await getOccurrence(request, admin, orlik.occurrenceId)
    expect(session.body).toMatchObject({
      placeId: hall,
      startAt: zoneInstant(sat1, '09:00'),
      coachPersonId: wojtek.personId,
      invitedTeamNames: ['Wisła Liszki', 'Orzeł Kryspinów', 'CIS Czernichów'],
      clubEvent: { id: eventId, name: EVENT, publicPath: null },
    })
    const seniors = created['Turniej Drużyn – Seniorzy (16+)']
    expect(seniors).toMatchObject({ activityId: null, occurrenceId: null })
    for (const entry of poster.filter((item) => item.group)) {
      expect(created[entry.title]?.occurrenceId, entry.title).toBeTruthy()
    }
    const record = await readClubEvent(request, wojtek.token, eventId)
    expect(record.status, JSON.stringify(record.body)).toBe(200)
    expect(record.body).toMatchObject({ partsCount: 9, dateFrom: sat1, dateTo: sun2 })
    const parts = record.body?.parts ?? []
    expect(parts.map((part) => part.title)).toEqual(
      [...poster]
        .sort((a, b) => zoneInstant(a.day, a.from).localeCompare(zoneInstant(b.day, b.from)))
        .map((p) => p.title),
    )
    expect(parts.find((part) => part.kind === 'open')).toMatchObject({
      title: 'Turniej Drużyn – Seniorzy (16+)',
      occurrenceId: null,
      startAt: zoneInstant(sat2, '08:30'),
      endAt: zoneInstant(sat2, '14:00'),
      status: 'planned',
    })
    expect(parts.find((part) => part.id === orlik.id)?.visitingTeams.map((team) => team.clubName)).toEqual([
      'Wisła Liszki',
      'Orzeł Kryspinów',
      'CIS Czernichów',
    ])

    // --- The refusals ---
    const outside = await addPart(request, wojtek.token, eventId, {
      title: 'Turniej Fitness',
      groupId: foreignGroup,
      startsAt: zoneInstant(sun2, '16:00'),
      endsAt: zoneInstant(sun2, '17:00'),
    })
    expect(outside.status, JSON.stringify(outside.body)).toBe(422)
    expect(outside.body?.code).toBe('club_event_part_outside_section')
    const classMatch = await addPart(request, wojtek.token, eventId, {
      title: 'Mecz gimnastyków',
      type: 'match',
      groupId: gymnastics,
      startsAt: zoneInstant(sun2, '16:00'),
      endsAt: zoneInstant(sun2, '17:00'),
    })
    expect(classMatch.status, JSON.stringify(classMatch.body)).toBe(422)
    expect(classMatch.body?.code).toBe('activity_type_requires_team')

    // --- TEST-T03 (API): Kasia sees only Jaś's part, named with the club event; Ola sees none ---
    const window = `from=${sat1}&to=${sun2}`
    const kasiaItems = await calendarItems(request, kasia.token, `as=guardian&${window}`)
    expect(kasiaItems.map((item) => item.occurrence.id)).toEqual([orlik.occurrenceId])
    expect(kasiaItems.at(0)?.occurrence).toMatchObject({ clubEvent: { id: eventId, name: EVENT, publicPath: null } })
    const declared = await declare(request, kasia.token, {
      occurrenceId: orlik.occurrenceId,
      personId: jas,
      declared: 'yes',
    })
    expect(declared.status, JSON.stringify(declared.body)).toBe(201)
    const olaItems = await calendarItems(request, ola.token, `as=self&${window}`)
    expect(olaItems).toEqual([])
    // A coach of a part's group runs it, but neither edits nor cancels it (DD-T06).
    const trampkarz = created['Turniej Trampkarza'] as { occurrenceId: string }
    const coachItem = await readCalendarItem(request, marek.token, trampkarz.occurrenceId, 'as=coach')
    expect(coachItem.status, JSON.stringify(coachItem.body)).toBe(200)
    expect(coachItem.body).toMatchObject({ mayEdit: false, mayCancel: false })
    // Wojtek coordinates the section: as the coach of his part he still may move and cancel it.
    const wojtekItem = await readCalendarItem(request, wojtek.token, orlik.occurrenceId, 'as=coach')
    expect(wojtekItem.body).toMatchObject({ mayEdit: true, mayCancel: true })

    // --- The 41st part: 422 club_event_parts_limit (31 more open parts, then one more) ---
    for (let index = 0; index < 31; index += 1) {
      await partIds(request, wojtek.token, eventId, {
        title: `Część dodatkowa ${String(index + 1)}`,
        groupId: null,
        startsAt: zoneInstant(sat2, '15:00'),
        endsAt: zoneInstant(sat2, '16:00'),
      })
    }
    const limit = await addPart(request, wojtek.token, eventId, {
      title: 'Część 41',
      groupId: null,
      startsAt: zoneInstant(sat2, '16:00'),
      endsAt: zoneInstant(sat2, '17:00'),
    })
    expect(limit.status, JSON.stringify(limit.body)).toBe(422)
    expect(limit.body?.code).toBe('club_event_parts_limit')
  } finally {
    await club.cleanup()
  }
})
