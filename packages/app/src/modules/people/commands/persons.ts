// `people.persons.create` and `people.persons.update` (foundation spec DD-F18, P-02, P-09; TEST-F01, TEST-F06). Each
// `execute` calls `authorizeScoped` first inside its write transaction; the acting role goes into the result and
// `buildLog` writes it to the log's `context.actingRole`; undo re-checks the current scope in `authorizeReplay`.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped, type AuthorizeScopedSpec } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { personCreateSchema, personUpdateSchema } from '../data/validators'
import { personPesel } from '../encryption'
import { isValidPesel } from '../lib/people-rules'
import {
  inWriteTransaction,
  isUniqueViolation,
  loadPersonLocked,
  personEvents,
  personIndexer,
  personSnapshot,
  personTarget,
  type PersonSnapshot,
} from './shared'

const RESOURCE_KIND = 'people.person'

export type PersonCommandResult = { person: Person; actingRole: ActingRole; before: PersonSnapshot | null }

/** 422 for a malformed PESEL, 409 when another live person of the organization has the same one (by hash). */
async function assertPeselAvailable(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  pesel: string,
  exceptPersonId: string | null,
): Promise<void> {
  if (!isValidPesel(pesel)) await peopleErrors.throw('pesel_invalid')
  const duplicate = await em.findOne(
    Person,
    {
      ...scope,
      deletedAt: null,
      peselHash: { $in: personPesel.lookup(pesel) },
      ...(exceptPersonId ? { id: { $ne: exceptPersonId } } : {}),
    },
    { fields: ['id'] },
  )
  if (duplicate) await peopleErrors.throw('pesel_duplicate')
}

async function mapUniqueViolation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return peopleErrors.throw('pesel_duplicate')
    throw error
  }
}

function emitPersonSideEffects(ctx: CommandRuntimeContext, person: Person, action: 'created' | 'updated' | 'deleted') {
  return emitCrudSideEffects({
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action,
    entity: person,
    identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
    events: personEvents,
    indexer: personIndexer,
  })
}

/** Replay check shared by undo of create and update: the target person, allowed grants as in `execute`. */
function personReplaySpec(
  ctx: CommandRuntimeContext,
  allowedKinds: AuthorizeScopedSpec<z.ZodType, Person>['allowedKinds'],
): AuthorizeScopedSpec<z.ZodType<{ id: string }>, Person> {
  return {
    input: z.object({ id: z.uuid() }),
    resourceKind: RESOURCE_KIND,
    allowedKinds,
    loadTarget: (parsed, em, lock) => loadPersonLocked(em, ctx, parsed.id, lock),
    resolveTarget: (_parsed, entity) => personTarget(entity as Person),
  }
}

async function authorizePersonReplay(
  ctx: CommandRuntimeContext,
  personId: string | null | undefined,
  allowedKinds: AuthorizeScopedSpec<z.ZodType, Person>['allowedKinds'],
): Promise<Person> {
  const em = ctx.transactionalEm
  if (!em || !personId) throw new Error('[internal] person replay needs the replay transaction and the person id')
  const { entity } = await authorizeScoped(personReplaySpec(ctx, allowedKinds), { id: personId }, ctx, em, {
    mode: 'replay',
  })
  return entity as Person
}

const CREATE_KINDS = ['club_admin'] as const

const createPersonCommand: CommandHandler<Record<string, unknown>, PersonCommandResult> = {
  id: 'people.persons.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await mapUniqueViolation(() =>
      inWriteTransaction(ctx, 'people.persons.create', async (em) => {
        const authorized = await authorizeScoped(
          {
            input: personCreateSchema,
            resourceKind: RESOURCE_KIND,
            allowedKinds: CREATE_KINDS,
            resolveTarget: (_parsed, _entity, scope) => ({ id, ...scope, personId: id }),
          },
          rawInput,
          ctx,
          em,
        )
        const { parsed, tenantId, organizationId } = authorized
        const pesel = parsed.pesel ?? null
        if (pesel) await assertPeselAvailable(em, { tenantId, organizationId }, pesel, null)
        const person = em.create(Person, {
          id,
          tenantId,
          organizationId,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          preferredLocale: parsed.preferredLocale ?? null,
          birthDate: parsed.birthDate ?? null,
          email: parsed.email ?? null,
          pesel,
        })
        em.persist(person)
        return { person, actingRole: authorized.actingRole, before: null }
      }),
    )
    await emitPersonSideEffects(ctx, result.person, 'created')
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.create', 'Create person'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.person.id,
      tenantId: result.person.tenantId,
      organizationId: result.person.organizationId,
      snapshotAfter: personSnapshot(result.person),
      context: { actingRole: result.actingRole },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePersonReplay(ctx, logEntry.resourceId, CREATE_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const person = await authorizePersonReplay(ctx, logEntry.resourceId, CREATE_KINDS)
    person.deletedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitCrudUndoSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'deleted',
      entity: person,
      identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
      events: personEvents,
      indexer: personIndexer,
    })
  },
}

/** Least-privileged first (DD-F08): an administrator editing her own ward is recorded as `guardian`. */
const UPDATE_KINDS = ['self', 'guardian', 'club_admin'] as const

const updatePersonCommand: CommandHandler<Record<string, unknown>, PersonCommandResult> = {
  id: 'people.persons.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await mapUniqueViolation(() =>
      inWriteTransaction(ctx, 'people.persons.update', async (em) => {
        const authorized = await authorizeScoped(
          {
            input: personUpdateSchema,
            resourceKind: RESOURCE_KIND,
            allowedKinds: UPDATE_KINDS,
            loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
            resolveTarget: (_parsed, entity) => personTarget(entity as Person),
          },
          rawInput,
          ctx,
          em,
        )
        const person = authorized.entity as Person
        const before = personSnapshot(person)
        const patch = authorized.parsed
        if (patch.firstName !== undefined) person.firstName = patch.firstName
        if (patch.lastName !== undefined) person.lastName = patch.lastName
        if (patch.preferredLocale !== undefined) person.preferredLocale = patch.preferredLocale
        if (patch.birthDate !== undefined) person.birthDate = patch.birthDate
        if (patch.email !== undefined) person.email = patch.email
        if (patch.pesel !== undefined) {
          const pesel = patch.pesel
          if (pesel) {
            await assertPeselAvailable(
              em,
              { tenantId: authorized.tenantId, organizationId: authorized.organizationId },
              pesel,
              person.id,
            )
            person.pesel = pesel
          } else {
            person.pesel = null
            person.peselHash = null
          }
        }
        person.updatedAt = new Date()
        return { person, actingRole: authorized.actingRole, before }
      }),
    )
    await emitPersonSideEffects(ctx, result.person, 'updated')
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.update', 'Update person'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.person.id,
      tenantId: result.person.tenantId,
      organizationId: result.person.organizationId,
      snapshotBefore: result.before,
      snapshotAfter: personSnapshot(result.person),
      context: { actingRole: result.actingRole },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePersonReplay(ctx, logEntry.resourceId, UPDATE_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as PersonSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing person snapshot for undo')
    const person = await authorizePersonReplay(ctx, before.id, UPDATE_KINDS)
    person.firstName = before.firstName
    person.lastName = before.lastName
    person.preferredLocale = before.preferredLocale
    person.birthDate = before.birthDate
    person.email = before.email
    person.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitCrudUndoSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'updated',
      entity: person,
      identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
      events: personEvents,
      indexer: personIndexer,
    })
  },
}

registerCommand(createPersonCommand)
registerCommand(updatePersonCommand)
