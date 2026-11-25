// The scope guard of every Vereino scheduled worker (foundation II DD-G07, AC-G05; owner decision on #591,
// 2026-11-24). The platform's execute worker injects the registration's `tenantId` and `organizationId` into the job
// payload, but a worker cannot tell that payload from one any other producer put on its queue. So a worker trusts a
// scope only when it is well formed AND the organization has a live registration of this very job: the row
// `registerModuleSchedule` upserts under the stable id of job and organization, owned by the module, targeting the
// worker's queue, enabled and not deleted. A malformed payload and a well-formed id of an organization without the
// registration are both refused — logged and skipped, never thrown, so the queue does not retry a decision no attempt
// can change.
import type { AwilixContainer } from 'awilix'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { moduleScheduleKey, moduleScheduleQueue, moduleWorkerId } from '@vereino/core'
import type { TrustedScope } from './authorize-scoped'
import { stableScheduleUuid } from './register-module-schedule'

const logger = createLogger('foundation').child({ component: 'scheduled-job-scope' })

const payloadScopeSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

/** The job whose worker asks: the module and the kebab-case name it was registered under. */
export type ScheduledJobRef = { module: string; name: string }

/** Why a scope was refused: a payload without a valid scope, or an organization without this job's registration. */
export type ScheduledJobScopeRefusal = 'malformed_scope' | 'unregistered_scope'

export type ScheduledJobScopeResult =
  { ok: true; scope: TrustedScope } | { ok: false; reason: ScheduledJobScopeRefusal }

/**
 * Checks the scope of one scheduled job's payload: well formed and backed by a live registration of the job for that
 * organization. Returns the trusted scope or the refusal reason; a refusal is logged as a warning naming the worker.
 */
export async function verifyScheduledJobScope(
  container: AwilixContainer,
  payload: unknown,
  job: ScheduledJobRef,
): Promise<ScheduledJobScopeResult> {
  const workerId = moduleWorkerId(job.module, job.name)
  const parsed = payloadScopeSchema.safeParse(payload)
  if (!parsed.success) {
    logger.warn('Scheduled job refused: the payload has no valid scope', { workerId, reason: 'malformed_scope' })
    return { ok: false, reason: 'malformed_scope' }
  }
  const scope: TrustedScope = { tenantId: parsed.data.tenantId, organizationId: parsed.data.organizationId }
  const em = container.resolve<EntityManager>('em')
  const rows = await em.getConnection().execute<Array<{ id: string }>>(
    `select id from scheduled_jobs
      where id = ? and tenant_id = ? and organization_id = ? and scope_type = 'organization'
        and source_type = 'module' and source_module = ? and target_type = 'queue' and target_queue = ?
        and is_enabled = true and deleted_at is null
      limit 1`,
    [
      stableScheduleUuid(moduleScheduleKey(job.module, job.name, scope)),
      scope.tenantId,
      scope.organizationId,
      job.module,
      moduleScheduleQueue(job.module, job.name),
    ],
  )
  if (rows.length === 0) {
    logger.warn('Scheduled job refused: the organization has no registration of this job', {
      workerId,
      reason: 'unregistered_scope',
      ...scope,
    })
    return { ok: false, reason: 'unregistered_scope' }
  }
  return { ok: true, scope }
}
