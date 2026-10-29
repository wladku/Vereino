// `groups:sync-member-roles` (club spec *Account payer*; foundation spec DD-F05): a membership change can change the
// person's derived `auth` roles — an adult with an active `participant` membership is their own payer
// (`vereino_payer`) — so every `groups.membership.*` event asks `people` to recompute that person's roles through its
// `people.roleSync` service (`groups` requires `people`; the role sync stays `people`'s). Persistent, so a failed sync
// is retried by the queue; idempotent because the sync compares role sets. Periods that start or end on a later day
// are picked up by `people:sync-role-expiry`.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { PeopleRoleSync } from '../../people/di'

export const metadata = {
  event: 'groups.membership.*',
  persistent: true,
  id: 'groups:sync-member-roles',
}

/** `people`'s role-sync token (`PEOPLE_ROLE_SYNC` in `people/di.ts`). */
const PEOPLE_ROLE_SYNC = 'people.roleSync'

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  personId: z.uuid(),
})

type SubscriberContext = {
  resolve: (name: string) => unknown
  eventName?: string
  tenantId?: string | null
  organizationId?: string | null
}

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  const container = await createRequestContainer()
  if (!container.hasRegistration(PEOPLE_ROLE_SYNC)) return
  await container.resolve<PeopleRoleSync>(PEOPLE_ROLE_SYNC).syncPerson(scope, parsed.data.personId)
}
