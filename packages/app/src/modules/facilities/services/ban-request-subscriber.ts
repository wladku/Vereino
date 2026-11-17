// The handler both ban request subscribers share (`facilities:ban-request-on-create`, `…-on-update`; DD-R12, J-R08;
// #282): an incident saved with `entry_ban_requested` notifies the club administrators once (`notifyBanRequest`, keyed
// by the incident). The emitter's trusted scope wins over the payload's, which only repeats it.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyBanRequest } from './ban-requests'

const payloadSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid() })

export type BanRequestSubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export async function handleBanRequestEvent(payload: unknown, ctx: BanRequestSubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  await notifyBanRequest(container, scope, parsed.data.id)
}
