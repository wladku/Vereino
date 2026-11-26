// The second-factor reset (staff second factor spec DD-2F07, REQ-2F04; #736): a platform `CommandHandler` whose
// `execute` calls `authorizeScoped` inside the write transaction (DD-F14, DD-F18). The club administrator
// (`club_admin`) resets another person of the club after verifying them; the operator runs it from the shell with a
// system actor (`system_job`, `foundation second-factor reset`). It removes the person's identity links and ends all
// their sessions; the person then signs in with the password and the e-mail code and may connect Google again. Not
// undoable (the person reconnects Google). The audit entry keeps ids, the counts and the verification note.
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { Session, User } from '@open-mercato/core/modules/auth/data/entities'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { IdentityLink } from '../data/entities'
import { emitFoundationEvent } from '../events'
import { SECOND_FACTOR_METHOD } from '../lib/second-factor'
import { authorizeScoped } from '../services/authorize-scoped'
import { holdsSecondFactorRequirement } from '../second-factor/gate'

export const SECOND_FACTOR_RESOURCE_KIND = 'foundation.second_factor'

export const resetSecondFactorSchema = z
  .object({
    userId: z.uuid(),
    note: z.string().trim().min(3).max(500),
  })
  .strict()

export type ResetSecondFactorResult = {
  userId: string
  tenantId: string
  organizationId: string
  unlinked: number
  actorUserId: string | null
  actingRole: ActingRole
  note: string
}

async function inWriteTransaction<T>(ctx: CommandRuntimeContext, phase: (em: EntityManager) => Promise<T>): Promise<T> {
  const em = ctx.transactionalEm ?? ctx.container.resolve<EntityManager>('em').fork()
  const box: { value?: T } = {}
  await withAtomicFlush(
    em,
    [
      async () => {
        box.value = await phase(em)
      },
    ],
    { transaction: true, label: 'foundation.second_factor.reset' },
  )
  if (!('value' in box)) throw new Error('[internal] the write transaction produced no result: second factor reset')
  return box.value as T
}

const resetSecondFactorCommand: CommandHandler<Record<string, unknown>, ResetSecondFactorResult> = {
  id: 'foundation.second_factor.reset',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const system = !ctx.auth && ctx.systemActor === true
    const result = await inWriteTransaction(ctx, async (em) => {
      const authorized = await authorizeScoped(
        {
          input: resetSecondFactorSchema,
          resourceKind: SECOND_FACTOR_RESOURCE_KIND,
          allowedKinds: system ? ['system_job'] : ['club_admin'],
          scopeSource: system ? { job: true } : undefined,
          lock: 'none',
          loadTarget: (parsed, txEm, lock) => {
            const tenantId = system ? ctx.organizationScope?.tenantId : ctx.auth?.tenantId
            const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
            if (!tenantId || !organizationId) return Promise.resolve(null)
            return txEm.findOne(User, { id: parsed.userId, tenantId, organizationId, deletedAt: null }, lock)
          },
          resolveTarget: (_parsed, entity) => {
            const user = entity as User
            return {
              id: String(user.id),
              tenantId: String(user.tenantId),
              organizationId: String(user.organizationId),
              userId: String(user.id),
            }
          },
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      if (!system && parsed.userId === ctx.auth?.sub) return foundationErrors.throw('second_factor_reset_self')
      // A person without the requirement answers like an unknown one (one answer, spec API table).
      if (!(await holdsSecondFactorRequirement(ctx.container, parsed.userId, { tenantId, organizationId }))) {
        const { translate } = await resolveTranslations()
        throw notFound(translate('foundation.errors.not_found', 'Not found'))
      }
      const unlinked = await em.nativeDelete(IdentityLink, { tenantId, organizationId, userId: parsed.userId })
      await em.nativeDelete(Session, { user: parsed.userId })
      return {
        userId: parsed.userId,
        tenantId,
        organizationId,
        unlinked,
        actorUserId: ctx.auth?.sub ?? null,
        actingRole: authorized.actingRole,
        note: parsed.note,
      }
    })
    void emitFoundationEvent('foundation.second_factor.reset', {
      id: result.userId,
      userId: result.userId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      method: SECOND_FACTOR_METHOD,
      actorUserId: result.actorUserId,
    }).catch(() => undefined)
    return result
  },
  buildLog: async ({ result }) => {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('foundation.audit.secondFactor.reset', 'Reset a second factor'),
      resourceKind: SECOND_FACTOR_RESOURCE_KIND,
      resourceId: result.userId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      snapshotBefore: null,
      snapshotAfter: { userId: result.userId, unlinked: result.unlinked, sessionsEnded: true },
      context: { actingRole: result.actingRole, note: result.note, actorUserId: result.actorUserId },
      replayable: false,
    }
  },
}

registerCommand(resetSecondFactorCommand)
