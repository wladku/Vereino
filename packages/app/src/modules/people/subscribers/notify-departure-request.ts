// `people:notify-departure-request` (people life-cycle spec *Events* row `people.departure_request.created`; phase L4,
// #306): a member asked to leave — the club administrators get the in-app notice and the e-mail. Persistent and
// idempotent: the dispatch key `people:departure-request:{batchId}` sends it once per request.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyDepartureRequest } from '../services/departure-notices'

export const metadata = {
  event: 'people.departure_request.created',
  persistent: true,
  id: 'people:notify-departure-request',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  batchId: z.uuid(),
  subjectPersonIds: z.array(z.uuid()).min(1),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await notifyDepartureRequest(await createRequestContainer(), scope, {
    batchId: parsed.data.batchId,
    subjectPersonIds: parsed.data.subjectPersonIds,
  })
}
