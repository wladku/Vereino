// The declarations of a member who no longer belongs to a group (people life-cycle spec *Events* row
// `groups.membership.updated` with an end date, REQ-L11 subscriber part; phase L4, #306): after a membership of the
// group ends (a departure, a roster end or a removal), the person's attendance rows without an actual mark for the
// group's sessions from today on that no live membership of the person in the group covers any more are dropped
// (soft delete), so the coach's list and the guardian's calendar stop showing the child. Rows the coach marked stay as
// history. Idempotent: it re-reads the memberships and only drops what is uncovered.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Attendance, Occurrence } from '../data/entities'
import { clubClock, membershipsOf, type ActivitiesScope } from './directory'

/** The open end of the membership window read here (memberships are dated, this only bounds the query). */
const FAR_FUTURE = '9999-12-31'

/** Drops the uncovered undecided rows of `personId` in `groupId`; the number of rows dropped. */
export async function dropUncoveredDeclarations(
  container: AwilixContainer,
  scope: ActivitiesScope,
  membership: { groupId: string; personId: string },
  now: Date = new Date(),
): Promise<number> {
  const { today } = await clubClock(container, scope, now)
  const em = container.resolve<EntityManager>('em').fork()
  const periods = (
    await membershipsOf(container, scope, [membership.personId], { from: today, to: FAR_FUTURE }, em)
  ).filter((period) => period.groupId === membership.groupId)
  const occurrences = await em.find(
    Occurrence,
    { ...scope, groupId: membership.groupId, occurrenceDate: { $gte: today }, deletedAt: null },
    { fields: ['id', 'occurrenceDate'] },
  )
  const uncovered = occurrences
    .filter(
      (occurrence) =>
        !periods.some(
          (period) =>
            period.validFrom <= occurrence.occurrenceDate &&
            (period.validTo === null || period.validTo >= occurrence.occurrenceDate),
        ),
    )
    .map((occurrence) => occurrence.id)
  if (uncovered.length === 0) return 0
  const droppedAt = new Date()
  return em.nativeUpdate(
    Attendance,
    {
      ...scope,
      personId: membership.personId,
      occurrenceId: { $in: uncovered },
      actual: null,
      deletedAt: null,
    },
    { deletedAt: droppedAt, updatedAt: droppedAt },
  )
}
