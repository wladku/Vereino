'use client'
// `/backend/payments/discounts/create` and `/backend/payments/discounts/[id]/edit` (UX concept README B-20; payments
// spec REQ-011, R12, Q-006; issue #108): a discount rule's name and kind (fixed after creation), its value — a percent
// 1–100 (a sibling rule always), or for a custom rule an amount in PLN instead —, the fee periods it covers (default:
// monthly only), who pays the full rate (sibling: the oldest by default) or the persons it is for (custom), and the
// validity.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DISCOUNT_KINDS, FEE_PERIODS, FULL_RATE_CHILDREN } from '../lib/payments-rules'
import {
  DISCOUNTS_HREF,
  errorMessage,
  fromGrosz,
  localToday,
  personOptions,
  toGrosz,
  tolerant,
  type DiscountRuleRow,
  type Translate,
} from './client-helpers'

const ENTITY_ID = 'payments:discount_rule'

type RuleFormValues = Record<string, unknown> & { updatedAt?: string | null }

function useRuleFields(t: Translate, editing: boolean) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('payments.discounts.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'kind',
        label: t('payments.discounts.fields.kind'),
        type: 'select',
        required: true,
        disabled: editing,
        options: DISCOUNT_KINDS.map((kind) => ({ value: kind, label: t(`payments.discounts.kind.${kind}`) })),
        layout: 'half',
      },
      {
        id: 'percent',
        label: t('payments.discounts.fields.percent'),
        type: 'number',
        description: t('payments.discounts.fields.percent.help'),
        layout: 'half',
      },
      {
        id: 'amount',
        label: t('payments.discounts.fields.amount'),
        type: 'text',
        description: t('payments.discounts.fields.amount.help'),
        visibleWhen: { field: 'kind', equals: 'custom' },
        layout: 'half',
      },
      {
        id: 'fullRate',
        label: t('payments.discounts.fields.fullRate'),
        type: 'select',
        options: FULL_RATE_CHILDREN.map((child) => ({
          value: child,
          label: t(`payments.discounts.fullRate.${child}`),
        })),
        visibleWhen: { field: 'kind', equals: 'sibling' },
        layout: 'half',
      },
      {
        id: 'feePeriods',
        label: t('payments.discounts.fields.feePeriods'),
        type: 'select',
        multiple: true,
        options: FEE_PERIODS.map((period) => ({ value: period, label: t(`payments.fees.period.${period}`) })),
        description: t('payments.discounts.fields.feePeriods.help'),
      },
      {
        id: 'personIds',
        label: t('payments.discounts.fields.persons'),
        type: 'select',
        multiple: true,
        loadOptions: tolerant(personOptions),
        visibleWhen: { field: 'kind', equals: 'custom' },
        description: t('payments.discounts.fields.persons.help'),
      },
      {
        id: 'validFrom',
        label: t('payments.discounts.fields.validFrom'),
        type: 'date',
        required: true,
        layout: 'half',
      },
      { id: 'validTo', label: t('payments.discounts.fields.validTo'), type: 'date', layout: 'half' },
    ],
    [t, editing],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'rule',
        title: t('payments.discounts.groups.rule'),
        column: 1,
        fields: ['name', 'kind', 'percent', 'amount', 'fullRate', 'feePeriods', 'personIds', 'validFrom', 'validTo'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(row: DiscountRuleRow | null): RuleFormValues {
  return {
    name: row?.name ?? '',
    kind: row?.kind ?? 'sibling',
    percent: row?.percent ?? (row ? '' : 30),
    amount: fromGrosz(row?.amount),
    fullRate: row?.conditions.fullRate ?? 'oldest',
    feePeriods: row?.conditions.feePeriods ?? ['monthly'],
    personIds: row?.conditions.personIds ?? [],
    validFrom: row?.validFrom ?? localToday(),
    validTo: row?.validTo ?? '',
    updatedAt: row?.updatedAt ?? null,
  }
}

const list = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

/** The request body: a percent or (custom only) an amount in grosz, and the conditions of the kind. */
function toPayload(values: RuleFormValues, t: Translate, includeKind: boolean) {
  const kind = values.kind === 'custom' ? 'custom' : 'sibling'
  const percentText =
    typeof values.percent === 'number' || typeof values.percent === 'string' ? String(values.percent).trim() : ''
  const amountText = kind === 'custom' && typeof values.amount === 'string' ? values.amount.trim() : ''
  const amount = amountText ? toGrosz(amountText) : null
  if (amountText && amount === null) throw new Error(t('payments.discounts.errors.amount'))
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    ...(includeKind ? { kind } : {}),
    // A custom rule with an amount is an amount rule; the percent field is ignored then.
    percent: amount === null && percentText ? Number(percentText) : null,
    amount,
    conditions:
      kind === 'sibling'
        ? { feePeriods: list(values.feePeriods), fullRate: values.fullRate === 'youngest' ? 'youngest' : 'oldest' }
        : { feePeriods: list(values.feePeriods), personIds: list(values.personIds) },
    validFrom: values.validFrom,
    validTo: typeof values.validTo === 'string' && values.validTo ? values.validTo : null,
  }
}

export function DiscountRuleCreateForm() {
  const t = useT()
  const { fields, groups } = useRuleFields(t, false)
  return (
    <CrudForm<RuleFormValues>
      title={t('payments.discounts.create.title')}
      titleHeadingLevel={1}
      backHref={DISCOUNTS_HREF}
      cancelHref={DISCOUNTS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('payments.common.create')}
      successRedirect={withFlash(DISCOUNTS_HREF, t('payments.discounts.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('payments/discount-rules', toPayload(values, t, true))
      }}
    />
  )
}

export function DiscountRuleEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useRuleFields(t, true)
  const query = useQuery({
    queryKey: ['payments-discounts-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<DiscountRuleRow>('payments/discount-rules', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('payments.discounts.errors.notFound')}
        backHref={DISCOUNTS_HREF}
        backLabel={t('payments.discounts.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('payments.discounts.errors.load'))} />

  return (
    <CrudForm<RuleFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('payments.discounts.edit.title')}
      titleHeadingLevel={1}
      backHref={DISCOUNTS_HREF}
      cancelHref={DISCOUNTS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('payments.discounts.loading')}
      initialValues={{ ...toFormValues(row), id }}
      submitLabel={t('payments.common.save')}
      successRedirect={withFlash(DISCOUNTS_HREF, t('payments.discounts.flash.saved'), 'success')}
      deleteRedirect={withFlash(DISCOUNTS_HREF, t('payments.discounts.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        await updateCrud('payments/discount-rules', { id, ...toPayload(values, t, false) })
      }}
      onDelete={async () => {
        await deleteCrud('payments/discount-rules', id)
      }}
    />
  )
}
