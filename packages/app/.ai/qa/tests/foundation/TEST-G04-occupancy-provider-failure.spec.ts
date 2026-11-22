import { expect, test } from '@playwright/test'
import {
  listActivities,
  listOccurrences,
  postActivity,
  preview,
  runOccupancyProviderProbe,
  safeDay,
  scheduleFor,
  zoneInstant,
} from '../_fixtures/activities'
import { createClub } from '../_fixtures/club'
import { postClosure } from '../_fixtures/facilities'

// Foundation II TEST-G04 (provider part), AC-G03 (#590): the session preview and save consult the optional
// `vereino.occupancyProvider` (P-26). In the running app `facilities` registers it, so a closure on the pitch is a
// conflict; a probe process swaps the registration for a provider that throws, where the preview still answers and
// warns (`providerFailed`) while the save fails closed with an uncoded 500 and writes nothing, and for no provider at
// all, where the closure adds nothing and the same session saves.
test.describe.configure({ timeout: 300_000 })

test('TEST-G04 a failing occupancy provider warns in the preview and blocks the save with an uncoded 500; an absent one adds nothing', async ({
  request,
}) => {
  const club = await createClub(request, 'test-g04-provider')
  try {
    const { pitch, zaki, coordinator } = await scheduleFor(request, club)
    const day = safeDay('WE')
    const closure = await postClosure(request, club.adminToken, {
      placeId: pitch,
      startsAt: zoneInstant(day, '16:00'),
      endsAt: zoneInstant(day, '20:00'),
      reason: 'municipal_event',
    })
    expect(closure.status, JSON.stringify(closure.body)).toBe(201)
    const session = {
      groupId: zaki,
      name: 'Trening Żaków',
      type: 'training',
      placeId: pitch,
      startsOn: day,
      startTime: '17:00',
      endTime: '18:30',
    }

    // The registered provider (facilities): the closure is listed in the preview and refuses the save.
    const registered = await preview(request, coordinator, session)
    expect(registered.status, JSON.stringify(registered.body)).toBe(200)
    expect(registered.body?.providerFailed).toBe(false)
    expect(registered.body?.conflictCount).toBe(1)
    const blocks = registered.body?.items?.flatMap((item) => item.conflicts.flatMap((conflict) => conflict.blocks))
    expect(blocks).toContainEqual(expect.objectContaining({ id: closure.body?.id, reason: 'closure' }))
    const refused = await postActivity(request, coordinator, session)
    expect(refused.status, JSON.stringify(refused.body)).toBe(409)
    expect(refused.body?.code).toBe('occurrence_place_conflict')

    const probed = runOccupancyProviderProbe(coordinator, [
      { provider: 'throwing', op: 'preview', body: session },
      { provider: 'throwing', op: 'create', body: session },
      { provider: 'absent', op: 'preview', body: session },
      { provider: 'absent', op: 'create', body: session },
    ])
    expect(probed).toHaveLength(4)
    const [failingPreview, failingSave, absentPreview, absentSave] = probed

    // A throwing provider: the preview answers with the session, no provider conflict and the warning flag.
    const report = JSON.stringify(probed)
    expect(failingPreview, report).toMatchObject({ registered: true, calls: 1, status: 200 })
    expect(failingPreview.body?.providerFailed).toBe(true)
    expect(failingPreview.body?.items?.map((item) => item.date)).toEqual([day])
    expect(failingPreview.body?.conflictCount).toBe(0)
    // ...and the save fails closed: a 500 with the platform's generic code and no business code (nothing is written:
    // the only activity and session of the club below are the ones the absent-provider save creates).
    expect(failingSave, report).toMatchObject({ registered: true, calls: 1, status: 500, code: 'INTERNAL_ERROR' })

    // No provider: the closure adds nothing — no conflict, no warning — and the session saves.
    expect(absentPreview, report).toMatchObject({ registered: false, calls: 0, status: 200 })
    expect(absentPreview.body?.providerFailed).toBe(false)
    expect(absentPreview.body?.conflictCount).toBe(0)
    expect(absentSave, report).toMatchObject({ registered: false, calls: 0, status: 201 })
    expect(absentSave.body?.sessionsCreated).toBe(1)
    const activities = await listActivities(request, coordinator)
    expect(activities.items.map((item) => item.id)).toEqual([absentSave.body?.id])
    const saved = await listOccurrences(request, coordinator, `&groupId=${zaki}`)
    expect(saved.items.map((item) => [item.activityId, item.occurrenceDate])).toEqual([[absentSave.body?.id, day]])
  } finally {
    await club.cleanup()
  }
})
