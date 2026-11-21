'use client'
// The "Charges" tab of the person record (README B-10, mockup `screenPerson` tab `charges`; payments parity spec
// REQ-C07, DD-C05; #295): the charges the person owes or pays, with the B-21 columns, newest period first; a row opens
// the charge (B-22) and "Add charge" enters one by hand for this person. The list is `GET /api/payments/charges` with
// `involvesPersonId`, so the caller's own scope applies and the tab never widens it.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { AddChargeDialog } from '../../../components/AddChargeDialog'
import { chargeColumns } from '../../../components/ChargesTable'
import { TableLoadError } from '@vereino/ui'
import { chargeHref, type ChargeRow } from '../../../components/client-helpers'

/** What `people`'s person record passes as the spot context. */
export type PersonChargesContext = { personId?: string }

const PAGE_SIZE = 50

export default function PersonChargesWidget({
  context,
}: InjectionWidgetComponentProps<PersonChargesContext, Record<string, unknown>>) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const personId = context.personId ?? null
  const [page, setPage] = React.useState(1)
  const [adding, setAdding] = React.useState(false)
  const query = useQuery({
    queryKey: ['payments-charges', 'person', personId, page],
    enabled: Boolean(personId),
    queryFn: () =>
      fetchCrudList<ChargeRow>('payments/charges', { page, pageSize: PAGE_SIZE, involvesPersonId: personId ?? '' }),
  })
  const columns = React.useMemo(() => chargeColumns(t, locale), [t, locale])
  if (!personId) return null

  return (
    <div className="flex flex-col gap-4" data-testid="person-charges">
      <DataTable<ChargeRow>
        title={t('payments.personCharges.title')}
        entityId="payments:charge"
        extensionTableId="payments.person-charges"
        actions={
          <Button
            type="button"
            data-testid="person-add-charge-open"
            onClick={() => {
              setAdding(true)
            }}
          >
            {t('payments.manual.action')}
          </Button>
        }
        columns={columns}
        data={query.data?.items ?? []}
        isLoading={query.isLoading}
        error={
          query.error ? (
            <TableLoadError
              message={t('payments.charges.errors.load')}
              retryLabel={t('payments.common.retry')}
              onRetry={() => void query.refetch()}
            />
          ) : null
        }
        emptyState={
          <p className="text-muted-foreground text-sm" data-testid="person-charges-empty">
            {t('payments.personCharges.empty')}
          </p>
        }
        onRowClick={(row: ChargeRow) => {
          router.push(chargeHref(row.id))
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: query.data?.total ?? 0,
          totalPages: query.data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      {adding ? (
        <AddChargeDialog
          open={adding}
          onOpenChange={setAdding}
          personId={personId}
          onCreated={async () => {
            await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
          }}
        />
      ) : null}
    </div>
  )
}
