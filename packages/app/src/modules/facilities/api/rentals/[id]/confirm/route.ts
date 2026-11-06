// `POST /api/facilities/rentals/{id}/confirm` — `facilities.rentals.confirm` (facilities spec DD-19: without `payments`
// staff confirm a rental by hand; REQ-013; #122): `requested → confirmed`.
import { z } from 'zod'
import { rentalActionHandler, rentalActionMetadata, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = rentalActionMetadata

export const POST = rentalActionHandler('facilities.rentals.confirm')

export const openApi = rentalActionOpenApi({
  summary: 'Confirm a rental',
  description: 'Confirms a requested rental (payment received to the owner account, or confirmed by staff).',
  body: z.object({}),
  conflicts: '`invalid_transition` (not requested), `optimistic_lock_conflict`',
})
