// `POST /api/payments/bank-transactions/{id}/undo` — Undo (payments spec REQ-030; issue #113, B-29): a recorded
// transfer's payments get reversing entries, its charges reopen and it returns to "To confirm".
import { bankDecisionOpenApi, bankDecisionRoute } from '../../../bank-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

export const POST = bankDecisionRoute('undo')

export const openApi = bankDecisionOpenApi(
  'Undo a recorded statement transfer',
  'Writes a reversing entry for each payment of the recorded transfer (`booked`), derives the charges’ statuses again and returns the transfer to `suggested` with the same payer.',
  null,
  '',
)
