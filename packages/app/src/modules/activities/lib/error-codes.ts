// Error codes owned by `activities` (engineering standards S6.7; club spec glossary *Activity*, *Session*, *Session
// conflict*, *One-off event*; the `/api/activities/*` rows of *API, Command, and Error Contracts*). Thrown through
// `api/errors.ts`. An unsupported or invalid recurrence rule answers the foundation's `recurrence_unsupported` /
// `recurrence_invalid`, a refused status move its `invalid_transition`, a session on a place with children
// `club_core`'s `place_not_bookable`, and a stale lock token the platform's `optimistic_lock_conflict`.
import type { ErrorCodeTable } from '@vereino/core'

export const errorCodes = [
  { code: 'occurrence_place_conflict', status: 409, messageKey: 'activities.errors.occurrence_place_conflict' },
  // A one-off event on a club place outside its opening hours (facilities parity spec REQ-R19, DD-R15, #288).
  { code: 'event_place_closed', status: 409, messageKey: 'activities.errors.event_place_closed' },
  { code: 'occurrence_coach_conflict', status: 409, messageKey: 'activities.errors.occurrence_coach_conflict' },
  { code: 'occurrence_not_planned', status: 409, messageKey: 'activities.errors.occurrence_not_planned' },
  // Restoring a cancelled session (REQ-A05 of the groups and activities parity spec, #268): only a cancelled session,
  // and only while its end is in the future.
  { code: 'occurrence_not_cancelled', status: 409, messageKey: 'activities.errors.occurrence_not_cancelled' },
  { code: 'occurrence_already_ended', status: 409, messageKey: 'activities.errors.occurrence_already_ended' },
  // Reopening a done session (foundation II AC-G02, #588): only a done session.
  { code: 'occurrence_not_done', status: 409, messageKey: 'activities.errors.occurrence_not_done' },
  // The club setting `coach_may_cancel` is off and the caller cancels only as a coach (#199, club spec DD-37).
  { code: 'coach_cancel_disabled', status: 403, messageKey: 'activities.errors.coach_cancel_disabled' },
  { code: 'activity_has_sessions', status: 409, messageKey: 'activities.errors.activity_has_sessions' },
  { code: 'activity_type_requires_team', status: 422, messageKey: 'activities.errors.activity_type_requires_team' },
  { code: 'event_type_not_allowed', status: 422, messageKey: 'activities.errors.event_type_not_allowed' },
  { code: 'activity_times_inverted', status: 422, messageKey: 'activities.errors.activity_times_inverted' },
  { code: 'activity_dates_inverted', status: 422, messageKey: 'activities.errors.activity_dates_inverted' },
  { code: 'activity_no_sessions', status: 422, messageKey: 'activities.errors.activity_no_sessions' },
  // A leaving coach's sessions handed over to a person who is not a coach of the club on the day after the last day
  // (people life-cycle spec *Hand-over choice*; #307), with `details.groupIds`.
  {
    code: 'departure_handover_coach_invalid',
    status: 422,
    messageKey: 'activities.errors.departure_handover_coach_invalid',
  },
  { code: 'activities_reference_invalid', status: 422, messageKey: 'activities.errors.activities_reference_invalid' },
  { code: 'activity_group_inactive', status: 422, messageKey: 'activities.errors.activity_group_inactive' },
  // A typed venue (REQ-A08, #270): a club place or a typed venue, exactly one; a venue only on a one-off activity.
  { code: 'venue_or_place_required', status: 422, messageKey: 'activities.errors.venue_or_place_required' },
  { code: 'venue_requires_one_off', status: 422, messageKey: 'activities.errors.venue_requires_one_off' },
  // A coach edits only the sessions of one-off events of the groups they coach, never a session of a series (DD-A05).
  { code: 'coach_edit_series_session', status: 403, messageKey: 'activities.errors.coach_edit_series_session' },
  // The gathering time of a session (DD-43, #136).
  {
    code: 'occurrence_gathering_after_start',
    status: 422,
    messageKey: 'activities.errors.occurrence_gathering_after_start',
  },
  {
    code: 'occurrence_gathering_too_early',
    status: 422,
    messageKey: 'activities.errors.occurrence_gathering_too_early',
  },
  // The declaration deadline of a session (REQ-A07, #269).
  {
    code: 'occurrence_confirm_by_after_start',
    status: 422,
    messageKey: 'activities.errors.occurrence_confirm_by_after_start',
  },
  {
    code: 'occurrence_confirm_by_too_early',
    status: 422,
    messageKey: 'activities.errors.occurrence_confirm_by_too_early',
  },
  {
    code: 'occurrence_confirm_by_in_past',
    status: 422,
    messageKey: 'activities.errors.occurrence_confirm_by_in_past',
  },
  { code: 'declaration_deadline_passed', status: 409, messageKey: 'activities.errors.declaration_deadline_passed' },
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
  // The coach units report (#96): a month other than `YYYY-MM`.
  { code: 'report_month_invalid', status: 400, messageKey: 'activities.errors.report_month_invalid' },
  // The PZPN exports (training outlines spec REQ-O10, #684): a period other than two dates at most a year apart, and a
  // team that is unknown or outside the caller's reach (the same 404, so another club's group stays invisible).
  { code: 'report_period_invalid', status: 400, messageKey: 'activities.errors.report_period_invalid' },
  { code: 'report_group_not_found', status: 404, messageKey: 'activities.errors.report_group_not_found' },
  // Actual attendance (#33; club spec glossary *Actual attendance*).
  { code: 'attendance_not_started', status: 409, messageKey: 'activities.errors.attendance_not_started' },
  { code: 'attendance_person_not_listed', status: 422, messageKey: 'activities.errors.attendance_person_not_listed' },
  { code: 'attendance_version_required', status: 400, messageKey: 'activities.errors.attendance_version_required' },
  // The public session page (foundation III DD-M14, #35): an unknown session, one of another club, or a club without a
  // published page all answer the same 404 without detail.
  { code: 'public_session_not_found', status: 404, messageKey: 'activities.errors.public_session_not_found' },
  // Personal declaration links (REQ-017): an unknown, malformed or foreign token answers 404 without detail; an expired
  // one the foundation's 410 `token_link_expired`.
  { code: 'declaration_link_not_found', status: 404, messageKey: 'activities.errors.declaration_link_not_found' },
  // Substitutions (E06-S13 #95; club spec glossary *Substitution*): an absence is reported before the session starts;
  // an assignment names a coach of the club other than the session's current one.
  { code: 'absence_after_start', status: 409, messageKey: 'activities.errors.absence_after_start' },
  { code: 'occurrence_coach_unchanged', status: 422, messageKey: 'activities.errors.occurrence_coach_unchanged' },
  // Taking over and scores (E10-S07 #272; parity spec REQ-A14, REQ-A15): a coach or assistant of the group takes a
  // session without a coach; a score is recorded on a match or sparring once it has started.
  { code: 'occurrence_has_coach', status: 409, messageKey: 'activities.errors.occurrence_has_coach' },
  { code: 'score_not_applicable', status: 422, messageKey: 'activities.errors.score_not_applicable' },
  { code: 'score_before_start', status: 409, messageKey: 'activities.errors.score_before_start' },
  // Club events and their parts (club events spec, *API, Command, and Error Contracts*, #376).
  { code: 'club_event_slug_taken', status: 409, messageKey: 'activities.errors.club_event_slug_taken' },
  { code: 'club_event_slug_invalid', status: 422, messageKey: 'activities.errors.club_event_slug_invalid' },
  { code: 'club_event_cancelled', status: 409, messageKey: 'activities.errors.club_event_cancelled' },
  { code: 'club_event_section_fixed', status: 422, messageKey: 'activities.errors.club_event_section_fixed' },
  {
    code: 'club_event_part_outside_section',
    status: 422,
    messageKey: 'activities.errors.club_event_part_outside_section',
  },
  { code: 'club_event_parts_limit', status: 422, messageKey: 'activities.errors.club_event_parts_limit' },
  {
    code: 'club_event_open_part_needs_external_place',
    status: 422,
    messageKey: 'activities.errors.club_event_open_part_needs_external_place',
  },
  { code: 'club_event_part_group_fixed', status: 422, messageKey: 'activities.errors.club_event_part_group_fixed' },
  { code: 'club_event_part_in_use', status: 409, messageKey: 'activities.errors.club_event_part_in_use' },
  { code: 'club_event_part_has_session', status: 422, messageKey: 'activities.errors.club_event_part_has_session' },
  // The guards on the existing activity and session commands for a part (DD-T02, DD-T05, DD-T06).
  { code: 'activity_is_club_event_part', status: 409, messageKey: 'activities.errors.activity_is_club_event_part' },
  {
    code: 'club_event_part_managed_by_event',
    status: 403,
    messageKey: 'activities.errors.club_event_part_managed_by_event',
  },
  { code: 'club_event_part_place_fixed', status: 422, messageKey: 'activities.errors.club_event_part_place_fixed' },
  // The poster and the funder logos of a club event (DD-T10, REQ-T08, #379): checked by the file's bytes.
  { code: 'club_event_file_missing', status: 422, messageKey: 'activities.errors.club_event_file_missing' },
  { code: 'club_event_file_too_large', status: 422, messageKey: 'activities.errors.club_event_file_too_large' },
  {
    code: 'club_event_file_format_unsupported',
    status: 422,
    messageKey: 'activities.errors.club_event_file_format_unsupported',
  },
  { code: 'club_event_funders_limit', status: 422, messageKey: 'activities.errors.club_event_funders_limit' },
  { code: 'club_event_poster_replaced', status: 409, messageKey: 'activities.errors.club_event_poster_replaced' },
  {
    code: 'club_event_funder_name_invalid',
    status: 422,
    messageKey: 'activities.errors.club_event_funder_name_invalid',
  },
  // Event photos spec (#872): the pictures of a club event.
  { code: 'club_event_pictures_limit', status: 422, messageKey: 'activities.errors.club_event_pictures_limit' },
  {
    code: 'club_event_picture_description_invalid',
    status: 422,
    messageKey: 'activities.errors.club_event_picture_description_invalid',
  },
  { code: 'club_event_photo_unmarked', status: 422, messageKey: 'activities.errors.club_event_photo_unmarked' },
  {
    code: 'club_event_graphic_has_no_people',
    status: 422,
    messageKey: 'activities.errors.club_event_graphic_has_no_people',
  },
  {
    code: 'club_event_people_unconfirmed',
    status: 422,
    messageKey: 'activities.errors.club_event_people_unconfirmed',
  },
  { code: 'club_event_picture_erased', status: 409, messageKey: 'activities.errors.club_event_picture_erased' },
] as const satisfies ErrorCodeTable

export type ActivitiesErrorCode = (typeof errorCodes)[number]['code']
