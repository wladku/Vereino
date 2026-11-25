// Error codes owned by `training` (engineering standards S6.7; training outlines spec *API, Command, and Error
// Contracts*, BR-O2, BR-O3; #683). Thrown through `api/errors.ts`. A stale lock token answers the platform's
// `optimistic_lock_conflict`, a target outside the caller's grants the foundation's `scope_denied`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  // BR-O2: a session has at most one outline, a recurring activity one series outline.
  { code: 'outline_exists', status: 409, messageKey: 'training.errors.outline_exists' },
  // BR-O3: read-only 72 hours after the session's end.
  { code: 'outline_locked', status: 409, messageKey: 'training.errors.outline_locked' },
  // An unknown session or activity (or one of another club), or a session outline moved to another session.
  { code: 'outline_reference_invalid', status: 422, messageKey: 'training.errors.outline_reference_invalid' },
  // A series outline needs a recurring activity.
  { code: 'outline_activity_not_recurring', status: 422, messageKey: 'training.errors.outline_activity_not_recurring' },
  // Images (JPEG, PNG or WebP up to 5 MB, at most 12 per outline, one per exercise).
  { code: 'outline_image_missing', status: 422, messageKey: 'training.errors.outline_image_missing' },
  {
    code: 'outline_image_format_unsupported',
    status: 422,
    messageKey: 'training.errors.outline_image_format_unsupported',
  },
  { code: 'outline_image_too_large', status: 422, messageKey: 'training.errors.outline_image_too_large' },
  { code: 'outline_images_limit_reached', status: 422, messageKey: 'training.errors.outline_images_limit_reached' },
  { code: 'outline_exercise_not_found', status: 422, messageKey: 'training.errors.outline_exercise_not_found' },
  // The shared library (phase 4, E24-S05, #685). Without its configuration the library is off (DD-O10).
  { code: 'library_not_configured', status: 404, messageKey: 'training.errors.library_not_configured' },
  // BR-O4: a publication above the club's widest level.
  { code: 'visibility_above_club_level', status: 403, messageKey: 'training.errors.visibility_above_club_level' },
  // The author accepts the library terms before the first publication (*Security* → *Public content*).
  { code: 'library_terms_required', status: 409, messageKey: 'training.errors.library_terms_required' },
  // An unknown, hidden or removed entry, or one the viewer may not see; an outline that is not published.
  { code: 'library_entry_not_found', status: 404, messageKey: 'training.errors.library_entry_not_found' },
  { code: 'outline_not_published', status: 404, messageKey: 'training.errors.outline_not_published' },
  // BR-O6: a rating needs a use of the entry by the same coach.
  { code: 'rating_requires_use', status: 409, messageKey: 'training.errors.rating_requires_use' },
  // REQ-O15: one report per coach (or client address) and entry.
  { code: 'library_report_exists', status: 409, messageKey: 'training.errors.library_report_exists' },
] as const satisfies ErrorCodeTable

export type TrainingErrorCode = (typeof errorCodes)[number]['code']
