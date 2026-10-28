// Types of the place and institution list items as the client reads them.
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
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
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
