// The handler the request and renter e-mail subscribers share (#125, #286): validates the event's ids, takes the
// emitter's trusted scope over the payload's and sends the e-mail (each idempotent per rental and status or move).
import { z } from 'zod'
import type { AwilixContainer } from 'awilix'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { FacilitiesScope } from './directory'
import { sendDecisionMail, type DecisionStatus } from './requests'

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  /** The id of one move (`facilities.rental.moved`), the key of its "moved" e-mail. */
  moveId: z.uuid().optional(),
})

export type RentalMailEvent = z.output<typeof payloadSchema>

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

type SendMail = (container: AwilixContainer, scope: FacilitiesScope, event: RentalMailEvent) => Promise<unknown>

export function rentalMailHandler(send: SendMail) {
  return async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
    const parsed = payloadSchema.safeParse(payload)
    if (!parsed.success) return
    const scope = {
      tenantId: ctx.tenantId ?? parsed.data.tenantId,
      organizationId: ctx.organizationId ?? parsed.data.organizationId,
    }
    const container = await createRequestContainer()
    await send(container, scope, parsed.data)
  }
}

export function requestDecisionHandler(status: DecisionStatus) {
  return rentalMailHandler((container, scope, event) => sendDecisionMail(container, scope, event.id, status))
}
