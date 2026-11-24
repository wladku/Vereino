// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632): `club_core export-club`
// exports and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor the
// module registers in `di.ts`. A new table with a `tenant_id` column is added here, or both commands refuse to run.
// `foundation_club_jobs` holds the club's job state of the club job sweep (many clubs spec DD-M04, #629).
export const FOUNDATION_CLUB_TABLES: readonly string[] = [
  'foundation_dispatches',
  'foundation_deliveries',
  'foundation_club_jobs',
]
