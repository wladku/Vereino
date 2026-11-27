// The owners' events of an acceptance (sign-up form spec DD-J10; phase 3, #800). `enrolment.applications.accept` runs
// `people.persons.create` and `people.guardianships.create` nested in its own transaction with the import's
// suppression (`bulkImport: { skipEvents, skipReindex }`, the pattern of `people/commands/imports.ts`), so the events
// role sync, payments, activities and search rely on would otherwise never fire. After the commit they are emitted here
// with the published payloads of `people` (ids only for a person; the guardian and ward ids for a guardianship,
// `BACKWARD_COMPATIBILITY.md` → event payloads) and the person's reindex — `enrolment` cannot import `people`'s
// internals (S4.3). The memberships' events come from `groups` itself (`groups.membershipImporter.emitSideEffects`).
import type { AwilixContainer } from 'awilix'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'

/** The query-index entity of a person (`people/encryption.ts` `PERSON_ENTITY_ID`). */
const PERSON_ENTITY_ID = 'people:person'

type Ids = { id: string; tenantId: string; organizationId: string }

type GuardianshipRow = Ids & { guardianPersonId: string; wardPersonId: string }

const idsOnly = (ctx: { identifiers: { id: string; tenantId: string | null; organizationId: string | null } }) => ({
  id: ctx.identifiers.id,
  tenantId: ctx.identifiers.tenantId,
  organizationId: ctx.identifiers.organizationId,
})

/** `people.person.created` with the person's reindex. */
export async function emitPersonCreated(container: AwilixContainer, person: Ids): Promise<void> {
  await emitCrudSideEffects({
    dataEngine: container.resolve<DataEngine>('dataEngine'),
    action: 'created',
    entity: person,
    identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
    events: { module: 'people', entity: 'person', persistent: true, buildPayload: idsOnly },
    indexer: {
      entityType: PERSON_ENTITY_ID,
      buildUpsertPayload: (ctx) => ({ entityType: PERSON_ENTITY_ID, recordId: ctx.identifiers.id, ...idsOnly(ctx) }),
      buildDeletePayload: (ctx) => ({ entityType: PERSON_ENTITY_ID, recordId: ctx.identifiers.id, ...idsOnly(ctx) }),
    },
  })
}

/** `people.guardianship.created` with the guardian and ward ids. */
const guardianshipEvents: CrudEventsConfig<GuardianshipRow> = {
  module: 'people',
  entity: 'guardianship',
  persistent: true,
  buildPayload: (ctx) => ({
    ...idsOnly(ctx),
    guardianPersonId: ctx.entity.guardianPersonId,
    wardPersonId: ctx.entity.wardPersonId,
  }),
}

export async function emitGuardianshipCreated(container: AwilixContainer, row: GuardianshipRow): Promise<void> {
  await emitCrudSideEffects({
    dataEngine: container.resolve<DataEngine>('dataEngine'),
    action: 'created',
    entity: row,
    identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
    events: guardianshipEvents,
  })
}
