// `enrolment:trial-session-cancelled` (sign-up form spec *Events, Jobs, Notifications*, DD-J12; phase 4, #801): a
// session was cancelled, so every application whose trial session it was goes back to `new` through
// `enrolment.applications.trial_session_cancelled`, run with a session-less job context in the session's club; the
// applicant is e-mailed and the deciders are told. Persistent and repeat-safe (a redelivered event finds no trial left
// on the session); the emitter's trusted scope wins over the payload's.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'activities.occurrence.cancelled',
  persistent: true,
  id: 'enrolment:trial-session-cancelled',
}

const payloadSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid() })

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const container = await createRequestContainer()
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await container.resolve<CommandBus>('commandBus').execute('enrolment.applications.trial_session_cancelled', {
    input: { occurrenceId: parsed.data.id },
    ctx: jobCommandContext(container, scope),
  })
}
