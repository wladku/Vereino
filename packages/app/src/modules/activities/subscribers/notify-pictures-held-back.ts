// `activities:notify-pictures-held-back` (event photos spec *Events* row `people.consent.image_withdrawn`, REQ-I09;
// #872): after a guardian or a person withdraws an image consent, the managers of each club event whose published
// pictures the withdrawal now holds back get one in-app notice naming the event and the count, never the person
// (`services/picture-notice.ts`). The pictures are hidden by the public read itself (DD-I01); a failure here only
// loses the notice. Persistent and idempotent: grouped by the event and the consent event.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { notifyPicturesHeldBack } from '../services/picture-notice'

export const metadata = {
  event: 'people.consent.image_withdrawn',
  persistent: true,
  id: 'activities:notify-pictures-held-back',
}

const payloadSchema = z.object({
  tenantId: z.uuid(),
  organizationId: z.uuid(),
  subjectPersonId: z.uuid(),
  consentEventId: z.uuid(),
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
  await notifyPicturesHeldBack(await createRequestContainer(), scope, {
    subjectPersonId: parsed.data.subjectPersonId,
    consentEventId: parsed.data.consentEventId,
  })
}
