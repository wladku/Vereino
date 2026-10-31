// Error codes owned by `activities` (engineering standards S6.7; club spec glossary *Activity*, *Session*, *Session
// conflict*, *One-off event*; the `/api/activities/*` rows of *API, Command, and Error Contracts*). Thrown through
// `api/errors.ts`. An unsupported or invalid recurrence rule answers the foundation's `recurrence_unsupported` /
// `recurrence_invalid`, a refused status move its `invalid_transition`, a session on a place with children
// `club_core`'s `place_not_bookable`, and a stale lock token the platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'occurrence_place_conflict', status: 409, messageKey: 'activities.errors.occurrence_place_conflict' },
  { code: 'occurrence_coach_conflict', status: 409, messageKey: 'activities.errors.occurrence_coach_conflict' },
  { code: 'occurrence_not_planned', status: 409, messageKey: 'activities.errors.occurrence_not_planned' },
  { code: 'activity_has_sessions', status: 409, messageKey: 'activities.errors.activity_has_sessions' },
  { code: 'activity_type_requires_team', status: 422, messageKey: 'activities.errors.activity_type_requires_team' },
  { code: 'event_type_not_allowed', status: 422, messageKey: 'activities.errors.event_type_not_allowed' },
  { code: 'activity_times_inverted', status: 422, messageKey: 'activities.errors.activity_times_inverted' },
  { code: 'activity_dates_inverted', status: 422, messageKey: 'activities.errors.activity_dates_inverted' },
  { code: 'activity_no_sessions', status: 422, messageKey: 'activities.errors.activity_no_sessions' },
  { code: 'activities_reference_invalid', status: 422, messageKey: 'activities.errors.activities_reference_invalid' },
  { code: 'activity_group_inactive', status: 422, messageKey: 'activities.errors.activity_group_inactive' },
  // Declarations and policies (#32; club spec glossary *Declaration*, *Declaration policy*; D-026).
  { code: 'declaration_closed', status: 409, messageKey: 'activities.errors.declaration_closed' },
  { code: 'declaration_kind_absence_only', status: 422, messageKey: 'activities.errors.declaration_kind_absence_only' },
  { code: 'declaration_guardian_only', status: 403, messageKey: 'activities.errors.declaration_guardian_only' },
  { code: 'declaration_not_participant', status: 422, messageKey: 'activities.errors.declaration_not_participant' },
  { code: 'guardian_decision_not_pending', status: 409, messageKey: 'activities.errors.guardian_decision_not_pending' },
  { code: 'attendance_policy_duplicate', status: 409, messageKey: 'activities.errors.attendance_policy_duplicate' },
  {
    code: 'attendance_policy_scope_invalid',
    status: 422,
    messageKey: 'activities.errors.attendance_policy_scope_invalid',
  },
  { code: 'calendar_range_invalid', status: 400, messageKey: 'activities.errors.calendar_range_invalid' },
  // Actual attendance (#33; club spec glossary *Actual attendance*).
  { code: 'attendance_not_started', status: 409, messageKey: 'activities.errors.attendance_not_started' },
  { code: 'attendance_person_not_listed', status: 422, messageKey: 'activities.errors.attendance_person_not_listed' },
  { code: 'attendance_version_required', status: 400, messageKey: 'activities.errors.attendance_version_required' },
] as const satisfies ErrorCodeTable

export type ActivitiesErrorCode = (typeof errorCodes)[number]['code']
