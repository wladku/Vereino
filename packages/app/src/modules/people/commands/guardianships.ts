// `people.guardianships.create` (club spec *Legal guardianship*): phase A1 stores only what the guardian grant and the
// payer rule need; #27 adds the relation, the primary payer and the consents. The `people.guardianship.*` events let
// the role sync grant `vereino_payer` to an adult guardian with an account.
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Guardianship } from '../data/entities'
import { guardianshipCreateSchema } from '../data/validators'
import {
  guardianshipEvents,
  guardianshipTarget,
  inWriteTransaction,
  loadGuardianshipLocked,
  personExists,
} from './shared'

const RESOURCE_KIND = 'people.guardianship'
const ALLOWED_KINDS = ['club_admin'] as const

export type GuardianshipCommandResult = { guardianship: Guardianship; actingRole: ActingRole }

async function authorizeGuardianshipReplay(ctx: CommandRuntimeContext, id: string | null | undefined) {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] guardianship replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: RESOURCE_KIND,
      allowedKinds: ALLOWED_KINDS,
      loadTarget: (parsed, txEm, lock) => loadGuardianshipLocked(txEm, ctx, parsed.id, lock),
      resolveTarget: (_parsed, row) => guardianshipTarget(row as Guardianship),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Guardianship
}

const createGuardianshipCommand: CommandHandler<Record<string, unknown>, GuardianshipCommandResult> = {
  id: 'people.guardianships.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'people.guardianships.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: guardianshipCreateSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: ALLOWED_KINDS,
          resolveTarget: (parsed, _entity, scope) => ({ id, ...scope, personId: parsed.wardPersonId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      if (parsed.guardianPersonId === parsed.wardPersonId) await peopleErrors.throw('guardianship_self')
      const scope = { tenantId, organizationId }
      const bothExist =
        (await personExists(em, scope, parsed.guardianPersonId)) && (await personExists(em, scope, parsed.wardPersonId))
      if (!bothExist) {
        const { translate } = await resolveTranslations()
        throw notFound(translate('foundation.errors.not_found', 'Not found'))
      }
      const guardianship = em.create(Guardianship, {
        id,
        tenantId,
        organizationId,
        guardianPersonId: parsed.guardianPersonId,
        wardPersonId: parsed.wardPersonId,
        validFrom: parsed.validFrom,
        validTo: parsed.validTo ?? null,
      })
      em.persist(guardianship)
      return { guardianship, actingRole: authorized.actingRole }
    })
    const row = result.guardianship
    await emitCrudSideEffects({
      dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
      action: 'created',
      entity: row,
      identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
      events: guardianshipEvents,
    })
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    const row = result.guardianship
    return {
      actionLabel: translate('people.audit.guardianships.create', 'Add a guardianship'),
      resourceKind: RESOURCE_KIND,
      resourceId: row.id,
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      parentResourceKind: 'people.person',
      parentResourceId: row.wardPersonId,
      snapshotAfter: {
        id: row.id,
        guardianPersonId: row.guardianPersonId,
        wardPersonId: row.wardPersonId,
        validFrom: row.validFrom,
        validTo: row.validTo ?? null,
      },
      context: { actingRole: result.actingRole },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGuardianshipReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeGuardianshipReplay(ctx, logEntry.resourceId)
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

registerCommand(createGuardianshipCommand)
