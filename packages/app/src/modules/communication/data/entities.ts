// The tables of `communication` (foundation III *Data Models* → `communication`, DD-M01, DD-M10…DD-M13; club spec
// glossary *Thread*): threads with an encrypted subject, append-only thread messages (an edit is a `revision` row, a
// deletion a `tombstone` row; foundation II P-28), the participants (added, never removed) and the read markers.
// Section, group, scope, person and dispatch ids are scalar ids of other modules (no cross-module relation). The case
// columns are part of the table from the start; `communication.threads.mark_case` (phase C, #36) sets them once.
import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy'
import {
  AppendOnlyEntityBase,
  ScopedEntityBase,
  decorateAppendOnlyEntityBase,
  decorateScopedEntityBase,
  type AppendOnlyEntityOptionalProps,
  type ScopedEntityOptionalProps,
} from '@vereino/db'
import type { MessageAudience, MessageKind, ThreadScopeType } from '../lib/thread-rules'

decorateScopedEntityBase({ PrimaryKey, Property })
decorateAppendOnlyEntityBase({ PrimaryKey, Property })

/**
 * `communication_threads`: a conversation with a scope (`club`, `section`, `group`, `activity`, `occurrence`,
 * `direct`). `section_id` and `group_id` are snapshots of the scope's section and group for the permission checks
 * (a coordinator's section, a coach's group); `subject` is encrypted. One session thread per occurrence (partial
 * unique index). A thread is never deleted.
 */
@Entity({ tableName: 'communication_threads' })
@Index({ name: 'communication_threads_org_scope_idx', properties: ['organizationId', 'scopeType', 'scopeId'] })
@Index({
  name: 'communication_threads_occurrence_unique',
  expression:
    'create unique index "communication_threads_occurrence_unique" on "communication_threads" ("organization_id", "scope_id") where scope_type = \'occurrence\' and deleted_at is null',
})
@Index({ name: 'communication_threads_org_section_case_idx', properties: ['organizationId', 'sectionId', 'isCase'] })
@Index({ name: 'communication_threads_org_last_message_idx', properties: ['organizationId', 'lastMessageAt'] })
@Index({ name: 'communication_threads_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Thread extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'scopeId'
    | 'sectionId'
    | 'groupId'
    | 'authorPersonId'
    | 'isCase'
    | 'caseOpenedAt'
    | 'caseOpenedByPersonId'
    | 'lastMessageAt'

  @Property({ name: 'scope_type', type: 'text' })
  scopeType!: ThreadScopeType

  /** The section, group, activity or session addressed; null for `club` and `direct`. */
  @Property({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId?: string | null

  @Property({ name: 'section_id', type: 'uuid', nullable: true })
  sectionId?: string | null

  @Property({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string | null

  /** Encrypted (`encryption.ts`). */
  @Property({ name: 'subject', type: 'text' })
  subject!: string

  /** The person who opened the thread; null for a session thread the system opened on a cancellation. */
  @Property({ name: 'author_person_id', type: 'uuid', nullable: true })
  authorPersonId?: string | null

  @Property({ name: 'is_case', type: 'boolean', default: false })
  isCase: boolean = false

  @Property({ name: 'case_opened_at', type: Date, nullable: true })
  caseOpenedAt?: Date | null

  @Property({ name: 'case_opened_by_person_id', type: 'uuid', nullable: true })
  caseOpenedByPersonId?: string | null

  @Property({ name: 'last_message_at', type: Date, onCreate: () => new Date() })
  lastMessageAt: Date = new Date()
}

/**
 * `communication_thread_messages` (append-only, P-28): a `message`, a `revision` that supersedes a message or a
 * `tombstone` that deletes it. `author_person_id` is null for a system message (acting role `system`); `audience` is
 * `staff` for a member's reply (DD-M12); `body` is encrypted and absent on a tombstone; `dispatch_id` names the
 * foundation dispatch that delivered it.
 */
@Entity({ tableName: 'communication_thread_messages' })
@Index({
  name: 'communication_thread_messages_org_thread_idx',
  properties: ['organizationId', 'threadId', 'createdAt'],
})
@Index({ name: 'communication_thread_messages_supersedes_idx', properties: ['supersedesMessageId'] })
@Index({ name: 'communication_thread_messages_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ThreadMessage extends AppendOnlyEntityBase {
  [OptionalProps]?:
    AppendOnlyEntityOptionalProps | 'supersedesMessageId' | 'authorPersonId' | 'body' | 'dispatchId' | 'recipientCount'

  @Property({ name: 'thread_id', type: 'uuid' })
  threadId!: string

  @Property({ name: 'kind', type: 'text' })
  kind!: MessageKind

  @Property({ name: 'supersedes_message_id', type: 'uuid', nullable: true })
  supersedesMessageId?: string | null

  @Property({ name: 'author_person_id', type: 'uuid', nullable: true })
  authorPersonId?: string | null

  /** The role the author wrote in (R01); `system` for a system message. */
  @Property({ name: 'acting_role', type: 'text' })
  actingRole!: string

  @Property({ name: 'audience', type: 'text' })
  audience!: MessageAudience

  /** Encrypted (`encryption.ts`); null on a tombstone. */
  @Property({ name: 'body', type: 'text', nullable: true })
  body?: string | null

  @Property({ name: 'dispatch_id', type: 'uuid', nullable: true })
  dispatchId?: string | null

  @Property({ name: 'recipient_count', type: 'integer', default: 0 })
  recipientCount: number = 0
}

/**
 * `communication_thread_participants` (append-only): the author and every person a message of the thread addressed,
 * with the reasons of the first time (`author`, `participant`, `coach`, `guardian`, `direct`, `staff`). Added, never
 * removed; written with `on conflict do nothing`.
 */
@Entity({ tableName: 'communication_thread_participants' })
@Unique({ name: 'communication_thread_participants_thread_person_unique', properties: ['threadId', 'personId'] })
@Index({ name: 'communication_thread_participants_org_person_idx', properties: ['organizationId', 'personId'] })
@Index({ name: 'communication_thread_participants_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ThreadParticipant extends AppendOnlyEntityBase {
  [OptionalProps]?: AppendOnlyEntityOptionalProps

  @Property({ name: 'thread_id', type: 'uuid' })
  threadId!: string

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  @Property({ name: 'reasons', type: 'text[]', defaultRaw: `'{}'` })
  reasons: string[] = []
}

/** `communication_thread_reads`: one read marker per thread and person (DD-M13), upserted when the thread is opened. */
@Entity({ tableName: 'communication_thread_reads' })
@Unique({ name: 'communication_thread_reads_thread_person_unique', properties: ['threadId', 'personId'] })
@Index({ name: 'communication_thread_reads_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class ThreadRead extends ScopedEntityBase {
  [OptionalProps]?: ScopedEntityOptionalProps

  @Property({ name: 'thread_id', type: 'uuid' })
  threadId!: string

  @Property({ name: 'person_id', type: 'uuid' })
  personId!: string

  @Property({ name: 'last_read_at', type: Date })
  lastReadAt!: Date
}
