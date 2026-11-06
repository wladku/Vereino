'use client'
// `/backend/payments/settings` — the "Coaches and payments" tab of B-20 (UX concept README B-20, flow F-07
// administrator path; payments spec R07, DD-32; issue #108): whether coaches see membership fees and may take cash for
// them — fees and orders with cash (default), fees view-only, or orders only. `CrudForm` sends the lock token from
// `initialValues.updatedAt` (null until the first save creates the row).
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { COACH_FEE_ACCESS } from '../lib/payments-rules'
import { PaymentsNav } from './PaymentsNav'
import { errorMessage } from './client-helpers'

const SETTINGS_API = '/api/payments/settings'

type SettingsResponse = { coachFeeAccess: string; autoBookBankMatches: boolean; updatedAt: string | null }

type FormValues = Record<string, unknown> & { updatedAt: string | null }

export function PaymentsSettingsForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: settings, error } = useQuery({
    queryKey: ['payments-settings'],
    queryFn: () => readApiResultOrThrow<SettingsResponse>(SETTINGS_API),
  })

  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'coachFeeAccess',
        label: t('payments.settings.fields.coachFeeAccess'),
        type: 'select',
        required: true,
        options: COACH_FEE_ACCESS.map((value) => ({
          value,
          label: t(`payments.settings.coachFeeAccess.${value}`),
        })),
        description: t('payments.settings.fields.coachFeeAccess.help'),
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [{ id: 'coaches', title: t('payments.settings.groups.coaches'), column: 1, fields: ['coachFeeAccess'] }],
    [t],
  )

  let content: React.ReactNode
  if (error) content = <ErrorMessage label={errorMessage(error, t('payments.settings.errors.load'))} />
  else if (!settings) content = <LoadingMessage label={t('payments.settings.loading')} />
  else {
    content = (
      <CrudForm<FormValues>
        key={settings.updatedAt ?? 'defaults'}
        title={t('payments.settings.title')}
        titleHeadingLevel={1}
        fields={fields}
        groups={groups}
        initialValues={{ coachFeeAccess: settings.coachFeeAccess, updatedAt: settings.updatedAt }}
        submitLabel={t('payments.common.save')}
        onSubmit={async (values) => {
          await apiCallOrThrow(
            SETTINGS_API,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ coachFeeAccess: values.coachFeeAccess }),
            },
            { errorMessage: t('payments.settings.errors.save') },
          )
          flash(t('payments.settings.flash.saved'), 'success')
          await queryClient.invalidateQueries({ queryKey: ['payments-settings'] })
        }}
      />
    )
  }
  return <PaymentsNav current="settings">{content}</PaymentsNav>
}
