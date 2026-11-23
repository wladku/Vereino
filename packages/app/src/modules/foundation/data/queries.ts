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

// --- Per-club job state (many-clubs spec DD-M04…DD-M07, BR-M2; #629) ---

/** The trusted club a job-state row belongs to. */
export type ClubJobScope = { tenantId: string; organizationId: string }

/** A claimed row: ids, scope and the due time only (DD-M07 (a): no personal data leaves the statement). */
export type ClaimedClubJob = ClubJobScope & { jobKey: string; nextDueAt: Date }

/**
 * DD-M07 (a), approved by the owner on 2026-11-23 (Q-M05; recorded in `AGENTS.md`): the one system-scope statement of
 * the job sweep. It claims at most `limit` due rows of one job type whose lease is free, in one statement, by setting
 * `lease_until` (BR-M2's enqueue lease), and returns only ids, scope, key and due time. `SKIP LOCKED` lets two sweeps
 * run side by side without claiming a row twice. Every further query narrows to the returned club.
 */
export async function claimDueClubJobs(
  em: EntityManager,
  jobKey: string,
  now: Date,
  leaseUntil: Date,
  limit: number,
): Promise<ClaimedClubJob[]> {
  const rows = await em.execute<
    Array<{ tenant_id: string; organization_id: string; job_key: string; next_due_at: Date | string }>
  >(
    `with due as (
       select id from foundation_club_jobs
       where job_key = ? and next_due_at <= ? and (lease_until is null or lease_until < ?)
       order by next_due_at limit ? for update skip locked
     )
     update foundation_club_jobs j set lease_until = ?, updated_at = ?
     from due where j.id = due.id
     returning j.tenant_id, j.organization_id, j.job_key, j.next_due_at`,
    [jobKey, now, now, limit, leaseUntil, now],
  )
  return rows.map((row) => ({
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    jobKey: row.job_key,
    nextDueAt: new Date(row.next_due_at),
  }))
}

/** Creates the club's row for a job type when it has none (an idempotent upsert); returns true when it was created. */
export async function insertClubJob(
  em: EntityManager,
  scope: ClubJobScope,
  jobKey: string,
  nextDueAt: Date,
): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    `insert into foundation_club_jobs (tenant_id, organization_id, job_key, next_due_at, created_at, updated_at)
     values (?, ?, ?, ?, now(), now())
     on conflict (tenant_id, organization_id, job_key) do nothing
     returning id`,
    [scope.tenantId, scope.organizationId, jobKey, nextDueAt],
  )
  return rows.length > 0
}

/**
 * A run starts (BR-M2): only the run the sweep enqueued for this due time and this lease may start — a copy enqueued
 * by an earlier pass whose lease was taken over, or one of a due time already finished, matches nothing and is
 * skipped. The lease is extended to the job's timeout. Returns true when this run may go ahead.
 */
export async function startClubJobRun(
  em: EntityManager,
  scope: ClubJobScope,
  jobKey: string,
  claim: { dueAt: Date; leaseUntil: Date },
  runLeaseUntil: Date,
  now: Date,
): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    `update foundation_club_jobs set lease_until = ?, last_started_at = ?, updated_at = ?
     where tenant_id = ? and organization_id = ? and job_key = ? and next_due_at = ? and lease_until = ?
     returning id`,
    [runLeaseUntil, now, now, scope.tenantId, scope.organizationId, jobKey, claim.dueAt, claim.leaseUntil],
  )
  return rows.length > 0
}

/**
 * A started run ends: the next due time is stored, the lease cleared and the error code set (null on success) — only
 * while the run still holds its lease, so a run that outlived its timeout and was taken over changes nothing.
 */
export async function finishClubJobRun(
  em: EntityManager,
  scope: ClubJobScope,
  jobKey: string,
  runLeaseUntil: Date,
  outcome: { nextDueAt: Date; error: string | null },
  now: Date,
): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    `update foundation_club_jobs set next_due_at = ?, lease_until = null, last_finished_at = ?, last_error = ?,
       updated_at = ?
     where tenant_id = ? and organization_id = ? and job_key = ? and lease_until = ?
     returning id`,
    [outcome.nextDueAt, now, outcome.error, now, scope.tenantId, scope.organizationId, jobKey, runLeaseUntil],
  )
  return rows.length > 0
}

/** Moves the club's next run of a job type earlier, never later (`wake`, DD-M06). Returns true when a row moved. */
export async function wakeClubJob(em: EntityManager, scope: ClubJobScope, jobKey: string, at: Date): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    `update foundation_club_jobs set next_due_at = ?, updated_at = now()
     where tenant_id = ? and organization_id = ? and job_key = ? and (next_due_at is null or next_due_at > ?)
     returning id`,
    [at, scope.tenantId, scope.organizationId, jobKey, at],
  )
  return rows.length > 0
}

