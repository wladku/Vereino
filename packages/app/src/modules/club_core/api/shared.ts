// Shared pieces of the `club_core` routes: the grant kinds each list allows, their column maps, list-item
// serializers and OpenAPI schemas. Lists filter with `scopeWhere` (foundation spec P-03).
import { z } from 'zod'
import type { GrantKind, ScopeColumnMap } from '@vereino/core'
import { decimalOrNull, parsePlaceContacts } from '../lib/places'

/** Sections are read by the club administrator and by the coordinators of each section (`section_ids`). */
export const SECTION_READ_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']
export const SECTION_COLUMNS: ScopeColumnMap = { sectionId: 'id' }

/**
 * Places and institutions carry no section, so only the club administrator's grant lists them; a coordinator gets an
 * empty list (place names for later session forms come from an option-source route, phase 2).
 */
export const STRUCTURE_READ_KINDS: readonly GrantKind[] = ['club_admin']
export const STRUCTURE_COLUMNS: ScopeColumnMap = {}

/** The entity ids of the lists (query engine, encryption maps, enrichers). */
export const SECTION_ENTITY_ID = 'club_core:section'
export const PLACE_LIST_ENTITY_ID = 'club_core:place'
export const INSTITUTION_LIST_ENTITY_ID = 'club_core:institution'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const bool = (value: unknown): boolean => value === true || value === 't' || value === 'true'

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

export function sectionListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    description: text(row.description),
    isActive: bool(row.is_active),
    logoAttachmentId: text(row.logo_attachment_id),
    isPublic: bool(row.is_public),
    publicSlug: text(row.public_slug),
    publicDescription: text(row.public_description),
    publicConditions: text(row.public_conditions),
    publicContactName: text(row.public_contact_name),
    publicContactEmail: text(row.public_contact_email),
    publicContactPhone: text(row.public_contact_phone),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function placeListItem(row: Row) {
  return {
    id: String(row.id),
    parentPlaceId: text(row.parent_place_id),
    kind: text(row.kind),
    name: text(row.name),
    surface: text(row.surface),
    address: text(row.address),
    geoLat: decimalOrNull(row.geo_lat),
    geoLng: decimalOrNull(row.geo_lng),
    description: text(row.description),
    ownerInstitutionId: text(row.owner_institution_id),
    managedByClub: bool(row.managed_by_club),
    isExternal: bool(row.is_external),
    rentedByClub: bool(row.rented_by_club),
    capacityGroups: typeof row.capacity_groups === 'number' ? row.capacity_groups : Number(row.capacity_groups ?? 1),
    contacts: parsePlaceContacts(row.contacts),
    isActive: bool(row.is_active),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function institutionListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    type: text(row.type),
    address: text(row.address),
    contactName: text(row.contact_name),
    contactPhone: text(row.contact_phone),
    contactEmail: text(row.contact_email),
    bankAccount: text(row.bank_account),
    notes: text(row.notes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const updateResponseSchema = z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string() })

const coordinatorSchema = z.object({
  assignmentId: z.uuid(),
  personId: z.uuid(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  validFrom: z.string(),
  validTo: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const sectionListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  logoAttachmentId: z.string().nullable().describe("The section's own logo; null shows the club logo"),
  isPublic: z.boolean(),
  publicSlug: z.string().nullable(),
  publicDescription: z.string().nullable(),
  publicConditions: z.string().nullable(),
  publicContactName: z.string().nullable(),
  publicContactEmail: z.string().nullable(),
  publicContactPhone: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  _people: z
    .object({ coordinators: z.array(coordinatorSchema), coordinatorMissing: z.boolean() })
    .optional()
    .describe('Added by the `people` response enricher: current and future coordinators of the section.'),
})

export const placeListItemSchema = z.object({
  id: z.uuid(),
  parentPlaceId: z.string().nullable(),
  kind: z.string().nullable(),
  name: z.string().nullable(),
  surface: z.string().nullable(),
  address: z.string().nullable(),
  geoLat: z.number().nullable(),
  geoLng: z.number().nullable(),
  description: z.string().nullable(),
  ownerInstitutionId: z.string().nullable(),
  managedByClub: z.boolean(),
  isExternal: z.boolean(),
  rentedByClub: z.boolean(),
  capacityGroups: z.number(),
  contacts: z.array(z.object({ role: z.string().nullable(), name: z.string(), phone: z.string().nullable() })),
  isActive: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const institutionListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  address: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  bankAccount: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
