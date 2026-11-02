// The foundation's own tables (foundation III P-30, *Data Models*; #71): the dispatch outbox. A dispatch is one message
// to many recipients, written in the calling command's transaction; a delivery is one recipient on one channel, the
// durable record the worker leases, retries and finalizes (DD-M03). Person and user ids are scalar ids of `people` and
// `auth` (no cross-module relation). `params`, `email` and `secret_params` are encrypted (`encryption.ts`).
import { OptionalProps } from '@mikro-orm/core'
import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy'
import { ScopedEntityBase, decorateScopedEntityBase, type ScopedEntityOptionalProps } from '@vereino/db'
import type { AudienceSpec, RecipientChannel } from '@vereino/core'
import type { DeliveryStatus, FailureCode, SkipReason } from '../lib/dispatch-rules'

decorateScopedEntityBase({ PrimaryKey, Property })

export type DispatchStatus = 'queued' | 'done'

/**
 * `foundation_dispatches`: the template, the encrypted params common to every recipient, the audience snapshot (kind
 * and ids only), the source record, the idempotency key (one dispatch per key and organization), the actor and acting
 * role, and the counts the worker keeps. `status` is `done` once every delivery is final.
 */
@Entity({ tableName: 'foundation_dispatches' })
@Index({
  name: 'foundation_dispatches_org_key_unique',
  expression:
    'create unique index "foundation_dispatches_org_key_unique" on "foundation_dispatches" ("organization_id", "idempotency_key")',
})
@Index({ name: 'foundation_dispatches_org_source_idx', properties: ['organizationId', 'sourceType', 'sourceId'] })
@Index({ name: 'foundation_dispatches_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Dispatch extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'audience'
    | 'actorUserId'
    | 'status'
    | 'publishedAt'
    | 'recipientCount'
    | 'sentCount'
    | 'failedCount'
    | 'skippedCount'

  @Property({ name: 'template_id', type: 'text' })
  templateId!: string

  @Property({ name: 'source_module', type: 'text' })
  sourceModule!: string

  @Property({ name: 'source_type', type: 'text' })
  sourceType!: string

  @Property({ name: 'source_id', type: 'uuid' })
  sourceId!: string

  @Property({ name: 'idempotency_key', type: 'text' })
  idempotencyKey!: string

  @Property({ name: 'audience', type: 'json', nullable: true })
  audience?: AudienceSpec | null

  /** The template params as encrypted JSON text. */
  @Property({ name: 'params', type: 'text' })
  params!: string

  @Property({ name: 'actor_user_id', type: 'uuid', nullable: true })
  actorUserId?: string | null

  @Property({ name: 'acting_role', type: 'text' })
  actingRole!: string

  @Property({ name: 'status', type: 'text', default: 'queued' })
  status: DispatchStatus = 'queued'

  @Property({ name: 'published_at', type: Date, nullable: true })
  publishedAt?: Date | null

  @Property({ name: 'recipient_count', type: 'integer', default: 0 })
  recipientCount: number = 0

  @Property({ name: 'sent_count', type: 'integer', default: 0 })
  sentCount: number = 0

  @Property({ name: 'failed_count', type: 'integer', default: 0 })
  failedCount: number = 0

  @Property({ name: 'skipped_count', type: 'integer', default: 0 })
  skippedCount: number = 0
}

/**
 * `foundation_deliveries`: one recipient on one channel. `queued` → `sent` | `failed` | `skipped`, final states never
 * change. The lease (`lease_owner`, `lease_expires_at`) and `attempts` (taken with the lease) live here, so a sweeper
 * can resume stalled work under either queue strategy (DD-M03). The address is wiped at the final state, its hash
 * kept; `secret_params` (DD-M04) is wiped at the final state too.
 */
@Entity({ tableName: 'foundation_deliveries' })
@Index({
  name: 'foundation_deliveries_dispatch_person_channel_unique',
  expression:
    'create unique index "foundation_deliveries_dispatch_person_channel_unique" on "foundation_deliveries" ("dispatch_id", "person_id", "channel") where person_id is not null',
})
@Index({
  name: 'foundation_deliveries_org_dispatch_status_idx',
  properties: ['organizationId', 'dispatchId', 'status'],
})
@Index({ name: 'foundation_deliveries_status_next_attempt_idx', properties: ['status', 'nextAttemptAt'] })
@Index({ name: 'foundation_deliveries_tenant_org_idx', properties: ['tenantId', 'organizationId'] })
export class Delivery extends ScopedEntityBase {
  [OptionalProps]?:
    | ScopedEntityOptionalProps
    | 'personId'
    | 'userId'
    | 'email'
    | 'emailHash'
    | 'status'
    | 'skipReason'
    | 'attempts'
    | 'nextAttemptAt'
    | 'leaseOwner'
    | 'leaseExpiresAt'
    | 'sentAt'
    | 'failedAt'
    | 'failureCode'
    | 'secretParams'

  @Property({ name: 'dispatch_id', type: 'uuid' })
  dispatchId!: string

  @Property({ name: 'person_id', type: 'uuid', nullable: true })
  personId?: string | null

  @Property({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null

  @Property({ name: 'channel', type: 'text' })
  channel!: RecipientChannel

  @Property({ name: 'email', type: 'text', nullable: true })
  email?: string | null

  @Property({ name: 'email_hash', type: 'text', nullable: true })
  emailHash?: string | null

  @Property({ name: 'locale', type: 'text' })
  locale!: string

  @Property({ name: 'reasons', type: 'text[]', defaultRaw: `'{}'` })
  reasons: string[] = []

  @Property({ name: 'status', type: 'text', default: 'queued' })
  status: DeliveryStatus = 'queued'

  @Property({ name: 'skip_reason', type: 'text', nullable: true })
  skipReason?: SkipReason | null

  @Property({ name: 'attempts', type: 'integer', default: 0 })
  attempts: number = 0

  /** Set by the database at enqueue (`now()`, the clock the lease compares with), then by each retry. */
  @Property({ name: 'next_attempt_at', type: Date, defaultRaw: 'now()' })
  nextAttemptAt?: Date

  @Property({ name: 'lease_owner', type: 'text', nullable: true })
  leaseOwner?: string | null

  @Property({ name: 'lease_expires_at', type: Date, nullable: true })
  leaseExpiresAt?: Date | null

  @Property({ name: 'sent_at', type: Date, nullable: true })
  sentAt?: Date | null

  @Property({ name: 'failed_at', type: Date, nullable: true })
  failedAt?: Date | null

  @Property({ name: 'failure_code', type: 'text', nullable: true })
  failureCode?: FailureCode | null

  /** The recipient's secret params (a raw link token) as encrypted JSON text; e-mail rows only (DD-M04). */
  @Property({ name: 'secret_params', type: 'text', nullable: true })
  secretParams?: string | null
}
