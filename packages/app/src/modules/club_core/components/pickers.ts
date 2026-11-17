'use client'
// The empty-picker wiring of the `club_core` forms (people life-cycle spec REQ-L14, picker rows 1 and 2): the
// institution select creates an institution in place (name and type) with `club_core.manage`, the contract's person
// search links to the person create page with `people.manage`; without the feature the hint names the club
// administrator. The options come from the names-only `GET /api/club_core/institutions/options`.
import * as React from 'react'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud } from '@open-mercato/ui/backend/utils/crud'
import { useGrantedFeatures, type PickerEmptyHintLabels, type PickerFieldOptions, type PickerOption } from '@vereino/ui'
import { INSTITUTION_TYPES } from '../data/validators'
import { enumOptions, errorMessage, type Translate } from './client-helpers'

export const PICKER_FEATURES = ['club_core.manage', 'people.manage'] as const

export const PERSON_CREATE_HREF = '/backend/people/persons/create'

/** Which create paths the session may take (wildcard-aware); hides actions the server would refuse anyway. */
export function usePickerFeatures() {
  return useGrantedFeatures(PICKER_FEATURES, apiCall)
}

/** The live institutions of the club by name (`GET /api/club_core/institutions/options`). */
export async function loadInstitutionOptions(): Promise<PickerOption[]> {
  const data = await readApiResultOrThrow<{ items?: Array<{ id: string; name: string }> }>(
    '/api/club_core/institutions/options',
  )
  return (data.items ?? []).map((item) => ({ value: item.id, label: item.name }))
}

export function institutionHintLabels(t: Translate): PickerEmptyHintLabels {
  return {
    none: t('club_core.picker.institution.none'),
    noMatch: t('club_core.picker.institution.noMatch'),
    add: t('club_core.picker.institution.add'),
    askAdmin: t('club_core.picker.askAdmin'),
  }
}

export function personHintLabels(t: Translate): PickerEmptyHintLabels {
  return {
    none: t('club_core.picker.person.none'),
    noMatch: t('club_core.picker.person.noMatch'),
    add: t('club_core.picker.person.add'),
    askAdmin: t('club_core.picker.askAdmin'),
  }
}

/** The `PickerSelect` options of an institution select: in-place create of the name and the type. */
export function institutionPicker(
  t: Translate,
  canCreate: boolean,
  emptyOption?: string,
): Omit<PickerFieldOptions, 'description' | 'layout'> {
  return {
    loadOptions: loadInstitutionOptions,
    labels: {
      emptyOption,
      loading: t('club_core.picker.loading'),
      loadError: t('club_core.picker.loadError'),
      retry: t('club_core.picker.retry'),
      hint: institutionHintLabels(t),
    },
    canCreate,
    create: { kind: 'inline' },
    inlineCreate: {
      title: t('club_core.picker.institution.createTitle'),
      description: t('club_core.picker.institution.createHelp'),
      fields: [
        {
          id: 'name',
          label: t('club_core.institutions.fields.name'),
          type: 'text',
          required: true,
          maxLength: 200,
        },
        {
          id: 'type',
          label: t('club_core.institutions.fields.type'),
          type: 'select',
          required: true,
          options: enumOptions(INSTITUTION_TYPES, 'club_core.institutions.type', t),
        },
      ],
      labels: {
        submit: t('club_core.picker.dialog.submit'),
        saving: t('club_core.picker.dialog.saving'),
        cancel: t('club_core.picker.dialog.cancel'),
        close: t('club_core.picker.dialog.close'),
        required: t('club_core.picker.dialog.required'),
      },
      initialValues: (term) => ({ name: term ?? '' }),
      onCreate: async (values) => {
        const created = await createCrud<{ id?: string }>('club_core/institutions', {
          name: values.name,
          type: values.type,
        })
        const id = created.result?.id
        if (!id) throw new Error(t('club_core.picker.institution.createFailed'))
        return { value: id, label: values.name }
      },
      describeError: (error) => ({ message: errorMessage(error, t('club_core.picker.institution.createFailed')) }),
    },
  }
}

/**
 * Wraps a person search so the form knows when it found nothing: the hint state (`none` without a term, `no-match`
 * with one), or null while there are results.
 */
export function useSearchEmptyState<T>(search: (query?: string) => Promise<T[]>) {
  const [empty, setEmpty] = React.useState<{ term: string | null } | null>(null)
  const tracked = React.useCallback(
    async (query?: string) => {
      const items = await search(query)
      setEmpty(items.length === 0 ? { term: query?.trim() || null } : null)
      return items
    },
    [search],
  )
  return { empty, tracked }
}
