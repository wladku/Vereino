// `foundation:identity-cleanup` (social sign-in spec *Events* row `auth.user.deleted`; AC-S02; #566): a deleted
// platform user loses its identity links, so a provider subject never stays bound to an account that is gone.
// Persistent and idempotent: a repeat finds nothing to delete. Narrowed to the emitter's tenant and organization.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { deleteUserLinks } from '../services/identity-links'

export const metadata = {
  event: 'auth.user.deleted',
  persistent: true,
  id: 'foundation:identity-cleanup',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid().nullable().optional(),
  organizationId: z.uuid().nullable().optional(),
})

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const tenantId = ctx.tenantId ?? parsed.data.tenantId
  const organizationId = ctx.organizationId ?? parsed.data.organizationId
  if (!tenantId || !organizationId) return
  await deleteUserLinks(await createRequestContainer(), { tenantId, organizationId }, parsed.data.id)
}
