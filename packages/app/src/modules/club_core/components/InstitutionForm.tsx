'use client'
// `/backend/club/institutions/create` and `/backend/club/institutions/[id]/edit` (club spec UI table).
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { INSTITUTION_TYPES } from '../data/validators'
import { enumOptions, errorMessage, textOrNull, type Translate } from './client-helpers'
import type { InstitutionRow } from './places-shared'

const LIST_HREF = '/backend/club/institutions'
const ENTITY_ID = 'club_core:institution'

type InstitutionFormValues = Record<string, unknown> & { updatedAt?: string | null }

const TEXT_FIELDS = ['address', 'contactName', 'contactPhone', 'contactEmail', 'bankAccount', 'notes'] as const

function useInstitutionFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('club_core.institutions.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'type',
        label: t('club_core.institutions.fields.type'),
        type: 'select',
        options: enumOptions(INSTITUTION_TYPES, 'club_core.institutions.type', t),
        required: true,
      },
      { id: 'address', label: t('club_core.institutions.fields.address'), type: 'text', maxLength: 500 },
      { id: 'contactName', label: t('club_core.institutions.fields.contactName'), type: 'text', maxLength: 200 },
      { id: 'contactPhone', label: t('club_core.institutions.fields.contactPhone'), type: 'text', maxLength: 50 },
      { id: 'contactEmail', label: t('club_core.institutions.fields.contactEmail'), type: 'text', maxLength: 320 },
      { id: 'bankAccount', label: t('club_core.institutions.fields.bankAccount'), type: 'text', maxLength: 64 },
      { id: 'notes', label: t('club_core.institutions.fields.notes'), type: 'textarea' },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'institution',
        title: t('club_core.institutions.groups.institution'),
        column: 1,
        fields: ['name', 'type', 'address', 'notes'],
      },
      {
        id: 'contact',
        title: t('club_core.institutions.groups.contact'),
        description: t('club_core.institutions.groups.contact.help'),
        column: 2,
        fields: ['contactName', 'contactPhone', 'contactEmail', 'bankAccount'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(row: InstitutionRow | null): InstitutionFormValues {
  const values: InstitutionFormValues = {
    name: row?.name ?? '',
    type: row?.type ?? 'municipality',
    updatedAt: row?.updatedAt ?? null,
  }
  for (const field of TEXT_FIELDS) values[field] = row?.[field] ?? ''
  return values
}

function toPayload(values: InstitutionFormValues) {
  const payload: Record<string, unknown> = {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    type: values.type,
  }
  for (const field of TEXT_FIELDS) payload[field] = textOrNull(values[field])
  return payload
}

export function InstitutionCreateForm() {
  const t = useT()
  const { fields, groups } = useInstitutionFields(t)
  return (
    <CrudForm<InstitutionFormValues>
      title={t('club_core.institutions.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('club_core.common.create')}
      successRedirect={withFlash(LIST_HREF, t('club_core.institutions.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('club_core/institutions', toPayload(values))
      }}
    />
  )
}

export function InstitutionEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useInstitutionFields(t)
  const query = useQuery({
    queryKey: ['club_core-institutions-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<InstitutionRow>('club_core/institutions', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const row = query.data ?? null

  if (query.isSuccess && !row) {
    return (
      <RecordNotFoundState
        label={t('club_core.institutions.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('club_core.institutions.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('club_core.institutions.errors.load'))} />

  return (
    <CrudForm<InstitutionFormValues>
      key={row ? (row.updatedAt ?? row.id) : 'loading'}
      title={t('club_core.institutions.edit.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('club_core.institutions.loading')}
      initialValues={{ ...toFormValues(row), id }}
      submitLabel={t('club_core.common.save')}
      successRedirect={withFlash(LIST_HREF, t('club_core.institutions.flash.saved'), 'success')}
      deleteRedirect={withFlash(LIST_HREF, t('club_core.institutions.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        await updateCrud('club_core/institutions', { id, ...toPayload(values) })
      }}
      onDelete={async () => {
        await deleteCrud('club_core/institutions', id)
      }}
    />
  )
}
