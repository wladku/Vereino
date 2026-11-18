// `POST /api/facilities/rentals/{id}/confirm` — `facilities.rentals.confirm` (facilities spec DD-19, REQ-013; #122):
// `requested → confirmed`. A rental without a charge is confirmed at once (the rental register); a rental with a charge
// is confirmed by its payment, recorded on the charge in `payments` (facilities parity spec DD-R09, #285), so a direct
// confirm answers 409 `rental_awaits_payment` while the charge is open or partly paid and succeeds once it is paid.
import { z } from 'zod'
import { rentalActionHandler, rentalActionMetadata, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = rentalActionMetadata

export const POST = rentalActionHandler('facilities.rentals.confirm')

export const openApi = rentalActionOpenApi({
  summary: 'Confirm a rental',
  description:
    'Confirms a requested rental. Without a charge the confirm is noted in the rental register; a rental with a charge is confirmed by the payment recorded on its charge, and this route then serves only once the charge is paid.',
  body: z.object({}),
  conflicts:
    '`invalid_transition` (not requested), `rental_awaits_payment` (the charge, named by `chargeId`, is open or partly paid), `optimistic_lock_conflict`',
})
