// `POST /api/payments/bank-transactions/{id}/restore` — Restore (issue #113, Q1: the owner's default of 2026-11-08):
// a skipped transfer returns to "Unmatched", without a payer.
import { bankDecisionOpenApi, bankDecisionRoute } from '../../../bank-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

export const POST = bankDecisionRoute('restore')

export const openApi = bankDecisionOpenApi(
  'Restore a skipped statement transfer',
  'Returns a skipped transfer (`ignored`) to `unmatched`, without a payer.',
  null,
  '',
)
