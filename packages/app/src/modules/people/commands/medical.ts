// `people.persons.medical.set` (training outlines and medical expiry spec REQ-O01, BR-O1, Q-O01; #682): sets or clears a
// person's sports medical certificate "valid until" date. Who writes (Q-O01 default): the club administrator and a
// coordinator of one of the person's sections (both with `people.medical.manage`), a guardian of the ward, and the
// adult person themself; a coach never writes. A date is stored only while a `medical` consent is in force (409
// `medical_consent_missing`); clearing is always allowed. The person's lock token travels in the platform header (409
// on a stale one). Not undoable on purpose: the audit entry records only that the date was set or cleared, never the
// date (health data stays out of the snapshots); a wrong date is corrected by writing it again.
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped, foundationErrors } from '@/modules/foundation'
import { peopleErrors } from '../api/errors'
import type { Person } from '../data/entities'
import { medicalSetSchema } from '../data/validators'
import { holdsOwnConsents } from '../lib/people-rules'
import { clubToday } from '../services/club-clock'
import { emitMedicalUpdated, inSections, medicalConsentOf } from '../services/medical'
import { assertNotAnonymized, inWriteTransaction, loadPersonLocked, personTarget } from './shared'

const RESOURCE_KIND = 'people.person'
/** Least-privileged first (DD-F08): the person, a guardian, a coordinator, the administrator. */
const MEDICAL_WRITE_KINDS = ['self', 'guardian', 'coordinator', 'club_admin'] as const
/** The feature a staff writer needs besides the grant (Q-O01). */
export const MEDICAL_MANAGE_FEATURE = 'people.medical.manage'

export type MedicalSetResult = {
  person: Person
  actingRole: ActingRole
  /** `set` (a date stored or changed), `cleared`, or `unchanged`. */
  change: 'set' | 'cleared' | 'unchanged'
}

async function assertStaffMayWrite(
  ctx: CommandRuntimeContext,
  person: Person,
  actingRole: ActingRole,
  sectionIds: readonly string[],
  today: string,
  em: Parameters<typeof inSections>[1],
): Promise<void> {
  const scope = { tenantId: person.tenantId, organizationId: person.organizationId }
  const userId = ctx.auth?.sub
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  // On the command's transaction: the cached check reads on a second pooled connection on a miss (#836).
  const allowed = userId
    ? await rbac.userHasAllFeaturesWithEntityManager(em, userId, [MEDICAL_MANAGE_FEATURE], scope)
    : false
  if (!allowed) await foundationErrors.throw('scope_denied')
  if (actingRole !== 'coordinator') return
  // The coordinator reads people club-wide, but writes the date only for members of their own sections.
  if (!(await inSections(ctx.container, em, scope, person.id, sectionIds, today))) {
    await foundationErrors.throw('scope_denied')
  }
}

const setMedicalCommand: CommandHandler<Record<string, unknown>, MedicalSetResult> = {
  id: 'people.persons.medical.set',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'people.persons.medical.set', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: medicalSetSchema,
          resourceKind: RESOURCE_KIND,
          allowedKinds: MEDICAL_WRITE_KINDS,
          matchOptions: { clubWideKinds: ['coordinator'] },
          loadTarget: (parsed, txEm, lock) => loadPersonLocked(txEm, ctx, parsed.id, lock),
          resolveTarget: (_parsed, entity) => personTarget(entity as Person),
        },
        rawInput,
        ctx,
        em,
      )
      const person = authorized.entity as Person
      await assertNotAnonymized(person)
      const scope = { tenantId: person.tenantId, organizationId: person.organizationId }
      const today = await clubToday(ctx.container, scope, undefined, em)
      const { actingRole } = authorized
      if (actingRole === 'club_admin' || actingRole === 'coordinator') {
        const sectionIds = authorized.scope.flatMap((grant) => (grant.kind === 'coordinator' ? (grant.ids ?? []) : []))
        await assertStaffMayWrite(ctx, person, actingRole, sectionIds, today, em)
      } else if (actingRole === 'self' && !holdsOwnConsents(person.birthDate, today)) {
        // A minor's date is entered by a guardian (or the club); the adult enters their own.
        await peopleErrors.throw('consents_minor')
      }
      const next = authorized.parsed.validUntil ?? null
      if (next !== null && !(await medicalConsentOf(em, scope, person, today))) {
        await peopleErrors.throw('medical_consent_missing')
      }
      const current = person.medicalValidUntil ?? null
      if (current === next) return { person, actingRole, change: 'unchanged' as const }
      person.medicalValidUntil = next
      person.updatedAt = new Date()
      return { person, actingRole, change: next === null ? ('cleared' as const) : ('set' as const) }
    })
    if (result.change !== 'unchanged') await emitMedicalUpdated(ctx, result.person)
    return result
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('people.audit.persons.medical_set', 'Change the medical certificate date'),
      resourceKind: RESOURCE_KIND,
      resourceId: result.person.id,
      tenantId: result.person.tenantId,
      organizationId: result.person.organizationId,
      // Never the date itself (health data): only what happened.
      context: { actingRole: result.actingRole, medical: result.change },
    }
  },
}

registerCommand(setMedicalCommand)
