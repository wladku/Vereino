// `POST /api/facilities/rentals/{id}/move` — `facilities.rentals.move` (facilities spec glossary *Rental statuses*: a
// move keeps the status, re-quotes the amount on another place and clears the reschedule flag; DD-43; REQ-013; #122,
// #221): the new slot passes the same checks as a new rental, the rental itself left out.
import { rentalMoveSchema } from '../../../../data/validators'
import { rentalActionHandler, rentalActionMetadata, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = rentalActionMetadata

export const POST = rentalActionHandler('facilities.rentals.move')

export const openApi = rentalActionOpenApi({
  summary: 'Move a rental',
  description:
    'Moves a requested or confirmed rental to a new start (and optionally another place), keeping its units and status; the deadlines follow the new start and the reschedule flag is cleared. A move to another place re-quotes the amount from the rates of that place. With the payments module the unpaid charge follows: its due date, description, amount and payee; a rental whose charge holds a payment keeps its amount and payment deadline. Errors 422 `facilities_reference_invalid` (unknown place), 422 `rental_rate_missing` (no rate on the new place).',
  body: rentalMoveSchema.omit({ id: true }),
  conflicts:
    '`invalid_transition` (the rental no longer holds a slot), `zone_not_reservable`, `rental_conflict`, `place_closed`, `entry_ban_active`, `optimistic_lock_conflict`',
})
