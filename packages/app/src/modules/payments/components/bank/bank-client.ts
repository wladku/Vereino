// Client pieces of B-29 "Bank statement" (payments spec REQ-030; issue #113): the response shapes of
// `/api/payments/bank-transactions`, `/bank-imports`, `/bank-payers` and `/settings`, their query keys and the writes.
// Authorization stays on the routes and the commands.
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { BankAction, BankPerspective, BankSkipReason } from '../../lib/bank-matching'
import type { ColumnProfile } from '../../lib/bank-statement'

type PersonName = { firstName: string; lastName: string }

export type BankTransfer = {
  id: string
  importId: string
  line: number
  bookedOn: string
  amount: number
  counterpartyName: string | null
  counterpartyAccount: string | null
  title: string
  status: 'booked' | 'suggested' | 'unmatched' | 'ignored'
  payerPersonId: string | null
  payer: PersonName | null
  payerCode: string | null
  allocation: { chargeId: string; amount: number; description: string | null }[]
  unallocated: number
  matchReason: string
  autoBooked: boolean
  skipReason: string | null
  skipNote: string | null
  decidedAt: string | null
  updatedAt: string
}

export type BankCounts = Record<BankPerspective, number>

export type BankTransfersPage = {
  items: BankTransfer[]
  total: number
  totalPages: number
  counts: BankCounts
}

export type BankImportRow = {
  id: string
  fileName: string
  format: string
  total: number
  booked: number
  suggested: number
  unmatched: number
  skipped: number
  importedBy: PersonName | null
  createdAt: string
}

export type BankImportSummary = {
  importId: string
  format: string
  total: number
  booked: number
  suggested: number
  unmatched: number
  skipped: number
  debits: number
  duplicates: number
  unreadable: number[]
}

export type BankPayer = PersonName & {
  payerPersonId: string
  payerCode: string
  wards: (PersonName & { personId: string })[]
  totalDue: number
  chargeCount: number
}

type Settings = { coachFeeAccess: string; autoBookBankMatches: boolean; updatedAt: string | null }

/** Every B-29 query starts with this key, so one invalidation refreshes the queue, the counts and the history. */
export const BANK_QUERY_KEY = 'payments-bank'

export const BANK_PAGE_SIZE = 50

export function useBankTransfers(perspective: BankPerspective, page: number) {
  return useQuery({
    queryKey: [BANK_QUERY_KEY, 'transfers', perspective, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(BANK_PAGE_SIZE) })
      if (perspective !== 'all') params.set('status', perspective)
      const call = await apiCallOrThrow<BankTransfersPage>(`/api/payments/bank-transactions?${params.toString()}`)
      return call.result as BankTransfersPage
    },
  })
}

export function useBankImports() {
  return useQuery({
    queryKey: [BANK_QUERY_KEY, 'imports'],
    queryFn: async () => {
      const call = await apiCallOrThrow<{ items: BankImportRow[]; total: number }>(
        '/api/payments/bank-imports?pageSize=10',
      )
      return call.result ?? { items: [], total: 0 }
    },
  })
}

export function useBankPayers(search: string, enabled: boolean) {
  const term = search.trim()
  return useQuery({
    queryKey: [BANK_QUERY_KEY, 'payers', term],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '20' })
      if (term) params.set('search', term)
      const call = await apiCallOrThrow<{ items: BankPayer[]; total: number }>(
        `/api/payments/bank-payers?${params.toString()}`,
      )
      return call.result ?? { items: [], total: 0 }
    },
  })
}

export function useAutoRecord() {
  return useQuery({
    queryKey: [BANK_QUERY_KEY, 'settings'],
    queryFn: async () => {
      const call = await apiCallOrThrow<Settings>('/api/payments/settings')
      return call.result as Settings
    },
  })
}

export async function saveAutoRecord(value: boolean, lock: string | null, errorMessage: string): Promise<void> {
  const send = () =>
    apiCallOrThrow(
      '/api/payments/settings',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ autoBookBankMatches: value }),
      },
      { errorMessage },
    )
  if (lock) await withScopedApiRequestHeaders(buildOptimisticLockHeader(lock), send)
  else await send()
}

export async function importStatement(
  input: { file: File; format: string; columnProfile: ColumnProfile | null },
  errorMessage: string,
): Promise<BankImportSummary> {
  const form = new FormData()
  form.set('file', input.file)
  if (input.format !== 'auto') form.set('format', input.format)
  if (input.columnProfile) form.set('columnProfile', JSON.stringify(input.columnProfile))
  const call = await apiCallOrThrow<BankImportSummary>(
    '/api/payments/bank-imports',
    { method: 'POST', body: form },
    { errorMessage },
  )
  if (!call.result) throw new Error(errorMessage)
  return call.result
}

export async function decide(
  transfer: Pick<BankTransfer, 'id' | 'updatedAt'>,
  action: BankAction,
  body: { payerPersonId?: string; reason?: BankSkipReason; note?: string | null } | null,
  errorMessage: string,
): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(transfer.updatedAt), () =>
    apiCallOrThrow(
      `/api/payments/bank-transactions/${encodeURIComponent(transfer.id)}/${action}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      },
      { errorMessage },
    ),
  )
}
