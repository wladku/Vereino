// `people.personDirectory` (club spec *Architecture* → modules that require `people` reach it through DI, never through
// its entities): the names of persons of one organization, decrypted, for a consumer that has already authorized the
// rows that carry the person ids (the `groups` roster), and the existence check a consumer runs before it stores a
// person id. It returns no notes or PESEL; the account link (`findUserIds`) and the active guardians
// (`activeGuardians`) serve a consumer that notifies the people a record concerns (a cancelled session, #31). Contact
// data leaves only through `sharedContacts`, for guardians who gave `share_contact_with_coaches_at` and have an
// account (REQ-037, DD-39, #34), after the consumer has authorized the read and logged it (`auditedRead`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CalendarDate } from '@vereino/core'
import { Guardianship, Person } from '../data/entities'
import type { ClubScope } from './club-clock'

/** The display data of a person a consumer may show next to the record it authorized. */
export type PersonDirectoryEntry = {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
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
}

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
    { fields: ['id', 'firstName', 'lastName', 'birthDate'] },
    scope,
  )
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, firstName: row.firstName, lastName: row.lastName, birthDate: row.birthDate ?? null },
    ]),
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

function contactConsentFilter(scope: ClubScope, ids: readonly string[]) {
  return {
    id: { $in: [...new Set(ids)] },
    ...scope,
    deletedAt: null,
    shareContactWithCoachesAt: { $ne: null },
    userId: { $ne: null },
  }
}

export async function contactConsents(
  em: EntityManager,
  scope: ClubScope,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await em.find(Person, contactConsentFilter(scope, ids), { fields: ['id'] })
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
    contactConsentFilter(scope, ids),
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

export function createPersonDirectory(getEm: () => EntityManager): PersonDirectory {
  return {
    findPersons: (scope, ids, em) => findPersons(em ?? getEm().fork(), scope, ids),
    findUserIds: (scope, ids, em) => findUserIds(em ?? getEm().fork(), scope, ids),
    activeGuardians: (scope, wardIds, today, em) => activeGuardians(em ?? getEm().fork(), scope, wardIds, today),
    presenceConsents: (scope, ids, em) => presenceConsents(em ?? getEm().fork(), scope, ids),
    contactConsents: (scope, ids, em) => contactConsents(em ?? getEm().fork(), scope, ids),
    sharedContacts: (scope, ids, em) => sharedContacts(em ?? getEm().fork(), scope, ids),
  }
}
