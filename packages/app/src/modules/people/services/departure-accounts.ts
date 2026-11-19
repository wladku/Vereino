// The accounts of persons who left close the day after their last day (people life-cycle spec Q-L09, *Events, Jobs*
// step 4 "Dated departures"; phase L4, #306). The daily life-cycle job (`people.persons.life_cycle`, phase L8, #310)
// runs it as its step 4; the daily role sync (`people.persons.sync_roles`) keeps running it too, because an existing
// club gets the life-cycle schedule only after its confirmed first run (*Rollout*): for every person with
// `left_on` before `today` and an account, the platform user is deleted (`auth.users.delete` through the foundation),
// the link is cleared and `people.person.account_closed` is emitted. Idempotent: a closed account has no `user_id`.
// One person's failure is logged and retried on the next run.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import type { CalendarDate } from '@vereino/core'
import { closeAccount } from '@/modules/foundation'
import { Person } from '../data/entities'
import { emitPeopleEvent } from '../events'
import { personEvents, personIndexer } from '../commands/shared'
import type { ClubScope } from './club-clock'

export type DepartedAccountCounts = { closed: number; failed: number }

export async function closeDepartedAccounts(
  ctx: CommandRuntimeContext,
  scope: ClubScope,
  today: CalendarDate,
  onFailure?: (error: unknown) => void,
): Promise<DepartedAccountCounts> {
  const counts: DepartedAccountCounts = { closed: 0, failed: 0 }
  const reader = ctx.container.resolve<EntityManager>('em').fork()
  const persons = await reader.find(
    Person,
    { ...scope, deletedAt: null, userId: { $ne: null }, leftOn: { $lt: today } },
    { fields: ['id', 'userId'], orderBy: { id: 'asc' } },
  )
  for (const candidate of persons) {
    const userId = candidate.userId as string
    try {
      await closeAccount(ctx, userId)
      const em = ctx.container.resolve<EntityManager>('em').fork()
      const person = await em.findOne(Person, { id: candidate.id, ...scope, deletedAt: null })
      if (person && person.userId === userId) {
        person.userId = null
        person.updatedAt = new Date()
        await em.flush()
        await emitCrudSideEffects({
          dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
          action: 'updated',
          entity: person,
          identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
          events: personEvents,
          indexer: personIndexer,
        })
      }
      await emitPeopleEvent(
        'people.person.account_closed',
        { id: candidate.id, ...scope, userId },
        { persistent: true, ...scope },
      )
      counts.closed += 1
    } catch (error: unknown) {
      counts.failed += 1
      onFailure?.(error)
    }
  }
  return counts
}
