'use client'
// `/backend/groups/external-teams/create` and `/backend/groups/external-teams/[id]/edit` (club spec UI table,
// REQ-020): an opponent or tournament guest — its name, its club, an optional institution, a contact (stored
// encrypted) and notes.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFieldOption, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EXTERNAL_TEAMS_HREF, errorMessage, textOrNull, type ExternalTeamRow, type Translate } from './client-helpers'

const ENTITY_ID = 'groups:external_team'
const NONE = ''

type ExternalTeamFormValues = Record<string, unknown> & { updatedAt?: string | null }

type InstitutionOption = { id: string; name: string | null }

/** The club's institutions (the club administrator reads them; a coordinator gets only "none"). */
async function institutionOptions(t: Translate): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<InstitutionOption>('club_core/institutions', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
  }).catch(() => ({ items: [] as InstitutionOption[] }))
  return [
    { value: NONE, label: t('groups.externalTeams.fields.institution.none') },
    ...data.items.map((item) => ({ value: item.id, label: item.name ?? item.id })),
  ]
}

function useExternalTeamFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('groups.externalTeams.fields.name'), type: 'text', required: true, maxLength: 200 },
      { id: 'clubName', label: t('groups.externalTeams.fields.clubName'), type: 'text', maxLength: 200 },
      {
        id: 'institutionId',
        label: t('groups.externalTeams.fields.institution'),
        type: 'select',
        loadOptions: () => institutionOptions(t),
      },
      {
        id: 'contact',
        label: t('groups.externalTeams.fields.contact'),
        type: 'text',
        maxLength: 1000,
        description: t('groups.externalTeams.fields.contact.help'),
      },
      { id: 'notes', label: t('groups.externalTeams.fields.notes'), type: 'textarea', maxLength: 4000 },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'team',
        title: t('groups.externalTeams.groups.team'),
        column: 1,
        fields: ['name', 'clubName', 'institutionId', 'contact', 'notes'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(row: ExternalTeamRow | null): ExternalTeamFormValues {
  return {
    name: row?.name ?? '',
    clubName: row?.clubName ?? '',
    institutionId: row?.institutionId ?? NONE,
    contact: row?.contact ?? '',
    notes: row?.notes ?? '',
    updatedAt: row?.updatedAt ?? null,
  }
}

function toPayload(values: ExternalTeamFormValues) {
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    clubName: textOrNull(values.clubName),
    institutionId: textOrNull(values.institutionId),
    contact: textOrNull(values.contact),
    notes: textOrNull(values.notes),
  }
}

export function ExternalTeamCreateForm() {
  const t = useT()
  const { fields, groups } = useExternalTeamFields(t)
  return (
    <CrudForm<ExternalTeamFormValues>
      title={t('groups.externalTeams.create.title')}
      titleHeadingLevel={1}
      backHref={EXTERNAL_TEAMS_HREF}
      cancelHref={EXTERNAL_TEAMS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('groups.common.create')}
      successRedirect={withFlash(EXTERNAL_TEAMS_HREF, t('groups.externalTeams.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('groups/external-teams', toPayload(values))
      }}
    />
  )
}

export function ExternalTeamEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useExternalTeamFields(t)
  const query = useQuery({
    queryKey: ['groups-external-teams-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<ExternalTeamRow>('groups/external-teams', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('groups.externalTeams.errors.notFound')}
        backHref={EXTERNAL_TEAMS_HREF}
        backLabel={t('groups.externalTeams.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('groups.externalTeams.errors.load'))} />

  return (
    <CrudForm<ExternalTeamFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('groups.externalTeams.edit.title')}
      titleHeadingLevel={1}
      backHref={EXTERNAL_TEAMS_HREF}
      cancelHref={EXTERNAL_TEAMS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('groups.externalTeams.loading')}
      initialValues={{ ...toFormValues(row), id }}
      submitLabel={t('groups.common.save')}
      successRedirect={withFlash(EXTERNAL_TEAMS_HREF, t('groups.externalTeams.flash.saved'), 'success')}
      deleteRedirect={withFlash(EXTERNAL_TEAMS_HREF, t('groups.externalTeams.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        await updateCrud('groups/external-teams', { id, ...toPayload(values) })
      }}
      onDelete={async () => {
        await deleteCrud('groups/external-teams', id)
      }}
    />
  )
}
