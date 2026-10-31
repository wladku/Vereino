// P-27 `auditedRead` (foundation II DD-G06; consumers: #34's guardian contacts, the phase 4 statements): one row per
// read in the module's append-only log entity (P-28) — actor, acting role, resource kind and ids, purpose and the
// module's own columns, never the values read — written and committed in its own short transaction before the read;
// then a best-effort mirror to the platform access log (rows rotate after hours: V-F08), then the read. A failed log
// write is an uncoded 500 and the read never runs.
import type { EntityClass, EntityManager } from '@mikro-orm/core'
import type { AccessLogService } from '@open-mercato/core/modules/audit_logs/services/accessLogService'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { ActingRole } from '@vereino/core'
import type { AppendOnlyEntityBase } from '@vereino/db'
import { runAuditedRead } from '../lib/audited-read'
import type { TrustedScope } from './authorize-scoped'

const logger = createLogger('foundation').child({ component: 'audited-read' })

/** The columns every audited-read log entity carries next to the append-only base. */
export type AuditedReadLogRow = AppendOnlyEntityBase & {
  actorUserId: string
  actingRole: string
  resourceKind: string
  resourceIds: string[]
  purpose: string
}

export type AuditedReadSpec<TLog extends AuditedReadLogRow> = {
  log: EntityClass<TLog>
  scope: TrustedScope
  actingRole: ActingRole
  resourceKind: string
  resourceIds: readonly string[]
  purpose: string
  /** The field names the read returns (for the platform mirror), never their values. */
  fields?: readonly string[]
  /** The log entity's own columns (e.g. the session id of a contacts read). */
  extra?: Omit<Partial<TLog>, keyof AuditedReadLogRow>
}

export async function auditedRead<TLog extends AuditedReadLogRow, T>(
  ctx: CommandRuntimeContext,
  spec: AuditedReadSpec<TLog>,
  read: () => Promise<T>,
): Promise<T> {
  const actorUserId = ctx.auth?.sub
  if (!actorUserId) throw new Error('[internal] an audited read needs an authenticated actor')
  const resourceIds = [...new Set(spec.resourceIds)]
  let logId: string | null = null
  return runAuditedRead({
    writeLog: async () => {
      const em = ctx.container.resolve<EntityManager>('em').fork()
      try {
        await em.transactional(async (tx) => {
          const row = tx.create(spec.log, {
            ...spec.extra,
            tenantId: spec.scope.tenantId,
            organizationId: spec.scope.organizationId,
            actorUserId,
            actingRole: spec.actingRole,
            resourceKind: spec.resourceKind,
            resourceIds,
            purpose: spec.purpose,
          } as never)
          await tx.flush()
          logId = row.id
        })
      } catch (error: unknown) {
        // An uncoded 500: no data leaves without its record (P-27).
        logger.error('Audited read refused: the log row could not be written', {
          fingerprint: 'foundation.audit.write_failed',
          purpose: spec.purpose,
          err: error,
        })
        throw error
      }
    },
    mirror: async () => {
      if (resourceIds.length === 0) return
      const accessLog = ctx.container.resolve<AccessLogService>('accessLogService')
      await accessLog.logMany(
        resourceIds.map((resourceId) => ({
          tenantId: spec.scope.tenantId,
          organizationId: spec.scope.organizationId,
          actorUserId,
          resourceKind: spec.resourceKind,
          resourceId,
          accessType: 'read',
          ...(spec.fields?.length ? { fields: [...spec.fields] } : {}),
          context: { purpose: spec.purpose, logId },
        })),
      )
    },
    onMirrorFailed: (error) => {
      logger.warn('Access log mirror failed; the module log row is the record', { purpose: spec.purpose, err: error })
    },
    read,
  })
}
