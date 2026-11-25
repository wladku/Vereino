// The identity commands of social sign-in (spec *API, Command, and Error Contracts*; #566). Platform `CommandHandler`s
// whose `execute` calls `authorizeScoped` inside the write transaction (DD-F14, DD-F18). Neither is undoable: an
// unlinked identity is re-linked with one click (DD-S06) and a link is repeated by the user. Their audit entries keep
// ids and the provider only — the input carries the provider subject and the e-mail, so they are not replayable.
//
// - `foundation.identity.link` — run by the callback of a `link` round trip with the session of the user who started
//   it: the `self_user` grant of `ctx.auth.sub` (scope source `{ marker: true }`) is the only scope. A second link of
//   the same provider → 409 `identity_already_linked`; a subject already bound (the unique index refuses the insert) →
//   `IdentitySubjectConflict`,
//   which the callback turns into the generic link failure with a fingerprint (nothing revealed).
// - `foundation.identity.unlink` — the account holder's own link (`self_user`) or any link of the organization for
//   the club administrator (`club_admin`), with the link's lock token; the last sign-in method is kept (409
//   `identity_last_method`); the row is hard-deleted (DD-S06).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { IdentityLink } from '../data/entities'
import { emitFoundationEvent } from '../events'
import { IDENTITY_PROVIDERS, canRemoveMethod } from '../lib/identity'
import { authorizeScoped } from '../services/authorize-scoped'
import { identityEventPayload, lockedSignInMethods } from '../services/identity-links'

export const IDENTITY_RESOURCE_KIND = 'foundation.identity_link'

/** A subject already bound to another user: never a coded answer (the callback redirects with a fingerprint). */
export class IdentitySubjectConflict extends Error {
  override name = 'IdentitySubjectConflict'
}

export const linkIdentitySchema = z
  .object({
    provider: z.enum(IDENTITY_PROVIDERS),
    subject: z.string().min(1).max(255),
    email: z.string().max(320).nullable(),
  })
  .strict()

export const unlinkIdentitySchema = z.object({ id: z.uuid() }).strict()

export type IdentityCommandResult = {
  link: Pick<IdentityLink, 'id' | 'userId' | 'provider' | 'tenantId' | 'organizationId'>
  actingRole: ActingRole
}

async function inWriteTransaction<T>(
  ctx: CommandRuntimeContext,
  label: string,
  phase: (em: EntityManager) => Promise<T>,
): Promise<T> {
  const em = ctx.transactionalEm ?? ctx.container.resolve<EntityManager>('em').fork()
  const box: { value?: T } = {}
  await withAtomicFlush(
    em,
    [
      async () => {
        box.value = await phase(em)
      },
    ],
    { transaction: true, label },
  )
  if (!('value' in box)) throw new Error('[internal] the write transaction produced no result: ' + label)
  return box.value as T
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { code?: unknown }).code === '23505' ||
      (error as { name?: unknown }).name === 'UniqueConstraintViolationException')
  )
}

function snapshotOf(link: IdentityCommandResult['link']) {
  return identityEventPayload(link)
}

async function identityLog(result: IdentityCommandResult, key: string, fallback: string, removed: boolean) {
  const { translate } = await resolveTranslations()
  const snapshot = snapshotOf(result.link)
  return {
    actionLabel: translate(key, fallback),
    resourceKind: IDENTITY_RESOURCE_KIND,
    resourceId: result.link.id,
    tenantId: result.link.tenantId,
    organizationId: result.link.organizationId,
    snapshotBefore: removed ? snapshot : null,
    snapshotAfter: removed ? null : snapshot,
    context: { actingRole: result.actingRole, provider: result.link.provider },
    replayable: false,
  }
}

const linkIdentityCommand: CommandHandler<Record<string, unknown>, IdentityCommandResult> = {
  id: 'foundation.identity.link',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'foundation.identity.link', async (em) => {
      const newId = randomUUID()
      const authorized = await authorizeScoped(
        {
          input: linkIdentitySchema,
          resourceKind: IDENTITY_RESOURCE_KIND,
          allowedKinds: ['self_user'],
          scopeSource: { marker: true },
          lock: 'none',
          resolveTarget: (_parsed, _entity, scope) => ({ id: newId, ...scope, userId: ctx.auth?.sub ?? null }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const userId = authorized.target.userId as string
      const own = await em.findOne(IdentityLink, { tenantId, organizationId, userId, provider: parsed.provider })
      if (own) return foundationErrors.throw('identity_already_linked')
      const link = em.create(IdentityLink, {
        id: newId,
        tenantId,
        organizationId,
        userId,
        provider: parsed.provider,
        subject: parsed.subject,
        emailAtLink: parsed.email,
      })
      em.persist(link)
      try {
        await em.flush()
      } catch (error: unknown) {
        // The subject is bound to a user (another one, or this one in a concurrent link): the unique
        // (`provider`, `subject`) index decides, so the command needs no tenant-blind read of its own (DD-S03).
        if (isUniqueViolation(error)) throw new IdentitySubjectConflict('subject already bound')
        throw error
      }
      return { link, actingRole: authorized.actingRole }
    })
    void emitFoundationEvent('foundation.identity.linked', identityEventPayload(result.link)).catch(() => undefined)
    return result
  },
  buildLog: ({ result }) => identityLog(result, 'foundation.audit.identity.link', 'Link a sign-in identity', false),
}

const unlinkIdentityCommand: CommandHandler<Record<string, unknown>, IdentityCommandResult> = {
  id: 'foundation.identity.unlink',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'foundation.identity.unlink', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: unlinkIdentitySchema,
          resourceKind: IDENTITY_RESOURCE_KIND,
          allowedKinds: ['self_user', 'club_admin'],
          loadTarget: (parsed, txEm, lock) => {
            const tenantId = ctx.auth?.tenantId
            const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
            if (!tenantId || !organizationId) return Promise.resolve(null)
            return txEm.findOne(IdentityLink, { id: parsed.id, tenantId, organizationId, deletedAt: null }, lock)
          },
          resolveTarget: (_parsed, entity) => {
            const link = entity as IdentityLink
            return { id: link.id, tenantId: link.tenantId, organizationId: link.organizationId, userId: link.userId }
          },
        },
        rawInput,
        ctx,
        em,
      )
      const link = authorized.entity as IdentityLink
      const scope = { tenantId: link.tenantId, organizationId: link.organizationId }
      const methods = await lockedSignInMethods(em, scope, link.userId)
      if (!canRemoveMethod(methods.hasPassword, methods.linkCount)) {
        return foundationErrors.throw('identity_last_method')
      }
      const removed = {
        id: link.id,
        userId: link.userId,
        provider: link.provider,
        tenantId: link.tenantId,
        organizationId: link.organizationId,
      }
      em.remove(link)
      return { link: removed, actingRole: authorized.actingRole }
    })
    void emitFoundationEvent('foundation.identity.unlinked', identityEventPayload(result.link)).catch(() => undefined)
    return result
  },
  buildLog: ({ result }) => identityLog(result, 'foundation.audit.identity.unlink', 'Unlink a sign-in identity', true),
}

registerCommand(linkIdentityCommand)
registerCommand(unlinkIdentityCommand)
