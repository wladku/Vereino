// `POST /api/payments/bank-transactions/{id}/assign` — Change or Assign (payments spec REQ-030; issue #113, B-29):
// records a transfer to confirm or unmatched against the chosen payer's open charges, oldest first.
import { bankTransactionAssignSchema } from '../../../../data/validators'
import { bankDecisionOpenApi, bankDecisionRoute } from '../../../bank-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

export const POST = bankDecisionRoute('assign')

export const openApi = bankDecisionOpenApi(
  'Assign a payer to a statement transfer',
  'Records the transfer (`suggested` or `unmatched`) as `transfer` payments of `payerPersonId`’s open charges, oldest first.',
  bankTransactionAssignSchema.omit({ id: true }),
  '`bank_payer_no_open_charges` (the payer has nothing left to pay)',
)
