// Reads of departure requests (people life-cycle spec *API* rows `/api/people/departure-requests` and
// `/api/people/me/departure-requests`; phase L4, #306): the administrator's list with the subjects' and requesters'
// names, the note and the decline reason (decrypted in memory), and for a guardian's request whether another active
// guardian of the child stays (*Security → Who may start what*); the member's own requests, newest first.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { CalendarDate } from '@vereino/core'
import { DepartureRequest, Person } from '../data/entities'
import { listDisplayName } from '../lib/person-list-filters'
import type { ClubScope } from './club-clock'
import { activeGuardians } from './person-directory'

export type DepartureRequestView = {
  id: string
  batchId: string
  subjectPersonId: string
  subjectName: string
  requestedByPersonId: string | null
  requestedByName: string | null
  requesterKind: 'self' | 'guardian' | 'club'
  requestedLastDay: string | null
  erasureRequested: boolean
  note: string | null
  status: 'open' | 'done' | 'declined'
  declineReason: string | null
  decidedAt: string | null
  /** Active guardians of the subject other than the requester (a guardian's request for a shared child). */
  otherGuardianCount: number
  createdAt: string
  updatedAt: string
}

function day(value: string | Date | null | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

async function views(
  em: EntityManager,
  scope: ClubScope,
  rows: DepartureRequest[],
  today: CalendarDate,
): Promise<DepartureRequestView[]> {
  const personIds = [
    ...new Set(
      rows.flatMap((row) => [row.subjectPersonId, ...(row.requestedByPersonId ? [row.requestedByPersonId] : [])]),
    ),
  ]
  const persons =
    personIds.length > 0
      ? await findWithDecryption(
          em,
          Person,
          { ...scope, id: { $in: personIds } },
          { fields: ['id', 'firstName', 'lastName'] },
          scope,
        )
      : []
  const names = new Map(persons.map((person) => [person.id, listDisplayName(person)]))
  const guardians = await activeGuardians(em, scope, [...new Set(rows.map((row) => row.subjectPersonId))], today)
  return rows.map((row) => ({
    id: row.id,
    batchId: row.batchId,
    subjectPersonId: row.subjectPersonId,
    subjectName: names.get(row.subjectPersonId) ?? '',
    requestedByPersonId: row.requestedByPersonId ?? null,
    requestedByName: row.requestedByPersonId ? (names.get(row.requestedByPersonId) ?? null) : null,
    requesterKind: row.requesterKind,
    requestedLastDay: day(row.requestedLastDay),
    erasureRequested: row.erasureRequested,
    note: row.note ?? null,
    status: row.status,
    declineReason: row.declineReason ?? null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    otherGuardianCount:
      row.requesterKind === 'guardian'
        ? (guardians.get(row.subjectPersonId) ?? []).filter((id) => id !== row.requestedByPersonId).length
        : 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

/** The administrator's list (`{ items, total, page, pageSize, totalPages }`), oldest first. */
export async function listDepartureRequests(
  container: AwilixContainer,
  scope: ClubScope,
  query: { status?: 'open' | 'done' | 'declined'; subjectPersonId?: string; page: number; pageSize: number },
  today: CalendarDate,
) {
  const em = container.resolve<EntityManager>('em').fork()
  const where = {
    ...scope,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.subjectPersonId ? { subjectPersonId: query.subjectPersonId } : {}),
  }
  const total = await em.count(DepartureRequest, where)
  const rows = await findWithDecryption(
    em,
    DepartureRequest,
    where,
    { orderBy: { createdAt: 'asc', id: 'asc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize },
    scope,
  )
  return {
    items: await views(em, scope, rows, today),
    total,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  }
}

/** The requests a member filed (all states), newest first, at most 50. */
export async function memberDepartureRequests(
  container: AwilixContainer,
  scope: ClubScope,
  callerPersonId: string,
  today: CalendarDate,
): Promise<DepartureRequestView[]> {
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await findWithDecryption(
    em,
    DepartureRequest,
    { ...scope, requestedByPersonId: callerPersonId, deletedAt: null },
    { orderBy: { createdAt: 'desc', id: 'asc' }, limit: 50 },
    scope,
  )
  return views(em, scope, rows, today)
}

/** The person linked to the session's user in the club (id and birth date), or null (`person_not_linked`). */
export async function memberPerson(
  container: AwilixContainer,
  scope: ClubScope,
  userId: string,
): Promise<{ id: string; birthDate: string | null } | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const person = await em.findOne(Person, { userId, ...scope, deletedAt: null }, { fields: ['id', 'birthDate'] })
  return person ? { id: person.id, birthDate: person.birthDate ?? null } : null
}
