// The person data export (person data export spec `.ai/specs/2026-11-21-vereino-person-data-export.md`, DD-X01,
// *Contributor inventory*; #527). `people` owns the contract; every other module that holds a person's data registers
// an optional contributor under `people.dataExport.<module>`, which `people` reads with `hasRegistration` — the
// direction of `people.departure.<module>`, so `people` never imports those modules. Contributors read with the
// caller's EntityManager, filter every query by the subject's tenant and organization, and show another person only
// through `redactPerson` (art. 15(4)). `foundation_deliveries` comes through the foundation's public helper
// `personDeliveriesForExport`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { tryGetModules } from '@open-mercato/shared/lib/modules/registry'
import { accountView, personDeliveriesForExport } from '@/modules/foundation'
import { DepartureRequest, Guardianship, Person, PersonImport, PersonImportRow, RoleAssignment } from '../data/entities'
import {
  PESEL_WITHHELD,
  assembleDataExport,
  omittedParts,
  redactConsents,
  redactPerson,
  type DataExportPart,
  type DataExportRow,
  type PersonDataExportDocument,
} from '../lib/data-export'
import { visibleName } from '../lib/erasure-rules'
import { consentsView, parseStoredConsents } from '../lib/people-rules'
import { formerMemberLabel } from './former-member'

export type {
  DataExportActorCount,
  DataExportPart,
  DataExportRow,
  DataExportSection,
  OtherPersonRef,
} from '../lib/data-export'
export { redactPerson } from '../lib/data-export'

/** The modules that may contribute, in the order their parts appear in the file. */
export const DATA_EXPORT_CONTRIBUTOR_MODULES = [
  'groups',
  'activities',
  'communication',
  'payments',
  'facilities',
  'club_core',
] as const
export type DataExportContributorModule = (typeof DATA_EXPORT_CONTRIBUTOR_MODULES)[number]

/** DI token of a module's contributor, e.g. `people.dataExport.groups`. */
export function dataExportContributorToken(module: DataExportContributorModule): string {
  return `people.dataExport.${module}`
}

/** The subject and the trusted scope (never from a payload); `userId` is the subject's account, if any. */
export type PersonDataExportSubject = {
  tenantId: string
  organizationId: string
  personId: string
  userId: string | null
}

/**
 * A module's part of the export. Read only; filters every query by `tenantId` and `organizationId` (a user id alone
 * never selects rows); throws to abort the whole export (no partial file).
 */
export type PersonDataExportContributor = {
  export(em: EntityManager, subject: PersonDataExportSubject): Promise<DataExportPart>
}

/** The registered contributors in `DATA_EXPORT_CONTRIBUTOR_MODULES` order. */
export function dataExportContributors(
  container: AwilixContainer,
): Array<{ module: DataExportContributorModule; contributor: PersonDataExportContributor }> {
  return DATA_EXPORT_CONTRIBUTOR_MODULES.filter((module) =>
    container.hasRegistration(dataExportContributorToken(module)),
  ).map((module) => ({
    module,
    contributor: container.resolve<PersonDataExportContributor>(dataExportContributorToken(module)),
  }))
}

/** The ids of the modules in `src/modules.ts` (null when the registry is not bootstrapped: every module counts). */
function enabledModuleIds(): Set<string> | null {
  const modules = tryGetModules()
  return modules ? new Set(modules.map((entry) => entry.id)) : null
}

type Scope = { tenantId: string; organizationId: string }

