// The member's own view behind `GET /api/people/me` (club spec API table; REQ-001, REQ-002, REQ-035; #27): the person
// linked to the session's user, their active wards with the guardianship consents, their active staff roles, the acting
// contexts of the role-context switcher, the resolved interface locale (DD-34), the club's short name (club content)
// and whether the payments tile may be shown (R10). The wards come from the `guardian` grant of the scope provider
// (`scopeContract.resolve`), so the view never names a person outside the caller's scope. Spec N (REQ-N07, #259) adds
// `isParticipant`, which with the wards is the member side of the acting context. E06-S22 (#104) adds each
// ward's age on the club day, the name of each consent's last author, and — under the `self` grant, the member's own
// guardianships — the member's active guardians with the consents they gave (read-only for the ward). The people
// life-cycle spec (REQ-L10, #309) adds an adult's own consents with their authors (`ownConsents`, null for a minor) and
// the club's consent texts with the instant of their last change (`consentTexts`, DD-L11), so the profile shows the
// club's wording and marks a consent given to an earlier one. Phase L8 (#310) adds each ward's notice lines
// (`wards[].notices`: "may have an own account", "turns 18 on {date}") and the member's own notice card before and after
// the 18th birthday (`notice`); the authors of an adult's consents carried over from the former guardians are named.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { defaultLocale } from '@open-mercato/shared/lib/i18n/config'
import { detectLocale, resolveSupportedLocalesForRequest } from '@open-mercato/shared/lib/i18n/server'
import { ageOn, isActiveAt, type ActingRole, type AssignableRole } from '@vereino/core'
import { scopeContract } from '@/modules/foundation'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { imagePublishable } from './person-directory'
import { memberMedicalView, type MemberMedicalView } from './medical'
import {
  consentAuthorIds,
  consentAuthorRole,
  memberContexts,
  memberLocale,
  selfConsentView,
  withConsentAuthors,
  type ConsentAuthorRole,
  type MemberConsentsView,
  type SelfConsentView,
} from '../lib/member-rules'
import {
  consentsView,
  holdsOwnConsents,
  parseStoredConsents,
  type ConsentsView,
  type GuardianRelation,
} from '../lib/people-rules'
import { ownNotice, wardNotices, type OwnNotice, type WardNotice } from '../lib/life-cycle-rules'
import {
  clubConsentTexts,
  clubAccentOf,
  clubLogoUrl,
  clubOrganizationName,
  clubSettings,
  clubToday,
  type ClubConsentTexts,
  type ClubScope,
} from './club-clock'
import { membershipContribution } from './membership-contribution'
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
  /** M-10 ward card lines (#310): the club's account age reached without an account; the 18th birthday within 30 days. */
  notices: WardNotice[]
  /** The ward's sports medical certificate date and status (M-O4, #682); the guardian sets both. */
  medical?: MemberMedicalView
  /**
   * Whether the ward's image may be published now (event photos spec BR-I02, #871): a guardian gave the image consent
   * and no guardian withdrew it.
   */
  imagePublishable?: boolean
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
  club: {
    shortName: string | null
    /** The club's full name (the platform organization's), shown next to the logo on Today (R06.1, #493). */
    name: string | null
    defaultLocale: string
    timezone: string
    logoUrl: string | null
    /** The club's colour and the text colour on it (#486); null uses the default. */
    accent: { color: string; foreground: '#000000' | '#ffffff' } | null
  }
  /** R10: false for a minor, a user without `payments.view_own` or without a person. */
  paymentsVisible: boolean
  /** An active participant membership today (spec N, REQ-N07); always false without `groups`. */
  isParticipant: boolean
  /**
   * The member's own consents with their authors (people life-cycle spec REQ-L10, #309): only for a person aged 18 or
   * more with a known birth date; null otherwise (a minor's consents stay with the guardians).
   */
  ownConsents: MemberConsentsView | null
  /** Whether the adult's own image may be published now (BR-I03, #871); null for a minor. */
  ownImagePublishable: boolean | null
  /** The club's consent texts by key with the instant of the last change (DD-L11); a missing key = built-in text. */
  consentTexts: ClubConsentTexts
  /** The member's own card before and after their 18th birthday (#310); null otherwise or without a birth date. */
  notice: OwnNotice | null
  /**
   * The adult member's own sports medical certificate date and status (M-O4, #682); null for a minor, whose guardians
   * enter it.
   */
  medical: MemberMedicalView | null
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

/** Each ward with its family: the ward and every guardian the club ever linked to the ward (not deleted). */
async function loadFamilies(
  em: EntityManager,
  scope: ClubScope,
  wardIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const families = new Map(wardIds.map((id) => [id, new Set([id])]))
  const links = await em.find(Guardianship, { ...scope, wardPersonId: { $in: [...families.keys()] }, deletedAt: null })
  for (const link of links) families.get(link.wardPersonId)?.add(link.guardianPersonId)
  return families
}

