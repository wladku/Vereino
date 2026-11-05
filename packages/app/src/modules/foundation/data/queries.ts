// Raw SQL of the foundation (S5.8: raw SQL lives in a module's data/queries.ts).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { RecipientChannel } from '@vereino/core'

/**
 * Serializes role syncs of one user (foundation DD-F05): a transaction-scoped advisory lock keyed by the user id,
 * held until the caller's transaction commits or rolls back. Reads no tenant data, so it takes no organization.
 */
export async function lockUserRoleSync(em: EntityManager, userId: string): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`foundation.role_sync:${userId}`])
}

/** The trusted tenant and organization every dispatch query is narrowed to (a job carries them; S4.6). */
export type DispatchScope = { tenantId: string; organizationId: string }

/** The lease a worker takes (DD-M03): its owner id, its length and the attempt cap. */
export type LeaseSpec = { owner: string; seconds: number; maxAttempts: number }

/**
 * Serializes enqueues of one idempotency key in one organization (foundation III REQ-M02): held until the caller's
 * transaction ends, so a second enqueue with the same key waits and then finds the first dispatch.
 */
export async function lockDispatchKey(
  em: EntityManager,
  organizationId: string,
  idempotencyKey: string,
): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [
    `foundation.dispatch:${organizationId}:${idempotencyKey}`,
  ])
}

/** Columns every final state clears: the lease, the address (its hash stays) and the secret (DD-M04). */
const FINAL_STATE_WIPE =
  'email = null, secret_params = null, lease_owner = null, lease_expires_at = null, updated_at = now()'

/** A lease is free when nobody holds it or the holder's time ran out (DD-M03). */
const LEASE_FREE = '(lease_expires_at is null or lease_expires_at < now())'

function placeholders(ids: readonly string[]): string {
  return ids.map(() => '?').join(', ')
}

/** True when the delivery exists in the job's tenant and organization; a forged job reads nothing else. */
export async function deliveryExists(em: EntityManager, scope: DispatchScope, deliveryId: string): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    'select id from foundation_deliveries where id = ? and tenant_id = ? and organization_id = ?',
    [deliveryId, scope.tenantId, scope.organizationId],
  )
  return rows.length > 0
}

/** True when the dispatch exists in the job's tenant and organization. */
export async function dispatchExists(em: EntityManager, scope: DispatchScope, dispatchId: string): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    'select id from foundation_dispatches where id = ? and tenant_id = ? and organization_id = ?',
    [dispatchId, scope.tenantId, scope.organizationId],
  )
  return rows.length > 0
}

/**
 * Takes the lease of a queued e-mail delivery that is due, counting the attempt (DD-M03); returns the attempt count,
 * or null when the delivery is final, not due, leased by another worker or out of attempts.
 */
export async function leaseEmailDelivery(
  em: EntityManager,
  scope: DispatchScope,
  deliveryId: string,
  lease: LeaseSpec,
): Promise<number | null> {
  const rows = await em.execute<Array<{ attempts: number }>>(
    `update foundation_deliveries set attempts = attempts + 1, lease_owner = ?,
       lease_expires_at = now() + (? * interval '1 second'), updated_at = now()
     where id = ? and tenant_id = ? and organization_id = ? and channel = 'email' and status = 'queued'
       and next_attempt_at <= now() and ${LEASE_FREE} and attempts < ?
     returning attempts`,
    [lease.owner, lease.seconds, deliveryId, scope.tenantId, scope.organizationId, lease.maxAttempts],
  )
  return rows.length > 0 ? rows[0].attempts : null
}

/** Takes the lease of every due queued in-app delivery of a dispatch; returns the leased rows. */
export async function leaseInAppDeliveries(
  em: EntityManager,
  scope: DispatchScope,
  dispatchId: string,
  lease: LeaseSpec,
): Promise<Array<{ id: string; userId: string | null; attempts: number }>> {
  const rows = await em.execute<Array<{ id: string; user_id: string | null; attempts: number }>>(
    `update foundation_deliveries set attempts = attempts + 1, lease_owner = ?,
       lease_expires_at = now() + (? * interval '1 second'), updated_at = now()
     where dispatch_id = ? and tenant_id = ? and organization_id = ? and channel = 'in_app' and status = 'queued'
       and next_attempt_at <= now() and ${LEASE_FREE} and attempts < ?
     returning id, user_id, attempts`,
    [lease.owner, lease.seconds, dispatchId, scope.tenantId, scope.organizationId, lease.maxAttempts],
  )
  return rows.map((row) => ({ id: row.id, userId: row.user_id, attempts: row.attempts }))
}

