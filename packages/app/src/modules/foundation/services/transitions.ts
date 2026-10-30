// P-25 services (foundation II DD-G04, DD-G14): `assertTransition` — a command asks its module's transition table
// before it writes a status and answers 409 `invalid_transition` naming both states when the table refuses the move —
// and `advanceWhere` — the job-driven half of the same primitive: one conditional UPDATE per candidate row, which
// moves only the rows still in `from` and returns the ids it changed, so a retried job re-emits nothing (its first
// consumer is the expiry of guardian confirmations, #32).
import type { EntityClass, EntityData, FilterQuery } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { Transitions } from '@vereino/core'
import { foundationErrors } from '../api/errors'

export async function assertTransition<TState extends string>(
  transitions: Transitions<TState>,
  from: string,
  to: string,
): Promise<void> {
  if (!transitions.canTransition(from, to)) await foundationErrors.throw('invalid_transition', { from, to })
}

/** A versioned, scoped row `advanceWhere` moves; its status column is named by the spec (`status` by default). */
export type AdvanceableEntity = {
  id: string
  tenantId: string
  organizationId: string
  updatedAt: Date
}

export type AdvanceWhereSpec<TEntity extends AdvanceableEntity, TState extends string> = {
  /** The transition table the move must be allowed by (a programming error otherwise, not a 409). */
  transitions: Transitions<TState>
  /** The status property of the entity; `status` when omitted (`declarationStatus` for attendance rows). */
  statusField?: string & keyof TEntity
  /** The candidate rows; the tenant and organization are mandatory, so a job never crosses a club. */
  where: FilterQuery<TEntity> & { tenantId: string; organizationId: string }
  from: TState
  to: TState
  /** Columns written with the new status; `updatedAt` (the lock token) is a type-level requirement. */
  set: Partial<EntityData<TEntity>> & { updatedAt: Date }
}

/**
 * Selects the ids of the rows matching `where` that are still in `from`, then updates each one with
 * `status = to, …set` where the whole `where` and `status = from` still hold, and returns the ids whose row changed.
 * A row another command changed between the select and the update — moved to another status, or re-entered `from`
 * with values that no longer match `where` (a fresh deadline) — is skipped (0 rows affected), so a concurrent decision
 * wins and a retry of the job changes nothing. The caller — a module command — emits its events for the returned ids
 * after commit.
 */
export async function advanceWhere<TEntity extends AdvanceableEntity, TState extends string>(
  em: EntityManager,
  Entity: EntityClass<TEntity>,
  spec: AdvanceWhereSpec<TEntity, TState>,
): Promise<string[]> {
  if (!spec.transitions.canTransition(spec.from, spec.to)) {
    throw new RangeError(`[internal] advanceWhere: the table refuses ${spec.from} → ${spec.to}`)
  }
  const statusField = spec.statusField ?? 'status'
  const stillFrom = { [statusField]: spec.from }
  const candidates = await em.find(Entity, { ...(spec.where as object), ...stillFrom } as FilterQuery<TEntity>, {
    fields: ['id'] as never,
    orderBy: { id: 'asc' } as never,
  })
  const changed: string[] = []
  for (const candidate of candidates) {
    const affected = await em.nativeUpdate(
      Entity,
      {
        ...(spec.where as object),
        id: candidate.id,
        tenantId: spec.where.tenantId,
        organizationId: spec.where.organizationId,
        ...stillFrom,
      } as FilterQuery<TEntity>,
      { ...spec.set, [statusField]: spec.to },
    )
    if (affected === 1) changed.push(candidate.id)
  }
  return changed
}
