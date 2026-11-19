// Client pieces of B-33 "Cash to settle" (payments spec REQ-033; issue #118): the response shapes of
// `/api/payments/cash-custody` and `/api/payments/cash-handovers`, their query keys and the handover write.
// Authorization stays on the routes and the command.
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'

type PersonName = { firstName: string; lastName: string }

export type CustodyPayment = {
  paymentId: string
  receiptNumber: string
  paidOn: string
  amount: number
  chargeId: string
  description: string
  payerPersonId: string | null
  payer: PersonName | null
}

export type CustodyCollector = {
  collectorPersonId: string
  collector: PersonName | null
  oldestPaidOn: string
  total: number
  payments: CustodyPayment[]
}

export type CashCustody = { items: CustodyCollector[]; total: number }

export type HandoverRow = {
  id: string
  number: string
  collectorPersonId: string
  collector: PersonName | null
  receivedBy: PersonName | null
  amount: number
  paymentCount: number
  receiptNumbers: string[]
  createdAt: string
}

export type HandoverPage = { items: HandoverRow[]; total: number; page: number; pageSize: number; totalPages: number }

/** Every B-33 query starts with this key, so one invalidation refreshes the custody and the history. */
export const CASH_CUSTODY_QUERY_KEY = 'payments-cash-custody'

export const HANDOVER_PAGE_SIZE = 20

export function useCashCustody() {
  return useQuery({
    queryKey: [CASH_CUSTODY_QUERY_KEY, 'custody'],
    queryFn: async () => {
      const call = await apiCallOrThrow<CashCustody>('/api/payments/cash-custody')
      return call.result ?? { items: [], total: 0 }
    },
  })
}

export function useHandovers(page: number) {
  return useQuery({
    queryKey: [CASH_CUSTODY_QUERY_KEY, 'handovers', page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(HANDOVER_PAGE_SIZE) })
      const call = await apiCallOrThrow<HandoverPage>(`/api/payments/cash-handovers?${params.toString()}`)
      return call.result ?? { items: [], total: 0, page, pageSize: HANDOVER_PAGE_SIZE, totalPages: 1 }
    },
  })
}

/** Accepts the selected cash payments of one collector; answers the handover number. */
export async function acceptHandover(
  input: { collectorPersonId: string; paymentIds: string[] },
  errorMessage: string,
): Promise<{ number: string; amount: number }> {
  const call = await apiCallOrThrow<{ number: string; amount: number }>(
    '/api/payments/cash-handovers',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}