/** Display names of other persons of the organization ("Former member" for an anonymised one). */
async function otherNames(em: EntityManager, scope: Scope, ids: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await findWithDecryption(
    em,
    Person,
    { id: { $in: unique }, ...scope },
    { fields: ['id', 'firstName', 'lastName', 'anonymizedAt'] },
    scope,
  )
  const formerMember = await formerMemberLabel()
  return new Map(
    rows.map((row) => {
      const name = visibleName(row, formerMember, false)
      return [row.id, `${name.firstName} ${name.lastName}`.trim()]
    }),
  )
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** The subject's own record (A1): decrypted, the PESEL only with `people.pesel.view` (DD-X08). */
export async function subjectRecord(
  container: AwilixContainer,
  scope: Scope,
  person: Person,
  withPesel: boolean,
): Promise<DataExportRow> {
  const account = await accountView(container, scope, person.userId)
  return {
    id: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    birthDate: person.birthDate ?? null,
    email: person.email ?? null,
    phone: person.phone ?? null,
    notes: person.notes ?? null,
    pesel: person.pesel ? (withPesel ? person.pesel : PESEL_WITHHELD) : null,
    externalId: person.externalId ?? null,
    preferredLocale: person.preferredLocale ?? null,
    account: { state: account.state, email: account.email ?? null },
    consents: redactConsents(consentsView(parseStoredConsents(person.consents)), person.id),
    shareContactWithCoachesAt: iso(person.shareContactWithCoachesAt),
    sharePresenceWithGuardiansAt: iso(person.sharePresenceWithGuardiansAt),
    publishNameConsentAt: iso(person.publishNameConsentAt),
    photo: person.photoAttachmentId ? { attachmentId: person.photoAttachmentId } : null,
    leftOn: person.leftOn ?? null,
    anonymizedAt: iso(person.anonymizedAt),
    erasureHoldUntil: person.erasureHoldUntil ?? null,
    createdAt: iso(person.createdAt),
    updatedAt: iso(person.updatedAt),
  }
}

/** The import rows naming the subject: matched, decided, or written for them by the commit. */
async function importRowIds(em: EntityManager, subject: PersonDataExportSubject): Promise<string[]> {
  const rows = await em.getConnection().execute<Array<{ id: string }>>(
    `select id from people_import_rows
      where tenant_id = ? and organization_id = ? and deleted_at is null
        and (matched_person_id = ? or decision_person_id = ?
             or jsonb_exists(coalesce(result::jsonb -> 'personIds', '[]'::jsonb), ?))`,
    [subject.tenantId, subject.organizationId, subject.personId, subject.personId, subject.personId],
  )
  return rows.map((row) => row.id)
}

function parseRaw(raw: string | null | undefined): unknown {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/** `people`'s own part: role assignments, guardianships both ways, departure requests, import rows (A1, A2). */
export async function peoplePart(em: EntityManager, subject: PersonDataExportSubject): Promise<DataExportPart> {
  const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const live = { ...scope, deletedAt: null }
  const personId = subject.personId
  const [roles, guardianships, requests, rowIds, decided, importsCreated, importsCommitted] = await Promise.all([
    em.find(RoleAssignment, { ...live, personId }, { orderBy: { validFrom: 'asc' } }),
    em.find(
      Guardianship,
      { ...live, $or: [{ guardianPersonId: personId }, { wardPersonId: personId }] },
      { orderBy: { validFrom: 'asc' } },
    ),
    findWithDecryption(
      em,
      DepartureRequest,
      { ...live, $or: [{ subjectPersonId: personId }, { requestedByPersonId: personId }] },
      { orderBy: { createdAt: 'asc' } },
      scope,
    ),
    importRowIds(em, subject),
    em.count(DepartureRequest, { ...live, decidedByPersonId: personId }),
    em.count(PersonImport, { ...live, createdByPersonId: personId }),
    em.count(PersonImport, { ...live, committedByPersonId: personId }),
  ])
  const importRows =
    rowIds.length > 0
      ? await findWithDecryption(
          em,
          PersonImportRow,
          { ...scope, id: { $in: rowIds } },
          { orderBy: { createdAt: 'asc' } },
          scope,
        )
      : []
  const names = await otherNames(em, scope, [
    ...guardianships.map((row) => (row.guardianPersonId === personId ? row.wardPersonId : row.guardianPersonId)),
    ...requests.map((row) => (row.subjectPersonId === personId ? row.requestedByPersonId : row.subjectPersonId) ?? ''),
  ])
  return {
    sections: [
      {
        module: 'people',
        table: 'people_role_assignments',
        activity: 'A1',
        portable: false,
        rows: roles.map((row) => ({
          id: row.id,
          role: row.role,
          sectionId: row.sectionId ?? null,
          placeId: row.placeId ?? null,
          validFrom: row.validFrom,
          validTo: row.validTo ?? null,
        })),
      },
      {
        module: 'people',
        table: 'people_guardianships',
        activity: 'A2',
        portable: true,
        rows: guardianships.map((row) => {
          const asGuardian = row.guardianPersonId === personId
          const otherId = asGuardian ? row.wardPersonId : row.guardianPersonId
          return {
            id: row.id,
            relation: asGuardian ? 'guardian' : 'ward',
            other: redactPerson(asGuardian ? 'ward' : 'guardian', names.get(otherId)),
            kind: row.relation,
            isPrimaryPayer: row.isPrimaryPayer,
            validFrom: row.validFrom,
            validTo: row.validTo ?? null,
            consents: redactConsents(consentsView(parseStoredConsents(row.consents)), personId),
          }
        }),
      },
      {
        module: 'people',
        table: 'people_departure_requests',
        activity: 'A1',
        portable: false,
        rows: requests.map((row) => {
          const forSubject = row.subjectPersonId === personId
          const requester =
            row.requestedByPersonId === personId
              ? 'subject'
              : row.requestedByPersonId
                ? redactPerson(
                    row.requesterKind === 'guardian' ? 'guardian' : 'requester',
                    names.get(row.requestedByPersonId),
                  )
                : null
          return {
            id: row.id,
            about: forSubject ? 'subject' : redactPerson('ward', names.get(row.subjectPersonId)),
            requester,
            requesterKind: row.requesterKind,
            requestedLastDay: row.requestedLastDay ?? null,
            erasureRequested: row.erasureRequested,
            note: row.note ?? null,
            status: row.status,
            decidedBy: row.decidedByPersonId ? redactPerson('staff') : null,
            decidedAt: iso(row.decidedAt),
            declineReason: row.declineReason ?? null,
            createdAt: iso(row.createdAt),
          }
        }),
      },
      {
        module: 'people',
        table: 'people_import_rows',
        activity: 'A12',
        portable: false,
        reviewFields: ['raw'],
        rows: importRows.map((row) => ({
          id: row.id,
          importId: row.importId,
          rowNo: row.rowNo,
          raw: parseRaw(row.raw),
          classification: row.classification,
          decision: row.decision ?? null,
          committedAt: iso(row.committedAt),
          createdAt: iso(row.createdAt),
        })),
      },
    ],
    actorCounts: [
      { module: 'people', table: 'people_departure_requests', count: decided },
      { module: 'people', table: 'people_imports', count: importsCreated + importsCommitted },
    ],
  }
}

/** The foundation's part (A4 deliveries; dispatches sent as staff counted), through its public helper. */
export async function foundationPart(em: EntityManager, subject: PersonDataExportSubject): Promise<DataExportPart> {
  const { deliveries, dispatchesSent } = await personDeliveriesForExport(em, subject)
  return {
    sections: [
      { module: 'foundation', table: 'foundation_deliveries', activity: 'A4', portable: false, rows: deliveries },
    ],
    actorCounts: [{ module: 'foundation', table: 'foundation_dispatches', count: dispatchesSent }],
  }
}

/**
 * The whole document: the subject, `people`'s part, the foundation's part, every registered contributor in order on
 * one EntityManager, and the `omitted` list. A contributor that throws aborts the export.
 */
export async function buildPersonDataExport(
  container: AwilixContainer,
  person: Person,
  options: { withPesel: boolean; now?: Date },
): Promise<PersonDataExportDocument> {
  const scope = { tenantId: person.tenantId, organizationId: person.organizationId }
  const subject: PersonDataExportSubject = { ...scope, personId: person.id, userId: person.userId ?? null }
  const em = container.resolve<EntityManager>('em').fork()
  const parts: DataExportPart[] = [await peoplePart(em, subject), await foundationPart(em, subject)]
  const registered = dataExportContributors(container)
  for (const { contributor } of registered) parts.push(await contributor.export(em, subject))
  const enabled = enabledModuleIds()
  const registeredIds = new Set<string>(registered.map((entry) => entry.module))
  return assembleDataExport({
    generatedAt: options.now ?? new Date(),
    subject: await subjectRecord(container, scope, person, options.withPesel),
    parts,
    omitted: omittedParts(
      DATA_EXPORT_CONTRIBUTOR_MODULES.map((module) => ({
        module,
        enabled: enabled ? enabled.has(module) : true,
        registered: registeredIds.has(module),
      })),
    ),
  })
}
