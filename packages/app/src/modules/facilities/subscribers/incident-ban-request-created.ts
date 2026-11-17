// `facilities:ban-request-on-create` (facilities parity spec DD-R12, the `facilities.incident.created|updated` row of
// *Events*; J-R08; #282): a reported incident that asks for an entry ban notifies the club administrators. Persistent;
// a redelivery finds the dispatch key used and sends nothing.
import { handleBanRequestEvent, type BanRequestSubscriberContext } from '../services/ban-request-subscriber'

export const metadata = {
  event: 'facilities.incident.created',
  persistent: true,
  id: 'facilities:ban-request-on-create',
}

export default async function handle(payload: unknown, ctx: BanRequestSubscriberContext): Promise<void> {
  await handleBanRequestEvent(payload, ctx)
}
