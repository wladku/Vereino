'use client'
// The state and the save of "Add place" (club events spec REQ-T06, J-T01 step 2, UI rows B-T2 and the phone form;
// #377), shared by the panel's `AddExternalPlaceDialog` and the phone's `AddExternalPlaceSheet`, which the club event
// forms open (E14-S03, E14-S05): a name, the venue's address, a kind (default "Other") and an optional owner from the
// names-only `GET /api/club_core/institutions/options`. The save calls `POST /api/club_core/places/external`; the host
// selects the answered place and the polite live region announces it. A place with the same name and address
// (409 `external_place_exists`) is offered for picking instead of adding it twice.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { EXTERNAL_PLACE_DEFAULT_KIND, externalPlaceDraftProblems, type PlaceKind } from '../lib/places'
import { errorMessage } from './client-helpers'

/** The place `POST /api/club_core/places/external` answers: the option the host's place picker selects. */
export type AddedExternalPlace = {
  id: string
  name: string
  label: string
  kind: string
  address: string
  ownerInstitutionId: string | null
  parentId: null
  isExternal: true
  isPublicSchedule: false
}

/** The select value of "no owner" (a select item cannot hold an empty value). */
export const NO_OWNER = '__none__'

type Field = 'name' | 'address' | 'kind' | 'ownerInstitutionId'

/** The existing place a 409 `external_place_exists` names, or null for any other error. */
export function existingPlaceIdOf(error: unknown): string | null {
  if (errorCodeOf(error) !== 'external_place_exists' || !error || typeof error !== 'object') return null
  const details = (error as { details?: unknown }).details
  if (!details || typeof details !== 'object') return null
  const placeId = (details as { placeId?: unknown }).placeId
  return typeof placeId === 'string' ? placeId : null
}

/** The fields a 400 validation answer names (its zod issues' first path segment). */
function invalidFieldsOf(error: unknown): Field[] {
  if (!error || typeof error !== 'object') return []
  const issues = (error as { details?: unknown }).details
  if (!Array.isArray(issues)) return []
  const fields = new Set<Field>()
  for (const issue of issues) {
    const head = (issue as { path?: unknown[] } | null)?.path?.[0]
    if (head === 'name' || head === 'address' || head === 'kind' || head === 'ownerInstitutionId') fields.add(head)
  }
  return [...fields]
}

export function useAddExternalPlace({
  open,
  onOpenChange,
  onAdded,
  onPickExisting,
  initialName = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The host selects the added place. */
  onAdded: (place: AddedExternalPlace) => void | Promise<void>
  /** The host selects the place that already holds this name and address. */
  onPickExisting?: (placeId: string) => void | Promise<void>
  /** What the user typed in the place picker before opening "Add place". */
  initialName?: string
}) {
  const t = useT()
  const [name, setName] = React.useState(initialName)
  const [address, setAddress] = React.useState('')
  const [kind, setKind] = React.useState<PlaceKind>(EXTERNAL_PLACE_DEFAULT_KIND)
  const [ownerId, setOwnerId] = React.useState(NO_OWNER)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [invalid, setInvalid] = React.useState<Field[]>([])
  const [existingPlaceId, setExistingPlaceId] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState('')

  // A dialog opened again starts with what the user typed in the picker this time (state adjusted while rendering,
  // not in an effect, so the fields never show the previous name for a frame).
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setName(initialName)
  }

  const owners = useQuery({
    queryKey: ['club-core-institution-options'],
    queryFn: () =>
      readApiResultOrThrow<{ items?: Array<{ id: string; name: string }> }>('/api/club_core/institutions/options'),
    enabled: open,
    retry: false,
  })
  const ownerOptions = React.useMemo(
    () => (owners.data?.items ?? []).map((item) => ({ value: item.id, label: item.name })),
    [owners.data],
  )

  const reset = () => {
    setName('')
    setAddress('')
    setKind(EXTERNAL_PLACE_DEFAULT_KIND)
    setOwnerId(NO_OWNER)
    setProblem(null)
    setInvalid([])
    setExistingPlaceId(null)
  }

  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const edit = <T>(setter: (value: T) => void) => {
    return (value: T) => {
      setter(value)
      setProblem(null)
      setInvalid([])
      setExistingPlaceId(null)
    }
  }

  const submit = async () => {
    if (pending) return
    const draftProblems = externalPlaceDraftProblems({ name, address })
    if (draftProblems.length > 0) {
      setInvalid(draftProblems)
      setProblem(t('club_core.externalPlace.errors.fields'))
      return
    }
    setPending(true)
    setProblem(null)
    setInvalid([])
    setExistingPlaceId(null)
    try {
      const response = await apiCallOrThrow<AddedExternalPlace>(
        '/api/club_core/places/external',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            address: address.trim(),
            kind,
            ownerInstitutionId: ownerId === NO_OWNER ? null : ownerId,
          }),
        },
        { errorMessage: t('club_core.externalPlace.errors.save') },
      )
      const place = response.result
      if (!place) throw new Error(t('club_core.externalPlace.errors.save'))
      setAnnouncement(t('club_core.externalPlace.added', { name: place.name }))
      close(false)
      await onAdded(place)
    } catch (error: unknown) {
      const existing = existingPlaceIdOf(error)
      if (existing) {
        setExistingPlaceId(existing)
        setProblem(t('club_core.errors.external_place_exists'))
      } else {
        const code = errorCodeOf(error)
        const fields = code === 'place_reference_invalid' ? (['ownerInstitutionId'] as Field[]) : invalidFieldsOf(error)
        setInvalid(fields)
        if (code === 'place_reference_invalid') void owners.refetch()
        setProblem(
          fields.length > 0 && !code
            ? t('club_core.externalPlace.errors.fields')
            : errorMessage(error, t('club_core.externalPlace.errors.save')),
        )
      }
    } finally {
      setPending(false)
    }
  }

  const pickExisting = async () => {
    if (!existingPlaceId || !onPickExisting) return
    const placeId = existingPlaceId
    setAnnouncement(t('club_core.externalPlace.picked', { name: name.trim() }))
    close(false)
    await onPickExisting(placeId)
  }

  return {
    name,
    setName: edit(setName),
    address,
    setAddress: edit(setAddress),
    kind,
    setKind: edit(setKind),
    ownerId,
    setOwnerId: edit(setOwnerId),
    owners,
    ownerOptions,
    pending,
    problem,
    invalid,
    existingPlaceId,
    canPickExisting: Boolean(existingPlaceId && onPickExisting),
    pickExisting,
    announcement,
    close,
    submit,
  }
}

export type AddExternalPlaceState = ReturnType<typeof useAddExternalPlace>
