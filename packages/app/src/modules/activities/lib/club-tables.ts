// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632): `club_core export-club`
// exports and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor the
// module registers in `di.ts`. A new table with a `tenant_id` column is added here, or both commands refuse to run.
export const ACTIVITIES_CLUB_TABLES: readonly string[] = [
  'activities_activities',
  'activities_club_events',
  'activities_club_event_parts',
  'activities_club_event_files',
  'activities_club_event_file_people',
  'activities_occurrences',
  'activities_attendances',
  'activities_attendance_policies',
  'activities_contact_access_log',
  'activities_substitution_entries',
  'activities_declaration_tokens',
]
