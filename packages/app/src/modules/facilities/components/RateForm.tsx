'use client'
// `/backend/facilities/rates/create` and `/backend/facilities/rates/[id]/edit` (facilities spec B-26; REQ-013; #121):
// one rental rate — place, renter category, the price per 90 minutes (entered in PLN with two decimals, sent as
// grosz), an optional season `MM-DD`–`MM-DD`, lighting and validity. The place and the category of an existing rate
// are fixed (the update body has no such fields). An ambiguous rate answers 409 `rental_rate_overlap`.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { isMonthDay } from '@vereino/core'
import { RENTER_CATEGORIES } from '../lib/rates'
import {
  RATES_API,
  RATES_HREF,
  amountToMinor,
  chosen,
  errorMessage,
  localToday,
  minorToAmount,
  placeLabel,
  saveError,
  textOrNull,
  tolerantPlaceOptions,
  usePlaceOptions,
  type RateRow,
  type Translate,
} from './facilities-client'

const ENTITY_ID = 'facilities:rental_rate'
const MAX_MINOR = 100_000_000

type RateFormValues = Record<string, unknown> & { updatedAt?: string | null }

const FIELD_OF_CODE: Record<string, string> = {
  rental_rate_season_invalid: 'seasonFrom',
  facilities_reference_invalid: 'placeId',
  validity_inverted: 'validTo',
}

function categoryLabel(t: Translate, category: string | null | undefined): string {
  return category ? t(`facilities.rates.category.${category}`) : t('facilities.common.empty')
}

function useRateFields(t: Translate, editing: boolean) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      editing
        ? { id: 'placeLabel', label: t('facilities.fields.place'), type: 'text', readOnly: true }
        : {
            id: 'placeId',
            label: t('facilities.fields.place'),
            type: 'select',
            required: true,
            loadOptions: tolerantPlaceOptions,
          },
      editing
        ? { id: 'categoryLabel', label: t('facilities.rates.fields.category'), type: 'text', readOnly: true }
        : {
            id: 'renterCategory',
            label: t('facilities.rates.fields.category'),
            type: 'select',
            required: true,
            options: RENTER_CATEGORIES.map((category) => ({ value: category, label: categoryLabel(t, category) })),
          },
      {
        id: 'price',
        label: t('facilities.rates.fields.price'),
        type: 'text',
        required: true,
        placeholder: '0.00',
        description: t('facilities.rates.fields.price.help'),
      },
      {
        id: 'seasonFrom',
        label: t('facilities.rates.fields.seasonFrom'),
        type: 'text',
        placeholder: t('facilities.rates.fields.season.placeholder'),
        layout: 'half',
        maxLength: 5,
      },
      {
        id: 'seasonTo',
        label: t('facilities.rates.fields.seasonTo'),
        type: 'text',
        placeholder: t('facilities.rates.fields.season.placeholder'),
        layout: 'half',
        maxLength: 5,
        description: t('facilities.rates.fields.season.help'),
      },
      {
        id: 'includesLighting',
        label: t('facilities.rates.fields.includesLighting'),
        type: 'checkbox',
      },
      { id: 'validFrom', label: t('facilities.fields.validFrom'), type: 'date', required: true, layout: 'half' },
      {
        id: 'validTo',
        label: t('facilities.fields.validTo'),
        type: 'date',
        layout: 'half',
        description: t('facilities.fields.validTo.help'),
      },
    ],
    [t, editing],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'rate',
        title: t('facilities.rates.groups.rate'),
        column: 1,
        fields: [editing ? 'placeLabel' : 'placeId', editing ? 'categoryLabel' : 'renterCategory', 'price'],
      },
      {
        id: 'season',
        title: t('facilities.rates.groups.season'),
        column: 1,
        fields: ['seasonFrom', 'seasonTo', 'includesLighting'],
      },
      { id: 'validity', title: t('facilities.groups.validity'), column: 2, fields: ['validFrom', 'validTo'] },
    ],
    [t, editing],
  )
  return { fields, groups }
}

