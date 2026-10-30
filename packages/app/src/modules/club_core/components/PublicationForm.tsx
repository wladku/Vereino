'use client'
// `/backend/club/publication` (club spec UI table, glossary *Publication*, REQ-025; #29): the club page switch, the
// club's public slug, description and phone, and one switch per block with a description of its effect — everything
// off by default. Saved through `PUT /api/club_core/settings` (`publication` needs `club_core.publication.manage`)
// with the settings lock token. Blocks of modules that do not exist yet are stored and take effect when the module
// arrives (prices, instructors, places calendar, online requests).
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PUBLICATION_BLOCKS, type Publication } from '../lib/publication'
import { errorMessage, textOrNull } from './client-helpers'

const SETTINGS_API = '/api/club_core/settings'

type SettingsResponse = {
  publicSlug: string | null
  publicDescription: string | null
  contactPhone: string | null
  publication: Publication
  updatedAt: string | null
}

type FormValues = Record<string, unknown> & { updatedAt: string | null }

const blockField = (block: string) => `block_${block}`

export function PublicationForm() {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: settings, error } = useQuery({
    queryKey: ['club_core-settings'],
    queryFn: () => readApiResultOrThrow<SettingsResponse>(SETTINGS_API),
  })

  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'enabled',
        label: t('club_core.publication.fields.enabled'),
        type: 'checkbox',
        description: t('club_core.publication.fields.enabled.help'),
      },
      {
        id: 'publicSlug',
        label: t('club_core.publication.fields.publicSlug'),
        type: 'text',
        maxLength: 60,
        description: t('club_core.publication.fields.publicSlug.help'),
      },
      {
        id: 'publicDescription',
        label: t('club_core.publication.fields.publicDescription'),
        type: 'textarea',
      },
      {
        id: 'contactPhone',
        label: t('club_core.publication.fields.contactPhone'),
        type: 'text',
        description: t('club_core.publication.fields.contactPhone.help'),
      },
      ...PUBLICATION_BLOCKS.map<CrudField>((block) => ({
        id: blockField(block),
        label: t(`club_core.publication.blocks.${block}`),
        type: 'checkbox',
        description: t(`club_core.publication.blocks.${block}.help`),
      })),
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'page',
        title: t('club_core.publication.groups.page'),
        column: 1,
        fields: ['enabled', 'publicSlug', 'publicDescription', 'contactPhone'],
      },
      {
        id: 'blocks',
        title: t('club_core.publication.groups.blocks'),
        description: t('club_core.publication.groups.blocks.help'),
        column: 2,
        fields: PUBLICATION_BLOCKS.map(blockField),
      },
    ],
    [t],
  )

  if (error) return <ErrorMessage label={errorMessage(error, t('club_core.publication.errors.load'))} />
  if (!settings) return <LoadingMessage label={t('club_core.publication.loading')} />

  const initialValues: FormValues = {
    enabled: settings.publication.enabled,
    publicSlug: settings.publicSlug ?? '',
    publicDescription: settings.publicDescription ?? '',
    contactPhone: settings.contactPhone ?? '',
    updatedAt: settings.updatedAt,
  }
  for (const block of PUBLICATION_BLOCKS) initialValues[blockField(block)] = settings.publication.blocks[block]
  const publicHref =
    settings.publication.enabled && settings.publicSlug ? `/p/${encodeURIComponent(settings.publicSlug)}` : null

  return (
    <div className="flex flex-col gap-3">
      <CrudForm<FormValues>
        key={settings.updatedAt ?? 'defaults'}
        title={t('club_core.publication.title')}
        titleHeadingLevel={1}
        fields={fields}
        groups={groups}
        initialValues={initialValues}
        submitLabel={t('club_core.publication.save')}
        onSubmit={async (values) => {
          const blocks = Object.fromEntries(
            PUBLICATION_BLOCKS.map((block) => [block, values[blockField(block)] === true]),
          )
          await apiCallOrThrow(
            SETTINGS_API,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                publicSlug: textOrNull(values.publicSlug),
                publicDescription: textOrNull(values.publicDescription),
                contactPhone: textOrNull(values.contactPhone),
                publication: { enabled: values.enabled === true, blocks },
              }),
            },
            { errorMessage: t('club_core.publication.errors.save') },
          )
          flash(t('club_core.publication.flash.saved'), 'success')
          await queryClient.invalidateQueries({ queryKey: ['club_core-settings'] })
        }}
      />
      {publicHref ? (
        <p className="text-sm">
          <Link
            className="underline underline-offset-4"
            href={publicHref}
            target="_blank"
            data-testid="publication-public-link"
          >
            {t('club_core.publication.preview')}
          </Link>
        </p>
      ) : null}
    </div>
  )
}
