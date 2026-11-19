'use client'
// "Contract" in the person record's "Staff setup" checklist (people life-cycle spec REQ-L09, J-L07 step 2; #312):
// done when the person has a coach contract valid today (pending when one starts later), with a link to it; otherwise
// "Add a contract" opens the contract form (B-07) with the person as the party of a coach contract
// (`/backend/club/contracts/create?personId=…`).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { STAFF_STEP_VARIANT, isActiveAt, periodStep } from '@vereino/core'
import { useClubToday } from '@vereino/ui'
import type { ContractRow } from '../../../components/contracts-shared'

/** What `people`'s person record passes as the spot context. */
export type StaffSetupContractContext = { personId?: string }

const CONTRACTS_HREF = '/backend/club/contracts'

export default function StaffSetupContractWidget({
  context,
}: InjectionWidgetComponentProps<StaffSetupContractContext, Record<string, unknown>>) {
  const t = useT()
  const today = useClubToday()
  const personId = context.personId ?? null
  const query = useQuery({
    queryKey: ['club_core-staff-setup-contracts', personId],
    enabled: Boolean(personId),
    queryFn: async () => {
      const params = new URLSearchParams({ partyId: personId ?? '', kind: 'coach', pageSize: '100' })
      const data = await readApiResultOrThrow<{ items?: ContractRow[] }>(
        `/api/club_core/contracts?${params.toString()}`,
      )
      return (data.items ?? []).filter((row) => row.partyType === 'person' && row.validFrom !== null)
    },
  })
  const rows = query.data ?? []
  const periods = rows.map((row) => ({ id: row.id, validFrom: row.validFrom as string, validTo: row.validTo }))
  const step = periodStep(periods, today)
  const current = periods.find((period) => isActiveAt(period, today)) ?? periods.find((p) => p.validFrom > today)
  const detail = query.isError
    ? t('club_core.staffSetup.errors.load')
    : current
      ? t('club_core.staffSetup.contract.period', { from: current.validFrom, to: current.validTo ?? '…' })
      : t('club_core.staffSetup.contract.none')

  return (
    <div
      className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
      data-testid="club_core-staff-setup-contract"
      data-step={query.isSuccess ? step : undefined}
    >
      <span className="flex flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t('club_core.staffSetup.contract')}</span>
          {query.isSuccess ? (
            <StatusBadge variant={STAFF_STEP_VARIANT[step]}>{t(`club_core.staffSetup.step.${step}`)}</StatusBadge>
          ) : null}
        </span>
        <span className="text-muted-foreground text-xs">
          {query.isLoading ? t('club_core.common.loading') : detail}
        </span>
      </span>
      {personId && query.isSuccess ? (
        <span className="flex flex-wrap gap-2">
          {current ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`${CONTRACTS_HREF}/${encodeURIComponent(current.id)}/edit`}>
                {t('club_core.staffSetup.contract.open')}
              </Link>
            </Button>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link
                href={`${CONTRACTS_HREF}/create?personId=${encodeURIComponent(personId)}`}
                data-testid="club_core-staff-setup-contract-add"
              >
                {t('club_core.staffSetup.contract.add')}
              </Link>
            </Button>
          )}
        </span>
      ) : null}
    </div>
  )
}
