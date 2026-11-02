// Raw SQL of `communication` (S5.8: raw SQL lives in a module's data/queries.ts). Every query is narrowed to the
// trusted tenant and organization; ids are bound, never interpolated.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { MessageAudience, MessageKind, ThreadScopeType } from '../lib/thread-rules'

export type CommunicationScope = { tenantId: string; organizationId: string }

function placeholders(ids: readonly unknown[]): string {
  return ids.map(() => '?').join(', ')
}

/**
 * Serializes the session thread of one occurrence (REQ-M07: one session thread per occurrence, also under concurrent
 * delivery of the cancellation event): held until the caller's transaction ends.
 */
export async function lockOccurrenceThread(em: EntityManager, organizationId: string, occurrenceId: string) {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [
    `communication.session_thread:${organizationId}:${occurrenceId}`,
  ])
}

/** Adds participants that are not there yet (append-only: an existing row and its reasons stay as they are). */
export async function insertParticipants(
  em: EntityManager,
  scope: CommunicationScope,
  threadId: string,
  rows: ReadonlyArray<{ personId: string; reasons: readonly string[] }>,
): Promise<void> {
  if (rows.length === 0) return
  const values = rows.map(() => '(gen_random_uuid(), ?, ?, now(), ?, ?, ?::text[])').join(', ')
  const bindings = rows.flatMap((row) => [
    scope.organizationId,
    scope.tenantId,
    threadId,
    row.personId,
    `{${row.reasons.map((reason) => `"${reason}"`).join(',')}}`,
  ])
  await em.execute(
    `insert into communication_thread_participants (id, organization_id, tenant_id, created_at, thread_id, person_id, reasons)
     values ${values}
     on conflict (thread_id, person_id) do nothing`,
    bindings,
  )
}

/** Moves a person's read marker of a thread forward to `at` (DD-M13); never backwards. */
export async function upsertReadMarker(
  em: EntityManager,
  scope: CommunicationScope,
  threadId: string,
  personId: string,
  at: Date,
): Promise<void> {
  await em.execute(
    `insert into communication_thread_reads (id, organization_id, tenant_id, created_at, updated_at, thread_id, person_id, last_read_at)
     values (gen_random_uuid(), ?, ?, now(), now(), ?, ?, ?)
     on conflict (thread_id, person_id) do update
       set last_read_at = greatest(communication_thread_reads.last_read_at, excluded.last_read_at), updated_at = now()`,
    [scope.organizationId, scope.tenantId, threadId, personId, at],
  )
}

/**
 * Marks a thread as a case (foundation III DD-M11): a conditional update `WHERE is_case = false`, so a thread is
 * marked once and never unmarked. Returns false when the thread already is a case. `at` is also the thread's new
 * version (`updated_at`).
 */
export async function openCase(
  em: EntityManager,
  scope: CommunicationScope,
  threadId: string,
  openedByPersonId: string,
  at: Date,
): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    `update communication_threads
        set is_case = true, case_opened_at = ?, case_opened_by_person_id = ?, updated_at = ?
      where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and is_case = false
      returning id`,
    [at, openedByPersonId, at, threadId, scope.tenantId, scope.organizationId],
  )
  return rows.length === 1
}

export type ThreadHeader = {
  id: string
  scopeType: ThreadScopeType
  scopeId: string | null
  sectionId: string | null
  groupId: string | null
  authorPersonId: string | null
  isCase: boolean
  caseOpenedAt: Date | null
  caseOpenedByPersonId: string | null
  lastMessageAt: Date
  createdAt: Date
  updatedAt: Date
}

type ThreadHeaderRow = {
  id: string
  scope_type: ThreadScopeType
  scope_id: string | null
  section_id: string | null
  group_id: string | null
  author_person_id: string | null
  is_case: boolean
  case_opened_at: Date | string | null
  case_opened_by_person_id: string | null
  last_message_at: Date | string
  created_at: Date | string
  updated_at: Date | string
}

const date = (value: Date | string): Date => (value instanceof Date ? value : new Date(value))

function header(row: ThreadHeaderRow): ThreadHeader {
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    sectionId: row.section_id,
    groupId: row.group_id,
    authorPersonId: row.author_person_id,
    isCase: row.is_case,
    caseOpenedAt: row.case_opened_at === null ? null : date(row.case_opened_at),
    caseOpenedByPersonId: row.case_opened_by_person_id,
    lastMessageAt: date(row.last_message_at),
    createdAt: date(row.created_at),
    updatedAt: date(row.updated_at),
  }
}

/** Who may see which threads (DD-M12): the participant person, the club administrator, a coordinator's sections. */
export type ThreadVisibility = {
  personId: string | null
  clubWide: boolean
  sectionIds: readonly string[]
  /** `member`: the participant threads only (the member inbox), whatever else the user's grants allow. */
  participantOnly: boolean
}

export type ThreadFilters = { scopeType?: ThreadScopeType; scopeId?: string; isCase?: boolean }

