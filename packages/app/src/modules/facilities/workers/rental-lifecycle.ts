// `facilities:rental-lifecycle` (facilities spec *Events, Jobs* row, DD-46; #122): every 15 minutes the confirmed
// rentals whose end has passed become `done`, and — where the management agreement with the place's owner turns it on —
// the unpaid rentals past their payment deadline are cancelled free of charge (facilities parity spec DD-R11; #284),
// through `facilities.rentals.advance_lifecycle` (`advanceWhere` conditional UPDATEs, so a retry changes nothing
// twice). The scheduler injects the registration's `tenantId` and `organizationId`; the worker re-validates them and
// dispatches the job command with a session-less job context. Unpaid rentals that do not expire stay on B-24's
// "unpaid" list.
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'facilities-rental-lifecycle',
  id: 'facilities:rental-lifecycle',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('facilities.rentals.advance_lifecycle', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

/** Run by the club job sweep with its claim, or by a per-club schedule of the old setup (#629); `clubJobWorker` hands
 * the handler a trusted scope only (AC-G05, #591). */
export default clubJobWorker('facilities:rental-lifecycle', handle)
