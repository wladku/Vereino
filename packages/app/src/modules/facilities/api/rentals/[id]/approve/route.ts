// `POST /api/facilities/rentals/{id}/approve` — `facilities.rentals.approve` (facilities spec the `approve` row of
// *API, Command, and Error Contracts*, B-25; REQ-024; #125): the administrator approves a confirmed online request,
// naming the renter (an institution or a person of the club, or a new institution) and optionally another category or
// amount (a changed amount needs a note). The request becomes a `requested` rental with its deadlines and, with
// `payments`, its charge; the requester is e-mailed the amount and the account.
import { requestApproveSchema } from '../../../../data/validators'
import { rentalActionHandler, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.view', 'facilities.rentals.approve'] },
}

export const POST = rentalActionHandler('facilities.rentals.approve')

export const openApi = rentalActionOpenApi({
  summary: 'Approve a booking request',
  description:
    'Approves a `pending_approval` online request whose 48-hour hold is still valid: `renterType` + `renterId` (an institution or a person of the club) or `createInstitution` (created in the same transaction); optional `renterCategory` (e.g. the staff-only winter-lighting rate) and `amountOverride` in minor units, which needs a `note` when it differs from the rate. The slot is checked again with the renter. Errors: 422 `request_renter_required` / `rental_renter_invalid` / `rental_amount_note_required` / `rental_rate_missing`.',
  body: requestApproveSchema.omit({ id: true }),
  conflicts:
    '`invalid_transition` (already decided), `request_hold_expired`, `rental_conflict` (with `conflicts`), `place_closed`, `zone_not_reservable`, `entry_ban_active`, `optimistic_lock_conflict`',
})
