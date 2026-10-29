// `people.persons.update_self` (club spec API table → `PUT /api/people/me`; DD-34, DD-39, REQ-006, REQ-037; #27): a
// member changes their own interface language, contact details and the two consents of the guardian's profile —
// `share_contact_with_coaches_at` and `share_presence_with_guardians_at` — given with the instant (P-08) and
// withdrawable at any time. The target is the person linked to the session's user, authorized with the `self` grant
// only; the audit log keeps the consent dates before and after. Undoable like `people.persons.update`.
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole } from '@vereino/core'
import {
  assertSupportedLocale,
  authorizeScoped,
  trustedScopeOf,
  type AuthorizeScopedSpec,
  type TargetLock,
} from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { selfUpdateSchema } from '../data/validators'
import { applySelfConsent, type SelfConsentKind } from '../lib/member-rules'
import { inWriteTransaction, loadPersonLocked, personEvents, personIndexer, personTarget } from './shared'

const RESOURCE_KIND = 'people.person'
/** Only the person's own grant: nobody changes another person's language, contact or consents through `/me`. */
const SELF_KINDS = ['self'] as const

/** What an undo of `update_self` restores; the consent dates stay in the audit log (P-08). */
export type SelfProfileSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  preferredLocale: string | null
  email: string | null
  phone: string | null
  shareContactWithCoachesAt: string | null
  sharePresenceWithGuardiansAt: string | null
}

export type UpdateSelfResult = {
  person: Person
  actingRole: ActingRole
  before: SelfProfileSnapshot
  /** The consents that were given or withdrawn by this call. */
  consentsChanged: SelfConsentKind[]
}

function isoOrNull(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function dateOrNull(value: string | null | undefined): Date | null {
  return value ? new Date(value) : null
}

export function selfProfileSnapshot(person: Person): SelfProfileSnapshot {
  return {
    id: person.id,
    tenantId: person.tenantId,
    organizationId: person.organizationId,
    preferredLocale: person.preferredLocale ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    shareContactWithCoachesAt: isoOrNull(person.shareContactWithCoachesAt),
    sharePresenceWithGuardiansAt: isoOrNull(person.sharePresenceWithGuardiansAt),
  }
}

/**
 * The person linked to the session's user in the trusted organization, row-locked and decrypted; 404
 * `person_not_linked` when the account is linked to no person (club spec API table).
 */
async function loadOwnPersonLocked(em: EntityManager, ctx: CommandRuntimeContext, lock: TargetLock): Promise<Person> {
  const scope = trustedScopeOf(ctx)
  const userId = ctx.auth?.sub
  const person =
    scope && userId ? await findOneWithDecryption(em, Person, { userId, ...scope, deletedAt: null }, lock, scope) : null
  if (!person) return peopleErrors.throw('person_not_linked')
  return person
}

function selfSpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<typeof selfUpdateSchema, Person> {
  return {
    input: selfUpdateSchema,
    resourceKind: RESOURCE_KIND,
    allowedKinds: SELF_KINDS,
    loadTarget: (_parsed, em, lock) => loadOwnPersonLocked(em, ctx, lock),
    resolveTarget: (_parsed, entity) => personTarget(entity as Person),
  }
}

async function authorizeSelfReplay(ctx: CommandRuntimeContext, personId: string | null | undefined): Promise<Person> {
  const em = ctx.transactionalEm
  if (!em || !personId) throw new Error('[internal] self-profile replay needs the replay transaction and the person id')
  const { entity } = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: RESOURCE_KIND,
      allowedKinds: SELF_KINDS,
      loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
      resolveTarget: (_parsed, entity) => personTarget(entity as Person),
    },
    { id: personId },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as Person
}

function emitPersonUpdated(ctx: CommandRuntimeContext, person: Person, undo: boolean) {
  const args = {
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action: 'updated' as const,
    entity: person,
    identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
    events: personEvents,
    indexer: personIndexer,
  }
  return undo ? emitCrudUndoSideEffects(args) : emitCrudSideEffects(args)
}

const updateSelfCommand: CommandHandler<Record<string, unknown>, UpdateSelfResult> = {
  id: 'people.persons.update_self',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.persons.update_self', async (em) => {
      const authorized = await authorizeScoped(selfSpec(ctx), rawInput, ctx, em)
      const person = authorized.entity as Person
      const before = selfProfileSnapshot(person)
      const patch = authorized.parsed
      if (patch.preferredLocale !== undefined) {
        person.preferredLocale = patch.preferredLocale ? await assertSupportedLocale(patch.preferredLocale) : null
      }
      if (patch.email !== undefined) person.email = patch.email
      if (patch.phone !== undefined) person.phone = patch.phone
      const now = new Date()
      const consentsChanged: SelfConsentKind[] = []
      const contact = applySelfConsent(person.shareContactWithCoachesAt ?? null, patch.shareContactWithCoaches, now)
      if (contact.changed) consentsChanged.push('shareContactWithCoaches')
      person.shareContactWithCoachesAt = contact.at
      const presence = applySelfConsent(
        person.sharePresenceWithGuardiansAt ?? null,
        patch.sharePresenceWithGuardians,
        now,
      )
      if (presence.changed) consentsChanged.push('sharePresenceWithGuardians')
      person.sharePresenceWithGuardiansAt = presence.at
      person.updatedAt = now
      return { person, actingRole: authorized.actingRole, before, consentsChanged }
    })
    await emitPersonUpdated(ctx, result.person, false)
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.update_self', 'Update own profile'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.person.id,
      tenantId: result.person.tenantId,
      organizationId: result.person.organizationId,
      snapshotBefore: result.before,
      snapshotAfter: selfProfileSnapshot(result.person),
      context: { actingRole: result.actingRole, consentsChanged: result.consentsChanged },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeSelfReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as SelfProfileSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing self-profile snapshot for undo')
    const person = await authorizeSelfReplay(ctx, before.id)
    person.preferredLocale = before.preferredLocale
    person.email = before.email
    person.phone = before.phone
    person.shareContactWithCoachesAt = dateOrNull(before.shareContactWithCoachesAt)
    person.sharePresenceWithGuardiansAt = dateOrNull(before.sharePresenceWithGuardiansAt)
    person.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitPersonUpdated(ctx, person, true)
  },
}

registerCommand(updateSelfCommand)
