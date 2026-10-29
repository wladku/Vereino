// The member's own view behind `GET /api/people/me` (club spec API table; REQ-001, REQ-002, REQ-035; #27): the person
// linked to the session's user, their active wards with the guardianship consents, their active staff roles, the acting
// contexts of the role-context switcher, the resolved interface locale (DD-34), the club's short name (club content)
// and whether the payments tile may be shown (R10). The wards come from the `guardian` grant of the scope provider
// (`scopeContract.resolve`), so the view never names a person outside the caller's scope.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { defaultLocale } from '@open-mercato/shared/lib/i18n/config'
import { detectLocale, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { isActiveAt, type ActingRole, type AssignableRole } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { memberContexts, memberLocale, selfConsentView, type SelfConsentView } from '../lib/member-rules'
import { consentsView, parseStoredConsents, type ConsentsView, type GuardianRelation } from '../lib/people-rules'
import { clubSettings, clubToday, type ClubScope } from './club-clock'
import { PEOPLE_PAYMENTS_GATE, type PaymentsGate } from './payments-gate'

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export type MemberPersonView = {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  email: string | null
  phone: string | null
  /** BCP 47; null = the club's default locale. */
  preferredLocale: string | null
  consents: { shareContactWithCoaches: SelfConsentView; sharePresenceWithGuardians: SelfConsentView }
  /** The lock token of `PUT /api/people/me`. */
  updatedAt: string | null
}

export type MemberWardView = {
  personId: string
  firstName: string
  lastName: string
  birthDate: string | null
  hasAccount: boolean
  guardianship: {
    id: string
    relation: GuardianRelation
    isPrimaryPayer: boolean
    validFrom: string
    validTo: string | null
    consents: ConsentsView
    /** The lock token of `POST /api/people/guardianships/{id}/consents`. */
    updatedAt: string | null
  }
}

export type MemberProfile = {
  person: MemberPersonView
  wards: MemberWardView[]
  /** The person's staff role assignments active today. */
  roles: { role: AssignableRole; sectionId: string | null }[]
  /** The acting contexts of the role-context switcher. */
  contexts: ActingRole[]
  /** The resolved interface locale of the member (DD-34). */
  locale: string
  /** Club content (`shortName`) stays in the club's language; dates show in the club's time zone. */
  club: { shortName: string | null; defaultLocale: string; timezone: string }
  /** R10: false for a minor, a user without `payments.view_own` or without a person. */
  paymentsVisible: boolean
}

export function memberPersonView(person: Person): MemberPersonView {
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    birthDate: person.birthDate ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    preferredLocale: person.preferredLocale ?? null,
    consents: {
      shareContactWithCoaches: selfConsentView(person.shareContactWithCoachesAt),
      sharePresenceWithGuardians: selfConsentView(person.sharePresenceWithGuardiansAt),
    },
    updatedAt: iso(person.updatedAt),
  }
}

async function loadWards(
  em: EntityManager,
  scope: ClubScope,
  guardianPersonId: string,
  wardIds: readonly string[],
  today: string,
): Promise<MemberWardView[]> {
  if (wardIds.length === 0) return []
  const links = (
    await em.find(Guardianship, {
      ...scope,
      guardianPersonId,
      wardPersonId: { $in: [...wardIds] },
      deletedAt: null,
    })
  )
    .filter((link) => isActiveAt({ validFrom: link.validFrom, validTo: link.validTo ?? null }, today))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
  const linkByWard = new Map<string, Guardianship>()
  for (const link of links) if (!linkByWard.has(link.wardPersonId)) linkByWard.set(link.wardPersonId, link)
  if (linkByWard.size === 0) return []
  const persons = await findWithDecryption(
    em,
    Person,
    { id: { $in: [...linkByWard.keys()] }, ...scope, deletedAt: null },
    {},
    scope,
  )
  return persons
    .map((ward): MemberWardView => {
      const link = linkByWard.get(ward.id) as Guardianship
      return {
        personId: ward.id,
        firstName: ward.firstName,
        lastName: ward.lastName,
        birthDate: ward.birthDate ?? null,
        hasAccount: Boolean(ward.userId),
        guardianship: {
          id: link.id,
          relation: link.relation,
          isPrimaryPayer: link.isPrimaryPayer,
          validFrom: link.validFrom,
          validTo: link.validTo ?? null,
          consents: consentsView(parseStoredConsents(link.consents)),
          updatedAt: iso(link.updatedAt),
        },
      }
    })
    .sort((a, b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName))
}

/**
 * The member profile of the session's user in the trusted organization, or null when the user is linked to no person
 * there (`GET /api/people/me` → 404 `person_not_linked`).
 */
export async function loadMemberProfile(ctx: CommandRuntimeContext, scope: ClubScope): Promise<MemberProfile | null> {
  const userId = ctx.auth?.sub
  if (!userId) return null
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const person = await findOneWithDecryption(em, Person, { userId, ...scope, deletedAt: null }, {}, scope)
  if (!person) return null
  const grants = await scopeContract.resolve(ctx)
  const today = await clubToday(ctx.container, scope)
  const wardIds = grants.find((grant) => grant.kind === 'guardian')?.ids ?? []
  const wards = await loadWards(em, scope, person.id, wardIds, today)
  const assignments = await em.find(
    RoleAssignment,
    { ...scope, personId: person.id, deletedAt: null },
    { fields: ['id', 'role', 'sectionId', 'validFrom', 'validTo'] },
  )
  const roles = assignments
    .filter((row) => isActiveAt({ validFrom: row.validFrom, validTo: row.validTo ?? null }, today))
    .map((row) => ({ role: row.role, sectionId: row.sectionId ?? null }))
  const settings = await clubSettings(ctx.container, scope)
  const supported = await resolveSupportedLocalesForRequest()
  const requestLocale = await detectLocale({ supportedLocales: supported })
  const locale = memberLocale([person.preferredLocale, settings.defaultLocale, requestLocale], supported, defaultLocale)
  const gate = ctx.container.resolve<PaymentsGate>(PEOPLE_PAYMENTS_GATE)
  const payments = await gate.check({ ...scope, userId })
  return {
    person: memberPersonView(person),
    wards,
    roles,
    contexts: memberContexts(grants),
    locale,
    club: { shortName: settings.shortName ?? null, defaultLocale: settings.defaultLocale, timezone: settings.timezone },
    paymentsVisible: payments.access === 'allowed',
  }
}
