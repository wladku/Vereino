// `people.guardianships.create|update|end|set_consents` (club spec glossary *Legal guardianship* and *Consents*, *Data
// Models* → `people_guardianships`; #26). The club administrator links a guardian and a ward with the relation, the
// primary-payer flag and the consents, changes them and ends the guardianship through `valid_to` (never deleted).
// At most one primary payer per ward at a time: overlapping periods are refused with 409
// `guardianship_primary_payer_conflict` under the ward's row lock, and the partial unique index backs the open-ended
// case. A guardian of the ward (or the administrator) changes the consents through `set_consents`; the ward cannot.
// Consents follow the P-08 transitions and record who changed them and when. The `people.guardianship.*` events let
// the role sync grant `vereino_payer` to an adult guardian with an account.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { endsBefore, isInvertedPeriod, type ActingRole, type GrantKind, type Scope } from '@vereino/core'
import { authorizeScoped, foundationErrors, type AuthorizeScopedSpec } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Guardianship } from '../data/entities'
import {
  guardianshipConsentsSchema,
  guardianshipCreateSchema,
  guardianshipEndSchema,
  guardianshipUpdateSchema,
} from '../data/validators'
import {
  applyConsentChanges,
  firstOverlapping,
  parseStoredConsents,
  type ConsentChanges,
  type StoredConsents,
} from '../lib/people-rules'
import { clubToday } from '../services/club-clock'
import {
  actorPersonId,
  guardianshipEvents,
  guardianshipSnapshot,
  guardianshipTarget,
  inWriteTransaction,
  isUniqueViolation,
  loadGuardianshipLocked,
  lockPerson,
  personExists,
  type GuardianshipSnapshot,
} from './shared'

const RESOURCE_KIND = 'people.guardianship'
/** Links, flags and periods: the club administrator only. */
const MANAGE_KINDS = ['club_admin'] as const
/** Consents: a guardian of the ward or the club administrator, least-privileged first (DD-F08). */
const CONSENT_KINDS = ['guardian', 'club_admin'] as const

type ClubScope = { tenantId: string; organizationId: string }
type Period = { validFrom: string; validTo: string | null }

export type GuardianshipCommandResult = {
  guardianship: Guardianship
  actingRole: ActingRole
  before: GuardianshipSnapshot | null
}

/**
 * 409 `guardianship_primary_payer_conflict` when another live primary-payer guardianship of the ward overlaps the
 * period. The caller holds the ward's row lock (`lockPerson`), which serializes every payer write of the ward.
 */
async function assertPrimaryPayerFree(
  em: EntityManager,
  scope: ClubScope,
  wardPersonId: string,
  period: Period,
  exceptId: string | null,
): Promise<void> {
  const others = await em.find(
    Guardianship,
    {
      ...scope,
      wardPersonId,
      isPrimaryPayer: true,
      deletedAt: null,
      ...(exceptId ? { id: { $ne: exceptId } } : {}),
    },
    { fields: ['id', 'validFrom', 'validTo'] },
  )
  const periods = others.map((row) => ({ validFrom: row.validFrom, validTo: row.validTo ?? null }))
  if (firstOverlapping(period, periods)) await peopleErrors.throw('guardianship_primary_payer_conflict')
}

/** The partial unique index is the backstop of the payer rule: its violation answers the same 409. */
async function mapPayerViolation<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error: unknown) {
    if (isUniqueViolation(error)) return peopleErrors.throw('guardianship_primary_payer_conflict')
    throw error
  }
}

type ConsentChangeContext = {
  ctx: CommandRuntimeContext
  /** The caller's scope: its `self` grant names who changed the consents. */
  actorScope: Scope
  clubScope: ClubScope
  /** The guardianship's period after the command. */
  period: Period
}

/**
 * The consents after the requested changes, recorded with the acting person (P-08 transitions). A request that
 * changes something on a guardianship whose last day has passed → 409 `guardianship_ended`; a request that changes
 * nothing is accepted as it is.
 */
async function changeConsents(
  current: StoredConsents,
  changes: ConsentChanges | undefined,
  context: ConsentChangeContext,
): Promise<StoredConsents> {
  if (!changes) return current
  const result = applyConsentChanges(current, changes, new Date(), actorPersonId(context.actorScope))
  if (result.changed.length === 0) return current
  const today = await clubToday(context.ctx.container, context.clubScope)
  if (endsBefore(context.period, today)) await peopleErrors.throw('guardianship_ended')
  return result.consents
}

function emitGuardianship(ctx: CommandRuntimeContext, row: Guardianship, action: 'created' | 'updated') {
  return emitCrudSideEffects({
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action,
    entity: row,
    identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
    events: guardianshipEvents,
  })
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
  allowedKinds: readonly GrantKind[],
): AuthorizeScopedSpec<TSchema, Guardianship> {
  return {
    input,
    resourceKind: RESOURCE_KIND,
    allowedKinds,
    loadTarget: (parsed, em, lock) => loadGuardianshipLocked(em, ctx, parsed.id, lock),
    resolveTarget: (_parsed, row) => guardianshipTarget(row as Guardianship),
  }
}

