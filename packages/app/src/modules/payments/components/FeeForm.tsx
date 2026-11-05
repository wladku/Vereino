'use client'
// `/backend/payments/fees/create` and `/backend/payments/fees/[id]/edit` (UX concept README B-20; payments spec
// REQ-011, REQ-018; issue #108): a fee schedule's name, its group **or** activity (the target kind decides which
// select shows, so the form never sends both), the period, the amount in PLN, the payment day 1–28 and the validity.
// A one-off fee for a `camp` activity is a fee with the period "one-off" and the camp as its activity.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { FEE_PERIODS, MAX_DUE_DAY, MIN_DUE_DAY } from '../lib/payments-rules'
import {
  FEES_HREF,
  activityOptions,
  errorMessage,
  fromGrosz,
  groupOptions,
  localToday,
  toGrosz,
  tolerant,
  type FeeRow,
  type Translate,
} from './client-helpers'

const ENTITY_ID = 'payments:fee'

type FeeFormValues = Record<string, unknown> & { updatedAt?: string | null }

function useFeeFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('payments.fees.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'targetKind',
        label: t('payments.fees.fields.targetKind'),
        type: 'select',
        required: true,
        options: [
          { value: 'group', label: t('payments.fees.targetKind.group') },
          { value: 'activity', label: t('payments.fees.targetKind.activity') },
        ],
        description: t('payments.fees.fields.targetKind.help'),
        layout: 'half',
      },
      {
        id: 'groupId',
        label: t('payments.fees.fields.group'),
        type: 'select',
        loadOptions: tolerant(groupOptions),
        visibleWhen: { field: 'targetKind', equals: 'group' },
        layout: 'half',
      },
      {
        id: 'activityId',
        label: t('payments.fees.fields.activity'),
        type: 'select',
        loadOptions: tolerant(activityOptions),
        visibleWhen: { field: 'targetKind', equals: 'activity' },
        layout: 'half',
      },
      {
        id: 'period',
        label: t('payments.fees.fields.period'),
        type: 'select',
        required: true,
        options: FEE_PERIODS.map((period) => ({ value: period, label: t(`payments.fees.period.${period}`) })),
        layout: 'half',
      },
      {
        id: 'amount',
        label: t('payments.fees.fields.amount'),
        type: 'text',
        required: true,
        description: t('payments.fees.fields.amount.help'),
        layout: 'half',
      },
      {
        id: 'dueDay',
        label: t('payments.fees.fields.dueDay'),
        type: 'number',
        required: true,
        description: t('payments.fees.fields.dueDay.help', { min: MIN_DUE_DAY, max: MAX_DUE_DAY }),
        layout: 'half',
      },
      { id: 'validFrom', label: t('payments.fees.fields.validFrom'), type: 'date', required: true, layout: 'half' },
      {
        id: 'validTo',
        label: t('payments.fees.fields.validTo'),
        type: 'date',
        layout: 'half',
        description: t('payments.fees.fields.validTo.help'),
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'fee',
        title: t('payments.fees.groups.fee'),
        column: 1,
        fields: ['name', 'targetKind', 'groupId', 'activityId', 'period', 'amount', 'dueDay', 'validFrom', 'validTo'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(row: FeeRow | null): FeeFormValues {
  return {
    name: row?.name ?? '',
    targetKind: row?.activityId ? 'activity' : 'group',
    groupId: row?.groupId ?? '',
    activityId: row?.activityId ?? '',
    period: row?.period ?? 'monthly',
    amount: fromGrosz(row?.amount),
    dueDay: row?.dueDay ?? 10,
    validFrom: row?.validFrom ?? localToday(),
    validTo: row?.validTo ?? '',
    updatedAt: row?.updatedAt ?? null,
  }
}

/** The request body: the target the kind selects (the other one cleared), the amount in grosz. */
function toPayload(values: FeeFormValues, t: Translate) {
  const amount = toGrosz(values.amount)
  if (amount === null || amount <= 0) throw new Error(t('payments.fees.errors.amount'))
  const byActivity = values.targetKind === 'activity'
  const id = (value: unknown) => (typeof value === 'string' && value ? value : null)
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    groupId: byActivity ? null : id(values.groupId),
    activityId: byActivity ? id(values.activityId) : null,
    period: values.period,
    amount,
    dueDay: Number(values.dueDay),
    validFrom: values.validFrom,
    validTo: typeof values.validTo === 'string' && values.validTo ? values.validTo : null,
  }
}

export function FeeCreateForm() {
  const t = useT()
  const { fields, groups } = useFeeFields(t)
  return (
    <CrudForm<FeeFormValues>
      title={t('payments.fees.create.title')}
      titleHeadingLevel={1}
      backHref={FEES_HREF}
      cancelHref={FEES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('payments.common.create')}
      successRedirect={withFlash(FEES_HREF, t('payments.fees.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('payments/fees', toPayload(values, t))
      }}
    />
  )
}

export function FeeEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useFeeFields(t)
  const query = useQuery({
    queryKey: ['payments-fees-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<FeeRow>('payments/fees', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('payments.fees.errors.notFound')}
        backHref={FEES_HREF}
        backLabel={t('payments.fees.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('payments.fees.errors.load'))} />

  return (
    <CrudForm<FeeFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('payments.fees.edit.title')}
      titleHeadingLevel={1}
      backHref={FEES_HREF}
      cancelHref={FEES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('payments.fees.loading')}
      initialValues={{ ...toFormValues(row), id }}
      submitLabel={t('payments.common.save')}
      successRedirect={withFlash(FEES_HREF, t('payments.fees.flash.saved'), 'success')}
      deleteRedirect={withFlash(FEES_HREF, t('payments.fees.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        await updateCrud('payments/fees', { id, ...toPayload(values, t) })
      }}
      onDelete={async () => {
        await deleteCrud('payments/fees', id)
      }}
    />
  )
}