/**
 * Fails the queued deliveries that used up their attempts and whose lease is free — a worker that crashed on every
 * attempt (DD-M03). `where` narrows to some deliveries or to the in-app rows of one dispatch; returns the failed rows.
 */
export async function failExhaustedDeliveries(
  em: EntityManager,
  scope: DispatchScope,
  where: { deliveryIds: readonly string[] } | { inAppOfDispatch: string },
  maxAttempts: number,
): Promise<Array<{ id: string; dispatchId: string }>> {
  const target =
    'deliveryIds' in where
      ? { sql: `id in (${placeholders(where.deliveryIds)})`, params: [...where.deliveryIds] }
      : { sql: `dispatch_id = ? and channel = 'in_app'`, params: [where.inAppOfDispatch] }
  if (target.params.length === 0) return []
  const rows = await em.execute<Array<{ id: string; dispatch_id: string }>>(
    `update foundation_deliveries set status = 'failed', failure_code = 'transport_unavailable', failed_at = now(),
       ${FINAL_STATE_WIPE}
     where ${target.sql} and tenant_id = ? and organization_id = ? and status = 'queued' and attempts >= ?
       and ${LEASE_FREE}
     returning id, dispatch_id`,
    [...target.params, scope.tenantId, scope.organizationId, maxAttempts],
  )
  return rows.map((row) => ({ id: row.id, dispatchId: row.dispatch_id }))
}

export type FinalOutcome =
  { status: 'sent' } | { status: 'failed'; failureCode: string } | { status: 'skipped'; skipReason: string }

/** The final state of deliveries the worker holds the lease of; returns the ids it changed. */
export async function finalizeDeliveries(
  em: EntityManager,
  scope: DispatchScope,
  ids: readonly string[],
  owner: string,
  outcome: FinalOutcome,
): Promise<string[]> {
  if (ids.length === 0) return []
  const set =
    outcome.status === 'sent'
      ? { sql: `status = 'sent', sent_at = now()`, params: [] as string[] }
      : outcome.status === 'failed'
        ? { sql: `status = 'failed', failure_code = ?, failed_at = now()`, params: [outcome.failureCode] }
        : { sql: `status = 'skipped', skip_reason = ?`, params: [outcome.skipReason] }
  const rows = await em.execute<Array<{ id: string }>>(
    `update foundation_deliveries set ${set.sql}, ${FINAL_STATE_WIPE}
     where id in (${placeholders(ids)}) and tenant_id = ? and organization_id = ? and status = 'queued'
       and lease_owner = ?
     returning id`,
    [...set.params, ...ids, scope.tenantId, scope.organizationId, owner],
  )
  return rows.map((row) => row.id)
}

/** Releases the lease of deliveries for their next attempt after `delayMs`. */
export async function scheduleRetry(
  em: EntityManager,
  scope: DispatchScope,
  ids: readonly string[],
  owner: string,
  delayMs: number,
): Promise<void> {
  if (ids.length === 0) return
  await em.execute(
    `update foundation_deliveries set next_attempt_at = now() + (? * interval '1 millisecond'), lease_owner = null,
       lease_expires_at = null, updated_at = now()
     where id in (${placeholders(ids)}) and tenant_id = ? and organization_id = ? and status = 'queued'
       and lease_owner = ?`,
    [delayMs, ...ids, scope.tenantId, scope.organizationId, owner],
  )
}

