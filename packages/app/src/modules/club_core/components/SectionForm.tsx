'use client'
// `/backend/club/sections/create` and `/backend/club/sections/[id]/edit` (club spec UI table): the section's own
// fields in a `CrudForm`; the edit page adds the coordinators panel (`SectionCoordinators`).
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, textOrNull, type Translate } from './client-helpers'
import { SectionCoordinators } from './SectionCoordinators'
import type { SectionRow } from './sections-shared'

const LIST_HREF = '/backend/club/sections'
const ENTITY_ID = 'club_core:section'

type SectionFormValues = {
  id?: string
  name: string
  description: string
  isActive: boolean
  updatedAt?: string | null
}

function useSectionFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('club_core.sections.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'description',
        label: t('club_core.sections.fields.description'),
        type: 'textarea',
        description: t('club_core.sections.fields.description.help'),
      },
      {
        id: 'isActive',
        label: t('club_core.sections.fields.isActive'),
        type: 'checkbox',
        description: t('club_core.sections.fields.isActive.help'),
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'details',
        title: t('club_core.sections.groups.details'),
        column: 1,
        fields: ['name', 'description', 'isActive'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function payload(values: Partial<SectionFormValues>) {
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    description: textOrNull(values.description),
    isActive: values.isActive !== false,
  }
}

export function SectionCreateForm() {
  const t = useT()
  const { fields, groups } = useSectionFields(t)
  return (
    <CrudForm<SectionFormValues>
      title={t('club_core.sections.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={{ name: '', description: '', isActive: true }}
      submitLabel={t('club_core.common.create')}
      successRedirect={withFlash(LIST_HREF, t('club_core.sections.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('club_core/sections', payload(values))
      }}
    />
  )
}

export function SectionEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = useSectionFields(t)
  const query = useQuery({
    queryKey: ['club_core-section', id],
    queryFn: async () => {
      const data = await fetchCrudList<SectionRow>('club_core/sections', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const section = query.data ?? null
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  if (query.isSuccess && !section) {
    return (
      <RecordNotFoundState
        label={t('club_core.sections.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('club_core.sections.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('club_core.sections.errors.load'))} />

  return (
    <div className="flex flex-col gap-6">
      <CrudForm<SectionFormValues>
        key={section ? (section.updatedAt ?? section.id) : 'loading'}
        title={t('club_core.sections.edit.title')}
        titleHeadingLevel={1}
        backHref={LIST_HREF}
        cancelHref={LIST_HREF}
        entityId={ENTITY_ID}
        fields={fields}
        groups={groups}
        isLoading={query.isLoading}
        loadingMessage={t('club_core.sections.loading')}
        initialValues={{
          id,
          name: section?.name ?? '',
          description: section?.description ?? '',
          isActive: section?.isActive ?? true,
          updatedAt: section?.updatedAt ?? null,
        }}
        submitLabel={t('club_core.common.save')}
        successRedirect={withFlash(LIST_HREF, t('club_core.sections.flash.saved'), 'success')}
        deleteRedirect={withFlash(LIST_HREF, t('club_core.sections.flash.deleted'), 'success')}
        onSubmit={async (values) => {
          await updateCrud('club_core/sections', { id, ...payload(values) })
        }}
        onDelete={async () => {
          await deleteCrud('club_core/sections', id)
        }}
      />
      {section ? <SectionCoordinators section={section} onChanged={refetch} /> : null}
    </div>
  )
}