/** The label role of each consent author outside the family, from their staff roles (#191). */
async function loadAuthorRoles(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, ConsentAuthorRole>> {
  if (ids.length === 0) return new Map()
  const assignments = await em.find(RoleAssignment, { ...scope, personId: { $in: [...ids] }, deletedAt: null })
  return new Map(
    ids.map((id) => [
      id,
      consentAuthorRole(assignments.filter((assignment) => assignment.personId === id).map((a) => a.role)),
    ]),
  )
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
  threshold: number,
): Promise<{ wards: MemberWardView[]; guardians: MemberGuardianView[] }> {
  const wardLinks = await loadWardLinks(em, scope, personId, wardIds, today)
  const guardianLinks = await loadGuardianLinks(em, scope, personId, today)
  const consents = new Map<string, ConsentsView>()
  for (const link of [...wardLinks.values(), ...guardianLinks.values()]) {
    consents.set(link.id, consentsView(parseStoredConsents(link.consents)))
  }
  // #191: an author is shown by name only to the family (the ward and every guardian of the ward, past ones too);
  // anyone else — a club administrator — by the role label.
  const families = await loadFamilies(em, scope, [...wardLinks.keys(), personId])
  const familyOf = (link: Guardianship) => families.get(link.wardPersonId) as Set<string>
  const authorIds = consentAuthorIds([...consents.values()])
  const outsiders = new Set<string>()
  for (const link of [...wardLinks.values(), ...guardianLinks.values()]) {
    const family = familyOf(link)
    for (const author of consentAuthorIds([consents.get(link.id) as ConsentsView])) {
      if (!family.has(author)) outsiders.add(author)
    }
  }
  const persons = await loadPersons(em, scope, [
    ...wardLinks.keys(),
    ...guardianLinks.keys(),
    ...authorIds.filter((id) => !outsiders.has(id)),
  ])
  const names = new Map([...persons.values()].map((person) => [person.id, fullName(person)]))
  const roles = await loadAuthorRoles(em, scope, [...outsiders])
  const consentsOf = (link: Guardianship) =>
    withConsentAuthors(consents.get(link.id) as ConsentsView, { family: familyOf(link), names, roles })
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
        notices: wardNotices({ birthDate: ward.birthDate, hasAccount: Boolean(ward.userId), threshold, today }),
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
  const settings = await clubSettings(ctx.container, scope)
  const wardIds = grants.find((grant) => grant.kind === 'guardian')?.ids ?? []
  const { wards, guardians } = await loadFamily(em, scope, person.id, wardIds, today, settings.ownAccountMinAge)
  const assignments = await em.find(
    RoleAssignment,
    { ...scope, personId: person.id, deletedAt: null },
    { fields: ['id', 'role', 'sectionId', 'validFrom', 'validTo'] },
  )
  const roles = assignments
    .filter((row) => isActiveAt({ validFrom: row.validFrom, validTo: row.validTo ?? null }, today))
    .map((row) => ({ role: row.role, sectionId: row.sectionId ?? null }))
  const supported = await resolveSupportedLocalesForRequest()
  const requestLocale = await detectLocale({ supportedLocales: supported })
  const locale = memberLocale([person.preferredLocale, settings.defaultLocale, requestLocale], supported, defaultLocale)
  const gate = ctx.container.resolve<PaymentsGate>(PEOPLE_PAYMENTS_GATE)
  const payments = await gate.check({ ...scope, userId })
  const ownConsents = holdsOwnConsents(person.birthDate, today) ? await loadOwnConsents(em, scope, person) : null
  // M-O4 (#682): the medical certificate block — the adult's own, and each ward's for the guardian.
  const medical = ownConsents ? await memberMedicalView(em, scope, person, today) : null
  // An empty `$in` compiles to `in ()`, a syntax error: no wards, no read.
  const wardPersons =
    wards.length === 0
      ? []
      : await findWithDecryption(
          em,
          Person,
          { id: { $in: wards.map((ward) => ward.personId) }, ...scope, deletedAt: null },
          { fields: ['id', 'birthDate', 'consents', 'medicalValidUntil', 'updatedAt'] },
          scope,
        )
  for (const ward of wards) {
    const row = wardPersons.find((candidate) => candidate.id === ward.personId)
    if (row) ward.medical = await memberMedicalView(em, scope, row, today)
  }
  // BR-I02 / BR-I03 (#871): whether each ward's image, and the adult's own, may be published now.
  const publishable = await imagePublishable(em, scope, [person.id, ...wards.map((ward) => ward.personId)], today)
  for (const ward of wards) ward.imagePublishable = publishable.get(ward.personId) === true
  const contribution = membershipContribution(ctx.container)
  const isParticipant = contribution
    ? await contribution.isActiveParticipant(em, { ...scope, personId: person.id }, today)
    : false
  return {
    person: memberPersonView(person),
    wards,
    guardians,
    roles,
    contexts: memberContexts(grants),
    locale,
    club: {
      shortName: settings.shortName ?? null,
      name: await clubOrganizationName(ctx.container, scope),
      defaultLocale: settings.defaultLocale,
      timezone: settings.timezone,
      logoUrl: await clubLogoUrl(ctx.container, scope),
      accent: await clubAccentOf(ctx.container, scope),
    },
    paymentsVisible: payments.access === 'allowed',
    isParticipant,
    ownConsents,
    ownImagePublishable: ownConsents ? publishable.get(person.id) === true : null,
    consentTexts: await clubConsentTexts(ctx.container, scope),
    notice: ownNotice(person.birthDate, today),
    medical,
  }
}

/**
 * An adult's own consents with their last authors: the person and their guardians, past ones too (the consents carried
 * over on the 18th birthday, #310), by name; anyone else (the club administrator) by the role label only (#191).
 */
async function loadOwnConsents(em: EntityManager, scope: ClubScope, person: Person): Promise<MemberConsentsView> {
  const view = consentsView(parseStoredConsents(person.consents))
  const family = (await loadFamilies(em, scope, [person.id])).get(person.id) as Set<string>
  const authors = consentAuthorIds([view])
  const outsiders = authors.filter((id) => !family.has(id))
  const relatives = authors.filter((id) => family.has(id) && id !== person.id)
  const roles = await loadAuthorRoles(em, scope, outsiders)
  const persons = await loadPersons(em, scope, relatives)
  return withConsentAuthors(view, {
    family,
    names: new Map([
      [person.id, fullName(person)],
      ...[...persons.values()].map((relative): [string, string] => [relative.id, fullName(relative)]),
    ]),
    roles,
  })
}
