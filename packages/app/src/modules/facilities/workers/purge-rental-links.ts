// `facilities:purge-rental-links` (engineering standards S9.5; `docs/compliance/retention.md` row R9; #525): once a
// day, `facilities.rental_links.purge_dead` deletes the club's rental links that expired or were used 30 days ago or
// earlier.
// The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and dispatches
// the job command with a session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'facilities-purge-rental-links',
  id: 'facilities:purge-rental-links',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.rental_links.purge_dead', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('facilities:purge-rental-links', handle)
