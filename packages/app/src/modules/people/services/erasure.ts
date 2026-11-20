// Erasure and removal (people life-cycle spec REQ-L05, DD-L06, DD-L07, *Security → Erasure*; phase L6, #308): the facts
// `people.persons.anonymize` and `people.persons.delete` decide on, read with the caller's EntityManager in the
// command's transaction, and the writes of the erasure itself. Other modules are reached only through the departure
// contributors (`people.departure.<module>`): `payments` reports open charges and cash held and gives the retention
// hold; every contributor answers `hasHistory`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { CalendarDate } from '@vereino/core'
import { DepartureRequest, Guardianship, Person, PersonImportRow, RoleAssignment } from '../data/entities'
import type { ContributorNotice, OwnHistory } from '../lib/erasure-rules'
import { PERSON_PHOTO_OWNER_ENTITY, PERSON_PHOTO_PARTITION } from '../lib/person-photo'
import { departureContributors } from './departure'

type ClubScope = { tenantId: string; organizationId: string }

/** The `payments` notices for one person on `today` (open charges as debtor or payer, cash held); none without it. */
export async function paymentNotices(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  today: CalendarDate,
): Promise<ContributorNotice[]> {
  const payments = departureContributors(container).find((entry) => entry.module === 'payments')
  if (!payments) return []
  const part = await payments.contributor.preview(em, { ...scope, personIds: [personId], lastDay: today })
  return [...part.blockers, ...part.warnings]
    .filter((notice) => notice.personId === personId)
    .map((notice) => ({
      module: notice.module,
      code: notice.code,
      ...(notice.recordId ? { recordId: notice.recordId } : {}),
      ...(notice.params ? { params: notice.params } : {}),
    }))
}

/** The retention hold `payments` gives for the person (DD-L07); null without `payments` or without a payment. */
export async function retentionHold(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
): Promise<CalendarDate | null> {
  const payments = departureContributors(container).find((entry) => entry.module === 'payments')
  if (!payments?.contributor.retentionHoldUntil) return null
  return payments.contributor.retentionHoldUntil(em, { ...scope, personId })
}

/** How many guardianships of the person (as guardian or ward) are active on `today`. */
export async function activeGuardianshipCount(
  em: EntityManager,
  scope: ClubScope,
  personId: string,
  today: CalendarDate,
): Promise<number> {
  return em.count(Guardianship, {
    ...scope,
    deletedAt: null,
    $and: [
      { $or: [{ guardianPersonId: personId }, { wardPersonId: personId }] },
      { validFrom: { $lte: today } },
      { $or: [{ validTo: null }, { validTo: { $gte: today } }] },
    ],
  })
}

/**
 * The recorded erasure request the administrator chose: one of the person's own requests, with "also delete the
 * data", not declined. Null when it is anything else (the anonymisation is then refused with `request_missing`).
 */
export async function erasureRequest(
  em: EntityManager,
  scope: ClubScope,
  personId: string,
  requestId: string,
): Promise<DepartureRequest | null> {
  return em.findOne(DepartureRequest, {
    id: requestId,
    ...scope,
    subjectPersonId: personId,
    erasureRequested: true,
    status: { $ne: 'declined' },
    deletedAt: null,
  })
}

/** The person's own records in `people` that make them more than a mistaken entry (*Mistaken person*). */
export async function ownHistory(em: EntityManager, scope: ClubScope, person: Person): Promise<OwnHistory> {
  const personId = person.id
  const [guardianships, roleAssignments, departureRequests] = await Promise.all([
    em.count(Guardianship, {
      ...scope,
      deletedAt: null,
      $or: [{ guardianPersonId: personId }, { wardPersonId: personId }],
    }),
    em.count(RoleAssignment, { ...scope, deletedAt: null, personId }),
    em.count(DepartureRequest, { ...scope, deletedAt: null, subjectPersonId: personId }),
  ])
  return { hasAccount: Boolean(person.userId), guardianships, roleAssignments, departureRequests }
}

/** The modules that report any record of the person, ever, in the contributor order. */
export async function modulesWithHistory(
  em: EntityManager,
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
): Promise<string[]> {
  const modules: string[] = []
  for (const { module, contributor } of departureContributors(container)) {
    if (await contributor.hasHistory(em, { ...scope, personId })) modules.push(module)
  }
  return modules
}

/** What the erasure wrote besides the person row (counts only, for the audit entry). */
export type ErasureCounts = { guardianships: number; departureRequests: number; importRows: number }

