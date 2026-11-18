import { expect, test } from '@playwright/test'
import { addDays, createActivity } from '../_fixtures/activities'
import { familyFor, readCalendarItem, sessionsOf, startNow } from '../_fixtures/attendance'
import { OPTIMISTIC_LOCK_HEADER, calendarDate, call, createClub } from '../_fixtures/club'

// TEST-A21 (groups and activities parity spec REQ-A15, AC-A16, Q-A21; E10-S07 #272): the coach records 3:1 with a
// note on a match that has started; the score shows on the member session page read (the coach's and a guardian's) and
// on the panel record; clearing removes it; a match tomorrow answers 409 `score_before_start`, a training 422
// `score_not_applicable`, half a score 400, a stale version 409 and a coach of another group 403.
test.describe.configure({ timeout: 300_000 })

type Score = { home: number; away: number; note: string | null } | null

test('TEST-A21 the coach records a match score once it started; the reads show it; tomorrow, a training, half a score and another coach are refused', async ({
  request,
}) => {
  const club = await createClub(request, 'test-a21')
  try {
    const family = await familyFor(request, club)
    const tomorrow = addDays(calendarDate(), 1)
    const create = async (name: string, type: string, startTime: string) => {
      const activity = await createActivity(request, family.academyCoordinator.token, {
        groupId: family.zaki,
        placeId: family.pitch,
        name,
        type,
        coachPersonId: family.coach.personId,
        startsOn: tomorrow,
        startTime,
        endTime: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:30`,
      })
      const id = (await sessionsOf(request, club, activity.id)).at(0)?.id
      if (!id) throw new Error(`[test] ${name} has no session`)
      return id
    }
    const matchId = await create('Mecz ligowy', 'match', '10:00')
    const tomorrowMatchId = await create('Mecz jutro', 'match', '13:00')
    const trainingId = await create('Trening', 'training', '16:00')
    await startNow(request, club, matchId)
    await startNow(request, club, trainingId)

    const versionOf = async (id: string) => {
      const item = await readCalendarItem(request, family.coach.token, id, 'as=coach')
      expect(item.status, JSON.stringify(item.body)).toBe(200)
      return String((item.body as { occurrence?: { updatedAt?: string } } | null)?.occurrence?.updatedAt)
    }
    const putScore = (token: string, id: string, data: Record<string, unknown>, version: string | null) =>
      call<{ score?: Score; updatedAt?: string; code?: string }>(
        request,
        'PUT',
        `/api/activities/occurrences/${id}/score`,
        token,
        { data, headers: version ? { [OPTIMISTIC_LOCK_HEADER]: version } : {} },
      )

    // --- The coach records 3:1 with a note ---
    const before = await readCalendarItem(request, family.coach.token, matchId, 'as=coach')
    expect((before.body as { mayScore?: boolean } | null)?.mayScore).toBe(true)
    const version = await versionOf(matchId)
    const saved = await putScore(
      family.coach.token,
      matchId,
      { scoreHome: 3, scoreAway: 1, note: 'Dobra gra' },
      version,
    )
    expect(saved.status, JSON.stringify(saved.body)).toBe(200)
    expect(saved.body?.score).toEqual({ home: 3, away: 1, note: 'Dobra gra' })
    // The page's old version is stale now (409).
    const stale = await putScore(family.coach.token, matchId, { scoreHome: 4, scoreAway: 1 }, version)
    expect(stale.status, JSON.stringify(stale.body)).toBe(409)

    // --- The reads: the coach's and a guardian's session page, the panel record ---
    const coachRead = await readCalendarItem(request, family.coach.token, matchId, 'as=coach')
    expect((coachRead.body as { occurrence?: { score?: Score } } | null)?.occurrence?.score).toEqual({
      home: 3,
      away: 1,
      note: 'Dobra gra',
    })
    const guardianRead = await readCalendarItem(request, family.guardian.token, matchId, 'as=guardian')
    expect(guardianRead.status, JSON.stringify(guardianRead.body)).toBe(200)
    expect((guardianRead.body as { occurrence?: { score?: Score } } | null)?.occurrence?.score?.home).toBe(3)
    const record = await call<{ score?: Score; mayScore?: boolean; isAway?: boolean }>(
      request,
      'GET',
      `/api/activities/occurrences/${matchId}`,
      family.academyCoordinator.token,
    )
    expect(record.body).toMatchObject({ score: { home: 3, away: 1, note: 'Dobra gra' }, mayScore: true, isAway: false })

    // --- Clearing removes the score and its note ---
    const cleared = await putScore(
      family.coach.token,
      matchId,
      { scoreHome: null, scoreAway: null, note: 'ignored' },
      await versionOf(matchId),
    )
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200)
    expect(cleared.body?.score).toBeNull()

    // --- Refusals ---
    const half = await putScore(
      family.coach.token,
      matchId,
      { scoreHome: 3, scoreAway: null },
      await versionOf(matchId),
    )
    expect(half.status, JSON.stringify(half.body)).toBe(400)
    const early = await putScore(
      family.coach.token,
      tomorrowMatchId,
      { scoreHome: 1, scoreAway: 0 },
      await versionOf(tomorrowMatchId),
    )
    expect(early.status, JSON.stringify(early.body)).toBe(409)
    expect(early.body?.code).toBe('score_before_start')
    const training = await putScore(
      family.coach.token,
      trainingId,
      { scoreHome: 1, scoreAway: 0 },
      await versionOf(trainingId),
    )
    expect(training.status, JSON.stringify(training.body)).toBe(422)
    expect(training.body?.code).toBe('score_not_applicable')
    const foreign = await putScore(
      family.instructor.token,
      matchId,
      { scoreHome: 1, scoreAway: 0 },
      await versionOf(matchId),
    )
    expect(foreign.status, JSON.stringify(foreign.body)).toBe(403)
    // The coordinator of the section records it as well (REQ-A15: `activities.manage` in scope).
    const byCoordinator = await putScore(
      family.academyCoordinator.token,
      matchId,
      { scoreHome: 2, scoreAway: 2 },
      await versionOf(matchId),
    )
    expect(byCoordinator.status, JSON.stringify(byCoordinator.body)).toBe(200)
    expect(byCoordinator.body?.score).toEqual({ home: 2, away: 2, note: null })
  } finally {
    await club.cleanup()
  }
})
