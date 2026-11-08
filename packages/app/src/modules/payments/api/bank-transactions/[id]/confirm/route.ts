// `POST /api/payments/bank-transactions/{id}/confirm` — Confirm (payments spec REQ-030; issue #113, B-29): records a
// transfer waiting in "To confirm" against the proposed payer's open charges, oldest first.
import { bankDecisionOpenApi, bankDecisionRoute } from '../../../bank-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

export const POST = bankDecisionRoute('confirm')

export const openApi = bankDecisionOpenApi(
  'Confirm a statement transfer',
  'Records the transfer (`suggested`) as `transfer` payments of the proposed payer’s open charges, oldest first; what exceeds them stays unallocated.',
  null,
  '`bank_payer_no_open_charges` (the payer has nothing left to pay)',
)
