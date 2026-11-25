import { expect, test, type APIRequestContext } from '@playwright/test'
import {
  addDays,
  cancelOccurrence,
  createActivity,
  getActivity,
  moveOccurrence,
  safeDay,
  updateActivity,
  weekdayOf,
} from '../_fixtures/activities'
import { familyFor, sessionsOf } from '../_fixtures/attendance'
import { call, createClub, type Club } from '../_fixtures/club'

// Training outlines spec TEST-O06 (REQ-O07, AC-O07, DD-O07, BR-O2; E24-S03, #683): Żaki's weekly training with four
// generated sessions. The section coordinator attaches a series outline: every session gets its own copy. The coach
// edits one copy, the coordinator edits the series — the edited copy and the other copies stay as they were. Moving a
// session keeps its copy, cancelling one keeps it too; shortening the series by one week deletes the removed session's
// unedited copy, and extending it again gives the new session a copy of the series as it is now. `ensure-copy` twice answers
// the one copy.
test.describe.configure({ timeout: 300_000 })
test.use({ timezoneId: 'Europe/Warsaw' })

type Item = {
  id: string
  topic: string
  occurrenceId: string | null
  sourceOutlineId: string | null
  updatedAt: string
}
type Listed = { items?: Item[] }

const exercise = (name: string, minutes: number) => ({ name, minutes })

const content = (topic: string) => ({
  language: 'pl',
  topic,
  goal: 'Utrzymanie piłki',
  ageCategory: 'U9',
  durationMinutes: 60,
  parts: {
    warm_up: [exercise('Berek z piłką', 10)],
    main: [exercise('Rondo 5×2', 30)],
    cool_down: [exercise('Rozciąganie', 5)],
  },
})

async function copiesOf(request: APIRequestContext, token: string, occurrenceId: string): Promise<Item[]> {
  const result = await call<Listed>(request, 'GET', `/api/training/outlines?occurrenceId=${occurrenceId}`, token)
  expect(result.status, JSON.stringify(result.body)).toBe(200)
  return result.body?.items ?? []
}

async function liveSessionIds(request: APIRequestContext, club: Club, activityId: string): Promise<string[]> {
  return (await sessionsOf(request, club, activityId)).map((session) => session.id)
}

