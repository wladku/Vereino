'use client'
// `/backend/facilities/closures/create` and `/backend/facilities/closures/[id]/edit` (facilities spec B-26, DD-22;
// #121): one closure of a place — from–to, the reason and a note. A save answers what it marked to be moved
// (`flagged`), shown as the message "Marked to be moved: n sessions, n rentals".
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { CLOSURE_REASONS } from '../lib/closures'
import {
  CLOSURES_API,
  CLOSURES_HREF,
  chosen,
  errorMessage,
  saveError,
  textOrNull,
  tolerantPlaceOptions,
  type ClosureRow,
  type FlaggedCounts,
  type Translate,
} from './facilities-client'

const ENTITY_ID = 'facilities:closure'

type ClosureFormValues = Record<string, unknown> & { updatedAt?: string | null }

const FIELD_OF_CODE: Record<string, string> = {
  closure_period_invalid: 'endsAt',
  facilities_reference_invalid: 'placeId',
}

function useClosureFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'placeId',
        label: t('facilities.fields.place'),
        type: 'select',
        required: true,
        loadOptions: tolerantPlaceOptions,
        description: t('facilities.closures.fields.place.help'),
      },
      {
        id: 'startsAt',
        label: t('facilities.closures.fields.startsAt'),
        type: 'datetime',
        required: true,
        layout: 'half',
      },
      { id: 'endsAt', label: t('facilities.closures.fields.endsAt'), type: 'datetime', required: true, layout: 'half' },
      {
        id: 'reason',
        label: t('facilities.closures.fields.reason'),
        type: 'select',
        required: true,
        options: CLOSURE_REASONS.map((reason) => ({ value: reason, label: t(`facilities.closures.reason.${reason}`) })),
      },
      { id: 'note', label: t('facilities.closures.fields.note'), type: 'textarea', maxLength: 2000 },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'closure',
        title: t('facilities.closures.groups.closure'),
        column: 1,
        fields: ['placeId', 'startsAt', 'endsAt', 'reason', 'note'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(row: ClosureRow | null): ClosureFormValues {
  return {
    placeId: row?.placeId ?? undefined,
    startsAt: row?.startsAt ?? undefined,
    endsAt: row?.endsAt ?? undefined,
    reason: row?.reason ?? 'maintenance',
    note: row?.note ?? '',
    updatedAt: row?.updatedAt ?? null,
  }
}

/** An instant field as ISO with offset, or null. */
function instant(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** The body of a save; an end not after the start is refused on its field before the request. */
function closureBody(values: ClosureFormValues, t: Translate) {
  const startsAt = instant(values.startsAt)
  const endsAt = instant(values.endsAt)
  if (!startsAt || !endsAt || new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    const message = t('facilities.errors.closure_period_invalid')
    throw createCrudFormError(message, { endsAt: message })
  }
  return {
    placeId: chosen(values.placeId),
    startsAt,
    endsAt,
    reason: chosen(values.reason),
    note: textOrNull(values.note),
  }
}

/** Shows what the save marked to be moved (a create or a moved closure answers `flagged`). */
function flashFlagged(t: Translate, result: unknown, fallback: string) {
  const flagged = (result as { flagged?: Partial<FlaggedCounts> } | null)?.flagged
  if (flagged && typeof flagged.sessions === 'number' && typeof flagged.rentals === 'number') {
    flash(t('facilities.closures.flash.flagged', { sessions: flagged.sessions, rentals: flagged.rentals }), 'success')
  } else {
    flash(fallback, 'success')
  }
}

export function ClosureCreateForm() {
  const t = useT()
  const { fields, groups } = useClosureFields(t)
  const initialValues = React.useMemo(() => toFormValues(null), [])
  return (
    <CrudForm<ClosureFormValues>
      title={t('facilities.closures.create.title')}
      titleHeadingLevel={1}
      backHref={CLOSURES_HREF}
      cancelHref={CLOSURES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('facilities.common.create')}
      successRedirect={CLOSURES_HREF}
      onSubmit={async (values) => {
        const body = closureBody(values, t)
        try {
          const call = await createCrud<{ id: string; flagged?: FlaggedCounts }>(CLOSURES_API, body)
          flashFlagged(t, call.result, t('facilities.closures.flash.created'))
        } catch (error: unknown) {
          throw saveError(error, t, FIELD_OF_CODE)
        }
      }}
    />
  )
}

export function ClosureEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useClosureFields(t)
  const query = useQuery({
    queryKey: ['facilities-closures-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<ClosureRow>(CLOSURES_API, { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null
  const initialValues = React.useMemo(() => ({ ...toFormValues(row), id }), [row, id])

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('facilities.closures.errors.notFound')}
        backHref={CLOSURES_HREF}
        backLabel={t('facilities.closures.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('facilities.closures.errors.loadOne'))} />

  return (
    <CrudForm<ClosureFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('facilities.closures.edit.title')}
      titleHeadingLevel={1}
      backHref={CLOSURES_HREF}
      cancelHref={CLOSURES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('facilities.common.loading')}
      initialValues={initialValues}
      submitLabel={t('facilities.common.save')}
      successRedirect={CLOSURES_HREF}
      deleteRedirect={withFlash(CLOSURES_HREF, t('facilities.closures.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        const body = closureBody(values, t)
        try {
          const call = await updateCrud<{ flagged?: FlaggedCounts }>(CLOSURES_API, { id, ...body })
          flashFlagged(t, call.result, t('facilities.closures.flash.saved'))
        } catch (error: unknown) {
          throw saveError(error, t, FIELD_OF_CODE)
        }
      }}
      onDelete={async () => {
        await deleteCrud(CLOSURES_API, id)
      }}
    />
  )
}
