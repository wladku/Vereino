import { expect, test } from '@playwright/test'
import { addDays, getOccurrence, zoneInstant } from '../_fixtures/activities'
import {
  familyFor,
  readAttendanceList,
  readCalendarItem,
  rowOf,
  saveAttendanceList,
  startNow,
  type ActualValue,
} from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'
import { clubEventId, examplePlaces, partIds } from '../_fixtures/club-events'

// Club events spec AC-T04, the coach's half (REQ-T03; #606): the coach of a club event part runs the attendance list
// and records the score on his part session, and is offered neither Edit nor Cancel. The coordinator of the academy
// adds a match part of the Żaki at the external hall with the group's coach Marek; once the session started, Marek
// checks off the roster and records 2:1 with a note. Both persist (the attendance list and the session record read them
// back) and his session entry keeps `mayEdit: false` and `mayCancel: false` while `mayScore` turns true.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Score = { home: number; away: number; note: string | null } | null
type CoachEntry = {
  mayEdit?: boolean
  mayCancel?: boolean
  mayScore?: boolean
  occurrence?: { id?: string; updatedAt?: string; score?: Score; clubEvent?: { name?: string } | null }
}

test('ISSUE-606 the coach of a club event part saves its attendance and records its score, without Edit or Cancel', async ({
  request,
}) => {
  const club = await createClub(request, 'issue-606')
  try {
    const family = await familyFor(request, club)
    const coach = family.coach
    const { hall } = await examplePlaces(request, club)
    const opponent = await call<{ id?: string }>(request, 'POST', '/api/groups/external-teams', club.adminToken, {
      data: { name: 'Wisła Liszki', clubName: 'Wisła Liszki' },
    })
    expect(opponent.status, JSON.stringify(opponent.body)).toBe(201)
    const eventId = await clubEventId(request, family.academyCoordinator.token, {
      name: 'GWIAZDA CUP 2026',
      sectionId: family.academy,
      placeId: hall,
    })
    const day = addDays(calendarDate(), 1)
    const part = await partIds(request, family.academyCoordinator.token, eventId, {
      title: 'Mecz Żaków',
      type: 'match',
      groupId: family.zaki,
      coachPersonId: coach.personId,
      startsAt: zoneInstant(day, '10:00'),
      endsAt: zoneInstant(day, '11:30'),
      visitingTeamIds: [String(opponent.body?.id)],
    })
    const session = String(part.occurrenceId)

    const coachEntry = async () => {
      const read = await readCalendarItem(request, coach.token, session, 'as=coach')
      expect(read.status, JSON.stringify(read.body)).toBe(200)
      return read.body as CoachEntry
    }

    // --- Before the start: his part, without Edit and Cancel, and no score yet ---
    const before = await coachEntry()
    expect(before.occurrence?.clubEvent?.name).toBe('GWIAZDA CUP 2026')
    expect(before).toMatchObject({ mayEdit: false, mayCancel: false, mayScore: false })

    // --- The part session starts; the coach checks off the roster ---
    const startedVersion = await startNow(request, club, session)
    const open = await readAttendanceList(request, coach.token, session)
    expect(open.status, JSON.stringify(open.body)).toBe(200)
    expect(open.body?.checkOff).toBe('open')
    const marks = new Map<string, ActualValue>([
      [family.younger.personId, 'present'],
      [family.elder.personId, 'late'],
      [family.other.child.personId, 'absent'],
    ])
    const saved = await saveAttendanceList(
      request,
      coach.token,
      session,
      { entries: [...marks].map(([personId, actual]) => ({ personId, actual })) },
      startedVersion,
    )
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body?.actingRole).toBe('coach')

    // The marks persist: a fresh read of the list returns them, marked by the coach.
    const reread = await readAttendanceList(request, coach.token, session)
    expect(reread.status, JSON.stringify(reread.body)).toBe(200)
    const list = reread.body
    if (!list) throw new Error('[test] empty attendance list after the save')
    for (const [personId, actual] of marks) {
      expect(rowOf(list, personId)).toMatchObject({
        actual,
        markedByPersonId: coach.personId,
        markedAsRole: 'coach',
      })
    }

    // --- The coach records 2:1 with a note on his part ---
    const started = await coachEntry()
    expect(started).toMatchObject({ mayEdit: false, mayCancel: false, mayScore: true })
    const scored = await call<{ score?: Score; actingRole?: string }>(
      request,
      'PUT',
      `/api/activities/occurrences/${session}/score`,
      coach.token,
      {
        data: { scoreHome: 2, scoreAway: 1, note: 'Finał turnieju' },
        headers: { [OPTIMISTIC_LOCK_HEADER]: String(started.occurrence?.updatedAt) },
      },
    )
    expect(scored.status, JSON.stringify(scored.body)).toBe(200)
    expect(scored.body?.score).toEqual({ home: 2, away: 1, note: 'Finał turnieju' })

    // The score persists on the coach's session read and on the session record; still no Edit or Cancel.
    const after = await coachEntry()
    expect(after.occurrence?.score).toEqual({ home: 2, away: 1, note: 'Finał turnieju' })
    expect(after).toMatchObject({ mayEdit: false, mayCancel: false })
    const record = await getOccurrence(request, club.adminToken, session)
    expect(record.status, JSON.stringify(record.body)).toBe(200)
    expect((record.body as { score?: Score } | null)?.score).toEqual({ home: 2, away: 1, note: 'Finał turnieju' })
  } finally {
    await club.cleanup()
  }
})
