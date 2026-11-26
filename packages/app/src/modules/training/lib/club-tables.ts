// The tables `training` holds for a club (many clubs spec phase 4, REQ-M06, DD-M09): `club_core export-club` exports
// and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor `di.ts`
// registers. A new table with a `tenant_id` column is added here, or both commands refuse to run.
// The library tables (#685) live in the library tenant only: listed so the catalogue check covers them; a club's rows
// there are removed by the club deletion's part outside the tenant (`registerClubDeleteBeyondTenant` in `di.ts`).
export const TRAINING_CLUB_TABLES: readonly string[] = [
  'training_outlines',
  'training_authors',
  'training_library_entries',
  'training_library_ratings',
  'training_library_uses',
  'training_library_reports',
]
