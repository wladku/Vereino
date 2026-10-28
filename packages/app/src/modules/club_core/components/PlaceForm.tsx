'use client'
// `/backend/club/places/create` and `/backend/club/places/[id]/edit` (club spec UI table): one place of the
// hierarchy. The parent and the owner are chosen by name; the contacts are edited as rows.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CrudForm,
  type CrudCustomFieldRenderProps,
  type CrudField,
  type CrudFieldOption,
  type CrudFormGroup,
} from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { createCrud, deleteCrud, fetchCrudList, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { withFlash } from '@open-mercato/ui/backend/utils/flash'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PLACE_KINDS, type PlaceContact } from '../lib/places'
import { enumOptions, errorMessage, numberOrNull, textOrNull, type Translate } from './client-helpers'
import type { InstitutionRow, PlaceRow } from './places-shared'

const LIST_HREF = '/backend/club/places'
const ENTITY_ID = 'club_core:place'
const NONE = ''

type ContactDraft = { role: string; name: string; phone: string }

type PlaceFormValues = Record<string, unknown> & { updatedAt?: string | null }

function ContactsEditor({ value, setValue, disabled }: CrudCustomFieldRenderProps) {
  const t = useT()
  const rows = Array.isArray(value) ? (value as ContactDraft[]) : []
  const update = (index: number, patch: Partial<ContactDraft>) => {
    setValue(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))
  }
  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, index) => (
        <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <Input
            aria-label={t('club_core.places.contacts.role')}
            placeholder={t('club_core.places.contacts.role')}
            value={row.role}
            disabled={disabled}
            onChange={(event) => {
              update(index, { role: event.target.value })
            }}
          />
          <Input
            aria-label={t('club_core.places.contacts.name')}
            placeholder={t('club_core.places.contacts.name')}
            value={row.name}
            disabled={disabled}
            onChange={(event) => {
              update(index, { name: event.target.value })
            }}
          />
          <Input
            aria-label={t('club_core.places.contacts.phone')}
            placeholder={t('club_core.places.contacts.phone')}
            value={row.phone}
            disabled={disabled}
            onChange={(event) => {
              update(index, { phone: event.target.value })
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setValue(rows.filter((_row, position) => position !== index))
            }}
          >
            {t('club_core.places.contacts.remove')}
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => {
            setValue([...rows, { role: '', name: '', phone: '' }])
          }}
        >
          {t('club_core.places.contacts.add')}
        </Button>
      </div>
    </div>
  )
}

async function placeOptions(t: Translate, excludeId?: string): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<PlaceRow>('club_core/places', { pageSize: 100, sortField: 'name', sortDir: 'asc' })
  return [
    { value: NONE, label: t('club_core.places.noParent') },
    ...data.items
      .filter((item) => item.id !== excludeId)
      .map((item) => ({ value: item.id, label: item.name ?? item.id })),
  ]
}

async function institutionOptions(t: Translate): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<InstitutionRow>('club_core/institutions', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
  })
  return [
    { value: NONE, label: t('club_core.places.noOwner') },
    ...data.items.map((item) => ({ value: item.id, label: item.name ?? item.id })),
  ]
}

function usePlaceFields(t: Translate, placeId?: string) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      { id: 'name', label: t('club_core.places.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'kind',
        label: t('club_core.places.fields.kind'),
        type: 'select',
        options: enumOptions(PLACE_KINDS, 'club_core.places.kind', t),
        required: true,
      },
      {
        id: 'parentPlaceId',
        label: t('club_core.places.fields.parent'),
        type: 'select',
        description: t('club_core.places.fields.parent.help'),
        loadOptions: () => placeOptions(t, placeId),
      },
      { id: 'surface', label: t('club_core.places.fields.surface'), type: 'text', maxLength: 200 },
      { id: 'address', label: t('club_core.places.fields.address'), type: 'text', maxLength: 500 },
      { id: 'geoLat', label: t('club_core.places.fields.geoLat'), type: 'number', layout: 'half' },
      { id: 'geoLng', label: t('club_core.places.fields.geoLng'), type: 'number', layout: 'half' },
      { id: 'description', label: t('club_core.places.fields.description'), type: 'textarea' },
      {
        id: 'ownerInstitutionId',
        label: t('club_core.places.fields.owner'),
        type: 'select',
        loadOptions: () => institutionOptions(t),
      },
      { id: 'managedByClub', label: t('club_core.places.fields.managedByClub'), type: 'checkbox' },
      { id: 'isExternal', label: t('club_core.places.fields.isExternal'), type: 'checkbox' },
      {
        id: 'rentedByClub',
        label: t('club_core.places.fields.rentedByClub'),
        type: 'checkbox',
        description: t('club_core.places.fields.rentedByClub.help'),
      },
      {
        id: 'capacityGroups',
        label: t('club_core.places.fields.capacityGroups'),
        type: 'number',
        required: true,
        description: t('club_core.places.fields.capacityGroups.help'),
      },
      { id: 'isActive', label: t('club_core.places.fields.isActive'), type: 'checkbox' },
      { id: 'contacts', label: t('club_core.places.fields.contacts'), type: 'custom', component: ContactsEditor },
    ],
    [t, placeId],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'place',
        title: t('club_core.places.groups.place'),
        column: 1,
        fields: ['name', 'kind', 'parentPlaceId', 'surface', 'capacityGroups', 'isActive', 'description'],
      },
      {
        id: 'location',
        title: t('club_core.places.groups.location'),
        column: 2,
        fields: ['address', 'geoLat', 'geoLng'],
      },
      {
        id: 'ownership',
        title: t('club_core.places.groups.ownership'),
        column: 2,
        fields: ['ownerInstitutionId', 'managedByClub', 'isExternal', 'rentedByClub'],
      },
      { id: 'contacts', title: t('club_core.places.groups.contacts'), column: 1, fields: ['contacts'] },
    ],
    [t],
  )
  return { fields, groups }
}

