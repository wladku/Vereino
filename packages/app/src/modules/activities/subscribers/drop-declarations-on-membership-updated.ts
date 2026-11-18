// `activities:drop-declarations-on-membership-updated` (people life-cycle spec *Events* row `groups.membership.updated`
// with an end date, REQ-L11 subscriber part; phase L4, #306): a membership of a group was updated — when it no longer
// covers the group's later sessions, the person's undecided attendance rows of those sessions are dropped
// (`services/ended-membership.ts`). Persistent and idempotent.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { dropUncoveredDeclarations } from '../services/ended-membership'

export const metadata = {
  event: 'groups.membership.updated',
  persistent: true,
  id: 'activities:drop-declarations-on-membership-updated',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  groupId: z.uuid(),
  personId: z.uuid(),
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
  await dropUncoveredDeclarations(await createRequestContainer(), scope, {
    groupId: parsed.data.groupId,
    personId: parsed.data.personId,
  })
}
