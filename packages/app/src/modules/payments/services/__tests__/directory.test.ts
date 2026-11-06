import { describe, expect, it } from '@jest/globals'
import type { AwilixContainer } from 'awilix'
import type { ScheduleOccurrenceEntry } from '../../../activities/services/schedule-directory'
import { SCHEDULE_PAGE, listOccurrences } from '../directory'

const scope = { tenantId: 't', organizationId: 'o' }
const window = { from: new Date('2026-12-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') }

function session(groupId: string, index: number, startAt: Date): ScheduleOccurrenceEntry {
  return {
    id: `${groupId}-${String(index)}`,
    activityId: `${groupId}-activity`,
    activityName: null,
    groupId,
    sectionId: 's',
    occurrenceDate: startAt.toISOString().slice(0, 10),
    startAt,
    endAt: startAt,
    gatheringAt: null,
    status: 'planned',
    cancelReason: null,
    updatedAt: startAt,
  }
}

/** A schedule directory over fixed sessions that answers like `activities`: by start, at most one page. */
function containerWith(all: ScheduleOccurrenceEntry[]) {
  const calls: Array<{ groupIds: readonly string[]; from: Date }> = []
  const directory = {
    listOccurrences(_scope: unknown, filter: { groupIds: readonly string[] }, w: { from: Date; to: Date }) {
      calls.push({ groupIds: filter.groupIds, from: w.from })
      return Promise.resolve(
        all
          .filter((s) => filter.groupIds.includes(s.groupId) && s.startAt >= w.from && s.startAt < w.to)
          .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
          .slice(0, SCHEDULE_PAGE),
      )
    },
  }
  const container = {
    hasRegistration: (token: string) => token === 'activities.scheduleDirectory',
    resolve: () => directory,
  } as unknown as AwilixContainer
  return { container, calls }
}

describe('listOccurrences', () => {
  it('reads every session of each group past the schedule directory page', async () => {
    const minute = 60_000
    const busy = Array.from({ length: SCHEDULE_PAGE + 20 }, (_, i) =>
      session('busy', i, new Date(window.from.getTime() + i * minute)),
    )
    const quiet = [session('quiet', 0, new Date(window.from.getTime() + 5 * minute))]
    const { container, calls } = containerWith([...busy, ...quiet])

    const sessions = await listOccurrences(container, scope, ['busy', 'quiet', 'busy'], window)

    expect(sessions.filter((s) => s.groupId === 'busy')).toHaveLength(SCHEDULE_PAGE + 20)
    expect(sessions.filter((s) => s.groupId === 'quiet')).toHaveLength(1)
    expect(calls.map((call) => call.groupIds)).toEqual([['busy'], ['busy'], ['quiet']])
  })

  it('reads nothing without groups', async () => {
    const { container, calls } = containerWith([])
    expect(await listOccurrences(container, scope, [], window)).toEqual([])
    expect(calls).toHaveLength(0)
  })

  it('refuses a full page of sessions that all start at one instant rather than undercount', async () => {
    const same = Array.from({ length: SCHEDULE_PAGE }, (_, i) => session('busy', i, window.from))
    const { container } = containerWith(same)
    await expect(listOccurrences(container, scope, ['busy'], window)).rejects.toThrow('cannot page the sessions')
  })
})
