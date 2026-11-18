// `facilities:request-approved-email` (facilities spec *Events, Jobs* row `facilities.rental.approved|rejected|expired|superseded`,
// DD-46; #125; facilities parity spec REQ-R17, #286): the requester's e-mail once their online request is approved — the
// booking's terms with the cancellation link, once per request (dispatch key `facilities:rental:<id>:approved`), so a
// redelivered event sends nothing twice. A staff rental gets its summary from `facilities:rental-summary-email`.
import { rentalMailHandler } from '../services/request-mail-subscriber'
import { sendTermsMail } from '../services/rental-links'

export const metadata = {
  event: 'facilities.rental.approved',
  persistent: true,
  id: 'facilities:request-approved-email',
}

export default rentalMailHandler((container, scope, event) =>
  sendTermsMail(container, scope, event.id, { kind: 'approved' }),
)
