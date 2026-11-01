// Reads behind the `people` import routes (#28): the import history with who ran each import, one import, and its
// staged rows (decrypted values) paged and filtered by classification. Every read is narrowed to the trusted tenant
// and organization; the routes check the caller's `club_admin` grant with `assertInScope` first. With the optional
// `groups.membershipImporter` hook (#65), a preview row shows whether its group name resolves, and a committed import
// with waiting rows says that a re-run can create their memberships.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findAndCountWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Person, PersonImport, PersonImportRow } from '../data/entities'
import { GROUPS_NOT_ENABLED, type NormalizedImportRow } from '../lib/import-rules'
import type { ClubScope } from './club-clock'
import { membershipImporter, type MembershipImporter } from './membership-importer'

export type PersonRefView = { personId: string; name: string | null }

export type ImportView = {
  id: string
  status: PersonImport['status']
  fileFormat: PersonImport['fileFormat']
  rowCount: number
  summary: PersonImport['summary']
  header: string[]
  mapping: Record<string, number | undefined>
  createdBy: PersonRefView
  committedBy: PersonRefView | null
  createdAt: string
  committedAt: string | null
  cancelledAt: string | null
  purgedAt: string | null
  fileAvailable: boolean
  pendingDecisions: number
  /** A committed import with rows waiting for a membership, and the `groups` hook registered: a re-run can help. */
  canCreateMemberships: boolean
  updatedAt: string
}

/**
 * How a preview row's group would turn into a membership at the commit (#65): `group_found` (exactly one active group
 * of the club has the name), `group_not_found`, `group_ambiguous`, or `groups_not_enabled` without the hook.
 */
export type MembershipPreview = 'group_found' | 'group_not_found' | 'group_ambiguous' | typeof GROUPS_NOT_ENABLED

export type ImportRowView = {
  id: string
  rowNo: number
  classification: PersonImportRow['classification']
  decision: PersonImportRow['decision'] | null
  decisionPerson: PersonRefView | null
  matchedPerson: PersonRefView | null
  errorCode: string | null
  errorColumn: string | null
  reviewReason: string | null
  needsDecision: boolean
  groupName: string | null
  membershipStatus: string | null
  /** Before the commit only: what the commit would do with the row's group; null without a group. */
  membershipPreview: MembershipPreview | null
  committedAt: string | null
  /** After the commit: the person the row's participant became (the record page link); null before or without one. */
  participantPersonId: string | null
  /** The row's values; null once purged. */
  values: Omit<NormalizedImportRow, 'rowNo' | 'error'> | null
  updatedAt: string
}

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null)

async function personNames(em: EntityManager, scope: ClubScope, ids: readonly (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
  if (unique.length === 0) return new Map<string, string>()
  const persons = await findWithDecryption(em, Person, { ...scope, id: { $in: unique } }, undefined, scope)
  return new Map(persons.map((person) => [person.id, [person.firstName, person.lastName].filter(Boolean).join(' ')]))
}

const refView = (names: Map<string, string>, id: string | null | undefined): PersonRefView | null =>
  id ? { personId: id, name: names.get(id) ?? null } : null

async function pendingCounts(em: EntityManager, scope: ClubScope, importIds: readonly string[]) {
  if (importIds.length === 0) return new Map<string, number>()
  const rows = await em.find(
    PersonImportRow,
    { ...scope, importId: { $in: [...importIds] }, classification: 'review', decision: null },
    { fields: ['id', 'importId'] },
  )
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.importId, (counts.get(row.importId) ?? 0) + 1)
  return counts
}

function importView(
  record: PersonImport,
  names: Map<string, string>,
  pending: Map<string, number>,
  hook: boolean,
): ImportView {
  return {
    id: record.id,
    status: record.status,
    fileFormat: record.fileFormat,
    rowCount: record.rowCount,
    summary: record.summary,
    header: record.mapping.header,
    mapping: record.mapping.fields,
    createdBy: refView(names, record.createdByPersonId) as PersonRefView,
    committedBy: refView(names, record.committedByPersonId),
    createdAt: record.createdAt.toISOString(),
    committedAt: iso(record.committedAt),
    cancelledAt: iso(record.cancelledAt),
    purgedAt: iso(record.purgedAt),
    fileAvailable: Boolean(record.fileAttachmentId),
    pendingDecisions: record.status === 'previewed' ? (pending.get(record.id) ?? 0) : 0,
    canCreateMemberships: hook && record.status === 'committed' && (record.summary.membershipsPending ?? 0) > 0,
    updatedAt: record.updatedAt.toISOString(),
  }
}

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; totalPages: number }

