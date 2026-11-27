// The history of a person's image consent (event photos spec REQ-I06, REQ-I07; #871): the consent events of `image`,
// newest first, each with its date, who decided (a family member by name, staff by role only, #191) and whether it was
// given to the current wording (the hash of the wording shown, DD-I07). The decisions stored before history was kept
// come first as "decided before history was kept" (no backfill). For the guardian and the adult, the public photos that
// show the person now come through the optional `people.imageUsage.activities` contract (phase 2); without it, none.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import { ConsentEvent, Guardianship, Person } from '../data/entities'
import { holdsOwnConsents, parseStoredConsents } from '../lib/people-rules'
import { clubToday, type ClubScope } from './club-clock'
import { currentWordingHashes } from './consent-events'
import { findPersons } from './person-directory'

/** The optional contract `activities` registers in phase 2 (event photos spec *Reuse and Ownership Map*). */
export const IMAGE_USAGE_TOKEN = 'people.imageUsage.activities'

export type PublicPhotos = { count: number; events: { name: string; url: string }[] }

export type ImageUsageProvider = {
  publicPhotos(scope: ClubScope, personId: string, em?: EntityManager): Promise<PublicPhotos>
}

export type ImageHistoryItem = {
  granted: boolean
  at: string
  /** A family author's name (guardian, the person, the guardian whose grant was carried over); null for staff. */
  byName: string | null
  byRole: string
  currentWording: boolean
}

export type ImageHistory = {
  items: ImageHistoryItem[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  /** The image decisions stored before history was kept, oldest first (no backfill). */
  earlier: { granted: boolean; at: string }[]
}

/**
 * The image consent history of `subjectPersonId` in `scope`, one page. The caller has authorized the read (self, an
 * active guardian, or the club administrator).
 */
export async function imageHistory(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  subjectPersonId: string,
  page: number,
  pageSize: number,
  today: CalendarDate,
): Promise<ImageHistory> {
  const where = { ...scope, subjectPersonId, kind: 'image' }
  const [rows, total, first] = await Promise.all([
    em.find(ConsentEvent, where, {
      orderBy: { createdAt: 'desc', id: 'desc' },
      limit: pageSize,
      offset: (page - 1) * pageSize,
      fields: ['id', 'granted', 'createdAt', 'byPersonId', 'byRole', 'wordingSha256', 'locale'],
    }),
    em.count(ConsentEvent, where),
    em.findOne(ConsentEvent, where, { orderBy: { createdAt: 'asc' }, fields: ['id', 'createdAt'] }),
  ])
  const hashes = await currentWordingHashes(
    container,
    scope,
    'image',
    rows.map((row) => row.locale),
  )
  const familyIds = rows.flatMap((row) => (row.byRole !== 'club_admin' && row.byPersonId ? [row.byPersonId] : []))
  const names = await findPersons(em, scope, familyIds)
  const items = rows.map((row) => {
    const person = row.byRole !== 'club_admin' && row.byPersonId ? names.get(row.byPersonId) : undefined
    return {
      granted: row.granted,
      at: row.createdAt.toISOString(),
      byName: person ? `${person.firstName} ${person.lastName}`.trim() : null,
      byRole: row.byRole,
      currentWording: hashes.get(row.locale) === row.wordingSha256,
    }
  })
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    earlier: await earlierDecisions(em, scope, subjectPersonId, first?.createdAt ?? null, today),
  }
}

/** The stored image decisions older than the first consent event (all of them when there is none). */
async function earlierDecisions(
  em: EntityManager,
  scope: ClubScope,
  personId: string,
  historyStart: Date | null,
  today: CalendarDate,
): Promise<{ granted: boolean; at: string }[]> {
  const [person, links] = await Promise.all([
    em.findOne(Person, { ...scope, id: personId, deletedAt: null }, { fields: ['id', 'birthDate', 'consents'] }),
    em.find(Guardianship, { ...scope, wardPersonId: personId, deletedAt: null }, { fields: ['id', 'consents'] }),
  ])
  const stored = [
    ...(person && holdsOwnConsents(person.birthDate, today) ? [parseStoredConsents(person.consents).image] : []),
    ...links.map((link) => parseStoredConsents(link.consents).image),
  ]
  return stored
    .filter((entry): entry is NonNullable<typeof entry> => !!entry)
    .filter((entry) => !historyStart || Date.parse(entry.at) < historyStart.getTime())
    .map((entry) => ({ granted: entry.granted, at: entry.at }))
    .sort((a, b) => a.at.localeCompare(b.at))
}

/** The public photos showing the person now, from phase 2's optional contract; none without it. */
export async function publicPhotosOf(
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
): Promise<PublicPhotos> {
  if (!container.hasRegistration(IMAGE_USAGE_TOKEN)) return { count: 0, events: [] }
  return container.resolve<ImageUsageProvider>(IMAGE_USAGE_TOKEN).publicPhotos(scope, personId)
}

/**
 * Whether `callerPersonId` may read the image history of `subjectPersonId` from the member side: themself, or a
 * guardian of a guardianship active on `today`.
 */
export async function memberMayReadHistory(
  em: EntityManager,
  scope: ClubScope,
  callerPersonId: string,
  subjectPersonId: string,
  today: CalendarDate,
): Promise<boolean> {
  if (callerPersonId === subjectPersonId) return true
  const active = await em.count(Guardianship, {
    ...scope,
    guardianPersonId: callerPersonId,
    wardPersonId: subjectPersonId,
    deletedAt: null,
    validFrom: { $lte: today },
    $or: [{ validTo: null }, { validTo: { $gte: today } }],
  })
  return active > 0
}

/**
 * `GET /api/people/me/consents/{personId}/image-history`: the history and the public photos for the person linked to
 * `userId` (themself or an active ward); null when the caller has no person or may not read that history (404).
 */
export async function readMemberImageHistory(
  container: AwilixContainer,
  scope: ClubScope,
  userId: string,
  personId: string,
  page: { page: number; pageSize: number },
): Promise<(ImageHistory & { publicPhotos: PublicPhotos }) | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const caller = await em.findOne(Person, { ...scope, userId, deletedAt: null }, { fields: ['id'] })
  const today = await clubToday(container, scope, undefined, em)
  if (!caller || !(await memberMayReadHistory(em, scope, caller.id, personId, today))) return null
  const [history, publicPhotos] = await Promise.all([
    imageHistory(em, container, scope, personId, page.page, page.pageSize, today),
    publicPhotosOf(container, scope, personId),
  ])
  return { ...history, publicPhotos }
}

/** `GET /api/people/persons/{id}/consents/image-history`: the history for a caller the route authorized. */
export async function readStaffImageHistory(
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  page: { page: number; pageSize: number },
): Promise<ImageHistory> {
  const em = container.resolve<EntityManager>('em').fork()
  const today = await clubToday(container, scope, undefined, em)
  return imageHistory(em, container, scope, personId, page.page, page.pageSize, today)
}
