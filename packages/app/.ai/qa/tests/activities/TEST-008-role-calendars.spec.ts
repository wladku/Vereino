import { expect, test } from '@playwright/test'
import { addDays } from '../_fixtures/activities'
import {
  POOL_ADDRESS,
  PITCH_ADDRESS,
  PITCH_GEO,
  bothSeries,
  calendarItems,
  entryOf,
  familyFor,
  readCalendar,
  readCalendarItem,
  upcoming,
} from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'

// Issue #32, club spec TEST-008 (REQ-003, REQ-004, REQ-006) and phase 2 step 4: the role calendars of
// `GET /api/activities/calendar`. A guardian whose 14-year-old is in the academy (`team` Żaki) and in the pool class
// (`class_group` in another section) and whose 16-year-old is in Żaki sees both sections' sessions in one calendar with
// the place (address, coordinates) and the start and end instants; the 16-year-old's own calendar holds only the
// team; each coordinator sees only their section; the Żaki coach sees Żaki with the per-session summary; another
// family's child is out of scope (403); a range beyond 62 days is refused (400); a session outside the caller's groups
// does not exist for them (404).
test.describe.configure({ timeout: 300_000 })

test('TEST-008 one guardian calendar across both sections with places and times; self, coach and coordinator views stay in their scope; 403 for another family, 400 beyond 62 days, 404 outside own groups', async ({
  request,
}) => {
  const club = await createClub(request, 'test-008')
  try {
    const family = await familyFor(request, club)
    const { training, poolClass } = await bothSeries(request, club, family)
    const today = calendarDate()
    const to = addDays(today, 13)
    const window = `from=${today}&to=${to}`
    const inWindow = (sessions: { id: string; occurrenceDate: string | null }[]) =>
      sessions.filter((session) => String(session.occurrenceDate) <= to).map((session) => session.id)
    const zakiIds = inWindow(training.sessions).sort()
    const poolIds = inWindow(poolClass.sessions).sort()
    expect(zakiIds.length, 'two weeks hold at least one Tuesday').toBeGreaterThanOrEqual(1)
    expect(poolIds.length, 'two weeks hold at least one Thursday').toBeGreaterThanOrEqual(1)
    const wardIds = [family.younger.personId, family.elder.personId].sort()

    // The guardian: both sections in one calendar, with the place and the instants, the right ward per session.
    const guardianView = await readCalendar(request, family.guardian.token, `${window}&as=guardian`)
    expect(guardianView.status, JSON.stringify(guardianView.body)).toBe(200)
    expect(guardianView.body).toMatchObject({ timeZone: 'Europe/Warsaw', from: today, to })
    const guardianItems = guardianView.body?.items ?? []
    expect(guardianItems.map((item) => item.occurrence.id).sort()).toEqual([...zakiIds, ...poolIds].sort())
    expect(new Set(guardianItems.map((item) => item.occurrence.groupName))).toEqual(
      new Set(['Żaki', 'Basen — początkujący']),
    )
    expect(new Set(guardianItems.map((item) => item.occurrence.sectionName))).toEqual(
      new Set(['Akademia piłkarska', 'Basen']),
    )
    for (const item of guardianItems) {
      expect(Date.parse(item.occurrence.startAt), JSON.stringify(item.occurrence)).not.toBeNaN()
      expect(Date.parse(item.occurrence.endAt)).toBeGreaterThan(Date.parse(item.occurrence.startAt))
      expect(item.declarationKind).toBe('absence_only')
      expect(item.summary, 'members get no staff summary').toBeUndefined()
      expect(item, 'show_called_up_children = none hides other children').not.toHaveProperty('calledUpChildren')
      if (item.occurrence.groupId === family.zaki) {
        expect(item.occurrence).toMatchObject({
          activityName: 'Trening Żaków',
          sectionId: family.academy,
          placeId: family.pitch,
          placeName: 'Boisko A',
          placeAddress: PITCH_ADDRESS,
          placeGeoLat: PITCH_GEO.lat,
          placeGeoLng: PITCH_GEO.lng,
        })
        expect(item.persons.map((person) => person.personId).sort()).toEqual(wardIds)
      } else {
        expect(item.occurrence).toMatchObject({
          groupId: family.poolGroup,
          sectionId: family.pool,
          placeId: family.poolPlace,
          placeAddress: POOL_ADDRESS,
        })
        expect(item.persons.map((person) => person.personId)).toEqual([family.younger.personId])
      }
      for (const person of item.persons) {
        expect(person.declaration).toBeNull()
        expect(person.firstName.length).toBeGreaterThan(0)
        expect(person.lastName.length).toBeGreaterThan(0)
      }
    }
    // A future session is still open for declarations; the guardian is never held back by a minor policy.
    const openEntry = entryOf(guardianItems, upcoming(training.sessions)[0]?.id ?? '')
    expect(openEntry.declarationsOpen).toBe(true)
    expect(openEntry.persons.every((person) => person.canDeclare && !person.guardianOnly)).toBe(true)

    // One ward only: `personId` narrows the guardian's calendar to the 16-year-old's Żaki sessions.
    const elderOnly = await calendarItems(
      request,
      family.guardian.token,
      `${window}&as=guardian&personId=${family.elder.personId}`,
    )
    expect(elderOnly.map((item) => item.occurrence.id).sort()).toEqual(zakiIds)
    expect(elderOnly.every((item) => item.persons.map((p) => p.personId).join() === family.elder.personId)).toBe(true)

    // The 16-year-old's own calendar: the team only.
    const selfItems = await calendarItems(request, family.elder.token, `${window}&as=self`)
    expect(selfItems.map((item) => item.occurrence.id).sort()).toEqual(zakiIds)
    for (const item of selfItems) {
      expect(item.persons.map((person) => person.personId)).toEqual([family.elder.personId])
      expect(item.persons[0]).toMatchObject({ firstName: family.elder.firstName, lastName: family.elder.lastName })
    }

    // The coordinators: each one their own section, with the staff summary and no persons.
    const academyItems = await calendarItems(request, family.academyCoordinator.token, `${window}&as=coordinator`)
    expect(academyItems.map((item) => item.occurrence.id).sort()).toEqual(zakiIds)
    for (const item of academyItems) {
      expect(item.occurrence.sectionId).toBe(family.academy)
      expect(item.persons).toEqual([])
      // Żaki: the 14-year-old, the 16-year-old and the other family's child; nobody declared yet.
      expect(item.summary).toEqual({
        kind: 'absence_only',
        expected: 3,
        absent: 0,
        confirmed: 0,
        declined: 0,
        unanswered: 0,
      })
    }
    const poolItems = await calendarItems(request, family.poolCoordinator.token, `${window}&as=coordinator`)
    expect(poolItems.map((item) => item.occurrence.id).sort()).toEqual(poolIds)
    expect(poolItems.every((item) => item.occurrence.sectionId === family.pool)).toBe(true)
    expect(poolItems[0]?.summary).toEqual({
      kind: 'absence_only',
      expected: 1,
      absent: 0,
      confirmed: 0,
      declined: 0,
      unanswered: 0,
    })
    // `sectionId` outside the coordinator's grant never yields another section's sessions.
    const crossSection = await calendarItems(
      request,
      family.academyCoordinator.token,
      `${window}&as=coordinator&sectionId=${family.pool}`,
    )
    expect(crossSection.filter((item) => item.occurrence.sectionId !== family.academy)).toEqual([])

    // The coach of Żaki: Żaki sessions with the summary; the pool instructor: the pool class only.
    const coachItems = await calendarItems(request, family.coach.token, `${window}&as=coach`)
    expect(coachItems.map((item) => item.occurrence.id).sort()).toEqual(zakiIds)
    expect(coachItems.every((item) => item.summary?.kind === 'absence_only' && item.summary.expected === 3)).toBe(true)
    const instructorItems = await calendarItems(request, family.instructor.token, `${window}&as=coach`)
    expect(instructorItems.map((item) => item.occurrence.id).sort()).toEqual(poolIds)

    // Another family's child is out of the guardian's scope; a member cannot read as staff.
    const foreignWard = await readCalendar(
      request,
      family.guardian.token,
      `${window}&as=guardian&personId=${family.other.child.personId}`,
    )
    expect(foreignWard.status, JSON.stringify(foreignWard.body)).toBe(403)
    expect(foreignWard.body?.code).toBe('scope_denied')
    const memberAsCoordinator = await readCalendar(request, family.guardian.token, `${window}&as=coordinator`)
    expect(memberAsCoordinator.status, JSON.stringify(memberAsCoordinator.body)).toBe(403)
    expect(memberAsCoordinator.body?.code).toBe('scope_denied')

    // The other family's guardian sees only their own child's sessions (Żaki), never our wards.
    const otherItems = await calendarItems(request, family.other.guardian.token, `${window}&as=guardian`)
    expect(otherItems.map((item) => item.occurrence.id).sort()).toEqual(zakiIds)
    for (const item of otherItems) {
      expect(item.persons.map((person) => person.personId)).toEqual([family.other.child.personId])
    }

    // 62 days are served, 63 are not.
    const longest = await readCalendar(
      request,
      family.guardian.token,
      `from=${today}&to=${addDays(today, 61)}&as=guardian`,
    )
    expect(longest.status, JSON.stringify(longest.body)).toBe(200)
    const tooLong = await readCalendar(
      request,
      family.guardian.token,
      `from=${today}&to=${addDays(today, 62)}&as=guardian`,
    )
    expect(tooLong.status, JSON.stringify(tooLong.body)).toBe(400)
    expect(tooLong.body?.code).toBe('calendar_range_invalid')
    const inverted = await readCalendar(request, family.guardian.token, `from=${to}&to=${today}&as=guardian`)
    expect(inverted.status).toBe(400)
    expect(inverted.body?.code).toBe('calendar_range_invalid')

    // One session: the pool class exists for the guardian (through the 14-year-old), not for the 16-year-old.
    const poolSessionId = poolIds[0]
    const forGuardian = await readCalendarItem(request, family.guardian.token, poolSessionId, 'as=guardian')
    expect(forGuardian.status, JSON.stringify(forGuardian.body)).toBe(200)
    expect(forGuardian.body?.occurrence).toMatchObject({
      id: poolSessionId,
      groupName: 'Basen — początkujący',
      placeAddress: POOL_ADDRESS,
    })
    expect(forGuardian.body?.persons.map((person) => person.personId)).toEqual([family.younger.personId])
    expect(forGuardian.body?.timeZone).toBe('Europe/Warsaw')
    const forElder = await readCalendarItem(request, family.elder.token, poolSessionId, 'as=self')
    expect(forElder.status, JSON.stringify(forElder.body)).toBe(404)
    const forOtherFamily = await readCalendarItem(request, family.other.guardian.token, zakiIds[0], 'as=guardian')
    expect(forOtherFamily.status).toBe(200)
    expect(forOtherFamily.body?.persons.map((person) => person.personId)).toEqual([family.other.child.personId])
  } finally {
    await club.cleanup()
  }
})
