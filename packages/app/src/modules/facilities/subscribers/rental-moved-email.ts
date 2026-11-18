// `facilities:rental-moved-email` (facilities parity spec REQ-R17, the move row of *API, Command, and Error
// Contracts*; DD-46; #286): the renter's "moved" e-mail with the new slot and a re-issued cancellation link, once per
// move (dispatch key `facilities:rental-moved:<moveId>`). An event without a move id (emitted before #286) sends nothing.
import { rentalMailHandler } from '../services/request-mail-subscriber'
import { sendTermsMail } from '../services/rental-links'

export const metadata = {
  event: 'facilities.rental.moved',
  persistent: true,
  id: 'facilities:rental-moved-email',
}

export default rentalMailHandler(async (container, scope, event) =>
  event.moveId ? sendTermsMail(container, scope, event.id, { kind: 'moved', moveId: event.moveId }) : false,
)
