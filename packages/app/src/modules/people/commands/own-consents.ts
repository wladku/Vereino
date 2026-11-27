// `people.persons.set_own_consents` (people life-cycle spec REQ-L10, DD-L12, *Own consents*; #309): an adult participant
// gives and withdraws their own consents `{ regulations, image, trips }` — through `PUT /api/people/me/consents`
// without an `id` (the person linked to the session's user, `self` grant only) — and the club administrator changes
// them for the person named by `id` (`POST /api/people/persons/{id}/consents`). The consents follow the P-08 transitions
// of `lib/people-rules.ts` and record the instant and the acting person; a person under 18, or without a birth date, is
// refused with 422 `consents_minor`. The person's lock token travels in the platform header (409 on a stale one). Undo
// restores the consents as they were; the audit log keeps every date. The event photos spec (#871): only the person
// grants `image`, the administrator only records a withdrawal with a note (BR-I05); every decision is appended to
// `people_consent_events` (DD-I07); an undo never lifts an image withdrawal (BR-I06); an image withdrawal emits
// `people.consent.image_withdrawn` after the commit.
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
import { Person, type ConsentEvent } from '../data/entities'
import { ownConsentsSchema } from '../data/validators'
import { consentDecisionRole, imageChangeProblem } from '../lib/image-consent'
import {
  applyConsentChanges,
  changedConsents,
  holdsOwnConsents,
  parseStoredConsents,
  restoreConsentsKeepingWithdrawals,
  subjectOnlyChanges,
  type ConsentKind,
  type StoredConsents,
} from '../lib/people-rules'
import { clubToday } from '../services/club-clock'
import { emitImageWithdrawals, recordConsentEvents, type ConsentDecision } from '../services/consent-events'
import { emitMedicalUpdated } from '../services/medical'
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
  /** The `medical` consent was withdrawn and the medical certificate date cleared with it (BR-O1, #682). */
  medicalCleared?: boolean
  /** The consent decisions appended (DD-I07, #871); emitted after the commit. */
  consentEvents?: ConsentEvent[]
}

function recordOwnDecisions(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  person: Person,
  decisions: readonly ConsentDecision[],
  actor: string | null,
  note?: string | null,
): Promise<ConsentEvent[]> {
  return recordConsentEvents(em, ctx.container, {
    scope: { tenantId: person.tenantId, organizationId: person.organizationId },
    subjectPersonId: person.id,
    guardianshipId: null,
    decisions,
    byPersonId: actor,
    byRole: consentDecisionRole({ guardianship: false, actorPersonId: actor, owner: person.id }),
    note,
  })
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
): Promise<{ person: Person; actor: string | null }> {
  const em = ctx.transactionalEm
  if (!em || !personId) throw new Error('[internal] own-consents replay needs the replay transaction and the person id')
  const { entity, scope } = await authorizeScoped(
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
  await assertNotAnonymized(entity)
  return { person: entity as Person, actor: actorPersonId(scope) }
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
      if (!holdsOwnConsents(person.birthDate, await clubToday(ctx.container, scope, undefined, em))) {
        await peopleErrors.throw('consents_minor')
      }
      const now = new Date()
      const actor = actorPersonId(authorized.scope)
      const applied = applyConsentChanges(before.consents, authorized.parsed.changes, now, actor)
      // BR-O1 (#682): only the person gives or withdraws the `medical` consent, never the club's staff.
      if (authorized.actingRole !== 'self' && subjectOnlyChanges(applied.changed).length > 0) {
        await peopleErrors.throw('medical_consent_subject_only')
      }
      // BR-I05 (#871): only the person grants `image`; the administrator records a withdrawal with a note.
      if (applied.changed.includes('image')) {
        const problem = imageChangeProblem({
          granted: applied.consents.image?.granted === true,
          actingRole: authorized.actingRole,
          actorPersonId: actor,
          owner: person.id,
          note: authorized.parsed.note,
        })
        if (problem === 'scope_denied' || problem === 'image_consent_subject_only') {
          await peopleErrors.throw('image_consent_subject_only')
        } else if (problem) await peopleErrors.throw(problem)
      }
      if (applied.changed.length > 0) {
        person.consents = applied.consents
        person.updatedAt = now
      }
      // Withdrawing the `medical` consent clears the date it held (BR-O1, #682).
      const medicalCleared =
        applied.changed.includes('medical') && !applied.consents.medical?.granted && !!person.medicalValidUntil
      if (medicalCleared) person.medicalValidUntil = null
      const decisions = applied.changed.map((kind) => ({ kind, granted: applied.consents[kind]?.granted === true }))
      const consentEvents = await recordOwnDecisions(em, ctx, person, decisions, actor, authorized.parsed.note)
      return {
        person,
        actingRole: authorized.actingRole,
        before,
        changed: applied.changed,
        medicalCleared,
        consentEvents,
      }
    })
    if (result.medicalCleared) await emitMedicalUpdated(ctx, result.person)
    else if (result.changed.length > 0) await emitPersonUpdated(ctx, result.person, false)
    await emitImageWithdrawals(result.consentEvents ?? [])
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
      context: {
        actingRole: result.actingRole,
        consentsChanged: result.changed,
        ...(result.medicalCleared ? { medical: 'cleared' } : {}),
      },
    }
  },
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, logEntry.resourceId, NAMED_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OwnConsentsSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing own-consents snapshot for undo')
    const { person, actor } = await authorizeReplay(ctx, before.id, NAMED_KINDS)
    const em = ctx.transactionalEm as EntityManager
    const current = parseStoredConsents(person.consents)
    // BR-I06 (#871): an undo never turns a withdrawn image consent back into a grant.
    const restored = restoreConsentsKeepingWithdrawals(current, parseStoredConsents(before.consents))
    person.consents = restored
    person.updatedAt = new Date()
    const events = await recordOwnDecisions(em, ctx, person, changedConsents(current, restored), actor)
    await em.flush()
    await emitPersonUpdated(ctx, person, true)
    await emitImageWithdrawals(events)
  },
}

registerCommand(setOwnConsentsCommand)
