// Error codes owned by `club_core` (engineering standards S6.7; club spec *API, Command, and Error Contracts* and
// glossary *Place*, *Logo*, *Publication*; UX parity spec REQ-U02). Thrown through `api/errors.ts`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'place_hierarchy_cycle', status: 422, messageKey: 'club_core.errors.place_hierarchy_cycle' },
  { code: 'place_reference_invalid', status: 422, messageKey: 'club_core.errors.place_reference_invalid' },
  { code: 'place_not_bookable', status: 422, messageKey: 'club_core.errors.place_not_bookable' },
  { code: 'place_has_children', status: 409, messageKey: 'club_core.errors.place_has_children' },
  // Facilities spec DD-41 (#121): windows out of order or overlapping, or seasons covering a date twice.
  { code: 'place_opening_hours_invalid', status: 422, messageKey: 'club_core.errors.place_opening_hours_invalid' },
  { code: 'institution_in_use', status: 409, messageKey: 'club_core.errors.institution_in_use' },
  // Club settings and institutions (#87): a known IANA zone, the 13–18 threshold, a club name, an NRB bank account.
  { code: 'timezone_unknown', status: 422, messageKey: 'club_core.errors.timezone_unknown' },
  {
    code: 'account_age_threshold_out_of_range',
    status: 422,
    messageKey: 'club_core.errors.account_age_threshold_out_of_range',
  },
  { code: 'club_name_invalid', status: 422, messageKey: 'club_core.errors.club_name_invalid' },
  { code: 'bank_account_invalid', status: 422, messageKey: 'club_core.errors.bank_account_invalid' },
  // Sections (UX parity spec DD-U04, DD-U05, DD-U07): no deactivation or delete under active groups; names 2–80 on
  // create and rename, unique case-insensitively among the club's live sections.
  { code: 'section_has_active_groups', status: 409, messageKey: 'club_core.errors.section_has_active_groups' },
  { code: 'section_name_length', status: 422, messageKey: 'club_core.errors.section_name_length' },
  { code: 'section_name_taken', status: 409, messageKey: 'club_core.errors.section_name_taken' },
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
  // Place files (UX parity spec, REQ-U03; #86): a photo is PNG, JPEG or WebP up to 5 MB, the regulations a PDF up to
  // 10 MB; at most 10 live photos per place.
  { code: 'place_file_format_unsupported', status: 422, messageKey: 'club_core.errors.place_file_format_unsupported' },
  { code: 'place_file_too_large', status: 422, messageKey: 'club_core.errors.place_file_too_large' },
  { code: 'place_photos_limit_reached', status: 422, messageKey: 'club_core.errors.place_photos_limit_reached' },
  // Contracts (#96; README B-07): active contracts of one kind for one party never overlap; a coach contract is with a
  // known person and carries every rate of the club's settlement model.
  { code: 'contract_overlap', status: 409, messageKey: 'club_core.errors.contract_overlap' },
  { code: 'contract_party_invalid', status: 422, messageKey: 'club_core.errors.contract_party_invalid' },
  { code: 'contract_terms_invalid', status: 422, messageKey: 'club_core.errors.contract_terms_invalid' },
  // Sessionless public pages (DD-23, DD-35): an unknown slug, a section that is not public and a section of another
  // club answer the same 404; a club that does not publish its page answers its own 404.
  { code: 'public_page_not_found', status: 404, messageKey: 'club_core.errors.public_page_not_found' },
  { code: 'public_page_disabled', status: 404, messageKey: 'club_core.errors.public_page_disabled' },
] as const satisfies ErrorCodeTable

export type ClubCoreErrorCode = (typeof errorCodes)[number]['code']
