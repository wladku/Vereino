// The handler the request e-mail subscribers share (#125): validates the event's ids, takes the emitter's trusted
// scope over the payload's and sends the decision e-mail (`sendDecisionMail`, idempotent per request and status).
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { sendDecisionMail, type DecisionStatus } from './requests'

const payloadSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid() })

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export function requestDecisionHandler(status: DecisionStatus) {
  return async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) return
    const scope = {
      tenantId: ctx.tenantId ?? parsed.data.tenantId,
      organizationId: ctx.organizationId ?? parsed.data.organizationId,
    }
    const container = await createRequestContainer()
    await sendDecisionMail(container, scope, parsed.data.id, status)
  }
}
