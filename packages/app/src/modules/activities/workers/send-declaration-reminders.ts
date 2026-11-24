// `activities:send-declaration-reminders` (club spec *Events, Jobs* row, REQ-017; foundation II P-12): daily at 18:00 in
// the club's time zone, the personal declaration link for tomorrow's undeclared `confirm` sessions, through
// `activities.declaration_links.send_reminders` (one link per person and session: the dispatch key makes a retry send
// nothing twice). The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates
// them and dispatches the job command with a session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'activities-send-declaration-reminders',
  id: 'activities:send-declaration-reminders',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('activities.declaration_links.send_reminders', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('activities:send-declaration-reminders', handle)
