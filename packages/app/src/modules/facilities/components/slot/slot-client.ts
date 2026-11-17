// Client-side helpers of the slot dialog (facilities parity spec `SlotDialog`, DD-R04, DD-R07; #277): the kinds the
// signed-in user may save (features and own groups), the renter search of the rental kind and the collision list a
// refused save carries, in the "from–to label" form of `ui.slotModal.slotTaken`. Authorization stays on the routes.
import { useQuery } from '@tanstack/react-query'
import type { LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCall, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { EventGroupOption } from '../../../activities/lib/member-event'
import type { ScheduleConflict } from '../../../activities/components/client-helpers'
import { slotKinds, type SlotKind } from '../../lib/slot'
import type { RenterType } from '../../lib/rentals'
import {
  EVENT_OPTIONS_URL,
  entryLabel,
  entryRange,
  type BookingConflict,
  type Translate,
} from '../club-places/places-client'

export const RENTERS_URL = '/api/facilities/renters'

const FEATURES = ['facilities.rentals.manage', 'facilities.bookings.create', 'activities.events.create'] as const

function grants(granted: readonly string[], feature: string): boolean {
  return granted.some(
    (entry) => entry === '*' || entry === feature || (entry.endsWith('.*') && feature.startsWith(entry.slice(0, -1))),
  )
}

/**
 * The kinds the signed-in user may save from a free hour (DD-R04) and their own groups (the group kind needs at least
 * one). `ready` turns true once the features — and, with `activities.events.create`, the groups — are read.
 */
export function useSlotKinds(): { kinds: SlotKind[]; groups: EventGroupOption[]; ready: boolean } {
  const features = useQuery({
    queryKey: ['feature-check', ...FEATURES],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const call = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: FEATURES }),
      })
      return call.ok && Array.isArray(call.result?.granted) ? call.result.granted.map(String) : []
    },
  })
  const granted = features.data ?? []
  const groupEvents = grants(granted, 'activities.events.create')
  const groups = useQuery({
    queryKey: ['facilities-slot-groups'],
    enabled: groupEvents,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<EventGroupOption[]> => {
      const call = await apiCall<{ groups?: EventGroupOption[] }>(EVENT_OPTIONS_URL, {
        headers: { 'x-om-forbidden-redirect': '0' },
      })
      return call.ok ? (call.result?.groups ?? []) : []
    },
  })
  const own = groups.data ?? []
  return {
    kinds: slotKinds({
      rentals: grants(granted, 'facilities.rentals.manage'),
      groupEvents,
      ownGroups: own.length,
      bookings: grants(granted, 'facilities.bookings.create'),
    }),
    groups: own,
    ready: features.isSuccess && (!groupEvents || !groups.isPending),
  }
}

// --- Renter search ---

export type RenterContact = { name: string | null; phone: string | null; email: string | null }

/** One option of `GET /api/facilities/renters`. */
export type RenterOption = {
  renterType: RenterType
  renterId: string | null
  displayName: string
  lastCategory: string | null
  lastContact: RenterContact | null
}

/** The lookup id of an option: an unregistered renter has no id, so its type and name stand in for it. */
export function renterKey(option: Pick<RenterOption, 'renterType' | 'renterId' | 'displayName'>): string {
  return `${option.renterType}:${option.renterId ?? option.displayName}`
}

/** The renters matching `query` (2+ characters) in the caller's scope, as lookup items and the options by key. */
export async function searchRenters(
  t: Translate,
  query: string,
  placeId: string | null,
): Promise<{ items: LookupSelectItem[]; found: RenterOption[] }> {
  const params = new URLSearchParams({ search: query.trim() })
  if (placeId) params.set('placeId', placeId)
  const data = await readApiResultOrThrow<{ items?: RenterOption[] }>(`${RENTERS_URL}?${params.toString()}`)
  const found = data.items ?? []
  return {
    found,
    items: found.map((option) => ({
      id: renterKey(option),
      title: option.displayName,
      subtitle: [t(`facilities.slot.renterType.${option.renterType}`), option.lastContact?.name ?? null]
        .filter(Boolean)
        .join(' · '),
    })),
  }
}

// --- Collisions ---

/** One colliding entry as the dialog lists it: "from–to label". */
export type CollisionLine = { key: string; text: string }

/** The entries a refused rental or club booking collides with (409 with `conflicts`). */
export function bookingCollisionLines(
  t: Translate,
  conflicts: readonly BookingConflict[],
  timeZone: string,
): CollisionLine[] {
  return conflicts.map((conflict) => ({
    key: `${conflict.kind}:${conflict.id}`,
    text: `${entryRange(conflict, timeZone)} ${entryLabel(t, conflict)}`,
  }))
}

/** The sessions and blocks a group's event collides with (409 `occurrence_place_conflict` of `activities`). */
export function eventCollisionLines(
  t: Translate,
  conflicts: readonly ScheduleConflict[],
  timeZone: string,
): CollisionLine[] {
  return conflicts.flatMap((conflict) => [
    ...conflict.sessions.map((session) => ({
      key: `session:${session.id}`,
      text: `${entryRange({ start: session.startAt, end: session.endAt }, timeZone)} ${
        session.activityName ?? t('facilities.places.entry.unnamed')
      }`,
    })),
    ...conflict.blocks.map((block) => ({
      key: `block:${block.id}`,
      text: `${entryRange({ start: block.startAt, end: block.endAt }, timeZone)} ${t(
        `facilities.places.kind.${block.reason}`,
      )}`,
    })),
  ])
}

/** True for the `conflicts` of `activities`' 409 (each with sessions and blocks). */
export function isScheduleConflicts(value: unknown): value is ScheduleConflict[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item && typeof item === 'object' && Array.isArray((item as ScheduleConflict).sessions))
  )
}
