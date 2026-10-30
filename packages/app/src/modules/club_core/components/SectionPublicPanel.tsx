'use client'
// The "Public page" group of the section edit page (club spec UI table, DD-29, glossary *Section*; #29): the public
// switch, the slug, the description, the conditions and the contact written for publication. Edited by the club
// administrator or the section's coordinator through `PUT /api/club_core/sections/{id}/public`; the form sends the
// section's lock token (`initialValues.updatedAt`). The contact is business contact data for publication, never read
// from the people records. A link opens the public page when the section is public.
import * as React from 'react'
import Link from 'next/link'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { textOrNull } from './client-helpers'
import type { SectionRow } from './sections-shared'

type PublicFormValues = {
  isPublic: boolean
  publicSlug: string
  publicDescription: string
  publicConditions: string
  publicContactName: string
  publicContactEmail: string
  publicContactPhone: string
  updatedAt?: string | null
}

export function SectionPublicPanel({
  section,
  clubSlug,
  onChanged,
}: {
  section: SectionRow
  clubSlug: string | null
  onChanged: () => Promise<void>
}) {
  const t = useT()
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'isPublic',
        label: t('club_core.sections.public.fields.isPublic'),
        type: 'checkbox',
        description: t('club_core.sections.public.fields.isPublic.help'),
      },
      {
        id: 'publicSlug',
        label: t('club_core.sections.public.fields.publicSlug'),
        type: 'text',
        maxLength: 60,
        description: t('club_core.sections.public.fields.publicSlug.help'),
      },
      {
        id: 'publicDescription',
        label: t('club_core.sections.public.fields.publicDescription'),
        type: 'textarea',
        description: t('club_core.sections.public.fields.publicDescription.help'),
      },
      {
        id: 'publicConditions',
        label: t('club_core.sections.public.fields.publicConditions'),
        type: 'textarea',
        description: t('club_core.sections.public.fields.publicConditions.help'),
      },
      { id: 'publicContactName', label: t('club_core.sections.public.fields.publicContactName'), type: 'text' },
      { id: 'publicContactEmail', label: t('club_core.sections.public.fields.publicContactEmail'), type: 'text' },
      { id: 'publicContactPhone', label: t('club_core.sections.public.fields.publicContactPhone'), type: 'text' },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'public',
        title: t('club_core.sections.public.groups.page'),
        column: 1,
        fields: ['isPublic', 'publicSlug', 'publicDescription', 'publicConditions'],
      },
      {
        id: 'contact',
        title: t('club_core.sections.public.groups.contact'),
        description: t('club_core.sections.public.groups.contact.help'),
        column: 2,
        fields: ['publicContactName', 'publicContactEmail', 'publicContactPhone'],
      },
    ],
    [t],
  )
  const publicHref =
    section.isPublic && section.publicSlug && clubSlug
      ? `/p/${encodeURIComponent(clubSlug)}/sections/${encodeURIComponent(section.publicSlug)}`
      : null

  return (
    <div className="flex flex-col gap-2" data-testid="section-public-panel">
      <CrudForm<PublicFormValues>
        key={section.updatedAt ?? section.id}
        title={t('club_core.sections.public.title')}
        fields={fields}
        groups={groups}
        initialValues={{
          isPublic: section.isPublic,
          publicSlug: section.publicSlug ?? '',
          publicDescription: section.publicDescription ?? '',
          publicConditions: section.publicConditions ?? '',
          publicContactName: section.publicContactName ?? '',
          publicContactEmail: section.publicContactEmail ?? '',
          publicContactPhone: section.publicContactPhone ?? '',
          updatedAt: section.updatedAt,
        }}
        submitLabel={t('club_core.sections.public.save')}
        onSubmit={async (values) => {
          await apiCallOrThrow(
            `/api/club_core/sections/${section.id}/public`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                isPublic: values.isPublic,
                publicSlug: textOrNull(values.publicSlug),
                publicDescription: textOrNull(values.publicDescription),
                publicConditions: textOrNull(values.publicConditions),
                publicContactName: textOrNull(values.publicContactName),
                publicContactEmail: textOrNull(values.publicContactEmail),
                publicContactPhone: textOrNull(values.publicContactPhone),
              }),
            },
            { errorMessage: t('club_core.sections.public.errors.save') },
          )
          flash(t('club_core.sections.public.flash.saved'), 'success')
          await onChanged()
        }}
      />
      {publicHref ? (
        <p className="text-sm">
          <Link
            className="underline underline-offset-4"
            href={publicHref}
            target="_blank"
            data-testid="section-public-link"
          >
            {t('club_core.sections.public.preview')}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