async function authorizeGuardianshipReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  allowedKinds: readonly GrantKind[],
): Promise<Guardianship> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] guardianship replay needs the replay transaction and the id')
  const spec = existingSpec(z.object({ id: z.uuid() }), ctx, allowedKinds)
  const { entity } = await authorizeScoped(spec, { id }, ctx, em, { mode: 'replay' })
  return entity as Guardianship
}

async function buildGuardianshipLog(result: GuardianshipCommandResult, labelKey: string, fallback: string) {
  const { translate } = await resolveTranslations()
  const row = result.guardianship
  return {
    actionLabel: translate(labelKey, fallback),
    resourceKind: RESOURCE_KIND,
    resourceId: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    parentResourceKind: 'people.person',
    parentResourceId: row.wardPersonId,
    snapshotBefore: result.before,
    snapshotAfter: guardianshipSnapshot(row),
    context: { actingRole: result.actingRole },
  }
}

/**
 * Undo of an update or an end restores the relation, the payer flag, the consents and the period (the payer rule is
 * checked again); undo of a consent change restores the consents only.
 */
function restoreGuardianship(allowedKinds: readonly GrantKind[], restores: 'all' | 'consents') {
  return async (ctx: CommandRuntimeContext, before: GuardianshipSnapshot | null | undefined): Promise<void> => {
    if (!before?.id) throw new Error('[internal] missing guardianship snapshot for undo')
    const row = await authorizeGuardianshipReplay(ctx, before.id, allowedKinds)
    const em = ctx.transactionalEm as EntityManager
    if (restores === 'all') {
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      const period = { validFrom: before.validFrom, validTo: before.validTo }
      await lockPerson(em, scope, row.wardPersonId)
      if (before.isPrimaryPayer) await assertPrimaryPayerFree(em, scope, row.wardPersonId, period, row.id)
      row.relation = before.relation
      row.isPrimaryPayer = before.isPrimaryPayer
      row.validFrom = period.validFrom
      row.validTo = period.validTo
    }
    row.consents = parseStoredConsents(before.consents)
    row.updatedAt = new Date()
    await mapPayerViolation(() => em.flush())
    await emitCrudUndoSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'updated',
      entity: row,
      identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
      events: guardianshipEvents,
    })
  }
}

const restoreManaged = restoreGuardianship(MANAGE_KINDS, 'all')
const restoreConsents = restoreGuardianship(CONSENT_KINDS, 'consents')

const createGuardianshipCommand: CommandHandler<Record<string, unknown>, GuardianshipCommandResult> = {
  id: 'people.guardianships.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await mapPayerViolation(() =>
      inWriteTransaction(ctx, 'people.guardianships.create', async (em) => {
        const authorized = await authorizeScoped(
          {
            input: guardianshipCreateSchema,
            resourceKind: RESOURCE_KIND,
            allowedKinds: MANAGE_KINDS,
            resolveTarget: (parsed, _entity, scope) => ({ id, ...scope, personId: parsed.wardPersonId }),
          },
          rawInput,
          ctx,
          em,
        )
        const { parsed, tenantId, organizationId } = authorized
        if (parsed.guardianPersonId === parsed.wardPersonId) await peopleErrors.throw('guardianship_self')
        const scope = { tenantId, organizationId }
        // The ward's row lock serializes the primary-payer check of concurrent writes for the same ward.
        const wardExists = await lockPerson(em, scope, parsed.wardPersonId)
        if (!wardExists || !(await personExists(em, scope, parsed.guardianPersonId))) {
          const { translate } = await resolveTranslations()
          throw notFound(translate('foundation.errors.not_found', 'Not found'))
        }
        const period = { validFrom: parsed.validFrom, validTo: parsed.validTo ?? null }
        if (parsed.isPrimaryPayer) await assertPrimaryPayerFree(em, scope, parsed.wardPersonId, period, null)
        const consents = await changeConsents({}, parsed.consents, {
          ctx,
          actorScope: authorized.scope,
          clubScope: scope,
          period,
        })
        const guardianship = em.create(Guardianship, {
          id,
          tenantId,
          organizationId,
          guardianPersonId: parsed.guardianPersonId,
          wardPersonId: parsed.wardPersonId,
          relation: parsed.relation,
          isPrimaryPayer: parsed.isPrimaryPayer,
          consents,
          validFrom: period.validFrom,
          validTo: period.validTo,
        })
        em.persist(guardianship)
        return { guardianship, actingRole: authorized.actingRole, before: null }
      }),
    )
    await emitGuardianship(ctx, result.guardianship, 'created')
    return result
  },
  buildLog: ({ result }) => buildGuardianshipLog(result, 'people.audit.guardianships.create', 'Add a guardianship'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGuardianshipReplay(ctx, logEntry.resourceId, MANAGE_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeGuardianshipReplay(ctx, logEntry.resourceId, MANAGE_KINDS)
    row.deletedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitCrudUndoSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'deleted',
      entity: row,
      identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
      events: guardianshipEvents,
    })
  },
}