function toFormValues(t: Translate, row: RateRow | null, place: string): RateFormValues {
  return {
    placeId: row?.placeId ?? undefined,
    placeLabel: place,
    renterCategory: row?.renterCategory ?? 'municipal_club',
    categoryLabel: row ? categoryLabel(t, row.renterCategory) : '',
    price: row ? minorToAmount(row.pricePer90) : '',
    seasonFrom: row?.seasonFrom ?? '',
    seasonTo: row?.seasonTo ?? '',
    includesLighting: row?.includesLighting ?? false,
    validFrom: row?.validFrom ?? localToday(),
    validTo: row?.validTo ?? undefined,
    updatedAt: row?.updatedAt ?? null,
  }
}

/** The editable fields of a save; the price and the season are checked on their fields before the request. */
function rateBody(values: RateFormValues, t: Translate) {
  const errors: Record<string, string> = {}
  const pricePer90 = amountToMinor(values.price)
  if (pricePer90 === null || pricePer90 > MAX_MINOR) errors.price = t('facilities.rates.errors.price')
  const seasonFrom = textOrNull(values.seasonFrom)
  const seasonTo = textOrNull(values.seasonTo)
  const seasonComplete = (seasonFrom === null) === (seasonTo === null)
  const seasonWellFormed =
    (seasonFrom === null || isMonthDay(seasonFrom)) && (seasonTo === null || isMonthDay(seasonTo))
  if (!seasonComplete || !seasonWellFormed) errors.seasonFrom = t('facilities.errors.rental_rate_season_invalid')
  if (Object.keys(errors).length > 0) throw createCrudFormError(t('facilities.errors.invalid'), errors)
  return {
    pricePer90: pricePer90 as number,
    seasonFrom,
    seasonTo,
    includesLighting: values.includesLighting === true,
    validFrom: chosen(values.validFrom),
    validTo: textOrNull(values.validTo),
  }
}

export function RateCreateForm() {
  const t = useT()
  const { fields, groups } = useRateFields(t, false)
  const initialValues = React.useMemo(() => toFormValues(t, null, ''), [t])
  return (
    <CrudForm<RateFormValues>
      title={t('facilities.rates.create.title')}
      titleHeadingLevel={1}
      backHref={RATES_HREF}
      cancelHref={RATES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('facilities.common.create')}
      successRedirect={withFlash(RATES_HREF, t('facilities.rates.flash.created'), 'success')}
      onSubmit={async (values) => {
        const body = {
          placeId: chosen(values.placeId),
          renterCategory: chosen(values.renterCategory),
          ...rateBody(values, t),
        }
        try {
          await createCrud(RATES_API, body)
        } catch (error: unknown) {
          throw saveError(error, t, FIELD_OF_CODE)
        }
      }}
    />
  )
}

export function RateEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useRateFields(t, true)
  const places = usePlaceOptions()
  const query = useQuery({
    queryKey: ['facilities-rates-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<RateRow>(RATES_API, { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null
  const place = row ? placeLabel(t, places.names, row.placeId) : ''
  const initialValues = React.useMemo(() => ({ ...toFormValues(t, row, place), id }), [t, row, place, id])

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('facilities.rates.errors.notFound')}
        backHref={RATES_HREF}
        backLabel={t('facilities.rates.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('facilities.rates.errors.loadOne'))} />

  return (
    <CrudForm<RateFormValues>
      key={row ? `${row.updatedAt ?? row.id}-${place}` : 'loading'}
      title={t('facilities.rates.edit.title')}
      titleHeadingLevel={1}
      backHref={RATES_HREF}
      cancelHref={RATES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('facilities.common.loading')}
      initialValues={initialValues}
      submitLabel={t('facilities.common.save')}
      successRedirect={withFlash(RATES_HREF, t('facilities.rates.flash.saved'), 'success')}
      deleteRedirect={withFlash(RATES_HREF, t('facilities.rates.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        try {
          await updateCrud(RATES_API, { id, ...rateBody(values, t) })
        } catch (error: unknown) {
          throw saveError(error, t, FIELD_OF_CODE)
        }
      }}
      onDelete={async () => {
        await deleteCrud(RATES_API, id)
      }}
    />
  )
}
