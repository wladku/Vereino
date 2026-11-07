// `POST /api/facilities/rentals/{id}/no-show` — `facilities.rentals.no_show` (facilities spec glossary *Rental
// statuses*: the renter did not come, the charge remains; REQ-013; #122).
import { z } from 'zod'
import { rentalActionHandler, rentalActionMetadata, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = rentalActionMetadata

export const POST = rentalActionHandler('facilities.rentals.no_show')

export const openApi = rentalActionOpenApi({
  summary: 'Record a no-show',
  description: 'Records that the renter of a requested or confirmed rental did not come; the charge remains.',
  body: z.object({}),
  conflicts: '`invalid_transition`, `optimistic_lock_conflict`',
})
