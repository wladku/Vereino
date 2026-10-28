// P-01 ScopedEntityBase (foundation spec DD-F17): the installed `WmsScopedEntity` pattern
// (`@open-mercato/core/modules/wms/data/entities.ts`) — an abstract class without `@Entity` whose properties
// carry the `@mikro-orm/decorators/legacy` column metadata; a module's `data/entities.ts` subclass adds
// `@Entity({ tableName })`, its own columns and its indexes.
//
// The column metadata is recorded with the decorators the *consumer* passes in, not with an import of
// `@mikro-orm/decorators` here: its `legacy` entry point loads the optional peer `reflect-metadata`, which only
// `packages/app` installs, and a second runtime copy of MikroORM loaded from `packages/db` would split the
// ORM's class-level registries. The consumer's own decorators record the same metadata as decorator syntax on
// the base class would.
import type { PrimaryKeyOptions, PropertyOptions } from '@mikro-orm/core'
import type { PrimaryKey, Property } from '@mikro-orm/decorators/legacy'

/** The consumer's `PrimaryKey` and `Property` from `@mikro-orm/decorators/legacy`. */
export type ColumnDecorators = {
  readonly PrimaryKey: typeof PrimaryKey
  readonly Property: typeof Property
}

/** Properties a subclass lists in `[OptionalProps]` because the database or the ORM fills them. */
export type ScopedEntityOptionalProps = 'createdAt' | 'updatedAt' | 'deletedAt'

/**
 * Standard scope and lifecycle columns of every Vereino entity: `id` (uuid, `gen_random_uuid()`),
 * `tenant_id` and `organization_id` (set only from trusted context), `created_at`, `updated_at` (the
 * optimistic-lock token, DD-F04) and `deleted_at` (soft delete). Call `decorateScopedEntityBase` before the
 * ORM discovers a subclass.
 */
export abstract class ScopedEntityBase {
  declare id: string
  declare organizationId: string
  declare tenantId: string
  createdAt: Date = new Date()
  updatedAt: Date = new Date()
  declare deletedAt?: Date | null
}

type ScopedColumnName = 'organizationId' | 'tenantId' | 'createdAt' | 'updatedAt' | 'deletedAt'

/**
 * Fresh option objects for the base columns (the decorators mutate the object they receive, so each call
 * returns new ones).
 */
export function scopedEntityColumns(): {
  id: PrimaryKeyOptions<ScopedEntityBase>
  properties: Record<ScopedColumnName, PropertyOptions<ScopedEntityBase>>
} {
  return {
    id: { type: 'uuid', defaultRaw: 'gen_random_uuid()' },
    properties: {
      organizationId: { name: 'organization_id', type: 'uuid' },
      tenantId: { name: 'tenant_id', type: 'uuid' },
      createdAt: { name: 'created_at', type: Date, onCreate: () => new Date() },
      updatedAt: { name: 'updated_at', type: Date, onUpdate: () => new Date() },
      deletedAt: { name: 'deleted_at', type: Date, nullable: true },
    },
  }
}

/**
 * Records the base columns on `ScopedEntityBase` with the consumer's decorators. Idempotent: every module's
 * `data/entities.ts` calls it once at the top, so the module setup order does not matter.
 */
export function decorateScopedEntityBase(decorators: ColumnDecorators): void {
  const prototype = ScopedEntityBase.prototype
  const columns = scopedEntityColumns()
  decorators.PrimaryKey<ScopedEntityBase>(columns.id)(prototype, 'id')
  for (const [property, options] of Object.entries(columns.properties)) {
    decorators.Property<ScopedEntityBase>(options)(prototype, property)
  }
}
