// Client pieces of "Accept cash" (payments spec REQ-031; M-15, B-21; issue #114), shared by the admin dialog and the
// phone page: the response shapes of `/api/payments/cash/payers`, `/cash/charges` and `/cash`, their query keys and the
// write. Authorization stays on the routes and the command.
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'

type PersonName = { firstName: string; lastName: string }

export type CashPayer = PersonName & {
  payerPersonId: string
  wards: (PersonName & { personId: string })[]
  totalDue: number
  chargeCount: number
}

export type CashCharge = {
  id: string
  sourceType: string
  description: string
  personId: string | null
  person: PersonName | null
  periodLabel: string | null
  dueDate: string
  status: string
  amountDue: number
  paid: number
  remaining: number
  overdue: boolean
}

export type CashReceipt = {
  receiptNumber: string
  payerPersonId: string | null
  payer: PersonName | null
  amount: number
  chargeCount: number
  reversed: boolean
  createdAt: string
}

export type CashToday = { date: string; items: CashReceipt[]; total: number }

export type CashRecorded = {
  receiptNumber: string
  amount: number
  paidOn: string
  notified: boolean
  payments: { paymentId: string; chargeId: string; amount: number; chargeStatus: string; remaining: number }[]
}

export type CashInput = {
  payerPersonId: string
  chargeIds: string[]
  amount: number
  paidOn: string
  notify: boolean
}

/** Every cash query starts with this key, so one invalidation refreshes payers, charges and today's list. */
export const CASH_QUERY_KEY = 'payments-cash'

const PAYER_PAGE_SIZE = 20

export function useCashPayers(search: string) {
  const term = search.trim()
  return useQuery({
    queryKey: [CASH_QUERY_KEY, 'payers', term],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: String(PAYER_PAGE_SIZE) })
      if (term) params.set('search', term)
      const call = await apiCallOrThrow<{ items: CashPayer[]; total: number }>(
        `/api/payments/cash/payers?${params.toString()}`,
      )
      return call.result ?? { items: [], total: 0 }
    },
  })
}

export function useCashCharges(payerPersonId: string | null) {
  return useQuery({
    queryKey: [CASH_QUERY_KEY, 'charges', payerPersonId],
    enabled: payerPersonId !== null,
    queryFn: async () => {
      const call = await apiCallOrThrow<{ items: CashCharge[]; total: number }>(
        `/api/payments/cash/charges?payerPersonId=${encodeURIComponent(payerPersonId ?? '')}`,
      )
      return call.result ?? { items: [], total: 0 }
    },
  })
}

export function useCashToday() {
  return useQuery({
    queryKey: [CASH_QUERY_KEY, 'today'],
    queryFn: async () => {
      const call = await apiCallOrThrow<CashToday>('/api/payments/cash')
      return call.result ?? { date: '', items: [], total: 0 }
    },
  })
}

export async function recordCash(input: CashInput, errorMessage: string): Promise<CashRecorded> {
  const call = await apiCallOrThrow<CashRecorded>(
    '/api/payments/cash',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}
