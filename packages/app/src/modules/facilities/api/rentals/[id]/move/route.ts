// `POST /api/facilities/rentals/{id}/move` — `facilities.rentals.move` (facilities spec glossary *Rental statuses*: a
// move keeps the status and the amount and clears the reschedule flag; DD-43; REQ-013; #122): the new slot passes the
// same checks as a new rental, the rental itself left out.
import { rentalMoveSchema } from '../../../../data/validators'
import { rentalActionHandler, rentalActionMetadata, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = rentalActionMetadata

export const POST = rentalActionHandler('facilities.rentals.move')

export const openApi = rentalActionOpenApi({
  summary: 'Move a rental',
  description:
    'Moves a requested or confirmed rental to a new start (and optionally another place), keeping its units, status and amount; the deadlines follow the new start and the reschedule flag is cleared. Errors 422 `facilities_reference_invalid` (unknown place).',
  body: rentalMoveSchema.omit({ id: true }),
  conflicts:
    '`invalid_transition` (the rental no longer holds a slot), `zone_not_reservable`, `rental_conflict`, `place_closed`, `entry_ban_active`, `optimistic_lock_conflict`',
})
