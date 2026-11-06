'use client'
// The "Public page" tab of `/backend/groups/groups/[id]` (B-12; club spec UI table → "Public page" group of the group
// form, DD-29, REQ-025; #91): whether the group shows on its section's public page, and the public description,
// conditions, age range and level a guest reads there. The club decides which blocks it publishes
// (`/backend/club/publication`); this tab only fills the group's part. An age range with the youngest age above the
// oldest answers 422 `group_age_range_inverted`, shown on the "Age to" field.
import * as React from 'react'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { parseAgeInput } from '../lib/groups-rules'
import { textOrNull, type GroupDetail, type Translate } from './client-helpers'

const ENTITY_ID = 'groups:group'

type PublicFormValues = Record<string, unknown> & { updatedAt?: string | null }

function usePublicFields(t: Translate) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'isPublic',
        label: t('groups.groups.fields.isPublic'),
        type: 'checkbox',
        description: t('groups.groups.fields.isPublic.help'),
      },
      {
        id: 'publicDescription',
        label: t('groups.groups.fields.publicDescription'),
        type: 'textarea',
        maxLength: 4000,
      },
      {
        id: 'publicConditions',
        label: t('groups.groups.fields.publicConditions'),
        type: 'textarea',
        maxLength: 4000,
        description: t('groups.groups.fields.publicConditions.help'),
      },
      { id: 'ageFrom', label: t('groups.groups.fields.ageFrom'), type: 'number', layout: 'half' },
      { id: 'ageTo', label: t('groups.groups.fields.ageTo'), type: 'number', layout: 'half' },
      {
        id: 'levelLabel',
        label: t('groups.groups.fields.levelLabel'),
        type: 'text',
        maxLength: 100,
        description: t('groups.groups.fields.levelLabel.help'),
      },
    ],
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'public',
        title: t('groups.groups.groups.public'),
        description: t('groups.groups.groups.public.help'),
        column: 1,
        fields: ['isPublic', 'publicDescription', 'publicConditions', 'ageFrom', 'ageTo', 'levelLabel'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(group: GroupDetail): PublicFormValues {
  return {
    id: group.id,
    isPublic: group.isPublic ?? false,
    publicDescription: group.publicDescription ?? '',
    publicConditions: group.publicConditions ?? '',
    ageFrom: group.ageFrom ?? '',
    ageTo: group.ageTo ?? '',
    levelLabel: group.levelLabel ?? '',
    updatedAt: group.updatedAt ?? null,
  }
}

/** The request body; an age that is not a whole number of years 0–99 is refused on its field before the request. */
function toPayload(values: PublicFormValues, t: Translate) {
  const ageFrom = parseAgeInput(values.ageFrom)
  const ageTo = parseAgeInput(values.ageTo)
  const fieldErrors: Record<string, string> = {}
  if (ageFrom === 'invalid') fieldErrors.ageFrom = t('groups.groups.errors.age')
  if (ageTo === 'invalid') fieldErrors.ageTo = t('groups.groups.errors.age')
  if (ageFrom === 'invalid' || ageTo === 'invalid') {
    throw createCrudFormError(t('groups.groups.errors.invalid'), fieldErrors)
  }
  return {
    isPublic: values.isPublic === true,
    publicDescription: textOrNull(values.publicDescription),
    publicConditions: textOrNull(values.publicConditions),
    ageFrom,
    ageTo,
    levelLabel: textOrNull(values.levelLabel),
  }
}

export function GroupPublicForm({ group, onSaved }: { group: GroupDetail; onSaved: () => Promise<void> }) {
  const t = useT()
  const { fields, groups } = usePublicFields(t)
  return (
    <CrudForm<PublicFormValues>
      key={group.updatedAt ?? group.id}
      embedded
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(group)}
      submitLabel={t('groups.common.save')}
      onSubmit={async (values) => {
        await updateCrud('groups/groups', { id: group.id, ...toPayload(values, t) })
        flash(t('groups.groups.flash.saved'), 'success')
        await onSaved()
      }}
    />
  )
}
