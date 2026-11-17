import { expect, test } from '@playwright/test'
import { addDays, createActivity, juneThirtiethNextYear, listOccurrences, scheduleFor } from '../_fixtures/activities'
import { birthDateTurning, calendarDate, createClub, createStaff, type Club } from '../_fixtures/club'
import { listThreads } from '../_fixtures/communication'
import { addMembership } from '../_fixtures/groups'
import { runProbe, type ProbeStep } from '../_fixtures/messaging'

// TEST-A15 (groups and activities parity spec REQ-A09, *Security* → tenant isolation; #271): both moved-session
// subscribers run under the emitter's trusted scope. A payload naming a session of a second tenant, run under the first
// tenant's scope, writes nothing and sends nothing in either tenant: no thread, no dispatch, no notification. The same
// payload under the second tenant's own scope is announced (the positive control).
test.describe.configure({ timeout: 600_000 })

async function sessionOf(request: Parameters<typeof scheduleFor>[0], club: Club) {
  const admin = club.adminToken
  const { pitch, zaki } = await scheduleFor(request, club)
  const today = calendarDate()
  const adult = await createStaff(request, club, {
    firstName: 'Iga',
    lastName: 'Dorosła',
    birthDate: birthDateTurning(19),
  })
  await addMembership(request, admin, {
    groupId: zaki,
    personId: adult.personId,
    role: 'participant',
    validFrom: addDays(today, -30),
  })
  const { id: activityId } = await createActivity(request, admin, {
    groupId: zaki,
    name: 'Trening Żaków',
    type: 'training',
    placeId: pitch,
    recurrenceRule: `FREQ=WEEKLY;BYDAY=TU;UNTIL=${juneThirtiethNextYear(today).until}`,
    startsOn: addDays(today, 1),
    startTime: '17:00',
    endTime: '18:30',
  })
  const session = (await listOccurrences(request, admin, `&activityId=${activityId}`)).items.at(0)
  if (!session) throw new Error('[internal] the series has no session')
  return { session, pitch, adultUserId: adult.userId }
}

test('TEST-A15 the moved-session subscribers write and send nothing for another tenant’s session', async ({
  request,
}) => {
  const first = await createClub(request, 'test-a15-first')
  const second = await createClub(request, 'test-a15-second')
  try {
    const { session, pitch } = await sessionOf(request, second)
    const updatedAt = '2026-11-17T12:00:00.000Z'
    const payload = {
      id: session.id,
      activityId: session.activityId,
      groupId: session.groupId,
      // The payload claims the second tenant; the emitter's scope is the first one's.
      tenantId: second.tenant.tenantId,
      organizationId: second.tenant.organizationId,
      change: {
        kinds: ['time'],
        before: {
          startAt: session.startAt,
          endAt: session.endAt,
          placeId: pitch,
          venueName: null,
          gatheringMinutesBefore: null,
        },
      },
      actorUserId: null,
      actorPersonId: null,
      actingRole: 'club_admin',
      updatedAt,
    }
    const key = `communication:reschedule:${session.id}:${updatedAt}`
    const groupKey = `activities.occurrence_moved:${session.id}:${updatedAt}`
    const steps: ProbeStep[] = [
      { op: 'subscriber', id: 'activities:notify-occurrence-moved', payload },
      { op: 'subscriber', id: 'communication:session-moved', payload },
      { op: 'dispatchByKey', key },
      { op: 'notifications', dispatch: groupKey },
    ]
    const scopeOf = (club: Club) => ({ tenantId: club.tenant.tenantId, organizationId: club.tenant.organizationId })

    // Under the first tenant's scope: nothing in the first tenant…
    const crossed = runProbe(scopeOf(first), steps)
    expect(crossed.result.failure).toBeNull()
    expect(crossed.result.outputs[0]).toEqual({ ok: true })
    expect(crossed.result.outputs[1]).toEqual({ ok: true })
    expect(crossed.result.outputs[2]).toEqual({ ids: [] })
    expect(crossed.result.outputs[3]).toEqual({ items: [] })
    expect(await listThreads(request, first.adminToken, '&scopeType=occurrence')).toEqual([])
    // …and nothing in the second.
    const check = runProbe(scopeOf(second), steps.slice(2))
    expect(check.result.outputs[0]).toEqual({ ids: [] })
    expect(check.result.outputs[1]).toEqual({ items: [] })
    expect(await listThreads(request, second.adminToken, `&scopeType=occurrence&scopeId=${session.id}`)).toEqual([])

    // The positive control: under the second tenant's own scope the same payload is announced.
    const own = runProbe(scopeOf(second), steps)
    expect(own.result.failure).toBeNull()
    expect((own.result.outputs[2] as { ids: string[] }).ids).toHaveLength(1)
    expect((own.result.outputs[3] as { items: unknown[] }).items.length).toBeGreaterThan(0)
    expect(await listThreads(request, second.adminToken, `&scopeType=occurrence&scopeId=${session.id}`)).toHaveLength(1)
  } finally {
    await first.cleanup()
    await second.cleanup()
  }
})
