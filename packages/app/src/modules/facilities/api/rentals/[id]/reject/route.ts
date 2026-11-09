// `POST /api/facilities/rentals/{id}/reject` — `facilities.rentals.reject` (facilities spec the `reject` row of *API,
// Command, and Error Contracts*, B-25; REQ-024; #125): the administrator rejects a confirmed online request with a
// reason of 5–500 characters; the slot is free again and the requester is e-mailed the reason.
import { requestRejectSchema } from '../../../../data/validators'
import { rentalActionHandler, rentalActionOpenApi } from '../../../rental-actions'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.view', 'facilities.rentals.approve'] },
}

export const POST = rentalActionHandler('facilities.rentals.reject')

export const openApi = rentalActionOpenApi({
  summary: 'Reject a booking request',
  description: 'Rejects a `pending_approval` online request with a reason of 5–500 characters (400 otherwise).',
  body: requestRejectSchema.omit({ id: true }),
  conflicts: '`invalid_transition` (already decided), `request_hold_expired`, `optimistic_lock_conflict`',
})