export async function listImports(
  container: AwilixContainer,
  scope: ClubScope,
  query: { page: number; pageSize: number; status?: PersonImport['status'] },
): Promise<Paged<ImportView>> {
  const em = container.resolve<EntityManager>('em').fork()
  const [records, total] = await em.findAndCount(
    PersonImport,
    { ...scope, deletedAt: null, ...(query.status ? { status: query.status } : {}) },
    { orderBy: { createdAt: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
  )
  const names = await personNames(
    em,
    scope,
    records.flatMap((record) => [record.createdByPersonId, record.committedByPersonId]),
  )
  const pending = await pendingCounts(
    em,
    scope,
    records.map((record) => record.id),
  )
  const hook = membershipImporter(container) !== null
  return {
    items: records.map((record) => importView(record, names, pending, hook)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.ceil(total / query.pageSize),
  }
}

export async function findImport(container: AwilixContainer, scope: ClubScope, id: string): Promise<ImportView | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const record = await em.findOne(PersonImport, { id, ...scope, deletedAt: null })
  if (!record) return null
  const names = await personNames(em, scope, [record.createdByPersonId, record.committedByPersonId])
  const hook = membershipImporter(container) !== null
  return importView(record, names, await pendingCounts(em, scope, [record.id]), hook)
}

/** What the commit would do with each preview row's group, by group name (#65). */
async function previewMemberships(
  em: EntityManager,
  scope: ClubScope,
  importer: MembershipImporter | null,
  names: readonly string[],
): Promise<Map<string, MembershipPreview>> {
  const unique = [...new Set(names)]
  if (!importer) return new Map(unique.map((name) => [name, GROUPS_NOT_ENABLED]))
  const resolutions = await importer.resolveGroups(em, scope, unique)
  return new Map(
    unique.map((name) => {
      const status = resolutions.get(name)?.status ?? 'group_not_found'
      return [name, status === 'resolved' ? 'group_found' : status]
    }),
  )
}

export async function listImportRows(
  container: AwilixContainer,
  scope: ClubScope,
  importId: string,
  query: {
    page: number
    pageSize: number
    classification?: PersonImportRow['classification']
    pending?: 'true' | 'false'
  },
): Promise<Paged<ImportRowView> | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const record = await em.findOne(
    PersonImport,
    { id: importId, ...scope, deletedAt: null },
    { fields: ['id', 'status'] },
  )
  if (!record) return null
  const where: Record<string, unknown> = { ...scope, importId }
  if (query.classification) where.classification = query.classification
  if (query.pending === 'true') Object.assign(where, { classification: 'review', decision: null })
  const [rows, total] = await findAndCountWithDecryption(
    em,
    PersonImportRow,
    where,
    { orderBy: { rowNo: 'asc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
    scope,
  )
  const names = await personNames(
    em,
    scope,
    rows.flatMap((row) => [row.matchedPersonId, row.decisionPersonId]),
  )
  const stored = new Map(
    rows.map((row) => [row.id, row.raw ? (JSON.parse(row.raw) as NormalizedImportRow) : null] as const),
  )
  // Before the commit, a row that will be written shows what its group would become.
  const previewGroup = (row: PersonImportRow): string | null =>
    record.status === 'previewed' && row.classification !== 'error' ? (stored.get(row.id)?.group ?? null) : null
  const previews = await previewMemberships(
    em,
    scope,
    membershipImporter(container),
    rows.flatMap((row) => previewGroup(row) ?? []),
  )
  const items = rows.map((row): ImportRowView => {
    const values = stored.get(row.id) ?? null
    const group = previewGroup(row)
    return {
      id: row.id,
      rowNo: row.rowNo,
      classification: row.classification,
      decision: row.decision ?? null,
      decisionPerson: refView(names, row.decisionPersonId),
      matchedPerson: refView(names, row.matchedPersonId),
      errorCode: row.errorCode ?? null,
      errorColumn: row.errorColumn ?? null,
      reviewReason: row.reviewReason ?? null,
      needsDecision: row.classification === 'review' && !row.decision && !row.committedAt,
      groupName: row.groupName ?? null,
      membershipStatus: row.membershipStatus ?? null,
      membershipPreview: group ? (previews.get(group) ?? null) : null,
      committedAt: iso(row.committedAt),
      participantPersonId: row.committedAt ? (row.result?.participantPersonId ?? null) : null,
      values: values ? { persons: values.persons, group: values.group } : null,
      updatedAt: row.updatedAt.toISOString(),
    }
  })
  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) }
}