/** Recomputes a dispatch's counts from its deliveries; `done` once none is queued. */
export async function refreshDispatchCounts(
  em: EntityManager,
  scope: DispatchScope,
  dispatchId: string,
): Promise<void> {
  await em.execute(
    `update foundation_dispatches d set sent_count = c.sent, failed_count = c.failed, skipped_count = c.skipped,
       status = case when c.queued = 0 then 'done' else 'queued' end, updated_at = now()
     from (
       select count(*) filter (where status = 'sent') as sent, count(*) filter (where status = 'failed') as failed,
         count(*) filter (where status = 'skipped') as skipped, count(*) filter (where status = 'queued') as queued
       from foundation_deliveries where dispatch_id = ? and tenant_id = ? and organization_id = ?
     ) c
     where d.id = ? and d.tenant_id = ? and d.organization_id = ?`,
    [dispatchId, scope.tenantId, scope.organizationId, dispatchId, scope.tenantId, scope.organizationId],
  )
}

/** The queued deliveries of a dispatch to publish: the e-mail ids and whether any in-app row waits. */
export async function queuedDeliveriesOf(
  em: EntityManager,
  scope: DispatchScope,
  dispatchId: string,
): Promise<{ emailIds: string[]; hasInApp: boolean }> {
  const rows = await em.execute<Array<{ id: string; channel: string }>>(
    `select id, channel from foundation_deliveries
     where dispatch_id = ? and tenant_id = ? and organization_id = ? and status = 'queued' order by id`,
    [dispatchId, scope.tenantId, scope.organizationId],
  )
  return {
    emailIds: rows.filter((row) => row.channel === 'email').map((row) => row.id),
    hasInApp: rows.some((row) => row.channel === 'in_app'),
  }
}

/**
 * The deliveries of each dispatch counted by status, read live from the delivery rows (one row per dispatch found);
 * `channel` counts one channel only (the e-mail summary under an author's message, E06-S20).
 */
export async function deliveryCountsOf(
  em: EntityManager,
  scope: DispatchScope,
  dispatchIds: readonly string[],
  channel?: RecipientChannel,
): Promise<Array<{ dispatchId: string; queued: number; sent: number; failed: number; skipped: number }>> {
  if (dispatchIds.length === 0) return []
  const rows = await em.execute<
    Array<{
      dispatch_id: string
      queued: number | string
      sent: number | string
      failed: number | string
      skipped: number | string
    }>
  >(
    `select dispatch_id, count(*) filter (where status = 'queued') as queued,
       count(*) filter (where status = 'sent') as sent, count(*) filter (where status = 'failed') as failed,
       count(*) filter (where status = 'skipped') as skipped
     from foundation_deliveries
     where tenant_id = ? and organization_id = ? and dispatch_id in (${dispatchIds.map(() => '?').join(', ')})${channel ? ' and channel = ?' : ''}
     group by dispatch_id`,
    [scope.tenantId, scope.organizationId, ...dispatchIds, ...(channel ? [channel] : [])],
  )
  return rows.map((row) => ({
    dispatchId: row.dispatch_id,
    queued: Number(row.queued),
    sent: Number(row.sent),
    failed: Number(row.failed),
    skipped: Number(row.skipped),
  }))
}

export async function markPublished(em: EntityManager, scope: DispatchScope, dispatchId: string): Promise<void> {
  await em.execute(
    `update foundation_dispatches set published_at = now(), updated_at = now()
     where id = ? and tenant_id = ? and organization_id = ?`,
    [dispatchId, scope.tenantId, scope.organizationId],
  )
}

/** The organization's queued deliveries that are due with a free lease — the sweeper's work (DD-M03). */
export async function dueDeliveries(
  em: EntityManager,
  scope: DispatchScope,
  limit: number,
): Promise<Array<{ id: string; dispatchId: string; channel: string; attempts: number }>> {
  const rows = await em.execute<Array<{ id: string; dispatch_id: string; channel: string; attempts: number }>>(
    `select id, dispatch_id, channel, attempts from foundation_deliveries
     where tenant_id = ? and organization_id = ? and status = 'queued' and next_attempt_at <= now() and ${LEASE_FREE}
     order by next_attempt_at, id limit ?`,
    [scope.tenantId, scope.organizationId, limit],
  )
  return rows.map((row) => ({
    id: row.id,
    dispatchId: row.dispatch_id,
    channel: row.channel,
    attempts: row.attempts,
  }))
}
