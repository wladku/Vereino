// `people.persons.set_own_consents` (people life-cycle spec REQ-L10, DD-L12, *Own consents*; #309): an adult participant
// gives and withdraws their own consents `{ regulations, image, trips }` — through `PUT /api/people/me/consents`
// without an `id` (the person linked to the session's user, `self` grant only) — and the club administrator changes
// them for the person named by `id` (`POST /api/people/persons/{id}/consents`). The consents follow the P-08 transitions
// of `lib/people-rules.ts` and record the instant and the acting person; a person under 18, or without a birth date, is
// refused with 422 `consents_minor`. The person's lock token travels in the platform header (409 on a stale one). Undo
// restores the consents as they were; the audit log keeps every date.
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind } from '@vereino/core'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import { Person } from '../data/entities'
import { ownConsentsSchema } from '../data/validators'
import {
  applyConsentChanges,
  holdsOwnConsents,
  parseStoredConsents,
  type ConsentKind,
  type StoredConsents,
} from '../lib/people-rules'
import { clubToday } from '../services/club-clock'
import {
  actorPersonId,
  assertNotAnonymized,
  inWriteTransaction,
  loadPersonLocked,
  personEvents,
  personTarget,
} from './shared'

const RESOURCE_KIND = 'people.person'
/** `/me`: only the person's own grant. */
const SELF_KINDS = ['self'] as const
/** A named person: the person themself or the club administrator, least-privileged first (DD-F08). */
const NAMED_KINDS = ['self', 'club_admin'] as const

/** What an undo restores: the consents before the change. */
export type OwnConsentsSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  consents: StoredConsents
}

export type OwnConsentsResult = {
  person: Person
  actingRole: ActingRole
  before: OwnConsentsSnapshot
  /** The consents given or withdrawn by this call. */
  changed: ConsentKind[]
}

function snapshotOf(person: Person): OwnConsentsSnapshot {
  return {
    id: person.id,
    tenantId: person.tenantId,
    organizationId: person.organizationId,
    consents: parseStoredConsents(person.consents),
  }
}

/** The person linked to the session's user in the trusted organization; 404 `person_not_linked` without one. */
async function loadOwnPersonLocked(em: EntityManager, ctx: CommandRuntimeContext, lock: TargetLock): Promise<Person> {
  const scope = trustedScopeOf(ctx)
  const userId = ctx.auth?.sub
  const person =
    scope && userId ? await findOneWithDecryption(em, Person, { userId, ...scope, deletedAt: null }, lock, scope) : null
  if (!person) return peopleErrors.throw('person_not_linked')
  return person
}

function ownConsentsSpec(
  ctx: CommandRuntimeContext,
  named: boolean,
): AuthorizeScopedSpec<typeof ownConsentsSchema, Person> {
  return {
    input: ownConsentsSchema,
    resourceKind: RESOURCE_KIND,
    allowedKinds: named ? NAMED_KINDS : SELF_KINDS,
    loadTarget: (parsed, em, lock) =>
      parsed.id ? loadPersonLocked(em, ctx, parsed.id, lock) : loadOwnPersonLocked(em, ctx, lock),
    resolveTarget: (_parsed, entity) => personTarget(entity as Person),
  }
}

async function authorizeReplay(
  ctx: CommandRuntimeContext,
  personId: string | null | undefined,
  allowedKinds: readonly GrantKind[],
): Promise<Person> {
  const em = ctx.transactionalEm
  if (!em || !personId) throw new Error('[internal] own-consents replay needs the replay transaction and the person id')
  const { entity } = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: RESOURCE_KIND,
      allowedKinds,
      loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
      resolveTarget: (_parsed, entity) => personTarget(entity as Person),
    },
    { id: personId },
    ctx,
    em,
    { mode: 'replay' },
  )
  // An undo never writes an anonymised person's data back (#308).
  await assertNotAnonymized(entity as Person)
  return entity as Person
}

function emitPersonUpdated(ctx: CommandRuntimeContext, person: Person, undo: boolean) {
  const args = {
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action: 'updated' as const,
    entity: person,
    identifiers: { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId },
    events: personEvents,
  }
  return undo ? emitCrudUndoSideEffects(args) : emitCrudSideEffects(args)
}

const setOwnConsentsCommand: CommandHandler<Record<string, unknown>, OwnConsentsResult> = {
  id: 'people.persons.set_own_consents',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const named = typeof rawInput === 'object' && rawInput !== null && 'id' in rawInput && rawInput.id !== undefined
    const result = await inWriteTransaction(ctx, 'people.persons.set_own_consents', async (em) => {
      const authorized = await authorizeScoped(ownConsentsSpec(ctx, named), rawInput, ctx, em)
      const person = authorized.entity as Person
      const before = snapshotOf(person)
      const scope = { tenantId: person.tenantId, organizationId: person.organizationId }
      if (!holdsOwnConsents(person.birthDate, await clubToday(ctx.container, scope))) {
        await peopleErrors.throw('consents_minor')
      }
      const now = new Date()
      const applied = applyConsentChanges(
        before.consents,
        authorized.parsed.changes,
        now,
        actorPersonId(authorized.scope),
      )
      if (applied.changed.length > 0) {
        person.consents = applied.consents
        person.updatedAt = now
      }
      return { person, actingRole: authorized.actingRole, before, changed: applied.changed }
    })
    if (result.changed.length > 0) await emitPersonUpdated(ctx, result.person, false)
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.set_own_consents', 'Change own consents'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.person.id,
      tenantId: result.person.tenantId,
      organizationId: result.person.organizationId,
      snapshotBefore: result.before,
      snapshotAfter: snapshotOf(result.person),
      context: { actingRole: result.actingRole, consentsChanged: result.changed },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, logEntry.resourceId, NAMED_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OwnConsentsSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing own-consents snapshot for undo')
    const person = await authorizeReplay(ctx, before.id, NAMED_KINDS)
    person.consents = parseStoredConsents(before.consents)
    person.updatedAt = new Date()
    await ctx.transactionalEm?.flush()
    await emitPersonUpdated(ctx, person, true)
  },
}

registerCommand(setOwnConsentsCommand)
