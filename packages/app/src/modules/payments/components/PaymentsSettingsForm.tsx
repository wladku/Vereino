'use client'
// `/backend/payments/settings` — the "Coaches and payments" tab of B-20 (UX concept README B-20, flow F-07
// administrator path; payments spec R07, DD-32; issue #108): whether coaches see membership fees and may take cash for
// them — fees and orders with cash (default), fees view-only, or orders only. Since #301 (payments parity spec DD-C08,
// DD-C09) the group "Automatic charges and reminders": the daily generation switch, its day of the month (1–28) and
// the overdue reminders switch. The "Online payment" group (#302, REQ-C14, DD-C11, Q-C01) shows whether Stripe is
// connected and in which mode, the offered methods as checkboxes (a non-empty subset) and the online fee mode
// read-only with a link to club settings B-02. `CrudForm` sends the lock token from `initialValues.updatedAt` (null
// until the first save creates the row).
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ONLINE_METHODS, type OnlineConnection } from '../lib/online-payment'
import { COACH_FEE_ACCESS, MAX_GENERATION_DAY, MIN_GENERATION_DAY } from '../lib/payments-rules'
import { PaymentsNav } from './PaymentsNav'
import { errorMessage } from './client-helpers'

const SETTINGS_API = '/api/payments/settings'
/** Club settings B-02, where the online fee is set (Q-C01). */
const CLUB_SETTINGS_HREF = '/backend/club/settings'

type SettingsResponse = {
  coachFeeAccess: string
  autoBookBankMatches: boolean
  autoGenerateCharges: boolean
  generationDay: number
  overdueReminders: boolean
  onlineMethods: string[]
  onlineConnection: OnlineConnection
  onlineFeeMode: 'club_pays' | 'payer_pays' | null
  updatedAt: string | null
}

const CONNECTION_VARIANTS: Record<OnlineConnection, 'success' | 'warning' | 'error' | 'neutral'> = {
  connected_live: 'success',
  connected_test: 'warning',
  not_connected: 'error',
  unknown: 'neutral',
}

const methodField = (method: string) => `method_${method}`

function OnlinePaymentFacts({ settings }: { settings: SettingsResponse }) {
  const t = useT()
  // A `<dl>` holds only `dt`/`dd` groups (axe `definition-list`), so the hint sits after it.
  return (
    <div className="space-y-3 text-sm">
      <dl className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">{t('payments.settings.online.connection')}</dt>
          <dd data-testid="payments-online-connection" data-connection={settings.onlineConnection}>
            <StatusBadge variant={CONNECTION_VARIANTS[settings.onlineConnection]} dot>
              {t(`payments.settings.online.connection.${settings.onlineConnection}`)}
            </StatusBadge>
          </dd>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-muted-foreground">{t('payments.settings.online.feeMode')}</dt>
          <dd data-testid="payments-online-fee-mode">
            {settings.onlineFeeMode
              ? t(`payments.settings.online.feeMode.${settings.onlineFeeMode}`)
              : t('payments.settings.online.feeMode.unknown')}
          </dd>
          <dd>
            <Link className="text-primary underline underline-offset-2" href={CLUB_SETTINGS_HREF}>
              {t('payments.settings.online.feeMode.link')}
            </Link>
          </dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-xs">{t('payments.settings.online.keysHint')}</p>
    </div>
  )
}

/** The day field as an integer, or null when it is empty or not a whole number (the server answers the range). */
function dayOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const day = Number(value.trim())
  return Number.isInteger(day) ? day : null
}

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
      {
        id: 'autoGenerateCharges',
        label: t('payments.settings.fields.autoGenerateCharges'),
        type: 'checkbox',
        description: t('payments.settings.fields.autoGenerateCharges.help'),
      },
      {
        id: 'generationDay',
        label: t('payments.settings.fields.generationDay'),
        type: 'number',
        description: t('payments.settings.fields.generationDay.help', {
          min: MIN_GENERATION_DAY,
          max: MAX_GENERATION_DAY,
        }),
        visibleWhen: { field: 'autoGenerateCharges', equals: true },
      },
      {
        id: 'overdueReminders',
        label: t('payments.settings.fields.overdueReminders'),
        type: 'checkbox',
        description: t('payments.settings.fields.overdueReminders.help'),
      },
      ...ONLINE_METHODS.map((method): CrudField => ({
        id: methodField(method),
        label: t(`payments.settings.online.method.${method}`),
        type: 'checkbox',
      })),
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      { id: 'coaches', title: t('payments.settings.groups.coaches'), column: 1, fields: ['coachFeeAccess'] },
      {
        id: 'automation',
        title: t('payments.settings.groups.automation'),
        column: 1,
        fields: ['autoGenerateCharges', 'generationDay', 'overdueReminders'],
      },
      {
        id: 'online',
        title: t('payments.settings.groups.online'),
        description: t('payments.settings.online.methodsHelp'),
        column: 1,
        fields: ONLINE_METHODS.map(methodField),
        component: () => (settings ? <OnlinePaymentFacts settings={settings} /> : null),
      },
    ],
    [t, settings],
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
        initialValues={{
          coachFeeAccess: settings.coachFeeAccess,
          autoGenerateCharges: settings.autoGenerateCharges,
          generationDay: settings.generationDay,
          overdueReminders: settings.overdueReminders,
          ...Object.fromEntries(
            ONLINE_METHODS.map((method) => [methodField(method), settings.onlineMethods.includes(method)]),
          ),
          updatedAt: settings.updatedAt,
        }}
        submitLabel={t('payments.common.save')}
        onSubmit={async (values) => {
          const autoGenerateCharges = values.autoGenerateCharges === true
          const day = dayOf(values.generationDay)
          if (autoGenerateCharges && (day === null || day < MIN_GENERATION_DAY || day > MAX_GENERATION_DAY)) {
            throw createCrudFormError(t('payments.settings.validation.generationDay'), {
              generationDay: t('payments.settings.validation.generationDay'),
            })
          }
          const onlineMethods = ONLINE_METHODS.filter((method) => values[methodField(method)] === true)
          if (onlineMethods.length === 0) {
            const message = t('payments.errors.online_methods_invalid')
            throw createCrudFormError(message, { [methodField(ONLINE_METHODS[0])]: message })
          }
          await apiCallOrThrow(
            SETTINGS_API,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                coachFeeAccess: values.coachFeeAccess,
                autoGenerateCharges,
                overdueReminders: values.overdueReminders === true,
                // A hidden day (generation off) keeps the stored one.
                ...(autoGenerateCharges && day !== null ? { generationDay: day } : {}),
                onlineMethods,
              }),
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
