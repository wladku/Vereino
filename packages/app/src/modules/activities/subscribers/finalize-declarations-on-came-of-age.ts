// `activities:finalize-declarations-on-came-of-age` (people life-cycle spec *Events* row `people.person.came_of_age`;
// phase L8, #310): the daily people life-cycle job ended a ward's guardianships on the 18th birthday — the person's
// `pending_guardian` declarations of sessions from that day become final (`services/came-of-age.ts`). Persistent and
// idempotent.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { finalizeDeclarationsFromBirthday } from '../services/came-of-age'

export const metadata = {
  event: 'people.person.came_of_age',
  persistent: true,
  id: 'activities:finalize-declarations-on-came-of-age',
}

const payloadSchema = z.object({
  id: z.uuid(),
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  birthday: z.iso.date(),
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
  await finalizeDeclarationsFromBirthday(await createRequestContainer(), scope, {
    personId: parsed.data.id,
    birthday: parsed.data.birthday,
  })
}
