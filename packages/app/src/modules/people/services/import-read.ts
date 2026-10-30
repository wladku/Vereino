// Reads behind the `people` import routes (#28): the import history with who ran each import, one import, and its
// staged rows (decrypted values) paged and filtered by classification. Every read is narrowed to the trusted tenant
// and organization; the routes check the caller's `club_admin` grant with `assertInScope` first.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findAndCountWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Person, PersonImport, PersonImportRow } from '../data/entities'
import type { NormalizedImportRow } from '../lib/import-rules'
import type { ClubScope } from './club-clock'

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
  updatedAt: string
}

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
  committedAt: string | null
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

function importView(record: PersonImport, names: Map<string, string>, pending: Map<string, number>): ImportView {
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
  return {
    items: records.map((record) => importView(record, names, pending)),
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
  return importView(record, names, await pendingCounts(em, scope, [record.id]))
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
  const record = await em.findOne(PersonImport, { id: importId, ...scope, deletedAt: null }, { fields: ['id'] })
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
  const items = rows.map((row): ImportRowView => {
    const stored = row.raw ? (JSON.parse(row.raw) as NormalizedImportRow) : null
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
      committedAt: iso(row.committedAt),
      values: stored ? { persons: stored.persons, group: stored.group } : null,
      updatedAt: row.updatedAt.toISOString(),
    }
  })
  return { items, total, page: query.page, pageSize: query.pageSize, totalPages: Math.ceil(total / query.pageSize) }
}
