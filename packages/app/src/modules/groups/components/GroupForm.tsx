'use client'
// `/backend/groups/groups/create` and the "Details" tab of `/backend/groups/groups/[id]` (club spec UI table, DD-03a):
// a group of one section, `team` or `class group`. The team fields (age category, league, season) show only for a
// team, and the form clears them when the kind is a class group; the server refuses team fields on a class group with 422 anyway.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { GROUP_KINDS } from '../lib/groups-rules'
import { pickerSelectField } from '@vereino/ui'
import { GROUPS_HREF, textOrNull, type GroupDetail, type Translate } from './client-helpers'
import { ageCategoryPicker, seasonPicker, sectionPicker, useGroupsPickerFeatures } from './pickers'

const ENTITY_ID = 'groups:group'
const NONE = ''

type GroupFormValues = Record<string, unknown> & { updatedAt?: string | null }

function useGroupFields(t: Translate) {
  // An empty picker says what is missing and offers a way on (people life-cycle spec REQ-L14, picker row 5).
  const features = useGroupsPickerFeatures()
  const canCreateSection = features['club_core.manage']
  const canCreateCategory = features['dictionaries.manage']
  const canCreateSeason = features['groups.manage']
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('groups.groups.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'kind',
        label: t('groups.groups.fields.kind'),
        type: 'select',
        options: GROUP_KINDS.map((kind) => ({ value: kind, label: t(`groups.groups.kind.${kind}`) })),
        description: t('groups.groups.fields.kind.help'),
        required: true,
      },
      pickerSelectField('sectionId', t('groups.groups.fields.section'), sectionPicker(t, canCreateSection)),
      { id: 'isActive', label: t('groups.groups.fields.isActive'), type: 'checkbox' },
      { id: 'description', label: t('groups.groups.fields.description'), type: 'textarea', maxLength: 4000 },
      pickerSelectField('ageCategoryEntryId', t('groups.groups.fields.ageCategory'), {
        ...ageCategoryPicker(t, canCreateCategory),
        description: t('groups.groups.fields.ageCategory.help'),
        visibleWhen: { field: 'kind', equals: 'team' },
      }),
      {
        id: 'league',
        label: t('groups.groups.fields.league'),
        type: 'text',
        maxLength: 200,
        visibleWhen: { field: 'kind', equals: 'team' },
      },
      pickerSelectField('seasonId', t('groups.groups.fields.season'), {
        ...seasonPicker(t, canCreateSeason),
        visibleWhen: { field: 'kind', equals: 'team' },
      }),
    ],
    [t, canCreateSection, canCreateCategory, canCreateSeason],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'group',
        title: t('groups.groups.groups.group'),
        column: 1,
        fields: ['name', 'kind', 'sectionId', 'isActive', 'description'],
      },
      {
        id: 'team',
        title: t('groups.groups.groups.team'),
        description: t('groups.groups.groups.team.help'),
        column: 2,
        fields: ['ageCategoryEntryId', 'league', 'seasonId'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(group: GroupDetail | null): GroupFormValues {
  return {
    name: group?.name ?? '',
    kind: group?.kind ?? 'team',
    sectionId: group?.sectionId ?? '',
    isActive: group?.isActive ?? true,
    description: group?.description ?? '',
    ageCategoryEntryId: group?.ageCategoryEntryId ?? NONE,
    league: group?.league ?? '',
    seasonId: group?.seasonId ?? NONE,
    updatedAt: group?.updatedAt ?? null,
  }
}

/** The request body; a class group sends its team fields as null, so switching the kind clears them. */
function toPayload(values: GroupFormValues) {
  const isTeam = values.kind === 'team'
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    kind: values.kind,
    sectionId: values.sectionId,
    isActive: values.isActive === true,
    description: textOrNull(values.description),
    ageCategoryEntryId: isTeam ? textOrNull(values.ageCategoryEntryId) : null,
    league: isTeam ? textOrNull(values.league) : null,
    seasonId: isTeam ? textOrNull(values.seasonId) : null,
  }
}

export function GroupCreateForm() {
  const t = useT()
  const router = useRouter()
  const { fields, groups } = useGroupFields(t)
  return (
    <CrudForm<GroupFormValues>
      title={t('groups.groups.create.title')}
      titleHeadingLevel={1}
      backHref={GROUPS_HREF}
      cancelHref={GROUPS_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('groups.common.create')}
      onSubmit={async (values) => {
        const created = await createCrud<{ id?: string }>('groups/groups', toPayload(values))
        flash(t('groups.groups.flash.created'), 'success')
        router.push(created.result?.id ? `${GROUPS_HREF}/${created.result.id}` : GROUPS_HREF)
      }}
    />
  )
}

export function GroupDetailsForm({ group, onSaved }: { group: GroupDetail; onSaved: () => Promise<void> }) {
  const t = useT()
  const { fields, groups } = useGroupFields(t)
  return (
    <CrudForm<GroupFormValues>
      key={group.updatedAt ?? group.id}
      embedded
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={{ ...toFormValues(group), id: group.id }}
      submitLabel={t('groups.common.save')}
      onSubmit={async (values) => {
        await updateCrud('groups/groups', { id: group.id, ...toPayload(values) })
        flash(t('groups.groups.flash.saved'), 'success')
        await onSaved()
      }}
    />
  )
}
