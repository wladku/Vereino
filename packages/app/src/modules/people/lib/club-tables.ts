// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632): `club_core export-club`
// exports and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor the
// module registers in `di.ts`. A new table with a `tenant_id` column is added here, or both commands refuse to run.
export const PEOPLE_CLUB_TABLES: readonly string[] = [
  'people_persons',
  'people_departure_requests',
  'people_role_assignments',
  'people_guardianships',
  'people_imports',
  'people_import_rows',
  'people_data_export_log',
  'people_consent_events',
  'people_invitation_links',
]
