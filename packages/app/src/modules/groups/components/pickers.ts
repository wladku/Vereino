'use client'
// The empty-picker wiring of the `groups` forms (people life-cycle spec REQ-L14, picker rows 5 and 6): the group's
// section links to the section create page (`club_core.manage`), its age category is entered in place into the club's
// age category dictionary (`dictionaries.manage`), its season is created in place (`groups.manage`); the external
// team picks an institution from the names-only option source every coordinator reads, and only the club
// administrator adds one. Without the creating feature the hint names the club administrator.
import { apiCall, apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { useGrantedFeatures, type PickerFieldOptions, type PickerOption } from '@vereino/ui'
import { AGE_CATEGORY_DICTIONARY_KEY } from '../lib/groups-rules'
import { ageCategoryOptions, errorMessage, seasonOptions, sectionOptions, type Translate } from './client-helpers'

export const GROUPS_PICKER_FEATURES = ['club_core.manage', 'dictionaries.manage', 'groups.manage'] as const

const SECTION_CREATE_HREF = '/backend/club/sections/create'
const INSTITUTION_CREATE_HREF = '/backend/club/institutions/create'

type PickerConfig = Omit<PickerFieldOptions, 'description' | 'layout' | 'visibleWhen'>

/** Which create paths the session may take (wildcard-aware); the server refuses anyway. */
export function useGroupsPickerFeatures() {
  return useGrantedFeatures(GROUPS_PICKER_FEATURES, apiCall)
}

function commonLabels(t: Translate) {
  return {
    loading: t('groups.picker.loading'),
    loadError: t('groups.picker.loadError'),
    retry: t('groups.picker.retry'),
  }
}

function dialogLabels(t: Translate) {
  return {
    submit: t('groups.picker.dialog.submit'),
    saving: t('groups.picker.dialog.saving'),
    cancel: t('groups.picker.dialog.cancel'),
    close: t('groups.picker.dialog.close'),
    required: t('groups.picker.dialog.required'),
  }
}

/** The group's section: a link to the club's section create page. */
export function sectionPicker(t: Translate, canCreate: boolean): PickerConfig {
  return {
    loadOptions: sectionOptions,
    labels: {
      ...commonLabels(t),
      hint: {
        none: t('groups.picker.section.none'),
        noMatch: t('groups.picker.section.noMatch'),
        add: t('groups.picker.section.add'),
        askAdmin: t('groups.picker.askAdmin'),
      },
    },
    canCreate,
    create: { kind: 'link', href: SECTION_CREATE_HREF },
    required: true,
  }
}

/** Adds an entry to the club's age category dictionary through the platform `dictionaries` routes. */
async function createAgeCategory(label: string, failure: string): Promise<PickerOption> {
  const dictionaries = await readApiResultOrThrow<{ items?: Array<{ id: string; key: string }> }>('/api/dictionaries')
  const dictionary = (dictionaries.items ?? []).find((item) => item.key === AGE_CATEGORY_DICTIONARY_KEY)
  if (!dictionary) throw new Error(failure)
  const call = await apiCallOrThrow<{ id?: string; label?: string }>(
    `/api/dictionaries/${encodeURIComponent(dictionary.id)}/entries`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value: label, label }),
    },
  )
  const id = call.result?.id
  if (!id) throw new Error(failure)
  return { value: id, label: call.result?.label ?? label }
}

/** The team's age category: one label, entered in place into the club's dictionary. */
export function ageCategoryPicker(t: Translate, canCreate: boolean): PickerConfig {
  return {
    loadOptions: ageCategoryOptions,
    labels: {
      ...commonLabels(t),
      emptyOption: t('groups.groups.fields.ageCategory.none'),
      hint: {
        none: t('groups.picker.ageCategory.none'),
        noMatch: t('groups.picker.ageCategory.noMatch'),
        add: t('groups.picker.ageCategory.add'),
        askAdmin: t('groups.picker.askAdmin'),
      },
    },
    canCreate,
    create: { kind: 'inline' },
    inlineCreate: {
      title: t('groups.picker.ageCategory.createTitle'),
      description: t('groups.picker.ageCategory.createHelp'),
      fields: [
        { id: 'label', label: t('groups.picker.ageCategory.label'), type: 'text', required: true, maxLength: 150 },
      ],
      initialValues: (term) => ({ label: term ?? '' }),
      labels: dialogLabels(t),
      onCreate: (values) => createAgeCategory(values.label, t('groups.picker.ageCategory.createFailed')),
      describeError: (error) => ({ message: errorMessage(error, t('groups.picker.ageCategory.createFailed')) }),
    },
  }
}

/** The team's season: name and dates, created in place. */
export function seasonPicker(t: Translate, canCreate: boolean): PickerConfig {
  return {
    loadOptions: seasonOptions,
    labels: {
      ...commonLabels(t),
      emptyOption: t('groups.groups.fields.season.none'),
      hint: {
        none: t('groups.picker.season.none'),
        noMatch: t('groups.picker.season.noMatch'),
        add: t('groups.picker.season.add'),
        askAdmin: t('groups.picker.askAdmin'),
      },
    },
    canCreate,
    create: { kind: 'inline' },
    inlineCreate: {
      title: t('groups.picker.season.createTitle'),
      fields: [
        { id: 'name', label: t('groups.seasons.fields.name'), type: 'text', required: true, maxLength: 200 },
        { id: 'startsOn', label: t('groups.seasons.fields.startsOn'), type: 'date', required: true },
        { id: 'endsOn', label: t('groups.seasons.fields.endsOn'), type: 'date', required: true },
      ],
      initialValues: (term) => ({ name: term ?? '' }),
      labels: dialogLabels(t),
      onCreate: async (values) => {
        const created = await createCrud<{ id?: string }>('groups/seasons', {
          name: values.name,
          startsOn: values.startsOn,
          endsOn: values.endsOn,
        })
        const id = created.result?.id
        if (!id) throw new Error(t('groups.picker.season.createFailed'))
        return { value: id, label: values.name }
      },
      describeError: (error) => ({ message: errorMessage(error, t('groups.picker.season.createFailed')) }),
    },
  }
}

/** The live institutions of the club by name (`GET /api/club_core/institutions/options`, readable by coordinators). */
async function institutionOptions(): Promise<PickerOption[]> {
  const data = await readApiResultOrThrow<{ items?: Array<{ id: string; name: string }> }>(
    '/api/club_core/institutions/options',
  )
  return (data.items ?? []).map((item) => ({ value: item.id, label: item.name }))
}

/** The external team's institution: an existing one; adding one stays the club administrator's (a link). */
export function institutionPicker(t: Translate, canCreate: boolean): PickerConfig {
  return {
    loadOptions: institutionOptions,
    labels: {
      ...commonLabels(t),
      emptyOption: t('groups.externalTeams.fields.institution.none'),
      hint: {
        none: t('groups.picker.institution.none'),
        noMatch: t('groups.picker.institution.noMatch'),
        add: t('groups.picker.institution.add'),
        askAdmin: t('groups.picker.askAdmin'),
      },
    },
    canCreate,
    create: { kind: 'link', href: INSTITUTION_CREATE_HREF },
  }
}
