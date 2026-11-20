// Erasure and removal (people life-cycle spec REQ-L05, DD-L06, DD-L07, *API* rows `people.persons.anonymize` and
// `people.persons.delete`; J-L04; phase L6, #308).
//
// `people.persons.anonymize` — the club administrator (feature `people.persons.anonymize`, `club_admin` grant)
// anonymises a person who left, on a recorded erasure request, after typing the last name. Refused with 409
// `anonymize_blocked` and the reasons unless the person left, the account is closed, no charge names them as debtor or
// payer while open, they hold no cash, no guardianship is active and the request is recorded; 422
// `confirmation_mismatch` for another last name. Contact and identity data go at once; the name stays while a payment
// is under the retention hold (`erasure_hold_until`, from `payments`), and the daily job clears it after (step 5).
// The request becomes `done`. Not undoable; the audit entry carries ids, dates and counts, never the erased values.
// After the commit: `people.person.anonymized` (the `facilities` subscriber clears rental contact snapshots), the
// person reindexed, and the photo files released.
//
// `people.persons.delete` — a person created by mistake, with no history in `people` or in any contributor
// (`hasHistory`), is soft-deleted; `people.person.deleted` is emitted for the first time. 409 `person_in_use` with the
// reasons otherwise. Undoable: the undo restores the row (409 `pesel_duplicate` / `external_id_duplicate` when another
// person took the PESEL or the identifier meanwhile).
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import type { ActingRole, CalendarDate } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { personAnonymizeSchema, personDeleteSchema } from '../data/validators'
import { emitPeopleEvent } from '../events'
import { anonymizeBlockers, lastNameConfirmed, nameKeptUntil, personInUseReasons } from '../lib/erasure-rules'
import { clubToday } from '../services/club-clock'
import {
  activeGuardianshipCount,
  erasePersonData,
  erasureRequest,
  modulesWithHistory,
  ownHistory,
  paymentNotices,
  photoFileIds,
  releasePhotoFiles,
  retentionHold,
  type ErasureCounts,
} from '../services/erasure'
import { inWriteTransaction, isUniqueViolation, loadPersonLocked, personEvents, personIndexer, personTarget } from './shared'

const logger = createLogger('people').child({ component: 'erasure' })

const RESOURCE_KIND = 'people.person'
const MANAGE_KINDS = ['club_admin'] as const

export type AnonymizeCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  requestId: string
  anonymizedAt: string
  erasureHoldUntil: CalendarDate | null
  counts: ErasureCounts
  photoFiles: { released: number; kept: number }
  actingRole: ActingRole
}

function dataEngineOf(ctx: CommandRuntimeContext): DataEngine {
  return ctx.container.resolve<DataEngine>('dataEngine')
}

function identifiersOf(person: Person) {
  return { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId }
}

const anonymizeCommand: CommandHandler<Record<string, unknown>, AnonymizeCommandResult> = {
  id: 'people.persons.anonymize',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'people.persons.anonymize', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: personAnonymizeSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
          resolveTarget: (_parsed, entity) => personTarget(entity as Person),
        },
        rawInput,
        ctx,
        em,
      )
      const person = authorized.entity as Person
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const input = authorized.parsed
      const today = await clubToday(ctx.container, scope)
      const [request, activeGuardianships, notices] = await Promise.all([
        erasureRequest(em, scope, person.id, input.requestId),
        activeGuardianshipCount(em, scope, person.id, today),
        paymentNotices(em, ctx.container, scope, person.id, today),
      ])
      const reasons = anonymizeBlockers(
        {
          leftOn: person.leftOn ?? null,
          anonymizedAt: person.anonymizedAt ?? null,
          hasAccount: Boolean(person.userId),
          activeGuardianships,
          requestRecorded: request !== null,
          contributorNotices: notices,
        },
        today,
      )
      if (reasons.length > 0) return peopleErrors.throw('anonymize_blocked', { reasons })
      if (!lastNameConfirmed(input.confirmLastName, person.lastName)) {
        return peopleErrors.throw('confirmation_mismatch', { field: 'confirmLastName' })
      }
      const keepNameUntil = nameKeptUntil(await retentionHold(em, ctx.container, scope, person.id), today)
      const photoIds = await photoFileIds(ctx.container, scope, person.id, person.photoAttachmentId ?? null)
      const counts = await erasePersonData(em, scope, person, keepNameUntil, now)
      if (request && request.status === 'open') {
        request.status = 'done'
        request.decidedAt = now
        request.updatedAt = now
      }
      return { person, request: request!, keepNameUntil, counts, photoIds, actingRole: authorized.actingRole }
    })
    const { person } = result
    const scope = { tenantId: person.tenantId, organizationId: person.organizationId }
    // The reindex rebuilds the search tokens from the stored name: empty when it was cleared; a name kept under the
    // hold is dropped from every Vereino name search by `anonymized_at` (`searchPersonIds`).
    await emitCrudSideEffects({
      dataEngine: dataEngineOf(ctx),
      action: 'updated',
      entity: person,
      identifiers: identifiersOf(person),
      events: personEvents,
      indexer: personIndexer,
    })
    await emitPeopleEvent('people.person.anonymized', { id: person.id, ...scope }, { persistent: true, ...scope })
    let photoFiles = { released: 0, kept: 0 }
    try {
      photoFiles = await releasePhotoFiles(ctx.container, scope, person.id, result.photoIds)
    } catch (error: unknown) {
      photoFiles = { released: 0, kept: result.photoIds.length }
      logger.warn('Releasing the photo files of an anonymised person failed', { ...scope, err: error })
      getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.erasure.photo_release_failed' })
    }
    return {
      personId: person.id,
      ...scope,
      requestId: result.request.id,
      anonymizedAt: (person.anonymizedAt as Date).toISOString(),
      erasureHoldUntil: result.keepNameUntil,
      counts: result.counts,
      photoFiles,
      actingRole: result.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.anonymize', 'Anonymise a former person'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: {
        actingRole: result.actingRole,
        requestId: result.requestId,
        anonymizedAt: result.anonymizedAt,
        erasureHoldUntil: result.erasureHoldUntil,
        ...result.counts,
        photoFilesReleased: result.photoFiles.released,
        photoFilesKept: result.photoFiles.kept,
      },
    }
  },
}

