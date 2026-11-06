// The member's own view behind `GET /api/people/me` (club spec API table; REQ-001, REQ-002, REQ-035; #27): the person
// linked to the session's user, their active wards with the guardianship consents, their active staff roles, the acting
// contexts of the role-context switcher, the resolved interface locale (DD-34), the club's short name (club content)
// and whether the payments tile may be shown (R10). The wards come from the `guardian` grant of the scope provider
// (`scopeContract.resolve`), so the view never names a person outside the caller's scope. E06-S22 (#104) adds each
// ward's age on the club day, the name of each consent's last author, and — under the `self` grant, the member's own
// guardianships — the member's active guardians with the consents they gave (read-only for the ward).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { defaultLocale } from '@open-mercato/shared/lib/i18n/config'
import { detectLocale, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { ageOn, isActiveAt, type ActingRole, type AssignableRole } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import {
  consentAuthorIds,
  memberContexts,
  memberLocale,
  selfConsentView,
  withConsentAuthors,
  type MemberConsentsView,
  type SelfConsentView,
} from '../lib/member-rules'
import { consentsView, parseStoredConsents, type ConsentsView, type GuardianRelation } from '../lib/people-rules'
import { clubLogoUrl, clubSettings, clubToday, type ClubScope } from './club-clock'
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
  consents: {
    shareContactWithCoaches: SelfConsentView
    sharePresenceWithGuardians: SelfConsentView
    /** The instructor's consent to show "First L." on the public pages (DD-29, #91). */
    publishNameConsent: SelfConsentView
  }
  /** The lock token of `PUT /api/people/me`. */
  updatedAt: string | null
}

export type MemberWardView = {
  personId: string
  firstName: string
  lastName: string
  birthDate: string | null
  /** Completed years on the club day; null without a birth date. */
  age: number | null
  hasAccount: boolean
  guardianship: {
    id: string
    relation: GuardianRelation
    isPrimaryPayer: boolean
    validFrom: string
    validTo: string | null
    consents: MemberConsentsView
    /** The lock token of `POST /api/people/guardianships/{id}/consents`. */
    updatedAt: string | null
  }
}

/** One active guardian of the member (E06-S22 #104): who they are and the consents they gave for the member. */
export type MemberGuardianView = {
  guardianshipId: string
  firstName: string
  lastName: string
  relation: GuardianRelation
  consents: MemberConsentsView
}

export type MemberProfile = {
  person: MemberPersonView
  wards: MemberWardView[]
  /** The member's own active guardians; empty for an adult without one. */
  guardians: MemberGuardianView[]
  /** The person's staff role assignments active today. */
  roles: { role: AssignableRole; sectionId: string | null }[]
  /** The acting contexts of the role-context switcher. */
  contexts: ActingRole[]
  /** The resolved interface locale of the member (DD-34). */
  locale: string
  /** Club content (`shortName`) stays in the club's language; dates show in the club's time zone. */
  club: { shortName: string | null; defaultLocale: string; timezone: string; logoUrl: string | null }
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
      publishNameConsent: selfConsentView(person.publishNameConsentAt),
    },
    updatedAt: iso(person.updatedAt),
  }
}

/** The active link per counterpart (the latest `validFrom` wins), keyed by `keyOf`. */
function activeLinks(links: readonly Guardianship[], today: string, keyOf: (link: Guardianship) => string) {
  const byKey = new Map<string, Guardianship>()
  const active = links
    .filter((link) => isActiveAt({ validFrom: link.validFrom, validTo: link.validTo ?? null }, today))
    .sort((a, b) => b.validFrom.localeCompare(a.validFrom))
  for (const link of active) if (!byKey.has(keyOf(link))) byKey.set(keyOf(link), link)
  return byKey
}

function byName<T extends { firstName: string; lastName: string }>(a: T, b: T): number {
  return a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName)
}

