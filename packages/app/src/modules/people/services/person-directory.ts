// `people.personDirectory` (club spec *Architecture* → modules that require `people` reach it through DI, never through
// its entities): the names of persons of one organization, decrypted, for a consumer that has already authorized the
// rows that carry the person ids (the `groups` roster), and the existence check a consumer runs before it stores a
// person id. It returns no notes or PESEL; the account link (`findUserIds`) and the active guardians
// (`activeGuardians`) serve a consumer that notifies the people a record concerns (a cancelled session, #31). Contact
// data leaves only through `sharedContacts`, for guardians who gave `share_contact_with_coaches_at` and have an
// account (REQ-037, DD-39, #34), after the consumer has authorized the read and logged it (`auditedRead`). The people
// life-cycle spec (REQ-L10, #309) adds `consentFlags`: two booleans per participant (`image`, `trips`) from the active
// guardianships or an adult's own consents, for the coach of a session — never the consents themselves.
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { findEntityIdsBySearchTokens, type SearchTokenDatabase } from '@open-mercato/shared/lib/search/tokenLookup'
import type { CalendarDate } from '@vereino/core'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { PERSON_ENTITY_ID } from '../encryption'
import { contactSharingFilter } from '../lib/contact-sharing'
import { publicPersonName } from '../lib/member-rules'
import {
  effectiveConsents,
  holdsOwnConsents,
  parseStoredConsents,
  type EffectiveConsents,
  type StoredConsents,
} from '../lib/people-rules'
import { holdersBySectionDay, sectionDaysSpan, type SectionDay } from '../lib/section-role-holders'
import type { ClubScope } from './club-clock'
import { formerMemberLabel } from './former-member'

/**
 * The display data of a person a consumer may show next to the record it authorized. An anonymised person (#308) reads
 * as the localised "Former member" in `firstName` with an empty `lastName` (a `first last` join reads well) and
 * `anonymized: true`; the name kept under the retention hold never leaves `people` through the directory.
 */
export type PersonDirectoryEntry = {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  anonymized?: boolean
}

