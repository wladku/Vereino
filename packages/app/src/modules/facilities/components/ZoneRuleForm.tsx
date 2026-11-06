'use client'
// `/backend/facilities/zones/create` and `/backend/facilities/zones/[id]/edit` (facilities spec B-26; #121): one
// weekly zone rule — place, weekdays, wall times, zone, priority 1–9 and validity. The place and the source of an
// existing rule are fixed (the update body has no such fields). An overlapping rule with the same priority answers
// 409 `zone_rule_overlap`, shown as the form error.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MAX_ZONE_PRIORITY, ZONES } from '../lib/zones'
import { WeekdaysField, weekdayList } from './FacilitiesControls'
import {
  ZONES_HREF,
  ZONE_RULES_API,
  chosen,
  errorMessage,
  localToday,
  placeLabel,
  saveError,
  textOrNull,
  tolerantPlaceOptions,
  usePlaceOptions,
  zoneLabel,
  type Translate,
  type ZoneRuleRow,
} from './facilities-client'

const ENTITY_ID = 'facilities:zone_rule'

type ZoneFormValues = Record<string, unknown> & { updatedAt?: string | null }

const FIELD_OF_CODE: Record<string, string> = {
  zone_rule_times_invalid: 'timeTo',
  facilities_reference_invalid: 'placeId',
  validity_inverted: 'validTo',
}

function useZoneFields(t: Translate, editing: boolean) {
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
      {
        id: 'weekdays',
        label: t('facilities.zones.fields.weekdays'),
        type: 'custom',
        required: true,
        component: WeekdaysField,
      },
      { id: 'timeFrom', label: t('facilities.fields.from'), type: 'time', required: true, layout: 'half' },
      { id: 'timeTo', label: t('facilities.fields.to'), type: 'time', required: true, layout: 'half' },
      {
        id: 'zone',
        label: t('facilities.zones.fields.zone'),
        type: 'select',
        required: true,
        options: ZONES.map((zone) => ({ value: zone, label: zoneLabel(t, zone) })),
      },
      {
        id: 'priority',
        label: t('facilities.zones.fields.priority'),
        type: 'number',
        required: true,
        description: t('facilities.zones.fields.priority.help'),
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
        id: 'rule',
        title: t('facilities.zones.groups.rule'),
        column: 1,
        fields: [editing ? 'placeLabel' : 'placeId', 'weekdays', 'timeFrom', 'timeTo', 'zone', 'priority'],
      },
      { id: 'validity', title: t('facilities.groups.validity'), column: 2, fields: ['validFrom', 'validTo'] },
    ],
    [t, editing],
  )
  return { fields, groups }
}

function toFormValues(row: ZoneRuleRow | null, place: string): ZoneFormValues {
  return {
    placeId: row?.placeId ?? undefined,
    placeLabel: place,
    weekdays: row?.weekdays ?? [1, 2, 3, 4, 5],
    timeFrom: row?.timeFrom ?? '08:00',
    timeTo: row?.timeTo ?? '16:00',
    zone: row?.zone ?? 'club_training',
    priority: row?.priority ?? 1,
    validFrom: row?.validFrom ?? localToday(),
    validTo: row?.validTo ?? undefined,
    updatedAt: row?.updatedAt ?? null,
  }
}

/** The rule fields every save sends; weekdays and the priority are checked before the request. */
function ruleBody(values: ZoneFormValues, t: Translate) {
  const weekdays = weekdayList(values.weekdays)
  const priority = Number(values.priority)
  const errors: Record<string, string> = {}
  if (weekdays.length === 0) errors.weekdays = t('facilities.zones.errors.weekdays')
  if (!Number.isInteger(priority) || priority < 1 || priority > MAX_ZONE_PRIORITY) {
    errors.priority = t('facilities.zones.errors.priority', { max: MAX_ZONE_PRIORITY })
  }
  if (Object.keys(errors).length > 0) throw createCrudFormError(t('facilities.errors.invalid'), errors)
  return {
    weekdays,
    timeFrom: chosen(values.timeFrom),
    timeTo: chosen(values.timeTo),
    zone: chosen(values.zone),
    priority,
    validFrom: chosen(values.validFrom),
    validTo: textOrNull(values.validTo),
  }
}

export function ZoneRuleCreateForm() {
  const t = useT()
  const { fields, groups } = useZoneFields(t, false)
  const initialValues = React.useMemo(() => toFormValues(null, ''), [])
  return (
    <CrudForm<ZoneFormValues>
      title={t('facilities.zones.create.title')}
      titleHeadingLevel={1}
      backHref={ZONES_HREF}
      cancelHref={ZONES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('facilities.common.create')}
      successRedirect={withFlash(ZONES_HREF, t('facilities.zones.flash.created'), 'success')}
      onSubmit={async (values) => {
        const body = { placeId: chosen(values.placeId), ...ruleBody(values, t) }
        try {
          await createCrud(ZONE_RULES_API, body)
        } catch (error: unknown) {
          throw saveError(error, t, FIELD_OF_CODE)
        }
      }}
    />
  )
}

export function ZoneRuleEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useZoneFields(t, true)
  const places = usePlaceOptions()
  const query = useQuery({
    queryKey: ['facilities-zone-rules-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<ZoneRuleRow>(ZONE_RULES_API, { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null
  const place = row ? placeLabel(t, places.names, row.placeId) : ''
  const initialValues = React.useMemo(() => ({ ...toFormValues(row, place), id }), [row, place, id])

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('facilities.zones.errors.notFound')}
        backHref={ZONES_HREF}
        backLabel={t('facilities.zones.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('facilities.zones.errors.loadOne'))} />

  return (
    <CrudForm<ZoneFormValues>
      key={row ? `${row.updatedAt ?? row.id}-${place}` : 'loading'}
      title={t('facilities.zones.edit.title')}
      titleHeadingLevel={1}
      backHref={ZONES_HREF}
      cancelHref={ZONES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('facilities.common.loading')}
      initialValues={initialValues}
      submitLabel={t('facilities.common.save')}
      successRedirect={withFlash(ZONES_HREF, t('facilities.zones.flash.saved'), 'success')}
      deleteRedirect={withFlash(ZONES_HREF, t('facilities.zones.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        try {
          await updateCrud(ZONE_RULES_API, { id, ...ruleBody(values, t) })
        } catch (error: unknown) {
          throw saveError(error, t, FIELD_OF_CODE)
        }
      }}
      onDelete={async () => {
        await deleteCrud(ZONE_RULES_API, id)
      }}
    />
  )
}