test('TEST-O06 a series outline gives every session its own copy through moves, cancellations and series edits', async ({
  request,
}) => {
  const club = await createClub(request, 'test-o06')
  try {
    const family = await familyFor(request, club)
    const coordinator = family.academyCoordinator.token
    const coach = family.coach.token
    const first = safeDay(undefined, 3)
    const activity = await createActivity(request, club.adminToken, {
      groupId: family.zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: family.pitch,
      coachPersonId: family.coach.personId,
      recurrenceRule: `FREQ=WEEKLY;BYDAY=${weekdayOf(first)};UNTIL=${addDays(first, 21).replace(/-/g, '')}`,
      startsOn: first,
      startTime: '17:00',
      endTime: '18:00',
    })
    const sessions = await sessionsOf(request, club, activity.id)
    expect(sessions.map((session) => session.occurrenceDate)).toEqual(
      [0, 7, 14, 21].map((days) => addDays(first, days)),
    )
    const [s1, s2, s3, s4] = sessions

    // --- The coordinator attaches a series outline: four copies, one per session ---
    const series = await call<{ id: string; updatedAt: string; copyIds: string[] }>(
      request,
      'POST',
      '/api/training/outlines',
      coordinator,
      { data: { ...content('Tydzień 1 – rondo'), activityId: activity.id } },
    )
    expect(series.status, JSON.stringify(series.body)).toBe(201)
    const seriesId = String(series.body?.id)
    expect(series.body?.copyIds).toHaveLength(4)
    const copies = new Map<string, Item>()
    for (const session of sessions) {
      const [copy] = await copiesOf(request, coach, session.id)
      expect(copy.sourceOutlineId).toBe(seriesId)
      expect(copy.topic).toBe('Tydzień 1 – rondo')
      copies.set(session.id, copy)
    }
    expect(new Set([...copies.values()].map((copy) => copy.id)).size).toBe(4)
    // A second series outline for the same activity answers 409 (BR-O2).
    const again = await call(request, 'POST', '/api/training/outlines', coordinator, {
      data: { ...content('Inny cykl'), activityId: activity.id },
    })
    expect(again.status, JSON.stringify(again.body)).toBe(409)

    // --- The coach changes one Monday's warm-up; the coordinator changes the series ---
    const s2Copy = copies.get(s2.id) as Item
    const edited = await call(request, 'PUT', '/api/training/outlines', coach, {
      data: { id: s2Copy.id, topic: 'Tydzień 1 – rondo (deszcz)' },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': s2Copy.updatedAt },
    })
    expect(edited.status, JSON.stringify(edited.body)).toBe(200)
    const seriesEdit = await call(request, 'PUT', '/api/training/outlines', coordinator, {
      data: { id: seriesId, topic: 'Tydzień 2 – gra 2×2' },
      headers: { 'x-om-ext-optimistic-lock-expected-updated-at': String(series.body?.updatedAt) },
    })
    expect(seriesEdit.status, JSON.stringify(seriesEdit.body)).toBe(200)
    expect((await copiesOf(request, coach, s1.id))[0].topic).toBe('Tydzień 1 – rondo')
    expect((await copiesOf(request, coach, s2.id))[0].topic).toBe('Tydzień 1 – rondo (deszcz)')
    expect((await copiesOf(request, coach, s3.id))[0].topic).toBe('Tydzień 1 – rondo')

    // --- Moving a session keeps its copy; cancelling one keeps it too ---
    const moved = await moveOccurrence(
      request,
      club.adminToken,
      s1.id,
      {
        startAt: new Date(Date.parse(String(s1.startAt)) + 3_600_000).toISOString(),
        endAt: new Date(Date.parse(String(s1.endAt)) + 3_600_000).toISOString(),
      },
      s1.updatedAt,
    )
    expect(moved.status, JSON.stringify(moved.body)).toBe(200)
    const cancelled = await cancelOccurrence(request, club.adminToken, s3.id, 'Boisko zamknięte', s3.updatedAt)
    expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200)
    // The subscriber runs after the commits; the copies are still there once it settled.
    await expect
      .poll(async () => (await copiesOf(request, coach, s1.id)).map((copy) => copy.id))
      .toEqual([(copies.get(s1.id) as Item).id])
    expect((await copiesOf(request, coach, s3.id)).map((copy) => copy.id)).toEqual([(copies.get(s3.id) as Item).id])

    // --- Shortening the series by one week removes the last session and its unedited copy ---
    const before = await getActivity(request, club.adminToken, activity.id)
    const shortened = await updateActivity(
      request,
      club.adminToken,
      { id: activity.id, endsOn: addDays(first, 14) },
      before.body?.updatedAt,
    )
    expect(shortened.status, JSON.stringify(shortened.body)).toBe(200)
    expect(await liveSessionIds(request, club, activity.id)).not.toContain(s4.id)
    await expect.poll(async () => (await copiesOf(request, coach, s4.id)).length, { timeout: 60_000 }).toBe(0)
    const removedCopy = await call(request, 'GET', `/api/training/outlines/${(copies.get(s4.id) as Item).id}`, coach)
    expect(removedCopy.status).toBe(404)

    // --- Extending it again (to the rule's last week): the new session gets a copy of the series as it is now ---
    const current = await getActivity(request, club.adminToken, activity.id)
    const extended = await updateActivity(
      request,
      club.adminToken,
      { id: activity.id, endsOn: addDays(first, 21) },
      current.body?.updatedAt,
    )
    expect(extended.status, JSON.stringify(extended.body)).toBe(200)
    const added = (await sessionsOf(request, club, activity.id)).filter(
      (session) => String(session.occurrenceDate) === addDays(first, 21),
    )
    expect(added).toHaveLength(1)
    expect(added[0].id).not.toBe(s4.id)
    for (const session of added) {
      await expect
        .poll(async () => (await copiesOf(request, coach, session.id)).map((copy) => copy.topic), { timeout: 60_000 })
        .toEqual(['Tydzień 2 – gra 2×2'])
    }

    // --- ensure-copy is idempotent: the session's one copy, twice ---
    const ensured = await call<{ id: string | null; created: boolean }>(
      request,
      'POST',
      '/api/training/outlines/ensure-copy',
      coach,
      { data: { occurrenceId: s2.id } },
    )
    const ensuredAgain = await call<{ id: string | null; created: boolean }>(
      request,
      'POST',
      '/api/training/outlines/ensure-copy',
      coach,
      { data: { occurrenceId: s2.id } },
    )
    expect([ensured.status, ensuredAgain.status]).toEqual([200, 200])
    expect(ensured.body?.id).toBe(s2Copy.id)
    expect(ensuredAgain.body?.id).toBe(s2Copy.id)
    expect(await copiesOf(request, coach, s2.id)).toHaveLength(1)
    // A session that lost its copy gets one from the series on demand (201), then the same one (200).
    const deleted = await call(
      request,
      'DELETE',
      `/api/training/outlines?id=${(copies.get(s3.id) as Item).id}`,
      coach,
      {
        headers: {
          'x-om-ext-optimistic-lock-expected-updated-at': (await copiesOf(request, coach, s3.id))[0].updatedAt,
        },
      },
    )
    expect(deleted.status, JSON.stringify(deleted.body)).toBe(200)
    const remade = await call<{ id: string | null; created: boolean }>(
      request,
      'POST',
      '/api/training/outlines/ensure-copy',
      coach,
      { data: { occurrenceId: s3.id } },
    )
    expect(remade.status, JSON.stringify(remade.body)).toBe(201)
    expect(remade.body?.created).toBe(true)
    const remadeAgain = await call<{ id: string | null }>(
      request,
      'POST',
      '/api/training/outlines/ensure-copy',
      coach,
      {
        data: { occurrenceId: s3.id },
      },
    )
    expect(remadeAgain.status).toBe(200)
    expect(remadeAgain.body?.id).toBe(remade.body?.id)
  } finally {
    await club.cleanup()
  }
})
