'use client'
// `/backend/club/sections/create` and `/backend/club/sections/[id]/edit` (club spec UI table): the section's own
// fields in a `CrudForm`; the edit page adds the coordinators panel (`SectionCoordinators`) and, since #29, the
// section's logo, its "Public page" group and its materials. A coordinator of the section opens the edit page for
// those three; the section's own fields and its coordinators stay with the club administrator.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { effectiveLogo, nameInitial, staffLogoUrl } from '../lib/files'
import { errorMessage, textOrNull, type Translate } from './client-helpers'
import { LogoPanel } from './LogoPanel'
import { SectionCoordinators } from './SectionCoordinators'
import { SectionMaterialsPanel } from './SectionMaterialsPanel'
import { SectionPublicPanel } from './SectionPublicPanel'
import type { SectionRow } from './sections-shared'
import { useCanEditSectionContent, useCanManageClub } from './useCanManageClub'

type ClubBranding = { shortName: string | null; logoAttachmentId: string | null; publicSlug: string | null }

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
  const canManage = useCanManageClub()
  const canEditContent = useCanEditSectionContent()
  const club = useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<ClubBranding>('/api/club_core/settings'),
  })
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

  const branding = club.data ?? null
  const logo = effectiveLogo({
    sectionLogoId: section?.logoAttachmentId ?? null,
    clubLogoId: branding?.logoAttachmentId ?? null,
  })

  return (
    <div className="flex flex-col gap-6">
      {canManage ? (
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
      ) : (
        <h1 className="text-2xl font-semibold" data-testid="section-edit-name">
          {section?.name ?? t('club_core.sections.edit.title')}
        </h1>
      )}
      {section && canManage ? <SectionCoordinators section={section} onChanged={refetch} /> : null}
      {section ? (
        <LogoPanel
          title={t('club_core.logo.section.title')}
          description={t('club_core.logo.section.description')}
          imageUrl={staffLogoUrl(logo.attachmentId)}
          initial={nameInitial(branding?.shortName)}
          source={logo.source}
          removable={Boolean(section.logoAttachmentId)}
          updatedAt={section.updatedAt}
          endpoint={`/api/club_core/sections/${section.id}/logo`}
          canEdit={canEditContent}
          testId="section-logo"
          onChanged={refetch}
        />
      ) : null}
      {section && canEditContent ? (
        <SectionPublicPanel section={section} clubSlug={branding?.publicSlug ?? null} onChanged={refetch} />
      ) : null}
      {section ? <SectionMaterialsPanel sectionId={section.id} canEdit={canEditContent} /> : null}
    </div>
  )
}
