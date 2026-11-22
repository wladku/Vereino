import { expect, test } from '@playwright/test'
import {
  addDays,
  createActivity,
  getActivity,
  getOccurrence,
  juneThirtiethNextYear,
  listOccurrences,
  runGenerator,
  scheduleFor,
  updateActivity,
  wallTime,
  weekdayOf,
  weekdaysBetween,
  type OccurrenceItem,
  type WeekdayCode,
} from '../_fixtures/activities'
import { addParticipants, readAttendanceList, rowOf, saveAttendanceList } from '../_fixtures/attendance'
import { calendarDate, createClub } from '../_fixtures/club'
import { create as createStructure } from '../_fixtures/club-structure'

// TEST-084 (club spec amendment B, research TEST-C16; REQ-005): a weekly Tuesday 17:00 series in `Europe/Warsaw` keeps
// its wall time across both daylight-saving changes — the Tuesday before the spring change starts at 16:00Z, the one
// after at 15:00Z; before the autumn change at 15:00Z, after it at 16:00Z — and a session with checked-off attendance
// survives a change of the series rule and a later generator run unchanged (same id, times and marks).
//
// The spec row names the 2026 changes (29 March, 25 October: 2026-03-24T16:00Z, 03-31T15:00Z, 10-20T15:00Z,
// 10-27T16:00Z). Those days are in the past now and the generator only creates sessions from its `today` on, never the
// past, so the test replays the generator (`--today`) before the next spring and the next autumn change and checks the
// same four instants one or two years later; `dstInstants` reproduces the spec's 2026 values as its own check. The
// expected instants are plain UTC hours (an oracle independent of the fixtures' zone helpers).
test.describe.configure({ timeout: 300_000 })

/** The last Sunday of a month (1-based) — the EU daylight-saving change days are the last Sundays of March and October. */
function lastSunday(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0))
  last.setUTCDate(last.getUTCDate() - last.getUTCDay())
  return last.toISOString().slice(0, 10)
}

type DstChange = { kind: 'spring' | 'autumn'; day: string }

/** The next spring and the next autumn change strictly after `after`, in calendar order. */
function nextDstChanges(after: string): DstChange[] {
  const year = Number(after.slice(0, 4))
  const changes: DstChange[] = []
  for (const y of [year, year + 1, year + 2]) {
    changes.push({ kind: 'spring', day: lastSunday(y, 3) }, { kind: 'autumn', day: lastSunday(y, 10) })
  }
  const future = changes.filter((change) => change.day > after)
  const spring = future.find((change) => change.kind === 'spring')
  const autumn = future.find((change) => change.kind === 'autumn')
  if (!spring || !autumn) throw new Error('[internal] no daylight-saving change ahead')
  return [spring, autumn].sort((a, b) => a.day.localeCompare(b.day))
}

/**
 * The Tuesdays before and after a change (5 days before, 2 days after the Sunday) with the UTC instant of 17:00 Warsaw
 * time on each: UTC+1 in winter, UTC+2 in summer.
 */
function dstInstants(change: DstChange): { date: string; startAt: string }[] {
  const before = addDays(change.day, -5)
  const after = addDays(change.day, 2)
  const [beforeHour, afterHour] = change.kind === 'spring' ? ['16', '15'] : ['15', '16']
  return [
    { date: before, startAt: `${before}T${beforeHour}:00:00.000Z` },
    { date: after, startAt: `${after}T${afterHour}:00:00.000Z` },
  ]
}