export type PersonDirectory = {
  /**
   * The live persons of the organization among `ids`, by id; unknown or deleted ids are absent. `em` is the caller's
   * EntityManager when the read must run in its transaction.
   */
  findPersons(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, PersonDirectoryEntry>>
  /** The `auth` user id of every live person among `ids` that has an account, by person id. */
  findUserIds(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, string>>
  /** The guardians of each ward among `wardIds` whose guardianship is active on `today`, by ward id. */
  activeGuardians(
    scope: ClubScope,
    wardIds: readonly string[],
    today: CalendarDate,
    em?: EntityManager,
  ): Promise<Map<string, string[]>>
  /**
   * The persons among `ids` who gave the consent `share_presence_with_guardians_at` (REQ-006): the guardians whose
   * wards' names other guardians may see on a session (#32). Ids only.
   */
  presenceConsents(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Set<string>>
  /**
   * The persons among `ids` who gave the consent `share_contact_with_coaches_at` and have an account (REQ-037, DD-39:
   * the consent lives in the profile, so a guardian without an account never shares). Ids only — for the audit row
   * written before the contacts are read (#34).
   */
  contactConsents(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Set<string>>
  /**
   * The decrypted name, phone and e-mail of the persons among `ids` who still consent and have an account (the consent
   * is checked again at read time). Call only after authorizing and logging the read (`auditedRead`).
   */
  sharedContacts(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, SharedContact>>
  /**
   * The primary payer of each ward among `wardIds` whose guardianship with `is_primary_payer` is active on `date`, by
   * ward id (the payments period generator, #108). A ward has at most one (partial unique index).
   */
  primaryPayers(
    scope: ClubScope,
    wardIds: readonly string[],
    date: CalendarDate,
    em?: EntityManager,
  ): Promise<Map<string, string>>
  /**
   * The public name ("First L.", `publicPersonName`) of each person among `ids` who gave `publish_name_consent_at`
   * (DD-29), by id; a person without the consent is absent. For the instructors of the public club pages (#91): the
   * full last name never leaves `people`.
   */
  publicNames(scope: ClubScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, string>>
  /** The persons holding a live `role` assignment active on `date` (the coach picker of the activity wizard, #93). */
  roleHolderIdsOn(
    scope: ClubScope,
    role: RoleAssignment['role'],
    date: CalendarDate,
    em?: EntityManager,
  ): Promise<string[]>
  /**
   * The persons holding a live `coordinator` assignment of `sectionId` active on `date` (the addressed staff of a
   * member's direct thread to a section's coordinators; foundation III DD-M18, #138).
   */
  sectionCoordinatorIdsOn(
    scope: ClubScope,
    sectionId: string,
    date: CalendarDate,
    em?: EntityManager,
  ): Promise<string[]>
  /**
   * `sectionCoordinatorIdsOn` for many (section, day) pairs in one read: the coordinators of each pair, by
   * `<sectionId>:<date>` (`sectionDayKey`); every pair has an entry. For a consumer that would otherwise read once per
   * pair (the reschedule notices of a long closure, #394).
   */
  sectionCoordinatorIdsOnDays(
    scope: ClubScope,
    pairs: readonly SectionDay[],
    em?: EntityManager,
  ): Promise<Map<string, string[]>>
  /**
   * The ids of the persons whose first or last name matches every word of `term` (prefixes of three characters or
   * more), through the platform's hashed `search_tokens` — the names are encrypted. Null when the index was not
   * consulted (no word long enough). For a consumer that filters its own records by a person's name (the payments
   * charge list, #109); ids only.
   */
  searchPersonIds(scope: ClubScope, term: string, em?: EntityManager): Promise<Set<string> | null>
  /**
   * Whether each live person among `ids` has the `image` and the `trips` consent on `today` (people life-cycle spec
   * REQ-L10, #309): an adult's own decision, else the most recent decision among the guardianships active on `today`.
   * Two booleans only, for the coach of the session whose participants `ids` are; the consumer authorizes that first.
   */
  consentFlags(
    scope: ClubScope,
    ids: readonly string[],
    today: CalendarDate,
    em?: EntityManager,
  ): Promise<Map<string, ConsentFlags>>
}

/** The two consents a coach sees as flags beside a participant (REQ-L10). */
export type ConsentFlags = { image: boolean; trips: boolean }

/** A guardian's contact details shared with the coaches of their wards' groups (REQ-037). */
export type SharedContact = {
  id: string
  firstName: string
  lastName: string
  phone: string | null
  email: string | null
}

export async function findPersons(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, PersonDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await findWithDecryption(
    em,
    Person,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'firstName', 'lastName', 'birthDate', 'anonymizedAt'] },
    scope,
  )
  const formerMember = rows.some((row) => row.anonymizedAt) ? await formerMemberLabel() : ''
  return new Map(
    rows.map((row) => {
      if (!row.anonymizedAt) {
        return [row.id, { id: row.id, firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate ?? null }]
      }
      return [row.id, { id: row.id, firstName: formerMember, lastName: '', birthDate: null, anonymized: true }]
    }),
  )
}

export async function findUserIds(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Person,
    { id: { $in: unique }, ...scope, deletedAt: null, userId: { $ne: null } },
    { fields: ['id', 'userId'] },
  )
  return new Map(rows.flatMap((row) => (row.userId ? [[row.id, row.userId] as const] : [])))
}

export async function activeGuardians(
  em: EntityManager,
  scope: ClubScope,
  wardIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, string[]>> {
  const unique = [...new Set(wardIds)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Guardianship,
    {
      ...scope,
      wardPersonId: { $in: unique },
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['id', 'wardPersonId', 'guardianPersonId'] },
  )
  const byWard = new Map<string, string[]>()
  for (const row of rows) byWard.set(row.wardPersonId, [...(byWard.get(row.wardPersonId) ?? []), row.guardianPersonId])
  return byWard
}

export async function primaryPayers(
  em: EntityManager,
  scope: ClubScope,
  wardIds: readonly string[],
  date: CalendarDate,
): Promise<Map<string, string>> {
  const unique = [...new Set(wardIds)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Guardianship,
    {
      ...scope,
      wardPersonId: { $in: unique },
      isPrimaryPayer: true,
      deletedAt: null,
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    },
    { fields: ['id', 'wardPersonId', 'guardianPersonId'] },
  )
  return new Map(rows.map((row) => [row.wardPersonId, row.guardianPersonId]))
}

export async function presenceConsents(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Set<string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Set()
  const rows = await em.find(
    Person,
    { id: { $in: unique }, ...scope, deletedAt: null, sharePresenceWithGuardiansAt: { $ne: null } },
    { fields: ['id'] },
  )
  return new Set(rows.map((row) => row.id))
}

export async function contactConsents(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await em.find(Person, contactSharingFilter(scope, ids), { fields: ['id'] })
  return new Set(rows.map((row) => row.id))
}

export async function sharedContacts(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, SharedContact>> {
  if (ids.length === 0) return new Map()
  const rows = await findWithDecryption(
    em,
    Person,
    contactSharingFilter(scope, ids),
    { fields: ['id', 'firstName', 'lastName', 'phone', 'email'] },
    scope,
  )
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        firstName: row.firstName,
        lastName: row.lastName,
        phone: row.phone ?? null,
        email: row.email ?? null,
      },
    ]),
  )
}

export async function publicNames(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await findWithDecryption(
    em,
    Person,
    { id: { $in: unique }, ...scope, deletedAt: null, publishNameConsentAt: { $ne: null } },
    { fields: ['id', 'firstName', 'lastName'] },
    scope,
  )
  return new Map(
    rows.flatMap((row) => {
      const name = publicPersonName(row.firstName, row.lastName)
      return name ? [[row.id, name] as const] : []
    }),
  )
}

export async function roleHolderIdsOn(
  em: EntityManager,
  scope: ClubScope,
  role: RoleAssignment['role'],
  date: CalendarDate,
): Promise<string[]> {
  const rows = await em.find(
    RoleAssignment,
    {
      ...scope,
      deletedAt: null,
      role,
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    },
    { fields: ['id', 'personId'] },
  )
  return [...new Set(rows.map((row) => row.personId))]
}

export async function sectionCoordinatorIdsOn(
  em: EntityManager,
  scope: ClubScope,
  sectionId: string,
  date: CalendarDate,
): Promise<string[]> {
  const rows = await em.find(
    RoleAssignment,
    {
      ...scope,
      deletedAt: null,
      role: 'coordinator',
      sectionId,
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    },
    { fields: ['id', 'personId'] },
  )
  return [...new Set(rows.map((row) => row.personId))]
}

export async function sectionCoordinatorIdsOnDays(
  em: EntityManager,
  scope: ClubScope,
  pairs: readonly SectionDay[],
): Promise<Map<string, string[]>> {
  const span = sectionDaysSpan(pairs)
  if (!span) return new Map()
  const rows = await em.find(
    RoleAssignment,
    {
      ...scope,
      deletedAt: null,
      role: 'coordinator',
      sectionId: { $in: [...new Set(pairs.map((pair) => pair.sectionId))] },
      validFrom: { $lte: span.to },
      $or: [{ validTo: null }, { validTo: { $gte: span.from } }],
    },
    { fields: ['id', 'personId', 'sectionId', 'validFrom', 'validTo'] },
  )
  return holdersBySectionDay(
    pairs,
    rows.map((row) => ({
      personId: row.personId,
      sectionId: row.sectionId ?? null,
      validFrom: row.validFrom,
      validTo: row.validTo ?? null,
    })),
  )
}

export async function searchPersonIds(em: EntityManager, scope: ClubScope, term: string): Promise<Set<string> | null> {
  const result = await findEntityIdsBySearchTokens({
    db: em.getKysely<SearchTokenDatabase>(),
    entityType: PERSON_ENTITY_ID,
    query: term,
    fields: ['first_name', 'last_name'],
    scope,
  })
  if (!result.matched) return null
  if (result.ids.length === 0) return new Set()
  // A name kept under the retention hold keeps its tokens until the job clears it: never a match (#308).
  const anonymized = await em.find(
    Person,
    { id: { $in: result.ids }, ...scope, anonymizedAt: { $ne: null } },
    { fields: ['id'] },
  )
  const hidden = new Set(anonymized.map((row) => row.id))
  return new Set(result.ids.filter((id) => !hidden.has(id)))
}

/**
 * The consents that hold on `today` for each live person among `ids` (REQ-L10): an adult's own decision when they made
 * one, else the most recent decision among the guardianships active on `today`; a person nobody decided for has none.
 */
export async function effectiveConsentsOf(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
  today: CalendarDate,
): Promise<Map<string, EffectiveConsents>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const [persons, links] = await Promise.all([
    em.find(Person, { id: { $in: unique }, ...scope, deletedAt: null }, { fields: ['id', 'birthDate', 'consents'] }),
    em.find(
      Guardianship,
      {
        ...scope,
        wardPersonId: { $in: unique },
        deletedAt: null,
        validFrom: { $lte: today },
        $or: [{ validTo: null }, { validTo: { $gte: today } }],
      },
      { fields: ['id', 'wardPersonId', 'consents'] },
    ),
  ])
  const guardianConsents = new Map<string, StoredConsents[]>()
  for (const link of links) {
    const list = guardianConsents.get(link.wardPersonId) ?? []
    list.push(parseStoredConsents(link.consents))
    guardianConsents.set(link.wardPersonId, list)
  }
  return new Map(
    persons.map((person) => {
      const own = holdsOwnConsents(person.birthDate, today) ? parseStoredConsents(person.consents) : null
      return [person.id, effectiveConsents(own, guardianConsents.get(person.id) ?? [])]
    }),
  )
}

