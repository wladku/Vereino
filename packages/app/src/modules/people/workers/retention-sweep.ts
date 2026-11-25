// `people:retention-sweep` (club spec REQ-041, amendment B, *Events, Jobs* row; #471): the daily former participants'
// retention sweep, set up per club with `setUpClubJob` (`services/club-setup.ts`) — at setup for a new club, for an
// existing one by `mercato people retention-sweep --register-schedule` after the owner confirmed the dry run. The club
// job sweep (or a per-club schedule of the old setup, #629) passes the club's `tenantId` and `organizationId`;
// `clubJobWorker` hands the handler only a scope the sweep's claim or the club's registration proves (AC-G05, #591),
// and the worker dispatches the job command with a session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-retention-sweep',
  id: 'people:retention-sweep',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.retention_sweep', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('people:retention-sweep', handle)
