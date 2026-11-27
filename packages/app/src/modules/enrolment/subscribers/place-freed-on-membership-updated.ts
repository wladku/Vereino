// `enrolment:place-freed-on-membership-updated` (sign-up form spec DD-J15, REQ-J15; phase 3, #800): a membership of a
// group was updated, so a place may be free; the deciders of the group's section are told once a day when the group has
// a waiting list (`services/places.ts`). Persistent and repeat-safe (the notice is keyed per group and day); the
// emitter's trusted scope wins over the payload's.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { onMembershipChanged } from '../services/places'

export const metadata = {
  event: 'groups.membership.updated',
  persistent: true,
  id: 'enrolment:place-freed-on-membership-updated',
}

const payloadSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid(), groupId: z.uuid() })

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  const container = await createRequestContainer()
  await onMembershipChanged(
    container,
    {
      tenantId: ctx.tenantId ?? parsed.data.tenantId,
      organizationId: ctx.organizationId ?? parsed.data.organizationId,
    },
    parsed.data.groupId,
  )
}