export async function consentFlags(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
  today: CalendarDate,
): Promise<Map<string, ConsentFlags>> {
  const consents = await effectiveConsentsOf(em, scope, ids, today)
  return new Map([...consents].map(([id, given]) => [id, { image: given.image, trips: given.trips }]))
}

export function createPersonDirectory(getEm: () => EntityManager): PersonDirectory {
  return {
    findPersons: (scope, ids, em) => findPersons(em ?? getEm().fork(), scope, ids),
    findUserIds: (scope, ids, em) => findUserIds(em ?? getEm().fork(), scope, ids),
    activeGuardians: (scope, wardIds, today, em) => activeGuardians(em ?? getEm().fork(), scope, wardIds, today),
    primaryPayers: (scope, wardIds, date, em) => primaryPayers(em ?? getEm().fork(), scope, wardIds, date),
    presenceConsents: (scope, ids, em) => presenceConsents(em ?? getEm().fork(), scope, ids),
    contactConsents: (scope, ids, em) => contactConsents(em ?? getEm().fork(), scope, ids),
    sharedContacts: (scope, ids, em) => sharedContacts(em ?? getEm().fork(), scope, ids),
    publicNames: (scope, ids, em) => publicNames(em ?? getEm().fork(), scope, ids),
    roleHolderIdsOn: (scope, role, date, em) => roleHolderIdsOn(em ?? getEm().fork(), scope, role, date),
    sectionCoordinatorIdsOn: (scope, sectionId, date, em) =>
      sectionCoordinatorIdsOn(em ?? getEm().fork(), scope, sectionId, date),
    sectionCoordinatorIdsOnDays: (scope, pairs, em) => sectionCoordinatorIdsOnDays(em ?? getEm().fork(), scope, pairs),
    searchPersonIds: (scope, term, em) => searchPersonIds(em ?? getEm().fork(), scope, term),
    consentFlags: (scope, ids, today, em) => consentFlags(em ?? getEm().fork(), scope, ids, today),
  }
}
