// Types of the place and institution list items as the client reads them.
import type { OpeningHours } from '@vereino/core'
import type { PlaceContact } from '../lib/places'

export type PlaceRow = {
  id: string
  parentPlaceId: string | null
  kind: string | null
  name: string | null
  surface: string | null
  address: string | null
  geoLat: number | null
  geoLng: number | null
  description: string | null
  ownerInstitutionId: string | null
  managedByClub: boolean
  isExternal: boolean
  rentedByClub: boolean
  capacityGroups: number
  contacts: PlaceContact[]
  /** The place's own opening hours (DD-41); null = inherited or none. */
  openingHours: OpeningHours | null
  isActive: boolean
  regulationsText: string | null
  /** The place's public calendar (facilities spec P-03, P-04, DD-29; #124): its slug and two switches. */
  publicSlug: string | null
  isPublicSchedule: boolean
  acceptsOnlineRequests: boolean
  createdAt: string | null
  updatedAt: string | null
  /** Added by the list hook (UX parity spec, REQ-U03); absent on other reads. */
  ownerName?: string | null
  parentName?: string | null
}

export type InstitutionRow = {
  id: string
  name: string | null
  type: string | null
  address: string | null
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  bankAccount: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}
