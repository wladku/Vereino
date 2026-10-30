import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'

describe('club_core error codes', () => {
  it('declares the place, institution, publication, upload and public page codes with their statuses and message keys', () => {
    expect(errorCodes).toEqual([
      { code: 'place_hierarchy_cycle', status: 422, messageKey: 'club_core.errors.place_hierarchy_cycle' },
      { code: 'place_reference_invalid', status: 422, messageKey: 'club_core.errors.place_reference_invalid' },
      { code: 'place_not_bookable', status: 422, messageKey: 'club_core.errors.place_not_bookable' },
      { code: 'place_has_children', status: 409, messageKey: 'club_core.errors.place_has_children' },
      { code: 'institution_in_use', status: 409, messageKey: 'club_core.errors.institution_in_use' },
      { code: 'public_slug_taken', status: 409, messageKey: 'club_core.errors.public_slug_taken' },
      { code: 'publication_slug_required', status: 422, messageKey: 'club_core.errors.publication_slug_required' },
      {
        code: 'section_public_slug_required',
        status: 422,
        messageKey: 'club_core.errors.section_public_slug_required',
      },
      { code: 'publication_forbidden', status: 403, messageKey: 'club_core.errors.publication_forbidden' },
      { code: 'upload_file_missing', status: 400, messageKey: 'club_core.errors.upload_file_missing' },
      { code: 'logo_format_unsupported', status: 422, messageKey: 'club_core.errors.logo_format_unsupported' },
      { code: 'logo_too_large', status: 422, messageKey: 'club_core.errors.logo_too_large' },
      { code: 'material_format_unsupported', status: 422, messageKey: 'club_core.errors.material_format_unsupported' },
      { code: 'material_too_large', status: 422, messageKey: 'club_core.errors.material_too_large' },
      { code: 'public_page_not_found', status: 404, messageKey: 'club_core.errors.public_page_not_found' },
      { code: 'public_page_disabled', status: 404, messageKey: 'club_core.errors.public_page_disabled' },
    ])
  })
})
