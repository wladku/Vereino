// Client pieces of B-33 "Cash to settle" (payments spec REQ-033; issue #118): the response shapes of
// `/api/payments/cash-custody` and `/api/payments/cash-handovers`, their query keys and the handover write. Since
// D-042 (REQ-033a, #791) also the confirmers' queue of pending handovers and its decisions, shared by B-33 and the
// phone page M-18a. Authorization stays on the routes and the commands.
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'

type PersonName = { firstName: string; lastName: string }

export type CustodyPayment = {
  paymentId: string
  /** The pending handover that reserves it: not selectable in "Accept handover". */
  pendingHandoverId: string | null
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

export type HandoverStatus = 'pending' | 'confirmed' | 'rejected' | 'withdrawn'

export type HandoverRow = {
  id: string
  number: string
  status: HandoverStatus
  collectorPersonId: string
  collector: PersonName | null
  receivedBy: PersonName | null
  decidedBy: PersonName | null
  sentByCollector: boolean
  amount: number
  paymentCount: number
  receiptNumbers: string[]
  payments: { paymentId: string; receiptNumber: string; amount: number; payer: PersonName | null }[]
  rejectionReason: string | null
  sentAt: string | null
  decidedAt: string | null
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

/** At most this many pending handovers on one page of the confirmers' queue. */
export const PENDING_PAGE_SIZE = 100

/** The pending handovers, oldest sent first (D-042): the confirmers' queue on B-33 and M-18a. */
export function usePendingHandovers() {
  return useQuery({
    queryKey: [CASH_CUSTODY_QUERY_KEY, 'pending'],
    queryFn: async () => {
      const params = new URLSearchParams({ status: 'pending', pageSize: String(PENDING_PAGE_SIZE) })
      const call = await apiCallOrThrow<HandoverPage>(`/api/payments/cash-handovers?${params.toString()}`)
      return call.result ?? { items: [], total: 0, page: 1, pageSize: PENDING_PAGE_SIZE, totalPages: 1 }
    },
  })
}

/** Confirms (the whole handover) or rejects (with a reason) a pending handover; answers its number. */
export async function decideHandover(
  id: string,
  decision: { kind: 'confirm' } | { kind: 'reject'; reason: string },
  errorMessage: string,
): Promise<{ number: string; status: HandoverStatus }> {
  const call = await apiCallOrThrow<{ number: string; status: HandoverStatus }>(
    `/api/payments/cash-handovers/${encodeURIComponent(id)}/${decision.kind}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(decision.kind === 'reject' ? { reason: decision.reason } : {}),
    },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}