function toFormValues(place: PlaceRow | null): PlaceFormValues {
  return {
    name: place?.name ?? '',
    kind: place?.kind ?? 'pitch',
    parentPlaceId: place?.parentPlaceId ?? NONE,
    surface: place?.surface ?? '',
    address: place?.address ?? '',
    geoLat: place?.geoLat ?? null,
    geoLng: place?.geoLng ?? null,
    description: place?.description ?? '',
    ownerInstitutionId: place?.ownerInstitutionId ?? NONE,
    managedByClub: place?.managedByClub ?? false,
    isExternal: place?.isExternal ?? false,
    rentedByClub: place?.rentedByClub ?? false,
    capacityGroups: place?.capacityGroups ?? 1,
    isActive: place?.isActive ?? true,
    contacts: (place?.contacts ?? []).map((contact) => ({
      role: contact.role ?? '',
      name: contact.name,
      phone: contact.phone ?? '',
    })),
    updatedAt: place?.updatedAt ?? null,
  }
}

function toPayload(values: PlaceFormValues) {
  const contacts: PlaceContact[] = (Array.isArray(values.contacts) ? (values.contacts as ContactDraft[]) : [])
    .filter((contact) => contact.name.trim() || contact.phone.trim() || contact.role.trim())
    .map((contact) => ({ role: textOrNull(contact.role), name: contact.name.trim(), phone: textOrNull(contact.phone) }))
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    kind: values.kind,
    parentPlaceId: textOrNull(values.parentPlaceId),
    surface: textOrNull(values.surface),
    address: textOrNull(values.address),
    geoLat: numberOrNull(values.geoLat),
    geoLng: numberOrNull(values.geoLng),
    description: textOrNull(values.description),
    ownerInstitutionId: textOrNull(values.ownerInstitutionId),
    managedByClub: values.managedByClub === true,
    isExternal: values.isExternal === true,
    rentedByClub: values.rentedByClub === true,
    capacityGroups: numberOrNull(values.capacityGroups) ?? 1,
    contacts,
    isActive: values.isActive !== false,
  }
}

export function PlaceCreateForm() {
  const t = useT()
  const { fields, groups } = usePlaceFields(t)
  return (
    <CrudForm<PlaceFormValues>
      title={t('club_core.places.create.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={toFormValues(null)}
      submitLabel={t('club_core.common.create')}
      successRedirect={withFlash(LIST_HREF, t('club_core.places.flash.created'), 'success')}
      onSubmit={async (values) => {
        await createCrud('club_core/places', toPayload(values))
      }}
    />
  )
}

export function PlaceEditForm({ id }: { id: string }) {
  const t = useT()
  const { fields, groups } = usePlaceFields(t, id)
  const query = useQuery({
    queryKey: ['club_core-places-record', id],
    queryFn: async () => {
      const data = await fetchCrudList<PlaceRow>('club_core/places', { ids: id, pageSize: 1 })
      return data.items[0] ?? null
    },
  })
  const place = query.data ?? null

  if (query.isSuccess && !place) {
    return (
      <RecordNotFoundState
        label={t('club_core.places.errors.notFound')}
        backHref={LIST_HREF}
        backLabel={t('club_core.places.actions.back')}
      />
    )
  }
  if (query.error) return <ErrorMessage label={errorMessage(query.error, t('club_core.places.errors.load'))} />

  return (
    <CrudForm<PlaceFormValues>
      key={place ? (place.updatedAt ?? place.id) : 'loading'}
      title={t('club_core.places.edit.title')}
      titleHeadingLevel={1}
      backHref={LIST_HREF}
      cancelHref={LIST_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      isLoading={query.isLoading}
      loadingMessage={t('club_core.places.loading')}
      initialValues={{ ...toFormValues(place), id }}
      submitLabel={t('club_core.common.save')}
      successRedirect={withFlash(LIST_HREF, t('club_core.places.flash.saved'), 'success')}
      deleteRedirect={withFlash(LIST_HREF, t('club_core.places.flash.deleted'), 'success')}
      onSubmit={async (values) => {
        await updateCrud('club_core/places', { id, ...toPayload(values) })
      }}
      onDelete={async () => {
        await deleteCrud('club_core/places', id)
      }}
    />
  )
}