const updateGuardianshipCommand: CommandHandler<Record<string, unknown>, GuardianshipCommandResult> = {
  id: 'people.guardianships.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await mapPayerViolation(() =>
      inWriteTransaction(ctx, 'people.guardianships.update', async (em) => {
        const spec = existingSpec(guardianshipUpdateSchema, ctx, MANAGE_KINDS)
        const authorized = await authorizeScoped(spec, rawInput, ctx, em)
        const row = authorized.entity as Guardianship
        const before = guardianshipSnapshot(row)
        const patch = authorized.parsed
        const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
        const period = {
          validFrom: patch.validFrom ?? row.validFrom,
          validTo: patch.validTo !== undefined ? patch.validTo : (row.validTo ?? null),
        }
        if (isInvertedPeriod(period.validFrom, period.validTo)) await foundationErrors.throw('validity_inverted')
        const isPrimaryPayer = patch.isPrimaryPayer ?? row.isPrimaryPayer
        await lockPerson(em, scope, row.wardPersonId)
        if (isPrimaryPayer) await assertPrimaryPayerFree(em, scope, row.wardPersonId, period, row.id)
        const consents = await changeConsents(before.consents, patch.consents, {
          ctx,
          actorScope: authorized.scope,
          clubScope: scope,
          period,
        })
        if (patch.relation !== undefined) row.relation = patch.relation
        row.isPrimaryPayer = isPrimaryPayer
        row.consents = consents
        row.validFrom = period.validFrom
        row.validTo = period.validTo
        row.updatedAt = new Date()
        return { guardianship: row, actingRole: authorized.actingRole, before }
      }),
    )
    await emitGuardianship(ctx, result.guardianship, 'updated')
    return result
  },
  buildLog: ({ result }) => buildGuardianshipLog(result, 'people.audit.guardianships.update', 'Change a guardianship'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGuardianshipReplay(ctx, logEntry.resourceId, MANAGE_KINDS)
  },
  async undo({ ctx, logEntry }) {
    await restoreManaged(ctx, logEntry.snapshotBefore as GuardianshipSnapshot | null | undefined)
  },
}

/** Ends a guardianship: `valid_to` becomes its last active day (default: today in the club zone). */
const endGuardianshipCommand: CommandHandler<Record<string, unknown>, GuardianshipCommandResult> = {
  id: 'people.guardianships.end',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.guardianships.end', async (em) => {
      const spec = existingSpec(guardianshipEndSchema, ctx, MANAGE_KINDS)
      const authorized = await authorizeScoped(spec, rawInput, ctx, em)
      const row = authorized.entity as Guardianship
      const before = guardianshipSnapshot(row)
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const validTo = authorized.parsed.validTo ?? (await clubToday(ctx.container, scope))
      if (isInvertedPeriod(row.validFrom, validTo)) await foundationErrors.throw('validity_inverted')
      row.validTo = validTo
      row.updatedAt = new Date()
      return { guardianship: row, actingRole: authorized.actingRole, before }
    })
    await emitGuardianship(ctx, result.guardianship, 'updated')
    return result
  },
  buildLog: ({ result }) => buildGuardianshipLog(result, 'people.audit.guardianships.end', 'End a guardianship'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGuardianshipReplay(ctx, logEntry.resourceId, MANAGE_KINDS)
  },
  async undo({ ctx, logEntry }) {
    await restoreManaged(ctx, logEntry.snapshotBefore as GuardianshipSnapshot | null | undefined)
  },
}

/**
 * A guardian of the ward or the club administrator grants or withdraws consents (club spec glossary *Consents*): the
 * ward, a coordinator and a former guardian get 403 `scope_denied`; the acting role (`guardian` or `club_admin`) goes
 * into the log.
 */
const setConsentsCommand: CommandHandler<Record<string, unknown>, GuardianshipCommandResult> = {
  id: 'people.guardianships.set_consents',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.guardianships.set_consents', async (em) => {
      const spec = existingSpec(guardianshipConsentsSchema, ctx, CONSENT_KINDS)
      const authorized = await authorizeScoped(spec, rawInput, ctx, em)
      const row = authorized.entity as Guardianship
      const before = guardianshipSnapshot(row)
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      row.consents = await changeConsents(before.consents, authorized.parsed.consents, {
        ctx,
        actorScope: authorized.scope,
        clubScope: scope,
        period: { validFrom: row.validFrom, validTo: row.validTo ?? null },
      })
      row.updatedAt = new Date()
      return { guardianship: row, actingRole: authorized.actingRole, before }
    })
    await emitGuardianship(ctx, result.guardianship, 'updated')
    return result
  },
  buildLog: ({ result }) =>
    buildGuardianshipLog(result, 'people.audit.guardianships.set_consents', 'Change the consents'),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGuardianshipReplay(ctx, logEntry.resourceId, CONSENT_KINDS)
  },
  async undo({ ctx, logEntry }) {
    await restoreConsents(ctx, logEntry.snapshotBefore as GuardianshipSnapshot | null | undefined)
  },
}

registerCommand(createGuardianshipCommand)
registerCommand(updateGuardianshipCommand)
registerCommand(endGuardianshipCommand)
registerCommand(setConsentsCommand)
