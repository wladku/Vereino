// P-28 AppendOnlyEntityBase (foundation II DD-G11): the base of a row that is written once and never changed — an
// audited read's log (#34), later case entries, substitutions and handovers. It carries `id`, `tenant_id`,
// `organization_id` and `created_at` only: no `updated_at` (nothing to lock) and no `deleted_at` (nothing to hide).
// The `foundation` guard refuses an update or a delete of a subclass's row with 409 `append_only`; only a migration
// removes rows. Like `ScopedEntityBase`, the column metadata is recorded with the consumer's decorators.
import type { PrimaryKeyOptions, PropertyOptions } from '@mikro-orm/core'
import type { ColumnDecorators } from '#src/scoped-entity'

/** Properties a subclass lists in `[OptionalProps]` because the database or the ORM fills them. */
export type AppendOnlyEntityOptionalProps = 'createdAt'

/**
 * The marker the guard reads: a registry-wide symbol on the base prototype, so a row is recognised even when this
 * package is loaded twice (a bundler or `tsx` may load two copies, where `instanceof` would silently fail).
 */
export const APPEND_ONLY_MARKER = Symbol.for('vereino.appendOnly')

/** Scope and creation columns of an append-only row. Call `decorateAppendOnlyEntityBase` before discovery. */
export abstract class AppendOnlyEntityBase {
  declare id: string
  declare organizationId: string
  declare tenantId: string
  createdAt: Date = new Date()
}

Object.defineProperty(AppendOnlyEntityBase.prototype, APPEND_ONLY_MARKER, { value: true })

type AppendOnlyColumnName = 'organizationId' | 'tenantId' | 'createdAt'

/** Fresh option objects for the base columns (the decorators mutate the object they receive). */
export function appendOnlyEntityColumns(): {
  id: PrimaryKeyOptions<AppendOnlyEntityBase>
  properties: Record<AppendOnlyColumnName, PropertyOptions<AppendOnlyEntityBase>>
} {
  return {
    id: { type: 'uuid', defaultRaw: 'gen_random_uuid()' },
    properties: {
      organizationId: { name: 'organization_id', type: 'uuid' },
      tenantId: { name: 'tenant_id', type: 'uuid' },
      createdAt: { name: 'created_at', type: Date, onCreate: () => new Date() },
    },
  }
}

/** Records the base columns on `AppendOnlyEntityBase` with the consumer's decorators. Idempotent. */
export function decorateAppendOnlyEntityBase(decorators: ColumnDecorators): void {
  const prototype = AppendOnlyEntityBase.prototype
  const columns = appendOnlyEntityColumns()
  decorators.PrimaryKey<AppendOnlyEntityBase>(columns.id)(prototype, 'id')
  for (const [property, options] of Object.entries(columns.properties)) {
    decorators.Property<AppendOnlyEntityBase>(options)(prototype, property)
  }
}

/** Whether an entity instance is an append-only row (the guard's test). */
export function isAppendOnlyEntity(entity: unknown): entity is AppendOnlyEntityBase {
  return (
    typeof entity === 'object' && entity !== null && (entity as Record<symbol, unknown>)[APPEND_ONLY_MARKER] === true
  )
}