/**
 * Erases the person's data at once (*Security → Erasure*): phone, e-mail, notes, PESEL and its hash, external id and
 * its hash, the photo pointer, birth date, locale, the three `…_at` consents and the own consents; the name too when
 * no hold keeps it (`keepNameUntil` null). Also the consents on the guardianships where the person is the ward (ended
 * ones included), the notes and decline reasons of their departure requests, and the source data of staged import
 * rows that matched them. Ids and dates stay everywhere. Runs in the caller's transaction.
 */
export async function erasePersonData(
  em: EntityManager,
  scope: ClubScope,
  person: Person,
  keepNameUntil: CalendarDate | null,
  now: Date,
): Promise<ErasureCounts> {
  person.phone = null
  person.email = null
  person.notes = null
  person.pesel = null
  person.peselHash = null
  person.externalId = null
  person.externalIdHash = null
  person.photoAttachmentId = null
  person.birthDate = null
  person.preferredLocale = null
  person.shareContactWithCoachesAt = null
  person.sharePresenceWithGuardiansAt = null
  person.publishNameConsentAt = null
  person.consents = {}
  if (!keepNameUntil) {
    person.firstName = ''
    person.lastName = ''
  }
  person.anonymizedAt = now
  person.erasureHoldUntil = keepNameUntil
  person.updatedAt = now
  const guardianships = await em.nativeUpdate(
    Guardianship,
    { ...scope, wardPersonId: person.id },
    { consents: {}, updatedAt: now },
  )
  const departureRequests = await em.nativeUpdate(
    DepartureRequest,
    { ...scope, subjectPersonId: person.id },
    { note: null, declineReason: null, updatedAt: now },
  )
  const importRows = await em.nativeUpdate(
    PersonImportRow,
    { ...scope, $or: [{ matchedPersonId: person.id }, { decisionPersonId: person.id }] },
    { raw: null },
  )
  return { guardianships, departureRequests, importRows }
}

/** Step 5 of the daily job: the name of an anonymised person whose hold has passed is cleared with the hold date. */
export function clearHeldName(person: Person, now: Date): void {
  person.firstName = ''
  person.lastName = ''
  person.erasureHoldUntil = null
  person.updatedAt = now
}

type PhotoLog = { snapshotBefore?: unknown; snapshotAfter?: unknown }

function photoIdOf(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null
  const value = (snapshot as { photoAttachmentId?: unknown }).photoAttachmentId
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Every photo file the person had: the current pointer and the ones earlier uploads and removals left in
 * `attachments` (their ids are in the photo commands' audit entries, read through the audit API, never in SQL over
 * the encrypted columns — lesson `action-log-columns-encrypted-at-rest`).
 */
export async function photoFileIds(
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  current: string | null,
): Promise<string[]> {
  const ids = new Set<string>(current ? [current] : [])
  if (!container.hasRegistration('actionLogService')) return [...ids]
  const logs = container.resolve<{ list(query: Record<string, unknown>): Promise<{ items: PhotoLog[] }> }>(
    'actionLogService',
  )
  for (let page = 1; page <= 10; page += 1) {
    const { items } = await logs.list({ ...scope, resourceKind: 'people.person', resourceId: personId, page, pageSize: 200 })
    for (const entry of items) {
      for (const id of [photoIdOf(entry.snapshotBefore), photoIdOf(entry.snapshotAfter)]) if (id) ids.add(id)
    }
    if (items.length < 200) break
  }
  return [...ids]
}

/**
 * Deletes the person's photo files after the erasure committed (`releaseScoped` with the owner, the file's only
 * assignment). A file already gone counts as released; a file stored before #308 with a second assignment is refused
 * by the platform (409) and counted as kept — its pointer is gone, so no route serves it.
 */
export async function releasePhotoFiles(
  container: AwilixContainer,
  scope: ClubScope,
  personId: string,
  fileIds: readonly string[],
): Promise<{ released: number; kept: number }> {
  const counts = { released: 0, kept: 0 }
  if (fileIds.length === 0 || !container.hasRegistration('attachmentService')) {
    return { released: 0, kept: fileIds.length }
  }
  const attachments = container.resolve<AttachmentService>('attachmentService')
  for (const attachmentId of fileIds) {
    try {
      await attachments.releaseScoped?.({
        attachmentId,
        ...scope,
        expectedOwner: { entityId: PERSON_PHOTO_OWNER_ENTITY, recordId: personId },
        expectedAssignment: { type: PERSON_PHOTO_OWNER_ENTITY, id: personId },
        expectedPartitionCode: PERSON_PHOTO_PARTITION,
      })
      counts.released += 1
    } catch (error: unknown) {
      if (isCrudHttpError(error) && error.status === 404) counts.released += 1
      else counts.kept += 1
    }
  }
  return counts
}
