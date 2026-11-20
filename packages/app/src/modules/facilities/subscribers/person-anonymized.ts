// `facilities:person-anonymized` (people life-cycle spec *Events* row `people.person.anonymized`, REQ-L05; #308): when
// the club anonymises a former person, the contact snapshots the person's rentals carry (`contact_name`,
// `contact_phone`, `contact_email`, `contact_locale`) are cleared and the renter's display name becomes what the
// person directory shows for them ("Former member"). Ids, slots, amounts and the charge stay. Persistent and
// idempotent: a redelivered event finds nothing left to clear.
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { Rental } from '../data/entities'
import { personNames } from '../services/directory'

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
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  const rentals = await em.find(Rental, { ...scope, renterType: 'person', renterId: parsed.data.id })
  if (rentals.length === 0) return
  const shown = (await personNames(container, scope, [parsed.data.id], em)).get(parsed.data.id)
  for (const rental of rentals) {
    rental.contactName = null
    rental.contactPhone = null
    rental.contactEmail = null
    rental.contactLocale = null
    if (shown) rental.renterDisplayName = shown
  }
  await em.flush()
}
