// `people:medical-reminders` (training outlines and medical expiry spec DD-O04, REQ-O03; #682): the daily medical
// certificate job at 07:00 club time, run by the foundation's club job sweep (`lib/club-jobs.ts`). `clubJobWorker` hands
// the handler only a scope the sweep's claim proves (AC-G05, #591); the worker dispatches the job command with a
// session-less job context (acting role `system`).
import type { WorkerMeta } from '@open-mercato/queue'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clubJobWorker, jobCommandContext, type TrustedScope } from '@/modules/foundation'

export const metadata: WorkerMeta = {
  queue: 'people-medical-reminders',
  id: 'people:medical-reminders',
  concurrency: 1,
}

async function handle(scope: TrustedScope): Promise<void> {
  const container = await createRequestContainer()
  const commandBus = container.resolve<CommandBus>('commandBus')
  await commandBus.execute('people.persons.medical_reminders', {
    input: {},
    ctx: jobCommandContext(container, scope),
  })
}

export default clubJobWorker('people:medical-reminders', handle)
