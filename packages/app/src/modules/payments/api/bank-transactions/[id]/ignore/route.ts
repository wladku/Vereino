// `POST /api/payments/bank-transactions/{id}/ignore` — Skip (payments spec REQ-030; issue #113, B-29): a transfer to
// confirm or unmatched is skipped with its reason — a donation, a grant, a refund or other.
import { bankTransactionIgnoreSchema } from '../../../../data/validators'
import { bankDecisionOpenApi, bankDecisionRoute } from '../../../bank-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

export const POST = bankDecisionRoute('ignore')

export const openApi = bankDecisionOpenApi(
  'Skip a statement transfer',
  'Marks the transfer (`suggested` or `unmatched`) `ignored` with its reason; nothing is recorded.',
  bankTransactionIgnoreSchema.omit({ id: true }),
  '',
)