async function loadWardLinks(
  em: EntityManager,
  scope: ClubScope,
  guardianPersonId: string,
  wardIds: readonly string[],
  today: string,
): Promise<Map<string, Guardianship>> {
  if (wardIds.length === 0) return new Map()
  const links = await em.find(Guardianship, {
    ...scope,
    guardianPersonId,
    wardPersonId: { $in: [...wardIds] },
    deletedAt: null,
  })
  return activeLinks(links, today, (link) => link.wardPersonId)
}

async function loadGuardianLinks(
  em: EntityManager,
  scope: ClubScope,
  wardPersonId: string,
  today: string,
): Promise<Map<string, Guardianship>> {
  const links = await em.find(Guardianship, { ...scope, wardPersonId, deletedAt: null })
  return activeLinks(links, today, (link) => link.guardianPersonId)
}

async function loadPersons(em: EntityManager, scope: ClubScope, ids: readonly string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const persons = await findWithDecryption(em, Person, { id: { $in: unique }, ...scope, deletedAt: null }, {}, scope)
  return new Map(persons.map((person) => [person.id, person]))
}

/**
 * The wards (`guardian` grant) and the member's own guardians (`self` grant: the links naming the member as the ward),
 * each with its consents and the names of their authors, read in one pass over the persons involved.
 */
async function loadFamily(
  em: EntityManager,
  scope: ClubScope,
  personId: string,
  wardIds: readonly string[],
  today: string,
): Promise<{ wards: MemberWardView[]; guardians: MemberGuardianView[] }> {
  const wardLinks = await loadWardLinks(em, scope, personId, wardIds, today)
  const guardianLinks = await loadGuardianLinks(em, scope, personId, today)
  const consents = new Map<string, ConsentsView>()
  for (const link of [...wardLinks.values(), ...guardianLinks.values()]) {
    consents.set(link.id, consentsView(parseStoredConsents(link.consents)))
  }
  const persons = await loadPersons(em, scope, [
    ...wardLinks.keys(),
    ...guardianLinks.keys(),
    ...consentAuthorIds([...consents.values()]),
  ])
  const names = new Map([...persons.values()].map((person) => [person.id, fullName(person)]))
  const consentsOf = (link: Guardianship) => withConsentAuthors(consents.get(link.id) as ConsentsView, names)
  const wards = [...wardLinks.values()].flatMap((link): MemberWardView[] => {
    const ward = persons.get(link.wardPersonId)
    if (!ward) return []
    return [
      {
        personId: ward.id,
        firstName: ward.firstName,
        lastName: ward.lastName,
        birthDate: ward.birthDate ?? null,
        age: ward.birthDate ? ageOn(ward.birthDate.slice(0, 10), today) : null,
        hasAccount: Boolean(ward.userId),
        guardianship: {
          id: link.id,
          relation: link.relation,
          isPrimaryPayer: link.isPrimaryPayer,
          validFrom: link.validFrom,
          validTo: link.validTo ?? null,
          consents: consentsOf(link),
          updatedAt: iso(link.updatedAt),
        },
      },
    ]
  })
  const guardians = [...guardianLinks.values()].flatMap((link): MemberGuardianView[] => {
    const guardian = persons.get(link.guardianPersonId)
    if (!guardian) return []
    return [
      {
        guardianshipId: link.id,
        firstName: guardian.firstName,
        lastName: guardian.lastName,
        relation: link.relation,
        consents: consentsOf(link),
      },
    ]
  })
  return { wards: wards.sort(byName), guardians: guardians.sort(byName) }
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim()
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
  const { wards, guardians } = await loadFamily(em, scope, person.id, wardIds, today)
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
    guardians,
    roles,
    contexts: memberContexts(grants),
    locale,
    club: {
      shortName: settings.shortName ?? null,
      defaultLocale: settings.defaultLocale,
      timezone: settings.timezone,
      logoUrl: await clubLogoUrl(ctx.container, scope),
    },
    paymentsVisible: payments.access === 'allowed',
  }
}