test('TEST-084 a weekly Tuesday 17:00 series keeps 17:00 Warsaw time across the spring and the autumn change', async ({
  request,
}) => {
  // The oracle reproduces the spec's 2026 instants.
  expect(dstInstants({ kind: 'spring', day: lastSunday(2026, 3) })).toEqual([
    { date: '2026-03-24', startAt: '2026-03-24T16:00:00.000Z' },
    { date: '2026-03-31', startAt: '2026-03-31T15:00:00.000Z' },
  ])
  expect(dstInstants({ kind: 'autumn', day: lastSunday(2026, 10) })).toEqual([
    { date: '2026-10-20', startAt: '2026-10-20T15:00:00.000Z' },
    { date: '2026-10-27', startAt: '2026-10-27T16:00:00.000Z' },
  ])

  const club = await createClub(request, 'test-084-dst')
  try {
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    // Both changes lie ahead and at least a week after today, so the Tuesday before each is not in the past.
    const changes = nextDstChanges(addDays(today, 7))
    const until = addDays(changes[1].day, 30).replaceAll('-', '')
    const { id: activityId } = await createActivity(request, coordinator, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })

    // The daily job, replayed as of a week before each Tuesday before a change: its 16-week window covers both
    // Tuesdays around that change. A change inside the first window was already generated when the series was saved.
    for (const change of changes) {
      const runToday = addDays(change.day, -12)
      if (runToday <= today) continue
      const run = runGenerator(club, runToday)
      expect(run).toMatchObject({ today: runToday, failed: 0, flagged: 0 })
    }

    const sessions = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    const byDate = new Map(sessions.map((session) => [String(session.occurrenceDate), session]))
    for (const change of changes) {
      const [before, after] = dstInstants(change)
      const first = byDate.get(before.date)
      const second = byDate.get(after.date)
      expect(first, `${change.kind} ${before.date}`).toBeDefined()
      expect(second, `${change.kind} ${after.date}`).toBeDefined()
      expect(first?.startAt, `${change.kind} ${before.date}`).toBe(before.startAt)
      expect(second?.startAt, `${change.kind} ${after.date}`).toBe(after.startAt)
      // The week between them is one hour shorter in spring and one hour longer in autumn.
      const hours = (Date.parse(after.startAt) - Date.parse(before.startAt)) / 3_600_000
      expect(hours).toBe(change.kind === 'spring' ? 167 : 169)
      for (const session of [first, second]) {
        expect(wallTime(String(session?.endAt))).toBe('18:30')
        expect(session).toMatchObject({ status: 'planned', isDetached: false, needsReschedule: false })
      }
    }
    // Every generated session is a Tuesday at 17:00 Warsaw time, one per slot.
    for (const session of sessions) {
      expect(weekdayOf(String(session.occurrenceDate))).toBe('TU')
      expect(wallTime(String(session.startAt))).toBe('17:00')
    }
    expect(new Set(sessions.map((session) => session.occurrenceDate)).size).toBe(sessions.length)
  } finally {
    await club.cleanup()
  }
})

/** The fields a session keeps when the series leaves it alone. */
function snapshot(session: OccurrenceItem | null | undefined) {
  return {
    id: session?.id,
    occurrenceDate: session?.occurrenceDate,
    startAt: session?.startAt,
    endAt: session?.endAt,
    status: session?.status,
    isDetached: session?.isDetached,
    updatedAt: session?.updatedAt,
  }
}

