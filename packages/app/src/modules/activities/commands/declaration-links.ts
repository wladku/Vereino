// `activities.attendance.declare_by_link` and the job `activities.declaration_links.send_reminders` (club spec REQ-017,
// AC-017, TEST-017, *Events, Jobs* row `activities:send-declaration-reminders`; foundation P-10, P-02):
// - a personal link declares for one session without a session: the command redeems the link in its own transaction
//   (`TokenLinkService.redeem`; a rolled-back declaration spends nothing), then `authorizeScoped` checks the person
//   against the link holder's current `self` and `guardian` grants (`{ token }` scope source; 403 `scope_denied` for
//   another family's child) and the shared declaration rules apply with `source = link`. The raw token is in the input,
//   so the audit entry is written without the command payload (`replayable: false`) and the command is not undoable;
// - the evening job sends the link for tomorrow's undeclared `confirm` sessions (`services/declaration-links.ts`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { ActingRole, GrantKind } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Occurrence } from '../data/entities'
import { attendanceDeclareSchema, declareByLinkSchema, sendRemindersSchema } from '../data/validators'
import { declarationLinkService, sendDeclarationReminders, type ReminderCounts } from '../services/declaration-links'
import {
  ATTENDANCE_RESOURCE_KIND,
  attendanceSnapshot,
  declarationTarget,
  emitDeclared,
  writeDeclaration,
  type DeclareCommandResult,
} from './attendance'
import { activitiesLog, inWriteTransaction, selfPersonId } from './shared'

const logger = createLogger('activities').child({ component: 'declaration-links' })

/** A link declares as the person it was sent to: for themself or for their wards — never as staff. */
export const LINK_DECLARE_KINDS: readonly GrantKind[] = ['self', 'guardian']

const declareByLinkCommand: CommandHandler<Record<string, unknown>, DeclareCommandResult> = {
  id: 'activities.attendance.declare_by_link',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const input = declareByLinkSchema.parse(rawInput)
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'activities.attendance.declare_by_link', async (em) => {
      const view = await declarationLinkService(ctx.container).redeem(em, input.token)
      if (!view) return activitiesErrors.throw('declaration_link_not_found')
      const link = view.link
      const authorized = await authorizeScoped(
        {
          input: attendanceDeclareSchema,
          resourceKind: ATTENDANCE_RESOURCE_KIND,
          allowedKinds: LINK_DECLARE_KINDS,
          // The session is the link's, never the input's.
          loadTarget: (parsed, txEm: EntityManager, lock) =>
            txEm.findOne(
              Occurrence,
              {
                id: parsed.occurrenceId,
                tenantId: view.tenantId,
                organizationId: view.organizationId,
                deletedAt: null,
              },
              lock,
            ),
          resolveTarget: (parsed, entity) => declarationTarget(entity as Occurrence, parsed.personId),
          lock: 'none',
          scopeSource: {
            token: { personId: link.guardianPersonId, tenantId: view.tenantId, organizationId: view.organizationId },
          },
        },
        { occurrenceId: link.occurrenceId, personId: input.personId, declared: input.declared },
        ctx,
        em,
      )
      return writeDeclaration(ctx, em, {
        occurrence: authorized.entity as Occurrence,
        personId: authorized.parsed.personId,
        declared: authorized.parsed.declared,
        actingRole: authorized.actingRole,
        declaredByPersonId: selfPersonId(authorized.scope) ?? link.guardianPersonId,
        source: 'link',
        now,
      })
    })
    await emitDeclared(result.entity, result.actingRole, result.guardianNotice, null)
    return result
  },
  buildLog: async ({ result }) => ({
    ...(await activitiesLog({
      result,
      resourceKind: ATTENDANCE_RESOURCE_KIND,
      labelKey: 'activities.audit.attendance.declareByLink',
      fallback: 'Declare attendance from a personal link',
      after: attendanceSnapshot(result.entity),
      parent: { resourceKind: 'activities.occurrence', resourceId: result.entity.occurrenceId },
      context: {
        created: result.created,
        declared: result.entity.declared,
        status: result.entity.declarationStatus,
        source: 'link',
      },
    })),
    // The input carries the raw token: keep it out of `action_logs`.
    replayable: false,
  }),
}

// --- The reminder job ---

export type RemindersJobResult = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  now: string
  counts: ReminderCounts
}

const sendRemindersCommand: CommandHandler<Record<string, unknown>, RemindersJobResult> = {
  id: 'activities.declaration_links.send_reminders',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'activities.declaration_links.send_reminders.authorize', (em) =>
      authorizeScoped(
        {
          input: sendRemindersSchema,
          resourceKind: 'activities.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      ),
    )
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const now = authorized.parsed.now ? new Date(authorized.parsed.now) : new Date()
    logger.info('Declaration reminders started', { ...scope, now: now.toISOString() })
    const counts = await sendDeclarationReminders(ctx.container, scope, now)
    logger.info('Declaration reminders finished', { ...scope, ...counts })
    return { ...scope, actingRole: authorized.actingRole, now: now.toISOString(), counts }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('activities.audit.jobs.sendReminders', 'Send declaration reminders'),
      resourceKind: 'activities.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { actingRole: result.actingRole, now: result.now, ...result.counts },
    }
  },
}

registerCommand(declareByLinkCommand)
registerCommand(sendRemindersCommand)