export type DeletePersonCommandResult = {
  personId: string
  tenantId: string
  organizationId: string
  actingRole: ActingRole
}

async function loadDeletable(ctx: CommandRuntimeContext, em: EntityManager, rawInput: unknown, mode: 'execute' | 'replay') {
  return authorizeScoped(
    {
      input: personDeleteSchema,
      resourceKind: RESOURCE_KIND,
      allowedKinds: MANAGE_KINDS,
      loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
      resolveTarget: (_parsed, entity) => personTarget(entity as Person),
    },
    rawInput,
    ctx,
    em,
    { mode },
  )
}

const deletePersonCommand: CommandHandler<Record<string, unknown>, DeletePersonCommandResult> = {
  id: 'people.persons.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.persons.delete', async (em) => {
      const authorized = await loadDeletable(ctx, em, rawInput, 'execute')
      const person = authorized.entity as Person
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const reasons = personInUseReasons(
        await ownHistory(em, scope, person),
        await modulesWithHistory(em, ctx.container, scope, person.id),
      )
      if (reasons.length > 0) return peopleErrors.throw('person_in_use', { reasons })
      person.deletedAt = new Date()
      person.updatedAt = new Date()
      return { person, actingRole: authorized.actingRole }
    })
    const { person } = result
    await emitCrudSideEffects({
      dataEngine: dataEngineOf(ctx),
      action: 'deleted',
      entity: person,
      identifiers: identifiersOf(person),
      events: personEvents,
      indexer: personIndexer,
    })
    return {
      personId: person.id,
      tenantId: person.tenantId,
      organizationId: person.organizationId,
      actingRole: result.actingRole,
    }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.delete', 'Delete person'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.personId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      snapshotBefore: { id: result.personId, deleted: false },
      context: { actingRole: result.actingRole },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await loadDeletedPerson(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const em = ctx.transactionalEm
    const person = await loadDeletedPerson(ctx, logEntry.resourceId)
    if (!em || !person.deletedAt) return
    person.deletedAt = null
    person.updatedAt = new Date()
    try {
      await em.flush()
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error
      const external = error instanceof Error && error.message.includes('external_id_hash')
      await peopleErrors.throw(external ? 'external_id_duplicate' : 'pesel_duplicate')
    }
    await emitCrudUndoSideEffects({
      dataEngine: dataEngineOf(ctx),
      action: 'created',
      entity: person,
      identifiers: identifiersOf(person),
      events: personEvents,
      indexer: personIndexer,
    })
  },
}

/**
 * The undo's target: the soft-deleted person of the trusted tenant. The replay check runs on the club the person
 * belongs to with the delete's own grant (`club_admin`), so a deleted row cannot be restored from outside the club.
 */
async function loadDeletedPerson(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<Person> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] person delete replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    {
      input: personDeleteSchema,
      resourceKind: RESOURCE_KIND,
      allowedKinds: MANAGE_KINDS,
      loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock, false, true),
      resolveTarget: (_parsed, target) => personTarget(target as Person),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Person
}

registerCommand(anonymizeCommand)
registerCommand(deletePersonCommand)
