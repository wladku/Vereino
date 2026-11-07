// `POST /api/facilities/rentals/{id}/cancel` — `facilities.rentals.cancel` (facilities spec glossary *Rental statuses*,
// R05; REQ-013; #122): free up to 24 h before the start (`cancelled_free`, the charge cancelled), late after that
// (`cancelled_late`, the charge forfeited); the slot is free again.
import { rentalCancelSchema } from '../../../../data/validators'
import { rentalActionHandler, rentalActionMetadata, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = rentalActionMetadata

export const POST = rentalActionHandler('facilities.rentals.cancel')

export const openApi = rentalActionOpenApi({
  summary: 'Cancel a rental',
  description:
    'Cancels a requested or confirmed rental with an optional reason: `cancelled_free` up to the free-cancellation deadline (24 h before the start), `cancelled_late` after it (the charge is forfeited).',
  body: rentalCancelSchema.omit({ id: true }),
  conflicts: '`invalid_transition` (already cancelled, done or no-show), `optimistic_lock_conflict`',
})
