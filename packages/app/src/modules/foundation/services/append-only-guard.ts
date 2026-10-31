// P-28 wiring (foundation II DD-G11): registers the `append_only` guard on an EntityManager's event manager — the
// platform gives every request container its own `em` with a fresh event manager, so `di.ts` registers it per
// container; forks and transactions of that `em` share or clone the event manager and keep the guard. Registering
// twice on the same event manager is a no-op.
import type { EntityManager, EventSubscriber } from '@mikro-orm/core'
import { isAppendOnlyEntity } from '@vereino/db'
import { foundationErrors } from '../api/errors'
import { appendOnlyGuard } from '../lib/append-only'

const guarded = new WeakSet<object>()

export function registerAppendOnlyGuard(em: Pick<EntityManager, 'getEventManager'> | null | undefined): void {
  const eventManager = em?.getEventManager()
  if (!eventManager || guarded.has(eventManager)) return
  const guard: EventSubscriber = appendOnlyGuard({
    isAppendOnly: isAppendOnlyEntity,
    refuse: (violation) => foundationErrors.throw('append_only', { operation: violation.operation }),
  })
  eventManager.registerSubscriber(guard)
  guarded.add(eventManager)
}
