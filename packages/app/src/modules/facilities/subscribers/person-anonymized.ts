// `facilities:person-anonymized` (people life-cycle spec *Events* row `people.person.anonymized`, REQ-L05; #308): when
// the club anonymises a former person, the person's rentals lose their contact snapshots and show the renter as the
// person directory does ("Former member") — `services/person-erasure.ts`. Persistent and idempotent.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { clearRenterContacts } from '../services/person-erasure'

export const metadata = {
  event: 'people.person.anonymized',
  persistent: true,
  id: 'facilities:person-anonymized',
}

const payloadSchema = z.object({ id: z.uuid(), tenantId: z.uuid(), organizationId: z.uuid() })

type SubscriberContext = { tenantId?: string | null; organizationId?: string | null }

export default async function handle(payload: unknown, ctx: SubscriberContext): Promise<void> {
  const parsed = payloadSchema.safeParse(payload)
  if (!parsed.success) return
  // The emitter's trusted scope wins over the payload's (the payload only repeats it).
  const scope = {
    tenantId: ctx.tenantId ?? parsed.data.tenantId,
    organizationId: ctx.organizationId ?? parsed.data.organizationId,
  }
  await clearRenterContacts(await createRequestContainer(), scope, parsed.data.id)
}
