// `enrolment:daily` (sign-up form spec DD-J14, `docs/compliance/retention.md` R22, R23; #799): runs
// `enrolment.applications.daily` for one club. The club job sweep hands the handler a trusted scope only.
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'enrolment-daily',
  id: 'enrolment:daily',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  await container.resolve<CommandBus>('commandBus').execute('enrolment.applications.daily', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

export default clubJobWorker('enrolment:daily', handle)
