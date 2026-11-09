// `facilities:request-verified-notice` (facilities spec *Events, Jobs* row `facilities.rental.request_verified`; J-007
// step 4; #125): a confirmed online request tells the club's administrators in the app that it waits for a decision on
// B-25. Persistent; a redelivery finds the request decided and notifies nobody.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyApprovers } from '../services/requests'

export const metadata = {
  event: 'facilities.rental.request_verified',
  persistent: true,
  id: 'facilities:request-verified-notice',
}

const payloadSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid() })

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  await notifyApprovers(container, scope, parsed.data.id)
}
