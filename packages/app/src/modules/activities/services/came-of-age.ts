// A participant came of age (people life-cycle spec *Events* row `people.person.came_of_age`, *Domain Vocabulary* →
// "Pending confirmation at 18"; phase L8, #310): from the 18th birthday nobody confirms the person's declarations any
// more, so a `pending_guardian` declaration of a session on or after the birthday becomes final with the person's own
// answer. Earlier sessions keep their state (a guardian may still decide them, or the timeout default applies). Each
// moved row emits `activities.attendance.guardian_decided` (not by timeout, no actor). Idempotent: only rows still
// pending move.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { advanceWhere } from '@/modules/foundation'
import { Attendance, Occurrence } from '../data/entities'
import { emitActivitiesEvent } from '../events'
import { declarationTransitions } from '../lib/policy'
import type { ActivitiesScope } from './directory'

/** Makes the person's pending declarations of sessions from `birthday` on final; the number of rows moved. */
export async function finalizeDeclarationsFromBirthday(
  container: AwilixContainer,
  scope: ActivitiesScope,
  input: { personId: string; birthday: string },
  now: Date = new Date(),
): Promise<number> {
  const em = container.resolve<EntityManager>('em').fork()
  const pending = await em.find(
    Attendance,
    { ...scope, personId: input.personId, declarationStatus: 'pending_guardian', deletedAt: null },
    { fields: ['id', 'occurrenceId'] },
  )
  if (pending.length === 0) return 0
  const occurrences = await em.find(
    Occurrence,
    {
      ...scope,
      id: { $in: [...new Set(pending.map((row) => row.occurrenceId))] },
      occurrenceDate: { $gte: input.birthday },
    },
    { fields: ['id'] },
  )
  if (occurrences.length === 0) return 0
  const occurrenceIds = occurrences.map((occurrence) => occurrence.id)
  const moved = await em.transactional((tx) =>
    advanceWhere(tx, Attendance, {
      transitions: declarationTransitions,
      statusField: 'declarationStatus',
      where: { ...scope, personId: input.personId, occurrenceId: { $in: occurrenceIds }, deletedAt: null },
      from: 'pending_guardian',
      to: 'final',
      set: { updatedAt: now, pendingUntil: null, timeoutOutcome: null },
    }),
  )
  if (moved.length === 0) return 0
  const rows = await em.fork().find(Attendance, { ...scope, id: { $in: moved } })
  for (const row of rows) {
    await emitActivitiesEvent(
      'activities.attendance.guardian_decided',
      {
        id: row.id,
        occurrenceId: row.occurrenceId,
        personId: row.personId,
        declared: row.declared,
        declarationStatus: row.declarationStatus,
        byTimeout: false,
        actorUserId: null,
        undo: false,
        ...scope,
      },
      { persistent: true, ...scope },
    )
  }
  return moved.length
}
