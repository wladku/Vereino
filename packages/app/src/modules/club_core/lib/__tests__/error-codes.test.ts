import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'

describe('club_core error codes', () => {
  it('declares the place and institution codes with their statuses and message keys', () => {
    expect(errorCodes).toEqual([
      { code: 'place_hierarchy_cycle', status: 422, messageKey: 'club_core.errors.place_hierarchy_cycle' },
      { code: 'place_reference_invalid', status: 422, messageKey: 'club_core.errors.place_reference_invalid' },
      { code: 'place_not_bookable', status: 422, messageKey: 'club_core.errors.place_not_bookable' },
      { code: 'place_has_children', status: 409, messageKey: 'club_core.errors.place_has_children' },
      { code: 'institution_in_use', status: 409, messageKey: 'club_core.errors.institution_in_use' },
    ])
  })
})
