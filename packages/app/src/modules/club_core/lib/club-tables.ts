// The tables this module holds for a club (many clubs spec phase 4, REQ-M06, DD-M09; #632): `club_core export-club`
// exports and `club_core delete-club` deletes every row of the club's tenant in them, through the contributor the
// module registers in `di.ts`. A new table with a `tenant_id` column is added here, or both commands refuse to run.
export const CLUB_CORE_CLUB_TABLES: readonly string[] = [
  'club_core_club_settings',
  'club_core_sections',
  'club_core_section_materials',
  'club_core_places',
  'club_core_place_files',
  'club_core_institutions',
  'club_core_contracts',
]
