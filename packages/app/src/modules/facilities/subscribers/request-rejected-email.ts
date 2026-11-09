// `facilities:request-rejected-email` (facilities spec *Events, Jobs* row `facilities.rental.approved|rejected|expired|superseded`,
// DD-46; #125): the requester's e-mail once their online request is rejected — once per request and status (dispatch key
// `facilities:rental:<id>:rejected`), so a redelivered event sends nothing twice. A staff rental has no requester e-mail.
import { requestDecisionHandler } from '../services/request-mail-subscriber'

export const metadata = {
  event: 'facilities.rental.rejected',
  persistent: true,
  id: 'facilities:request-rejected-email',
}

export default requestDecisionHandler('rejected')
