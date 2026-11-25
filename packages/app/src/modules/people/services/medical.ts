// The medical certificate date's reads (training outlines and medical expiry spec DD-O02, DD-O03, BR-O1; #682): the
// computed status of persons the caller already holds in scope (`people.medicalStatus`, optional DI for `groups` and
// `activities`), the ids a caller's grants cover for the status route, and whether a `medical` consent is in force for
// one person. The date is encrypted without a hash, so every read loads the scoped rows and decrypts in memory.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { emitCrudSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { ActingRole, CalendarDate, Scope } from '@vereino/core'
import { personEvents } from '../commands/shared'
import { Guardianship, Person } from '../data/entities'
import { emitPeopleEvent } from '../events'
import { medicalConsentInForce, medicalStatus, type MedicalStatusColor, type MedicalStatusState } from '../lib/medical'
import { parseStoredConsents } from '../lib/people-rules'
import { clubToday, type ClubScope } from './club-clock'
import { personFilterContract } from './person-filter'

/** DI token of the status reader (DD-O03): `groups` and `activities` resolve it with `hasRegistration`. */
export const PEOPLE_MEDICAL_STATUS = 'people.medicalStatus' as const

/** Most persons one status read answers (a roster or a squad holds about 40). */
export const MEDICAL_STATUS_MAX_IDS = 200

export type MedicalStatusEntry = {
  personId: string
  status: MedicalStatusColor
  state: MedicalStatusState
  validUntil: CalendarDate | null
}

export type MedicalStatusReader = {
  /**
   * The status of each of `personIds` that is a live person of the club, in the given order. The caller guarantees the
   * ids are in its scope; an unknown id is left out.
   */
  statuses(scope: ClubScope, personIds: readonly string[], today?: CalendarDate): Promise<MedicalStatusEntry[]>
}

/** Reads the statuses with `em` on the club's `today`. */
export async function readMedicalStatuses(
  em: EntityManager,
  scope: ClubScope,
  personIds: readonly string[],
  today: CalendarDate,
): Promise<MedicalStatusEntry[]> {
  const ids = [...new Set(personIds)]
  if (ids.length === 0) return []
  const rows = await findWithDecryption(
    em,
    Person,
    { ...scope, id: { $in: ids }, deletedAt: null },
    { fields: ['id', 'medicalValidUntil'] },
    scope,
  )
  const byId = new Map(rows.map((row) => [row.id, row]))
  return ids.flatMap((personId) => {
    const row = byId.get(personId)
    if (!row) return []
    return [{ personId, ...medicalStatus(row.medicalValidUntil, today) }]
  })
}

export function createMedicalStatusReader(container: AwilixContainer): MedicalStatusReader {
  return {
    async statuses(scope, personIds, today) {
      const day = today ?? (await clubToday(container, scope))
      return readMedicalStatuses(container.resolve<EntityManager>('em').fork(), scope, personIds, day)
    },
  }
}

/**
 * The ids among `requested` the caller's grants cover for the status (REQ-O02): every id for the club administrator;
 * the members of a coordinator's sections and of a coach's groups (memberships active today, through `groups`); a
 * guardian's wards; the person themself. `staff` is true when a coordinator or coach grant was needed for any of them —
 * those reads go through `auditedRead` (DPIA D-14).
 */
export async function medicalStatusScopedIds(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  grants: Scope,
  requested: readonly string[],
  today: CalendarDate,
): Promise<{
  ids: string[]
  staff: boolean
  actingRole: 'club_admin' | 'coordinator' | 'coach' | 'guardian' | 'self'
}> {
  const wanted = [...new Set(requested)]
  if (grants.some((grant) => grant.kind === 'club_admin'))
    return { ids: wanted, staff: false, actingRole: 'club_admin' }
  const personal = new Set<string>()
  for (const grant of grants) {
    if (grant.kind === 'guardian' || grant.kind === 'self') for (const id of grant.ids ?? []) personal.add(id)
  }
  const staffIds = new Set<string>()
  let staffRole: 'coordinator' | 'coach' | null = null
  const contract = personFilterContract(container)
  if (contract && wanted.some((id) => !personal.has(id))) {
    for (const grant of grants) {
      if (grant.kind !== 'coordinator' && grant.kind !== 'coach') continue
      for (const id of grant.ids ?? []) {
        const members = await contract.matchPersonIds(em, {
          ...scope,
          on: today,
          ...(grant.kind === 'coordinator' ? { sectionId: id } : { groupId: id }),
        })
        if (members.length > 0 && staffRole !== 'coordinator') staffRole = grant.kind
        for (const member of members) staffIds.add(member)
      }
    }
  }
  const ids = wanted.filter((id) => personal.has(id) || staffIds.has(id))
  const staff = ids.some((id) => !personal.has(id))
  const actingRole = staff ? (staffRole ?? 'coach') : grants.some((g) => g.kind === 'guardian') ? 'guardian' : 'self'
  return { ids, staff, actingRole }
}

