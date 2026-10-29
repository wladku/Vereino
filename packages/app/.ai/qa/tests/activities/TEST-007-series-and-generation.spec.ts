import { expect, test } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  getActivity,
  getOccurrence,
  juneThirtiethNextYear,
  listOccurrences,
  moveOccurrence,
  postActivity,
  preview,
  runGenerator,
  scheduleFor,
  updateActivity,
  wallTime,
  weekdaysBetween,
  zoneDate,
  zoneInstant,
  zoneOffsetMinutes,
} from '../_fixtures/activities'
import { calendarDate, createClub } from '../_fixtures/club'

// Issue #31 (E03-S02), club spec TEST-007 and phase 2 step 3: a weekly series generates its sessions from today (never
// the past) to 16 weeks ahead at the club's wall time; the preview lists the same sessions and their conflicts before
// anything is saved; a moved session is detached and a cancelled one pinned, so a later change of the series' times
// leaves both untouched; the daily generator extends the horizon without duplicating a slot.
test.describe.configure({ timeout: 300_000 })

const HORIZON_DAYS = 16 * 7

test('TEST-007 a coordinator previews and saves "Żaki training, Tuesdays 17:00–18:30" — sessions from today to 16 weeks ahead at 17:00 club time, the preview shows the clash on the pitch', async ({
  request,
}) => {
  const club = await createClub(request, 'test-007-series')
  try {
    const { academy, pitch, zaki, orliki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const horizon = addDays(today, HORIZON_DAYS)
    const june = juneThirtiethNextYear(today)
    // 30 June next year is always beyond the 16-week horizon.
    expect(june.date > horizon).toBe(true)
    const tuesdays = weekdaysBetween(today, horizon, 'TU')
    expect(tuesdays.length).toBeGreaterThanOrEqual(16)

    // An Orliki session already on the pitch overlaps the third Tuesday's training (18:00–19:00).
    const clashDay = tuesdays[2]
    const blocker = await createActivity(request, coordinator, {
      groupId: orliki,
      name: 'Orliki — gierka wewnętrzna',
      type: 'training',
      placeId: pitch,
      startsOn: clashDay,
      startTime: '18:00',
      endTime: '19:00',
    })
    expect(blocker.sessionsCreated).toBe(1)
    const blockerSessions = await listOccurrences(request, coordinator, `&activityId=${blocker.id}`)
    const blockerSession = blockerSessions.items.at(0)
    if (!blockerSession) throw new Error('[internal] the Orliki activity has no session')
    expect(blockerSession.occurrenceDate).toBe(clashDay)

    // The series starts two weeks ago: nothing is generated for the past.
    const series = {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${june.until}`,
      startsOn: addDays(today, -14),
      startTime: '17:00',
      endTime: '18:30',
    }

    // The preview, before anything is saved: the same Tuesdays, one with the Orliki session as a place conflict.
    const first = await preview(request, coordinator, series)
    expect(first.status, JSON.stringify(first.body)).toBe(200)
    expect(first.body?.items?.map((item) => item.date)).toEqual(tuesdays)
    expect(first.body?.total).toBe(tuesdays.length)
    expect(first.body?.horizonEnd).toBe(horizon)
    expect(first.body?.generatedUntil).toBe(horizon)
    expect(first.body?.conflictCount).toBe(1)
    expect(first.body?.providerFailed).toBe(false)
    for (const item of first.body?.items ?? []) {
      expect(item.existingId).toBeNull()
      expect(zoneDate(item.startAt)).toBe(item.date)
      expect(wallTime(item.startAt)).toBe('17:00')
      expect(wallTime(item.endAt)).toBe('18:30')
      if (item.date === clashDay) {
        expect(item.conflicts).toHaveLength(1)
        expect(item.conflicts.at(0)?.kind).toBe('place')
        expect(item.conflicts.at(0)?.sessions.map((session) => session.id)).toEqual([blockerSession.id])
        expect(item.conflicts.at(0)?.sessions.at(0)?.activityName).toBe('Orliki — gierka wewnętrzna')
      } else {
        expect(item.conflicts).toEqual([])
      }
    }

    // Saving over the clash is refused with the same conflict; nothing is written.
    const refused = await postActivity(request, coordinator, series)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('occurrence_place_conflict')
    expect(refused.body?.conflicts?.map((conflict) => conflict.key)).toEqual([clashDay])
    expect(refused.body?.conflicts?.at(0)?.sessions.map((session) => session.id)).toEqual([blockerSession.id])
    expect((await listOccurrences(request, coordinator, `&groupId=${zaki}`)).items).toEqual([])

    // The coordinator cancels the Orliki session (cancelled sessions do not block), previews again and saves.
    const cancelled = await cancelOccurrence(
      request,
      coordinator,
      blockerSession.id,
      'Boisko dla Żaków',
      blockerSession.updatedAt,
    )
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    const second = await preview(request, coordinator, series)
    expect(second.status).toBe(200)
    expect(second.body?.conflictCount).toBe(0)
    expect(second.body?.items?.map((item) => item.date)).toEqual(tuesdays)

    const saved = await postActivity(request, coordinator, series)
    expect(saved.status, JSON.stringify(saved.body)).toBe(201)
    expect(saved.body?.sessionsCreated).toBe(tuesdays.length)
    expect(saved.body?.generatedUntil).toBe(horizon)
    const activityId = String(saved.body?.id)

    const detail = await getActivity(request, coordinator, activityId)
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({
      groupId: zaki,
      sectionId: academy,
      placeId: pitch,
      type: 'training',
      startTime: '17:00',
      endTime: '18:30',
      generatedUntil: horizon,
      isActive: true,
      actingRole: 'coordinator',
    })
    expect(detail.body?.recurrenceRule).toContain('BYDAY=TU')

    // Exactly the Tuesdays from today to the horizon end, planned, at 17:00–18:30 Warsaw wall time.
    const sessions = await listOccurrences(request, coordinator, `&activityId=${activityId}`)
    expect(sessions.status).toBe(200)
    expect(sessions.items.map((session) => session.occurrenceDate)).toEqual(tuesdays)
    for (const session of sessions.items) {
      const date = String(session.occurrenceDate)
      expect(session).toMatchObject({
        groupId: zaki,
        sectionId: academy,
        placeId: pitch,
        status: 'planned',
        isDetached: false,
        needsReschedule: false,
      })
      expect(session.startAt).toBe(zoneInstant(date, '17:00'))
      expect(session.endAt).toBe(zoneInstant(date, '18:30'))
    }

    // The daily job, run as of 150 days later, generates from that day on (never its past) to its horizon or the
    // series' end (30 June) — still at 17:00 wall time, so the sessions span winter (UTC+1) and summer time (UTC+2).
    const laterToday = addDays(today, 150)
    const laterEnd = addDays(laterToday, HORIZON_DAYS) < june.date ? addDays(laterToday, HORIZON_DAYS) : june.date
    const laterTuesdays = weekdaysBetween(laterToday, laterEnd, 'TU')
    const later = runGenerator(club, laterToday)
    expect(later).toMatchObject({ today: laterToday, failed: 0, flagged: 0, created: laterTuesdays.length })
    const extended = await listOccurrences(request, coordinator, `&activityId=${activityId}`)
    expect(extended.items.map((session) => session.occurrenceDate)).toEqual([...tuesdays, ...laterTuesdays])
    for (const session of extended.items) {
      expect(session.startAt).toBe(zoneInstant(String(session.occurrenceDate), '17:00'))
      expect(wallTime(String(session.startAt))).toBe('17:00')
    }
    // The two windows cover more than the 22 weeks of winter time, so both offsets appear.
    const offsets = new Set(extended.items.map((session) => zoneOffsetMinutes(String(session.startAt))))
    expect([...offsets].sort()).toEqual([120, 60].sort())
    // `generated_until` is the end of the window the job filled: the horizon, `ends_on` or the rule's `UNTIL`,
    // whichever comes first (30 June here).
    expect((await getActivity(request, coordinator, activityId)).body?.generatedUntil).toBe(laterEnd)
  } finally {
    await club.cleanup()
  }
})

test('TEST-007 a moved session is detached; changing the series times to 17:30 leaves the moved and the cancelled session untouched; a stale lock token is refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-007-edit')
  try {
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const june = juneThirtiethNextYear(today)
    const { id: activityId } = await createActivity(request, coordinator, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${june.until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    const sessions = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    expect(sessions.length).toBeGreaterThanOrEqual(16)
    const toMove = sessions.at(1)
    const toCancel = sessions.at(2)
    if (!toMove || !toCancel) throw new Error('[internal] the series has too few sessions')
    const movedDay = addDays(String(toMove.occurrenceDate), 1)

    // Move the second session to the next day, 16:00–17:30: it is detached and keeps its slot.
    const moved = await moveOccurrence(
      request,
      coordinator,
      toMove.id,
      { startAt: zoneInstant(movedDay, '16:00'), endAt: zoneInstant(movedDay, '17:30') },
      toMove.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    expect(moved.body?.actingRole).toBe('coordinator')
    const movedRecord = await getOccurrence(request, coordinator, toMove.id)
    expect(movedRecord.body).toMatchObject({
      isDetached: true,
      status: 'planned',
      occurrenceDate: toMove.occurrenceDate,
      startAt: zoneInstant(movedDay, '16:00'),
      endAt: zoneInstant(movedDay, '17:30'),
    })
    // The token read before the move is stale now.
    const staleMove = await moveOccurrence(
      request,
      coordinator,
      toMove.id,
      { startAt: zoneInstant(movedDay, '15:00'), endAt: zoneInstant(movedDay, '16:30') },
      toMove.updatedAt,
    )
    expect(staleMove.status, JSON.stringify(staleMove.body)).toBe(409)
    expect(staleMove.body?.code).toBe('optimistic_lock_conflict')

    // Cancel the third session.
    const cancelled = await cancelOccurrence(request, coordinator, toCancel.id, 'Wyjazd na turniej', toCancel.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    expect(cancelled.body?.status).toBe('cancelled')

    // Attendance arrives with #33: "a session with attendance stays untouched" is covered by the pure series-edit plan
    // test (`seriesEditPlan` keeps pinned sessions); here the pinned session is the cancelled one.
    const before = await getActivity(request, coordinator, activityId)
    const changed = await updateActivity(
      request,
      coordinator,
      { id: activityId, startTime: '17:30', endTime: '19:00' },
      before.body?.updatedAt,
    )
    expect(changed.status, JSON.stringify(changed.body)).toBe(200)
    expect(changed.body?.actingRole).toBe('coordinator')
    expect(changed.body?.sessions).toEqual({ created: 0, updated: sessions.length - 2, removed: 0 })

    const after = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    expect(after.map((session) => session.id).sort()).toEqual(sessions.map((session) => session.id).sort())
    for (const session of after) {
      const date = String(session.occurrenceDate)
      if (session.id === toMove.id) {
        expect(session).toMatchObject({
          isDetached: true,
          status: 'planned',
          startAt: zoneInstant(movedDay, '16:00'),
          endAt: zoneInstant(movedDay, '17:30'),
        })
      } else if (session.id === toCancel.id) {
        expect(session).toMatchObject({
          status: 'cancelled',
          cancelReason: 'Wyjazd na turniej',
          isDetached: false,
          startAt: zoneInstant(date, '17:00'),
          endAt: zoneInstant(date, '18:30'),
        })
      } else {
        expect(session).toMatchObject({
          status: 'planned',
          isDetached: false,
          startAt: zoneInstant(date, '17:30'),
          endAt: zoneInstant(date, '19:00'),
        })
      }
    }

    // A second change sent with the token read before the first one is refused; the series stays at 17:30.
    const stale = await updateActivity(
      request,
      coordinator,
      { id: activityId, startTime: '18:00', endTime: '19:30' },
      before.body?.updatedAt,
    )
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)
    expect(stale.body?.code).toBe('optimistic_lock_conflict')
    const unchanged = await getActivity(request, coordinator, activityId)
    expect(unchanged.body).toMatchObject({ startTime: '17:30', endTime: '19:00' })
  } finally {
    await club.cleanup()
  }
})

test('TEST-007 the daily generator adds the next week without refilling the moved slot, and a second run creates nothing', async ({
  request,
}) => {
  const club = await createClub(request, 'test-007-generator')
  try {
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const today = calendarDate()
    const horizon = addDays(today, HORIZON_DAYS)
    const june = juneThirtiethNextYear(today)
    const { id: activityId, generatedUntil } = await createActivity(request, coordinator, {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${june.until}`,
      startsOn: today,
      startTime: '17:00',
      endTime: '18:30',
    })
    expect(generatedUntil).toBe(horizon)
    const initial = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    expect(initial.map((session) => session.occurrenceDate)).toEqual(weekdaysBetween(today, horizon, 'TU'))

    // Detach the first session (moved to 19:00–20:30 on its day).
    const first = initial.at(0)
    if (!first) throw new Error('[internal] the series has no session')
    const firstDay = String(first.occurrenceDate)
    const moved = await moveOccurrence(
      request,
      coordinator,
      first.id,
      { startAt: zoneInstant(firstDay, '19:00'), endAt: zoneInstant(firstDay, '20:30') },
      first.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)

    // A week later the horizon moves by seven days: exactly one new Tuesday.
    const runToday = addDays(today, 7)
    const runHorizon = addDays(runToday, HORIZON_DAYS)
    const added = weekdaysBetween(addDays(horizon, 1), runHorizon, 'TU')
    expect(added).toHaveLength(1)
    const run = runGenerator(club, runToday)
    expect(run).toMatchObject({ today: runToday, processed: 1, failed: 0, flagged: 0, created: added.length })

    const extended = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    expect(extended).toHaveLength(initial.length + added.length)
    expect(extended.map((session) => session.occurrenceDate)).toEqual(weekdaysBetween(today, runHorizon, 'TU'))
    const newSession = extended.find((session) => session.occurrenceDate === added[0])
    expect(newSession).toMatchObject({ status: 'planned', isDetached: false, needsReschedule: false })
    expect(newSession?.startAt).toBe(zoneInstant(added[0], '17:00'))
    // The moved session still holds its slot alone: the generator did not refill it.
    const slot = extended.filter((session) => session.occurrenceDate === firstDay)
    expect(slot.map((session) => session.id)).toEqual([first.id])
    expect(slot[0]).toMatchObject({ isDetached: true, startAt: zoneInstant(firstDay, '19:00') })
    expect((await getActivity(request, coordinator, activityId)).body?.generatedUntil).toBe(runHorizon)

    // The same run again creates nothing and duplicates nothing.
    const again = runGenerator(club, runToday)
    expect(again).toMatchObject({ today: runToday, failed: 0, created: 0 })
    const unchanged = (await listOccurrences(request, coordinator, `&activityId=${activityId}`)).items
    expect(unchanged.map((session) => session.id).sort()).toEqual(extended.map((session) => session.id).sort())
  } finally {
    await club.cleanup()
  }
})
