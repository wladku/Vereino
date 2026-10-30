// Error codes owned by `club_core` (engineering standards S6.7; club spec *API, Command, and Error Contracts* and
// glossary *Place*, *Logo*, *Publication*). Thrown through `api/errors.ts`. The 409 rules of sections with groups
// arrive with `groups` (phase 2).
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'place_hierarchy_cycle', status: 422, messageKey: 'club_core.errors.place_hierarchy_cycle' },
  { code: 'place_reference_invalid', status: 422, messageKey: 'club_core.errors.place_reference_invalid' },
  { code: 'place_not_bookable', status: 422, messageKey: 'club_core.errors.place_not_bookable' },
  { code: 'place_has_children', status: 409, messageKey: 'club_core.errors.place_has_children' },
  { code: 'institution_in_use', status: 409, messageKey: 'club_core.errors.institution_in_use' },
  // Publication (#29): the club's slug is globally unique, a section's slug unique in the club.
  { code: 'public_slug_taken', status: 409, messageKey: 'club_core.errors.public_slug_taken' },
  { code: 'publication_slug_required', status: 422, messageKey: 'club_core.errors.publication_slug_required' },
  { code: 'section_public_slug_required', status: 422, messageKey: 'club_core.errors.section_public_slug_required' },
  { code: 'publication_forbidden', status: 403, messageKey: 'club_core.errors.publication_forbidden' },
  // Logos and materials (#29, glossary *Logo*): checked by their magic bytes; no SVG.
  { code: 'upload_file_missing', status: 400, messageKey: 'club_core.errors.upload_file_missing' },
  { code: 'logo_format_unsupported', status: 422, messageKey: 'club_core.errors.logo_format_unsupported' },
  { code: 'logo_too_large', status: 422, messageKey: 'club_core.errors.logo_too_large' },
  { code: 'material_format_unsupported', status: 422, messageKey: 'club_core.errors.material_format_unsupported' },
  { code: 'material_too_large', status: 422, messageKey: 'club_core.errors.material_too_large' },
  // Sessionless public pages (DD-23, DD-35): an unknown slug, a section that is not public and a section of another
  // club answer the same 404; a club that does not publish its page answers its own 404.
  { code: 'public_page_not_found', status: 404, messageKey: 'club_core.errors.public_page_not_found' },
  { code: 'public_page_disabled', status: 404, messageKey: 'club_core.errors.public_page_disabled' },
] as const satisfies ErrorCodeTable

export type ClubCoreErrorCode = (typeof errorCodes)[number]['code']