/** Whether the person is a member of one of `sectionIds` today (a coordinator's write, Q-O01). */
export async function inSections(
  container: AwilixContainer,
  em: EntityManager,
  scope: ClubScope,
  personId: string,
  sectionIds: readonly string[],
  today: CalendarDate,
): Promise<boolean> {
  const contract = personFilterContract(container)
  if (!contract) return false
  for (const sectionId of sectionIds) {
    const members = await contract.matchPersonIds(em, { ...scope, on: today, sectionId })
    if (members.includes(personId)) return true
  }
  return false
}

/** BR-O1 for one person, read with `em` (inside the caller's transaction when it holds the row lock). */
export async function medicalConsentOf(
  em: EntityManager,
  scope: ClubScope,
  person: Pick<Person, 'id' | 'birthDate' | 'consents'>,
  today: CalendarDate,
): Promise<boolean> {
  const rows = await em.find(
    Guardianship,
    { ...scope, wardPersonId: person.id, deletedAt: null },
    { fields: ['id', 'validFrom', 'validTo', 'consents'] },
  )
  return medicalConsentInForce({
    birthDate: person.birthDate,
    own: parseStoredConsents(person.consents),
    guardianships: rows.map((row) => ({
      validFrom: row.validFrom,
      validTo: row.validTo ?? null,
      consents: parseStoredConsents(row.consents),
    })),
    today,
  })
}

/** The person's update side effects and `people.person.medical_updated` (ids only), after the commit. */
export async function emitMedicalUpdated(ctx: Pick<CommandRuntimeContext, 'container'>, person: Person): Promise<void> {
  const scope = { tenantId: person.tenantId, organizationId: person.organizationId }
  await emitCrudSideEffects({
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action: 'updated',
    entity: person,
    identifiers: { id: person.id, ...scope },
    events: personEvents,
  })
  await emitPeopleEvent('people.person.medical_updated', { id: person.id, ...scope }, { persistent: true, ...scope })
}

/**
 * The medical certificate block of a member page (M-O4; #682): the date, its status, whether a `medical` consent is in
 * force (BR-O1 — any guardian of a minor, or the adult), and the person's lock token for `PUT …/medical`.
 */
export type MemberMedicalView = {
  validUntil: CalendarDate | null
  status: MedicalStatusColor
  state: MedicalStatusState
  consentInForce: boolean
  /** The person's lock token (`PUT /api/people/persons/{id}/medical`). */
  updatedAt: string | null
}

export async function memberMedicalView(
  em: EntityManager,
  scope: ClubScope,
  person: Pick<Person, 'id' | 'birthDate' | 'consents' | 'medicalValidUntil' | 'updatedAt'>,
  today: CalendarDate,
): Promise<MemberMedicalView> {
  const status = medicalStatus(person.medicalValidUntil, today)
  return {
    validUntil: status.validUntil,
    status: status.status,
    state: status.state,
    consentInForce: await medicalConsentOf(em, scope, person, today),
    updatedAt: person.updatedAt ? new Date(person.updatedAt).toISOString() : null,
  }
}

/**
 * The `medical` block of `GET /api/people/persons/{id}` (M-O4, #682): only for a reader with `people.medical.manage` —
 * the club administrator, or a coordinator for a member of their own sections (the coordinator's read of people is
 * club-wide, health data is not); never for an anonymised person.
 */
export async function staffMedicalBlock(
  ctx: CommandRuntimeContext,
  scope: { tenantId: string; organizationId: string },
  person: Person,
  actingRole: ActingRole,
  grants: Scope,
): Promise<{ medical?: MemberMedicalView }> {
  if (person.anonymizedAt || !ctx.auth) return {}
  const rbac = ctx.container.resolve<RbacService>('rbacService')
  if (!(await rbac.userHasAllFeatures(ctx.auth.sub, ['people.medical.manage'], scope))) return {}
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const today = await clubToday(ctx.container, scope)
  const isAdmin = grants.some((grant) => grant.kind === 'club_admin')
  if (!isAdmin) {
    if (actingRole !== 'coordinator') return {}
    const sectionIds = grants.flatMap((grant) => (grant.kind === 'coordinator' ? (grant.ids ?? []) : []))
    if (!(await inSections(ctx.container, em, scope, person.id, sectionIds, today))) return {}
  }
  return { medical: await memberMedicalView(em, scope, person, today) }
}

/** The ids of `requested` the caller's grants cover (`medicalStatusScopedIds`) and the read of their statuses. */
export async function medicalStatusRead(
  container: AwilixContainer,
  scope: ClubScope,
  grants: Scope,
  requested: readonly string[],
  today: CalendarDate,
) {
  const em = container.resolve<EntityManager>('em').fork()
  const allowed = await medicalStatusScopedIds(container, em, scope, grants, requested, today)
  return { allowed, read: () => readMedicalStatuses(em, scope, allowed.ids, today) }
}