/** The visible threads, newest activity first, at most `limit` (a club has a few hundred). */
export async function visibleThreadHeaders(
  em: EntityManager,
  scope: CommunicationScope,
  visibility: ThreadVisibility,
  filters: ThreadFilters,
  limit = 1000,
): Promise<ThreadHeader[]> {
  const access: string[] = []
  const bindings: unknown[] = [scope.tenantId, scope.organizationId]
  if (visibility.personId) {
    access.push(
      'exists (select 1 from communication_thread_participants p where p.thread_id = t.id and p.organization_id = t.organization_id and p.person_id = ?)',
    )
    bindings.push(visibility.personId)
  }
  if (!visibility.participantOnly && visibility.clubWide) access.push('true')
  if (!visibility.participantOnly && !visibility.clubWide && visibility.sectionIds.length > 0) {
    access.push(`t.section_id in (${placeholders(visibility.sectionIds)})`)
    bindings.push(...visibility.sectionIds)
  }
  if (access.length === 0) return []
  const conditions = [`(${access.join(' or ')})`]
  if (filters.scopeType) {
    conditions.push('t.scope_type = ?')
    bindings.push(filters.scopeType)
  }
  if (filters.scopeId) {
    conditions.push('t.scope_id = ?')
    bindings.push(filters.scopeId)
  }
  if (filters.isCase !== undefined) {
    conditions.push('t.is_case = ?')
    bindings.push(filters.isCase)
  }
  bindings.push(limit)
  const rows = await em.execute<ThreadHeaderRow[]>(
    `select t.id, t.scope_type, t.scope_id, t.section_id, t.group_id, t.author_person_id, t.is_case, t.case_opened_at,
            t.case_opened_by_person_id, t.last_message_at, t.created_at, t.updated_at
       from communication_threads t
      where t.tenant_id = ? and t.organization_id = ? and t.deleted_at is null and ${conditions.join(' and ')}
      order by t.last_message_at desc, t.id
      limit ?`,
    bindings,
  )
  return rows.map(header)
}

export type MessageStampRow = {
  threadId: string
  id: string
  kind: MessageKind
  authorPersonId: string | null
  audience: MessageAudience
  createdAt: Date
}

/** The message rows of threads without their bodies: for unread state and counts. */
export async function messageStamps(
  em: EntityManager,
  scope: CommunicationScope,
  threadIds: readonly string[],
): Promise<MessageStampRow[]> {
  if (threadIds.length === 0) return []
  const rows = await em.execute<
    Array<{
      thread_id: string
      id: string
      kind: MessageKind
      author_person_id: string | null
      audience: MessageAudience
      created_at: Date | string
    }>
  >(
    `select thread_id, id, kind, author_person_id, audience, created_at
       from communication_thread_messages
      where tenant_id = ? and organization_id = ? and thread_id in (${placeholders(threadIds)})`,
    [scope.tenantId, scope.organizationId, ...threadIds],
  )
  return rows.map((row) => ({
    threadId: row.thread_id,
    id: row.id,
    kind: row.kind,
    authorPersonId: row.author_person_id,
    audience: row.audience,
    createdAt: date(row.created_at),
  }))
}

/** A person's participations (thread id → reasons) among `threadIds`. */
export async function participationsOf(
  em: EntityManager,
  scope: CommunicationScope,
  personId: string,
  threadIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (threadIds.length === 0) return new Map()
  const rows = await em.execute<Array<{ thread_id: string; reasons: string[] | string }>>(
    `select thread_id, reasons from communication_thread_participants
      where tenant_id = ? and organization_id = ? and person_id = ? and thread_id in (${placeholders(threadIds)})`,
    [scope.tenantId, scope.organizationId, personId, ...threadIds],
  )
  return new Map(rows.map((row) => [row.thread_id, textArray(row.reasons)]))
}

/** A person's read markers among `threadIds`. */
export async function readMarkersOf(
  em: EntityManager,
  scope: CommunicationScope,
  personId: string,
  threadIds: readonly string[],
): Promise<Map<string, Date>> {
  if (threadIds.length === 0) return new Map()
  const rows = await em.execute<Array<{ thread_id: string; last_read_at: Date | string }>>(
    `select thread_id, last_read_at from communication_thread_reads
      where tenant_id = ? and organization_id = ? and person_id = ? and thread_id in (${placeholders(threadIds)})`,
    [scope.tenantId, scope.organizationId, personId, ...threadIds],
  )
  return new Map(rows.map((row) => [row.thread_id, date(row.last_read_at)]))
}

/** A Postgres `text[]` as the driver returns it: an array, or the literal `{a,b}`. */
function textArray(value: string[] | string): string[] {
  if (Array.isArray(value)) return value
  if (value.length <= 2) return []
  return value
    .slice(1, -1)
    .split(',')
    .map((entry) => entry.replace(/^"|"$/g, ''))
}
