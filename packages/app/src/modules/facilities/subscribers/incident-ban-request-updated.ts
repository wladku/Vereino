// `facilities:ban-request-on-update` (facilities parity spec DD-R12, the `facilities.incident.created|updated` row of
// *Events*; J-R08; #282): an incident whose actions newly include the entry ban request notifies the club
// administrators. Persistent; the dispatch key of the incident makes a second save or a redelivery send nothing.
import { handleBanRequestEvent, type BanRequestSubscriberContext } from '../services/ban-request-subscriber'

export const metadata = {
  event: 'facilities.incident.updated',
  persistent: true,
  id: 'facilities:ban-request-on-update',
}

export default async function handle(payload: unknown, ctx: BanRequestSubscriberContext): Promise<void> {
  await handleBanRequestEvent(payload, ctx)
}
