'use client'
// `/backend/groups/seasons/create` and `/backend/groups/seasons/[id]/edit` (club spec UI table, REQ-019): a season's
// name and its first and last day.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { SEASONS_HREF, errorMessage, type SeasonRow, type Translate } from './client-helpers'

const ENTITY_ID = 'groups:season'

type SeasonFormValues = Record<string, unknown> & { updatedAt?: string | null }

function useSeasonFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('groups.seasons.fields.name'), type: 'text', required: true, maxLength: 200 },
      { id: 'startsOn', label: t('groups.seasons.fields.startsOn'), type: 'date', required: true, layout: 'half' },
      {
        id: 'endsOn',
        label: t('groups.seasons.fields.endsOn'),
        type: 'date',
        required: true,
        layout: 'half',
        description: t('groups.seasons.fields.endsOn.help'),
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      { id: 'season', title: t('groups.seasons.groups.season'), column: 1, fields: ['name', 'startsOn', 'endsOn'] },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(row: SeasonRow | null): SeasonFormValues {
  return {
    name: row?.name ?? '',
    startsOn: row?.startsOn ?? '',
    endsOn: row?.endsOn ?? '',
    updatedAt: row?.updatedAt ?? null,
  }
}

function toPayload(values: SeasonFormValues) {
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    startsOn: values.startsOn,
    endsOn: values.endsOn,
  }
}

export function SeasonCreateForm() {
  const t = useT()
  const { fields, groups } = useSeasonFields(t)
  return (
    <CrudForm<SeasonFormValues>
      title={t('groups.seasons.create.title')}
      titleHeadingLevel={1}
      backHref={SEASONS_HREF}
      cancelHref={SEASONS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('groups.common.create')}
      successRedirect={withFlash(SEASONS_HREF, t('groups.seasons.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('groups/seasons', toPayload(values))
      }}
    />
  )
}

export function SeasonEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useSeasonFields(t)
  const query = useQuery({
    queryKey: ['groups-seasons-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<SeasonRow>('groups/seasons', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('groups.seasons.errors.notFound')}
        backHref={SEASONS_HREF}
        backLabel={t('groups.seasons.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('groups.seasons.errors.load'))} />

  return (
    <CrudForm<SeasonFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('groups.seasons.edit.title')}
      titleHeadingLevel={1}
      backHref={SEASONS_HREF}
      cancelHref={SEASONS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('groups.seasons.loading')}
      initialValues={{ ...toFormValues(row), id }}
      submitLabel={t('groups.common.save')}
      successRedirect={withFlash(SEASONS_HREF, t('groups.seasons.flash.saved'), 'success')}
      deleteRedirect={withFlash(SEASONS_HREF, t('groups.seasons.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        await updateCrud('groups/seasons', { id, ...toPayload(values) })
      }}
      onDelete={async () => {
        await deleteCrud('groups/seasons', id)
      }}
    />
  )
}