/** Sets the club's next due time of a job type unless a run holds the lease (a time-zone change, DD-M05). */
export async function rescheduleClubJob(
  em: EntityManager,
  scope: ClubJobScope,
  jobKey: string,
  nextDueAt: Date,
  now: Date,
): Promise<boolean> {
  const rows = await em.execute<Array<{ id: string }>>(
    `update foundation_club_jobs set next_due_at = ?, updated_at = ?
     where tenant_id = ? and organization_id = ? and job_key = ? and (lease_until is null or lease_until < ?)
     returning id`,
    [nextDueAt, now, scope.tenantId, scope.organizationId, jobKey, now],
  )
  return rows.length > 0
}

/** The club's job-state rows (its own scope). */
export async function clubJobsOf(
  em: EntityManager,
  scope: ClubJobScope,
): Promise<Array<{ jobKey: string; nextDueAt: Date | null; leaseUntil: Date | null; lastError: string | null }>> {
  const rows = await em.execute<
    Array<{ job_key: string; next_due_at: Date | null; lease_until: Date | null; last_error: string | null }>
  >(
    `select job_key, next_due_at, lease_until, last_error from foundation_club_jobs
     where tenant_id = ? and organization_id = ? order by job_key`,
    [scope.tenantId, scope.organizationId],
  )
  return rows.map((row) => ({
    jobKey: row.job_key,
    nextDueAt: row.next_due_at ? new Date(row.next_due_at) : null,
    leaseUntil: row.lease_until ? new Date(row.lease_until) : null,
    lastError: row.last_error,
  }))
}

/** Deletes the club's job-state rows (`removeClub`, a club deleted in phase 4). */
export async function deleteClubJobs(em: EntityManager, scope: ClubJobScope): Promise<number> {
  const rows = await em.execute<Array<{ id: string }>>(
    'delete from foundation_club_jobs where tenant_id = ? and organization_id = ? returning id',
    [scope.tenantId, scope.organizationId],
  )
  return rows.length
}

// Operator CLI reads across clubs (`club-jobs status`, `retire-club-schedules`, `restore-club-schedules`; spec *API*
// table). Shell only, never reached from a request; they return ids, scope, keys and counts — no personal data.

/** Per job type: clubs, due now, leased, failing (`club-jobs status`). */
export async function clubJobCounts(
  em: EntityManager,
  now: Date,
): Promise<Array<{ jobKey: string; clubs: number; due: number; leased: number; failing: number }>> {
  const rows = await em.execute<
    Array<{ job_key: string; clubs: string; due: string; leased: string; failing: string }>
  >(
    `select job_key, count(*) as clubs,
       count(*) filter (where next_due_at <= ? and (lease_until is null or lease_until < ?)) as due,
       count(*) filter (where lease_until >= ?) as leased,
       count(*) filter (where last_error is not null) as failing
     from foundation_club_jobs group by job_key order by job_key`,
    [now, now, now],
  )
  return rows.map((row) => ({
    jobKey: row.job_key,
    clubs: Number(row.clubs),
    due: Number(row.due),
    leased: Number(row.leased),
    failing: Number(row.failing),
  }))
}

/** The clubs with a job-state row for a job type, or with any row when `jobKey` is null (`restore-club-schedules`). */
export async function clubsWithJobState(em: EntityManager, jobKey: string | null): Promise<ClubJobScope[]> {
  const rows = await em.execute<Array<{ tenant_id: string; organization_id: string }>>(
    `select distinct tenant_id, organization_id from foundation_club_jobs
     where (?::text is null or job_key = ?) order by tenant_id, organization_id`,
    [jobKey, jobKey],
  )
  return rows.map((row) => ({ tenantId: row.tenant_id, organizationId: row.organization_id }))
}

/**
 * The per-club schedules of the old setup for a worker id (`scheduled_jobs` rows the platform scheduler owns, written
 * by `registerModuleSchedule` with `name` = the worker id), with their scope (`retire-club-schedules`).
 */
export async function perClubSchedules(
  em: EntityManager,
  workerId: string,
): Promise<Array<ClubJobScope & { scheduleId: string }>> {
  const rows = await em.execute<Array<{ id: string; tenant_id: string; organization_id: string }>>(
    `select id, tenant_id, organization_id from scheduled_jobs
     where name = ? and scope_type = 'organization' and source_type = 'module' and deleted_at is null
       and tenant_id is not null and organization_id is not null
     order by tenant_id, organization_id`,
    [workerId],
  )
  return rows.map((row) => ({ scheduleId: row.id, tenantId: row.tenant_id, organizationId: row.organization_id }))
}

/**
 * DD-M07 (b), approved by the owner on 2026-11-23 (Q-M05; recorded in `AGENTS.md`): the one system-scope read of the
 * dispatch sweep — the clubs with queued deliveries that are due with a free lease, ids and scope only (never
 * recipients or content). Every further query runs in the returned club's scope (`sweepDispatches`).
 */
export async function clubsWithDueDeliveries(em: EntityManager, limit: number): Promise<ClubJobScope[]> {
  const rows = await em.execute<Array<{ tenant_id: string; organization_id: string }>>(
    `select distinct tenant_id, organization_id from foundation_deliveries
     where status = 'queued' and next_attempt_at <= now() and ${LEASE_FREE}
     limit ?`,
    [limit],
  )
  return rows.map((row) => ({ tenantId: row.tenant_id, organizationId: row.organization_id }))
}
