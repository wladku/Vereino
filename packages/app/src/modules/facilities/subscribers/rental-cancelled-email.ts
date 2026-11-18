// `facilities:rental-cancelled-email` (facilities parity spec REQ-R17; DD-46; #286): the renter's e-mail when a
// rental is cancelled — free, late (the payment forfeited) or unpaid after the payment deadline — by staff, by the
// renter's link or by the lifecycle job, once per rental and status (dispatch key `facilities:rental:<id>:<status>`).
import { rentalMailHandler } from '../services/request-mail-subscriber'
import { sendCancelledMail } from '../services/rental-links'

export const metadata = {
  event: 'facilities.rental.cancelled',
  persistent: true,
  id: 'facilities:rental-cancelled-email',
}

export default rentalMailHandler((container, scope, event) => sendCancelledMail(container, scope, event.id))
