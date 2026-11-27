// `enrolment:rollover-closed-groups` (sign-up form spec DD-J15a; phase 3, #800): a season rollover closed groups; their
// open applications go back to the coordinator through `enrolment.applications.group_closed`, run with a session-less
// job context in the rollover's club. Persistent and repeat-safe.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { jobCommandContext } from '@/modules/foundation'

export const metadata = {
  event: 'groups.season.rolled_over',
  persistent: true,
  id: 'enrolment:rollover-closed-groups',
}

const payloadSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  closedGroupIds: z.array(z.uuid()).default([]),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success || parsed.data.closedGroupIds.length === 0) return
  const container = await createRequestContainer()
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  for (let start = 0; start < parsed.data.closedGroupIds.length; start += 500) {
    await container.resolve<CommandBus>('commandBus').execute('enrolment.applications.group_closed', {
      input: { closedGroupIds: parsed.data.closedGroupIds.slice(start, start + 500) },
      ctx: jobCommandContext(container, scope),
    })
  }
}