test('TEST-084 a session with checked-off attendance survives a change of the series time and day and a later generator run; an unmarked session on the same day moves', async ({
  request,
}) => {
  const club = await createClub(request, 'test-084-pinned')
  try {
    const { pitch, zaki, orliki, coordinator } = await scheduleFor(request, club)
    const hall = await createStructure(request, club.adminToken, 'places', {
      name: 'Hala',
      kind: 'hall',
      capacityGroups: 1,
    })
    const [first, second] = await addParticipants(request, club, zaki, 2)
    const today = calendarDate()
    const weekday = weekdayOf(today)
    const otherDay: WeekdayCode = weekday === 'WE' ? 'TH' : 'WE'
    const june = juneThirtiethNextYear(today)
    // Today's session starts at midnight, so it has started and the check-off is open, whatever the hour of the run.
    const series = (groupId: string, placeId: string, name: string) => ({
      groupId,
      name,
      type: 'training',
      placeId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${weekday};UNTIL=${june.until}`,
      startsOn: today,
      startTime: '00:00',
      endTime: '00:45',
    })
    const { id: activityId } = await createActivity(request, coordinator, series(zaki, pitch, 'Trening Żaków'))
    // The control: the same rule for Orliki in the hall, nobody checked off.
    const { id: controlId } = await createActivity(request, coordinator, series(orliki, hall, 'Trening Orlików'))

    const sessions = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    const attended = sessions.find((session) => session.occurrenceDate === today)
    if (!attended) throw new Error(`[test] the series has no session today: ${JSON.stringify(sessions)}`)
    const controlToday = (await listOccurrences(request, coordinator, `&activityId=${controlId}`)).items.find(
      (session) => session.occurrenceDate === today,
    )
    if (!controlToday) throw new Error('[test] the control series has no session today')

    // The coordinator checks off today's session (it stays planned: the list is saved, not closed).
    const saved = await saveAttendanceList(
      request,
      coordinator,
      attended.id,
      {
        entries: [
          { personId: first, actual: 'present' },
          { personId: second, actual: 'absent' },
        ],
      },
      attended.updatedAt,
    )
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    const before = await getOccurrence(request, coordinator, attended.id)
    expect(before.status).toBe(200)
    expect(before.body).toMatchObject({ status: 'planned', isDetached: false, startAt: attended.startAt })

    const expectSurvived = async (step: string) => {
      const now = await getOccurrence(request, coordinator, attended.id)
      expect(now.status, step).toBe(200)
      expect(snapshot(now.body), step).toEqual(snapshot(before.body))
      const list = await readAttendanceList(request, coordinator, attended.id)
      expect(list.status, step).toBe(200)
      expect(list.body && rowOf(list.body, first).actual, step).toBe('present')
      expect(list.body && rowOf(list.body, second).actual, step).toBe('absent')
      // Only the attended session holds today's slot.
      const slot = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items.filter(
        (session) => session.occurrenceDate === today,
      )
      expect(
        slot.map((session) => session.id),
        step,
      ).toEqual([attended.id])
    }

    // 1. The series time moves to 01:00–01:45: every other session moves, today's attended one stays at 00:00.
    const lock = (await getActivity(request, coordinator, activityId)).body?.updatedAt
    const retimed = await updateActivity(
      request,
      coordinator,
      { id: activityId, startTime: '01:00', endTime: '01:45' },
      lock,
    )
    expect(retimed.status, JSON.stringify(retimed.body)).toBe(200)
    expect(retimed.body?.sessions).toEqual({ created: 0, updated: sessions.length - 1, removed: 0 })
    await expectSurvived('after the time change')
    for (const session of (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items) {
      if (session.id === attended.id) continue
      expect(wallTime(String(session.startAt)), String(session.occurrenceDate)).toBe('01:00')
    }
    // The control's session today, without attendance, moves with its series.
    const controlLock = (await getActivity(request, coordinator, controlId)).body?.updatedAt
    const controlRetimed = await updateActivity(
      request,
      coordinator,
      { id: controlId, startTime: '01:00', endTime: '01:45' },
      controlLock,
    )
    expect(controlRetimed.status, JSON.stringify(controlRetimed.body)).toBe(200)
    const controlAfter = await getOccurrence(request, coordinator, controlToday.id)
    expect(wallTime(String(controlAfter.body?.startAt))).toBe('01:00')

    // 2. The series day changes to another weekday: the other sessions on today's weekday go, today's attended one stays.
    const dayLock = (await getActivity(request, coordinator, activityId)).body?.updatedAt
    const moved = await updateActivity(
      request,
      coordinator,
      { id: activityId, recurrenceRule: `FREQ=WEEKLY;BYDAY=${otherDay};UNTIL=${june.until}` },
      dayLock,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.sessions?.removed).toBe(sessions.length - 1)
    await expectSurvived('after the day change')
    const afterDay = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    for (const session of afterDay) {
      if (session.id === attended.id) continue
      expect(weekdayOf(String(session.occurrenceDate))).toBe(otherDay)
      expect(wallTime(String(session.startAt))).toBe('01:00')
    }
    expect(afterDay.map((session) => session.occurrenceDate)).toEqual([
      today,
      ...weekdaysBetween(addDays(today, 1), addDays(today, 16 * 7), otherDay),
    ])

    // 3. The daily job a week later regenerates the window: today's attended session is still there, unchanged.
    const run = runGenerator(club, addDays(today, 7))
    expect(run).toMatchObject({ failed: 0, flagged: 0 })
    await expectSurvived('after the generator run')
  } finally {
    await club.cleanup()
  }
})
