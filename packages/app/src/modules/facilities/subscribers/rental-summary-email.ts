// `facilities:rental-summary-email` (facilities parity spec REQ-R17, J-R06; DD-46; #286): the renter's summary of a
// rental staff entered — place, slot, amount, payee and account, deadlines, rules and the cancellation link — once per
// rental (dispatch key `facilities:rental:<id>:summary`). Nothing for a rental without an e-mail address.
import { rentalMailHandler } from '../services/request-mail-subscriber'
import { sendTermsMail } from '../services/rental-links'

export const metadata = {
  event: 'facilities.rental.requested',
  persistent: true,
  id: 'facilities:rental-summary-email',
}

export default rentalMailHandler((container, scope, event) =>
  sendTermsMail(container, scope, event.id, { kind: 'summary' }),
)
