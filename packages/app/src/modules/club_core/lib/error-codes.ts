// Error codes owned by `club_core` (engineering standards S6.7; club spec *API, Command, and Error Contracts* and
// glossary *Place*). Thrown through `api/errors.ts`. The 409 rules of sections with groups arrive with `groups`
// (phase 2).
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'place_hierarchy_cycle', status: 422, messageKey: 'club_core.errors.place_hierarchy_cycle' },
  { code: 'place_reference_invalid', status: 422, messageKey: 'club_core.errors.place_reference_invalid' },
  { code: 'place_not_bookable', status: 422, messageKey: 'club_core.errors.place_not_bookable' },
  { code: 'place_has_children', status: 409, messageKey: 'club_core.errors.place_has_children' },
  { code: 'institution_in_use', status: 409, messageKey: 'club_core.errors.institution_in_use' },
] as const satisfies ErrorCodeTable

export type ClubCoreErrorCode = (typeof errorCodes)[number]['code']
